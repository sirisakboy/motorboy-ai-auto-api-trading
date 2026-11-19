# MotorBoy Trading Engine Pro

เว็บแอปวิเคราะห์ตลาดหลายสินทรัพย์ + AI Co-Pilot ("น้องมอเตอร์บอย") สร้างด้วย **React + TypeScript + Vite** และเสิร์ฟผ่าน **Express 5** โดยมีสไตล์ตาม **MotorBoy Calm System v2.0**

> หมายเหตุ: README เดิมอธิบายว่าเป็นแอป Android/Kotlin ซึ่งไม่ตรงกับโค้ดในรีโปนี้ (ไม่มี Gradle/Android module) — แก้ให้ตรงแล้ว

---

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000  (Express + Vite middleware)
```

คำสั่งทั้งหมด:

| คำสั่ง | ทำอะไร |
|---|---|
| `npm run dev` | รัน dev server (Express + Vite HMR) ที่พอร์ต 3000 |
| `npm run build` | `tsc --noEmit` + `vite build` → `dist/` |
| `npm start` | รัน production server ด้วย `tsx server.ts` (ต้องมี `dist/` จากการ build ก่อน) |
| `npm test` | เทสต์ทั้งหมดด้วย Vitest (166 เทสต์ / 14 ไฟล์) |
| `npm run typecheck` | ตรวจ TypeScript ทั้งฝั่ง client (`tsconfig.json`) และ server (`tsconfig.server.json`) |
| `npm run lint` | เหมือน typecheck (โปรเจกต์ใช้ tsc เป็นด่านเดียว) |

---

## Environment

คัดลอก `.env.example` → `.env` แล้วใส่เฉพาะคีย์ Gemini (ไฟล์ `.env` ถูก ignore แล้ว ห้าม commit):

```bash
cp .env.example .env
# GEMINI_API_KEY=...        # ใช้ฝั่งเซิร์ฟเวอร์ (ตัวแปร ENV เดียวที่ระบบรองรับ)
```

ผู้ใช้ยังใส่คีย์ของตัวเองผ่านหน้า **ตั้งค่า** ได้ (เก็บใน localStorage ของเครื่องนั้น
ไม่ส่งขึ้นคลาวด์) — ดูสถานะจริงได้ที่ `GET /api/gemini/config`

**โมเดลเริ่มต้น:** `gemini-3.1-flash-lite` พร้อม fallback chain `gemini-4-hydrogen`
(ตั้งค่าใน `src/server/geminiConfig.ts` โดยไม่พึ่ง `.env` เพิ่มเติม)

---

## Deploy (Cloudflare Workers / Cloudflare Pages / Node)

โปรเจกต์ถอดบริการ Google อื่น ๆ (Firebase, Google Drive, Gmail, Calendar, Google Fonts) ออกทั้งหมดแล้ว เหลือเฉพาะ Gemini API ผ่าน `GEMINI_API_KEY` เท่านั้น:

- **Cloudflare Workers (แนะนำ)**:
  ```bash
  npm run build
  npx wrangler secret put GEMINI_API_KEY   # ตั้งค่า secret เดียวบน Cloudflare
  npx wrangler deploy
  ```
- **Cloudflare Pages**:
  - Build command: `npm run build`
  - Build output directory: `dist`
  - ไฟล์ `functions/api/[[path]].ts` จะรองรับ `/api/*` (`/api/health`, `/api/yahoo/*`, `/api/gemini/*`, `/api/backtest/candles`) อัตโนมัติ
  - ตั้ง Secret `GEMINI_API_KEY` ใน Cloudflare Pages Settings (ไม่บังคับ หากผู้ใช้กรอกคีย์ในแอปเอง)
- **Node / Express**:
  ```bash
  bun install --frozen-lockfile
  npm run build
  npm start
  ```

