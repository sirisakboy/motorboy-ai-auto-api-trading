import { describe, it, expect } from 'vitest';
import {
  generateHistoricalCandles,
  runBacktestWithProgress,
  STRATEGY_DEFINITIONS,
  type BacktestConfig,
} from '../services/backtestService';

const baseConfig: BacktestConfig = {
  strategyId: STRATEGY_DEFINITIONS[0].id,
  assetSymbol: 'BTCUSDT',
  timeframe: '1h',
  periodDays: 30,
  initialCapital: 10000,
  riskPerTradePct: 2,
};

describe('generateHistoricalCandles', () => {
  it('produces a well-formed, chronologically ordered OHLCV series', () => {
    const candles = generateHistoricalCandles({
      symbol: 'BTCUSDT',
      periodDays: 10,
      timeframe: '1h',
      currentPrice: 90000,
    });
    expect(candles.length).toBeGreaterThan(0);
    for (const c of candles) {
      expect(c.high).toBeGreaterThanOrEqual(c.close);
      expect(c.high).toBeGreaterThanOrEqual(c.open);
      expect(c.low).toBeLessThanOrEqual(c.close);
      expect(c.low).toBeLessThanOrEqual(c.open);
      expect(c.volume).toBeGreaterThan(0);
      expect(Number.isFinite(c.close)).toBe(true);
    }
  });

  it('is deterministic for the same symbol/params (no Math.random)', () => {
    const params = { symbol: 'ETHUSDT', periodDays: 5, timeframe: '15m' as const, currentPrice: 3400 };
    const a = generateHistoricalCandles(params);
    const b = generateHistoricalCandles(params);
    expect(b.map((c) => c.close)).toEqual(a.map((c) => c.close));
  });

  it('is SYNTHETIC: different symbols yield different paths from the same seed inputs', () => {
    // Documents CODE_REVIEW.md P2-1 — no exchange data is fetched, the walk is
    // derived from a symbol hash. If this ever becomes a real fetch, delete this
    // test and replace it with a recorded-fixture test.
    const btc = generateHistoricalCandles({ symbol: 'BTCUSDT', periodDays: 5, timeframe: '1d', currentPrice: 90000 });
    const eth = generateHistoricalCandles({ symbol: 'ETHUSDT', periodDays: 5, timeframe: '1d', currentPrice: 90000 });
    expect(btc.map((c) => c.close)).not.toEqual(eth.map((c) => c.close));
  });
});

describe('runBacktestWithProgress', () => {
  it('completes and returns a full metrics payload', async () => {
    const result = await runBacktestWithProgress(baseConfig, 90000);
    expect(result.strategyId).toBe(baseConfig.strategyId);
    expect(result.initialCapital).toBe(10000);
    expect(Number.isFinite(result.finalEquity)).toBe(true);
    expect(Number.isFinite(result.totalReturnPct)).toBe(true);
    expect(Number.isFinite(result.sharpeRatio)).toBe(true);
    expect(result.winRatePct).toBeGreaterThanOrEqual(0);
    expect(result.winRatePct).toBeLessThanOrEqual(100);
    expect(result.totalTrades).toBe(result.winningTrades + result.losingTrades);
    expect(result.equityCurve.length).toBe(result.totalTrades);
  });

  it('reports monotonically increasing progress percentages', async () => {
    const seen: number[] = [];
    await runBacktestWithProgress(baseConfig, 90000, (t) => {
      seen.push(t.percent);
      expect(t.processedCandles).toBeLessThanOrEqual(t.totalCandles);
      expect(t.candlesPerSec).toBeGreaterThanOrEqual(0);
    });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[seen.length - 1]).toBe(100);
    expect([...seen].sort((a, b) => a - b)).toEqual(seen);
  });

  it('is deterministic for identical configs', async () => {
    const a = await runBacktestWithProgress(baseConfig, 90000);
    const b = await runBacktestWithProgress(baseConfig, 90000);
    expect(b.winRatePct).toBe(a.winRatePct);
    expect(b.finalEquity).toBe(a.finalEquity);
    expect(b.totalTrades).toBe(a.totalTrades);
  });

  it('CHARACTERISATION: win rate is driven by a hardcoded per-strategy bias', async () => {
    // CODE_REVIEW.md P2-1. These win rates fall out of `winBias` in the source,
    // NOT out of market data — and the arcsine distribution of the seed means
    // the realised rate overshoots the nominal bias (0.64 bias -> 68.8%).
    // Pinned so any "real data" rewrite must update this expectation on purpose.
    const observed: Record<string, number> = {};
    for (const def of STRATEGY_DEFINITIONS) {
      const result = await runBacktestWithProgress({ ...baseConfig, strategyId: def.id }, 90000);
      observed[def.id] = result.winRatePct;
      expect(result.winRatePct).toBeGreaterThan(50);
      expect(result.winRatePct).toBeLessThan(80);
      expect(result.totalTrades).toBe(32); // identical trade count for every strategy
    }
    expect(observed.NIULAI4_TORUS_ARB).toBeGreaterThanOrEqual(observed.RSI_CROSSOVER);
    expect(observed.BOLLINGER_BANDS).toBeLessThan(observed.RSI_CROSSOVER);
  }, 30_000);

  it('KNOWN BUG: an unknown strategy id is echoed back instead of the one used', async () => {
    // runBacktestWithProgress falls back to STRATEGY_DEFINITIONS[0] for its
    // parameters but reports `config.strategyId` verbatim, so the result claims
    // a strategy that was never executed.
    const result = await runBacktestWithProgress(
      { ...baseConfig, strategyId: 'DOES_NOT_EXIST' as BacktestConfig['strategyId'] },
      90000
    );
    expect(result.strategyId).toBe('DOES_NOT_EXIST');
    expect(result.strategyName).toBe(STRATEGY_DEFINITIONS[0].nameTh);
  });

  it('never lets equity go negative', async () => {
    const result = await runBacktestWithProgress({ ...baseConfig, riskPerTradePct: 100 }, 90000);
    expect(result.finalEquity).toBeGreaterThan(0);
    for (const point of result.equityCurve) {
      expect(point.equity).toBeGreaterThan(0);
    }
  });
});
