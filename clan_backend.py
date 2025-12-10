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
CLAN_TASK_MEMBER_LIMIT = int(os.getenv("CLAN_TASK_MEMBER_LIMIT", "1"))

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

    participant = None    # find this player's participant record
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
    """
    Walk active clan members and fetch recent matches.

    We respect CLAN_TASK_MEMBER_LIMIT so that cron/GitHub Actions runs don't
    take forever. Members are processed in order of least-recently-checked.
    """
    members = fetch_all(
        """
        SELECT player_id, platform, last_checked_at
        FROM clan_members
        WHERE active=true
        ORDER BY last_checked_at NULLS FIRST, added_at ASC
        """
    )

    processed_members = 0
    processed_matches = 0
    now = datetime.now(timezone.utc)

    for m in members:
        if processed_members >= CLAN_TASK_MEMBER_LIMIT:
            break

        player_id = m["player_id"]
        platform = m["platform"]
        last_checked = m["last_checked_at"] or (now - timedelta(days=14))

        current_name, matches = fetch_player_matches(player_id, platform)
        if current_name:
            execute(
                "UPDATE clan_members SET current_name=%s WHERE player_id=%s",
                (current_name, player_id),
            )
        if not matches:
            execute(
                "UPDATE clan_members SET last_checked_at=%s WHERE player_id=%s",
                (now, player_id),
            )
            processed_members += 1
            continue

        # Process matches newer than last_checked
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
                    INSERT INTO match_stats (
                      player_id, match_id, created_at,
                      queue, kills, damage, time_survived, win_place, win
                    )
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
                processed_matches += 1
            except Exception:
                conn.rollback()
                continue

        execute(
            "UPDATE clan_members SET last_checked_at=%s WHERE player_id=%s",
            (now, player_id),
        )
        processed_members += 1

        # small delay to be gentle
        time.sleep(0.2)

    return jsonify(
        {
            "ok": True,
            "processed": processed_matches,
            "members_processed": processed_members,
            "member_limit": CLAN_TASK_MEMBER_LIMIT,
        }
    )


# ---------------------------------------------------------------------------
# Week helpers (Wed → Wed)
# ---------------------------------------------------------------------------
def clan_week_bounds_for_date(d):
    """
    Given a date, return the start/end datetimes (UTC) for the clan week:

    - Weeks run Wednesday 00:00 → next Wednesday 00:00 (UTC).
    - d can be any date inside that week.
    """
    if isinstance(d, datetime):
        d = d.date()
    # Python weekday: Monday=0 ... Sunday=6, we want Wednesday=2
    wd = d.weekday()
    days_since_wed = (wd - 2) % 7
    start_date = d - timedelta(days=days_since_wed)
    start = datetime(start_date.year, start_date.month, start_date.day, tzinfo=timezone.utc)
    end = start + timedelta(days=7)
    return start, end


def clan_week_bounds(now=None, week_param=None):
    """
    Compute clan week bounds based on:
    - week_param None      -> use current date
    - week_param YYYY-MM-DD -> parse that date
    - week_param YYYY-WW or YYYY-WWW (with 'W') -> still supported, but
      we just take the Monday of that ISO week and then find the Wednesday
      in that week and use Wed→Wed.
    """
    if now is None:
        now = datetime.now(timezone.utc)

    if not week_param:
        return clan_week_bounds_for_date(now.date())

    week_param = week_param.strip()

    # YYYY-MM-DD (preferred)
    if "-" in week_param and "W" not in week_param.upper():
        try:
            d = datetime.strptime(week_param, "%Y-%m-%d").date()
            return clan_week_bounds_for_date(d)
        except Exception:
            raise ValueError("Invalid date format; use YYYY-MM-DD")

    # Legacy ISO week: YYYY-WW or YYYY-WWW
    try:
        if "W" not in week_param.upper():
            raise ValueError
        # normalise "YYYY-WW" or "YYYY-WWW"
        iso_str = week_param.upper()
        # We want Monday of that ISO week, then convert to clan week
        monday = datetime.strptime(iso_str + "-1", "%G-W%V-%u").date()
        return clan_week_bounds_for_date(monday)
    except Exception:
        raise ValueError("Invalid week format; use YYYY-MM-DD or YYYY-WW")


# ---------------------------------------------------------------------------
# Weekly leaderboard
# ---------------------------------------------------------------------------
@app.route("/clan/weekly-leaderboard")
def weekly_leaderboard():
    week_param = request.args.get("week")  # "" or None or "YYYY-MM-DD" or "YYYY-WW"
    now = datetime.now(timezone.utc)

    try:
        start, end = clan_week_bounds(now=now, week_param=week_param)
    except ValueError as e:
        abort(400, str(e))

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
        WHERE ms.created_at >= %s AND ms.created_at < %s
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
        matches = int(r["matches_played"])
        kills = int(r["kills"])
        damage = float(r["damage"])
        time_s = float(r["time_s"])
        wins = int(r["wins"])
        deaths = max(0, matches - wins)
        kdr = kills / max(1, deaths)
        hours = time_s / 3600.0

        kills_per_match = kills / max(1, matches)
        win_rate = (wins / max(1, matches)) * 100.0

        entry = {
            "player_id": r["player_id"],
            "name": member_map.get(r["player_id"], {}).get("current_name"),
            "platform": member_map.get(r["player_id"], {}).get("platform", "steam"),
            "matches": matches,
            "kills": kills,
            "damage": round(damage, 2),
            "time_played_hours": round(hours, 2),
            "wins": wins,
            "kdr": round(kdr, 2),
            "kills_per_match": round(kills_per_match, 2),
            "win_rate": round(win_rate, 1),
        }
        leaderboard.append(entry)

    # Default sort: matches desc, then kills desc
    leaderboard.sort(key=lambda e: (e["matches"], e["kills"]), reverse=True)

    return jsonify(
        {
            "week_start": start.isoformat(),
            "week_end": end.isoformat(),
            "count": len(leaderboard),
            "entries": leaderboard,
        }
    )


if __name__ == "__main__":
    # Optional: initialize schema
    execute(SCHEMA_SQL)
    print("Schema created or already exists.")
    app.run(host="0.0.0.0", port=8080)
