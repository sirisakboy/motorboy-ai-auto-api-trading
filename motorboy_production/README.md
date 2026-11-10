# motorboy_production — สายเงินจริง (ห้ามแก้บ่อย)

โค้ดในโฟลเดอร์นี้คือ **สายเงินจริง** ตามสเปก MotorBoy Fusion Core:
เปลี่ยนอะไรต้องผ่าน Backtest ก่อน · ไม่มีชื่อสินทรัพย์ hardcode · ทุกฟังก์ชันรับ
`symbol` + `asset_type` เป็น parameter

```
motorboy_production/
  signals.py        interface แช่แข็ง (ModuleSignal / BacktestSignal / FusionResult)
  02_whale.py       ✅ โมดูลเงินใหญ่ แบบ UNIVERSAL  ← STEP 1 ข้อ 1 (เสร็จ)
  03_chart.py       ⏳ PPO + RSI + EMA200/400 + แนวรับต้าน + ATR
  01_news.py        ⏳ ข่าว + แยกข่าวจริง/ข่าวปั่น
  04_backtest.py    ⏳ WinRate / Profit Factor / MaxDD
  main.py           ⏳ รวม 4 โมดูล + fusion_core.py แล้วสรุปภาษาไทย
  tests/            เทสด้วย stdlib unittest (ไม่ต้องลง pytest)
```

> **เรื่อง `signals.py`:** สเปกบอกว่า interface อยู่ใน `fusion_core.py` ซึ่งยังไม่มีในรีโปนี้
> โมดูลทุกตัวจึงลอง `from fusion_core import ModuleSignal` **ก่อนเสมอ** และถอยมาใช้
> `signals.py` เฉพาะตอนที่ยังไม่มี — วันที่ทีมเอา `fusion_core.py` เข้ามา
> ไม่ต้องแก้ไฟล์ลูกแม้บรรทัดเดียว

---

## 02_whale.py — "วาฬ" ของทุกสินทรัพย์ ไม่ใช่แค่คริปโต

| asset_type | ข้อมูลที่อ่าน (source) |
| --- | --- |
| `crypto` | Exchange netflow · Stablecoin เข้า Exchange · สัดส่วน Tx ใหญ่ฝั่งซื้อ · Funding · OI |
| `stock` | Fund Flow สถาบัน · Block Trade premium · Insider · Short Interest |
| `forex` | COT Net Position · ท่าทีธนาคารกลาง · Bank Flow · ดอกเบี้ยคาดหวัง (bp) |
| `gold_index` | ETF Flow · Fund Flow Index · ธนาคารกลางซื้อทอง · Futures Net Long |
| `default` | Net Flow · Positioning · สัดส่วนไม้ใหญ่ (เมื่อไม่ระบุประเภท) |

alias ที่รับ: `crypto_major`/`crypto_meme`/`coin` → `crypto` · `thai_stock`/`us_stock` → `stock` ·
`fx` → `forex` · `gold`/`index` → `gold_index`

### รัน

```bash
python motorboy_production/02_whale.py --symbol BTCUSDT --asset_type crypto
python motorboy_production/02_whale.py --symbol AAPL  --asset_type stock  --bias bear
python motorboy_production/02_whale.py --symbol EURUSD --asset_type forex --json
python motorboy_production/02_whale.py --symbol XAUUSD --asset_type gold  --mock flow.json
python motorboy_production/02_whale.py --schema      # field ทั้งหมดที่รองรับ
python motorboy_production/02_whale.py --selftest    # 94 ข้อ ครอบ 5 asset_type × 3 bias
```

ตัวอย่างผลลัพธ์:

```
🐋 02_WHALE — UNIVERSAL MONEY FLOW
symbol     : BTCUSDT
asset_type : crypto
--------------------------------------------------------------
  เงินเข้า-ออก Exchange             -$18.5M  [+++++++++ ] +0.93
  Stablecoin เข้า Exchange            $6.0M  [+         ] +0.12
  สัดส่วน Tx ใหญ่ฝั่งซื้อ              0.68  [++++      ] +0.36
  Funding Rate                       +0.02%  [----      ] -0.42
  OI เปลี่ยน                         +4.20%  [++++      ] +0.42
--------------------------------------------------------------
  total=+0.379  coverage=1.00  agreement=0.75
  คะแนนเงินใหญ่ : +1 / 2   (bullish)
  ความมั่นใจ    : 58%
  เหตุผล        : เงินใหญ่เริ่มเข้าของ: เงินเข้า-ออก Exchange -$18.5M
  source        : whale:crypto:on-chain: exchange netflow, stablecoin, OI, funding
```

### วิธีคิดคะแนน (อ่านก่อนแก้ — ต้องมี Backtest รองรับ)

1. **normalize** ทุกตัวชี้วัดเป็น `[-1, +1]` ด้วย `(ค่า − center) / scale` แล้วจำกัดช่วง
   - `invert=True` สำหรับตัวที่ "ค่าลบ = ดี" เช่น เงินไหลออกจาก Exchange, funding สูง, short เพิ่ม
2. **รวมถ่วงน้ำหนักภายในโมดูล** `total = Σ(w·x) / Σ(w ของตัวที่มีข้อมูล)`
   — ตัวที่ไม่มีข้อมูลถูก **ข้าม** ไม่ใช่เติม 0 หลอก ๆ
3. **แปลงเป็น score −2..+2** (deadzone กันสัญญาณรบกวน):

   | total | score |
   | --- | --- |
   | ≥ +0.45 | +2 |
   | ≥ +0.15 | +1 |
   | −0.15 … +0.15 | 0 |
   | ≤ −0.15 | −1 |
   | ≤ −0.45 | −2 |

4. **confidence 0–100** = `55%·ความแรง + 30%·(coverage × agreement) + 15%·coverage`
   - `coverage` = สัดส่วนน้ำหนักที่มีข้อมูลจริง → **ข้อมูลไม่ครบ = มั่นใจต่ำ**
   - `agreement` = ตัวชี้วัดชี้ทางเดียวกันแค่ไหน → สัญญาณสวนกันจะไม่ได้คะแนนสุดโต่ง

> นี่เป็น **น้ำหนักภายในโมดูล** (ตัวไหนน่าเชื่อกว่ากัน) ไม่ใช่ **weight ของ Fusion**
> ตามสเปกข้อ 5 ซึ่งเป็นของหัวหน้า — สองชั้นนี้ห้ามปนกัน

### mock_data schema (ส่งเฉพาะตัวที่มีข้อมูลได้)

```json
{
  "exchange_netflow_usd": -18500000,
  "stablecoin_inflow_usd": 6000000,
  "large_tx_net_buy_ratio": 0.68,
  "funding_rate_pct": 0.021,
  "open_interest_change_pct": 4.2
}
```

รับค่าแบบ string พร้อมหน่วยได้ด้วย: `"$12.5M"`, `"3.5%"`, `"1,200"`

### สิ่งที่ **ไม่** อยู่ในไฟล์นี้ (โดยตั้งใจ)

- **ไม่มี VETO** — กฎเหล็ก 3 ข้อเป็นของหัวหน้า (`fusion_core.py`) ไม่ใช่ของโมดูลลูก
- **ไม่มี API จริง** — ต่อทีหลังได้โดยไม่แตะ scoring: เปลี่ยนแค่คนที่ส่ง `mock_data` เข้ามา
- **ไม่มีชื่อสินทรัพย์** — ไม่มี `BTC`/`AAPL` อยู่ใน logic (มีแค่ในตัวอย่าง CLI)

### เทส

```bash
python -m unittest discover -s motorboy_production/tests -v   # 18 tests
python motorboy_production/02_whale.py --selftest              # 94 checks
```

เทสคุมไว้: ช่วงคะแนน/ความมั่นใจ · ทิศทาง bull/bear/neutral ของทั้ง 5 ประเภท ·
ข้อมูลไม่ครบต้องมั่นใจลด · สัญญาณสวนกันต้องไม่สุดโต่ง · alias ของ field และ asset_type ·
`symbol` ต้องไม่มีผลต่อผลลัพธ์ · deterministic · CLI/JSON/exit code

---

## ต่อไป (STEP 1 ข้อ 2)

`03_chart.py` — PPO + RSI + EMA200/400 + แนวรับแนวต้าน + ATR
(ATR ใช้ปรับ SL/TP ตามความผันผวนของสินทรัพย์ ไม่ใช้ pip ตายตัว)
ไฟล์นี้จะรับ `mock_data` แบบ OHLCV ชุดเดียวกันทุกสินทรัพย์
