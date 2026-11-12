/**
 * Shared utility functions used across components and services.
 * Centralises price formatting, THB conversion, and decimal logic
 * so we avoid duplicating magic numbers (e.g. 36.45) across files.
 */

/** Fallback THB-per-USD rate used only when live USD/THB is unavailable. */
export const THB_MULTIPLIER = 36.45;

/**
 * Live USD→THB rate.
 *
 * `formatPrice()` is called from ~20 leaf components that do not all receive the
 * forex feed, so the active rate is stored here once (see
 * `App.tsx` → `setActiveUsdThbRate`) instead of being prop-drilled everywhere.
 * Keeping it here guarantees the ticker, the cards and the modals all convert
 * with the same number — previously the ticker used the live rate while
 * `formatPrice()` kept the hardcoded 36.45.
 */
let activeUsdThbRate: number | null = null;

/** Update the active USD→THB rate. Non-finite / non-positive values are ignored. */
export function setActiveUsdThbRate(rate?: number | null): void {
  if (typeof rate === 'number' && isFinite(rate) && rate > 0) {
    activeUsdThbRate = rate;
  }
}

/** Current USD→THB rate (live when known, otherwise the static fallback). */
export function getActiveUsdThbRate(): number {
  return activeUsdThbRate ?? THB_MULTIPLIER;
}

/** Test helper: forget any live rate and fall back to THB_MULTIPLIER. */
export function resetActiveUsdThbRate(): void {
  activeUsdThbRate = null;
}

/**
 * Resolve the live USD→THB rate from polled forex pairs.
 * Falls back to THB_MULTIPLIER when offline so UI never breaks.
 */
export function getLiveUsdThb(
  forexRates?: Array<{ pair: string; price: number; isLive?: boolean }>
): { rate: number; isLive: boolean } {
  const live = forexRates?.find((f) => f.pair === 'USD/THB');
  if (live && isFinite(live.price) && live.price > 0) {
    return { rate: live.price, isLive: live.isLive !== false };
  }
  return { rate: THB_MULTIPLIER, isLive: false };
}

export type CurrencyMode = 'THB' | 'USD';

/**
 * Determine how many decimal places to show for a given price / pair.
 * Forex pairs quoted below 10 (e.g. EUR/USD 1.08xx) use 4 decimals;
 * JPY pairs and prices >= 10 use 2 decimals.
 */
export function getDecimals(price: number, isForex = false): number {
  if (price > 0 && price < 0.0001) return 7;
  if (price > 0 && price < 0.01) return 6;
  if (isForex || (price > 0 && price < 10)) return 4;
  return 2;
}

/** Return the currency symbol prefix for the active display mode. */
export function getCurrencyPrefix(mode: CurrencyMode): string {
  return mode === 'THB' ? '฿' : '$';
}

/** Return the numeric multiplier to convert to the active display currency. */
export function getMultiplier(mode: CurrencyMode, usdThbRate?: number): number {
  if (mode !== 'THB') return 1;
  return usdThbRate && isFinite(usdThbRate) && usdThbRate > 0
    ? usdThbRate
    : getActiveUsdThbRate();
}

export interface FormatPriceOptions {
  /** Price value in the asset's native currency (e.g. USD). */
  price: number;
  /** Display currency mode (THB or USD). */
  mode?: CurrencyMode;
  /** Is this a forex pair (affects decimal places). */
  isForex?: boolean;
  /** Show trailing quote suffix e.g. " USDT" (mainly for forex display). */
  quoteSuffix?: string;
  /** Explicit USD→THB rate; defaults to the app-wide live rate. */
  usdThbRate?: number;
}

/**
 * Format a numeric price into a localised, currency-prefixed string.
 *
 * @example
 *   formatPrice({ price: 92450.0 })                     // "$92,450.00"
 *   formatPrice({ price: 92450.0, mode: 'THB' })        // "฿3,369,825.00"
 *   formatPrice({ price: 1.0845, isForex: true })       // "1.0845"
 */
export function formatPrice({
  price,
  mode = 'USD',
  isForex = false,
  quoteSuffix = '',
  usdThbRate,
}: FormatPriceOptions): string {
  const multiplier = getMultiplier(mode, usdThbRate);
  const prefix = getCurrencyPrefix(mode);
  const decimals = getDecimals(price, isForex);

  // Forex pairs with small prices don't get a $ prefix
  const effectivePrefix = mode === 'THB' && !isForex ? prefix : isForex ? '' : prefix;

  const value = price * multiplier;
  const formatted = value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return `${effectivePrefix}${formatted}${quoteSuffix}`;
}

/**
 * Lightweight helper kept for backwards-compatibility with HistoryList
 * which used a slightly different format (no quote suffix, maxFraction 2).
 */
export function formatPriceSimple(
  price: number,
  mode: CurrencyMode = 'USD',
  usdThbRate?: number
): string {
  const multiplier = getMultiplier(mode, usdThbRate);
  const prefix = getCurrencyPrefix(mode);
  const value = price * multiplier;
  return `${prefix}${value.toLocaleString(undefined, {
    maximumFractionDigits: 2,
  })}`;
}

/* ============================================================================
 * Crypto price formatting — dynamic decimals
 *
 * ปัญหาเดิม: SHIB (0.0000245) ถูกปัดเป็น 2 ตำแหน่ง -> "$0.00" ซึ่งอ่านไม่ได้
 * กติกา: < 0.01 -> 8 ตำแหน่ง · < 1 -> 4 ตำแหน่ง · >= 1 -> 2 ตำแหน่ง
 * ========================================================================== */

/**
 * จำนวนทศนิยมตามขนาดราคา (ใช้กับราคาที่แปลงเป็นสกุลเงินที่แสดงแล้ว)
 * @example getCryptoDecimals(0.0000245) // 8 · getCryptoDecimals(0.42) // 4 · getCryptoDecimals(92450) // 2
 */
export function getCryptoDecimals(price: number): number {
  if (!Number.isFinite(price) || price <= 0) return 2;
  if (price < 0.01) return 8;
  if (price < 1) return 4;
  return 2;
}

export interface FormatCryptoPriceOptions {
  /** ราคาในสกุลเงินต้นทาง (USD) */
  price: number;
  mode?: CurrencyMode;
  usdThbRate?: number;
  /** แสดงเครื่องหมาย + นำหน้าเมื่อเป็นบวก */
  withSign?: boolean;
}

/**
 * จัดรูปราคาคริปโตแบบไดนามิก — เลือกทศนิยมตามขนาดจริงของราคาที่แสดง
 * คืน '-' เมื่อค่าไม่ใช่ตัวเลข (กัน "NaN" ขึ้นหน้าจอ)
 */
export function formatCryptoPrice({
  price,
  mode = 'USD',
  usdThbRate,
  withSign = false,
}: FormatCryptoPriceOptions): string {
  if (!Number.isFinite(price)) return '-';
  const value = price * getMultiplier(mode, usdThbRate);
  const decimals = getCryptoDecimals(Math.abs(value));
  const sign = withSign && value > 0 ? '+' : '';
  const formatted = value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${sign}${getCurrencyPrefix(mode)}${formatted}`;
}

/**
 * ทางลัดสำหรับ component ที่ต้องการแค่ "ราคาที่อ่านได้" ตามขนาดจริง
 * (เช่น หน้า DrawdownMonitor ที่เคยใช้ toLocaleString() จน SHIB กลายเป็น 0)
 */
export function formatPriceDynamic(
  price: number,
  mode: CurrencyMode = 'USD',
  usdThbRate?: number
): string {
  return formatCryptoPrice({ price, mode, usdThbRate });
}

/* ============================================================================
 * Trading-signal validation
 *
 * ตัวเลข SL/TP ที่สลับข้างกัน (SL อยู่เหนือราคาในไม้ LONG) คือสัญญาณที่ "ผิด"
 * ไม่ใช่แค่ตัวเลขที่ดูไม่สวย — UI ต้องไม่โชว์ตัวเลขนั้นเหมือนเป็นแผนที่ใช้ได้
 * ========================================================================== */

/** ข้อความมาตรฐานเมื่อข้อมูลไม่สอดคล้อง (ใช้ร่วมกันทุกจุด) */
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

/* ============================================================================
 * Momentum label
 *
 * การ์ดโมเมนตัมเคยเขียนแค่ "บวก/ชะลอ" โดยไม่บอกกรอบเวลา และไม่บอกว่ามัน
 * ขัดกับทิศทางของสัญญาณ — ทั้งที่ Alert ส่วนหัวใช้ทิศทางของสัญญาณ
 * ========================================================================== */

/**
 * ข้อความโมเมนตัมพร้อมกรอบเวลา และหมายเหตุเมื่อสวนทางกับแนวโน้มหลัก
 * @example momentumLabel({ changePct: 2.4, timeframe: '1H', direction: 'SHORT' })
 *   // "โมเมนตัมบวก (1H) แต่แนวโน้มหลักยังเป็นขาลง"
 */
export function momentumLabel({
  changePct,
  timeframe,
  direction,
}: {
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

/* ============================================================================
 * Generic value/time formatters
 *
 * These used to be copy-pasted as local helpers inside ~8 components
 * (`formatPrice` in 5 files, `formatTime` in 3, each with its own rounding
 * rules). One implementation keeps the numbers identical everywhere.
 * ========================================================================== */

/**
 * Format any number with fixed decimals and thousands separators.
 * Returns '-' for null / undefined / NaN so a missing quote never prints "NaN".
 */
export function formatNumber(
  value: number | null | undefined,
  decimals = 2
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-';
  return value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Format a signed percentage, e.g. `+1.24%` / `-0.38%`. */
export function formatPercent(
  value: number | null | undefined,
  decimals = 2,
  withSign = true
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-';
  const sign = withSign && value > 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals)}%`;
}

/** Compact notation for large volumes: 1.2K / 3.4M / 5.6B. */
export function formatCompact(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-';
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return formatNumber(value, 2);
}

/** `19:45` (Thai locale) from an ISO timestamp; '' when unparsable. */
export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

/** `19:45` from an epoch-millisecond timestamp; '--:--' when invalid. */
export function formatClockTime(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '--:--';
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return '--:--';
  try {
    return date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '--:--';
  }
}

/** `4 พ.ย. 2026` — short Thai date for list rows. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return '';
  }
}

/** `+1.24%` with the colour token that matches the Calm palette. */
export function changeToneClass(value: number): string {
  if (!Number.isFinite(value) || value === 0) return 'text-[#A7A4B8]';
  return value > 0 ? 'text-[#7EE0B5]' : 'text-[#F4A6A6]';
}
