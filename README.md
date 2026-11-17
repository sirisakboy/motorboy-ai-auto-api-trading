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

คัดลอก `.env.example` → `.env` แล้วใส่คีย์ (ไฟล์ `.env` ถูก ignore แล้ว ห้าม commit):

```bash
cp .env.example .env
# GEMINI_API_KEY=...        # ใช้ฝั่งเซิร์ฟเวอร์ (สตรีมแชท, วิเคราะห์ตลาด)
# GEMINI_MODEL=...          # เปลี่ยนโมเดลได้โดยไม่ต้องแก้โค้ด (ดีฟอลต์ gemini-3.8-flash)
# VITE_GEMINI_API_KEY=...   # ฝังลง client — ใช้เฉพาะตอนพัฒนาเท่านั้น (ห้ามใช้บน production)
```

ผู้ใช้ยังใส่คีย์ของตัวเองผ่านหน้า **ตั้งค่า** ได้ (เก็บใน localStorage ของเครื่องนั้น
ไม่ส่งขึ้นคลาวด์) — ดูสถานะจริงได้ที่ `GET /api/gemini/config`

**การเลือกโมเดล:** ระบบอ่าน `GEMINI_MODEL` (ถ้าไม่ตั้งจะใช้ `gemini-3.1-flash-lite`)
และมี fallback chain `gemini-4-hydrogen` เมื่อโมเดลหลักไม่พร้อมใช้งาน
(แก้ที่ `src/server/geminiConfig.ts`)

---

## Deploy

### 1) Google AI Studio / Cloud Run (Node / Bun)
```bash
bun install --frozen-lockfile   # หรือ npm ci
npm run build
NODE_ENV=production PORT=8080 npm start
```

### 2) Cloudflare Workers / Cloudflare Pages
โปรเจกต์รองรับทั้ง **Cloudflare Workers (Static Assets)** และ **Cloudflare Pages + Functions**:
- **Workers (แนะนำ)**: ใช้ `wrangler.jsonc` (`npx wrangler deploy` หลังจาก `npm run build`)
  - ตั้ง Secret ฝั่งเซิร์ฟเวอร์ผ่าน `npx wrangler secret put GEMINI_API_KEY` (หรือ Dashboard > Variables & Secrets)
- **Pages**:
  - Build command: `npm run build`
  - Build output directory: `dist`
  - ไฟล์ `functions/api/[[path]].ts` จะรองรับทุก route `/api/*` (`/api/health`, `/api/yahoo/*`, `/api/gemini/*`, `/api/backtest/candles`) อัตโนมัติ
  - ตั้ง Environment Variable `GEMINI_API_KEY` ใน Cloudflare Pages Settings (ไม่บังคับ หากผู้ใช้กรอกคีย์ในแอปเอง)

