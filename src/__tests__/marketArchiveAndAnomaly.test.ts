import { describe, it, expect } from 'vitest';
import {
  analyzeAssetsAgainstNews,
  classifyNewsArticle,
  type AssetSnapshotInput,
  type NewsItemInput,
} from '../server/newsAssetCorrelator';
import {
  buildAnomalyWindowsCsv,
  detectRealChartAnomalyWindows,
  type BacktestAnomalyArchiveRecord,
  type HistoricalCandle,
} from '../server/backtestAnomalyRecorder';

describe('newsAssetCorrelator — per-asset direction & news-type volatility', () => {
  it('classifies headlines into specific event categories and maps impacted assets', () => {
    const fedNews = classifyNewsArticle({
      title: 'Fed signals interest rate hold ahead of CPI inflation data as Bitcoin reacts',
      source: 'CNBC',
    });
    expect(fedNews.primaryCategory).toBe('MONETARY_POLICY_RATES');
    expect(fedNews.matchedAssets).toContain('BTC');
    expect(fedNews.matchedAssets).toContain('USD/THB');

    const aiNews = classifyNewsArticle({
      title: 'Nvidia GPU demand surges on hyperscale AI Data Center capex earnings beat',
      source: 'Yahoo Finance',
    });
    expect(aiNews.primaryCategory).toBe('TECH_AI_EARNINGS');
    expect(aiNews.sentiment).toBe('BULLISH');
    expect(aiNews.matchedAssets).toContain('NVDA');
    expect(aiNews.matchedAssets).toContain('NASDAQ');
  });

  it('separates volatility sensitivity by news category per asset and avoids same-day double counting', () => {
    const assets: AssetSnapshotInput[] = [
      {
        symbol: 'BTC',
        name: 'Bitcoin',
        assetClass: 'CRYPTO',
        price: 85000,
        change24hPct: 6.4,
        high24h: 86500,
        low24h: 79800,
      },
      {
        symbol: 'USD/THB',
        name: 'USD/THB',
        assetClass: 'FOREX',
        price: 33.8,
        change24hPct: -0.85,
      },
      {
        symbol: 'NVDA',
        name: 'NVIDIA',
        assetClass: 'FOREIGN_STOCK',
        price: 145,
        change24hPct: 4.5,
      },
    ];

    const news: NewsItemInput[] = [
      {
        title: 'Spot Bitcoin ETF sees massive institutional inflow after SEC policy shift',
        source: 'CoinDesk',
      },
      {
        title: 'แบงก์ชาติ (ธปท.) และ กนง. จับตาค่าเงินบาทแข็งค่าหลังเฟดส่งสัญญาณลดดอกเบี้ย',
        source: 'Kaohoon',
      },
      {
        title: 'Nvidia AI chip revenue beats Wall Street expectations',
        source: 'Yahoo Finance',
      },
    ];

    const firstRun = analyzeAssetsAgainstNews({
      dateKey: '2026-11-14',
      assets,
      news,
    });

    const btcProfile = firstRun.perAssetAnalysis.find((a) => a.symbol === 'BTC')!;
    const thbProfile = firstRun.perAssetAnalysis.find((a) => a.symbol === 'USD/THB')!;
    const nvdaProfile = firstRun.perAssetAnalysis.find((a) => a.symbol === 'NVDA')!;

    expect(btcProfile.direction).toBe('BULLISH');
    expect(btcProfile.volatilityRegime).toBe('ELEVATED');
    expect(btcProfile.topVolatileNewsTypes[0]?.category).toBe('CRYPTO_ETF_REGULATION');

    expect(thbProfile.direction).toBe('BEARISH');
    expect(['MONETARY_POLICY_RATES', 'THAI_DOMESTIC_POLICY']).toContain(
      thbProfile.topVolatileNewsTypes[0]?.category
    );

    expect(nvdaProfile.topVolatileNewsTypes[0]?.category).toBe('TECH_AI_EARNINGS');

    // Re-running on the same dateKey must not inflate sample counts
    const repeatRun = analyzeAssetsAgainstNews({
      dateKey: '2026-11-14',
      assets,
      news,
      existingMatrix: firstRun.updatedMatrix,
    });
    expect(repeatRun.updatedMatrix.assets.BTC.totalObservations).toBe(1);
    expect(repeatRun.updatedMatrix.assets.BTC.byCategory.CRYPTO_ETF_REGULATION?.sampleCount).toBe(1);
  });
});

describe('backtestAnomalyRecorder — real-chart anomaly date window detection', () => {
  it('groups sudden real-chart crashes and volume spikes into explicit lookup date windows', () => {
    const startMs = new Date('2026-09-01T00:00:00Z').getTime();
    const candles: HistoricalCandle[] = [];
    let price = 65000;

    for (let i = 0; i < 40; i++) {
      const ts = startMs + i * 86_400_000;
      const date = new Date(ts).toISOString().slice(0, 10);
      let open = price;
      let close = +(price * (1 + (i % 2 === 0 ? 0.004 : -0.003))).toFixed(2);
      let high = +(Math.max(open, close) * 1.007).toFixed(2);
      let low = +(Math.min(open, close) * 0.993).toFixed(2);
      let volume = 10000;

      // Inject an abnormal 2-day crash + climax volume on indices 28 & 29
      if (i === 28) {
        close = +(open * 0.91).toFixed(2);
        high = +(open * 1.01).toFixed(2);
        low = +(close * 0.98).toFixed(2);
        volume = 42000;
      } else if (i === 29) {
        close = +(open * 0.94).toFixed(2);
        high = +(open * 1.02).toFixed(2);
        low = +(close * 0.97).toFixed(2);
        volume = 38000;
      }

      candles.push({ date, timestamp: ts, open, high, low, close, volume });
      price = close;
    }

    const windows = detectRealChartAnomalyWindows(candles, 'BTC/USDT', 'CRYPTO');
    expect(windows.length).toBeGreaterThanOrEqual(1);

    const crashWindow = windows[0];
    expect(crashWindow.startDate).toBe(candles[28].date);
    expect(crashWindow.endDate).toBe(candles[29].date);
    expect(crashWindow.direction).toBe('BEARISH_SPIKE');
    expect(crashWindow.cumulativeMovePct).toBeLessThan(-12);
    expect(crashWindow.anomalyTypes).toContain('EXTREME_PRICE_SHOCK');
    expect(crashWindow.anomalyTypes).toContain('VOLUME_CLIMAX');
    expect(crashWindow.likelyNewsCategoriesToCheck.length).toBeGreaterThan(0);

    const record: BacktestAnomalyArchiveRecord = {
      archiveId: 'bt_test',
      recordedAt: '2026-11-14T00:00:00Z',
      strategyId: 'RSI_CROSSOVER',
      assetSymbol: 'BTC/USDT',
      assetClass: 'CRYPTO',
      timeframe: '1d',
      periodDays: 40,
      historicalFeedSource: 'BINANCE_SPOT_DAILY',
      realCandleCount: candles.length,
      periodStartDate: candles[0].date,
      periodEndDate: candles[candles.length - 1].date,
      anomalyCount: windows.length,
      anomalyWindows: windows,
    };
    const csv = buildAnomalyWindowsCsv(record);
    expect(csv).toContain('startDate,endDate,peakDate');
    expect(csv).toContain(candles[28].date);
  });
});

describe('historicalCandleCache — 1-asset/day rotation & 1,000-day internal-first backtest feed', () => {
  it('rotates strictly one asset per day and serves subsequent backtests from internal archive without fetching', async () => {
    const fs = await import('node:fs/promises');
    const os = await import('node:os');
    const path = await import('node:path');
    const { vi } = await import('vitest');
    const {
      getHistoricalCandlesInternalFirst,
      rotateOneAsset1000DayHistory,
    } = await import('../server/historicalCandleCache');

    const {
      setArchiveDataDirForTest,
    } = await import('../server/googleDriveArchive');

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'motorboy-cache-test-'));
    setArchiveDataDirForTest(tmpDir);

    // Mock 1,000 daily candles from Binance API
    const mockKlines = Array.from({ length: 1000 }, (_, i) => {
      const ts = new Date('2024-01-01T00:00:00Z').getTime() + i * 86_400_000;
      const open = 40000 + i * 15;
      return [ts, String(open), String(open + 120), String(open - 80), String(open + 50), '1500'];
    });

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => mockKlines,
    }));
    vi.stubGlobal('fetch', fetchMock);

    try {
      // Day 1 rotation refreshes index 0 (BTC, 1,000 candles)
      const day1 = await rotateOneAsset1000DayHistory('2026-11-14');
      expect(day1.rotated).toBe(true);
      expect(day1.skipped).toBe(false);
      expect(day1.assetSymbol).toBe('BTC');
      expect(day1.candleCount).toBe(1000);
      expect(day1.nextAssetIndex).toBe(1);

      // Re-running on the SAME date skips cleanly (strictly 1 asset per day)
      const day1Repeat = await rotateOneAsset1000DayHistory('2026-11-14');
      expect(day1Repeat.rotated).toBe(false);
      expect(day1Repeat.skipped).toBe(true);
      expect(day1Repeat.reason).toBe('ALREADY_ROTATED_ONE_ASSET_TODAY');

      // Backtest request for BTC serves directly from internal cache with ZERO external fetch calls
      fetchMock.mockClear();
      const internalServe = await getHistoricalCandlesInternalFirst('BTCUSDT', 365);
      expect(internalServe.usedInternalCache).toBe(true);
      expect(internalServe.externalFetchPerformed).toBe(false);
      expect(internalServe.totalCachedCandles).toBe(1000);
      expect(internalServe.candles.length).toBeGreaterThanOrEqual(365);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
      setArchiveDataDirForTest(null);
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});
