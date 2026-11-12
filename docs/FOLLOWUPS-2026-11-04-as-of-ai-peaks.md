# Follow-ups after the deep review — "ณ เวลา/วันที่" + AI จัดการจุดพีคอัตโนมัติ

วันที่: 2026-11-04 · branch `arena/5fdf1737-motorboy-ai-auto-api-trading` (ฐาน `c804aa8`)

สองข้อที่ค้างจาก deep review (`docs/DEEP-REVIEW-2026-11-04-live.md`) ปิดครบในรอบนี้

---

## ข้อ 1 — ตัวเลขคงที่ต้องติดป้าย "ณ เวลา/วันที่"

### ปัญหาเดิม
`STOCK_SYMBOLS`, `THAI_STOCKS`, `FOREIGN_STOCKS` ฝังตัวเลขไว้ในโค้ด (SET 1,378.45, PTT 34.50,
AAPL 200.00 ฯลฯ) และถูกเรนเดอร์ด้วยป้าย `● LIVE` / `○ สำรอง` เฉย ๆ ไม่มีวันเวลา
⇒ ผู้ใช้ไม่มีทางรู้ว่าตัวเลขนั้นคือ "ราคาเมื่อไหร่" และมีโอกาสอ่านเป็นราคาปัจจุบัน

### สิ่งที่แก้

| ไฟล์ | การเปลี่ยนแปลง |
| --- | --- |
| `src/services/apiClient.ts` | เพิ่ม `SEED_SNAPSHOT_AT` (`2026-10-01T09:00:00Z`) + `stampSeedSnapshot()` ติด `isLive:false` และ `updatedAt` ให้ทุกแถวข้อมูลตั้งต้น (`STOCK_SYMBOLS`, `THAI_STOCKS`, `FOREIGN_STOCKS`) และ fallback ของ `forexRates` |
| `src/utils.ts` | `formatAsOf(iso)` / `formatAsOfLabel(iso)` แปลงเวลาเป็นเขต ICT รูปแบบ `ณ 1 ต.ค. 2569 16:00` (คืนค่าว่างถ้าไม่มี/แปลงไม่ได้) |
| `src/components/stocks/StockCardShell.tsx` | แสดงบรรทัด `ณ …` ใต้ชื่อหุ้นเมื่อ `isLive === false` + `title` อธิบายว่าไม่ใช่ราคาสด |
| `src/components/StockCard.tsx` | การ์ดดัชนี (SET/NASDAQ/S&P/DJI) แสดง `ณ …` ใต้ป้าย `○ สำรอง` |
| `src/components/ForexCard.tsx` | เรทที่ `isLive === false` แสดง `ณ …` |
| `src/components/StockDetailModal.tsx` | รับ prop `isLive` / `updatedAt` และแสดง "ณ … • ราคาอ้างอิง ไม่ใช่ราคาสด" ใต้ราคา |
| `src/App.tsx` | ส่ง `isLive`/`updatedAt` เข้า modal ทั้งหุ้นไทยและหุ้นต่างประเทศ + คำอธิบายป้าย STALE เหนือรายการหุ้น/ดัชนี |

### หลักการที่ยึด
- **ไม่ zero ข้อมูลทิ้ง** (ตามที่ผู้ใช้สั่ง): ยังแสดงตัวเลข แต่ระบุเวลาอ้างอิงชัดเจน
- ข้อมูลที่ไม่รู้ที่มา **ไม่แต่งวันขึ้นเอง** — `updatedAt` มาจาก `SEED_SNAPSHOT_AT` ค่าคงที่ตัวเดียว
- ข้อมูลสด (`isLive === true`) ไม่แสดงป้าย "ณ" เพื่อไม่ให้สับสนว่าข้อมูลเก่า

---

## ข้อ 2 — AI ตั้งจุดพีค (peak) อัตโนมัติแบบเรียลไทม์

### ปัญหาเดิม
`buildDrawdownAssets()` ต้องมี `customPeaks` (ผู้ใช้กด "ตั้งจุดพีค" เองทีละตัว)
ถ้าไม่มีจุดอ้างอิง แถวนั้นจะเป็น `referenceSource: 'NONE'` = 0% และไม่ถูกนับ/ไม่แจ้งเตือน
⇒ หน้าต่าง Kill Switch & Risk Guard ว่างเปล่าในทางปฏิบัติ เพราะไม่มีใคร onboard เอง

### สิ่งที่แก้

**`src/services/peakTracker.ts` (ใหม่)**
- `trackPeaks(book, observations, nowIso)` — high-water mark: เก็บค่าที่ **สูงกว่าเดิมเท่านั้น**
  คืน object เดิมเมื่อไม่มีอะไรเปลี่ยน (กัน re-render ทุก 15 วิ)
- `loadAutoPeaks()` / `saveAutoPeaks()` — เก็บใน `localStorage`
  (`trading_engine_drawdown_auto_peaks`) ทน JSON เสียและตัด entry ที่ราคาไม่ถูกต้องทิ้ง
- `observationsFromFeeds({cryptoList, thaiStocks, foreignStocks, forexRates})` — ดึงราคาจากฟีดที่แอปมีอยู่แล้ว
  โดย **ข้ามราคาที่ `isLive === false`** เพื่อไม่ให้ข้อมูลตั้งต้นกลายเป็นจุดพีคปลอม
- `autoPeakValues(book)` — แปลงเป็น `Record<symbol, peak>` ให้ drawdown service

**`src/services/drawdownService.ts`**
- `buildDrawdownAssets({... , autoPeaks})` รับพีคจาก AI
- ลำดับความสำคัญ: `CUSTOM` (ผู้ใช้ตั้งเอง ชนะเสมอ) → `AI_AUTO` / `API_52W` (เลือกค่าที่สูงกว่า) → `NONE`
- ยังใช้ `sanitizePeak()` เดิม: พีคต้องสูงกว่าราคาปัจจุบันและไม่เกิน 20 เท่า

**`src/types.ts`**
- `DrawdownReferenceSource` เพิ่ม `'AI_AUTO'`

**`src/App.tsx`**
- state `autoPeaks` + effect ที่ผูกกับฟีดทั้ง 4 ตัว (อัปเดตทุก 15 วินาที) → `trackPeaks` → `saveAutoPeaks`
- ส่ง `autoPeaks` เข้า `buildDrawdownAssets` ผ่าน memo

**`src/components/DrawdownMonitorModal.tsx`**
- ป้ายหัวโมดัล `AI PEAK • N อัตโนมัติ` (`data-testid="ai-peak-badge"`)
- แต่ละแถวมีป้ายที่มาของจุดพีค: `AI • อัตโนมัติ` / `ผู้ใช้` / `52W`
- ข้อความใต้สไลเดอร์ Warning อัปเดตว่า AI เก็บจุดสูงสุดให้เอง ผู้ใช้ตั้งทับได้

### ผลลัพธ์เชิงพฤติกรรม
| สถานการณ์ | ก่อน | หลัง |
| --- | --- | --- |
| ผู้ใช้ใหม่ ไม่เคยตั้งจุดพีค | ทุกแถว `NONE` 0% ไม่เตือน | AI เริ่มเก็บพีคทันทีที่ราคาสดไหลเข้า → เตือนได้จริง |
| ราคาวิ่งขึ้นระหว่างใช้งาน | ไม่มีอะไรเกิดขึ้น | พีคขยับขึ้นอัตโนมัติ (high-water mark) |
| ผู้ใช้ตั้งจุดพีคเอง | ใช้ค่านั้น | ยังใช้ค่านั้น (ชนะ AI เสมอ) |
| ข้อมูลตั้งต้น (isLive=false) | อาจกลายเป็นพีค | ถูกตัดออกจาก tracker |

---

## เทสต์ที่เพิ่ม
- `src/__tests__/autoPeaks.test.ts` (13 เทสต์) — high-water mark, ไม่รับราคา 0/NaN/ติดลบ,
  ตัดข้อมูล non-live, persist/reload, JSON เสีย, ลำดับ CUSTOM > AI > 52W, ปฏิเสธพีคที่ต่ำกว่าราคาปัจจุบัน,
  การติดป้าย seed และรูปแบบ `formatAsOf`
- `src/__tests__/asOfAndAutoPeakUi.test.tsx` (4 เทสต์) — การ์ด STALE แสดง `ณ …`, การ์ด LIVE ไม่แสดง,
  forex stale แสดงเวลา, โมดัล drawdown แสดงป้าย AI และไม่มีปุ่ม "ตั้งจุดพีค" เมื่อ AI ดูแลอยู่

## Gates
- `npm run typecheck` ✓
- `npx vitest run` → **28 ไฟล์ / 360 เทสต์** ✓
- `npm run build` ✓

## หมายเหตุการ deploy
- `package-lock.json` ถูก sync กลับกับ `package.json` (ก่อนหน้านี้ `npm ci` ล้มเพราะ lock ไม่ตรง)
- ต้อง republish จาก `main` หลังจาก merge เพื่อให้เว็บจริงเปลี่ยน — รอบก่อนหน้าการ deploy ไม่รีเฟรชตาม commit
