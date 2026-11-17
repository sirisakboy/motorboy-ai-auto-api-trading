import {
  clearCachedAccessToken,
  getCachedAccessToken,
  requestGmailAccessToken,
} from './gmailService';

export type DailyCsvDataset = 'combined' | 'prices' | 'news';
export type DailyDriveExportScope = DailyCsvDataset | 'all';

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
  driveFolderPath: string;
}

export interface DailyDriveExportFileResult {
  dataset: DailyCsvDataset;
  fileName: string;
  driveFolderPath: string;
  rowCount: number;
  localCsvPath: string;
  upload: {
    uploaded: boolean;
    fileId?: string;
    webViewLink?: string;
    fileName: string;
    driveFolderPath?: string;
    reason?: string;
  };
}

export interface DailyDriveExportResponse {
  success?: boolean;
  exportedAt: string;
  snapshotCount: number;
  dateKeys: string[];
  authRequired: boolean;
  uploadedCount: number;
  files: DailyDriveExportFileResult[];
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
  const token = getCachedAccessToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch('/api/archive/daily/run', {
    method: 'POST',
    headers,
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
  const driveFolderPath =
    res.headers.get('X-Drive-Folder-Path') || 'MotorBoy-AI-TH-Archive/daily-csv/combined-backtest';

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

  return { fileName, rowCount, driveFolderPath };
}

export async function exportDailyCsvToDriveFolder(params: {
  dateKey?: string;
  from?: string;
  to?: string;
  dataset?: DailyDriveExportScope;
  asset?: string;
  customSubpath?: string;
}): Promise<DailyDriveExportResponse> {
  let token = getCachedAccessToken();
  if (!token) {
    token = await requestGmailAccessToken();
  }

  const executeUpload = async (bearer: string) =>
    fetch('/api/archive/daily/export-drive', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${bearer}`,
      },
      body: JSON.stringify({
        dateKey: params.dateKey && params.dateKey !== 'ALL' ? params.dateKey : undefined,
        from: params.from,
        to: params.to,
        dataset: params.dataset || 'all',
        asset: params.asset && params.asset !== 'ALL' ? params.asset : undefined,
        customSubpath: params.customSubpath?.trim() || undefined,
      }),
    });

  let res = await executeUpload(token);

  // If cached token expired, clear in-memory token and prompt fresh OAuth consent once
  if (res.status === 401) {
    clearCachedAccessToken();
    token = await requestGmailAccessToken();
    res = await executeUpload(token);
  }

  const payload = (await res.json().catch(() => null)) as
    | (DailyDriveExportResponse & { message?: string })
    | null;

  if (!res.ok || !payload) {
    throw new Error(payload?.message || 'การส่งออกไฟล์ CSV ไปยัง Google Drive ไม่สำเร็จ');
  }

  return payload;
}
