# PlusOne Analytics — Web (Phase 1 build)

## What this is
A client-only PWA that reads a PlusOne `.sqlite` export directly in the browser
(sql.js/WASM + OPFS persistence — no server, no upload) and renders it as a
sports analytics dashboard. This phase implements the **data foundation and
three core pages** end-to-end against the real schema; it's the pattern the
remaining pages in the spec repeat.

**Built and verified against `plusone_backup.sqlite`:**
- `assets/js/db/storageAdapter.js` — sql.js bootstrap, OPFS load/save, file
  import, schema introspection (`PRAGMA table_info`), write-rejection guard.
- `assets/js/db/repositories/` — `matchRepository`, `teamRepository`,
  `predictionRepository`, all extending a shared `baseRepository`. Every query
  in these files was run against the real backup via a Node/sql.js harness
  during development, which is how the bugs below were caught before they
  shipped:
  - **`prediction_log.confidence` and `.engine_agreement` are text tiers**
    (`'Low'/'Medium'/'High'`, `'full'/'partial'`) in the real data, not the 0–1
    floats the original spec draft implied. Rendering and the value-bet filter
    were written against text tiers, not `formatPct()`.
  - **`matches.id` is a text key** (e.g.
    `Premier_League_2025-2026_Liverpool_Bournemouth_2025-08-15`), not an
    integer — the match-detail route stopped coercing it with `Number()`.
  - **`prediction_log.match_id` reliably joins to `matches.id`** (confirmed
    2,499/2,499 rows), so the fixtures list and match detail use that join
    instead of a fragile team-name + date match.
  - **`team_stats` is one row per team *per season*** (184 rows ≈ 46 teams × 4
    seasons) — the Team Explorer directory defaults to the latest season so
    teams don't appear four times; `season=all` opts into full history.
- **Pages:** Home / Today's Predictions (Section 4 item 1, with fallback to
  the next date that actually has fixtures), Match Explorer list + filters,
  Match detail (engine breakdown, H2H, odds, weather, injuries — each panel
  only renders if that table/column exists in the loaded file).
- **Shell:** `index.html`, `manifest.json`, `service-worker.js` (offline app
  shell caching), install-to-homescreen ready, dark "data desk" visual
  direction in `DESIGN.md`.

## What isn't built yet
Everything in the spec that requires a **server** — auth, the write-side
admin panel (Section 12), scraper triggers, `scraper_health` alerting, push
notifications — is out of scope for a client-only SQLite reader by
construction (Section 13.5's read-only guarantee) and needs the Node/Express
service described in spec Section 13. On the client side, **Player Explorer,
League Standings, Model Performance/Calibration, and the Value Bets feed**
follow the exact same repository → page pattern established here
(`predictionRepository.engineAccuracy()` and `.valueBets()` are already
written and query-tested — they just don't have a page wired up yet) and are
the natural next slice to build.

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
    db/repositories/       matchRepository, teamRepository, predictionRepository, baseRepository
    components/            badges.js (team/league/player fallback art), format.js
    pages/                  home.js, matchExplorer.js, matchDetail.js
```

## Data model changes
See the updated `PlusOne-Analytics-PWA-Build-Prompt.md` Section 2 — it now
lists the full, introspected column set per table (not an abbreviated "key
columns" list) plus a callout of exactly what was missing from the earlier
draft.
