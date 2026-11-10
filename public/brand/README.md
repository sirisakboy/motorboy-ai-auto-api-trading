# MotorBoy brand assets

Two families, on purpose: one that fits **inside the product** (dark Calm UI) and
one for **external** material taken from the owner's master identity sheet.

## 1. In-product lockup (fits the Calm UI)

| file | size | use |
| --- | --- | --- |
| `motorboy-mark.svg` | 100 × 100 (vector) | app mark: lavender tile, ink monogram — header, splash, app icon |
| `motorboy-mark-mono.svg` | 100 × 100 (vector) | same shape in `currentColor`, for any surface |
| `motorboy-mark-512.png` | 512 × 512 | store / app icon |
| `motorboy-mark-64.png` | 64 × 64 | favicon / small contexts |
| `motorboy-logo.svg` | 404 × 100 (vector) | horizontal lockup: mark + `MOTORBOY` + `RACING · TECH · AI` |

Why it fits:

- The mark keeps the **exact 32/36 px square footprint** of the emblem it
  replaced, so the header row does not shift or wrap. It is `shrink-0`; the
  wordmark beside it is `min-w-0`.
- Ink is `#0F1117` on the lavender tile — never white on lavender (AA).
- The `HYBRID PRO` chip only renders from `sm` up (it needs ~62 px), and the
  tagline only from 380 px, so nothing collides at 320–375 px.
- The lockup's wordmark is set with `textLength`, so its box is fixed whatever
  font the viewer has. **Outline it before sending to print.**

## 2. Master identity (external use)

| file | size | use |
| --- | --- | --- |
| `motorboy-mascot.png` | 221 × 720 | full-body character, transparent — the app's floating mascot |
| `motorboy-logo.png` | 1200 × 263 | crimson M + charcoal wordmark — **light** backgrounds |
| `motorboy-logo-dark.png` | 1200 × 263 | same lockup with light wordmark — **dark** backgrounds |

Character: Thai male mechanic, 33–34, 175 cm, light goatee, black leather racing
jacket with crimson accents — matches `FACE_ID = MB-33-MASTER-001` in
`src/mascot/core.ts` (the "33" is his age band).

## Colour

| role | hex |
| --- | --- |
| brand lavender (UI accent) | `#7C6CFF` → `#8E80FF` |
| ink on lavender | `#0F1117` |
| text on dark surfaces | `#ECEAF4` |
| good / caution / loss | `#7EE0B5` / `#FFB86B` / `#F4A6A6` |
| crimson (master identity art only) | `#CB1D30` |

Brand Book rule for the interface: **no alert red in UI signals** — mint = good,
amber = caution, peach = loss. The crimson in the mascot's jacket and in the
external lockups is artwork, not a signal.

## Regenerating

```bash
# character / logo mattes (no AI model needed)
python3 tools/cutout_mascot.py <render-on-white.png> public/brand/motorboy-mascot.png --bg white --height 720
python3 tools/cutout_mascot.py <logo-on-white.png>   public/brand/motorboy-logo.png   --bg flat  --width 1200

# the app mark is pure geometry, no rasteriser involved
python3 tools/mark_motorboy.py            # writes mark SVG + PNGs
```
