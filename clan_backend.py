"""
Minimal Flask backend for clan weekly leaderboards.

- Protects all routes behind X-Proxy-Secret (same as your Worker -> backend).
- Protects admin/task routes with an additional CRON_SECRET header.
- Stores clan members (by accountId) and match stats in Postgres.
- Pulls new matches once per task run and aggregates weekly leaderboards.

Dependencies (pip):
  flask flask_cors requests psycopg2-binary python-dateutil
"""

import os
import sys
import time
from datetime import datetime, timedelta, timezone

import requests
import psycopg2
from psycopg2.extras import RealDictCursor
from dateutil import parser as date_parser
from flask import Flask, abort, jsonify, request
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

PUBG_API_KEY = os.getenv("PUBG_API_KEY")
PROXY_SHARED_SECRET = os.getenv("PROXY_SHARED_SECRET")
CRON_SECRET = os.getenv("CRON_SECRET")
DATABASE_URL = os.getenv("DATABASE_URL")

if not all([PUBG_API_KEY, PROXY_SHARED_SECRET, CRON_SECRET, DATABASE_URL]):
    sys.exit("Missing one of required envs: PUBG_API_KEY, PROXY_SHARED_SECRET, CRON_SECRET, DATABASE_URL")

HEADERS = {
    "Authorization": f"Bearer {PUBG_API_KEY}",
    "Accept": "application/vnd.api+json",
}

conn = psycopg2.connect(DATABASE_URL)


# ---------------------------------------------------------------------------
# Guards
# ---------------------------------------------------------------------------
@app.before_request
def enforce_proxy_secret():
    if request.path == "/ping":
        return
    if request.headers.get("X-Proxy-Secret") != PROXY_SHARED_SECRET:
        abort(401)
    if request.path.startswith("/tasks") or request.path.startswith("/admin"):
        if request.headers.get("X-Cron-Secret") != CRON_SECRET:
            abort(401)


# ---------------------------------------------------------------------------
# DB helpers
# ---------------------------------------------------------------------------
def fetch_all(query, params=None):
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(query, params or ())
        return cur.fetchall()


def fetch_one(query, params=None):
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(query, params or ())
        return cur.fetchone()


def execute(query, params=None):
    with conn.cursor() as cur:
        cur.execute(query, params or ())
    conn.commit()


# ---------------------------------------------------------------------------
# Schema helpers (run once manually or via migration)
# ---------------------------------------------------------------------------
SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS clan_members (
  id serial PRIMARY KEY,
  player_id text UNIQUE NOT NULL,
  current_name text,
  platform text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  added_at timestamptz NOT NULL DEFAULT now(),
  last_checked_at timestamptz
);

CREATE TABLE IF NOT EXISTS match_stats (
  id serial PRIMARY KEY,
  player_id text NOT NULL,
  match_id text NOT NULL,
  created_at timestamptz NOT NULL,
  queue text,
  kills int,
  damage numeric,
  time_survived numeric,
  win_place int,
  win boolean,
  UNIQUE (player_id, match_id)
);
CREATE INDEX IF NOT EXISTS idx_match_stats_player_time ON match_stats (player_id, created_at);
"""


# ---------------------------------------------------------------------------
# PUBG helpers
# ---------------------------------------------------------------------------
def resolve_player_name(player_id, platform):
    url = f"https://api.pubg.com/shards/{platform}/players/{player_id}"
    r = requests.get(url, headers=HEADERS, timeout=10)
    if r.status_code != 200:
        return None
    data = r.json().get("data", {})
    return data.get("attributes", {}).get("name")


def fetch_player_matches(player_id, platform):
    url = f"https://api.pubg.com/shards/{platform}/players/{player_id}"
    r = requests.get(url, headers=HEADERS, timeout=10)
    if r.status_code != 200:
        return None, None
    data = r.json().get("data", {})
    attrs = data.get("attributes", {})
    matches = data.get("relationships", {}).get("matches", {}).get("data", [])
    return attrs.get("name"), matches


def fetch_match(match_id, platform):
    url = f"https://api.pubg.com/shards/{platform}/matches/{match_id}"
    r = requests.get(url, headers=HEADERS, timeout=10)
    if r.status_code != 200:
        return None
    return r.json()


def extract_player_stats(match_json, player_id):
    try:
        created_at = match_json["data"]["attributes"]["createdAt"]
        created_dt = date_parser.isoparse(created_at)
    except Exception:
        created_dt = datetime.now(timezone.utc)
    queue = match_json["data"]["attributes"].get("gameMode")

    participant = None
    for item in match_json.get("included", []):
        if item.get("type") == "participant" and item.get("attributes", {}).get("stats", {}).get("playerId") == player_id:
            participant = item
            break
    if not participant:
        return None

    stats = participant.get("attributes", {}).get("stats", {}) or {}
    kills = stats.get("kills") or 0
    damage = stats.get("damageDealt") or 0
    time_survived = stats.get("timeSurvived") or 0
    win_place = stats.get("winPlace") or 0
    win = win_place == 1

    return {
        "created_at": created_dt,
        "queue": queue,
        "kills": int(kills),
        "damage": float(damage),
        "time_survived": float(time_survived),
        "win_place": int(win_place),
        "win": win,
    }


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@app.route("/ping")
def ping():
    return jsonify({"status": "ok"})


@app.route("/admin/add-member", methods=["POST"])
def add_member():
    body = request.get_json(force=True)
    player_id = body.get("player_id")
    platform = body.get("platform", "steam")
    if not player_id:
        abort(400, "player_id required")
    name = body.get("current_name") or resolve_player_name(player_id, platform)
    execute(
        """
        INSERT INTO clan_members (player_id, current_name, platform, active)
        VALUES (%s, %s, %s, true)
        ON CONFLICT (player_id) DO UPDATE SET
          current_name = EXCLUDED.current_name,
          platform = EXCLUDED.platform,
          active = true
        """,
        (player_id, name, platform),
    )
    return jsonify({"ok": True, "player_id": player_id, "name": name, "platform": platform})


@app.route("/admin/remove-member", methods=["POST"])
def remove_member():
    body = request.get_json(force=True)
    player_id = body.get("player_id")
    if not player_id:
        abort(400, "player_id required")
    execute("UPDATE clan_members SET active=false WHERE player_id=%s", (player_id,))
    return jsonify({"ok": True, "player_id": player_id})


@app.route("/tasks/pull-latest", methods=["POST"])
def pull_latest():
    members = fetch_all("SELECT player_id, platform, last_checked_at FROM clan_members WHERE active=true")
    processed = 0
    for m in members:
        player_id = m["player_id"]
        platform = m["platform"]
        last_checked = m["last_checked_at"] or datetime.now(timezone.utc) - timedelta(days=14)

        current_name, matches = fetch_player_matches(player_id, platform)
        if current_name:
            execute("UPDATE clan_members SET current_name=%s WHERE player_id=%s", (current_name, player_id))
        if not matches:
            continue

        # process matches newer than last_checked
        for match_ref in matches:
            match_id = match_ref.get("id")
            if not match_id:
                continue
            match_json = fetch_match(match_id, platform)
            if not match_json:
                continue
            stats = extract_player_stats(match_json, player_id)
            if not stats:
                continue
            if stats["created_at"] <= last_checked:
                continue
            try:
                execute(
                    """
                    INSERT INTO match_stats (player_id, match_id, created_at, queue, kills, damage, time_survived, win_place, win)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
                    ON CONFLICT DO NOTHING
                    """,
                    (
                        player_id,
                        match_id,
                        stats["created_at"],
                        stats["queue"],
                        stats["kills"],
                        stats["damage"],
                        stats["time_survived"],
                        stats["win_place"],
                        stats["win"],
                    ),
                )
            except Exception:
                conn.rollback()
                continue
            processed += 1
        # update checkpoint
        execute("UPDATE clan_members SET last_checked_at=%s WHERE player_id=%s", (datetime.now(timezone.utc), player_id))

        # small delay to be gentle
        time.sleep(0.2)

    return jsonify({"ok": True, "processed": processed})


def iso_week_bounds(iso_year, iso_week):
    # ISO weeks start Monday; compute start-of-week in UTC
    first = datetime.strptime(f"{iso_year}-W{iso_week}-1", "%G-W%V-%u").replace(tzinfo=timezone.utc)
    return first, first + timedelta(days=7)


@app.route("/clan/weekly-leaderboard")
def weekly_leaderboard():
    week_param = request.args.get("week")  # YYYY-WW
    now = datetime.now(timezone.utc)
    if week_param:
        try:
            iso_year, iso_week = week_param.split("-W")
            start, end = iso_week_bounds(int(iso_year), int(iso_week))
        except Exception:
            abort(400, "Invalid week format. Use YYYY-WW.")
    else:
        iso_year, iso_week, _ = now.isocalendar()
        start, end = iso_week_bounds(iso_year, iso_week)

    rows = fetch_all(
        """
        SELECT
          ms.player_id,
          COUNT(*) AS matches_played,
          COALESCE(SUM(ms.kills),0) AS kills,
          COALESCE(SUM(ms.damage),0) AS damage,
          COALESCE(SUM(ms.time_survived),0) AS time_s,
          COALESCE(SUM(CASE WHEN ms.win THEN 1 ELSE 0 END),0) AS wins
        FROM match_stats ms
        WHERE ms.created_at BETWEEN %s AND %s
        GROUP BY ms.player_id
        """,
        (start, end),
    )

    member_map = {m["player_id"]: m for m in fetch_all("SELECT player_id, current_name, platform FROM clan_members")}

    leaderboard = []
    for r in rows:
        deaths = max(0, r["matches_played"] - r["wins"])
        kdr = r["kills"] / max(1, deaths)
        entry = {
          "player_id": r["player_id"],
          "name": member_map.get(r["player_id"], {}).get("current_name"),
          "platform": member_map.get(r["player_id"], {}).get("platform", "steam"),
          "matches": r["matches_played"],
          "kills": int(r["kills"]),
          "damage": float(r["damage"]),
          "time_played_hours": round(r["time_s"] / 3600, 2),
          "wins": int(r["wins"]),
          "kdr": round(kdr, 2),
        }
        leaderboard.append(entry)

    leaderboard.sort(key=lambda e: (e["matches"], e["kills"]), reverse=True)

    return jsonify({
      "week_start": start.isoformat(),
      "week_end": end.isoformat(),
      "count": len(leaderboard),
      "entries": leaderboard
    })


if __name__ == "__main__":
    # Optional: initialize schema
    execute(SCHEMA_SQL)
    app.run(host="0.0.0.0", port=8080)
