# DESIGN.md — PlusOne Analytics Web

## Direction: "the data desk, not the stadium"
Most sports-analytics UIs reach for pitch-green and floodlight clichés. PlusOne's
actual subject is the *broadcast graphics desk* behind a match — the wall of
scoreboards, odds tickers, and probability bars a producer watches, not the
grass itself. That's the visual world this app borrows from: dense, legible,
slightly instrumented, calm under a lot of numbers.

## Color
| Token | Hex | Use |
|---|---|---|
| `--ink-950` | `#0B1220` | App background |
| `--ink-900` | `#121B2E` | Card/panel surface |
| `--ink-800` | `#1B2740` | Raised surface, table header |
| `--line-700` | `#2A3752` | Borders, dividers |
| `--paper-100` | `#F1F3F0` | Primary text |
| `--paper-400` | `#9AA6BC` | Secondary text |
| `--signal-amber` | `#E8A33D` | Primary accent — confidence, headline pick, CTAs |
| `--pitch-teal` | `#2FA6A0` | Secondary accent — agreement, positive grading |
| `--alert-red` | `#D9534F` | Errors, incorrect grading |

Deliberately not the cream/terracotta or near-black/acid-green defaults — ink
navy reads as "control room," not "landing page."

## Type
- **Display / scoreboard numbers:** `"Zilla Slab", serif` — a slab serif so
  scorelines and percentages read like scoreboard digits, used only for
  numerals and headline outcomes, set with tabular figures.
- **Body / UI:** `"Inter", system-ui, sans-serif` — neutral, dense-data-safe,
  used for everything else so the slab face stays a signature rather than
  wallpaper.
- **Scale:** 12 / 14 / 16 / 20 / 28 / 40px, 1.4 line-height for body, 1.1 for
  display sizes.

## Layout
- Card grid for scannable entities (fixtures, teams), dense tables for
  Explorer list views, a fixed two-column scoreboard layout for match detail.
- 8px spacing scale (4/8/12/16/24/32/48).
- No border-radius above 8px — this is an instrument panel, not a marketing
  page; corners stay quiet so probability bars and badges read as data, not
  decoration.

## Signature element: the halfway line
Every major section break renders as a thin horizontal rule with a single
center dot — a minimal halfway-line-and-kickoff-spot motif — instead of a
generic `<hr>` or card shadow. It appears exactly once per section boundary,
never decoratively repeated, so it stays a signature rather than a texture.

## Components
- **Badge (`badges.js`):** monogram-on-hue fallback for team/league marks,
  silhouette fallback for players — real crests slot in later via the Media
  Library (Section 12.5) without changing any calling code.
- **Prob bar:** horizontal track + fill + numeric label, used identically for
  every engine (DC/ML/Legacy/Consensus) so the four never look visually
  distinct in a way that implies one is "the real" number.
- **Pill:** small rounded label for confidence/value-gap/status chips.
- Icon set: inline SVG only for now (single silhouette icon in use); adopt
  Lucide wholesale once more admin/nav icons are needed, per Section 12.5.
