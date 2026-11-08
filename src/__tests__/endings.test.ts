import { describe, it, expect } from 'vitest';

import {
  analyzeEndings,
  atr,
  mapBinanceKlines,
  clearEndingsCache,
} from '../mascot/endings';
import { DEFAULT_ENDINGS_MODEL } from '../mascot/endingsModel';
import type { Ohlcv } from '../mascot/types';

/**
 * AI ENDINGS ANALYZE — deterministic unit tests.
 *
 * The brain must answer with the *same* ending for the *same* candles every
 * time (no RNG, injectable clock). These tests build synthetic OHLCV series that
 * correspond 1:1 to the four endings in the V4.1 spec.
 */

const MODEL = DEFAULT_ENDINGS_MODEL;
const NOW = Date.UTC(2026, 10, 4, 3, 0, 0);

const bar = (o: number, h: number, l: number, c: number, v: number, i = 0): Ohlcv => ({
  open: o,
  high: h,
  low: l,
  close: c,
  volume: v,
  time: NOW - (200 - i) * 3_600_000,
});

/** Steady climb then a volume-backed break to a new high → BULL_END. */
function bullSeries(): Ohlcv[] {
  const out: Ohlcv[] = [];
  for (let i = 0; i < 43; i += 1) {
    const open = 100 + 0.5 * i;
    const close = open + 0.5;
    out.push(bar(open, close + 0.2, open - 0.2, close, 100, i));
  }
  out.push(bar(121.5, 124.2, 121.3, 124, 300, 43));
  return out;
}

/** Mirror of the above: new low printed on heavy volume → BEAR_END. */
function bearSeries(): Ohlcv[] {
  const out: Ohlcv[] = [];
  for (let i = 0; i < 43; i += 1) {
    const open = 100 - 0.5 * i;
    const close = open - 0.5;
    out.push(bar(open, open + 0.2, close - 0.2, close, 100, i));
  }
  out.push(bar(78.5, 78.7, 73.8, 74, 300, 43));
  return out;
}

/** Tight box, volume steady → no decision yet → SIDEWAY_END. */
function sidewaysSeries(): Ohlcv[] {
  return Array.from({ length: 44 }, (_, i) => bar(100, 100.6, 99.4, 100.05, 100, i));
}

/** Long dry box (volume drains away) then one huge expansion → BREAKOUT_END. */
function breakoutSeries(): Ohlcv[] {
  return Array.from({ length: 44 }, (_, i) => {
    const volume = i <= 12 ? 100 : i <= 22 ? 5 : i <= 42 ? 50 : 200;
    const close = i === 43 ? 101.2 : 100.05;
    const high = i === 43 ? 101.4 : 100.6;
    return bar(100, high, 99.4, close, volume, i);
  });
}

function analyze(candles: Ohlcv[]) {
  return analyzeEndings(candles, { model: MODEL, now: NOW, symbol: 'BTCUSDT' });
}

describe('analyzeEndings — the four endings', () => {
  it('detects BULL_END when the close takes out the prior high on volume', () => {
    const result = analyze(bullSeries());
    expect(result?.type).toBe('BULL_END');
    expect(result!.prob).toBeGreaterThanOrEqual(MODEL.prob.BULL_END.min);
    expect(result!.prob).toBeLessThanOrEqual(MODEL.prob.BULL_END.max);
    // target sits above the close, in ATR multiple space
    expect(result!.target).toBeGreaterThan(124);
    expect(result!.oneLineTH).toContain('จบขาขึ้น');
  });

  it('detects BEAR_END when the close loses the prior low on volume', () => {
    const result = analyze(bearSeries());
    expect(result?.type).toBe('BEAR_END');
    expect(result!.prob).toBeGreaterThanOrEqual(MODEL.prob.BEAR_END.min);
    expect(result!.target).toBeLessThan(74);
    expect(result!.oneLineTH).toContain('จบขาลง');
  });

  it('detects SIDEWAY_END for a compressed box without a decision', () => {
    const result = analyze(sidewaysSeries());
    expect(result?.type).toBe('SIDEWAY_END');
    expect(result!.prob).toBeGreaterThanOrEqual(MODEL.prob.SIDEWAY_END.min);
    expect(result!.prob).toBeLessThanOrEqual(MODEL.prob.SIDEWAY_END.max);
    expect(result!.oneLineTH).toContain('Sideway');
    expect(result!.support).toBeLessThan(result!.resistance);
  });

  it('prefers BREAKOUT_END over BULL_END when volume had dried up inside the box', () => {
    const result = analyze(breakoutSeries());
    expect(result?.type).toBe('BREAKOUT_END');
    expect(result!.prob).toBeLessThanOrEqual(MODEL.prob.BREAKOUT_END.max);
    expect(result!.oneLineTH).toContain('เบรก');
    expect(result!.reasons.join(' ')).toContain('Volume');
  });

  it('respects explicitly supplied support/resistance from the chart', () => {
    const result = analyzeEndings(bullSeries(), {
      model: MODEL,
      now: NOW,
      support: 118.5,
      resistance: 130,
    });
    expect(result!.support).toBe(118.5);
    expect(result!.resistance).toBe(130);
  });

  it('says nothing at all when there is no ending worth speaking about', () => {
    // 43 bars that drift up without any volume expansion and without compression
    const candles = Array.from({ length: 43 }, (_, i) => {
      const open = 100 + 0.4 * i;
      const close = open + 0.4;
      return bar(open, close + 0.3, open - 0.3, close, 100 + (i % 7) * 12, i);
    });
    expect(analyze(candles)).toBeNull();
  });

  it('is deterministic: identical candles in, identical ending out', () => {
    const a = analyze(bullSeries());
    const b = analyze(bullSeries());
    expect(a).toEqual(b);
    expect(a!.at).toBe(new Date(NOW).toISOString());
  });

  it('stays silent below minCandles instead of guessing', () => {
    expect(analyze(bullSeries().slice(0, MODEL.minCandles - 1))).toBeNull();
  });

  it('speaks exactly one short Thai sentence', () => {
    for (const series of [bullSeries(), bearSeries(), sidewaysSeries(), breakoutSeries()]) {
      const line = analyze(series)!.oneLineTH;
      expect(line).not.toContain('\n');
      expect(line.length).toBeLessThanOrEqual(120);
    }
  });

  it('survives junk candles (NaN / inverted high-low) by ignoring them', () => {
    const dirty: Ohlcv[] = [
      ...bullSeries(),
      { open: NaN, high: NaN, low: NaN, close: NaN, volume: NaN },
      { open: 100, high: 90, low: 110, close: 100, volume: 10 },
    ];
    expect(analyze(dirty)?.type).toBe('BULL_END');
  });
});

describe('atr', () => {
  it('averages true range over the requested period', () => {
    const candles: Ohlcv[] = [
      bar(10, 11, 9, 10, 1, 0),
      bar(10, 12, 10, 11, 1, 1),
      bar(11, 13, 11, 12, 1, 2),
    ];
    // TR of the last bar = max(13-11, |13-12|, |11-12|) = 2
    expect(atr(candles, 1)).toBeCloseTo(2, 6);
    // over all bars: (2 + 2 + 2) / 3 = 2
    expect(atr(candles, 14)).toBeCloseTo(2, 6);
  });

  it('returns 0 for a series that cannot produce a range', () => {
    expect(atr([], 14)).toBe(0);
    expect(atr([bar(10, 10, 10, 10, 1, 0)], 14)).toBe(0);
  });
});

describe('mapBinanceKlines', () => {
  it('maps the public REST shape to Ohlcv', () => {
    const rows = [
      [1699999200000, '100.5', '101.5', '99.5', '101.0', '1234.5', 1699999259999],
      [1700002800000, '101.0', '102.0', '100.0', '100.2', '999', 1700002859999],
    ];
    const candles = mapBinanceKlines(rows);
    expect(candles).toHaveLength(2);
    expect(candles[0]).toEqual({
      open: 100.5,
      high: 101.5,
      low: 99.5,
      close: 101.0,
      volume: 1234.5,
      time: 1699999259999,
    });
  });

  it('drops malformed rows instead of poisoning the analysis', () => {
    const rows: unknown = [
      'not-a-row',
      [1, 'x', '2', '3', '4', '5', '6'],
      null,
      [1, '1', '2', '0.5', '1.5', '10', '11'],
    ];
    expect(mapBinanceKlines(rows)).toHaveLength(1);
    expect(mapBinanceKlines(undefined)).toEqual([]);
    expect(mapBinanceKlines({})).toEqual([]);
  });
});

describe('clearEndingsCache', () => {
  it('is safe to call with no feed (no throw in a fresh test env)', () => {
    expect(() => clearEndingsCache()).not.toThrow();
  });
});
