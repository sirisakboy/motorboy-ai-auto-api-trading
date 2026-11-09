# Mascot: transparent, free-floating, draggable (9 Nov 2026)

## What changed

The mascot used to be a **card** (rectangular panel, backdrop blur, fixed to the
bottom-right corner and echoed again in the dashboard sidebar). It is now a
**transparent cut-out character** that the trader can drop anywhere on the page.

| | before | after |
| --- | --- | --- |
| art | `nong_motorboy_hero_*.jpg` — 646 kB, opaque circuit-board background | `public/brand/motorboy-mascot.png` — 184 kB, alpha channel, master identity (male, 33) |
| presentation | rounded card with blur, avatar thumb inside | character stands on the page, speech bubble beside her |
| position | fixed `bottom/right` | drag anywhere, clamped to the viewport, remembered in `localStorage` |
| input | click to open | click/tap to open · drag to move · arrow keys move (±16 px, ±48 px with Shift) |
| surfaces | card **and** floating overlay | one surface only (the overlay) |

## Artwork: MotorBoy master identity (v1)

The character art is the product owner's master identity sheet: male mechanic,
33–34, black leather racing jacket with crimson M badge — which finally matches
`FACE_ID = MB-33-MASTER-001` (the "33" is his age band). The old female render is
still in git history if it is ever needed again.

All brand files live in `public/brand/` (served at `/brand/...`, ready to
download or upload elsewhere): `motorboy-mascot.png`, `motorboy-logo.png`,
`motorboy-logo-dark.png`, `motorboy-mark.png` — see `public/brand/README.md` for
sizes, palette and usage.

## How the cut-outs were made

`u2net` (rembg) is not reachable from this sandbox — GitHub release assets are
blocked and the TLS chain fails — so both mattes are model-free:

- character (render on white) → colour-distance ramp from white, then
  un-premultiply so edges carry no white halo;
- logo (flat art on white) → colour-to-alpha with the ink's core darkness
  normalised out, so the wordmark stays solid.

```bash
python3 tools/cutout_mascot.py render-on-white.png public/brand/motorboy-mascot.png --bg white --height 720
python3 tools/cutout_mascot.py logo-on-white.png   public/brand/motorboy-logo.png   --bg flat  --width 1200
```

## Rules kept

- The whole layer is still `pointer-events-none`; only the character and the
  bubble accept input, so a stray click never lands on her instead of the chart.
- Ghosting (0.6 opacity) when the pointer is within 100 px of a protected
  control (`mascot/guard.ts`), auto-minimise after 2 min idle, auto-collapse a
  few seconds after she speaks.
- Calm motion: one 7 s drift of 5 px, disabled entirely under
  `prefers-reduced-motion`.
- Detected risk (`KILL_SWITCH_ACTIVE`, `RISK_REJECT`) re-opens the bubble even
  after the trader pressed "ซ่อน", and offers a single "รับทราบครับ" action.
- No alert red: the 🛑 glyph was removed from the mascot's copy (peach `#F4A6A6`
  plus a word carries the warning instead).

## Deliberately not built yet

- **Cursor-following** — pleasant in a demo, distracting on a trading screen, and
  it fights the "max 2 moving things" motion rule.
- **Function calling** (`change_asset`, `filter_stocks`, `open_news`) — the next
  real step for "mascot controls the dashboard"; it needs a tool schema on the
  server route plus an action dispatcher in `App.tsx`.
- **Contextual greetings** (404, finished article, new watchlist item) — cheap to
  add on top of `mascotService.setMascotState`.
