# PlusOne Analytics — Web (Phase 1–2 build)

## What this is
A client-only PWA that reads a PlusOne `.sqlite` export directly in the browser
(sql.js/WASM + OPFS persistence — no server, no upload) and renders it as a
sports analytics dashboard, following spec Section 4's required page list.

**Built and verified against a real backup (every query run through a
Node/sql.js harness before shipping, not just written and hoped for):**

- `assets/js/db/storageAdapter.js` — sql.js bootstrap, OPFS load/save, file
  import, schema introspection (`PRAGMA table_info`), write-rejection guard.
- `assets/js/db/repositories/` — `matchRepository`, `teamRepository`,
  `predictionRepository`, all extending a shared `baseRepository`. Real-data
  bugs caught this way before shipping:
  - `prediction_log.confidence`/`.engine_agreement` are text tiers
    (`'Low'/'Medium'/'High'`, `'full'/'partial'`), not 0–1 floats.
  - `matches.id` is a text key, not an integer.
  - `prediction_log.match_id` reliably joins to `matches.id` (2,499/2,499 rows)
    — used instead of a fragile team-name + date match.
  - `team_stats` is one row per team *per season* — the Team Explorer
    directory defaults to the latest season so teams don't appear 4x;
    `season=all` opts into full history.
- **Pages (Section 4 items 1–3):**
  - **Home / Today's Predictions** — fixtures for today, falling forward to
    the next date with fixtures if today has none.
  - **Match Explorer** — `/matches` list with league/season filters + pagination,
    `/matches/{id}` detail with engine breakdown (DC/ML/Legacy/consensus),
    Expected Goals + top-3 scoreline predictions, Double Chance (derived from
    stored consensus probabilities, clearly labeled as derived), H2H, a
    home/away Team Comparison panel, bookmaker odds, weather, injuries — each
    panel only renders if that table/column exists in the loaded file.
  - **Team Explorer** — `/teams` directory (league/season filter, defaults to
    latest season) and, per team, all 8 spec sub-routes: `/teams/{name}`
    (overview: snapshot, recent form strip, upcoming fixtures),
    `/teams/{name}/fixtures`, `/teams/{name}/results` (filterable by season/
    result), `/teams/{name}/statistics` (every team_stats column present),
    `/teams/{name}/players` (squad), `/teams/{name}/predictions`,
    `/teams/{name}/odds`, `/teams/{name}/history` (season-by-season).
  - **Player Explorer** — `/players` directory (search + league/position/season
    filters, paginated) and `/players/{name}` with `/statistics`, `/matches`,
    `/seasons`, `/teams` sub-routes. Players have no stable cross-season ID in
    this schema, so profiles are name-keyed like teams. Mid-season transfers
    are real in this data (e.g. a player can have two rows in the same season
    for two different clubs) and are shown exactly as recorded, never merged
    or inferred — verified against an actual transfer case in the data.
    `/players/{name}/matches` honestly reports that match-by-match appearances
    aren't available (the `players` table is season totals only, and
    `team_lineups`, which could supply this, is empty in every export seen so
    far) rather than approximating one from season stats.
  - Team badges now show real crests from the `team_logos` table when present
    (falls back to the monogram if a team has no logo row, or if the hotlinked
    image fails to load).
  - **League & Competition Explorer** — `/leagues` directory and, per
    competition, all 9 spec sub-routes: overview, `/standings` (from
    `team_stats`, ordered by points then goal difference — not re-derived from
    raw results), `/fixtures`, `/results`, `/teams`, `/players`, `/statistics`
    (goals/match, home/away/draw split via SQL aggregation over `matches`;
    cards/corners only when `historical_results` actually has rows for that
    league, which it doesn't in any backup seen so far), `/predictions`
    (volume/distribution by pick and confidence tier — never a computed
    accuracy figure beyond what `consensus_correct` etc. already store),
    `/odds`, `/seasons`. Two notes: **country** is omitted everywhere — it
    isn't present anywhere in this schema, and inventing a name→country lookup
    table would risk confidently showing wrong information for exactly the
    leagues most likely to be viewed (Premier League, Serie A, La Liga, etc.
    don't contain their country in the name). **Competition type** (Domestic
    League/Cup/International/Youth/Women's) is a lightweight regex read of the
    league's own name text, not a per-league lookup table — labeled as a
    best-effort inference, not authoritative.
- **Shell:** `index.html`, `manifest.json`, `service-worker.js` (network-first
  with offline cache fallback — an earlier cache-first version could get stuck
  serving a stale build forever; fixed), dark "data desk" visual direction in
  `DESIGN.md`.

## What isn't built yet
Everything requiring a **server** — auth, the write-side admin panel
(Section 5/12), scraper triggers, push notifications — is out of scope for a
client-only SQLite reader by construction and needs the Node/Express service
in spec Section 13.

On the client side, per spec Section 4's remaining items: **Prediction & Odds
Explorer** (6), **Value/Safe Bets** (7, though `predictionRepository.valueBets()`
is already written and query-tested), **Model Performance & Calibration** (8,
`engineAccuracy()`/`engineWeightHistory()` already written), **Injuries** as
its own page (9, currently only shown per-match), **How Predictions Work**
(10), **Terms of Service** (11), **Privacy Policy** (12). Also not yet built:
the Poisson-derived secondary markets (Over/Under, BTTS%) and heuristic Risk
Flags seen in the reference extension — legitimate to add, but a distinct
feature from anything above.

**A schema landmine worth knowing about:** `match_odds.season` has been
observed in a compact format (`'2526'`) while `matches.season`/
`team_stats.season` use `'2025-2026'` for the same season — comparing them
directly would silently return zero rows. `leagueRepository.oddsPage()`
deliberately doesn't filter by season to avoid this; documented inline for
whoever adds that filter later.

## Running it
Service workers and OPFS both require a real origin, not `file://`:
```bash
cd plusone-web
python3 -m http.server 8080
# open http://localhost:8080
```
Then drag your `.sqlite` export onto the page, or use the "Import DB" button.
It's saved to OPFS afterward, so subsequent loads restore automatically.

## File map
```
plusone-web/
  index.html
  manifest.json
  service-worker.js
  DESIGN.md
  database/              sql.js WASM runtime (vendored, not CDN)
  assets/css/             tokens.css, styles.css
  assets/js/
    app.js               boot sequence, DB import wiring, router registration
    router/router.js      tiny hash router
    db/storageAdapter.js  the only module allowed to touch sql.js
    db/repositories/       matchRepository, teamRepository, playerRepository,
                            leagueRepository, predictionRepository, baseRepository
    components/            badges.js (real crests via team_logos + fallback art), format.js
    pages/                  home.js, matchExplorer.js, matchDetail.js,
                            teamExplorer.js, teamDetail.js,
                            playerExplorer.js, playerDetail.js,
                            leagueExplorer.js, leagueDetail.js
```

## Data model changes
See `PlusOne-Analytics-PWA-Build-Prompt.md` Section 2 — it lists the full,
introspected column set per table (not an abbreviated "key columns" list)
plus a callout of exactly what was missing from the earlier draft.
