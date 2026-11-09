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
# VITE_GEMINI_API_KEY=...   # ฝังลง client — ใช้เฉพาะตอนพัฒนาเท่านั้น
```

ผู้ใช้ยังใส่คีย์ของตัวเองผ่านหน้า **ตั้งค่า** ได้ (เก็บใน localStorage ของเครื่องนั้น)

---

## โครงสร้าง

```
server.ts                  Express API (Gemini proxy, SSE streaming, rate limit, static SPA)
src/
  components/              UI ทั้งหมด (การ์ดตลาด, modal, แชท, มาสคอต)
    chat/                  ชิ้นส่วนแชท AI (bubble, composer, markdown)
  services/                การเรียกข้อมูล + AI (apiClient, chatStreamClient, geminiService…)
  mascot/                  ตัวละครน้องมอเตอร์บอย (poses, moods, endings model)
  server/                  โค้ดฝั่งเซิร์ฟเวอร์ที่แยกมาเทสต์ได้ (rate limiter)
  __tests__/               Vitest (jsdom) — 166 เทสต์
docs/
  brand/                   Brand Book v2.0 (แหล่งอ้างอิงสี/โทเคน)
  CALM-SYSTEM-v2-applied.md สรุปการลงสีในโปรเจกต์
  CHAT-UPGRADE.md          สรุปการอัปเกรดแชท AI v2
  DEEP-REVIEW-2026-11.md   ผลรีวิวเชิงลึก + สิ่งที่แก้
```

---

## API หลัก

| Route | ใช้ทำอะไร |
|---|---|
| `POST /api/gemini/chat-stream` | สตรีมคำตอบแชท (SSE: `meta → delta… → done`) |
| `POST /api/gemini/chat-reply` | คำตอบแบบก้อนเดียว (fallback) |
| `POST /api/gemini/analyze-market` · `analyze-news` · `holistic-stance` | วิเคราะห์ตลาด/ข่าว |
| `POST /api/gemini/mascot-line` | ประโยคสั้นของมาสคอต |

ทุก route ใต้ `/api` ถูกจำกัด 60 คำขอ/นาทีต่อ IP และรับ body ได้ไม่เกิน 1 MB

---

## แบรนด์

- สี/โทเคนทั้งหมดมาจาก Brand Book v2.0 (`docs/brand/`) — ดู `src/index.css` (บล็อก `:root`)
- กติกาหลัก: ลาเวนเดอร์ `#7C6CFF` เป็นสีแบรนด์, ห้ามแดงสด, ตัวอักษรบนพื้นลาเวนเดอร์ใช้ `#0F1117`, ไม่มีอะไรกะพริบ, ทุกคำตอบ AI ต้องบอกว่าดูจากอะไร + เหตุผล 3 ข้อ

---

## Deploy

```bash
npm ci
npm run build
NODE_ENV=production PORT=8080 npm start
```

ไม่ต้องใช้ Dockerfile — Express เสิร์ฟ `dist/` เอง (SPA fallback ยกเว้น path `/api/*` ที่ตอบ JSON 404)
