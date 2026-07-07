# DESIGN.md — PlusOne Analytics Web

## Direction: near-black + gold, informed by real reference apps
This system replaced an earlier "navy + amber" direction that looked reasonable
on paper but had a real bug: the display font was declared in tokens.css and
never actually linked from anywhere, so every headline/score silently fell
back to a generic system serif the whole time.

The current direction was built after reviewing 12 screenshots of three real
sports apps (a dense orange live-scores app, a prediction app using
probability rings, and a minimal black/green scores app) plus a verified
external "Predictive Analytics" / "Comparative Analysis Dashboard" reference
spec. Rather than clone any one of them, specific patterns were adopted where
they mapped to something PlusOne actually has:

- **Probability rings** (from the prediction app) — the signature element,
  used for the consensus Home/Draw/Away call, since predictions are the
  product. Pure CSS `conic-gradient`, no SVG/canvas.
- **Icon + label detail rows** (from the minimal app) — for match info, kept
  restrained rather than dense.
- **Delta-colored comparative bars** (validated against the external
  "Comparative Analysis Dashboard" spec) — the winning side's number is
  green, the losing side's grey, and the bar fill is proportional to the
  actual ratio of the two values, computed live, not eyeballed.
- **Card-row match lists** (from the orange app) — crest + name left, time/
  score right, rounded card, instead of a plain HTML table row.

Deliberately not adopted: the orange accent (used by one reference app) and
green accent (used by the other) — near-black + gold reads as its own thing
rather than a clone of either.

## Color
| Token | Hex | Use | Verified contrast |
|---|---|---|---|
| `--ink-950` | `#0B0C10` | App background | — |
| `--ink-900` | `#15171C` | Card/panel surface | — |
| `--ink-800` | `#1C1E24` | Raised surface, table header | — |
| `--line-700` | `#262932` | Borders, dividers | — |
| `--paper-100` | `#F5F5F2` | Primary text | 17.9:1 on ink-950 |
| `--paper-400` | `#9A9CA6` | Secondary text | 7.15:1 on ink-950 |
| `--signal-gold` | `#F0A93E` | Primary accent — confidence, headline pick, CTAs | 9.73:1 on ink-950 |
| `--pitch-teal` | `#2FA6A0` | Secondary accent — agreement, export actions | — |
| `--positive` | `#22C55E` | Winning value in comparisons, correct grading | 7.87:1 on ink-900 |
| `--negative` | `#EF4444` | Losing/incorrect | 4.76:1 on ink-900 |

Contrast ratios computed via the WCAG relative-luminance formula, not eyeballed
— all pairs clear the 4.5:1 AA threshold for normal text.

## Type
Both fonts are **self-hosted** (vendored via npm `@fontsource`, not a CDN
link) under `assets/fonts/` — 7 woff2 files, ~150KB total — so they actually
load offline in the installed PWA, and so they exist at all.

- **Display (`--font-display`):** Archivo, weights 500/700/900. Used for
  headlines, scores, ring percentages, stat values. Weight 900 reads close to
  a "black"/condensed treatment without needing a separate font file.
- **Body (`--font-body`):** Inter, weights 400/500/600/700.
- Numerals are never mixed with the fallback stack silently — `font-display:
  swap` is set, and Archivo/Inter are the only families referenced anywhere
  in the CSS.

## Layout
- 8px spacing scale (4/8/12/16/24/32/48).
- Corners: 8px small, 14px medium (cards/panels), 18px large (hero cards).
- Match detail uses **nested tabs** (Prediction / Comparison / H2H / Odds &
  Conditions) instead of one long scrolling page — matches the pattern in
  every reference app's match-detail screen, and is consistent with how
  Team/Player/League Explorer already use tabs.
- Tables scroll horizontally on narrow screens (`.table-scroll`) rather than
  wrapping cell content into a multi-line mess.

## Components
- **Probability ring:** `.ring` — CSS-only conic-gradient donut. Highest value
  gets gold, others neutral grey — never color communicated without the
  number also shown (WCAG 1.4.1, verified against the external UX guideline
  reference: "don't use color alone for status").
- **Comparative bar:** `.compare-row` — two-segment proportional bar computed
  from the actual two values (not a fixed midpoint), winning side's number
  colored green, losing side grey.
- **Badge (`badges.js`):** real team crests via the `team_logos` table when
  present, monogram-on-hue fallback otherwise, with an inline `onerror` swap
  if a hotlinked crest URL 404s.
- **Bottom nav (mobile only):** icon + label, `aria`-friendly since every icon
  has a visible text label, not icon-only.
- `prefers-reduced-motion` is respected globally (tokens.css) — animations and
  transitions collapse to near-zero duration for anyone who's set that
  preference at the OS level.

## What's still using plain bars, not rings
Per-engine (DC/ML/Legacy) probabilities stay as compact horizontal bars, not
rings — four engines × three outcomes would be twelve rings competing for
attention. Rings are reserved for the single headline consensus call, which
is the one number most people actually look at first.
