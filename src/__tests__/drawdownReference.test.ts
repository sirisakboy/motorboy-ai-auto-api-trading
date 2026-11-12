import { describe, it, expect } from 'vitest';
import {
  buildDrawdownAssets,
  computePortfolioDrawdownSummary,
  DEFAULT_THRESHOLDS,
} from '../services/drawdownService';
import type { CryptoCoin, ForeignStock } from '../types';

const coin = (over: Partial<CryptoCoin> = {}): CryptoCoin => ({
  id: 'shib',
  symbol: 'SHIB',
  name: 'Shiba Inu',
  binanceSymbol: 'SHIBUSDT',
  price: 0.000005,
  change: 2.4,
  ...over,
});

const usStock = (over: Partial<ForeignStock> = {}): ForeignStock =>
  ({
    symbol: 'AAPL',
    name: 'Apple',
    price: 200,
    change: 1,
    high52w: 260,
    low52w: 160,
    ...over,
  } as ForeignStock);

describe('drawdown — real reference points only', () => {
  it('never invents a -85% drawdown from a hardcoded ATH (SHIB regression)', () => {
    const [asset] = buildDrawdownAssets({
      cryptoList: [coin()],
      thresholds: DEFAULT_THRESHOLDS,
    });

    expect(asset.referenceSource).toBe('NONE');
    expect(asset.currentDrawdownPct).toBe(0);
    expect(asset.status).toBe('NORMAL');
    expect(asset.peakPrice).toBe(asset.currentPrice);
    // จุดสำคัญ: ต้องไม่มีการแต่ง peak ขึ้นมาเป็น 1.25 เท่าของราคา
    expect(asset.recoveryNeededPct).toBe(0);
  });

  it('uses a user-recorded peak when present', () => {
    const [asset] = buildDrawdownAssets({
      cryptoList: [coin()],
      thresholds: DEFAULT_THRESHOLDS,
      customPeaks: { SHIB: 0.00002 },
    });

    expect(asset.referenceSource).toBe('CUSTOM');
    expect(asset.currentDrawdownPct).toBeCloseTo(-75, 0);
    expect(asset.status).toBe('EXTREME');
    expect(asset.recoveryNeededPct).toBeCloseTo(300, 0);
  });

  it('accepts the 52-week high from the data provider for US stocks', () => {
    const [asset] = buildDrawdownAssets({
      foreignStocks: [usStock()],
      thresholds: DEFAULT_THRESHOLDS,
    });

    expect(asset.referenceSource).toBe('API_52W');
    expect(asset.currentDrawdownPct).toBeCloseTo(-23.08, 1);
    expect(asset.status).toBe('CRITICAL');
  });

  it('rejects nonsensical peaks (below price, or 20x off scale)', () => {
    const [below] = buildDrawdownAssets({
      cryptoList: [coin()],
      thresholds: DEFAULT_THRESHOLDS,
      customPeaks: { SHIB: 0.000001 }, // ต่ำกว่าราคาปัจจุบัน = ไม่ใช่จุดพีค
    });
    expect(below.referenceSource).toBe('NONE');

    const [absurd] = buildDrawdownAssets({
      cryptoList: [coin()],
      thresholds: DEFAULT_THRESHOLDS,
      customPeaks: { SHIB: 5 }, // ผิดสเกล (เช่นกรอกหน่วยผิด)
    });
    expect(absurd.referenceSource).toBe('NONE');
  });

  it('ignores assets without a reference when summarising the portfolio', () => {
    const assets = buildDrawdownAssets({
      cryptoList: [coin(), coin({ id: 'btc', symbol: 'BTC', name: 'Bitcoin', price: 90000 })],
      thresholds: DEFAULT_THRESHOLDS,
      customPeaks: { SHIB: 0.00002 },
    });

    const summary = computePortfolioDrawdownSummary(assets);
    expect(summary.monitoredCount).toBe(1);
    expect(summary.worstAssetSymbol).toBe('SHIB');
    expect(summary.extremeCount).toBe(1);
  });

  it('returns a truthful empty state when nothing has a reference yet', () => {
    const assets = buildDrawdownAssets({
      cryptoList: [coin()],
      thresholds: DEFAULT_THRESHOLDS,
    });
    const summary = computePortfolioDrawdownSummary(assets);

    expect(summary.monitoredCount).toBe(0);
    expect(summary.portfolioStatus).toBe('NORMAL');
    expect(summary.recommendedActionTh).toContain('ยังไม่มีจุดอ้างอิง');
  });

  it('rounds micro-cap prices without collapsing them to 0', () => {
    const [asset] = buildDrawdownAssets({
      cryptoList: [coin()],
      thresholds: DEFAULT_THRESHOLDS,
      customPeaks: { SHIB: 0.00002 },
    });
    expect(asset.peakPrice).toBe(0.00002);
    expect(asset.declineAmount).toBeCloseTo(0.000015, 8);
    expect(asset.declineAmount).toBeGreaterThan(0);
  });
});
