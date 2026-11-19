/**
 * Internal 1,000-Day Historical Candle Cache & 1-Asset-Per-Day Rotation Engine.
 *
 * Historical market candles cannot change once closed. Fetching 1,000 days of
 * OHLCV on every chart load or backtest wastes bandwidth and hits external APIs
 * unnecessarily. Instead, this module:
 *  1) Maintains an internal persistent 1,000-day archive per asset under
 *     `.data/market-archive/candles-1000d/`.
 *  2) Rotates strictly ONE asset per Asia/Bangkok calendar day to refresh its
 *     1,000-day real OHLCV history (so a full 30-asset cycle completes ~once a month).
 *  3) Serves backtest candle queries strictly from the internal archive first,
 *     only fetching on a cold cache miss and immediately storing the 1,000-day history.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import {
  type HistoricalCandle,
  fetchRealHistoricalDailyCandles,
  inferAssetClass,
} from './backtestAnomalyRecorder';
import { getArchivePaths } from './googleDriveArchive';
import type { AssetClass } from './newsAssetCorrelator';

export interface TrackedHistoricalAsset {
  symbol: string;
  assetClass: AssetClass;
}

export const TRACKED_HISTORICAL_ASSETS: TrackedHistoricalAsset[] = [
  { symbol: 'BTC', assetClass: 'CRYPTO' },
  { symbol: 'ETH', assetClass: 'CRYPTO' },
  { symbol: 'SOL', assetClass: 'CRYPTO' },
  { symbol: 'BNB', assetClass: 'CRYPTO' },
  { symbol: 'XRP', assetClass: 'CRYPTO' },
  { symbol: 'SHIB', assetClass: 'CRYPTO' },
  { symbol: 'EUR/USD', assetClass: 'FOREX' },
  { symbol: 'USD/JPY', assetClass: 'FOREX' },
  { symbol: 'GBP/USD', assetClass: 'FOREX' },
  { symbol: 'USD/THB', assetClass: 'FOREX' },
  { symbol: 'AUD/USD', assetClass: 'FOREX' },
  { symbol: 'USD/CHF', assetClass: 'FOREX' },
  { symbol: 'SET', assetClass: 'INDEX' },
  { symbol: 'NASDAQ', assetClass: 'INDEX' },
  { symbol: 'S&P500', assetClass: 'INDEX' },
  { symbol: 'DJI', assetClass: 'INDEX' },
  { symbol: 'GOLD', assetClass: 'COMMODITY' },
  { symbol: 'AOT', assetClass: 'THAI_STOCK' },
  { symbol: 'CPALL', assetClass: 'THAI_STOCK' },
  { symbol: 'PTT', assetClass: 'THAI_STOCK' },
  { symbol: 'DELTA', assetClass: 'THAI_STOCK' },
  { symbol: 'KBANK', assetClass: 'THAI_STOCK' },
  { symbol: 'GULF', assetClass: 'THAI_STOCK' },
  { symbol: 'SCC', assetClass: 'THAI_STOCK' },
  { symbol: 'NVDA', assetClass: 'FOREIGN_STOCK' },
  { symbol: 'AAPL', assetClass: 'FOREIGN_STOCK' },
  { symbol: 'TSLA', assetClass: 'FOREIGN_STOCK' },
  { symbol: 'MSFT', assetClass: 'FOREIGN_STOCK' },
  { symbol: 'GOOGL', assetClass: 'FOREIGN_STOCK' },
  { symbol: 'META', assetClass: 'FOREIGN_STOCK' },
];

export interface CachedAssetHistoryRecord {
  assetId: string;
  symbol: string;
  assetClass: AssetClass;
  source: 'BINANCE_SPOT_DAILY' | 'YAHOO_FINANCE_DAILY' | 'SYNTHETIC_FALLBACK';
  candleCount: number;
  startDate: string | null;
  endDate: string | null;
  lastRotatedDateKey: string;
  updatedAt: string;
  candles: HistoricalCandle[];
}

export interface HistoricalRotationState {
  lastRotationDateKey: string | null;
  nextAssetIndex: number;
  cycleLength: number;
  lastRotatedAsset: string | null;
  lastRotatedAt: string | null;
  historyByAsset: Record<
    string,
    {
      symbol: string;
      lastRotatedDateKey: string;
      candleCount: number;
      source: string;
    }
  >;
}

const MAX_STORED_CANDLES = 1000;

function getCandlesCachePaths() {
  const { rootDir } = getArchivePaths();
  return {
    candlesDir: path.join(rootDir, 'candles-1000d'),
    rotationFile: path.join(rootDir, 'historical-rotation.json'),
  };
}

export function normalizeCanonicalSymbol(rawSymbol: string): string {
  const s = rawSymbol.trim().toUpperCase();
  const aliasMap: Record<string, string> = {
    BITCOIN: 'BTC',
    BTCUSDT: 'BTC',
    'BTC/USDT': 'BTC',
    ETHEREUM: 'ETH',
    ETHUSDT: 'ETH',
    'ETH/USDT': 'ETH',
    SOLANA: 'SOL',
    SOLUSDT: 'SOL',
    'SOL/USDT': 'SOL',
    BINANCECOIN: 'BNB',
    BNBUSDT: 'BNB',
    'BNB/USDT': 'BNB',
    RIPPLE: 'XRP',
    XRPUSDT: 'XRP',
    'XRP/USDT': 'XRP',
    'SHIBA-INU': 'SHIB',
    SHIBUSDT: 'SHIB',
    'SHIB/USDT': 'SHIB',
    'XAU/USD': 'GOLD',
    'GC=F': 'GOLD',
    '^SET.BK': 'SET',
    '^IXIC': 'NASDAQ',
    '^GSPC': 'S&P500',
    '^DJI': 'DJI',
  };
  if (aliasMap[s]) return aliasMap[s];
  if (s.endsWith('/USDT')) return s.replace(/\/USDT$/, '');
  if (s.endsWith('.BK')) return s.replace(/\.BK$/, '');
  return s;
}

export function symbolToSafeAssetId(symbol: string): string {
  const canonical = normalizeCanonicalSymbol(symbol);
  return canonical.replace(/[^A-Za-z0-9_-]/g, '_').replace(/^_+|_+$/g, '') || 'ASSET';
}

export function mergeHistoricalCandles(
  existing: HistoricalCandle[],
  incoming: HistoricalCandle[],
  maxCount = MAX_STORED_CANDLES
): HistoricalCandle[] {
  const byDate = new Map<string, HistoricalCandle>();
  for (const c of existing) {
    if (c && c.date && Number.isFinite(c.close) && c.close > 0) {
      byDate.set(c.date, c);
    }
  }
  for (const c of incoming) {
    if (c && c.date && Number.isFinite(c.close) && c.close > 0) {
      byDate.set(c.date, c);
    }
  }
  const merged = Array.from(byDate.values()).sort((a, b) => a.timestamp - b.timestamp);
  if (merged.length <= maxCount) return merged;
  return merged.slice(merged.length - maxCount);
}

export async function readHistoricalRotationState(): Promise<HistoricalRotationState> {
  const { rotationFile } = getCandlesCachePaths();
  try {
    const raw = await fs.readFile(rotationFile, 'utf8');
    const parsed = JSON.parse(raw) as HistoricalRotationState;
    return {
      lastRotationDateKey: parsed.lastRotationDateKey ?? null,
      nextAssetIndex: Number.isFinite(parsed.nextAssetIndex) ? parsed.nextAssetIndex : 0,
      cycleLength: TRACKED_HISTORICAL_ASSETS.length,
      lastRotatedAsset: parsed.lastRotatedAsset ?? null,
      lastRotatedAt: parsed.lastRotatedAt ?? null,
      historyByAsset: parsed.historyByAsset ?? {},
    };
  } catch {
    return {
      lastRotationDateKey: null,
      nextAssetIndex: 0,
      cycleLength: TRACKED_HISTORICAL_ASSETS.length,
      lastRotatedAsset: null,
      lastRotatedAt: null,
      historyByAsset: {},
    };
  }
}

async function writeHistoricalRotationState(state: HistoricalRotationState): Promise<void> {
  const { candlesDir, rotationFile } = getCandlesCachePaths();
  await fs.mkdir(candlesDir, { recursive: true });
  await fs.writeFile(rotationFile, JSON.stringify(state, null, 2), 'utf8');
}

export async function readCachedAssetHistory(symbolOrId: string): Promise<CachedAssetHistoryRecord | null> {
  const assetId = symbolToSafeAssetId(symbolOrId);
  const { candlesDir } = getCandlesCachePaths();
  const filePath = path.join(candlesDir, `${assetId}.json`);
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as CachedAssetHistoryRecord;
    if (!Array.isArray(parsed.candles)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function writeCachedAssetHistory(record: CachedAssetHistoryRecord): Promise<void> {
  const { candlesDir } = getCandlesCachePaths();
  await fs.mkdir(candlesDir, { recursive: true });
  const filePath = path.join(candlesDir, `${record.assetId}.json`);
  await fs.writeFile(filePath, JSON.stringify(record, null, 2), 'utf8');
}

export async function refreshSingleAsset1000Days(
  symbol: string,
  dateKey: string,
  assetClassOverride?: AssetClass
): Promise<CachedAssetHistoryRecord | null> {
  const canonical = normalizeCanonicalSymbol(symbol);
  const assetId = symbolToSafeAssetId(canonical);
  const assetClass = assetClassOverride ?? inferAssetClass(canonical);
  const existing = await readCachedAssetHistory(canonical);

  const fetched = await fetchRealHistoricalDailyCandles(canonical, MAX_STORED_CANDLES);
  if (fetched.candles.length === 0 && (!existing || existing.candles.length === 0)) {
    return null;
  }

  const mergedCandles = mergeHistoricalCandles(existing?.candles ?? [], fetched.candles, MAX_STORED_CANDLES);
  const record: CachedAssetHistoryRecord = {
    assetId,
    symbol: canonical,
    assetClass,
    source: fetched.candles.length > 0 ? fetched.source : existing?.source ?? 'SYNTHETIC_FALLBACK',
    candleCount: mergedCandles.length,
    startDate: mergedCandles[0]?.date ?? null,
    endDate: mergedCandles[mergedCandles.length - 1]?.date ?? null,
    lastRotatedDateKey: dateKey,
    updatedAt: new Date().toISOString(),
    candles: mergedCandles,
  };

  await writeCachedAssetHistory(record);
  return record;
}

export interface DailyRotationOutcome {
  rotated: boolean;
  skipped: boolean;
  reason?: string;
  dateKey: string;
  assetSymbol?: string;
  candleCount?: number;
  source?: string;
  nextAssetIndex: number;
  cycleLength: number;
}

/**
 * Updates 1,000-day historical candles for strictly ONE asset per calendar day
 * so all 30 assets rotate cleanly over ~1 month without heavy daily network loads.
 */
export async function rotateOneAsset1000DayHistory(
  dateKey: string,
  options: { force?: boolean } = {}
): Promise<DailyRotationOutcome> {
  const state = await readHistoricalRotationState();

  if (!options.force && state.lastRotationDateKey === dateKey) {
    return {
      rotated: false,
      skipped: true,
      reason: 'ALREADY_ROTATED_ONE_ASSET_TODAY',
      dateKey,
      assetSymbol: state.lastRotatedAsset ?? undefined,
      nextAssetIndex: state.nextAssetIndex,
      cycleLength: TRACKED_HISTORICAL_ASSETS.length,
    };
  }

  const total = TRACKED_HISTORICAL_ASSETS.length;
  const idx = ((state.nextAssetIndex % total) + total) % total;
  const target = TRACKED_HISTORICAL_ASSETS[idx];

  const updated = await refreshSingleAsset1000Days(target.symbol, dateKey, target.assetClass);
  const nextIndex = (idx + 1) % total;

  const nextState: HistoricalRotationState = {
    lastRotationDateKey: dateKey,
    nextAssetIndex: nextIndex,
    cycleLength: total,
    lastRotatedAsset: target.symbol,
    lastRotatedAt: new Date().toISOString(),
    historyByAsset: {
      ...state.historyByAsset,
      [symbolToSafeAssetId(target.symbol)]: {
        symbol: target.symbol,
        lastRotatedDateKey: dateKey,
        candleCount: updated?.candleCount ?? 0,
        source: updated?.source ?? 'UNAVAILABLE',
      },
    },
  };

  await writeHistoricalRotationState(nextState);

  return {
    rotated: Boolean(updated),
    skipped: false,
    dateKey,
    assetSymbol: target.symbol,
    candleCount: updated?.candleCount ?? 0,
    source: updated?.source ?? 'UNAVAILABLE',
    nextAssetIndex: nextIndex,
    cycleLength: total,
  };
}

/**
 * Serves historical OHLCV candles from internal 1,000-day storage FIRST.
 * External fetch only happens on cold cache miss for a never-cached asset,
 * immediately caching its 1,000-day series internally for future runs.
 */
export async function getHistoricalCandlesInternalFirst(
  assetSymbol: string,
  periodDays = 90,
  dateKeyFallback = new Date().toISOString().slice(0, 10)
): Promise<{
  candles: HistoricalCandle[];
  source: 'BINANCE_SPOT_DAILY' | 'YAHOO_FINANCE_DAILY' | 'SYNTHETIC_FALLBACK';
  usedInternalCache: boolean;
  externalFetchPerformed: boolean;
  totalCachedCandles: number;
}> {
  const clampedDays = Math.min(MAX_STORED_CANDLES, Math.max(15, Math.round(periodDays)));
  const cached = await readCachedAssetHistory(assetSymbol);

  if (cached && cached.candles.length >= 10) {
    const sliceCount = Math.min(cached.candles.length, clampedDays + 20);
    return {
      candles: cached.candles.slice(cached.candles.length - sliceCount),
      source: cached.source,
      usedInternalCache: true,
      externalFetchPerformed: false,
      totalCachedCandles: cached.candles.length,
    };
  }

  // Cold miss: seed 1,000-day history once so every future backtest uses internal storage
  const seeded = await refreshSingleAsset1000Days(assetSymbol, dateKeyFallback);
  if (seeded && seeded.candles.length > 0) {
    const sliceCount = Math.min(seeded.candles.length, clampedDays + 20);
    return {
      candles: seeded.candles.slice(seeded.candles.length - sliceCount),
      source: seeded.source,
      usedInternalCache: false,
      externalFetchPerformed: true,
      totalCachedCandles: seeded.candles.length,
    };
  }

  return {
    candles: [],
    source: 'SYNTHETIC_FALLBACK',
    usedInternalCache: false,
    externalFetchPerformed: true,
    totalCachedCandles: 0,
  };
}

export async function listCachedAssetSummaries(): Promise<
  Array<{
    assetId: string;
    symbol: string;
    assetClass: AssetClass;
    source: string;
    candleCount: number;
    startDate: string | null;
    endDate: string | null;
    lastRotatedDateKey: string;
    updatedAt: string;
  }>
> {
  const { candlesDir } = getCandlesCachePaths();
  try {
    const files = (await fs.readdir(candlesDir)).filter((f) => f.endsWith('.json')).sort();
    const out = [];
    for (const file of files) {
      try {
        const raw = await fs.readFile(path.join(candlesDir, file), 'utf8');
        const parsed = JSON.parse(raw) as CachedAssetHistoryRecord;
        out.push({
          assetId: parsed.assetId,
          symbol: parsed.symbol,
          assetClass: parsed.assetClass,
          source: parsed.source,
          candleCount: parsed.candleCount,
          startDate: parsed.startDate,
          endDate: parsed.endDate,
          lastRotatedDateKey: parsed.lastRotatedDateKey,
          updatedAt: parsed.updatedAt,
        });
      } catch {
        // ignore corrupt cache file
      }
    }
    return out;
  } catch {
    return [];
  }
}
