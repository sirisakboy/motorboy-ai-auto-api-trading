# MotorBoy brand assets — v1 (9 Nov 2026)

Master identity supplied by the product owner (MotorBoy — Racing · Tech · AI).
Everything here is a transparent PNG, ready to upload or drop into a deck.

| file | size | use |
| --- | --- | --- |
| `motorboy-mascot.png` | 221 × 720 | full-body character, transparent — the app's floating mascot |
| `motorboy-logo.png` | 1200 × 263 | primary lockup (crimson M + charcoal wordmark) for **light** backgrounds |
| `motorboy-logo-dark.png` | 1200 × 263 | same lockup with a light wordmark for **dark** backgrounds |
| `motorboy-mark.png` | 360 × 263 | M monogram only — avatar, favicon, app icon |

## Character

- MotorBoy: Thai male, 33–34, 175 cm, light goatee, short spiky black hair.
- Outfit: black leather racing jacket with crimson collar/shoulder accents and a
  red M badge, black tee, black cargo trousers, black boots, chunky watch.
- Matches `FACE_ID = MB-33-MASTER-001` in `src/mascot/core.ts` (the "33" is his
  age band), so the art and the machine-readable identity now agree.
- Style preset: 3D / Cartoon (one of the four presets in the identity sheet);
  Realistic / Anime / 2D / Cyberpunk variants remain available for other channels.

## Palette as rendered

| role | hex | note |
| --- | --- | --- |
| crimson (M, M badge) | `#CB1D30` | as rendered from the master sheet |
| ink (wordmark) | `#231F20` → `#010003` at the core | light lockup only |
| light ink (dark lockup) | `#ECEAF4` | the app's `--mb-text` token |

The identity sheet lists `#FF0033 / #6A5AE0 / #00E5FF / #BFEF14`. Those are the
studio outline colours; the assets here were rendered in a deeper crimson.
**Brand Book rule still applies to the UI:** no alert red in interface signals —
mint `#7EE0B5` = good, amber `#FFB86B` = caution, peach `#F4A6A6` = loss/risk.
The mascot's jacket red is artwork, not a signal.

## Regenerating the transparent versions

```bash
python3 tools/cutout_mascot.py <render-on-white.png> public/brand/motorboy-mascot.png --bg white --height 720
python3 tools/cutout_mascot.py <logo-on-white.png> public/brand/motorboy-logo.png --bg flat --width 1200
```
