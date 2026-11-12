# AI (Gemini) + Settings Audit — 2026-11-04

ขอบเขต: (1) ปรับปรุงชั้น AI ให้เป็น Gemini ที่ตั้งค่า/สลับโมเดลได้จริง
(2) ตรวจระบบตั้งค่าทั้งหมด รวมถึง "การกำหนดค่า API Key" ว่าถูกต้องหรือไม่

Gate: `tsc` client ✓ · `tsc` server ✓ · `vitest` **335/335 (25 ไฟล์)** ✓ · `vite build` ✓
ไฟล์ใหม่: `src/services/geminiKey.ts`, `src/services/riskProfile.ts`, `src/server/geminiConfig.ts`
+ เทสต์ `geminiConfig.test.ts` (19), `settingsDialog.test.tsx` (7), `riskProfile.test.ts` (2)

---

## 1) AI: จาก "ฮาร์ดโค้ดชื่อโมเดล" → ตั้งค่าได้ + fallback อัตโนมัติ

**ปัญหาเดิม**
- ชื่อโมเดล `gemini-3.8-flash` ถูกฝังไว้ **8 จุด** ใน `server.ts` — Google เปลี่ยนชื่อ/ปลดระวางเมื่อไร
  ระบบ AI ล้มทั้งกระดานด้วย 404 และต้องแก้โค้ด + deploy ใหม่
- `generateWithGroundingFallback()` ตรวจ error ด้วย `raw.includes('429')`
  ซึ่งชนกับข้อความอื่นได้ และ **retry แบบไม่มี search ทุกกรณี** แม้คีย์จะผิด
- error ของแต่ละ route ถูก map ซ้ำ 3 ที่ ด้วย `rawMsg.includes('400')` (false positive ง่ายมาก)

**ที่ทำ**
- `src/server/geminiConfig.ts`
  - `resolveGeminiModel(env)` → อ่าน `GEMINI_MODEL` (trim) ไม่ตั้ง = `gemini-3.8-flash`
  - `buildModelChain()` → `[primary, gemini-3.6-flash, gemini-2.5-flash]` (dedupe)
  - `withModelFallback()` → ไล่โมเดลถัดไป **เฉพาะ** `MODEL_NOT_FOUND` (404)
    คีย์ผิด/โควตา/เน็ตล่ม = โยนต่อทันที ไม่เผา request เพิ่ม
  - `classifyGeminiError()` → `{ kind, httpStatus, code, messageTh, retryable, detail }`
- `server.ts` ใช้ helper เหล่านั้นทุก route (`sentiment`, `analyze-market`, `analyze-news`,
  `holistic-stance`, `synthesize-hourly`, `longterm-project`, `categorize-headlines`,
  `chat-reply`, `chat-stream`, `mascot-line`, `mascot-action`, `test-key`)
- เพิ่ม `GET /api/gemini/config` → `{ model, fallbackModels, serverKeyConfigured }`
  ให้ UI แสดง "โมเดลจริง" แทนการเดา (หน้า Settings เรียก endpoint นี้)
- คืน `temperature` ที่เคยหลุด: mascot-line `0.95`, mascot-action `0.4` (JSON mode), test-key `0.2`

**ข้อความ error ที่ผู้ใช้เห็น** — เลิกส่งข้อความภายใน (`fetch failed`, raw JSON ของ Google)
ออกไปหน้าจอ เปลี่ยนเป็นข้อความไทยตามชนิด:

| kind | HTTP | code | ข้อความ |
|---|---|---|---|
| `MISSING_KEY` | 400 | `missing_gemini_key` | ยังไม่ได้ตั้งค่า Gemini API Key — ไปที่ การตั้งค่า (⚙️) |
| `INVALID_KEY` | 400 | `invalid_api_key` | API Key ไม่ถูกต้องหรือหมดอายุ |
| `PERMISSION_DENIED` | 400 | `permission_denied` | คีย์ไม่มีสิทธิ์ใช้โมเดล/โปรเจกต์ |
| `MODEL_NOT_FOUND` | 502 | `model_not_found` | โมเดลไม่พร้อมใช้งาน (จะลองโมเดลสำรองให้) |
| `QUOTA` | 429 | `quota_exceeded` | เกินโควตา/ถูกจำกัดอัตรา (retryable) |
| `NETWORK` | 502 | `gemini_unreachable` | เชื่อมต่อ Google ไม่ได้ (retryable) |
| `SERVER_ERROR` | 502 | `gemini_unavailable` | บริการ Gemini ขัดข้องชั่วคราว (retryable) |

---

## 2) API Key: **ไม่ตรวจรูปแบบอีกต่อไป** (ตามคำสั่งผู้ใช้)

> "ให้รองรับ api key ทุกประเภท ไม่ต้องมีการกำหนดว่าต้องขึ้นต้นด้วยอะไร
> ถ้า key ผิดมันก็ใช้ไม่ได้อยู่แล้ว"

**นโยบายใหม่** (`src/services/geminiKey.ts`)
- รับ **ทุกสตริงที่ไม่ว่าง** — ไม่เช็ก prefix (`AIza`/`AQ.`), ความยาว, ชุดอักขระ
- ตัดช่องว่างหัว-ท้ายให้ (คีย์ที่ Copy มักติดขึ้นบรรทัดใหม่) แต่ **ไม่แตะตัวกลางคีย์**
- ค่าว่าง = "ยังไม่ได้ตั้งค่า" (มีข้อความบอก) — เป็นเคสเดียวที่บล็อกก่อนยิงเน็ต
- คีย์ที่ผิดจะไปล้มที่ Google แล้วส่ง `INVALID_KEY` กลับมาเป็นภาษาไทย (ไม่ใช่ error ดิบ)

**ที่แก้ตามมา**
| จุด | เดิม | ใหม่ |
|---|---|---|
| `isValidGeminiKey` (server) | ยาว ≥ 15 + ไม่มีช่องว่าง (รับ `"aaaaaaaaaaaaaaaaaaa"` ผ่าน แต่ปฏิเสธคีย์รูปแบบใหม่ในอนาคต) | ใช้ `resolveGeminiKey()` — คีย์ผู้ใช้ → คีย์ ENV → ไม่มี |
| ฟอร์ม Settings | กดบันทึกได้ทุกกรณี (รวมค่าว่าง/มั่ว) ไม่มี feedback | hint สดใต้ช่อง, ปุ่มบันทึก disabled เมื่อว่าง, มีปุ่ม **ลบคีย์** |
| ข้อความผิดพลาด | `เชื่อมต่อไม่สำเร็จ: fetch failed` หลุดถึงผู้ใช้ | ข้อความไทยคงที่ ไม่มีข้อมูลภายใน |
| test-key | ตอบ `searchGrounded: true` เสมอ (client ฮาร์ดโค้ด) | เซิร์ฟเวอร์เป็นผู้รายงานค่าจริง + ส่ง `model`, `keySource` กลับมาด้วย |
| ชื่อโมเดลในข้อความสำเร็จ | ฝัง `Gemini 3.8 Flash` ในสตริง | ใช้ค่าจาก config (`Gemini (gemini-3.8-flash)`) |

**ยืนยันด้วยการยิงจริง (dev server)**

```
POST /api/gemini/test-key {"apiKey":"abc123"}               → 502 gemini_unreachable (ไม่ถูกบล็อกที่รูปแบบแล้ว)
POST /api/gemini/test-key {"apiKey":"my-custom-key-12345"}  → 502 gemini_unreachable
POST /api/gemini/test-key {"apiKey":"aaaaaaaaaaaaaaaaaaa"}  → 502 gemini_unreachable
POST /api/gemini/test-key {"apiKey":""}                     → 400 missing_gemini_key
GET  /api/gemini/config → {"model":"gemini-3.8-flash","fallbackModels":["gemini-3.6-flash","gemini-2.5-flash"],"serverKeyConfigured":false}
```

> ใน sandbox ไม่มี egress จึงได้ `NETWORK`; บนเครื่องจริงคีย์ผิดจะได้
> `400 invalid_api_key` จาก Google โดยตรง — โค้ด map ไว้แล้ว

---

## 3) ผลตรวจระบบตั้งค่า (Settings audit)

### 3.1 บั๊กที่แก้แล้ว

| # | ไฟล์ | ปัญหา | การแก้ |
|---|---|---|---|
| 1 | `SettingsDialog.tsx` | อีเมลส่วนตัว **ฮาร์ดโค้ด** `sirisakkhacha@gmail.com` เป็นค่า fallback | แสดง "โหมดในเครื่อง (ยังไม่ลงชื่อเข้าใช้)" |
| 2 | `SettingsDialog.tsx` | ป้าย `SYNCED` เด้งตลอดแม้ไม่ได้ล็อกอิน | เปลี่ยนเป็น "ลงชื่อเข้าใช้แล้ว" / "เก็บในเครื่อง" ตามสถานะจริง |
| 3 | `SettingsDialog.tsx` | ข้อความ "ซิงค์คีย์ไปยังบัญชี Google", "ข้อมูลทั้งหมดซิงค์ด้วยบัญชี Google", "Price Alert – ซิงค์คลาวด์" — **ไม่จริง** (ระบบเก็บ localStorage ล้วน) | แก้เป็น "เก็บในเครื่องนี้ (localStorage) — ไม่ส่งขึ้นคลาวด์" |
| 4 | `SettingsDialog.tsx` | "Google Search เชื่อมโยงบัญชี Email" สื่อผิด | ระบุตามจริง: ใช้ได้เมื่อคีย์รองรับ + แสดงโมเดลปัจจุบัน |
| 5 | `SettingsDialog.tsx` | Price Alert รับราคา ≤ 0 / symbol ว่าง แล้วเงียบ | validate + แจ้ง error ใต้ฟอร์ม (`role="alert"`) |
| 6 | `SettingsDialog.tsx` | ป้าย "($ USD)" แต่ผู้ใช้โหมด THB | ระบุชัด "USD — แปลงเป็น ฿ อัตโนมัติเมื่อสลับสกุลเงิน" |
| 7 | `SettingsDialog.tsx` | Help modal ไม่มี `useModalA11y`, `navigator.clipboard` ไม่มี guard | ผูก hook + Escape/scroll-lock + try/catch |
| 8 | `App.tsx` | `handleSaveApiKey` ไม่ trim | trim ก่อนบันทึก/ตั้ง state |
| 9 | `SettingsDialog.tsx` | ระดับความเสี่ยงถูกบันทึกแต่ **ไม่มีผลกับอะไรเลย** | เชื่อมเข้า `RiskCalculatorModal` เป็นค่าเริ่มต้น Risk % (0.5 / 1 / 2%) — เป็น "ค่าแนะนำ" ไม่ใช่คำสั่ง |

### 3.2 ข้อสังเกตที่ยังคงอยู่ (ต้องตัดสินใจเชิงผลิตภัณฑ์)

1. **คีย์ถูกเก็บเป็น plaintext ใน `localStorage`** (`trading_engine_settings_<uid>`)
   — XSS ใด ๆ อ่านคีย์ได้ ทางเลือก: เข้ารหัสด้วย WebCrypto + passphrase,
   เก็บเฉพาะ session, หรือย้ายไปเก็บฝั่งเซิร์ฟเวอร์ต่อผู้ใช้ (ต้องมี auth)
   *ยังไม่แก้ในรอบนี้เพราะกระทบ UX การใช้งานข้ามเครื่อง*
2. **คีย์ของบัญชีก่อนยังอยู่ในเครื่องหลังสลับผู้ใช้** — พิจารณาล้าง เมื่อ `user` เปลี่ยน
3. `psychologySettings.dailyLimitRiskPct` ยังไม่ถูกใช้ที่ไหน (ตอนนี้เป็นเพียงข้อมูล)
   — ควรใช้เป็นเพดานใน Risk Calculator หรือเอาออกจาก type
4. `enableEmotionalCheckIn` ยังไม่มี behavioral hook (มี UI แต่ไม่มี trigger)
5. ไม่มีหน้า "เพิกถอน/หมุนคีย์" — ผู้ใช้ต้องไปลบที่ Google AI Studio เอง

---

## 4) ไฟล์ที่แตะในรอบนี้

```
server.ts                              ใช้ geminiConfig + classify/send error + /api/gemini/config
src/server/geminiConfig.ts             (ใหม่) model chain, error mapping, key resolution
src/services/geminiKey.ts              (ใหม่) validate แบบไม่บังคับรูปแบบ + mask
src/services/riskProfile.ts            (ใหม่) tolerance → risk% default
src/services/geminiService.ts          test-key ใช้ค่าจริงจากเซิร์ฟเวอร์ ไม่ leak
src/components/SettingsDialog.tsx      ฟอร์มคีย์, copy, alert, a11y, psychology
src/components/RiskCalculatorModal.tsx รับ riskTolerance เป็นค่าเริ่มต้น
src/App.tsx                            trim คีย์ + ส่ง riskTolerance
.env.example / README.md               เพิ่ม GEMINI_MODEL
src/__tests__/{geminiConfig,settingsDialog,riskProfile}.test.*  (ใหม่ 28 เคส)
```
