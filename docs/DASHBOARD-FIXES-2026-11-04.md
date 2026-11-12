# Dashboard Fixes — 2026-11-04

ผู้รับผิดชอบ: Senior Frontend Developer / Trading System Expert
Commit: `f7a0b18` (branch `arena/4b7dea17-motorboy-ai-auto-api-trading`)
สถานะ gate: `tsc` ✓ (client + server) · `vitest` **307/307 (22 ไฟล์)** ✓ · `vite build` ✓ · `npm run lint` ✓

หลักการที่ยึด: **ห้ามแสดงตัวเลขที่ดูน่าเชื่อถือแต่ผิด** — ถ้าข้อมูลสอดคล้องไม่ได้
ให้บอกผู้ใช้ตรง ๆ ดีกว่าโชว์ SL/TP ที่กลับข้าง, ห้ามปัดราคาจนกลายเป็น `$0.00`,
และไม่แตะ palette / ไม่รื้อโครง component เดิม (ตามข้อกำหนดโปรเจกต์)

---

## 1) Critical — ตรวจความสอดคล้องของ SL/TP

**ไฟล์:** `src/utils.ts` (ตัวช่วยใหม่) + `SignalDetailModal.tsx` + `ForexDetailModal.tsx` + `CryptoCard.tsx`

กติกา: `LONG` ต้องมี `SL < price < TP` · `SHORT` ต้องมี `TP < price < SL`
(ค่าเท่ากันถือว่าไม่ผ่าน) — ตรวจ `Number.isFinite` และ `> 0` ก่อนทุกครั้ง

```ts
export const INCONSISTENT_SIGNAL_LABEL = '⚠️ ข้อมูลไม่สอดคล้อง';

export type SignalValidationCode =
  | 'OK'
  | 'MISSING_PRICE'
  | 'MISSING_SL'
  | 'MISSING_TP'
  | 'INVALID_RANGE';

export interface SignalValidation {
  valid: boolean;
  code: SignalValidationCode;
  /** ข้อความเต็ม (มีป้าย ⚠️ นำหน้าเมื่อไม่ผ่าน) */
  message: string;
  /** คำอธิบายสาเหตุแบบไม่มีป้าย — ใช้เป็นบรรทัดรองใน UI */
  detail: string;
}

export interface TradingSignalLike {
  type: 'LONG' | 'SHORT';
  price: number;
  sl: number;
  tp: number;
}

/**
 * ตรวจความสอดคล้องของ SL/TP กับราคาปัจจุบัน
 * LONG: SL < price < TP · SHORT: TP < price < SL
 * (ค่าเท่ากันถือว่าไม่ผ่าน เพราะไม่มีความหมายเชิงความเสี่ยง)
 */
export function validateTradingSignal(
  signal: TradingSignalLike | null | undefined
): SignalValidation {
  const invalid = (code: SignalValidationCode, detail: string): SignalValidation => ({
    valid: false,
    code,
    message: `${INCONSISTENT_SIGNAL_LABEL} — ${detail}`,
    detail,
  });

  if (!signal) return invalid('MISSING_PRICE', 'ไม่พบข้อมูลสัญญาณ');

  const { type, price, sl, tp } = signal;
  if (!Number.isFinite(price) || price <= 0) {
    return invalid('MISSING_PRICE', 'ไม่มีราคาปัจจุบันที่ใช้ได้');
  }
  if (!Number.isFinite(sl) || sl <= 0) {
    return invalid('MISSING_SL', 'ไม่มีราคา Stop Loss ที่ใช้ได้');
  }
  if (!Number.isFinite(tp) || tp <= 0) {
    return invalid('MISSING_TP', 'ไม่มีราคา Take Profit ที่ใช้ได้');
  }

  if (type === 'LONG') {
    if (sl >= price) return invalid('INVALID_RANGE', 'SL ของ LONG ต้องต่ำกว่าราคาปัจจุบัน');
    if (tp <= price) return invalid('INVALID_RANGE', 'TP ของ LONG ต้องสูงกว่าราคาปัจจุบัน');
  } else {
    if (sl <= price) return invalid('INVALID_RANGE', 'SL ของ SHORT ต้องสูงกว่าราคาปัจจุบัน');
    if (tp >= price) return invalid('INVALID_RANGE', 'TP ของ SHORT ต้องต่ำกว่าราคาปัจจุบัน');
  }

  return {
    valid: true,
    code: 'OK',
    message: 'ข้อมูล SL/TP สอดคล้องกับราคาปัจจุบัน',
    detail: 'SL/TP อยู่ถูกฝั่งของราคาปัจจุบัน',
  };
}
```

### จุดที่เรียกใช้

`src/components/SignalDetailModal.tsx` (หลังคำนวณ `slPercent`/`tpPercent`)

```tsx
// SL/TP ต้องอยู่ถูกฝั่งของราคา ถ้าไม่ใช่ = ข้อมูลผิด ห้ามโชว์ตัวเลขเหมือนใช้ได้
const signalValidation = validateTradingSignal({
  type: signal.type,
  price: signal.price,
  sl: signal.sl,
  tp: signal.tp,
});
```

แท็บ `SL / TP` — เปลี่ยนจาก grid ตรง ๆ เป็นมีด่าน:

```tsx
{signalValidation.valid ? (
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
    {/* การ์ด SL และ TP เดิมทั้งหมด ไม่แก้สไตล์ */}
  </div>
) : (
  <div
    className="bg-[#FFB86B]/15 border border-[#FFB86B]/40 rounded-xl p-3 space-y-1"
    role="alert"
    data-testid="signal-inconsistent-warning"
  >
    <p className="text-[#FFB86B] text-xs font-bold">{INCONSISTENT_SIGNAL_LABEL}</p>
    <p className="text-[#A7A4B8] text-[10px] leading-snug">
      {signalValidation.detail} — ระบบซ่อนตัวเลข SL/TP ไว้จนกว่าข้อมูลจะถูกแก้ไข
    </p>
    <p className="text-[#A7A4B8] text-[10px] leading-snug">
      ราคาปัจจุบัน {displayPrice} • {signal.type}
    </p>
  </div>
)}
```

`ForexDetailModal` ใช้ด่านเดียวกัน แต่เทียบกับ **ราคาตลาดจริง** (`forex.price`)
ไม่ใช่ราคาในสัญญาณ เพราะ % SL/TP คำนวณจาก `forex.price` อยู่แล้ว

`CryptoCard` — ในการ์ดสรุป ถ้าข้อมูลเสียให้แทนที่บรรทัด `SL: … TP: …` ด้วย

```tsx
<span className="font-semibold text-[#FFB86B]" title={validation.detail}>
  {INCONSISTENT_SIGNAL_LABEL}
</span>
```

> ทำไมสำคัญ: โค้ดเดิมใช้ `Math.abs(...)` กับ `slPercent`/`tpPercent` ทำให้ไม้ LONG
> ที่ SL อยู่ *เหนือ* ราคา ยังเรนเดอร์เป็น `-8.3%` ดูเหมือนแผนที่ใช้ได้ — ซึ่งอันตราย
> กว่าการไม่แสดงอะไรเลย

---

## 2) Dynamic decimals — SHIB ต้องไม่ใช่ `$0.00`

**ไฟล์:** `src/utils.ts` (`getCryptoDecimals`, `formatCryptoPrice`) และผู้เรียก
`CryptoCard`, `TickerBar`, `SignalDetailModal`

กติกา: `< 0.01` → 8 ตำแหน่ง · `< 1` → 4 ตำแหน่ง · `>= 1` → 2 ตำแหน่ง
เลือกทศนิยมจาก **ค่าที่แปลงเป็นสกุลเงินที่แสดงแล้ว** (THB คูณก่อนแล้วจึงเลือก)
และคืน `'-'` เมื่อค่าไม่ finite (กัน `NaN` ขึ้นจอ)

```ts
export function getCryptoDecimals(price: number): number {
  if (!Number.isFinite(price) || price <= 0) return 2;
  if (price < 0.01) return 8;
  if (price < 1) return 4;
  return 2;
}

export function formatCryptoPrice({
  price, mode = 'USD', usdThbRate, withSign = false,
}: FormatCryptoPriceOptions): string {
  if (!Number.isFinite(price)) return '-';
  const value = price * getMultiplier(mode, usdThbRate);
  const decimals = getCryptoDecimals(Math.abs(value));
  const sign = withSign && value > 0 ? '+' : '';
  return `${sign}${getCurrencyPrefix(mode)}${value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}
```

ผู้เรียก (เดิม hardcode 2 ตำแหน่ง):

```tsx
// CryptoCard
const priceMode = useThb ? 'THB' : 'USD';
const displayPrice = formatCryptoPrice({ price: coin?.price ?? signal.price, mode: priceMode, usdThbRate });
const displaySl = formatCryptoPrice({ price: signal.sl, mode: priceMode, usdThbRate });
const displayTp = formatCryptoPrice({ price: signal.tp, mode: priceMode, usdThbRate });

// TickerBar
const displayPrice = formatCryptoPrice({ price: coin.price, mode: priceMode, usdThbRate });
```

`SignalDetailModal` — คริปโต/หุ้นใช้ `formatCryptoPrice`, ฟอเร็กซ์คงรูปแบบเดิม
(ทศนิยมคงที่ + quote suffix) เพื่อไม่ให้คู่เงินเปลี่ยนหน้าตา:

```tsx
const formatPrice = (val?: number): string => {
  if (val === undefined || val === null || !Number.isFinite(val)) return '-';
  if (!isForex) return formatCryptoPrice({ price: val, mode: useThb ? 'THB' : 'USD', usdThbRate });
  return `${formatNumber(val * multiplier, decimals)}${quoteSuffix}`;
};
```

`getDecimals()` ของเดิมยังอยู่ครบ (ไม่แตะ) เพื่อไม่กระทบหุ้น/ฟอเร็กซ์ที่พึ่งมันอยู่

---

## 3) ข้อมูลขัดกันเอง — ป้ายสำรอง + โมเมนตัมที่บอกกรอบเวลา

**ก. ป้ายบนกราฟ** — `src/components/PriceChartCanvas.tsx`

```diff
- — ไม่มีข้อมูลจริง
+ — โหมดสำรอง: แสดงข้อมูลล่าสุดที่บันทึกได้
```

ความหมายเปลี่ยนจาก "ไม่มีข้อมูล" (ซึ่งขัดกับกราฟที่วาดอยู่) เป็น "ข้อมูลชุดสำรอง"
ตรงกับ `isLive === false` ที่แปลว่าเป็นข้อมูล cached ไม่ใช่ข้อมูลเรียลไทม์

**ข. การ์ดโมเมนตัม** — `SignalDetailModal` (แท็บเทคนิคอล) และ `ForexDetailModal`
เพิ่มกรอบเวลาและระบุเมื่อโมเมนตัมสวนทางกับแนวโน้มหลักของสัญญาณ

```ts
export function momentumLabel({ changePct, timeframe, direction }: {
  changePct: number | null | undefined;
  timeframe?: string | null;
  direction?: 'LONG' | 'SHORT';
}): string {
  if (changePct === null || changePct === undefined || !Number.isFinite(changePct)) {
    return 'โมเมนตัมยังไม่ชัดเจน';
  }
  const base = changePct >= 0 ? 'โมเมนตัมบวก' : 'โมเมนตัมชะลอ';
  const tf = typeof timeframe === 'string' && timeframe.trim() ? ` (${timeframe.trim()})` : '';
  if (direction === 'LONG' && changePct < 0) return `${base}${tf} แต่แนวโน้มหลักยังเป็นขาขึ้น`;
  if (direction === 'SHORT' && changePct >= 0) return `${base}${tf} แต่แนวโน้มหลักยังเป็นขาลง`;
  return `${base}${tf}`;
}
```

ผลลัพธ์จริง: `โมเมนตัมบวก (1H) แต่แนวโน้มหลักยังเป็นขาลง`
พร้อมเปลี่ยนสีเป็นม่วง `#A89FFF` (กลาง ๆ) เมื่อขัดกัน แทนเขียว/ส้มที่สื่อทิศเดียว

---

## 4) ลดความรก — `🔧 System Health`

**ไฟล์ใหม่:** `src/components/SystemHealthPanel.tsx` · **แก้:** `src/App.tsx`

`ApiStatusCard` ไม่ถูกแก้แม้แต่บรรทัดเดียว (สถานะ + ปุ่ม refresh เดิมทั้งหมด)
แค่ถูกห่อด้วยแท็บพับได้ ซึ่งแสดงสรุปสุขภาพเสมอแม้พับอยู่

```tsx
import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { ApiStatusState } from '../types';
import { ApiStatusCard } from './ApiStatusCard';

interface SystemHealthPanelProps {
  status: ApiStatusState;
  onRefresh: () => void;
  /** เปิดรายละเอียดค้างไว้ตั้งแต่แรก (ปกติพับไว้เพื่อลดความรกของ sidebar) */
  defaultOpen?: boolean;
}

/** ค่าที่ถือว่า "ทำงานปกติ" / "สำรอง" — ต้องตรงกับ ApiStatusCard */
const HEALTHY_STATES = ['LIVE', 'ONLINE'];
const FALLBACK_STATES = ['FALLBACK', 'CURATED', 'STALE'];

/**
 * ห่อ ApiStatusCard ไว้ในแท็บพับได้ "🔧 System Health"
 * - พับไว้เป็นค่าเริ่มต้น: sidebar ไม่ถูกกินพื้นที่ด้วยรายละเอียด 6 บริการ
 * - หัวแท็บแสดงสรุปสุขภาพระบบเสมอ แม้พับอยู่ (ไม่ต้องกดเข้าไปดู)
 * - ไม่แก้สไตล์ภายใน ApiStatusCard เดิม (คงสถานะ/ปุ่ม refresh เดิมทั้งหมด)
 */
export const SystemHealthPanel: React.FC<SystemHealthPanelProps> = ({
  status,
  onRefresh,
  defaultOpen = false,
}) => {
  const [open, setOpen] = useState<boolean>(defaultOpen);

  const states = [
    status.binanceWs,
    status.coinGecko,
    status.forex,
    status.stocks,
    status.news,
    status.signals,
  ];

  const liveCount = states.filter((s) => HEALTHY_STATES.includes(s)).length;
  const fallbackCount = states.filter((s) => FALLBACK_STATES.includes(s)).length;
  const totalCount = states.length;

  // ระดับสุขภาพ: ปกติ / ทำงานแบบสำรอง / มีบริการล่ม
  const tone: 'ok' | 'fallback' | 'down' =
    liveCount === totalCount ? 'ok' : liveCount + fallbackCount === totalCount ? 'fallback' : 'down';

  const toneClass =
    tone === 'ok'
      ? 'bg-[#7EE0B5]/15 border-[#7EE0B5]/40 text-[#7EE0B5]'
      : 'bg-[#FFB86B]/15 border-[#FFB86B]/40 text-[#FFB86B]';

  const summary =
    tone === 'ok'
      ? `${liveCount}/${totalCount} LIVE`
      : tone === 'fallback'
      ? `${liveCount}/${totalCount} LIVE • ${fallbackCount} สำรอง`
      : `${liveCount}/${totalCount} LIVE • มีบริการล่ม`;

  const panelId = 'system-health-panel';
  const isChecking = Boolean(status.isChecking);

  return (
    <section className="w-full" data-testid="system-health-panel">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="w-full flex items-center justify-between gap-2 rounded-[16px] bg-[#141725] border border-white/[0.07] px-3.5 py-2.5 text-left transition-colors hover:border-[#7C6CFF]/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7C6CFF]/60"
      >
        <span className="flex items-center gap-2 min-w-0">
          <span aria-hidden="true" className="text-sm leading-none">
            🔧
          </span>
          <span className="text-white font-bold text-xs sm:text-sm tracking-tight truncate">
            System Health
          </span>
        </span>

        <span className="flex items-center gap-2 shrink-0">
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${toneClass}`}
            data-testid="system-health-summary"
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                tone === 'ok' ? 'bg-[#7EE0B5] animate-pulse' : 'bg-[#FFB86B]'
              }`}
            />
            {isChecking ? 'กำลังตรวจสอบ…' : summary}
          </span>
          {open ? (
            <ChevronUp className="w-4 h-4 text-[#A7A4B8]" aria-hidden="true" />
          ) : (
            <ChevronDown className="w-4 h-4 text-[#A7A4B8]" aria-hidden="true" />
          )}
        </span>
      </button>

      {open && (
        <div id={panelId} className="mt-2" role="region" aria-label="รายละเอียดสถานะระบบ">
          <ApiStatusCard status={status} onRefresh={onRefresh} />
        </div>
      )}
    </section>
  );
};
```

จุด mount ใน `src/App.tsx` (คอลัมน์ขวา `lg:col-span-4`):

```diff
  <MarketHoursCard marketHours={marketHours} />
- <ApiStatusCard status={apiStatus} onRefresh={handleRefreshAllApis} />
+ <SystemHealthPanel status={apiStatus} onRefresh={handleRefreshAllApis} />
```

a11y: ปุ่มมี `aria-expanded` / `aria-controls`, เนื้อหามี `role="region"`
พร้อม `aria-label`, Chevron เป็น `aria-hidden`

---

## Tests ที่เพิ่ม (`src/__tests__/dashboardFixes.test.tsx` — 19 เคส)

| กลุ่ม | เคสที่ครอบ |
|---|---|
| `formatCryptoPrice` | 8/4/2 ตำแหน่ง, THB คูณก่อนเลือกทศนิยม, `NaN`/`Infinity` → `-` |
| `validateTradingSignal` | LONG/SHORT ถูกต้อง, SL กลับข้าง, TP กลับข้าง, ค่าเท่ากัน, `null` |
| `momentumLabel` | มีกรอบเวลาเสมอ, เตือนเมื่อสวนทาง 2 ทิศ, ข้อมูลขาด |
| `CryptoCard` | SHIB แสดง `$0.00002450`, SL/TP กลับข้าง → แสดงป้ายเตือนและซ่อนตัวเลข |
| `SystemHealthPanel` | พับไว้เริ่มต้น + สรุป `6/6 LIVE`, กางแล้วเห็นการ์ดเดิม, พับกลับได้ |
| `SignalDetailModal` | แท็บ SL/TP แสดง alert แทนตัวเลข, โมเมนตัมมีกรอบเวลา |

## ความเสี่ยง/ข้อควรรู้

1. `getDecimals()` เดิมยังคุม `formatPrice()` ของหุ้น/ฟอเร็กซ์ — เจตนาคือไม่ให้ตัวเลข
   สินทรัพย์อื่นเปลี่ยนตามไปด้วย
2. `ForexDetailModal` ตรวจ SL/TP เทียบ `forex.price` (ราคาตลาด) ไม่ใช่ `activeSignal.price`
   เพราะสัญญาณอาจถูกสร้างไว้ก่อนราคาเคลื่อน — เข้มกว่าเดิมโดยตั้งใจ
3. ยังไม่มี automated order ใด ๆ — ทั้งชุดเป็นการแสดงผล/เตือนเท่านั้น
