/**
 * Backend Real-Chart Backtest Anomaly Detector & Archiver.
 *
 * Fetches real historical OHLCV candles from Binance (crypto) and Yahoo Finance
 * (Forex, indices, Thai/US stocks, gold), identifies abnormal chart windows
 * (price shocks, volatility expansions, volume climaxes, overnight gaps), and
 * outputs exact ISO date ranges (`startDate`, `endDate`, `peakDate`) plus likely
 * news categories so the operator can look up historical news for those dates.
 */

import {
  type AssetClass,
  type NewsEventCategory,
  NEWS_CATEGORY_LABELS_TH,
  getStructuralCategoryMultiplier,
} from './newsAssetCorrelator';

export interface HistoricalCandle {
  date: string; // YYYY-MM-DD (UTC/market date)
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type ChartAnomalyType =
  | 'EXTREME_PRICE_SHOCK'
  | 'VOLATILITY_EXPANSION'
  | 'VOLUME_CLIMAX'
  | 'OVERNIGHT_GAP';

export interface AnomalyBarFlag {
  date: string;
  close: number;
  dailyReturnPct: number;
  intradayRangePct: number;
  gapPct: number;
  returnZScore: number;
  rangeMultiplier: number;
  volumeSpikeRatio: number;
  anomalyTypes: ChartAnomalyType[];
}

export interface RealChartAnomalyWindow {
  windowId: string;
  assetSymbol: string;
  startDate: string;
  endDate: string;
  peakDate: string;
  durationDays: number;
  flaggedBarCount: number;
  anomalyTypes: ChartAnomalyType[];
  direction: 'BULLISH_SPIKE' | 'BEARISH_SPIKE' | 'WHIPSAW_VOLATILITY';
  cumulativeMovePct: number;
  maxSingleDayMovePct: number;
  maxIntradayRangePct: number;
  peakZScore: number;
  maxVolumeSpikeRatio: number;
  startClose: number;
  endClose: number;
  peakHigh: number;
  troughLow: number;
  likelyNewsCategoriesToCheck: Array<{
    category: NewsEventCategory;
    categoryLabelTh: string;
    relevanceMultiplier: number;
  }>;
  newsLookupQueryHint: string;
  summaryTh: string;
}

export interface BacktestAnomalyArchiveRecord {
  archiveId: string;
  recordedAt: string;
  strategyId: string;
  strategyName?: string;
  assetSymbol: string;
  assetClass: AssetClass;
  timeframe: string;
  periodDays: number;
  historicalFeedSource: 'BINANCE_SPOT_DAILY' | 'YAHOO_FINANCE_DAILY' | 'SYNTHETIC_FALLBACK';
  realCandleCount: number;
  periodStartDate: string | null;
  periodEndDate: string | null;
  backtestMetrics?: Record<string, unknown>;
  anomalyCount: number;
  anomalyWindows: RealChartAnomalyWindow[];
}

export function inferAssetClass(symbol: string): AssetClass {
  const s = symbol.toUpperCase();
  if (s.includes('BTC') || s.includes('ETH') || s.includes('SOL') || s.includes('BNB') || s.includes('XRP') || s.includes('SHIB')) {
    return 'CRYPTO';
  }
  if (s.includes('/')) return 'FOREX';
  if (['SET', 'NASDAQ', 'S&P500', 'DJI'].includes(s)) return 'INDEX';
  if (s === 'GOLD' || s === 'XAU/USD' || s === 'GC=F') return 'COMMODITY';
  if (['AOT', 'CPALL', 'SCC', 'PTT', 'DELTA', 'KBANK', 'BH', 'ADVANC', 'GULF', 'TRUE'].includes(s)) {
    return 'THAI_STOCK';
  }
  return 'FOREIGN_STOCK';
}

function normalizeCryptoPair(symbol: string): string {
  const clean = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (clean.endsWith('USDT')) return clean;
  return `${clean}USDT`;
}

function resolveYahooSymbol(symbol: string, assetClass: AssetClass): string {
  const s = symbol.toUpperCase().trim();
  const explicitMap: Record<string, string> = {
    SET: '^SET.BK',
    NASDAQ: '^IXIC',
    'S&P500': '^GSPC',
    DJI: '^DJI',
    GOLD: 'GC=F',
    'XAU/USD': 'GC=F',
    'USD/THB': 'THB=X',
    'USD/JPY': 'JPY=X',
    'USD/CHF': 'CHF=X',
    'EUR/USD': 'EURUSD=X',
    'GBP/USD': 'GBPUSD=X',
    'AUD/USD': 'AUDUSD=X',
  };
  if (explicitMap[s]) return explicitMap[s];
  if (assetClass === 'THAI_STOCK' && !s.endsWith('.BK')) return `${s}.BK`;
  return s;
}

export async function fetchRealHistoricalDailyCandles(
  assetSymbol: string,
  periodDays = 90
): Promise<{
  candles: HistoricalCandle[];
  source: 'BINANCE_SPOT_DAILY' | 'YAHOO_FINANCE_DAILY' | 'SYNTHETIC_FALLBACK';
}> {
  const assetClass = inferAssetClass(assetSymbol);
  const clampedDays = Math.min(1000, Math.max(30, Math.round(periodDays)));

  if (assetClass === 'CRYPTO') {
    const pair = normalizeCryptoPair(assetSymbol);
    try {
      const limit = Math.min(1000, clampedDays === 1000 ? 1000 : clampedDays + 25); // extra lookback for rolling baseline
      const res = await fetch(
        `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(pair)}&interval=1d&limit=${limit}`,
        { signal: AbortSignal.timeout(8000) }
      );
      if (res.ok) {
        const rows = (await res.json()) as unknown[][];
        if (Array.isArray(rows) && rows.length > 5) {
          const candles: HistoricalCandle[] = rows
            .map((r) => {
              const ts = Number(r[0]);
              return {
                date: new Date(ts).toISOString().slice(0, 10),
                timestamp: ts,
                open: Number(r[1]),
                high: Number(r[2]),
                low: Number(r[3]),
                close: Number(r[4]),
                volume: Number(r[5]),
              };
            })
            .filter((c) => Number.isFinite(c.close) && c.close > 0);
          if (candles.length > 5) {
            return { candles, source: 'BINANCE_SPOT_DAILY' };
          }
        }
      }
    } catch {
      // fall through to Yahoo / fallback
    }
  }

  const yahooSymbol =
    assetClass === 'CRYPTO'
      ? `${assetSymbol.toUpperCase().replace('/USDT', '').replace('USDT', '')}-USD`
      : resolveYahooSymbol(assetSymbol, assetClass);

  const range =
    clampedDays <= 60 ? '3mo' : clampedDays <= 150 ? '6mo' : clampedDays <= 340 ? '1y' : clampedDays <= 680 ? '2y' : '5y';

  for (const host of ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com']) {
    try {
      const url = `${host}/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1d&range=${range}`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const json = (await res.json()) as {
        chart?: {
          result?: Array<{
            timestamp?: number[];
            indicators?: {
              quote?: Array<{
                open?: Array<number | null>;
                high?: Array<number | null>;
                low?: Array<number | null>;
                close?: Array<number | null>;
                volume?: Array<number | null>;
              }>;
            };
          }>;
        };
      };
      const result = json.chart?.result?.[0];
      const timestamps = result?.timestamp || [];
      const quote = result?.indicators?.quote?.[0];
      if (!quote || timestamps.length < 5) continue;

      const candles: HistoricalCandle[] = [];
      for (let i = 0; i < timestamps.length; i++) {
        const tsMs = timestamps[i] * 1000;
        const close = quote.close?.[i];
        if (typeof close !== 'number' || !Number.isFinite(close) || close <= 0) continue;
        const open = typeof quote.open?.[i] === 'number' && quote.open[i]! > 0 ? quote.open[i]! : close;
        const high = typeof quote.high?.[i] === 'number' && quote.high[i]! > 0 ? quote.high[i]! : Math.max(open, close);
        const low = typeof quote.low?.[i] === 'number' && quote.low[i]! > 0 ? quote.low[i]! : Math.min(open, close);
        const volume = typeof quote.volume?.[i] === 'number' && quote.volume[i]! >= 0 ? quote.volume[i]! : 0;
        candles.push({
          date: new Date(tsMs).toISOString().slice(0, 10),
          timestamp: tsMs,
          open,
          high,
          low,
          close,
          volume,
        });
      }

      if (candles.length > 5) {
        return { candles, source: 'YAHOO_FINANCE_DAILY' };
      }
    } catch {
      // try next host
    }
  }

  return { candles: [], source: 'SYNTHETIC_FALLBACK' };
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function meanAndStd(values: number[]): { mean: number; std: number } {
  if (values.length === 0) return { mean: 0, std: 0 };
  const mean = values.reduce((acc, v) => acc + v, 0) / values.length;
  const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
  return { mean, std: Math.sqrt(variance) };
}

function daysBetween(dateA: string, dateB: string): number {
  const ms = Math.abs(new Date(`${dateB}T00:00:00Z`).getTime() - new Date(`${dateA}T00:00:00Z`).getTime());
  return Math.round(ms / 86_400_000);
}

/**
 * Pure statistical anomaly detector across real OHLCV candles.
 * Groups adjacent abnormal days into explicit date windows so news can be matched
 * historically without guesswork.
 */
export function detectRealChartAnomalyWindows(
  candles: HistoricalCandle[],
  assetSymbol: string,
  assetClass: AssetClass = inferAssetClass(assetSymbol)
): RealChartAnomalyWindow[] {
  if (candles.length < 10) return [];

  const sorted = [...candles].sort((a, b) => a.timestamp - b.timestamp);
  const flaggedBars: AnomalyBarFlag[] = [];
  const lookback = 20;

  const minGapPct = assetClass === 'CRYPTO' ? 4.0 : assetClass === 'FOREX' ? 0.9 : 2.2;
  const minAbsMoveFloor = assetClass === 'FOREX' ? 0.65 : assetClass === 'CRYPTO' ? 3.5 : 1.8;

  for (let i = 5; i < sorted.length; i++) {
    const bar = sorted[i];
    const prev = sorted[i - 1];
    const startIdx = Math.max(1, i - lookback);

    const histReturns: number[] = [];
    const histRanges: number[] = [];
    const histVolumes: number[] = [];

    for (let j = startIdx; j < i; j++) {
      const b = sorted[j];
      const p = sorted[j - 1];
      if (p.close > 0) {
        histReturns.push(((b.close - p.close) / p.close) * 100);
      }
      if (b.open > 0) {
        histRanges.push(((b.high - b.low) / b.open) * 100);
      }
      if (b.volume > 0) {
        histVolumes.push(b.volume);
      }
    }

    const dailyReturnPct = prev.close > 0 ? ((bar.close - prev.close) / prev.close) * 100 : 0;
    const intradayRangePct = bar.open > 0 ? ((bar.high - bar.low) / bar.open) * 100 : 0;
    const gapPct = prev.close > 0 ? ((bar.open - prev.close) / prev.close) * 100 : 0;

    const { mean, std } = meanAndStd(histReturns);
    const safeStd = Math.max(std, minAbsMoveFloor * 0.45);
    const returnZScore = (dailyReturnPct - mean) / safeStd;

    const medianRange = Math.max(0.15, median(histRanges));
    const rangeMultiplier = intradayRangePct / medianRange;

    const avgVolume = histVolumes.length > 0 ? histVolumes.reduce((a, v) => a + v, 0) / histVolumes.length : 0;
    const volumeSpikeRatio = avgVolume > 0 && bar.volume > 0 ? bar.volume / avgVolume : 1;

    const anomalyTypes: ChartAnomalyType[] = [];
    if (Math.abs(returnZScore) >= 2.1 && Math.abs(dailyReturnPct) >= minAbsMoveFloor) {
      anomalyTypes.push('EXTREME_PRICE_SHOCK');
    }
    if (rangeMultiplier >= 2.25 && intradayRangePct >= minAbsMoveFloor) {
      anomalyTypes.push('VOLATILITY_EXPANSION');
    }
    if (avgVolume > 0 && volumeSpikeRatio >= 2.2 && (Math.abs(dailyReturnPct) >= minAbsMoveFloor * 0.6 || rangeMultiplier >= 1.5)) {
      anomalyTypes.push('VOLUME_CLIMAX');
    }
    if (Math.abs(gapPct) >= minGapPct) {
      anomalyTypes.push('OVERNIGHT_GAP');
    }

    if (anomalyTypes.length > 0) {
      flaggedBars.push({
        date: bar.date,
        close: bar.close,
        dailyReturnPct: +dailyReturnPct.toFixed(2),
        intradayRangePct: +intradayRangePct.toFixed(2),
        gapPct: +gapPct.toFixed(2),
        returnZScore: +returnZScore.toFixed(2),
        rangeMultiplier: +rangeMultiplier.toFixed(2),
        volumeSpikeRatio: +volumeSpikeRatio.toFixed(2),
        anomalyTypes,
      });
    }
  }

  if (flaggedBars.length === 0) return [];

  // Group contiguous/nearby flagged dates (<= 2 calendar days apart) into windows
  const groups: AnomalyBarFlag[][] = [];
  for (const flag of flaggedBars) {
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && daysBetween(lastGroup[lastGroup.length - 1].date, flag.date) <= 2) {
      lastGroup.push(flag);
    } else {
      groups.push([flag]);
    }
  }

  const allCategories: NewsEventCategory[] = [
    'MONETARY_POLICY_RATES',
    'INFLATION_MACRO_DATA',
    'GEOPOLITICS_CONFLICT_ENERGY',
    'CRYPTO_ETF_REGULATION',
    'TECH_AI_EARNINGS',
    'THAI_DOMESTIC_POLICY',
    'CAPEX_INFRASTRUCTURE',
    'FX_LIQUIDITY_CARRY',
  ];

  const likelyNewsCategoriesToCheck = allCategories
    .map((category) => ({
      category,
      categoryLabelTh: NEWS_CATEGORY_LABELS_TH[category],
      relevanceMultiplier: getStructuralCategoryMultiplier(assetSymbol, assetClass, category),
    }))
    .sort((a, b) => b.relevanceMultiplier - a.relevanceMultiplier)
    .slice(0, 3);

  const dateToIndex = new Map<string, number>();
  sorted.forEach((c, idx) => dateToIndex.set(c.date, idx));

  const windows: RealChartAnomalyWindow[] = groups.map((group) => {
    const startDate = group[0].date;
    const endDate = group[group.length - 1].date;

    let peakBar = group[0];
    for (const b of group) {
      if (Math.abs(b.returnZScore) + b.rangeMultiplier > Math.abs(peakBar.returnZScore) + peakBar.rangeMultiplier) {
        peakBar = b;
      }
    }

    const startIdx = Math.max(0, (dateToIndex.get(startDate) ?? 1) - 1);
    const endIdx = dateToIndex.get(endDate) ?? sorted.length - 1;
    const preBar = sorted[startIdx];
    const lastBar = sorted[endIdx];
    const windowBars = sorted.slice(startIdx + 1, endIdx + 1);

    const cumulativeMovePct =
      preBar && preBar.close > 0
        ? +(((lastBar.close - preBar.close) / preBar.close) * 100).toFixed(2)
        : group[0].dailyReturnPct;

    const maxSingleDayMove = group.reduce(
      (best, b) => (Math.abs(b.dailyReturnPct) > Math.abs(best) ? b.dailyReturnPct : best),
      0
    );
    const maxIntradayRangePct = Math.max(...group.map((b) => b.intradayRangePct));
    const peakZScore = group.reduce(
      (best, b) => (Math.abs(b.returnZScore) > Math.abs(best) ? b.returnZScore : best),
      0
    );
    const maxVolumeSpikeRatio = Math.max(...group.map((b) => b.volumeSpikeRatio));

    const hasUp = group.some((b) => b.dailyReturnPct > 0.5);
    const hasDown = group.some((b) => b.dailyReturnPct < -0.5);
    const direction: RealChartAnomalyWindow['direction'] =
      hasUp && hasDown && Math.abs(cumulativeMovePct) < Math.abs(maxSingleDayMove) * 0.7
        ? 'WHIPSAW_VOLATILITY'
        : cumulativeMovePct >= 0
        ? 'BULLISH_SPIKE'
        : 'BEARISH_SPIKE';

    const uniqueTypes = Array.from(new Set(group.flatMap((b) => b.anomalyTypes)));
    const peakHigh = windowBars.length > 0 ? Math.max(...windowBars.map((b) => b.high)) : lastBar.high;
    const troughLow = windowBars.length > 0 ? Math.min(...windowBars.map((b) => b.low)) : lastBar.low;
    const durationDays = Math.max(1, daysBetween(startDate, endDate) + 1);

    const cleanSym = assetSymbol.replace('/USDT', '');
    const hintTerms = [
      cleanSym,
      startDate === endDate ? startDate : `${startDate}..${endDate}`,
      ...likelyNewsCategoriesToCheck.slice(0, 2).map((c) => c.category.toLowerCase().replace(/_/g, ' ')),
    ];

    return {
      windowId: `anom_${cleanSym.replace(/[^A-Z0-9]/gi, '')}_${startDate}_${endDate}`,
      assetSymbol,
      startDate,
      endDate,
      peakDate: peakBar.date,
      durationDays,
      flaggedBarCount: group.length,
      anomalyTypes: uniqueTypes,
      direction,
      cumulativeMovePct,
      maxSingleDayMovePct: +maxSingleDayMove.toFixed(2),
      maxIntradayRangePct: +maxIntradayRangePct.toFixed(2),
      peakZScore: +peakZScore.toFixed(2),
      maxVolumeSpikeRatio: +maxVolumeSpikeRatio.toFixed(2),
      startClose: preBar ? preBar.close : group[0].close,
      endClose: lastBar.close,
      peakHigh,
      troughLow,
      likelyNewsCategoriesToCheck,
      newsLookupQueryHint: hintTerms.join(' | '),
      summaryTh: `ช่วง ${startDate}${startDate !== endDate ? ` ถึง ${endDate}` : ''} (${direction}): ราคาเปลี่ยนสะสม ${cumulativeMovePct >= 0 ? '+' : ''}${cumulativeMovePct}% (Z=${peakZScore}, แกว่งสูงสุด ${maxIntradayRangePct}%, Vol x${maxVolumeSpikeRatio}) — แนะนำเช็คข่าวกลุ่ม ${likelyNewsCategoriesToCheck
        .slice(0, 2)
        .map((c) => c.category)
        .join(', ')}`,
    };
  });

  // Sort most severe anomalies first
  return windows.sort(
    (a, b) =>
      Math.abs(b.peakZScore) + b.maxVolumeSpikeRatio - (Math.abs(a.peakZScore) + a.maxVolumeSpikeRatio)
  );
}

export function buildAnomalyWindowsCsv(record: BacktestAnomalyArchiveRecord): string {
  const header = [
    'assetSymbol',
    'strategyId',
    'startDate',
    'endDate',
    'peakDate',
    'durationDays',
    'direction',
    'cumulativeMovePct',
    'maxSingleDayMovePct',
    'maxIntradayRangePct',
    'peakZScore',
    'maxVolumeSpikeRatio',
    'anomalyTypes',
    'likelyNewsCategoriesToCheck',
    'newsLookupQueryHint',
  ].join(',');

  const escapeCsv = (val: unknown) => {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = record.anomalyWindows.map((w) =>
    [
      w.assetSymbol,
      record.strategyId,
      w.startDate,
      w.endDate,
      w.peakDate,
      w.durationDays,
      w.direction,
      w.cumulativeMovePct,
      w.maxSingleDayMovePct,
      w.maxIntradayRangePct,
      w.peakZScore,
      w.maxVolumeSpikeRatio,
      w.anomalyTypes.join(';'),
      w.likelyNewsCategoriesToCheck.map((c) => c.category).join(';'),
      w.newsLookupQueryHint,
    ]
      .map(escapeCsv)
      .join(',')
  );

  return [header, ...rows].join('\n');
}
