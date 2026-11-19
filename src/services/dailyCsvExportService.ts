export type DailyCsvDataset = 'combined' | 'prices' | 'news';

export interface DailySnapshotDateItem {
  dateKey: string;
  recordedAt: string;
  assetCount: number;
  newsCount: number;
  fileName: string;
}

export interface DailyCsvExportParams {
  dateKey?: string;
  from?: string;
  to?: string;
  dataset?: DailyCsvDataset;
  asset?: string;
  customSubpath?: string;
}

export interface DailyCsvDownloadResult {
  fileName: string;
  rowCount: number;
  archiveFolderPath: string;
}

export async function fetchArchivedDailyDates(): Promise<DailySnapshotDateItem[]> {
  const res = await fetch('/api/archive/daily/dates');
  if (!res.ok) {
    throw new Error('ไม่สามารถโหลดรายการวันที่ที่บันทึกข้อมูลได้');
  }
  const data = (await res.json()) as { dates?: DailySnapshotDateItem[] };
  return Array.isArray(data.dates) ? data.dates : [];
}

export async function triggerDailySnapshotNow(force = false): Promise<void> {
  const res = await fetch('/api/archive/daily/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ force }),
  });
  if (!res.ok) {
    throw new Error('ไม่สามารถบันทึกข้อมูลราคาและข่าวรายวันได้');
  }
}

function buildCsvQueryString(params: DailyCsvExportParams): string {
  const q = new URLSearchParams();
  if (params.dateKey && params.dateKey !== 'ALL') q.set('dateKey', params.dateKey);
  if (params.from) q.set('from', params.from);
  if (params.to) q.set('to', params.to);
  if (params.dataset) q.set('dataset', params.dataset);
  if (params.asset && params.asset !== 'ALL') q.set('asset', params.asset);
  if (params.customSubpath?.trim()) q.set('folder', params.customSubpath.trim());
  const str = q.toString();
  return str ? `?${str}` : '';
}

function parseFilenameFromDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const match = header.match(/filename="([^"]+)"/i);
  return match?.[1] || fallback;
}

export async function downloadDailyCsvExport(
  params: DailyCsvExportParams = {}
): Promise<DailyCsvDownloadResult> {
  const dataset = params.dataset || 'combined';
  const res = await fetch(`/api/archive/daily/export.csv${buildCsvQueryString({ ...params, dataset })}`);

  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    throw new Error(errBody?.message || 'ไม่พบข้อมูล CSV สำหรับส่งออก');
  }

  const csvText = await res.text();
  const fallbackName = `motorboy-daily-${params.dateKey || 'all'}-${dataset}.csv`;
  const fileName = parseFilenameFromDisposition(res.headers.get('Content-Disposition'), fallbackName);
  const rowCount = Number(res.headers.get('X-Csv-Row-Count') || '0');
  const archiveFolderPath =
    res.headers.get('X-Archive-Folder-Path') || 'MotorBoy-AI-TH-Archive/daily-csv/combined-backtest';

  const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
  const blobUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = blobUrl;
  anchor.download = fileName;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);

  return { fileName, rowCount, archiveFolderPath };
}
