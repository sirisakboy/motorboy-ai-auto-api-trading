/**
 * Backend Market, News Sensitivity & Backtest Archive Engine.
 *
 * Collects live multi-asset prices + live financial RSS news once per day
 * (Asia/Bangkok calendar day), correlates per-asset direction & volatility
 * sensitivity across news categories, archives daily & backtest anomaly logs
 * locally, and uploads them to Google Drive.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import {
  type AssetSnapshotInput,
  type NewsItemInput,
  type SensitivityMatrixStore,
  analyzeAssetsAgainstNews,
  createEmptySensitivityMatrix,
} from './newsAssetCorrelator';
import {
  type DriveUploadResult,
  ensureArchiveDirectories,
  getArchivePaths,
  getDriveAuthStatus,
  readPendingSyncQueue,
  saveLocallyAndSyncToDrive,
} from './googleDriveArchive';
import { persistAndSyncDailySnapshotCsvs } from './dailyCsvExporter';
import {
  type BacktestAnomalyArchiveRecord,
  buildAnomalyWindowsCsv,
  detectRealChartAnomalyWindows,
  inferAssetClass,
} from './backtestAnomalyRecorder';
import {
  type DailyRotationOutcome,
  getHistoricalCandlesInternalFirst,
  listCachedAssetSummaries,
  readHistoricalRotationState,
  rotateOneAsset1000DayHistory,
} from './historicalCandleCache';

const CRYPTO_ASSETS = [
  { symbol: 'BTC', name: 'Bitcoin', binanceSymbol: 'BTCUSDT', coingeckoId: 'bitcoin' },
  { symbol: 'ETH', name: 'Ethereum', binanceSymbol: 'ETHUSDT', coingeckoId: 'ethereum' },
  { symbol: 'SOL', name: 'Solana', binanceSymbol: 'SOLUSDT', coingeckoId: 'solana' },
  { symbol: 'BNB', name: 'BNB', binanceSymbol: 'BNBUSDT', coingeckoId: 'binancecoin' },
  { symbol: 'XRP', name: 'XRP', binanceSymbol: 'XRPUSDT', coingeckoId: 'ripple' },
  { symbol: 'SHIB', name: 'Shiba Inu', binanceSymbol: 'SHIBUSDT', coingeckoId: 'shiba-inu' },
];

const FOREX_PAIRS = ['EUR/USD', 'USD/JPY', 'GBP/USD', 'USD/THB', 'AUD/USD', 'USD/CHF'];

const YAHOO_QUOTES: Array<{
  symbol: string;
  yahooSymbol: string;
  name: string;
  assetClass: AssetSnapshotInput['assetClass'];
}> = [
  { symbol: 'SET', yahooSymbol: '^SET.BK', name: 'SET Index', assetClass: 'INDEX' },
  { symbol: 'NASDAQ', yahooSymbol: '^IXIC', name: 'NASDAQ Composite', assetClass: 'INDEX' },
  { symbol: 'S&P500', yahooSymbol: '^GSPC', name: 'S&P 500', assetClass: 'INDEX' },
  { symbol: 'DJI', yahooSymbol: '^DJI', name: 'Dow Jones', assetClass: 'INDEX' },
  { symbol: 'GOLD', yahooSymbol: 'GC=F', name: 'Gold Futures (XAU)', assetClass: 'COMMODITY' },
  { symbol: 'AOT', yahooSymbol: 'AOT.BK', name: 'Airports of Thailand', assetClass: 'THAI_STOCK' },
  { symbol: 'CPALL', yahooSymbol: 'CPALL.BK', name: 'CP All', assetClass: 'THAI_STOCK' },
  { symbol: 'PTT', yahooSymbol: 'PTT.BK', name: 'PTT PCL', assetClass: 'THAI_STOCK' },
  { symbol: 'DELTA', yahooSymbol: 'DELTA.BK', name: 'Delta Electronics', assetClass: 'THAI_STOCK' },
  { symbol: 'KBANK', yahooSymbol: 'KBANK.BK', name: 'Kasikornbank', assetClass: 'THAI_STOCK' },
  { symbol: 'GULF', yahooSymbol: 'GULF.BK', name: 'Gulf Energy', assetClass: 'THAI_STOCK' },
  { symbol: 'SCC', yahooSymbol: 'SCC.BK', name: 'Siam Cement', assetClass: 'THAI_STOCK' },
  { symbol: 'NVDA', yahooSymbol: 'NVDA', name: 'NVIDIA Corp', assetClass: 'FOREIGN_STOCK' },
  { symbol: 'AAPL', yahooSymbol: 'AAPL', name: 'Apple Inc.', assetClass: 'FOREIGN_STOCK' },
  { symbol: 'TSLA', yahooSymbol: 'TSLA', name: 'Tesla Inc.', assetClass: 'FOREIGN_STOCK' },
  { symbol: 'MSFT', yahooSymbol: 'MSFT', name: 'Microsoft Corp', assetClass: 'FOREIGN_STOCK' },
  { symbol: 'GOOGL', yahooSymbol: 'GOOGL', name: 'Alphabet Inc.', assetClass: 'FOREIGN_STOCK' },
  { symbol: 'META', yahooSymbol: 'META', name: 'Meta Platforms', assetClass: 'FOREIGN_STOCK' },
];

const SERVER_RSS_FEEDS: Array<{ url: string; source: string; category: string }> = [
  { url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', source: 'CoinDesk', category: 'CRYPTO' },
  { url: 'https://cointelegraph.com/rss', source: 'Cointelegraph', category: 'CRYPTO' },
  { url: 'https://decrypt.co/feed', source: 'Decrypt', category: 'CRYPTO' },
  { url: 'https://www.theblock.co/rss.xml', source: 'The Block', category: 'CRYPTO' },
  { url: 'https://finance.yahoo.com/rss/topstories', source: 'Yahoo Top Stories', category: 'YAHOO_WORLD' },
  { url: 'https://finance.yahoo.com/news/rssindex', source: 'Yahoo Finance World', category: 'YAHOO_WORLD' },
  { url: 'https://feeds.bbci.co.uk/news/business/rss.xml', source: 'BBC Business', category: 'MACRO' },
  { url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html', source: 'CNBC Top News', category: 'MACRO' },
  { url: 'https://www.bangkokpost.com/rss/data/business.xml', source: 'Bangkok Post Business', category: 'MSN_MONEY' },
  { url: 'https://www.kaohoon.com/feed', source: 'Kaohoon', category: 'MSN_MONEY' },
];

export interface ArchiveRuntimeState {
  schedulerActive: boolean;
  lastRunAt: string | null;
  lastRecordedDateKey: string | null;
  lastRunStatus: 'IDLE' | 'SUCCESS' | 'SKIPPED_ALREADY_RECORDED' | 'ERROR';
  lastRunError?: string;
  lastDriveUpload?: DriveUploadResult;
}

let runtimeState: ArchiveRuntimeState = {
  schedulerActive: false,
  lastRunAt: null,
  lastRecordedDateKey: null,
  lastRunStatus: 'IDLE',
};

let dailyRunInFlight: Promise<DailyArchiveRunOutcome> | null = null;
let schedulerTimer: ReturnType<typeof setInterval> | null = null;

/** Format YYYY-MM-DD in Asia/Bangkok timezone (used for strictly once-a-day snapshots). */
export function getBangkokDateKey(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = parts.find((p) => p.type === 'year')?.value ?? '2026';
  const month = parts.find((p) => p.type === 'month')?.value ?? '01';
  const day = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${year}-${month}-${day}`;
}

async function fetchLiveCryptoSnapshots(): Promise<AssetSnapshotInput[]> {
  try {
    const symbolsParam = encodeURIComponent(JSON.stringify(CRYPTO_ASSETS.map((c) => c.binanceSymbol)));
    const res = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbols=${symbolsParam}`, {
      signal: AbortSignal.timeout(7000),
    });
    if (res.ok) {
      const arr = (await res.json()) as Array<{
        symbol: string;
        lastPrice: string;
        priceChangePercent: string;
        highPrice: string;
        lowPrice: string;
        quoteVolume: string;
      }>;
      if (Array.isArray(arr) && arr.length > 0) {
        return CRYPTO_ASSETS.map((asset) => {
          const hit = arr.find((i) => i.symbol === asset.binanceSymbol);
          return {
            symbol: asset.symbol,
            name: asset.name,
            assetClass: 'CRYPTO' as const,
            price: Number(hit?.lastPrice) || 0,
            change24hPct: Number(hit?.priceChangePercent) || 0,
            high24h: Number(hit?.highPrice) || undefined,
            low24h: Number(hit?.lowPrice) || undefined,
            volume24h: Number(hit?.quoteVolume) || undefined,
            isLive: Boolean(hit && Number(hit.lastPrice) > 0),
          };
        }).filter((a) => a.price > 0);
      }
    }
  } catch {
    // fall through to CoinGecko
  }

  try {
    const ids = CRYPTO_ASSETS.map((c) => c.coingeckoId).join(',');
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true`,
      { signal: AbortSignal.timeout(7000) }
    );
    if (res.ok) {
      const data = (await res.json()) as Record<
        string,
        { usd?: number; usd_24h_change?: number; usd_24h_vol?: number }
      >;
      return CRYPTO_ASSETS.map((asset) => {
        const hit = data[asset.coingeckoId];
        return {
          symbol: asset.symbol,
          name: asset.name,
          assetClass: 'CRYPTO' as const,
          price: hit?.usd || 0,
          change24hPct: +(hit?.usd_24h_change || 0).toFixed(2),
          volume24h: hit?.usd_24h_vol,
          isLive: Boolean(hit?.usd && hit.usd > 0),
        };
      }).filter((a) => a.price > 0);
    }
  } catch {
    // empty fallback handled gracefully
  }

  return [];
}

async function fetchLiveForexSnapshots(): Promise<AssetSnapshotInput[]> {
  try {
    const [latestRes, frankfurterRes] = await Promise.allSettled([
      fetch('https://open.er-api.com/v6/latest/USD', { signal: AbortSignal.timeout(7000) }),
      fetch('https://api.frankfurter.app/latest?from=USD', { signal: AbortSignal.timeout(7000) }),
    ]);

    const erJson =
      latestRes.status === 'fulfilled' && latestRes.value.ok
        ? ((await latestRes.value.json()) as { rates?: Record<string, number> })
        : null;
    const ffJson =
      frankfurterRes.status === 'fulfilled' && frankfurterRes.value.ok
        ? ((await frankfurterRes.value.json()) as { rates?: Record<string, number> })
        : null;

    const rates = erJson?.rates || ffJson?.rates;
    if (!rates) return [];

    const out: AssetSnapshotInput[] = [];
    for (const pair of FOREX_PAIRS) {
      const [base, quote] = pair.split('/');
      let price = 0;
      if (base === 'USD' && rates[quote]) price = rates[quote];
      else if (quote === 'USD' && rates[base]) price = 1 / rates[base];
      if (!price || !Number.isFinite(price)) continue;

      let change24hPct = 0;
      if (erJson?.rates && ffJson?.rates) {
        const refPrice =
          base === 'USD' && ffJson.rates[quote]
            ? ffJson.rates[quote]
            : quote === 'USD' && ffJson.rates[base]
            ? 1 / ffJson.rates[base]
            : 0;
        if (refPrice > 0) {
          change24hPct = +(((price - refPrice) / refPrice) * 100).toFixed(3);
        }
      }

      out.push({
        symbol: pair,
        name: `${pair} FX`,
        assetClass: 'FOREX',
        price: +price.toFixed(4),
        change24hPct,
        isLive: true,
      });
    }
    return out;
  } catch {
    return [];
  }
}

async function fetchSingleYahooSnapshot(item: (typeof YAHOO_QUOTES)[number]): Promise<AssetSnapshotInput | null> {
  for (const host of ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com']) {
    try {
      const url = `${host}/v8/finance/chart/${encodeURIComponent(item.yahooSymbol)}?interval=1d&range=5d`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(6500),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as {
        chart?: {
          result?: Array<{
            meta?: {
              regularMarketPrice?: number;
              chartPreviousClose?: number;
              regularMarketDayHigh?: number;
              regularMarketDayLow?: number;
              regularMarketVolume?: number;
            };
          }>;
        };
      };
      const meta = data.chart?.result?.[0]?.meta;
      if (!meta || typeof meta.regularMarketPrice !== 'number' || meta.regularMarketPrice <= 0) continue;
      const prev = typeof meta.chartPreviousClose === 'number' && meta.chartPreviousClose > 0
        ? meta.chartPreviousClose
        : meta.regularMarketPrice;
      const change24hPct = prev > 0 ? +(((meta.regularMarketPrice - prev) / prev) * 100).toFixed(2) : 0;

      return {
        symbol: item.symbol,
        name: item.name,
        assetClass: item.assetClass,
        price: meta.regularMarketPrice,
        change24hPct,
        high24h: meta.regularMarketDayHigh,
        low24h: meta.regularMarketDayLow,
        volume24h: meta.regularMarketVolume,
        isLive: true,
      };
    } catch {
      // try next mirror
    }
  }
  return null;
}

async function fetchLiveYahooSnapshots(): Promise<AssetSnapshotInput[]> {
  const settled = await Promise.allSettled(YAHOO_QUOTES.map((q) => fetchSingleYahooSnapshot(q)));
  const out: AssetSnapshotInput[] = [];
  for (const r of settled) {
    if (r.status === 'fulfilled' && r.value) out.push(r.value);
  }
  return out;
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractXmlTag(block: string, tag: string): string {
  const match = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? decodeXmlEntities(match[1]) : '';
}

function parseRssXmlItems(
  xml: string,
  source: string,
  category: string,
  maxItems = 8
): NewsItemInput[] {
  const itemMatches = xml.match(/<item\b[\s\S]*?<\/item>/gi) || [];
  const out: NewsItemInput[] = [];

  for (let i = 0; i < Math.min(maxItems, itemMatches.length); i++) {
    const block = itemMatches[i];
    const title = extractXmlTag(block, 'title');
    if (!title) continue;
    const link = extractXmlTag(block, 'link');
    const pubDate = extractXmlTag(block, 'pubDate');
    const description = extractXmlTag(block, 'description').slice(0, 260);
    out.push({
      id: `srv-${source.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${i}`,
      title,
      source,
      url: link,
      publishedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
      summary: description,
      category,
    });
  }
  return out;
}

async function fetchServerLiveNews(): Promise<NewsItemInput[]> {
  const settled = await Promise.allSettled(
    SERVER_RSS_FEEDS.map(async (feed) => {
      const res = await fetch(feed.url, {
        headers: { 'User-Agent': 'MotorBoy-AI-TH/1.0' },
        signal: AbortSignal.timeout(7000),
      });
      if (!res.ok) return [] as NewsItemInput[];
      const xml = await res.text();
      return parseRssXmlItems(xml, feed.source, feed.category, 6);
    })
  );

  const combined: NewsItemInput[] = [];
  const seenTitles = new Set<string>();
  for (const r of settled) {
    if (r.status !== 'fulfilled') continue;
    for (const item of r.value) {
      const key = item.title.toLowerCase();
      if (seenTitles.has(key)) continue;
      seenTitles.add(key);
      combined.push(item);
    }
  }
  return combined;
}

export async function readSensitivityMatrix(): Promise<SensitivityMatrixStore> {
  const { sensitivityMatrixFile } = getArchivePaths();
  try {
    const raw = await fs.readFile(sensitivityMatrixFile, 'utf8');
    return JSON.parse(raw) as SensitivityMatrixStore;
  } catch {
    return createEmptySensitivityMatrix();
  }
}

export async function readArchiveState(): Promise<ArchiveRuntimeState> {
  const { stateFile } = getArchivePaths();
  try {
    const raw = await fs.readFile(stateFile, 'utf8');
    const parsed = JSON.parse(raw) as ArchiveRuntimeState;
    runtimeState = {
      ...parsed,
      schedulerActive: runtimeState.schedulerActive,
    };
  } catch {
    // keep in-memory default
  }
  return runtimeState;
}

async function writeArchiveState(next: ArchiveRuntimeState): Promise<void> {
  runtimeState = next;
  const { stateFile } = getArchivePaths();
  await ensureArchiveDirectories();
  await fs.writeFile(stateFile, JSON.stringify(next, null, 2), 'utf8');
}

export interface DailyArchiveRunOutcome {
  dateKey: string;
  skipped: boolean;
  reason?: string;
  assetCount: number;
  newsCount: number;
  localFilePath: string;
  driveUpload?: DriveUploadResult;
  csvDriveUploads?: DriveUploadResult[];
  matrixDriveUpload?: DriveUploadResult;
  historicalRotation?: DailyRotationOutcome;
}

export async function runDailyArchive(options: {
  force?: boolean;
  bearerToken?: string | null;
} = {}): Promise<DailyArchiveRunOutcome> {
  if (dailyRunInFlight) return dailyRunInFlight;

  dailyRunInFlight = (async () => {
    await ensureArchiveDirectories();
    const dateKey = getBangkokDateKey();
    const { dailyDir, sensitivityMatrixFile } = getArchivePaths();
    const dailyFileName = `daily-${dateKey}.json`;
    const dailyFilePath = path.join(dailyDir, dailyFileName);

    // Ensure strictly 1 asset/day 1000-day chart rotation even if daily snapshot already ran
    const rotationOutcome = await rotateOneAsset1000DayHistory(dateKey, {
      force: options.force,
    }).catch(() => undefined);

    // Strictly once per day unless force=true
    if (!options.force) {
      try {
        const existingRaw = await fs.readFile(dailyFilePath, 'utf8');
        const existing = JSON.parse(existingRaw) as {
          assetCount?: number;
          newsCount?: number;
        };
        const state = await readArchiveState();
        await writeArchiveState({
          ...state,
          lastRecordedDateKey: dateKey,
          lastRunStatus: 'SKIPPED_ALREADY_RECORDED',
        });
        return {
          dateKey,
          skipped: true,
          reason: 'ALREADY_RECORDED_TODAY',
          assetCount: existing.assetCount ?? 0,
          newsCount: existing.newsCount ?? 0,
          localFilePath: dailyFilePath,
          historicalRotation: rotationOutcome,
        };
      } catch {
        // does not exist yet — proceed
      }
    }

    const [cryptoAssets, forexAssets, yahooAssets, liveNews] = await Promise.all([
      fetchLiveCryptoSnapshots(),
      fetchLiveForexSnapshots(),
      fetchLiveYahooSnapshots(),
      fetchServerLiveNews(),
    ]);

    const allAssets = [...cryptoAssets, ...forexAssets, ...yahooAssets];
    const existingMatrix = await readSensitivityMatrix();
    const { classifiedNews, perAssetAnalysis, updatedMatrix } = analyzeAssetsAgainstNews({
      dateKey,
      assets: allAssets,
      news: liveNews,
      existingMatrix,
    });

    const dailyPayload = {
      schemaVersion: 1,
      dateKey,
      timezone: 'Asia/Bangkok',
      recordedAt: new Date().toISOString(),
      assetCount: perAssetAnalysis.length,
      newsCount: classifiedNews.length,
      perAssetAnalysis,
      classifiedNews,
    };

    const driveUpload = await saveLocallyAndSyncToDrive({
      localPath: dailyFilePath,
      fileName: dailyFileName,
      content: JSON.stringify(dailyPayload, null, 2),
      mimeType: 'application/json',
      subfolder: 'daily-snapshots',
      bearerToken: options.bearerToken,
    });

    const csvDriveUploads = await persistAndSyncDailySnapshotCsvs({
      snapshot: dailyPayload,
      bearerToken: options.bearerToken,
    }).catch(() => [] as DriveUploadResult[]);

    const matrixDriveUpload = await saveLocallyAndSyncToDrive({
      localPath: sensitivityMatrixFile,
      fileName: 'asset-sensitivity-matrix.json',
      content: JSON.stringify(updatedMatrix, null, 2),
      mimeType: 'application/json',
      subfolder: 'root',
      bearerToken: options.bearerToken,
    });

    await writeArchiveState({
      schedulerActive: runtimeState.schedulerActive,
      lastRunAt: new Date().toISOString(),
      lastRecordedDateKey: dateKey,
      lastRunStatus: 'SUCCESS',
      lastDriveUpload: driveUpload,
    });

    return {
      dateKey,
      skipped: false,
      assetCount: perAssetAnalysis.length,
      newsCount: classifiedNews.length,
      localFilePath: dailyFilePath,
      driveUpload,
      csvDriveUploads,
      matrixDriveUpload,
      historicalRotation: rotationOutcome,
    };
  })();

  try {
    return await dailyRunInFlight;
  } finally {
    dailyRunInFlight = null;
  }
}

export interface RecordBacktestInput {
  strategyId: string;
  strategyName?: string;
  assetSymbol: string;
  timeframe: string;
  periodDays: number;
  backtestMetrics?: Record<string, unknown>;
  bearerToken?: string | null;
}

export async function recordBacktestArchive(input: RecordBacktestInput): Promise<{
  record: BacktestAnomalyArchiveRecord;
  localJsonPath: string;
  localCsvPath: string;
  driveJsonUpload: DriveUploadResult;
  driveCsvUpload: DriveUploadResult;
}> {
  await ensureArchiveDirectories();
  const assetClass = inferAssetClass(input.assetSymbol);
  const { candles, source } = await getHistoricalCandlesInternalFirst(
    input.assetSymbol,
    input.periodDays,
    getBangkokDateKey()
  );

  const anomalyWindows = detectRealChartAnomalyWindows(candles, input.assetSymbol, assetClass);
  const timestampSlug = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const safeAsset = input.assetSymbol.replace(/[^A-Za-z0-9_-]/g, '_');
  const safeStrategy = input.strategyId.replace(/[^A-Za-z0-9_-]/g, '_');
  const archiveId = `bt_${safeAsset}_${safeStrategy}_${timestampSlug}`;

  const record: BacktestAnomalyArchiveRecord = {
    archiveId,
    recordedAt: new Date().toISOString(),
    strategyId: input.strategyId,
    strategyName: input.strategyName,
    assetSymbol: input.assetSymbol,
    assetClass,
    timeframe: input.timeframe,
    periodDays: input.periodDays,
    historicalFeedSource: source,
    realCandleCount: candles.length,
    periodStartDate: candles[0]?.date ?? null,
    periodEndDate: candles[candles.length - 1]?.date ?? null,
    backtestMetrics: input.backtestMetrics,
    anomalyCount: anomalyWindows.length,
    anomalyWindows,
  };

  const { backtestDir } = getArchivePaths();
  const jsonFileName = `${archiveId}.json`;
  const csvFileName = `${archiveId}-anomaly-windows.csv`;
  const localJsonPath = path.join(backtestDir, jsonFileName);
  const localCsvPath = path.join(backtestDir, csvFileName);

  const driveJsonUpload = await saveLocallyAndSyncToDrive({
    localPath: localJsonPath,
    fileName: jsonFileName,
    content: JSON.stringify(record, null, 2),
    mimeType: 'application/json',
    subfolder: 'backtest-anomalies',
    bearerToken: input.bearerToken,
  });

  const driveCsvUpload = await saveLocallyAndSyncToDrive({
    localPath: localCsvPath,
    fileName: csvFileName,
    content: buildAnomalyWindowsCsv(record),
    mimeType: 'text/csv',
    subfolder: 'backtest-anomalies',
    bearerToken: input.bearerToken,
  });

  return {
    record,
    localJsonPath,
    localCsvPath,
    driveJsonUpload,
    driveCsvUpload,
  };
}

export async function listBacktestArchives(limit = 20, symbolFilter?: string): Promise<BacktestAnomalyArchiveRecord[]> {
  const { backtestDir } = getArchivePaths();
  try {
    const entries = await fs.readdir(backtestDir);
    const jsonFiles = entries.filter((f) => f.endsWith('.json')).sort().reverse();
    const out: BacktestAnomalyArchiveRecord[] = [];
    for (const file of jsonFiles) {
      if (out.length >= limit) break;
      try {
        const raw = await fs.readFile(path.join(backtestDir, file), 'utf8');
        const parsed = JSON.parse(raw) as BacktestAnomalyArchiveRecord;
        if (symbolFilter && parsed.assetSymbol.toUpperCase() !== symbolFilter.toUpperCase()) {
          continue;
        }
        out.push(parsed);
      } catch {
        // skip corrupt entry
      }
    }
    return out;
  } catch {
    return [];
  }
}

export async function getArchiveOverviewStatus() {
  const { dailyDir, backtestDir } = getArchivePaths();
  await readArchiveState();
  const pending = await readPendingSyncQueue();
  const matrix = await readSensitivityMatrix();
  const rotationState = await readHistoricalRotationState();
  const cachedHistories = await listCachedAssetSummaries();

  let dailyFiles: string[] = [];
  let backtestFiles: string[] = [];
  try {
    dailyFiles = (await fs.readdir(dailyDir)).filter((f) => f.endsWith('.json')).sort().reverse();
  } catch {
    dailyFiles = [];
  }
  try {
    backtestFiles = (await fs.readdir(backtestDir)).filter((f) => f.endsWith('.json')).sort().reverse();
  } catch {
    backtestFiles = [];
  }

  return {
    todayBangkokDateKey: getBangkokDateKey(),
    schedulerActive: runtimeState.schedulerActive,
    lastRunAt: runtimeState.lastRunAt,
    lastRecordedDateKey: runtimeState.lastRecordedDateKey,
    lastRunStatus: runtimeState.lastRunStatus,
    dailySnapshotCount: dailyFiles.length,
    latestDailyFiles: dailyFiles.slice(0, 7),
    backtestArchiveCount: backtestFiles.length,
    latestBacktestFiles: backtestFiles.slice(0, 10),
    trackedAssetsInMatrix: Object.keys(matrix.assets).length,
    recordedDates: matrix.recordedDates,
    pendingDriveSyncCount: pending.length,
    driveAuth: getDriveAuthStatus(),
    historicalCache: {
      cachedAssetCount: cachedHistories.length,
      cycleLength: rotationState.cycleLength,
      lastRotationDateKey: rotationState.lastRotationDateKey,
      lastRotatedAsset: rotationState.lastRotatedAsset,
      nextAssetIndex: rotationState.nextAssetIndex,
    },
  };
}

/**
 * Starts the daily once-a-day archive scheduler inside server.ts.
 * Checks 10 seconds after boot and then every 30 minutes whether the
 * Asia/Bangkok date has a daily snapshot recorded yet.
 */
export function startDailyArchiveScheduler(): void {
  if (schedulerTimer) return;
  runtimeState.schedulerActive = true;

  const checkAndRecord = async () => {
    try {
      await runDailyArchive({ force: false });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'ARCHIVE_SCHEDULER_ERROR';
      await writeArchiveState({
        ...runtimeState,
        lastRunStatus: 'ERROR',
        lastRunError: message,
      }).catch(() => {});
    }
  };

  const bootTimer = setTimeout(() => {
    void checkAndRecord();
  }, 10_000);
  bootTimer.unref();

  schedulerTimer = setInterval(() => {
    void checkAndRecord();
  }, 30 * 60 * 1000);
  schedulerTimer.unref();
}
