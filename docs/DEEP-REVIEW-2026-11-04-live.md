# Deep Review — ของจริงบน autorboy.ai.studio (2026-11-04)

รีวิวจากหน้าเว็บที่ deploy จริง (ไม่ใช่แค่โค้ด) แล้วแก้ที่ต้นเหตุ
Branch: `arena/18d276cd-motorboy-ai-auto-api-trading` · ฐาน: `main @ c747423`

Gate: `tsc` client+server ✓ · `vitest` **343/343 (26 ไฟล์)** ✓ · `vite build` ✓

---

## 0) หลักฐานจากหน้าเว็บจริง (ก่อนแก้)

ข้อความที่ดึงได้จาก https://autorboy.ai.studio ตอนรีวิว:

```
BTC  $71,692.00  LONG  SL: $90,364.33   TP: $96,273.73
ETH  $2,010.93   LONG  SL: $3,360.74    TP: $3,530.07
SOL  $81.71      LONG  SL: $203.94      TP: $227.91
XRP  $1.03       SHORT SL: $2.51        TP: $2.43
SHIB $0.00000429 LONG  SL: $0.00002377  TP: $0.00002585

พอร์ตย่อตัวแรงกว่าปกติ: 8 ตัวลงเกินเกณฑ์ [SHIB -85.65%, SOL -67.41%, XRP -65.39% +5]
ดึงข้อมูล Binance 1D Klines จริง ... ○ ออฟไลน์ • BTC (ประเมินเทคนิคัล)
```

**การวินิจฉัย:** ตัวเลข SL/TP ทั้งหมดคำนวณจาก "ราคาตั้งต้นปลอม" ไม่ใช่ราคาที่การ์ดแสดง

| เหรียญ | ราคาที่แสดง | SL ที่แสดง | ราคาตั้งต้นในโค้ด | ยืนยัน |
|---|---|---|---|---|
| BTC | 71,692 | 90,364.33 | `CRYPTO_INITIAL.price = 92450` | 92,450 × (1−2.25%) = 90,364 ✓ |
| ETH | 2,010.93 | 3,360.74 | 3,420.5 | 3,420.5 × (1−1.74%) = 3,360 ✓ |
| SOL | 81.71 | 203.94 | 212.4 | 212.4 × (1−4%) = 203.9 ✓ |
| SHIB | 0.00000429 | 0.00002377 | 0.0000245 | 0.0000245 × 0.97 = 0.0000238 ✓ |

และ SHIB −85.65% มาจาก `KNOWN_PEAKS.SHIB = 0.0000350` (ATH ปี 2021) หารด้วยราคาปัจจุบัน
→ ไม่ใช่ drawdown ของ "พอร์ตผู้ใช้" เลย

---

## 1) Critical — SL/TP ผิดฝั่ง (LONG ที่ SL สูงกว่าราคา)

**Root cause (3 ชั้น ซ้อนกัน):**
1. `CRYPTO_INITIAL` ฝังราคาปลอม (BTC 92,450 / SHIB 0.0000245) ใช้เป็น state เริ่มต้น
2. `generateRealSignals` มี fallback ตารางราคาสมมติเมื่อ `coin.price === 0`
3. `signals` เป็น state ที่อัปเดตทุก 15 วิ → การ์ดใช้ `coin.price` สด แต่ SL/TP มาจากสัญญาณที่สร้างตอนราคายังเป็นค่าปลอม

**ผลที่ผู้ใช้เห็น:** LONG ราคา $71,692 แต่ SL $90,364 (ขาดทุนทันทีถ้าทำตาม) และ `change` −2.99% แต่ `reason` เขียน +2.35%
(สองฟิลด์มาจากคนละแหล่งข้อมูล)

**แก้ที่ต้นเหตุ ไม่ใช่แค่ซ่อนใน UI:**

```ts
// src/services/apiClient.ts
export const CRYPTO_INITIAL: CryptoCoin[] = [
  { id: 'bitcoin', symbol: 'BTC', ..., price: 0, change: 0 },
  // ... price = 0 แปลว่า "ยังไม่รู้ราคา" ไม่ใช่ "92,450"
];

function isUsablePrice(price: unknown): price is number {
  return typeof price === 'number' && Number.isFinite(price) && price > 0;
}

export function generateRealSignals(coins: CryptoCoin[]): TradingSignal[] {
  return coins.filter((coin) => isUsablePrice(coin.price)).map(...); // ไม่มีราคา = ไม่มีสัญญาณ
}
```

```tsx
// src/App.tsx — สัญญาณกลายเป็น derived state (ไม่มีทาง stale)
const signals: TradingSignal[] = useMemo(() => generateRealSignals(cryptoList), [cryptoList]);
// ลบทิ้ง: useEffect + setInterval(15_000) ที่เคยทำให้ SL/TP ค้างอยู่ที่ราคาเก่า
```

- `generateForexSignals` / `generateThaiStockSignals` / `generateForeignStockSignals` ก็เลิกใช้ราคา placeholder (`1.0`) แล้ว
- `CryptoCard` และ `SignalDetailModal` ตรวจ `validateTradingSignal` กับ **ราคาที่แสดงจริง** (`coin.price`) ไม่ใช่ `signal.price`
- `formatPriceDynamic()` ใน `utils.ts` สำหรับจุดที่เคยใช้ `toLocaleString()` (ทำ SHIB เป็น `0`)

**ผลลัพธ์:** การ์ดจะปรากฏเมื่อมีราคาจริงเท่านั้น และ SL/TP คำนวณจากราคาเดียวกันกับที่แสดงเสมอ

---

## 2) Critical — แบนเนอร์ "พอร์ตย่อตัวแรง" ที่แต่งขึ้นเอง

**Root cause:** `drawdownService` มี 2 แหล่งข้อมูลปลอม
1. `KNOWN_PEAKS` = ตาราง ATH ฝังมือ (SHIB 0.0000350, SOL 260, XRP 2.85 …) ใช้เป็นจุดพีค
2. ถ้าไม่มีข้อมูล → `peak = currentPrice * 1.25` (แต่ง drawdown −20% ให้ทุกสินทรัพย์!)

**แก้:**
- ลบ `KNOWN_PEAKS` และตัวคูณปลอมทั้งหมด
- จุดอ้างอิงเหลือเฉพาะของจริง: `customPeaks` (ผู้ใช้บันทึกเอง) → `high52w` จากผู้ให้บริการข้อมูล
- เพิ่ม `DrawdownReferenceSource = 'CUSTOM' | 'API_52W' | 'NONE'`
- `NONE` = 0% + `status: 'NORMAL'` + **ไม่ถูกนับใน summary** (ไม่แจ้งเตือน)
- `sanitizePeak()` ตัดจุดพีคที่ไม่สมเหตุสมผล (ต่ำกว่าราคา หรือเกิน 20 เท่า)
- ปัดราคาตามขนาดจริง (SHIB ไม่ถูกปัดเป็น 0)

**UI:**
- แบนเนอร์: “…ลงเกินเกณฑ์ เทียบ ‘จุดพีคที่คุณบันทึกไว้’”
- หน้าติดตาม: อธิบายว่าไม่ใช่ ATH ของตลาด และแถวที่ยังไม่มีจุดอ้างอิงมีปุ่ม **“ตั้งจุดพีค”**
- Empty state: “ยังไม่มีจุดอ้างอิงสำหรับคำนวณ Drawdown — ตั้งจุดสูงสุดก่อน”

> ผลข้างเคียงที่ตั้งใจ: แบนเนอร์จะไม่เด้งอีกจนกว่าผู้ใช้จะตั้งจุดพีคเอง — ดีกว่าตกใจด้วยตัวเลขที่ไม่มีที่มา

---

## 3) Contradiction — “ดึงข้อมูลจริง” vs “○ ออฟไลน์”

- ลบคำยืนยัน “จริง” ออกจากคำอธิบายใต้หัวข้อกราฟ → ให้ป้ายบนกราฟเป็นผู้บอกสถานะแต่ผู้เดียว
- ป้ายเดิม (แก้ไปแล้วรอบก่อน) คือ “โหมดสำรอง: แสดงข้อมูลล่าสุดที่บันทึกได้”
- พบเพิ่ม: หัวข้อเขียน “กราฟราคา 90 วัน” แต่ตัวกราฟใช้ 1,000 วัน (Binance `limit=1000`) → แก้เป็น **1,000 วัน** ให้ตรงกัน

---

## 4) Formatting — `$0.00`

แก้ครบทุกจุดที่แสดงราคาคริปโต:
- `CryptoCard`, `TickerBar`, `SignalDetailModal` → `formatCryptoPrice()` (<0.01 → 8 ตำแหน่ง)
- `DrawdownMonitorModal` → `formatPriceDynamic()` (peak/decline ของ SHIB เคยเป็น `0`)
- `TickerBar` กรองเหรียญที่ยังไม่มีราคาออก ไม่แสดง `$0.00`

---

## 5) UI/UX — “API สถานะ” แย่งพื้นที่

ยืนยันจากหน้าเว็บจริงว่าอยู่ในแท็บพับแล้ว: `🔧 System Health 3/6 LIVE • มีบริการล่ม`
(แก้ในรอบก่อน — ไม่ต้องทำเพิ่ม)

---

## 6) เทสต์ที่เพิ่ม/ปรับ (343 ทั้งหมด)

| ไฟล์ | ครอบอะไร |
|---|---|
| `signals.test.ts` | ไม่มีราคา = ไม่มีสัญญาณ · SL/TP ถูกฝั่งทั้ง LONG/SHORT · (ลบเทสต์เดิมที่ยืนยัน fallback ราคาปลอม) |
| `drawdownReference.test.ts` (ใหม่ 7 เคส) | SHIB ไม่เด้ง −85% จาก ATH ฝังมือ · ใช้ custom peak · ใช้ 52W high · ตัด peak ผิดสเกล · summary ข้าม NONE · ปัดราคา micro-cap |
| `fixtures/liveCryptoFeed.ts` (ใหม่) | ฟีดตัวอย่างสำหรับเทสต์ (แยกจากข้อมูลโปรดักชันที่เป็น 0) |

---

## 7) สิ่งที่ยังเหลือ (ไม่ได้แก้รอบนี้ — ต้องตัดสินใจ)

1. **ราคาตั้งต้นของหุ้นไทย/หุ้นนอก/ดัชนี** (`THAI_STOCKS`, `FOREIGN_STOCKS`, `STOCK_SYMBOLS`)
   ยังเป็นตัวเลขคงที่ ถ้า API ล่มจะแสดงเป็นราคาปัจจุบันโดยไม่มีป้ายบอกวันเวลา
   → ทางเลือก: ใส่ `isLive: false` badge + “ณ วันที่ …” หรือทำให้เป็น 0 เหมือนคริปโต
2. `fetchPriceHistory` ยังสร้างกราฟสังเคราะห์เมื่อออฟไลน์ (ติดป้าย `(ประเมินเทคนิคัล)` แล้ว)
   — ควรเพิ่มคำอธิบายว่าค่า Support/Resistance ในโหมดนี้ไม่ใช่ข้อมูลตลาดจริง
3. Drawdown ต้องมี onboarding ให้ผู้ใช้ตั้งจุดพีคครั้งแรก (ไม่งั้นฟีเจอร์จะดู “ว่าง”)
4. Seed `change` ของ CRYPTO_INITIAL เป็น 0 แล้ว — โมเมนตัมจะขึ้นเมื่อมีข้อมูลจริงเท่านั้น (ถูกต้อง แต่ต้องอธิบายในเอกสารผู้ใช้)
