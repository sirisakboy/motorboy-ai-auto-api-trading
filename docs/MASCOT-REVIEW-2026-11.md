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
- **Pose vocabulary**: `KILL_SWITCH_ACTIVE` and `RISK_REJECT` both map to the
  umbrella pose (`SAD_SL`). A dedicated "engine off" pose would read better.

## 6. Function calling — "สั่งงานน้องได้"

The bubble now has one input. You type a sentence ("ขอดูบิทคอยน์หน่อย"), the
server turns it into **one whitelisted verb**, the dashboard performs it, and the
mascot answers in Thai.

```
bubble input ─▶ POST /api/gemini/mascot-action ─▶ Gemini (+ MASCOT_ACTION_CATALOG)
                                   │                      │ JSON only
                                   │              { reply, action }
                                   ▼                      ▼
                     parseMascotAction()  ──▶ dispatchMascotAction()
                     (server)                 (client, one handler each)
                                                       │
                             change_asset / filter_stocks / open_news / open_chat
```

| Verb | Arguments | What it does |
| --- | --- | --- |
| `change_asset` | `symbol` (validated `^[A-Za-z0-9./_-]{1,15}$`), `market?` | switches to that market's tab and puts the ticker in the one shared search box |
| `filter_stocks` | `query` (≤40), `market?` | same, but with a free-text filter |
| `open_news` | `topic?` (≤60) | opens the news modal |
| `open_chat` | `question?` | opens the full chat panel |

Design guarantees, in the order they hold:

1. **The model never touches the DOM.** It can only ask for a name from
   `MASCOT_ACTION_CATALOG`; anything else is `null`.
2. **Arguments are validated twice** — once on the server before the response
   leaves, once on the client in `sendMascotCommand`, because a server is still
   a network hop. Symbols are never truncated (a cut-down ticker is a different
   ticker), extra fields (`amount`, `side`, `leverage`) are dropped, unknown
   markets are dropped, over-long queries are cut to 40 characters.
3. **No trading verbs exist.** There is no `place_order`, no `confirm`, nothing
   that touches an order or a balance. A hallucinated `place_order` is discarded
   and the user still sees the reply — covered by
   `src/__tests__/mascotCommand.test.tsx`.
4. **No handler, no action.** `dispatchMascotAction` returns `false` when nobody
   registered that verb (e.g. the mascot rendered outside `App`), and never
   throws into the overlay.
5. **Registration is the seam.** `App.tsx` registers four handlers in one effect
   and unregisters on unmount; the mascot itself imports no store, no tab state,
   no modal state — same rule as the feed.

Server route: `POST /api/gemini/mascot-action` (`server.ts`), `temperature 0.4`,
`maxOutputTokens 220`, `responseMimeType: application/json`, `text` capped at 200
chars and `marketBrief` at 600, guarded `JSON.parse`, `400 missing_text` /
`400 missing_gemini_key`, `502 empty_gemini_response` / `502 mascot_action_failed`.

Tests: `src/__tests__/mascotActions.test.ts` (18 — accept/reject/dispatch/copy)
and `src/__tests__/mascotCommand.test.tsx` (6 — end-to-end through the bubble).

## 7. Context events — "น้องทักเอง"

`src/mascot/announce.ts` is a second, tiny channel next to the market feed: a
context event that is *not* market data ("เพิ่มเข้า watchlist แล้ว", "อ่านข่าว
จบแล้ว") asks the mascot to say one line and forget it.

| Rule | Why |
| --- | --- |
| one line at a time, 8 s throttle | a queue would play stale congratulations out of order |
| the same line inside 30 s is dropped | idempotent UI events fire more than once (scroll, re-render) |
| 140-character cap | it is a bubble, not an article |
| never persisted | a reload must not replay yesterday's "ยินดีด้วย" |
| `quietMode` keeps the text but does not open the bubble | quiet mode is a promise |

Wired so far: **watchlist add/remove** (`App.tsx → handleToggleWatchlist`) and
**reading a news analysis to the end** (`NewsDetailModal` scroll-to-bottom).
There is no 404 surface in this SPA, so that one stays on the wish list.

The overlay clears `aiLine` when the announcement auto-hides, so a greeting from
ten minutes ago never hides the live market line.

## 8. Chat hand-off

`open_chat { question }` does not just open `ChatModal` — it **prefills the
composer** with the sentence the user already typed to the mascot and focuses it.
It never auto-sends: the user is still the one who asks. Both the header button
and the mascot go through one `openChat(question?)` in `App.tsx`; closing the
modal clears the seed.

## 9. Engine off ≠ sad

`KILL_SWITCH_ACTIVE` used to borrow the SL umbrella pose, which read as "the
trade went wrong" when the truth is "I switched myself off". It now reads as
**parked**: the character is desaturated (`grayscale(.85) brightness(.8)`), the
drift animation stops, and a small **พักเครื่อง** tag sits under the feet. The
label is `พักเครื่อง — kill switch ทำงาน`. `SL_RESPECTED` and `RISK_REJECT` keep
the umbrella, because those really are losses/refusals. No new `PoseId` was
added, so the eight-pose spec and every downstream skin/mood table stay intact.

## 10. Favicon

`public/favicon.svg` was still the old Trading-Engine chart mark. It is now the
in-product mark (lavender tile + ink M), and `index.html` also points
`apple-touch-icon` at `brand/motorboy-mark-512.png`. The shapes must stay
identical to `public/brand/motorboy-mark.svg` — edit the brand file first, then
copy.
