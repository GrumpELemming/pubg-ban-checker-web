# Ban card backend contract

The frontend calls `GET /api/ban-card-data?platform={platform}&accountId={accountId}` only after a user clicks **Generate Ban Card** on a permanent-ban result. The backend implementation lives outside this repository.

The endpoint must revalidate the permanent ban before returning data, fetch Survival Mastery for the level/tier, and aggregate lifetime stats across `solo`, `solo-fpp`, `duo`, `duo-fpp`, `squad`, and `squad-fpp`. `matches`, `kills`, `wins`, and `losses` are sums; `kd` is total kills divided by total losses (zero when losses is zero—the card displays an em dash).

Successful response:

```json
{
  "player": "PlayerName",
  "accountId": "account.x",
  "banStatus": "permanently_banned",
  "checkedAt": "2026-08-19T17:30:00Z",
  "mastery": { "level": 73, "tier": "Bronze", "tierNumber": 1 },
  "lifetime": { "matches": 41, "kills": 62, "wins": 1, "losses": 40, "kd": 1.55 },
  "clan": "CLAN",
  "ranked": {
    "current": { "label": "Gold 2", "points": 2800, "mode": "squad" },
    "highest": { "label": "Platinum 5", "points": 3100, "mode": "squad" },
    "seasonId": "division.bro.official..."
  }
}
```

Ranked fields describe the current ranked season at the time the card is generated.
They are `null` when PUBG has no available ranked data; the PUBG API does not expose
a historical rank snapshot from the time an account was banned.

Errors use an appropriate HTTP status and a stable code:

```json
{ "error": { "code": "stats_unavailable", "message": "Optional safe detail" } }
```

Supported codes: `not_permanently_banned`, `player_not_found`, `mastery_unavailable`, `stats_unavailable`, `rate_limited`, and `upstream_error`.

PUBG API responses should be cached within the backend's existing cache and rate-limit policy. Never expose the PUBG API key to the browser.
