# FUSION CORE — deep test & review (2026-11)

ขอบเขตที่รีวิว: `src/fusion/*` (TypeScript ที่รันจริง) + `motorboy_production/02_whale.py`,
`signals.py`, `tests/` (reference implementation) และตรวจทั้งรีโปว่า **ไม่มีทางสั่งออเดอร์**

---

## 0. ขอบเขตผลิตภัณฑ์ (ย้ำก่อนทุกอย่าง)

> **แอปนี้คือ "ผู้ช่วยวิเคราะห์/ตัดสินใจ" ไม่ใช่ระบบเทรดออโต้**
> Fusion Core ผลิต *สัญญาณ* (score/confidence/reason) เท่านั้น ไม่มีที่ไหนในรีโป
> ที่ส่งคำสั่งซื้อขายได้ — การตัดสินใจกดเทรดยังเป็นของผู้ใช้ 100%

หลักฐานจากการตรวจ (2026-11):

```
grep -rniE "placeOrder|createOrder|/order|api/v3/order|executeTrade|submitOrder|autoTrade" src server.ts
→ ไม่พบผลลัพธ์ (0 matches)
grep -rnE "fetch\(|axios|XMLHttpRequest|WebSocket|apiClient" src/fusion/
→ ไม่พบผลลัพธ์ (0 matches) — โมดูลคำนวณล้วน
```

และมี **guard test** ผูกไว้ทั้งสองภาษา (`fusionWhale.test.ts` และ `test_02_whale.py`)
ถ้าใครเผลอเติม network call / ชื่อฟังก์ชันสั่งออเดอร์ / `apiKey` เข้าไปในโมดูล เทสต์จะแดงทันที

เหตุผลที่ต้องย้ำ: ความเสี่ยงจาก signal ที่ผิดยังสูง (โดยเฉพาะตอนใช้ proxy จาก
ราคา/วอลุ่ม) — ระบบจึงต้อง *แนะนำ* และให้คนตัดสิน ไม่ใช่กดแทน

---

## 1. สิ่งที่ตรวจแล้ว "ไม่พบปัญหา"

| ด้าน | ผล |
| --- | --- |
| ช่วงค่า interface | `score` ∈ {−2..2}, `confidence` ∈ 0..100 ถูกบังคับที่ `createModuleSignal` (throw ถ้าหลุด) |
| deterministic | input เดิม → ผลเดิม (ไม่มี time/random ในเส้นทางคำนวณ) |
| ไม่ผูกชื่อสินทรัพย์ | ไม่มีชื่อเหรียญ/หุ้นใน logic; เทสต์ยืนยันว่าสลับ symbol แล้วผลเท่าเดิม |
| ข้อมูลไม่ครบ | coverage ลด → confidence ลด (ไม่เติม 0 หลอก ๆ) |
| สัญญาณสวนทาง | total หักล้างกัน → ไม่ได้ score สุดโต่ง |
| asset_type แปลก | ตกไป `default` ไม่ throw |
| ค่าที่เป็น string | `'$12.5M'`, `'3.5%'`, `'1,200'` อ่านได้ |
| ไม่มีข้อมูล | score 0 / confidence 0 + บอกเหตุผล (ไม่เดา) |

---

## 2. ปัญหาที่พบ และแก้แล้วในรอบนี้

| # | ระดับ | ปัญหา | การแก้ |
| --- | --- | --- | --- |
| 1 | กลาง | `toNumber('M')` คืน `0` (ควรเป็น `null`) — ค่าขยะจาก API จะกลายเป็น "ศูนย์" เงียบ ๆ | ต้องมีตัวเลขนำหน้าสuffixเสมอ + เทสต์ `'M'/'B'/'K'` |
| 2 | กลาง | `createModuleSignal()` บังคับ `symbol.toUpperCase()` ต่างจาก Python → ค่าที่ส่งข้ามภาษาไม่ตรงกัน | ย้ายการ upper ไปที่ชั้นวิเคราะห์ (`analyzeWhale`) เหมือน Python |
| 3 | ต่ำ | `source` จำกัด 160 ตัวอักษร แต่ Python 120 → ข้อมูลที่รับกลับมาไม่ตรงกัน | ปรับเป็น 120 เท่ากัน |
| 4 | **สูง** | `analyzeWhaleFromApp({symbol:''})` **throw** — แถวที่ยังโหลดไม่เสร็จใน UI จะทำให้หน้าจอพัง | คืนสัญญาณกลาง + เหตุผล "ยังไม่มีชื่อสินทรัพย์" |
| 5 | ต่ำ | ฟังก์ชัน `totalled()` เป็น no-op ที่หลงเหลือจากการเขียน | ลบออก |
| 6 | กลาง | proxy จากราคา/วอลุ่มให้ score 0 แม้ราคาขยับ ±2.35% (สเกลของ profile `default` ไม่ได้ออกแบบมาสำหรับ proxy) และไม่มีการลดความมั่นใจ | เพิ่ม `PROXY_FIELDS` (สเกล ±5% / $50M) + `PROXY_CONFIDENCE_FACTOR = 0.55` |
| 7 | **สูง** | parity มีแค่ 9 เคสที่เขียนมือ — พอร์ตเพี้ยนในเคสอื่นจะไม่ถูกจับ | เพิ่ม **parity sweep 40 เคส** จาก Python (`parity_export.py`, seed คงที่) ตรวจ 6 ค่า + ข้อความ reason |
| 8 | กลาง | ไม่มี guard กันไม่ให้มี network/order code หลุดเข้ามาในโมดูลในอนาคต | guard test สแกนซอร์สทั้ง TS และ Python |

---

## 3. ตัวเลขที่ยืนยันได้ตอนนี้

```
npx tsc --noEmit && npx tsc --noEmit -p tsconfig.server.json   ✓
npx vitest run                    → 288 tests / 21 files        ✓
  └ fusionWhale.test.ts           → 44 tests (9 เคสมือ + 40 เคส sweep + safety)
  └ ชุดเดิม (mascot/fusion ไม่แตะ)  → 244 tests
npm run build                     → vite build ✓
python -m unittest discover -s motorboy_production/tests → 21 tests ✓
python motorboy_production/02_whale.py --selftest        → 94/94 ✓
```

ขั้นตอนเมื่อแก้สูตร (ต้องทำทั้งสองฝั่ง):

```bash
python motorboy_production/parity_export.py   # สร้าง fixture ใหม่จาก Python
npx vitest run src/__tests__/fusionWhale.test.ts
```

---

## 4. ความเสี่ยงที่ยัง "ยอมรับไว้" (ต้องรู้ก่อนใช้จริง)

1. **proxy ไม่ใช่โฟลว์จริง** — `net_flow_usd` จาก turnover × %เปลี่ยน เป็นเพียง
   หลักฐานเชิงโมเมนตัม ติดป้าย `proxy:price+volume` และลดความมั่นใจ ×0.55 แล้ว
   แต่ก็ยังไม่ควรใช้ตัดสินไม้ใหญ่
2. **`PROXY_CONFIDENCE_FACTOR` ยังไม่ผ่านแบ็คเทส** — เป็นค่าที่ตั้งจากดุลยพินิจ
   (0.55) ต้องทบทวนเมื่อมี `04_backtest` และห้ามใช้เป็นเหตุผลเพิ่มน้ำหนักจริง
3. **ยังไม่มี 03_chart / 01_news / 04_backtest / fusion_core ใน TS** — ตอนนี้จึงยัง
   ไม่มี "คำตัดสิน" (BUY/WAIT/…) เกิดขึ้นจากระบบ ผลิตได้แค่สัญญาณเงินใหญ่
4. **ยังไม่ผูกกับ UI** — ไม่มีหน้าจอไหนอ่าน `src/fusion` ความเสี่ยงต่อผู้ใช้ = 0
   ในสถานะปัจจุบัน
5. **fixture ต้องรันเอง** — `parity_export.py` ยังไม่ได้อยู่ใน CI (ถ้าจะให้แน่น
   ควรเพิ่มเป็น step ใน CI ฝั่งเซิร์ฟเวอร์)
6. **Python/TS สองสำเนา** — ตั้งใจให้เป็น reference/คู่เทียบ ถ้าอนาคตจะเลิกใช้ Python
   ต้องลบฝั่งหนึ่งทิ้ง ไม่ปล่อยให้ค้างสองที่โดยไม่มีเทสต์

---

## 5. กติกาที่จะยึดต่อไป

- ทุกโมดูลใหม่ (chart/news/backtest) ต้อง **ไม่มี network call ในตัว** — รับข้อมูลเข้าทาง parameter
  (adapter เป็นคนไปเอามา) เพื่อให้เทสต์ได้และไม่มีผลข้างเคียง
- โมดูลลูก **ห้ามเรียกกันเอง** และห้ามตัดสินใจแทนหัวหน้า (สเปกข้อ 2)
- ค่าใดที่เป็น "ดุลยพินิจ" (เช่น deadzone, factor) ต้องเขียนกำกับว่ายังไม่ผ่านแบ็คเทส
- ก่อนเพิ่มอะไรที่แตะเงิน/ออเดอร์: **หยุดและถามเจ้าของก่อน** — ค่าเริ่มต้นคือ "ไม่ทำ"
