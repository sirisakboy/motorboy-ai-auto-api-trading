# MOTORBOY CENTRAL V4.1 — เอกสารระบบมาสคอต (ฉบับที่อยู่ในโปรเจคนี้จริง)

> เอกสารนี้เขียนจาก **โค้ดที่รันได้จริง** ใน repo `motorboy-ai-auto-api-trading`
> ไม่ใช่สเปคบนกระดาษ — ทุกหัวข้อมีไฟล์อ้างอิงและคำสั่งตรวจสอบกำกับ
>
> อัปเดต: 2026-11-04 · branch `arena/fdfaa3af-motorboy-ai-auto-api-trading`

---

## 1. หลักคิด: มาสคอตปรับเข้าหาโปรเจค ไม่ใช่โปรเจคปรับตามมาสคอต

สเปค V4.1 มาเป็น snippet (HTML + vanilla JS) สำหรับหน้า static ซึ่งวางลงโปรเจคนี้ตรง ๆ ไม่ได้
สิ่งที่ทำคือ **แปลงแนวคิดเป็นโค้ดของโปรเจค** และทุกจุดที่ต้องเลือก จะเลือกให้ *โปรเจคไม่ต้องเปลี่ยน*:

| ถ้าเอา snippet มาตรง ๆ | สิ่งที่โปรเจคนี้ใช้แทน | เหตุผล |
|---|---|---|
| `<div id="zenitsu-mascot">` ใน `index.html` + `zenitsu-ui.js` | React `<MascotOverlay />` mount ครั้งเดียวใน `App.tsx` | ไม่มี global script / id ซ้ำ, state อยู่รอดข้าม modal และ hot reload |
| state machine ของตัวเอง + `window.zenitsuUI.showGod()` | Zustand `useMascotStore` เดิม (10 state) ที่ upstream ต่อไว้แล้ว | ถ้ามี 2 state machine การ์ด Co-Pilot ข้างจอกับ chip ลอยจะพูดไม่ตรงกัน |
| `matches('.buy-btn, .sell-btn, .price-label')` | `closest('button, a[href], input, select, textarea, canvas, [role="button"], [data-mascot-avoid]')` | ชื่อ class ใน snippet ไม่มีอยู่จริงในโค้ด Tailwind นี้ |
| `<img src="./projects/zenitsu_ai/pose_1_scan.png">` | `import mascotHero from '../assets/images/nong_motorboy_hero_*.jpg'` | path แบบ literal 404 หลัง `vite build` |
| `el.innerHTML = '...SCAN...'` | React text node ใน `role="status" aria-live="polite"` | กัน XSS และ screen reader ได้ยิน |
| "3 วิแล้วหายเอง" | ยุบเป็น chip 56px หลัง 7 วิ + ปุ่ม "ซ่อน" | 3 วิสั้นเกินกว่าจะอ่านประโยคไทยจบ |
| แดงแบรนด์ `#FF0033` แทนสีแอป | ใช้ `#FF2D55` ของแอป; เก็บ `MASTER_BRAND` ไว้ให้ GARMENT/RACING/TEMPLE | ไม่มีแดงที่ 2 โผล่บนจอเทรด และไม่ต้องแก้ 30 คอมโพเนนต์ตามมาสคอต |
| price formatter ของตัวเอง | `formatPrice({ price, mode, usdThbRate })` จาก `src/utils.ts` | โหมด ฿/$ + FX เรียลไทม์ + ทศนิยมเหรียญราคาเล็ก ตรงกับ ticker/การ์ด/modal |
| backend service ใหม่สำหรับแท่งเทียน | เรียก Binance public REST แบบเดียวกับ `apiClient.fetchPriceHistory` / `atsMatrixService` (timeout 6 วิ) | ไม่มี infra/key/server surface เพิ่ม |

**มาสคอตเพิ่มของให้แอปเพียง 2 อย่าง (เป็นการเพิ่มล้วน ๆ):**
1. attribute `data-motorboy-root` / `data-motorboy-face` บน root ของตัวเอง — ใช้ให้ one-face guard เห็นตัวเอง
2. poll 120 แท่ง 1h ทุก 60 วิ ของเหรียญที่เปิดอยู่ตัวเดียว (cache 60 วิ, ล่มแล้วใช้แท่งล่าสุด ไม่เดาข้อมูล)

---

## 2. โครงสร้าง 3 ชั้น

```
src/mascot/
├── types.ts         สัญญาข้อมูลร่วม (Ohlcv, PoseId, FaceLock, Palette, EndingResult…)
├── core.ts          L1 CORE  — identity lock + one-face checker   (อ่านอย่างเดียว)
├── adapter.ts       L2 ADAPTER — namespace, assets, mount guard, version bridge
├── skins.ts         L3 SKIN   — palette + visual ของ 9 pose        (แก้ได้อิสระ)
├── endings.ts       สมอง AI ENDINGS ANALYZE
├── endingsModel.ts  ค่า threshold ที่จูนได้ (localStorage override)
├── guard.ts         10 กฎกันบังจอ (pure functions)
└── journal.ts       auto journal + settings (quiet mode / knock / hidden)
```

### L1 CORE — "BIOS" (`core.ts`) · ห้ามแก้

| ของ | ค่า |
|---|---|
| `FACE_ID` | `MB-33-MASTER-001` |
| `REALISM_PCT` | `60` (40 % การ์ตูนเกินไปสำหรับจอเงิน, 100 % หนักและบังกราฟ) |
| ฟีเจอร์หน้า (5) | หัวไข่ · ตาน้ำตาลเข้มรีเล็กน้อย · ผมดำควันฟูวอลลุ่มสั้น · หนวดเครา 3 ส่วน · ผิวแทนอมเย็น undertone cool |
| `FACE_LOCK` | `Object.freeze` + checksum FNV-1a (`MB` + 8 hex) |
| `verifyFaceLock()` | คืน `{ ok, expected, actual }` — แก้อะไรในสัญญาแล้ว `npm test` แดงทันที |
| one-face | `countMountedFaces()` / `canMountFace()` / `findFaceMismatches()` |

### L2 ADAPTER — "kernel" (`adapter.ts`)

- 4 namespace: `MOTORBOY.PROJECT.{TRADING,GARMENT,RACING,TEMPLE}`
- asset แยกโปรเจค: เฉพาะ TRADING มี `hero`; โปรเจคอื่นคืน `''` **โดยตั้งใจ** เพื่อไม่ให้ยืมงานอาร์ตข้ามโปรเจค
- `decideMount(root)` → `{ allowed, reason: 'OK' | 'ALREADY_MOUNTED' }` กัน "หน้าเบิ้ล"
- `bridgeLegacyState()`: `NORMAL→IDLE`, `SCAN→WORK_ANALYZE`, `GOD→CLIMB_CANDLE`, `MINI/HIDDEN→SLEEP_WAIT` (รับได้ทั้งตัวเล็ก/ใหญ่/ค่าขยะ)

### L3 SKIN — "App layer" (`skins.ts`) · แก้ได้

| โปรเจค | Palette |
|---|---|
| MASTER (แบรนด์) | ดำ `#000000` + แดง `#FF0033` (export เป็น `MASTER_BRAND`) |
| **TRADING (ที่ ship)** | primary **`#FF2D55`** (สีแอป) · bull `#00E676` · bear `#FF5252` · signal `#00E5FF` · surface `#141721` · border `#252A3A` |
| GARMENT | ดำ/แดง PPE + แว่นใส (ไม่ใช่มาสก์ฟ้าเดิม) — ประกาศไว้ ยังไม่ทำอาร์ต |
| RACING | ชุดแข่งดำ/แดง + เหลือง caution — ประกาศไว้ |
| TEMPLE | pearl `#FFFFFF` + gold `#FFD700` + saffron `#FF8C00` · เสื้อขาวคอทอง **ไม่ใช่จีวร** — ประกาศไว้ |

**9 pose** (สเปคเขียนหัวข้อว่า "8 POSES" แต่ลิสต์มา 9 — implement ครบ 9):
`IDLE` 🏍️ · `WALK_CHART` 🚶 · `CLIMB_CANDLE` 🧗 · `FALL_BREAK` 🪂 · `WORK_ANALYZE` 🔍 · `HAPPY_TP` 🥳 · `SAD_SL` ☂️ · `DRAG_FIBO` 📐 · `SLEEP_WAIT` 😴

pose ถูกเลือกจาก **พฤติกรรมจริง** ไม่ใช่แค่ state: `TP_CELEBRATE→HAPPY_TP`, `SL_RESPECTED/KILL_SWITCH/RISK_REJECT→SAD_SL`, `SCANNING/CONFIRM_TRADE→WORK_ANALYZE`, `READY_TO_EXECUTE→DRAG_FIBO`, แล้วต่อด้วย ending (`BULL→CLIMB_CANDLE`, `BEAR→FALL_BREAK`, `BREAKOUT→WORK_ANALYZE`, `SIDEWAY→IDLE/SLEEP_WAIT`) และสุดท้ายคือความนิ่ง (`idle ≥ 2 นาที → SLEEP_WAIT`)

---

## 3. สมอง AI ENDINGS ANALYZE

**ไม่ใช่ external model** — เป็นการอ่านแท่งเทียนแบบ deterministic (ไม่มี RNG, ใส่ `now` เข้าไปได้) ตอบคำถามเดียว: *"ท่อนนี้จบตรงไหน"*

```
analyzeEndings(candles, { support?, resistance?, model?, now?, symbol? })
  → { type, prob, target, support, resistance, oneLineTH, reasons[], at } | null
```

| Ending | เงื่อนไข (วัดล้วน ไม่สุ่ม) | prob |
|---|---|---|
| `BREAKOUT_END` | กล่องแคบ + volume ในกล่องแห้ง + แท่งล่าสุด ≥ `volumeSpike`× ค่าเฉลี่ย 20 แท่ง | 66–88 |
| `BULL_END` | close > High เดิม 20 แท่ง + volume พุ่ง | 70–92 |
| `BEAR_END` | close < Low เดิม 20 แท่ง + volume พุ่ง | 70–92 |
| `SIDEWAY_END` | กล่องแคบ ยังไม่ตัดสินใจ | 55–72 |
| *(null)* | ไม่เข้าเงื่อนไขใด หรือแท่งเทียน < `minCandles` (40) | — |

**ลำดับความสำคัญ** ตั้งใจให้ `BREAKOUT_END` มาก่อน `BULL_END` เพราะเป็นข้อความที่แรงกว่า (แม้จะเข้าเงื่อนไขทั้งคู่)

**ค่า default ที่จูนได้** (`endingsModel.ts`):

```json
{
  "thresholds": { "volumeSpike": 1.6, "compressionRatio": 0.55, "compressionBars": 30, "breakoutLookback": 20 },
  "targetAtrMultiple": 1.5,
  "atrPeriod": 14,
  "volumePeriod": 20,
  "minCandles": 40
}
```

override ได้โดยไม่ต้อง build — ใน DevTools console:

```js
localStorage['motorboy_endings_model_v1'] = JSON.stringify({
  thresholds: { volumeSpike: 1.8, compressionRatio: 0.5 }
});
location.reload();
// ล้าง: localStorage.removeItem('motorboy_endings_model_v1')
```

**ผลลัพธ์หน้าจอ** — ประโยคไทยประโยคเดียว เช่น
`จบขาขึ้นรอบนี้ต่อ ถือต่อเป้า 125.56 แนวรับ 111.3`
`จบ Sideway รอเบรก 45,200 ค่อยเข้า (กรอบ 44,800–45,300)` ← ไม่โชว์ 10 อินดิเคเตอร์

---

## 4. กฎ 10 ข้อกันบังจอ (ENDING GUARD)

| # | กฎ | บังคับใช้ที่ |
|---|---|---|
| 1 | ห้ามบัง `.buy-btn .sell-btn .price-label .tp-input` | `NEVER_BLOCK_SELECTOR` (+ ปุ่มจริงทุกตัว, `canvas`, `[data-mascot-avoid]`) |
| 2 | หลบอัจฉริยะ 100 px | `distanceToRect` / `AVOID_DISTANCE_PX` บน `pointermove` แบบ rAF-throttled |
| 3 | ghost 50 % (ไม่ใช่ซ่อนหาย) | `ghostOpacity` → `opacity-50 scale-90` เฉพาะตัวมาสคอต |
| 4 | ย่อเป็นหัว 32–40 px หลังเงียบ 2 นาที | `shouldMinimize` / `MINIMIZE_AFTER_MS` |
| 5 | พูดจบแล้วหายเอง | `AUTO_HIDE_AFTER_SPEAK_MS` (3 วิ) + collapse 7 วิเดิม |
| 6 | โหมดเงียบ — AI ยังรัน โชว์แค่ตัวเลข | `MascotSettings.quietMode` → เหลือ pill `BULL END 74%` |
| 7 | onboarding ชี้ปุ่มจริง | `onboardingTarget()` + `pointAtFirstControl()` outline 2.5 วิ (ไม่ใช้ coach-mark overlay ที่กินคลิก) |
| 8 | auto journal | `recordEnding()` ทุกครั้ง, cap 200, dedupe 5 นาที ต่อ symbol+type |
| 9 | one line เท่านั้น | สมองคืน `oneLineTH` เดียว; `reasons[]` เก็บไว้ใน journal ไม่เอามาแสดง |
| 10 | knock alert ตอน BEAR_END ขณะเผลอ | `shouldKnock()` + `knock()` (สั่น `[120,60,120]` + chime drawdown เดิม) |

---

## 5. คำสั่งที่ใช้ (copy ได้เลย)

```bash
cd /home/user/motorboy-ai-auto-api-trading

# ตรวจทั้งชุด (สิ่งที่รันก่อน commit ทุกครั้ง)
npx tsc --noEmit && npx vitest run && npx vite build && rm -rf dist

# รันเดฟ / พรีวิว
npm run dev                      # http://localhost:3000

# เฉพาะมาสคอต
npx vitest run src/__tests__/mascot.test.tsx src/__tests__/mascotCore.test.ts src/__tests__/endings.test.ts

# ดู journal ที่มาสคอตพูดไว้
JSON.parse(localStorage['motorboy_journal_v1'] || '[]')

# โหมดเงียบ / ปิด knock / ซ่อนถาวร
localStorage['motorboy_mascot_settings_v1'] = JSON.stringify({ quietMode: true, knockAlert: false, hidden: false })

# git
git log --oneline -3
git push origin arena/fdfaa3af-motorboy-ai-auto-api-trading
```

---

## 6. ผลทดสอบ (ล่าสุด)

| ตรวจ | คำสั่ง | ผล |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | ✅ 0 error |
| Tests | `npx vitest run` | ✅ **119/119 pass ใน 10 ไฟล์** |
| — mascot overlay | `mascot.test.tsx` | 19 (pointer-events, chip↔card, critical style, GOD SPEED, Gemini line, ไม่กระพริบตอน poll, ending badge, quiet mode, THB, onboarding, face attr) |
| — core/adapter/guard/journal | `mascotCore.test.ts` | 29 (identity lock, tamper, one-face, namespace, asset isolation, bridge, palette, 10 กฎ, journal) |
| — endings brain | `endings.test.ts` | 15 (BULL/BEAR/SIDEWAY/BREAKOUT, priority, minCandles, determinism, junk candles, ATR, mapper) |
| Build | `npx vite build` | ✅ ผ่าน, asset hashed, ไม่มี `/src/assets` หลุดใน bundle |
| Dev server | `GET /` (ผ่าน preview host) | ✅ 200 |

---

## 7. ข้อจำกัด / ที่ยังไม่ได้ทำ (ตรงไปตรงมา)

1. **Telegram ending alert ยังไม่มี** — ต้องมี server route + token; ตอนนี้ knock ใช้ chime เดิมของแอป
2. **`endings.model.json` ยังว่าง** — ยังไม่ได้ใส่ override จากประวัติเทรดจริง ~100 ไม้ (โครงพร้อมแล้ว: เขียน key ใน localStorage ได้เลย)
3. **อาร์ต 9 pose ยังเป็น emoji** — ตามสเปค "เริ่มง่าย"; asset set แยกโปรเจคเตรียมไว้แล้ว
4. **onboarding** เป็นการชี้จุด (outline) ไม่ใช่ทัวร์หลายสเต็ป
5. **หน้าจอ**: มาสคอตวิ่งไปตามกราฟจริงไม่ได้ (ไม่มี canvas overlay) — pose เปลี่ยนตามข้อมูล ไม่ใช่ตำแหน่งราคา
6. **Binance REST ตรงจาก browser** — ประเทศที่บล็อกจะเงียบ (ไม่เดาข้อมูล) ถ้าต้องการเสถียรควรย้ายไป `/api/...` (จะแตะ `server.ts` ซึ่งเกินขอบเขต "ไม่ดัดแปลงโปรเจคตามมาสคอต")

---

## 8. ลำดับต่อไปตามแผน rollout ของสเปค

| เมื่อไหร่ | งาน |
|---|---|
| **วันนี้ (เสร็จ)** | CORE + ADAPTER + TRADING skin + endings brain + guard |
| **ถัดไป** | เติม ending model จากประวัติเทรดจริง ~100 ไม้ แล้วเทียบผล |
| **หลังจากนั้น** | knock sound ที่ไพเราะขึ้น + Telegram ending alert (ต้องเพิ่ม server route) |
