# REVIEW — pull จาก `main` (2026-11-11): Gemini key validation + UX

## 0. สรุปสิ่งที่ดึงเข้ามา

`main` มี 2 commit ใหม่หลัง merge PR #1 และ merge เข้ามาในสาขาทำงานแบบไม่มี conflict:

| commit | เนื้อหา |
| --- | --- |
| `4475285` | `GEMINI_MODEL` → `gemini-3.8-flash` · เพิ่ม `isValidGeminiKey()` ฝั่งเซิร์ฟเวอร์ · ปรับ `package-lock.json` |
| `e1001ac` | SettingsDialog: ปุ่ม/ม็อดัล "วิธีรับ API Key" + รูปคู่มือ 548 KB · ข้อความ error ที่บอกทางแก้ |

ไฟล์ที่เปลี่ยน: `server.ts` (+56/−?) · `src/components/SettingsDialog.tsx` (+194) ·
`src/services/aiChatService.ts` (แก้ log) · `package-lock.json` · รูปใหม่ 1 ไฟล์

## 1. ของดีที่ควรเก็บไว้

- ข้อความ error ภาษาไทยบอก **ทางแก้** (ไปที่ ⚙️ เพื่อใส่คีย์ใหม่) ดีกว่าการโยน error ดิบของ Google
- `rel="noopener noreferrer"` บนลิงก์ภายนอก, `aria-label` บนปุ่มไอคอน, `type="button"` ครบ
- ตรวจคีย์ที่ **เซิร์ฟเวอร์** (ไม่ใช่แค่ client) — ถูกต้องตามหลัก "อย่าเชื่อ client"
- `z-60` ใช้ได้จริงกับ Tailwind v4 (ยืนยันจาก CSS ที่ build ออกมา: `z-index:60`)

## 2. ⛔ Blocker — เจอและแก้แล้ว

**`npm ci` พังทั้งรีโป** หลัง pull (ทดสอบจริง: `npm ci --dry-run` → `EUSAGE`)

```
Invalid: lock file's @google/genai@2.21.0 does not satisfy @google/genai@2.32.0
Missing: vitest@3.2.7 / jsdom@30.1.3 / @testing-library/react@16.3.3 / zustand@5.1.0 …
```

`package-lock.json` บน `main` ถูกลบ dependency ออก 1,185 บรรทัด (ทั้งชุดเทสต์และ
`zustand` ที่แอปใช้จริง) แต่ `package.json` ยังประกาศ `@google/genai: ^2.32.0` อยู่
→ ใคร clone แล้ว `npm ci` (CI/deploy) จะติดตั้งไม่ได้เลย

สิ่งที่ผมทำ: `npm install --package-lock-only` (ไม่แตะ `package.json`, ไม่เปลี่ยนเวอร์ชันที่ประกาศ)
แล้วยืนยัน `npm ci` ผ่านจริง (`added 358 packages`) — lock กลับมาเท่ากับก่อน merge เกือบทั้งหมด (ต่าง 76 บรรทัด)

> ถ้าเจตนาคือ **ดาวน์เกรดเป็น 2.21.0 จริง** ต้องแก้ `package.json` เป็น `^2.21.0` แล้ว generate lock ใหม่
> (ตอนนี้ commit message บอก downgrade แต่ manifest ไม่ได้แก้ → สองไฟล์ขัดกัน)

## 2.1 เจอบั๊กในโค้ดของเราเองระหว่างรีวิว — แก้แล้ว

ทดสอบ endpoint จริงด้วยคีย์ปลอม (ยาว ≥15 ไม่มีช่องว่าง จึงผ่าน `isValidGeminiKey`)
แล้วพบว่า **error ภายในหลุดออกไปถึง client**:

```
POST /api/gemini/mascot-action  →  {"error":"fetch failed"}
POST /api/gemini/mascot-line    →  {"error":"..."}   (รูปแบบเดียวกัน)
```

`error?.message || '...'` ส่งข้อความจากระบบ (ชื่อ host, ข้อผิดพลาด network) ออกไป
ทั้งที่ client ไม่ได้ใช้ข้อมูลนี้ และทำให้แยกไม่ออกว่าล้มเพราะอะไร

แก้เป็นรหัสคงที่ + log ฝั่งเซิร์ฟเวอร์: `mascot_action_failed` / `mascot_line_failed`
(ยืนยันหลังแก้: 502 + รหัสคงที่ทั้งสอง endpoint)

## 3. ⚠️ ควรแก้ (ยังไม่แตะ — รอเจ้าของตัดสิน)

| # | ระดับ | ที่ | ปัญหา | ข้อเสนอ |
| --- | --- | --- | --- | --- |
| 1 | **สูง** | `server.ts:694`, `server.ts:911` | `error?.status === 400` ถูกตีความเป็น "API Key ไม่ถูกต้อง" — 400 ของ Gemini เกิดได้จาก prompt ผิด, safety block, โมเดลไม่มี → ผู้ใช้จะได้คำแนะนำผิด และ log จริงหาย | เช็คเฉพาะ marker: `API key not valid` / `API_KEY_INVALID` / `API_KEY_INVALID` reason; ที่เหลือคืน error เดิม |
| 2 | กลาง | `server.ts` (mascot-line, mascot-action) | ถอด `temperature` ออกทั้งสองจุด (0.95 → default ~1.0, **0.4 → default**) — mascot-action ใช้ JSON mode ถ้า temp สูงขึ้น args จะเพี้ยนบ่อยขึ้น (แม้เราตรวจซ้ำสองชั้น) | คืน `temperature: 0.4` ให้ mascot-action และ ~0.9 ให้ mascot-line หรือย้ายเป็น env |
| 3 | กลาง | `server.ts:33` | `GEMINI_MODEL = 'gemini-3.8-flash'` ฝังในโค้ด — ถ้าชื่อโมเดลไม่ถูก ทุก AI endpoint พังพร้อมกันโดยไม่มีที่ให้แก้เร็ว | `process.env.GEMINI_MODEL ?? 'gemini-3.8-flash'` |
| 4 | กลาง | `SettingsDialog.tsx` (ม็อดัลใหม่) | ไม่ได้ใช้ `useModalA11y` เหมือน dialog หลัก → ไม่มี Esc, ไม่ล็อกโฟกัส, ไม่คืนโฟกัส, ซ้อน `aria-modal` | เรียก `useModalA11y({ onClose, enabled: isHelpModalOpen })` |
| 5 | กลาง | `SettingsDialog.tsx:680` | `navigator.clipboard.writeText(...)` ไม่มี guard/`.catch` — บน http หรือสิทธิ์ถูกปฏิเสธจะ throw และปุ่มยังขึ้น "คัดลอกลิงก์แล้ว" | `await navigator.clipboard?.writeText(...).catch(...)` แล้วโชว์สถานะตามจริง |
| 6 | ต่ำ | `src/assets/images/gemini_api_guide_*.jpg` | รูป 548,630 ไบต์ถูก import เข้า bundle → ออกที่ `dist/assets/…jpg` (ยืนยันแล้ว) โหลดทุกครั้งที่เปิดหน้าตั้งค่า | ย้ายไป `public/images/` หรือแปลงเป็น WebP/บีบอัด (~<150 KB) หรือ `import()` ตอนเปิดม็อดัล |
| 7 | ต่ำ | `server.ts:36` | `isValidGeminiKey` = ยาว ≥15 และไม่มีช่องว่าง → `"aaaaaaaaaaaaaaa"` ผ่าน ความหมาย "validate format" จึงอ่อนกว่าที่ชื่อบอก (แต่ปลอดภัยเพราะยังต้องผ่าน Google จริง) | ถ้าจะเข้ม: รับ prefix `AIza` หรือ `AQ.` แต่ควรมี fallback เผื่อ Google เปลี่ยนรูปแบบ |
| 8 | ต่ำ | `SettingsDialog.tsx` (ใหม่) | ใช้ `text-white` และ `bg-[#141417]` (พิมพ์คลาดจาก `#141725`) ในโค้ดใหม่ — ขัดกับ Calm token `#ECEAF4`/`#141725` | เก็บกวาดเฉพาะจุดที่แก้ (ไม่ใช่ sweep ทั้งไฟล์) |

## 4. ผล gate หลัง merge (รันจริง)

```
npm ci                            ✓ 358 packages
npx tsc --noEmit                  ✓
npx tsc --noEmit -p tsconfig.server.json ✓
npx vitest run                    ✓ 288 tests / 21 files
npm run build                     ✓ (dist js 1,474.88 kB / gzip 380.53 kB)
python -m unittest discover        ✓ 21 tests · 02_whale --selftest 94/94
```

ผลข้างเคียงที่วัดได้: bundle ใหญ่ขึ้น ~6.9 KB (โค้ด SettingsDialog) + รูป 548 KB
ที่ถูกเสิร์ฟแยกเมื่อเปิดหน้าตั้งค่า

## 5. ไม่แตะอะไรในงานนี้

งาน Fusion Core (`src/fusion`, `motorboy_production`) ไม่ชนกับ commit ที่ pull มาเลย —
เทสต์ยังเขียวครบ และไม่มีการแก้ไฟล์ของทีม Gemini ในรอบนี้ (ยกเว้น lockfile ที่พังจริง)

---

# รอบที่ 2 — pull `ad8c6e6` (Google Search grounding fallback)

## 6.1 สิ่งที่เข้ามา

| ไฟล์ | เนื้อหา |
| --- | --- |
| `server.ts` (+135/−62) | `generateWithGroundingFallback()` — ลอง `tools:[{googleSearch}]` ก่อน ถ้าเจอ 429/RESOURCE_EXHAUSTED/quota → ยิงใหม่แบบไม่มี search · `/api/gemini/test-key` มี fallback สองชั้น + ข้อความ error แยกตามสาเหตุ (429 / key ผิด / 403) |
| `src/components/SettingsDialog.tsx` | ย่อ label เป็น "Google Gemini API Key" + เปลี่ยนแถวเป็น `flex-col sm:flex-row` (แก้การเบียดบนจอเล็ก) |
| `public/assets/aistudio/Screenshot_2026-11-11-…png` | รูป 250,160 ไบต์ |

ของดี: fallback นี้แก้ปัญหา 429 ของคีย์ฟรีได้ตรงจุด และข้อความบอกสาเหตุ (โควตา / คีย์ผิด / สิทธิ์)
เป็นการยกระดับ UX จริง · การย้าย label เป็น flex-col แก้ปัญหา layout บนมือถือได้ถูกต้อง

## 6.2 สิ่งที่พบในรอบนี้

| # | ระดับ | ที่ | ปัญหา |
| --- | --- | --- | --- |
| 1 | กลาง | `server.ts:201` | `rawMsg.includes('400')` → ข้อความอะไรก็ได้ที่มีเลข 400 (เช่น "1400 tokens") จะถูกสรุปเป็น "API Key ไม่ถูกต้อง" |
| 2 | กลาง | `server.ts:201, 713, 933` | ตรรกะ "400 == คีย์ผิด" ถูกคัดลอกไว้ **3 ที่** — แก้ที่ไม่เดียวจะไม่ตรงกัน (ควรมี `isGeminiKeyError(err)` ตัวเดียว) |
| 3 | กลาง | `server.ts` (test-key) | fallback ชั้นใน retry **ทุก error** ไม่ใช่เฉพาะ 429 → คีย์ผิดจะยิง Google 2 ครั้ง (ช้า + กินโควตา) ควรเช็ค key-invalid ก่อนแล้วค่อย fallback |
| 4 | ต่ำ | `server.ts` (test-key) | ยังส่งข้อความภายในออกไป: ทดสอบจริงแล้วได้ `"เชื่อมต่อไม่สำเร็จ: fetch failed"` (HTTP 500) — ควรใช้ข้อความคงที่ + log |
| 5 | ต่ำ | `generateWithGroundingFallback` | retry ทันทีโดยไม่มี backoff และไม่บอกผู้เรียกว่าคำตอบ "ไม่มี search" (มีแค่ test-key ที่รู้) |
| 6 | ต่ำ | `public/assets/aistudio/*.png` | 250 KB **ไม่มีโค้ดอ้างถึงเลย** (grep ไม่พบ) — ไฟล์ตายในรีโป ควรลบหรือเอาไปใช้แทนรูปในม็อดัลคู่มือ |
| 7 | ต่ำ | `server.ts` (ข้อความสำเร็จ) | ฝังชื่อรุ่นในข้อความผู้ใช้ "เชื่อมต่อ Gemini 3.8 Flash สำเร็จ" — พอเปลี่ยนโมเดล ข้อความจะโกหก และยังไม่มี `process.env.GEMINI_MODEL` ให้ override |

## 6.3 สถานะหลัง merge รอบ 2

```
npx tsc --noEmit / -p tsconfig.server.json   ✓
npx vitest run                               ✓ 288 tests / 21 files
npm run build                                ✓
GET /                                        ✓ 200
POST /api/gemini/mascot-action (คีย์ปลอม)     ✓ 502 {"error":"mascot_action_failed"}
POST /api/gemini/test-key (คีย์ปลอม)          ⚠ 500 {"success":false,"text":"เชื่อมต่อไม่สำเร็จ: fetch failed"}
```

แถวสุดท้ายคือข้อ 4 — ข้อความภายในยังหลุด (ต่างจาก mascot endpoints ที่ปิดแล้วในรอบก่อน)
