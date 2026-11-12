# FUSION CORE (TypeScript) — รันในโปรเจกต์ ไม่ใช่ปรับโปรเจกต์ให้เข้ากับมัน

> ⚠️ **ขอบเขต: ผู้ช่วยวิเคราะห์/ตัดสินใจ ไม่ใช่ระบบเทรดออโต้**
> Fusion Core ผลิตสัญญาณให้คนอ่าน ไม่มีคำสั่งซื้อขายในโมดูลนี้เลย (ไม่มี network,
> ไม่มี order path) และมี guard test ผูกไว้ทั้ง TS/Python — ดู `docs/FUSION-REVIEW-2026-11.md`

สเปก MotorBoy Fusion Core ถูกเขียนไว้แบบ Python (`motorboy_production/`) โปรเจกต์นี้
เป็น React/TypeScript ที่รันในเบราว์เซอร์และไม่มี Python runtime จึง **พอร์ตมาเป็น
TypeScript** โดยยึดหลักว่า

- **ของใหม่ต้องเข้ากับโปรเจกต์** — ใช้แท็บ/ชนิดข้อมูล/ภาษาไทย/สไตล์เดิมของแอป
  ไม่มีการเปลี่ยนหน้าตา ไม่แตะ Calm UI ไม่เพิ่ม dependency
- **สเปกไม่ถูกดัดแปลง** — ชื่อ field, ช่วง score −2..+2, confidence 0–100,
  Preset 5 ประเภท, deadzone ยังตรงตามต้นฉบับ
- **Python ยังอยู่** เป็น reference ไว้เทียบผล (และไว้ต่อ API/แบ็คเทสฝั่งเซิร์ฟเวอร์)

## โครงไฟล์

```
src/fusion/
  types.ts      interface แช่แข็ง: ModuleSignal · BacktestSignal · FusionResult
                + alias ชื่อแท็บจริง (crypto / forex / th / us / index)
  whale.ts      โมดูลเงินใหญ่: 5 profile + สูตร normalize/score/confidence
                (+ PROXY_FIELDS สำหรับข้อมูลราคา/วอลุ่ม)
  adapters.ts   แปลงข้อมูลจริงของแอป -> schema ของสเปก (พร้อมติดป้าย proxy)
  index.ts      จุดเข้าเดียว
```

## ใช้ในแอป

```ts
import {
  analyzeWhaleFromApp, quoteFromCryptoCoin, analyzeWhaleBatch, strongestWhaleSignal,
} from './fusion';

// 1) จากข้อมูลจริงที่แอปมีอยู่แล้ว
const signal = analyzeWhaleFromApp(quoteFromCryptoCoin(cryptoList[0]));
// { score: 1, confidence: 33, reason: 'ประมาณจากราคา/วอลุ่ม: เงินใหญ่เริ่มเข้าของ: …',
//   source: 'whale:proxy:price+volume', assetType: 'crypto' }

// 2) ทั้งแท็บ แล้วหยิบตัวที่แรงสุด (ไม่ต้องมี state เพิ่ม)
const best = strongestWhaleSignal(analyzeWhaleBatch(cryptoList.map(quoteFromCryptoCoin)));

// 3) เมื่อมี API โฟลว์จริง — ส่ง canonical schema เข้าตรง ๆ (ไม่ต้องแก้ scoring)
const real = analyzeWhale({
  symbol: 'BTCUSDT', assetType: 'crypto',
  data: { exchange_netflow_usd: -18_500_000, funding_rate_pct: 0.021 },
});
```

## schema: canonical เป็นหลัก + adapter เป็นสะพาน

| field ของสเปก | มาจากข้อมูลจริงของแอป (proxy) |
| --- | --- |
| `net_flow_usd` | turnover × ทิศทาง/ขนาดของ %เปลี่ยน (คริปโต = quote volume, หุ้น = จำนวนหุ้น × ราคา) |
| `positioning_change_pct` | %เปลี่ยนของราคา |
| `large_tx_net_buy_ratio` | 0.5 ± (%เปลี่ยน / 20) |

กติกาความซื่อสัตย์ (สำคัญกว่าความสวยของตัวเลข):

1. **ติดป้ายทุกครั้ง** — `source` มี `proxy:price+volume` และ `reason` ขึ้นต้นว่า
   "ประมาณจากราคา/วอลุ่ม"
2. **ไม่ยัด proxy เป็นข้อมูลสถาบัน** — proxy ใช้ `PROXY_FIELDS` (สเกล ±5% / $50M)
   ไม่ใช้ profile `stock`/`forex`/`gold_index` ที่หมายถึง Fund Flow/COT/ETF จริง
3. **หรี่ความมั่นใจ** × `PROXY_CONFIDENCE_FACTOR` (0.55) เพราะหลักฐานอ่อนกว่าครึ่ง
4. **ไม่มีข้อมูล = 0/0** ไม่เดา (แท็บ forex/ดัชนีของแอปไม่มีวอลุ่ม → มั่นใจต่ำตามจริง)

## parity กับ Python (กันพอร์ตเพี้ยน)

`src/__tests__/fusionWhale.test.ts` เทียบกับผลที่คำนวณจาก
`motorboy_production/02_whale.py` ตรง ๆ สองชั้น

- **9 เคสเขียนมือ** — crypto/stock/forex/gold_index × bull/bear/neutral + เคสสัญญาณสวนทาง
- **40 เคสสุ่ม (seed คงที่)** จาก `parity_export.py` — คลุม 5 profile, มีเคสข้อมูลไม่ครบ,
  ค่าที่ส่งมาเป็น string พร้อมหน่วย และค่าที่เกินสเกล

ตรวจทั้ง `score`, `confidence`, `total`, `coverage`, `agreement` และ **ข้อความ reason ภาษาไทย**

> แก้สูตรฝั่งใดฝั่งหนึ่ง = เทสต์ parity แดง ห้ามแก้ fixture ให้ตามโค้ด

ข้ามภาษาได้ด้วย `toSignalDict()` / `fromSignalDict()` (snake_case ตรงกับ Python)

## เทสต์

```bash
python motorboy_production/parity_export.py        # สร้าง fixture 40 เคสจาก Python
npx vitest run src/__tests__/fusionWhale.test.ts   # 44 tests (parity 9+40, adapters, safety)
npx vitest run                                     # ทั้งโปรเจกต์ 279 tests
```

ฝั่ง Python (reference) ยังรันได้เหมือนเดิม:

```bash
python -m unittest discover -s motorboy_production/tests   # 19 tests
python motorboy_production/02_whale.py --selftest          # 94 checks
```

## ยังไม่ทำ (ตั้งใจ)

- **ไม่แตะ UI** — ยังไม่มีที่ไหนในหน้าจออ่าน `src/fusion` (ไม่ restyle, ไม่เพิ่มการ์ด)
  การเอาไปโชว์ (มาสคอตพูด / การ์ดสรุป) เป็นงานแยกที่ต้องขอ
- **ยังไม่มี 03_chart / 01_news / 04_backtest ใน TS** — ลำดับตามสเปกข้อ 7
- **ยังไม่มี fusion_core (VETO + น้ำหนัก) ใน TS** — ขั้นถัดไปหลังโมดูลลูกครบ
