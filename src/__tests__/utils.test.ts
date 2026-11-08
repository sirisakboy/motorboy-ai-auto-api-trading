import { describe, it, expect, afterEach } from 'vitest';
import {
  THB_MULTIPLIER,
  getDecimals,
  getCurrencyPrefix,
  getMultiplier,
  formatPrice,
  formatPriceSimple,
  getLiveUsdThb,
  setActiveUsdThbRate,
  getActiveUsdThbRate,
  resetActiveUsdThbRate,
} from '../utils';

afterEach(() => resetActiveUsdThbRate());

describe('currency helpers', () => {
  it('returns the documented prefixes', () => {
    expect(getCurrencyPrefix('THB')).toBe('฿');
    expect(getCurrencyPrefix('USD')).toBe('$');
  });

  it('only multiplies in THB mode', () => {
    expect(getMultiplier('USD')).toBe(1);
    expect(getMultiplier('THB')).toBe(THB_MULTIPLIER);
  });

  it('scales decimals by magnitude and asset class', () => {
    expect(getDecimals(92450)).toBe(2);
    expect(getDecimals(1.0845, true)).toBe(4); // forex pair
    expect(getDecimals(0.0045)).toBe(6); // < 0.01 → 6dp
    expect(getDecimals(0.0000245)).toBe(7); // < 0.0001 (SHIB) → 7dp
    expect(getDecimals(0.0000000123)).toBe(7);
  });
});

describe('formatPrice', () => {
  it('formats USD crypto prices with a $ prefix', () => {
    expect(formatPrice({ price: 92450 })).toBe('$92,450.00');
  });

  it('converts to THB using the static multiplier', () => {
    // Characterisation test: formatPrice always uses THB_MULTIPLIER (36.45),
    // it does NOT accept the live USD/THB rate — see CODE_REVIEW.md P2-6.
    const expected = (92450 * THB_MULTIPLIER).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    expect(formatPrice({ price: 92450, mode: 'THB' })).toBe(`฿${expected}`);
  });

  it('never prefixes forex quotes with a currency symbol', () => {
    const formatted = formatPrice({ price: 1.0845, isForex: true });
    expect(formatted).not.toContain('$');
    expect(formatted).toContain('1.0845');
  });

  it('appends the quote suffix', () => {
    expect(formatPrice({ price: 3420.5, quoteSuffix: ' USDT' })).toBe('$3,420.50 USDT');
  });

  it('formatPriceSimple keeps two decimals and a prefix', () => {
    expect(formatPriceSimple(1234.5678)).toBe('$1,234.57');
  });

  it('uses the app-wide live USD/THB rate once it is published', () => {
    // App.tsx publishes the polled rate here so ticker / cards / modals agree.
    setActiveUsdThbRate(34.12);
    expect(getActiveUsdThbRate()).toBe(34.12);
    expect(getMultiplier('THB')).toBe(34.12);
    const expected = (100 * 34.12).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    expect(formatPrice({ price: 100, mode: 'THB' })).toBe(`฿${expected}`);
    // formatPriceSimple only caps decimals (no minimum) — 3,412 not 3,412.00
    expect(formatPriceSimple(100, 'THB')).toBe(`฿${(100 * 34.12).toLocaleString(undefined, { maximumFractionDigits: 2 })}`);
  });

  it('ignores an explicit rate when it is not usable, and never for USD', () => {
    setActiveUsdThbRate(34.12);
    expect(formatPrice({ price: 100, mode: 'THB', usdThbRate: 0 })).toBe(
      formatPrice({ price: 100, mode: 'THB' })
    );
    expect(getMultiplier('USD', 34.12)).toBe(1);
    expect(getMultiplier('THB', 35.5)).toBe(35.5);
  });

  it('keeps the static fallback when the live rate is missing or junk', () => {
    setActiveUsdThbRate(undefined);
    setActiveUsdThbRate(Number.NaN);
    setActiveUsdThbRate(-3);
    expect(getActiveUsdThbRate()).toBe(THB_MULTIPLIER);
  });
});

describe('getLiveUsdThb', () => {
  it('falls back to the static multiplier when no rate is available', () => {
    expect(getLiveUsdThb()).toEqual({ rate: THB_MULTIPLIER, isLive: false });
    expect(getLiveUsdThb([])).toEqual({ rate: THB_MULTIPLIER, isLive: false });
  });

  it('prefers the live USD/THB pair', () => {
    const result = getLiveUsdThb([
      { pair: 'EUR/USD', price: 1.08, isLive: true },
      { pair: 'USD/THB', price: 34.12, isLive: true },
    ]);
    expect(result).toEqual({ rate: 34.12, isLive: true });
  });

  it('rejects non-positive / non-finite rates and keeps the fallback', () => {
    expect(getLiveUsdThb([{ pair: 'USD/THB', price: 0 }]).rate).toBe(THB_MULTIPLIER);
    expect(getLiveUsdThb([{ pair: 'USD/THB', price: Number.NaN }]).rate).toBe(THB_MULTIPLIER);
  });

  it('propagates a stale (isLive:false) rate but flags it', () => {
    expect(getLiveUsdThb([{ pair: 'USD/THB', price: 35.5, isLive: false }])).toEqual({
      rate: 35.5,
      isLive: false,
    });
  });
});
