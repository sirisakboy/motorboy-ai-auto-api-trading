import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  buildCsvFileFromSnapshots,
  buildDailyCombinedBacktestCsv,
  buildDailyNewsCsv,
  buildDailyPricesCsv,
  escapeCsvCell,
  listAvailableDailySnapshots,
  loadDailySnapshots,
  persistDailySnapshotCsvs,
  type DailyArchiveSnapshotPayload,
} from '../server/dailyCsvExporter';
import { setArchiveDataDirForTest } from '../server/googleDriveArchive';
import { parseMascotAction } from '../mascot/actions';

function makeSampleSnapshots(): DailyArchiveSnapshotPayload[] {
  return [
    {
      schemaVersion: 1,
      dateKey: '2026-11-13',
      timezone: 'Asia/Bangkok',
      recordedAt: '2026-11-13T10:00:00.000Z',
      assetCount: 2,
      newsCount: 2,
      perAssetAnalysis: [
        {
          symbol: 'BTC',
          name: 'Bitcoin',
          assetClass: 'CRYPTO',
          price: 69100,
          change24hPct: -2.985,
          intradayRangePct: 4.5,
          direction: 'BEARISH',
          volatilityRegime: 'ELEVATED',
          newsDrivenVolatilityScore: 84,
          activeNewsDrivers: [
            {
              category: 'CRYPTO_ETF_REGULATION',
              categoryLabelTh: 'ข่าวคริปโต ก.ล.ต. Spot ETF & ระบบบล็อกเชน',
              matchingHeadlineCount: 1,
              dominantSentiment: 'BULLISH',
              sensitivityTier: 'EXTREME',
              sampleHeadlines: ['Spot Bitcoin ETF records inflow'],
            },
          ],
          topVolatileNewsTypes: [
            {
              category: 'CRYPTO_ETF_REGULATION',
              categoryLabelTh: 'ข่าวคริปโต ก.ล.ต. Spot ETF & ระบบบล็อกเชน',
              sensitivityScore: 95,
              sensitivityTier: 'EXTREME',
              avgAbsMovePct: 3.5,
              sampleCount: 1,
            },
          ],
        },
        {
          symbol: 'GOLD',
          name: 'Gold Futures (XAU)',
          assetClass: 'COMMODITY',
          price: 2650,
          change24hPct: 0.15,
          intradayRangePct: 0.7,
          direction: 'SIDEWAYS',
          volatilityRegime: 'LOW',
          newsDrivenVolatilityScore: 30,
          activeNewsDrivers: [],
          topVolatileNewsTypes: [],
        },
      ],
      classifiedNews: [
        {
          id: 'n-1',
          title: 'Spot Bitcoin ETF sees "record" inflow, analysts say',
          source: 'CoinDesk',
          url: 'https://example.com/btc-etf',
          publishedAt: '2026-11-13T08:00:00.000Z',
          primaryCategory: 'CRYPTO_ETF_REGULATION',
          secondaryCategories: ['MONETARY_POLICY_RATES'],
          sentiment: 'BULLISH',
          intensityScore: 78,
          matchedAssets: ['BTC', 'ETH'],
        },
        {
          id: 'n-2',
          title: 'ค่าเงินบาทแข็งค่าหลังเฟดคงดอกเบี้ย',
          source: 'Kaohoon',
          url: 'https://example.com/thb',
          publishedAt: '2026-11-13T09:00:00.000Z',
          primaryCategory: 'THAI_DOMESTIC_POLICY',
          secondaryCategories: [],
          sentiment: 'NEUTRAL',
          intensityScore: 52,
          matchedAssets: ['USD/THB', 'SET'],
        },
      ],
    },
    {
      schemaVersion: 1,
      dateKey: '2026-11-14',
      timezone: 'Asia/Bangkok',
      recordedAt: '2026-11-14T10:00:00.000Z',
      assetCount: 1,
      newsCount: 1,
      perAssetAnalysis: [
        {
          symbol: 'BTC',
          name: 'Bitcoin',
          assetClass: 'CRYPTO',
          price: 70500,
          change24hPct: 2.026,
          intradayRangePct: 3.1,
          direction: 'BULLISH',
          volatilityRegime: 'NORMAL',
          newsDrivenVolatilityScore: 66,
          activeNewsDrivers: [],
          topVolatileNewsTypes: [],
        },
      ],
      classifiedNews: [
        {
          id: 'n-3',
          title: 'Bitcoin rebounds above $70,000',
          source: 'The Block',
          url: 'https://example.com/btc-70k',
          publishedAt: '2026-11-14T07:00:00.000Z',
          primaryCategory: 'CRYPTO_ETF_REGULATION',
          secondaryCategories: [],
          sentiment: 'BULLISH',
          intensityScore: 70,
          matchedAssets: ['BTC'],
        },
      ],
    },
  ];
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('dailyCsvExporter — CSV formatting & local archive portability', () => {
  it('escapes commas, quotes, formula prefixes while preserving negative numeric returns', () => {
    expect(escapeCsvCell(-2.985)).toBe('-2.985');
    expect(escapeCsvCell('-2.985')).toBe('-2.985');
    expect(escapeCsvCell('=CMD("calc")')).toBe('"\'=CMD(""calc"")"');
    expect(escapeCsvCell('Hello, "World"')).toBe('"Hello, ""World"""');
    expect(escapeCsvCell('ข่าวคริปโต ก.ล.ต.')).toBe('ข่าวคริปโต ก.ล.ต.');
  });

  it('builds UTF-8 BOM prices, news, and combined backtest CSVs cleanly with asset filter', () => {
    const snapshots = makeSampleSnapshots();

    const prices = buildDailyPricesCsv(snapshots);
    expect(prices.content.startsWith('\uFEFFdateKey,timezone,recordedAt,symbol')).toBe(true);
    expect(prices.rowCount).toBe(3); // 2 assets on 11-13 + 1 on 11-14
    expect(prices.content).toContain('-2.985');
    expect(prices.content).toContain('MotorBoy-AI-TH-Archive/daily-csv/prices');

    const news = buildDailyNewsCsv(snapshots);
    expect(news.rowCount).toBe(3);
    expect(news.content).toContain('ค่าเงินบาทแข็งค่าหลังเฟดคงดอกเบี้ย');
    expect(news.content).toContain('MotorBoy-AI-TH-Archive/daily-csv/news');

    // Combined table keeps GOLD baseline row even though zero headlines matched GOLD
    const combinedAll = buildDailyCombinedBacktestCsv(snapshots);
    expect(combinedAll.rowCount).toBe(3);
    expect(combinedAll.content).toContain('GOLD');
    expect(combinedAll.content).toContain('MotorBoy-AI-TH-Archive/daily-csv/combined-backtest');

    // Filtering by BTC/USDT should match BTC rows across both days
    const btcBuilt = buildCsvFileFromSnapshots(snapshots, 'combined', {
      asset: 'BTC/USDT',
      customSubpath: 'strategy-alpha',
    });
    expect(btcBuilt.fileName).toBe('daily-2026-11-13_to_2026-11-14-BTC_USDT-backtest-combined.csv');
    expect(btcBuilt.archiveFolderPath).toBe(
      'MotorBoy-AI-TH-Archive/daily-csv/combined-backtest/strategy-alpha'
    );
    expect(btcBuilt.rowCount).toBe(2);
  });

  it('loads chronological daily snapshots and persists local structured CSV files', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'motorboy-csv-export-'));
    setArchiveDataDirForTest(tmpDir);

    try {
      const dailyDir = path.join(tmpDir, 'daily');
      await fs.mkdir(dailyDir, { recursive: true });
      const [snap1, snap2] = makeSampleSnapshots();
      // Write out of order to verify chronological sorting on load
      await fs.writeFile(path.join(dailyDir, 'daily-2026-11-14.json'), JSON.stringify(snap2), 'utf8');
      await fs.writeFile(path.join(dailyDir, 'daily-2026-11-13.json'), JSON.stringify(snap1), 'utf8');

      const available = await listAvailableDailySnapshots();
      expect(available.map((d) => d.dateKey)).toEqual(['2026-11-14', '2026-11-13']);

      const loaded = await loadDailySnapshots({ from: '2026-11-13', to: '2026-11-14' });
      expect(loaded.map((d) => d.dateKey)).toEqual(['2026-11-13', '2026-11-14']);

      const savedPaths = await persistDailySnapshotCsvs(snap2);
      expect(savedPaths).toHaveLength(3);
      expect(savedPaths.map((p) => path.basename(p))).toEqual([
        'daily-2026-11-14-backtest-combined.csv',
        'daily-2026-11-14-prices.csv',
        'daily-2026-11-14-news.csv',
      ]);

      for (const filePath of savedPaths) {
        const content = await fs.readFile(filePath, 'utf8');
        expect(content.startsWith('\uFEFF')).toBe(true);
        expect(content).toContain('2026-11-14');
      }
    } finally {
      setArchiveDataDirForTest(null);
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('validates export_daily_csv mascot action safely', () => {
    expect(
      parseMascotAction({
        name: 'export_daily_csv',
        args: { dataset: 'prices', destination: 'drive', dateKey: '2026-11-14' },
      })
    ).toEqual({
      name: 'export_daily_csv',
      dataset: 'prices',
      destination: 'download',
      dateKey: '2026-11-14',
    });

    expect(parseMascotAction({ name: 'export_daily_csv', args: { dateKey: 'bad-date' } })).toEqual({
      name: 'export_daily_csv',
      dataset: 'combined',
      destination: 'download',
    });
  });
});
