# Mascot AI — deep review (Nov 2026)

Scope: `src/mascot/*`, `services/mascotService.ts`, `services/mascotAiService.ts`,
`components/MascotOverlay.tsx`, and every place the app talks to the mascot.

## 1. How it was wired (before)

```
App.tsx ──props(cryptoList, signals, useThb, usdThbRate, geminiApiKey)──▶ MascotOverlay
   │
   ├─ useEffect: volatility / flat market ──▶ useMascotStore.setMascotState(...)
   ├─ useEffect: drawdown breach        ──▶ useMascotStore.setMascotState(...)
   └─ timers:   onboarding, scanning, TP celebrate ──▶ same store
```

Three problems:

1. **The mascot could not exist without the dashboard.** Five data props were
   drilled from `App.tsx`; rendering the overlay anywhere else showed an empty,
   blind mascot.
2. **The mascot's judgment lived in the wrong file.** The volatility and drawdown
   rules were inline `useEffect`s in `App.tsx`. They could only be exercised by
   mounting the whole dashboard, so they were never tested, and they ran only
   when *App* re-rendered.
3. **Duplicated manners.** `guard.ts` exported `isNearProtected()` and
   `ghostOpacity()`, but the overlay re-implemented the distance test and
   hard-coded `opacity-60` inline.

## 2. How it is wired now

```
App.tsx ──publishMascotFeed(snapshot)──▶ mascot/feed.ts (zustand)
                                              │
                          ┌───────────────────┴───────────────────┐
                          ▼                                       ▼
              mascot/observer.ts                       MascotOverlay (no props)
              decideAutoState() — pure                 reads feed, renders, drags
                          │                                       │
                          └──────────▶ useMascotStore ◀───────────┘
```

- `mascot/feed.ts` — one snapshot the app publishes (`cryptoList`, `signals`,
  `useThb`, `usdThbRate`, `apiKey`, `drawdownBreaches`, `worstDrawdownPct`).
- `mascot/observer.ts` — `readMarket()` + `decideAutoState()` are **pure**, so the
  mascot's judgment is unit-tested (17 tests) instead of hoped for. The
  `useMascotAutoPilot()` hook is mounted by the overlay itself.
- `MascotOverlay` props are now **optional**; a prop wins, the feed fills the
  gaps. `<MascotOverlay />` alone is a complete mascot with live data.

`App.tsx` lost two mascot `useEffect`s and five props. It still owns the
*actor* states it triggers on purpose (scan on refresh, TP celebrate on a price
alert) — those are user-visible actions, not ambient detection.

## 3. Behaviour fixes

| # | Issue | Fix |
| --- | --- | --- |
| 1 | A single 10%-move candle could leave the mascot stuck in "หยุดเทรด" indefinitely | the observer releases the kill switch once the market calms and no drawdown breach is open (new rule, tested) |
| 2 | Concurrent state churn fired parallel Gemini calls; the bubble flickered between answers | one in-flight request, shared by all callers |
| 3 | `AbortSignal.timeout` is missing in older Safari/Chrome → the call threw and the line silently never arrived | `timeoutSignal()` feature-detects and falls back to an `AbortController` + timer |
| 4 | Every failed request retried at full speed | exponential backoff 30s → 60s → 120s (capped), reset on success |
| 5 | Dragging re-rendered the whole overlay (bubble included) on every `pointermove` | one update per animation frame, and the final point is always committed on pointer-up (a fast drag used to lose its last frame) |
| 6 | The mascot's proximity test and ghost opacity were re-implemented in the component | uses `guard.isNearProtected()` / `guard.ghostOpacity()` — one definition |
| 7 | Offline tab still spun the "กำลังคิด..." loader | `canReachServer()` short-circuits the request |
| 8 | The endings feed polled Binance every 60 s even in a hidden tab | skipped while `document.hidden`, same guard the rest of the app uses |

## 4. UI / accessibility notes

- The layer stays `pointer-events-none`; only the character and bubble take input.
- Drag works with pointer, touch and keyboard (arrow keys), position clamped to
  the viewport and persisted; it re-clamps on rotate.
- The bubble is `role="status" aria-live="polite"`; the character is a labelled
  button, the cut-out image is `alt=""` (decorative).
- Detected risk re-opens the bubble even after "ซ่อน", and offers "รับทราบครับ".
- Calm motion: one 7 s drift, disabled under `prefers-reduced-motion`; ghost at
  50% opacity near protected controls.

## 5. Still open (deliberately)

- **`settings.hidden`** has no writer: nothing in the UI ever sets it, so the
  branch in the overlay is dead. Either wire a "ซ่อนถาวร" control with a way back
  (settings), or drop the field. Left as-is because it is part of the persisted
  settings shape asserted by `mascotCore.test.ts`.
- **Function calling** (`change_asset`, `filter_stocks`, `open_news`) — the real
  "mascot controls the dashboard" step. Needs a tool schema on the server route
  plus an action dispatcher; the feed/observer split is the prerequisite, and it
  is now in place.
- **Pose vocabulary**: `KILL_SWITCH_ACTIVE` and `RISK_REJECT` both map to the
  umbrella pose (`SAD_SL`). A dedicated "engine off" pose would read better.
