/**
 * Daily Collected Price & News CSV Exporter (Backtest Portable).
 *
 * Transforms daily recorded snapshots (`daily-YYYY-MM-DD.json`) into UTF-8 BOM
 * RFC-4180 CSV datasets structured for local backtesting pipelines
 * (`MotorBoy-AI-TH-Archive/daily-csv/{combined-backtest,prices,news}`).
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  AssetDirectionProfile,
  ClassifiedNewsRecord,
} from './newsAssetCorrelator';
import {
  type ArchiveSubfolder,
  ensureArchiveDirectories,
  getArchiveFolderDisplayPath,
  getArchivePaths,
  saveArchiveFileLocally,
} from './googleDriveArchive';

export type DailyCsvDataset = 'combined' | 'prices' | 'news';

export interface DailyArchiveSnapshotPayload {
  schemaVersion: number;
  dateKey: string;
  timezone: string;
  recordedAt: string;
  assetCount: number;
  newsCount: number;
  perAssetAnalysis: AssetDirectionProfile[];
  classifiedNews: ClassifiedNewsRecord[];
}

export interface DailySnapshotDateSummary {
  dateKey: string;
  recordedAt: string;
  assetCount: number;
  newsCount: number;
  fileName: string;
}

export interface DailyCsvBuiltFile {
  dataset: DailyCsvDataset;
  subfolder: Extract<ArchiveSubfolder, 'daily-csv-combined' | 'daily-csv-prices' | 'daily-csv-news'>;
  archiveFolderPath: string;
  fileName: string;
  rowCount: number;
  dateKeys: string[];
  content: string;
}

export interface DailyCsvFilterOptions {
  dateKey?: string;
  from?: string;
  to?: string;
  asset?: string;
  customSubpath?: string;
}

const UTF8_BOM = '\uFEFF';
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * RFC-4180 CSV escaping that preserves negative numbers (e.g. `-2.985`)
 * while neutralizing non-numeric spreadsheet formula prefixes (`=`, `+`, `@`, tab).
 */
export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : '';
  }

  let str = String(value);
  const firstChar = str.charAt(0);
  const isSignedNumeric = /^-\d+(\.\d+)?$/.test(str.trim());
  if (!isSignedNumeric && (firstChar === '=' || firstChar === '+' || firstChar === '@' || firstChar === '\t')) {
    str = `'${str}`;
  }

  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function formatCsvDocument(headers: string[], rows: unknown[][]): string {
  const headerLine = headers.map(escapeCsvCell).join(',');
  const dataLines = rows.map((row) => row.map(escapeCsvCell).join(','));
  return `${UTF8_BOM}${[headerLine, ...dataLines].join('\r\n')}\r\n`;
}

export function getSubfolderForDataset(
  dataset: DailyCsvDataset
): Extract<ArchiveSubfolder, 'daily-csv-combined' | 'daily-csv-prices' | 'daily-csv-news'> {
  switch (dataset) {
    case 'prices':
      return 'daily-csv-prices';
    case 'news':
      return 'daily-csv-news';
    default:
      return 'daily-csv-combined';
  }
}

function normalizeSymbolFilter(asset?: string): string | null {
  if (!asset || typeof asset !== 'string') return null;
  const trimmed = asset.trim().toUpperCase();
  if (!trimmed || trimmed === 'ALL') return null;
  return trimmed;
}

function assetMatchesSymbolFilter(assetSymbol: string, filterUpper: string | null): boolean {
  if (!filterUpper) return true;
  const sym = assetSymbol.toUpperCase();
  if (sym === filterUpper) return true;
  // Support pairs like BTC/USDT matching BTC
  const base = filterUpper.split('/')[0];
  return sym === base || sym.replace('/', '') === filterUpper.replace('/', '');
}

function buildDateSlug(dateKeys: string[], assetFilter?: string | null): string {
  const sorted = [...dateKeys].sort();
  const baseSlug =
    sorted.length === 1
      ? sorted[0]
      : `${sorted[0]}_to_${sorted[sorted.length - 1]}`;
  const assetSuffix = assetFilter
    ? `-${assetFilter.replace(/[^A-Za-z0-9_-]/g, '_')}`
    : '';
  return `${baseSlug}${assetSuffix}`;
}

function resolveDisplayFolder(
  subfolder: Extract<ArchiveSubfolder, 'daily-csv-combined' | 'daily-csv-prices' | 'daily-csv-news'>,
  customSubpath?: string
): string {
  const basePath = getArchiveFolderDisplayPath(subfolder);
  if (!customSubpath?.trim()) return basePath;
  const cleanSegments = customSubpath
    .split('/')
    .map((s) => s.replace(/[^A-Za-z0-9._\-\s]/g, '').trim())
    .filter((s) => s.length > 0 && s !== '.' && s !== '..')
    .slice(0, 3);
  return cleanSegments.length > 0 ? `${basePath}/${cleanSegments.join('/')}` : basePath;
}

/**
 * Build normalized Daily Asset Price & Sensitivity CSV rows.
 * 1 row per (dateKey, asset).
 */
export function buildDailyPricesCsv(
  snapshots: DailyArchiveSnapshotPayload[],
  options: { asset?: string; customSubpath?: string } = {}
): { content: string; rowCount: number } {
  const assetFilter = normalizeSymbolFilter(options.asset);
  const archiveFolderPath = resolveDisplayFolder('daily-csv-prices', options.customSubpath);
  const headers = [
    'dateKey',
    'timezone',
    'recordedAt',
    'symbol',
    'name',
    'assetClass',
    'price',
    'change24hPct',
    'intradayRangePct',
    'direction',
    'volatilityRegime',
    'newsDrivenVolatilityScore',
    'topNewsCategory',
    'topNewsCategoryTh',
    'topNewsSensitivityScore',
    'topNewsSensitivityTier',
    'activeDriverCategories',
    'activeDriverHeadlineCount',
    'archiveFolderPath',
  ];

  const rows: unknown[][] = [];
  for (const snap of snapshots) {
    for (const asset of snap.perAssetAnalysis || []) {
      if (!assetMatchesSymbolFilter(asset.symbol, assetFilter)) continue;
      const topType = asset.topVolatileNewsTypes?.[0];
      const driverCats = (asset.activeNewsDrivers || []).map((d) => d.category).join(';');
      const driverHeadlines = (asset.activeNewsDrivers || []).reduce(
        (sum, d) => sum + (d.matchingHeadlineCount || 0),
        0
      );

      rows.push([
        snap.dateKey,
        snap.timezone || 'Asia/Bangkok',
        snap.recordedAt,
        asset.symbol,
        asset.name,
        asset.assetClass,
        asset.price,
        asset.change24hPct,
        asset.intradayRangePct,
        asset.direction,
        asset.volatilityRegime,
        asset.newsDrivenVolatilityScore,
        topType?.category ?? '',
        topType?.categoryLabelTh ?? '',
        topType?.sensitivityScore ?? '',
        topType?.sensitivityTier ?? '',
        driverCats,
        driverHeadlines,
        archiveFolderPath,
      ]);
    }
  }

  return {
    content: formatCsvDocument(headers, rows),
    rowCount: rows.length,
  };
}

/**
 * Build normalized Daily Classified Financial News CSV rows.
 * 1 row per (dateKey, newsId).
 */
export function buildDailyNewsCsv(
  snapshots: DailyArchiveSnapshotPayload[],
  options: { asset?: string; customSubpath?: string } = {}
): { content: string; rowCount: number } {
  const assetFilter = normalizeSymbolFilter(options.asset);
  const archiveFolderPath = resolveDisplayFolder('daily-csv-news', options.customSubpath);
  const headers = [
    'dateKey',
    'timezone',
    'recordedAt',
    'newsId',
    'publishedAt',
    'source',
    'primaryCategory',
    'secondaryCategories',
    'sentiment',
    'intensityScore',
    'matchedAssets',
    'matchedAssetCount',
    'title',
    'url',
    'archiveFolderPath',
  ];

  const rows: unknown[][] = [];
  for (const snap of snapshots) {
    for (const news of snap.classifiedNews || []) {
      const matched = Array.isArray(news.matchedAssets) ? news.matchedAssets : [];
      if (assetFilter && !matched.some((sym) => assetMatchesSymbolFilter(sym, assetFilter))) {
        continue;
      }

      rows.push([
        snap.dateKey,
        snap.timezone || 'Asia/Bangkok',
        snap.recordedAt,
        news.id,
        news.publishedAt,
        news.source,
        news.primaryCategory,
        (news.secondaryCategories || []).join(';'),
        news.sentiment,
        news.intensityScore,
        matched.join(';'),
        matched.length,
        news.title,
        news.url || '',
        archiveFolderPath,
      ]);
    }
  }

  return {
    content: formatCsvDocument(headers, rows),
    rowCount: rows.length,
  };
}

/**
 * Build normalized Backtest-Portable Combined Price + Matched News CSV.
 * Joins each asset's daily price/volatility observation with every matching headline
 * from the same dateKey, preserving a baseline price row even if no news matched.
 */
export function buildDailyCombinedBacktestCsv(
  snapshots: DailyArchiveSnapshotPayload[],
  options: { asset?: string; customSubpath?: string } = {}
): { content: string; rowCount: number } {
  const assetFilter = normalizeSymbolFilter(options.asset);
  const archiveFolderPath = resolveDisplayFolder('daily-csv-combined', options.customSubpath);
  const headers = [
    'dateKey',
    'recordedAt',
    'symbol',
    'name',
    'assetClass',
    'price',
    'change24hPct',
    'intradayRangePct',
    'direction',
    'volatilityRegime',
    'newsDrivenVolatilityScore',
    'topSensitivityCategory',
    'topSensitivityScore',
    'newsId',
    'newsPublishedAt',
    'newsSource',
    'newsPrimaryCategory',
    'newsSentiment',
    'newsIntensityScore',
    'newsTitle',
    'newsUrl',
    'archiveFolderPath',
  ];

  const rows: unknown[][] = [];
  for (const snap of snapshots) {
    const newsList = snap.classifiedNews || [];
    for (const asset of snap.perAssetAnalysis || []) {
      if (!assetMatchesSymbolFilter(asset.symbol, assetFilter)) continue;
      const symUpper = asset.symbol.toUpperCase();
      const driverCats = new Set((asset.activeNewsDrivers || []).map((d) => d.category));
      const matchedHeadlines = newsList.filter(
        (n) =>
          (n.matchedAssets || []).some((m) => m.toUpperCase() === symUpper) ||
          driverCats.has(n.primaryCategory)
      );

      const topSens = asset.topVolatileNewsTypes?.[0];

      if (matchedHeadlines.length === 0) {
        rows.push([
          snap.dateKey,
          snap.recordedAt,
          asset.symbol,
          asset.name,
          asset.assetClass,
          asset.price,
          asset.change24hPct,
          asset.intradayRangePct,
          asset.direction,
          asset.volatilityRegime,
          asset.newsDrivenVolatilityScore,
          topSens?.category ?? '',
          topSens?.sensitivityScore ?? '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          archiveFolderPath,
        ]);
        continue;
      }

      for (const headline of matchedHeadlines) {
        rows.push([
          snap.dateKey,
          snap.recordedAt,
          asset.symbol,
          asset.name,
          asset.assetClass,
          asset.price,
          asset.change24hPct,
          asset.intradayRangePct,
          asset.direction,
          asset.volatilityRegime,
          asset.newsDrivenVolatilityScore,
          topSens?.category ?? '',
          topSens?.sensitivityScore ?? '',
          headline.id,
          headline.publishedAt,
          headline.source,
          headline.primaryCategory,
          headline.sentiment,
          headline.intensityScore,
          headline.title,
          headline.url || '',
          archiveFolderPath,
        ]);
      }
    }
  }

  return {
    content: formatCsvDocument(headers, rows),
    rowCount: rows.length,
  };
}

export function buildCsvFileFromSnapshots(
  snapshots: DailyArchiveSnapshotPayload[],
  dataset: DailyCsvDataset,
  options: { asset?: string; customSubpath?: string } = {}
): DailyCsvBuiltFile {
  const dateKeys = snapshots.map((s) => s.dateKey);
  const assetFilter = normalizeSymbolFilter(options.asset);
  const dateSlug = buildDateSlug(dateKeys, assetFilter);
  const subfolder = getSubfolderForDataset(dataset);
  const archiveFolderPath = resolveDisplayFolder(subfolder, options.customSubpath);

  if (dataset === 'prices') {
    const built = buildDailyPricesCsv(snapshots, options);
    return {
      dataset,
      subfolder,
      archiveFolderPath,
      fileName: `daily-${dateSlug}-prices.csv`,
      rowCount: built.rowCount,
      dateKeys,
      content: built.content,
    };
  }

  if (dataset === 'news') {
    const built = buildDailyNewsCsv(snapshots, options);
    return {
      dataset,
      subfolder,
      archiveFolderPath,
      fileName: `daily-${dateSlug}-news.csv`,
      rowCount: built.rowCount,
      dateKeys,
      content: built.content,
    };
  }

  const built = buildDailyCombinedBacktestCsv(snapshots, options);
  return {
    dataset: 'combined',
    subfolder,
    archiveFolderPath,
    fileName: `daily-${dateSlug}-backtest-combined.csv`,
    rowCount: built.rowCount,
    dateKeys,
    content: built.content,
  };
}

export async function listAvailableDailySnapshots(): Promise<DailySnapshotDateSummary[]> {
  const { dailyDir } = getArchivePaths();
  try {
    const entries = await fs.readdir(dailyDir);
    const jsonFiles = entries
      .filter((name) => /^daily-\d{4}-\d{2}-\d{2}\.json$/.test(name))
      .sort()
      .reverse();

    const summaries: DailySnapshotDateSummary[] = [];
    for (const fileName of jsonFiles) {
      try {
        const raw = await fs.readFile(path.join(dailyDir, fileName), 'utf8');
        const parsed = JSON.parse(raw) as Partial<DailyArchiveSnapshotPayload>;
        const dateKey = parsed.dateKey || fileName.slice(6, 16);
        summaries.push({
          dateKey,
          recordedAt: parsed.recordedAt || '',
          assetCount: parsed.assetCount ?? parsed.perAssetAnalysis?.length ?? 0,
          newsCount: parsed.newsCount ?? parsed.classifiedNews?.length ?? 0,
          fileName,
        });
      } catch {
        // skip unreadable archive file
      }
    }
    return summaries;
  } catch {
    return [];
  }
}

export async function loadDailySnapshots(
  filter: { dateKey?: string; from?: string; to?: string } = {}
): Promise<DailyArchiveSnapshotPayload[]> {
  const { dailyDir } = getArchivePaths();
  const cleanDateKey = filter.dateKey && DATE_KEY_RE.test(filter.dateKey.trim()) ? filter.dateKey.trim() : undefined;
  const cleanFrom = filter.from && DATE_KEY_RE.test(filter.from.trim()) ? filter.from.trim() : undefined;
  const cleanTo = filter.to && DATE_KEY_RE.test(filter.to.trim()) ? filter.to.trim() : undefined;

  let fileNames: string[] = [];
  try {
    const entries = await fs.readdir(dailyDir);
    fileNames = entries
      .filter((name) => /^daily-\d{4}-\d{2}-\d{2}\.json$/.test(name))
      .sort(); // Chronological ascending for time-series backtesting
  } catch {
    return [];
  }

  const out: DailyArchiveSnapshotPayload[] = [];
  for (const fileName of fileNames) {
    const fileDate = fileName.slice(6, 16);
    if (cleanDateKey && fileDate !== cleanDateKey) continue;
    if (cleanFrom && fileDate < cleanFrom) continue;
    if (cleanTo && fileDate > cleanTo) continue;

    try {
      const raw = await fs.readFile(path.join(dailyDir, fileName), 'utf8');
      const parsed = JSON.parse(raw) as DailyArchiveSnapshotPayload;
      if (parsed && Array.isArray(parsed.perAssetAnalysis)) {
        out.push({
          schemaVersion: parsed.schemaVersion ?? 1,
          dateKey: parsed.dateKey || fileDate,
          timezone: parsed.timezone || 'Asia/Bangkok',
          recordedAt: parsed.recordedAt || '',
          assetCount: parsed.assetCount ?? parsed.perAssetAnalysis.length,
          newsCount: parsed.newsCount ?? parsed.classifiedNews?.length ?? 0,
          perAssetAnalysis: parsed.perAssetAnalysis,
          classifiedNews: Array.isArray(parsed.classifiedNews) ? parsed.classifiedNews : [],
        });
      }
    } catch {
      // skip corrupt snapshot
    }
  }

  return out;
}

/**
 * Generates and saves daily CSV datasets locally alongside `daily-YYYY-MM-DD.json`
 * during the automated daily snapshot scheduler run.
 */
export async function persistDailySnapshotCsvs(
  snapshot: DailyArchiveSnapshotPayload
): Promise<string[]> {
  await ensureArchiveDirectories();
  const { dailyCsvDir } = getArchivePaths();
  const datasets: DailyCsvDataset[] = ['combined', 'prices', 'news'];
  const savedPaths: string[] = [];

  for (const dataset of datasets) {
    const built = buildCsvFileFromSnapshots([snapshot], dataset);
    const localPath = path.join(dailyCsvDir, built.fileName);
    await saveArchiveFileLocally({ localPath, content: built.content });
    savedPaths.push(localPath);
  }

  return savedPaths;
}
