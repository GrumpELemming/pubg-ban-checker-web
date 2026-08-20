# Ban card backend contract

The frontend calls `GET /api/ban-card-data?platform={platform}&accountId={accountId}` only after a user clicks **Generate Ban Card** on a permanent-ban result. The backend implementation lives outside this repository.

The endpoint must revalidate the permanent ban before returning data, fetch Survival Mastery for the level/tier, and aggregate lifetime stats across `solo`, `solo-fpp`, `duo`, `duo-fpp`, `squad`, and `squad-fpp`. `matches`, `kills`, `wins`, `losses`, and `timeSurvived` are sums; `timeSurvived` is returned in seconds as supplied by PUBG. `kd` is total kills divided by total losses (zero when losses is zero—the card displays an em dash). The frontend divides `timeSurvived` by 3,600 and displays it as hours with one decimal place.

It must also find the player's most recent available ranked result. Fetch the season list, order ranked seasons from newest to oldest, and query `/players/{accountId}/seasons/{seasonId}/ranked` until a season containing ranked data is found. From that season, select the highest `bestRankPoint`/best tier across the available ranked game modes. Stop searching after the first season with ranked data: “highest rank” means the player's highest rank in their most recent ranked season, not their all-time highest rank. Cache the season list and ranked responses under the backend's existing cache policy to limit PUBG API usage.

Successful response:

```json
{
  "player": "PlayerName",
  "accountId": "account.x",
  "banStatus": "permanently_banned",
  "checkedAt": "2026-08-19T17:30:00Z",
  "mastery": { "level": 73, "tier": "Bronze", "tierNumber": 1 },
  "lifetime": { "matches": 41, "kills": 62, "wins": 1, "losses": 40, "kd": 1.55, "timeSurvived": 183420 },
  "clan": "CLAN",
  "ranked": {
    "highest": { "label": "Platinum 5", "points": 3100, "mode": "squad" },
    "seasonId": "division.bro.official...",
    "isCurrentSeason": false
  }
}
```

`ranked` describes the most recent season in which PUBG returns ranked data for the
player. It is `null` when no ranked data is found in any searchable ranked season.
The card omits the rank row when `ranked.highest.label` is unavailable. This is the
last rank retrievable from the public API, not necessarily a snapshot of the exact
rank held at the time the account was banned.

Errors use an appropriate HTTP status and a stable code:

```json
{ "error": { "code": "stats_unavailable", "message": "Optional safe detail" } }
```

Supported codes: `not_permanently_banned`, `player_not_found`, `mastery_unavailable`, `stats_unavailable`, `rate_limited`, and `upstream_error`.

PUBG API responses should be cached within the backend's existing cache and rate-limit policy. Never expose the PUBG API key to the browser.
