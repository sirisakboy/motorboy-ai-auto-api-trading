# Deep Review & Fix Log — 4 พ.ย. 2026

รีวิวทั้งรีโป (server + client + config + CI + docs) แล้วแก้ทุกข้อที่พิสูจน์ได้ว่าเป็นบั๊ก/ความเสี่ยงจริง
ทุกข้อด้านล่าง **ผ่านการรันตรวจ** ไม่ใช่แค่อ่านโค้ด

- branch: `arena/fdfaa3af-motorboy-ai-auto-api-trading`
- เริ่มจาก: `ee1bab2`
- ผลรวม: typecheck ผ่าน (client + server), **175 เทสต์ / 15 ไฟล์ ผ่าน**, `vite build` ผ่าน, production server บูตผ่านพร้อม smoke test

---

## 1. สรุปผู้บริหาร

| ระดับ | จำนวน | ตัวอย่าง |
|---|---|---|
| 🔴 ทำให้ระบบพัง/ใช้งานไม่ได้ | 4 | `npm start` รันไม่ขึ้น, `.env` ถูก track, CI ทุก workflow fail, ปุ่มส่งแชทยิงซ้ำ |
| 🟠 ความปลอดภัย | 3 | OAuth ขอกล่องเมลทั้งใบ, ไม่มี rate limit, รับ body 10 MB |
| 🟡 บั๊กเชิงพฤติกรรม/ประสิทธิภาพ | 6 | re-render ทุก 1 วินาที, chart โหลดค้างเมื่อ fetch fail, closure เก่าใน effect |
| 🔵 เอกสาร/ไอคอน/ฟอนต์ | 4 | README อธิบายผิดภาษา, favicon 404, โหลดฟอนต์ซ้ำ |

---

## 2. สิ่งที่แก้ (เรียงตามระดับ)

### 🔴 P0 — ทำให้รันไม่ได้ / deploy ไม่ได้

1. **`npm start` พังทันที**
   `"start": "node server.ts"` — Node รัน TypeScript ตรง ๆ ไม่ได้ ⇒ เปลี่ยนเป็น `tsx server.ts`
   และย้าย `tsx` จาก `devDependencies` → `dependencies` (ไม่เช่นนั้น `npm ci --omit=dev` บน production จะไม่มีตัวรัน)

2. **`.env` ถูก commit เข้า git**
   `git rm --cached .env` + เพิ่ม `.env`, `.env.local`, `.env.*.local` ใน `.gitignore`
   (ไฟล์ยังอยู่บนเครื่อง แต่จะไม่ถูก push อีก — กันเหตุการณ์คีย์หลุดซ้ำ)

3. **CI ทั้งสองไฟล์ fail ทุกครั้ง**
   `build_apk.yml` เรียก `./gradlew` ที่ไม่มีในรีโป (ไม่มีโมดูล Android เลย)
   `google.yml` เรียก `docker build` + `kustomize` ที่ไม่มี `Dockerfile`/`kustomization.yml`
   ⇒ ลบทั้งสอง แล้วเพิ่ม `.github/workflows/ci.yml` ที่ตรวจของจริง: `npm ci` → typecheck (client+server) → test → build → **smoke test production server** (`GET /` = 200, `GET /api/…` = 404 JSON)

4. **กดส่งแชทเร็ว ๆ 2 ครั้ง = ยิง API 2 ครั้ง (จ่ายเงิน 2 ครั้ง)**
   `isSending` เป็น state ที่อัปเดตแบบ async ⇒ ใช้ `sendingRef` เป็น lock จริง
   เพิ่มเทสต์: คลิกชิปแนะนำติดกันในติ๊กเดียว → เรียก `streamChatReply` แค่ 1 ครั้ง

### 🟠 P1 — ความปลอดภัย

5. **OAuth ขอกว้างเกินจริง**
   เดิมขอ `https://mail.google.com/` (ทั้งกล่องเมล) + `gmail.settings.sharing` + `gmail.insert` + add-on scopes + **25 scopes ของ Google Chat** ที่ไม่มีโค้ดเรียกเลย
   ⇒ เหลือเท่าที่ใช้จริง: `gmail.readonly`, `gmail.send`, `gmail.modify`, `calendar.events` และ `CHAT_SCOPES = []`
   (ผลพลอยได้: จะผ่าน Google OAuth verification ได้จริง)

6. **ไม่มี rate limit บน route ที่คิดเงินตามโทเคน**
   ⇒ `src/server/rateLimit.ts` (fixed window, ไม่พึ่ง dependency ใหม่) 60 คำขอ/นาทีต่อ IP
   ตอบ `429` + `Retry-After` และมีเทสต์ 4 ข้อ (จำกัด/แยก IP/หมดหน้าต่าง/reset)

7. **รับ JSON body ได้ถึง 10 MB**
   ⇒ ลดเหลือ **1 MB** (`express.json({ limit: '1mb' })`)

8. **`/api/*` ที่ไม่มีอยู่จริง ตอบ `index.html`**
   client พยายาม `JSON.parse` HTML → ได้ `SyntaxError` ที่อ่านไม่รู้เรื่อง
   ⇒ path ที่ขึ้นต้นด้วย `/api/` ตอบ `404 {"error":"Not found"}`

### 🟡 P2 — บั๊กเชิงพฤติกรรม / ประสิทธิภาพ

9. **NewsCard นับถอยหลังทุก 1 วินาที**
   `setInterval(..., 1000)` + `setState` ทุกติ๊ก ⇒ รีเรนเดอร์ลิสต์ข่าวทั้งก้อน 86,400 ครั้ง/วัน
   และเรียก `runAutoAnalysis()` **ข้างใน state updater** (ผิดหลัก React — StrictMode เรียกซ้ำ = วิเคราะห์ซ้ำ)
   ⇒ เปลี่ยนเป็น timeout เดียวต่อรอบ (1 ชม.) คำนวณจาก `lastRunAt`, แสดง `ตรวจล่าสุด 12:34 • รอบถัดไป 13:34` แทนตัวเลขนับถอยหลัง (ตรงกับ Brand Book "ไม่มีนับถอยหลังที่เดินวินาที")
   ⇒ อ่าน `localStorage` ผ่าน `readLastRun()` ที่ทนค่าเสีย (`NaN`/อนาคต) — เดิม `parseInt` พังแล้วขึ้น `NaN:NaN`

10. **กราฟโหลดค้างตลอดกาลเมื่อ `fetchPriceHistory` ล้มเหลว**
    `.then()` ไม่มี `.catch`/`.finally` ⇒ spinner ค้าง + unhandled rejection
    ⇒ เพิ่ม `.catch` (ล้างข้อมูล + warn) และ `.finally` (ปิด loading)
    พร้อมแก้ dep ที่ทำให้กราฟรีเฟรชทุก 15 วิ (`forexPairSet` เป็น Set ที่ identity เปลี่ยนทุกครั้ง) → ใช้ `isForexChart` (boolean)

11. **Headline categorization ส่งข่าวชุดเก่าซ้ำ**
    effect ผูกกับ `newsList.length` แต่ใช้ `newsList` จาก closure ⇒ อัปเดตแล้วก็ยังส่งของเก่า
    ⇒ อ่านผ่าน `newsRef.current`

12. **แท็บที่ซ่อนอยู่ยัง poll เน็ตเต็มที่**
    ⇒ เพิ่ม `if (document.hidden) return;` ให้ทุก polling loop ใน `App.tsx` (ราคา/ค่าเงิน/หุ้น/ข่าว/headline/market hours) และ `AtsMatrixDashboard`

13. **สติ๊กเกอร์ในแชทหายไปหลังอัปเกรดเป็น Markdown**
    ⇒ `ChatMessageItem` ตรวจ `parseStickerCode` และเรนเดอร์ภาพสติ๊กเกอร์ก่อนตีความเป็น markdown

14. **`setTimeout` ของปุ่มคัดลอกทำงานหลัง component ถูก unmount**
    ⇒ เก็บ timer ไว้ใน ref และ clear ตอน unmount

### 🔵 P3 — เอกสาร / asset / config

15. **README อธิบายผิดทั้งไฟล์** — เขียนว่าเป็นแอป Android/Kotlin (ไม่มี Gradle, ไม่มี Kotlin ในรีโป)
    ⇒ เขียนใหม่: React + TS + Vite + Express, คำสั่งจริง, โครงสร้าง, env, API, deploy

16. **`favicon` 404 ทุกครั้งที่โหลดหน้า** — มี `<link rel="icon" href="/vite.svg">` ซ้อนกับ `/favicon.svg` ที่มีจริง
    ⇒ ลบตัวที่ไม่มี

17. **โหลดฟอนต์ซ้ำ + ผิดชุด** — HTML โหลด *Plus Jakarta Sans* (ไม่มีที่ไหนใช้) ขณะที่ CSS `@import` โหลด Inter/Kanit/Noto Sans Thai (บล็อก CSS parser)
    ⇒ รวมเป็น `<link>` เดียวใน `<head>` ครบ 4 ตระกูลที่ใช้จริง + `display=swap` และลบ `@import` ออกจาก `index.css`

18. **`body class="bg-[#0F1117] text-white"`** ทับสีที่โทเคนกำหนด (`#ECEAF4`)
    ⇒ เหลือ `class="min-h-screen"` ให้ CSS เป็นแหล่งความจริงเดียว

19. **ไฟล์ขยะค้างในรีโป** — `src/services/geminiService.ts.patch` (patch เก่า ไม่ถูก compile)
    ⇒ ลบ (ไฟล์ `fix*.cjs` ที่รากยังเก็บไว้ตามคำสั่งเดิม เพราะอาจเป็นสคริปต์ที่ผู้ใช้ยังใช้)

20. **`tsconfig` ไม่ครอบ `server.ts`** — `tsc --noEmit` ตรวจแค่ `src/` ทำให้บั๊กฝั่งเซิร์ฟเวอร์หลุด
    ⇒ เพิ่ม `tsconfig.server.json` + `npm run typecheck` ตรวจทั้งสองฝั่ง (ใช้ใน CI แล้ว)

21. **Dependency audit** — เริ่มที่ 10 ช่องโหว่ (2 critical, 7 high, 1 moderate)
    ⇒ `npm audit fix` (ไม่ breaking) เหลือ **7** (vite/source-map-js/re2js หมดไป)
    ที่เหลือต้องอัปเกรด major: `firebase` (grpc-js), `vitest`/`tinypool` — ดูหัวข้อ 4

---

## 3. หลักฐานการตรวจ (รันจริงทั้งหมด)

```
npx tsc --noEmit                                  → ผ่าน (src)
npx tsc --noEmit -p tsconfig.server.json          → ผ่าน (server.ts)
npx vitest run                                    → 175 passed / 15 files
npx vite build                                    → ✓ built (~11s), ลบ dist แล้ว
NODE_ENV=production PORT=3100 npx tsx server.ts   → boots, GET / = 200
curl /api/does-not-exist                          → 404 {"error":"Not found"}
curl 70× /api/gemini/test-key                     → 59×400 + 11×429 (limiter ทำงาน)
curl POST /api/gemini/chat-stream (ไม่มีคีย์)      → 400 {"error":"Missing Gemini API Key"}
```

เทสต์ใหม่ในรอบนี้: **+17** (rate limiter 4, NewsCard 4, double-send 1, ที่เหลือจากรอบแชท)

---

## 4. ยังไม่แก้ (ตั้งใจ) — พร้อมเหตุผล

| เรื่อง | ทำไมยังไม่แก้ |
|---|---|
| `firebase` 10 → 9.14 (audit แนะนำ) | เป็น **ดาวน์เกรด major** และแอปใช้ Firestore v11 API อยู่ — ต้องทดสอบ migration แยก |
| `vitest` 4 → 5 (tinypool critical) | กระทบ tooling ทั้งชุด (config, matchers) — ไม่ใช่ runtime ของแอป (dev only) |
| Bundle 1.4 MB (369 kB gzip) | ต้องแยก chunk/ทำ lazy loading ซึ่งเป็นการ refactor ใหญ่ ไม่ใช่บั๊ก |
| `index.html` inline devtools hook + `src/initDevToolsHook.ts` ซ้ำกัน | ทำงานได้และตั้งใจให้ defensive สองชั้น; ลบชั้นใดชั้นหนึ่งเสี่ยงให้ warning เดิมกลับมา |
| `fix*.cjs` ~40 ไฟล์ที่ราก | เป็นสคริปต์ patch เก่า ไม่ถูกเรียกใช้ แต่ลบอาจกระทบประวัติการแก้ของผู้ใช้ — รอผู้ใช้ยืนยัน |
| Backtest สร้างแท่งเทียนจาก `Math.sin()` | อยู่ใน CODE_REVIEW.md เดิม; เป็นการเปลี่ยนความหมายของฟีเจอร์ ต้องให้เจ้าของผลิตภัณฑ์ตัดสิน |
| ธีม Day/Focus Calm + Time-of-Evening | งานฟีเจอร์ ไม่ใช่บั๊ก (อยู่ใน `CALM-SYSTEM-v2-applied.md` §7) |

---

## 5. คำสั่งที่ใช้ตรวจซ้ำ

```bash
cd /home/user/motorboy-ai-auto-api-trading
npm run typecheck && npm test && npx vite build && rm -rf dist
npm run dev        # http://localhost:3000
npm start          # production (ต้อง build ก่อน)
```
