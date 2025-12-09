# Clan leaderboard setup (backend + frontend)

This is a private clan leaderboard that pulls PUBG stats server-side and exposes a read-only page (`clan.html`). All PUBG calls stay on the backend; the frontend only reads aggregated data.

## What’s included here
- `clan_backend.py`: Flask API with X-Proxy-Secret enforcement (Cloudflare Worker) plus `CRON_SECRET` for tasks/admin. Routes: `/ping`, `/tasks/pull-latest`, `/clan/weekly-leaderboard`, `/admin/add-member`, `/admin/remove-member`.
- `seed_clan_members.sql`: Inserts the 73 Steam account IDs as active clan members (duplicate removed).
- `clan.html` + `css/clan.css` + `js/clan.js`: Private leaderboard page that calls `/api/clan/weekly-leaderboard` through your Cloudflare Worker.

## Backend requirements
- Postgres (use Fly Postgres or your existing DB).
- Env vars: `PUBG_API_KEY`, `PROXY_SHARED_SECRET` (same as Worker), `CRON_SECRET` (second secret for tasks/admin), `DATABASE_URL`.
- Python deps: `flask`, `flask_cors`, `requests`, `psycopg2-binary`, `python-dateutil`.

## Deploy steps (Render or Fly)
1) Add `clan_backend.py` to your backend repo or a new service.
2) Install deps (`pip install ...`) and set env vars above.
3) Create schema: run the `SCHEMA_SQL` block inside `clan_backend.py` (executes automatically if you run the file), then run `seed_clan_members.sql` against your Postgres.
4) Keep the Cloudflare Worker routing `/api/*` to your backend with `X-Proxy-Secret`. No Worker change needed.
5) Cron: call `https://<your-domain>/api/tasks/pull-latest` daily with headers:
   - `X-Proxy-Secret: <your PROXY_SHARED_SECRET>`
   - `X-Cron-Secret: <your CRON_SECRET>`
   Use any scheduler (e.g., cron-job.org or GitHub Actions) to hit that URL.

## Frontend usage (clan.html)
- Access `https://your-site/clan.html` (not linked in nav; share the URL privately).
- By default loads current ISO week; you can enter `YYYY-WW` to view another week.
- Calls `/api/clan/weekly-leaderboard` through the Worker; no secrets in the browser.

## Admin (add/remove members)
- Use curl with both secrets (do **not** embed in frontend):
```
curl -X POST https://your-domain/api/admin/add-member \
  -H "X-Proxy-Secret: <PROXY_SHARED_SECRET>" \
  -H "X-Cron-Secret: <CRON_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"player_id":"account.xxx","platform":"steam","current_name":"IGN(optional)"}'
```
```
curl -X POST https://your-domain/api/admin/remove-member \
  -H "X-Proxy-Secret: <PROXY_SHARED_SECRET>" \
  -H "X-Cron-Secret: <CRON_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"player_id":"account.xxx"}'
```

## Notes
- All members are seeded as Steam; if you add other platforms, set `platform` accordingly.
- Names auto-refresh during `/tasks/pull-latest` when resolving playerId → current IGN.
- Leaderboard aggregates weekly: matches, kills, damage, time played (hours), wins, KDR.
- Keep `clan.html` unlinked if you want it semi-private; the backend still requires the Worker secret. Remove the nav links there if you prefer isolation.
