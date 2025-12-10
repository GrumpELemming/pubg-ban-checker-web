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
MEMBER_LIMIT = int(os.getenv("CLAN_TASK_MEMBER_LIMIT", "10"))  # max members per /tasks/pull-latest call

if not all([PUBG_API_KEY, PROXY_SHARED_SECRET, CRON_SECRET, DATABASE_URL]):
    sys.exit("Missing one of required envs: PUBG_API_KEY, PROXY_SHARED_SECRET, CRON_SECRET, DATABASE_URL")

HEADERS = {
    "Authorization": f"Bearer {PUBG_API_KEY}",
    "Accept": "application/vnd.api+json",
}


# ---------------------------------------------------------------------------
# DB helpers
# ---------------------------------------------------------------------------
def get_conn():
    return psycopg2.connect(DATABASE_URL)


def fetch_all(query, params=None):
    with get_conn() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(query, params or ())
            return cur.fetchall()


def fetch_one(query, params=None):
    with get_conn() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(query, params or ())
            return cur.fetchone()


def execute(query, params=None):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(query, params or ())
        conn.commit()


# ---------------------------------------------------------------------------
# Schema helpers
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

CREATE INDEX IF NOT EXISTS idx_match_stats_player_time
  ON match_stats (player_id, created_at);
"""


# Auto-create schema
try:
    with get_conn() as schema_conn:
        with schema_conn.cursor() as cur:
            cur.execute(SCHEMA_SQL)
        schema_conn.commit()
    print("Schema created or already exists.")
except Exception as e:
    print("Schema creation failed:", e)


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
    r = requests.get(url, headers=HEADERS, timeout=15)
    if r.status_code != 200:
        return None, None
    data = r.json().get("data", {})
    attrs = data.get("attributes", {})
    matches = data.get("relationships", {}).get("matches", {}).get("data", [])
    return attrs.get("name"), matches


def fetch_match(match_id, platform):
    url = f"https://api.pubg.com/shards/{platform}/matches/{match_id}"
    r = requests.get(url, headers=HEADERS, timeout=15)
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
        if (
            item.get("type") == "participant"
            and item.get("attributes", {}).get("stats", {}).get("playerId") == player_id
        ):
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
# Route: /ping
# ---------------------------------------------------------------------------
@app.route("/ping")
def ping():
    return jsonify({"status": "ok"})


# ---------------------------------------------------------------------------
# Admin routes
# ---------------------------------------------------------------------------
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


# ---------------------------------------------------------------------------
# Task route: pull latest matches
# ---------------------------------------------------------------------------
@app.route("/tasks/pull-latest", methods=["POST"])
def pull_latest():
    members = fetch_all(
        """
        SELECT player_id, platform, last_checked_at
        FROM clan_members
        WHERE active=true
        ORDER BY COALESCE(last_checked_at, added_at) ASC
        LIMIT %s
        """,
        (MEMBER_LIMIT,),
    )

    processed = 0
    members_processed = 0

    for m in members:
        player_id = m["player_id"]
        platform = m["platform"]
        last_checked = m["last_checked_at"] or datetime.now(timezone.utc) - timedelta(days=14)

        current_name, matches = fetch_player_matches(player_id, platform)
        if current_name:
            execute("UPDATE clan_members SET current_name=%s WHERE player_id=%s", (current_name, player_id))
        if not matches:
            execute("UPDATE clan_members SET last_checked_at=%s WHERE player_id=%s", (datetime.now(timezone.utc), player_id))
            members_processed += 1
            continue

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
                processed += 1
            except Exception:
                continue

        execute("UPDATE clan_members SET last_checked_at=%s WHERE player_id=%s", (datetime.now(timezone.utc), player_id))
        members_processed += 1
        time.sleep(0.2)

    return jsonify({"ok": True, "processed": processed, "members_processed": members_processed, "member_limit": MEMBER_LIMIT})


# ---------------------------------------------------------------------------
# Clan week helpers (Wednesday → Wednesday, UTC)
# ---------------------------------------------------------------------------
def clan_week_bounds_from_date(base_dt: datetime):
    """
    Given a datetime (UTC), return the start/end of the PUBG clan week
    that contains it.

    Clan week:
      - Starts Wednesday 00:00:00 UTC
      - Ends the next Wednesday 00:00:00 UTC
    """
    if base_dt.tzinfo is None:
        base_dt = base_dt.replace(tzinfo=timezone.utc)
    else:
        base_dt = base_dt.astimezone(timezone.utc)

    # Python weekday(): Monday=0, Tuesday=1, Wednesday=2, ..., Sunday=6
    weekday = base_dt.weekday()
    WED = 2
    days_since_wed = (weekday - WED) % 7

    # Normalize to midnight UTC of that calendar day, then step back to Wednesday
    start_day = datetime(base_dt.year, base_dt.month, base_dt.day, tzinfo=timezone.utc)
    start = start_day - timedelta(days=days_since_wed)
    end = start + timedelta(days=7)
    return start, end


def clan_week_bounds_with_offset(week_offset_weeks: int = 0):
    """
    week_offset_weeks:
      0 = current clan week
     -1 = previous clan week
     -2 = two weeks ago, etc.
    """
    now = datetime.now(timezone.utc) + timedelta(days=7 * week_offset_weeks)
    return clan_week_bounds_from_date(now)


# ---------------------------------------------------------------------------
# Route: weekly leaderboard (Wednesday weeks)
# ---------------------------------------------------------------------------
@app.route("/clan/weekly-leaderboard")
def weekly_leaderboard():
    # weekOffset takes priority if present:
    #   0 = current clan week (Wed→Wed)
    #  -1 = previous clan week, etc.
    week_param = request.args.get("week")              # optional: YYYY-MM-DD (any date inside the clan week)
    week_offset_str = request.args.get("weekOffset")   # "0", "-1", etc.

    if week_offset_str is not None:
        try:
            week_offset = int(week_offset_str)
        except ValueError:
            abort(400, "Invalid weekOffset. Use 0 for current week, -1 for last week, etc.")

        if week_offset > 0 or week_offset < -52:
            abort(400, "weekOffset out of range. Valid range: 0 … -52")

        start, end = clan_week_bounds_with_offset(week_offset)

    elif week_param:
        # Interpret week=YYYY-MM-DD as a date inside the desired clan week
        try:
            base = datetime.strptime(week_param, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except Exception:
            abort(400, "Invalid week format. Use YYYY-MM-DD (any date in the clan week).")
        start, end = clan_week_bounds_from_date(base)

    else:
        # Default: current clan week
        start, end = clan_week_bounds_with_offset(0)

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
        WHERE ms.created_at >= %s
          AND ms.created_at < %s
        GROUP BY ms.player_id
        """,
        (start, end),
    )

    member_map = {
        m["player_id"]: m
        for m in fetch_all("SELECT player_id, current_name, platform FROM clan_members")
    }

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

    return jsonify(
        {
            "week_start": start.isoformat(),
            "week_end": end.isoformat(),
            "count": len(leaderboard),
            "entries": leaderboard,
        }
    )


# ---------------------------------------------------------------------------
# Main entry
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    with get_conn() as c:
        with c.cursor() as cur:
            cur.execute(SCHEMA_SQL)
        c.commit()
    app.run(host="0.0.0.0", port=8080)
