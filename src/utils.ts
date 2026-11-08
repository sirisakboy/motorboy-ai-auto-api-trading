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
