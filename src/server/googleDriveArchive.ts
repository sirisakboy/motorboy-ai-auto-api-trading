/**
 * Backend Google Drive Archive & Durable Local Queue.
 *
 * Persists daily market/news snapshots, per-asset sensitivity matrices, and
 * historical backtest anomaly reports cleanly on disk first, then uploads to
 * Google Drive (`drive.file` scope) whenever a Bearer token or server-side
 * credential is available.
 *
 * Security rule: OAuth access tokens are kept ONLY in memory (never written to
 * disk, never persisted in localStorage, never returned in API responses).
 */

import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

export type ArchiveSubfolder =
  | 'root'
  | 'daily-snapshots'
  | 'backtest-anomalies'
  | 'daily-csv-combined'
  | 'daily-csv-prices'
  | 'daily-csv-news';

export interface PendingSyncItem {
  id: string;
  localPath: string;
  fileName: string;
  subfolder: ArchiveSubfolder;
  mimeType: string;
  queuedAt: string;
  attempts: number;
  lastError?: string;
}

export interface DriveUploadResult {
  uploaded: boolean;
  fileId?: string;
  webViewLink?: string;
  fileName: string;
  driveFolderPath?: string;
  reason?: string;
}

export interface DriveSyncSummary {
  attempted: number;
  uploadedCount: number;
  pendingCount: number;
  results: Array<DriveUploadResult>;
}

const DRIVE_ROOT_FOLDER_NAME = 'MotorBoy-AI-TH-Archive';
const DRIVE_SUBFOLDERS: Record<Exclude<ArchiveSubfolder, 'root'>, string> = {
  'daily-snapshots': 'daily-snapshots',
  'backtest-anomalies': 'backtest-anomalies',
  'daily-csv-combined': 'daily-csv/combined-backtest',
  'daily-csv-prices': 'daily-csv/prices',
  'daily-csv-news': 'daily-csv/news',
};

/** Strictly in-memory session OAuth token — cleared on 401 or server restart. */
let memoryAccessToken: string | null = null;
let cachedServiceAccountToken: { token: string; expiresAt: number } | null = null;
const cachedFolderIds = new Map<string, string>();
let fallbackTmpRootDir: string | null = null;

function isDirectoryWritable(candidateDir: string): boolean {
  try {
    fsSync.mkdirSync(candidateDir, { recursive: true });
    fsSync.accessSync(candidateDir, fsSync.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

export function resolveWritableArchiveRoot(): string {
  const customDir = process.env.ARCHIVE_DATA_DIR?.trim();
  if (customDir) {
    return path.resolve(customDir);
  }
  if (fallbackTmpRootDir) {
    return fallbackTmpRootDir;
  }
  const workspaceDir = path.resolve(process.cwd(), '.data', 'market-archive');
  if (isDirectoryWritable(workspaceDir)) {
    return workspaceDir;
  }
  fallbackTmpRootDir = path.join(os.tmpdir(), 'motorboy-market-archive');
  return fallbackTmpRootDir;
}

export function getArchivePaths() {
  const rootDir = resolveWritableArchiveRoot();
  const dailyDir = path.join(rootDir, 'daily');
  return {
    rootDir,
    dailyDir,
    dailyCsvDir: path.join(dailyDir, 'csv'),
    backtestDir: path.join(rootDir, 'backtest'),
    sensitivityMatrixFile: path.join(rootDir, 'sensitivity-matrix.json'),
    stateFile: path.join(rootDir, 'archive-state.json'),
    pendingSyncFile: path.join(rootDir, 'pending-drive-sync.json'),
  };
}

export function getDriveFolderDisplayPath(subfolder: ArchiveSubfolder): string {
  if (subfolder === 'root') return DRIVE_ROOT_FOLDER_NAME;
  return `${DRIVE_ROOT_FOLDER_NAME}/${DRIVE_SUBFOLDERS[subfolder]}`;
}

export async function ensureArchiveDirectories(): Promise<void> {
  const paths = getArchivePaths();
  try {
    await fs.mkdir(paths.dailyDir, { recursive: true });
    await fs.mkdir(paths.dailyCsvDir, { recursive: true });
    await fs.mkdir(paths.backtestDir, { recursive: true });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException | undefined)?.code;
    if (!process.env.ARCHIVE_DATA_DIR?.trim() && (code === 'EACCES' || code === 'EROFS' || code === 'EPERM')) {
      fallbackTmpRootDir = path.join(os.tmpdir(), 'motorboy-market-archive');
      const fallback = getArchivePaths();
      await fs.mkdir(fallback.dailyDir, { recursive: true });
      await fs.mkdir(fallback.dailyCsvDir, { recursive: true });
      await fs.mkdir(fallback.backtestDir, { recursive: true });
      return;
    }
    throw err;
  }
}

export function extractBearerToken(authHeader?: string | null): string | null {
  if (!authHeader || typeof authHeader !== 'string') return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const token = match[1].trim();
  return token.length > 10 ? token : null;
}

export function rememberRuntimeDriveToken(token: string | null): void {
  memoryAccessToken = token && token.trim().length > 10 ? token.trim() : null;
}

export function clearRuntimeDriveToken(): void {
  memoryAccessToken = null;
  cachedFolderIds.clear();
}

export function getDriveAuthStatus(): {
  connectedInMemory: boolean;
  envTokenConfigured: boolean;
  serviceAccountConfigured: boolean;
} {
  return {
    connectedInMemory: Boolean(memoryAccessToken),
    envTokenConfigured: Boolean(process.env.GOOGLE_DRIVE_ACCESS_TOKEN?.trim()),
    serviceAccountConfigured: Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim()),
  };
}

function base64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function getServiceAccountAccessToken(): Promise<string | null> {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;

  if (cachedServiceAccountToken && Date.now() < cachedServiceAccountToken.expiresAt - 60_000) {
    return cachedServiceAccountToken.token;
  }

  try {
    const creds = JSON.parse(raw) as { client_email?: string; private_key?: string; token_uri?: string };
    if (!creds.client_email || !creds.private_key) return null;

    const now = Math.floor(Date.now() / 1000);
    const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const payload = base64UrlEncode(
      JSON.stringify({
        iss: creds.client_email,
        scope: 'https://www.googleapis.com/auth/drive.file',
        aud: creds.token_uri || 'https://oauth2.googleapis.com/token',
        exp: now + 3600,
        iat: now,
      })
    );
    const unsigned = `${header}.${payload}`;
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(unsigned);
    const signature = base64UrlEncode(signer.sign(creds.private_key));
    const assertion = `${unsigned}.${signature}`;

    const res = await fetch(creds.token_uri || 'https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!data.access_token) return null;

    cachedServiceAccountToken = {
      token: data.access_token,
      expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000,
    };
    return data.access_token;
  } catch {
    return null;
  }
}

export async function resolveDriveAccessToken(explicitBearer?: string | null): Promise<string | null> {
  if (explicitBearer && explicitBearer.trim().length > 10) {
    const trimmed = explicitBearer.trim();
    rememberRuntimeDriveToken(trimmed);
    return trimmed;
  }
  if (memoryAccessToken) return memoryAccessToken;
  const envToken = process.env.GOOGLE_DRIVE_ACCESS_TOKEN?.trim();
  if (envToken) return envToken;
  return await getServiceAccountAccessToken();
}

function escapeDriveQuery(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function findOrCreateDriveFolder(
  token: string,
  folderName: string,
  parentId?: string
): Promise<string> {
  const cacheKey = `${parentId || 'root'}:${folderName}`;
  const existingCached = cachedFolderIds.get(cacheKey);
  if (existingCached) return existingCached;

  const qParts = [
    `name = '${escapeDriveQuery(folderName)}'`,
    `mimeType = 'application/vnd.google-apps.folder'`,
    `trashed = false`,
  ];
  if (parentId) {
    qParts.push(`'${escapeDriveQuery(parentId)}' in parents`);
  }

  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
    qParts.join(' and ')
  )}&fields=files(id,name)&spaces=drive`;

  const searchRes = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10000),
  });

  if (searchRes.status === 401) {
    clearRuntimeDriveToken();
    throw new Error('DRIVE_UNAUTHORIZED');
  }
  if (!searchRes.ok) {
    throw new Error(`DRIVE_SEARCH_FAILED_${searchRes.status}`);
  }

  const searchData = (await searchRes.json()) as { files?: Array<{ id: string; name: string }> };
  if (Array.isArray(searchData.files) && searchData.files[0]?.id) {
    cachedFolderIds.set(cacheKey, searchData.files[0].id);
    return searchData.files[0].id;
  }

  const createRes = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      ...(parentId ? { parents: [parentId] } : {}),
    }),
    signal: AbortSignal.timeout(10000),
  });

  if (createRes.status === 401) {
    clearRuntimeDriveToken();
    throw new Error('DRIVE_UNAUTHORIZED');
  }
  if (!createRes.ok) {
    throw new Error(`DRIVE_FOLDER_CREATE_FAILED_${createRes.status}`);
  }

  const created = (await createRes.json()) as { id: string };
  cachedFolderIds.set(cacheKey, created.id);
  return created.id;
}

async function resolveTargetFolderId(
  token: string,
  subfolder: ArchiveSubfolder,
  customSubpath?: string
): Promise<{ folderId: string; displayPath: string }> {
  let parentId = await findOrCreateDriveFolder(token, DRIVE_ROOT_FOLDER_NAME);
  const segments: string[] = [];

  if (subfolder !== 'root') {
    for (const seg of DRIVE_SUBFOLDERS[subfolder].split('/').filter(Boolean)) {
      parentId = await findOrCreateDriveFolder(token, seg, parentId);
      segments.push(seg);
    }
  }

  if (customSubpath) {
    const cleanSegments = customSubpath
      .split('/')
      .map((s) => s.replace(/[^A-Za-z0-9._\-\s]/g, '').trim())
      .filter((s) => s.length > 0 && s !== '.' && s !== '..')
      .slice(0, 3);
    for (const seg of cleanSegments) {
      parentId = await findOrCreateDriveFolder(token, seg, parentId);
      segments.push(seg);
    }
  }

  const displayPath =
    segments.length > 0 ? `${DRIVE_ROOT_FOLDER_NAME}/${segments.join('/')}` : DRIVE_ROOT_FOLDER_NAME;
  return { folderId: parentId, displayPath };
}

async function findExistingFileId(token: string, fileName: string, folderId: string): Promise<string | null> {
  const q = `name = '${escapeDriveQuery(fileName)}' and '${escapeDriveQuery(folderId)}' in parents and trashed = false`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)&spaces=drive`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { files?: Array<{ id: string }> };
  return data.files?.[0]?.id ?? null;
}

export async function uploadFileToGoogleDrive(params: {
  token: string;
  fileName: string;
  content: string;
  mimeType: string;
  subfolder: ArchiveSubfolder;
  customSubpath?: string;
}): Promise<DriveUploadResult> {
  const { folderId, displayPath } = await resolveTargetFolderId(
    params.token,
    params.subfolder,
    params.customSubpath
  );
  const existingId = await findExistingFileId(params.token, params.fileName, folderId);

  const boundary = `motorboy_drive_${crypto.randomUUID()}`;
  const metadata = existingId
    ? { name: params.fileName, mimeType: params.mimeType }
    : { name: params.fileName, mimeType: params.mimeType, parents: [folderId] };

  const multipartBody = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    `--${boundary}`,
    `Content-Type: ${params.mimeType}; charset=UTF-8`,
    '',
    params.content,
    `--${boundary}--`,
  ].join('\r\n');

  const endpoint = existingId
    ? `https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=multipart&fields=id,name,webViewLink`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink';

  const res = await fetch(endpoint, {
    method: existingId ? 'PATCH' : 'POST',
    headers: {
      Authorization: `Bearer ${params.token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: multipartBody,
    signal: AbortSignal.timeout(15000),
  });

  if (res.status === 401) {
    clearRuntimeDriveToken();
    throw new Error('DRIVE_UNAUTHORIZED');
  }
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`DRIVE_UPLOAD_FAILED_${res.status}:${errText.slice(0, 140)}`);
  }

  const uploaded = (await res.json()) as { id?: string; webViewLink?: string; name?: string };
  return {
    uploaded: true,
    fileId: uploaded.id,
    webViewLink: uploaded.webViewLink,
    fileName: uploaded.name || params.fileName,
    driveFolderPath: displayPath,
  };
}

export async function readPendingSyncQueue(): Promise<PendingSyncItem[]> {
  try {
    const { pendingSyncFile } = getArchivePaths();
    const raw = await fs.readFile(pendingSyncFile, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PendingSyncItem[]) : [];
  } catch {
    return [];
  }
}

async function writePendingSyncQueue(items: PendingSyncItem[]): Promise<void> {
  await ensureArchiveDirectories();
  const { pendingSyncFile } = getArchivePaths();
  await fs.writeFile(pendingSyncFile, JSON.stringify(items, null, 2), 'utf8');
}

/**
 * Save content locally first, then upload immediately to Google Drive if a token
 * is available — otherwise enqueue for automatic upload once Drive is authorized.
 */
export async function saveLocallyAndSyncToDrive(params: {
  localPath: string;
  fileName: string;
  content: string;
  mimeType: string;
  subfolder: ArchiveSubfolder;
  bearerToken?: string | null;
}): Promise<DriveUploadResult> {
  await ensureArchiveDirectories();
  await fs.mkdir(path.dirname(params.localPath), { recursive: true });
  await fs.writeFile(params.localPath, params.content, 'utf8');

  const token = await resolveDriveAccessToken(params.bearerToken);
  if (token) {
    try {
      const result = await uploadFileToGoogleDrive({
        token,
        fileName: params.fileName,
        content: params.content,
        mimeType: params.mimeType,
        subfolder: params.subfolder,
      });

      // Remove matching item from queue if it was previously pending
      const queue = await readPendingSyncQueue();
      const filtered = queue.filter((q) => q.localPath !== params.localPath);
      if (filtered.length !== queue.length) {
        await writePendingSyncQueue(filtered);
      }
      return result;
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : 'DRIVE_UPLOAD_ERROR';
      await enqueuePendingItem({
        localPath: params.localPath,
        fileName: params.fileName,
        subfolder: params.subfolder,
        mimeType: params.mimeType,
        lastError: reason,
      });
      return {
        uploaded: false,
        fileName: params.fileName,
        driveFolderPath: getDriveFolderDisplayPath(params.subfolder),
        reason,
      };
    }
  }

  await enqueuePendingItem({
    localPath: params.localPath,
    fileName: params.fileName,
    subfolder: params.subfolder,
    mimeType: params.mimeType,
    lastError: 'NO_ACTIVE_DRIVE_TOKEN',
  });
  return {
    uploaded: false,
    fileName: params.fileName,
    driveFolderPath: getDriveFolderDisplayPath(params.subfolder),
    reason: 'QUEUED_FOR_DRIVE_SYNC',
  };
}

async function enqueuePendingItem(input: {
  localPath: string;
  fileName: string;
  subfolder: ArchiveSubfolder;
  mimeType: string;
  lastError?: string;
}): Promise<void> {
  const queue = await readPendingSyncQueue();
  const idx = queue.findIndex((q) => q.localPath === input.localPath);
  const entry: PendingSyncItem = {
    id: idx >= 0 ? queue[idx].id : crypto.randomUUID(),
    localPath: input.localPath,
    fileName: input.fileName,
    subfolder: input.subfolder,
    mimeType: input.mimeType,
    queuedAt: idx >= 0 ? queue[idx].queuedAt : new Date().toISOString(),
    attempts: idx >= 0 ? queue[idx].attempts + 1 : 0,
    lastError: input.lastError,
  };
  if (idx >= 0) queue[idx] = entry;
  else queue.push(entry);
  await writePendingSyncQueue(queue);
}

export async function syncPendingToGoogleDrive(explicitBearer?: string | null): Promise<DriveSyncSummary> {
  const token = await resolveDriveAccessToken(explicitBearer);
  const queue = await readPendingSyncQueue();
  if (!token) {
    return {
      attempted: 0,
      uploadedCount: 0,
      pendingCount: queue.length,
      results: [],
    };
  }

  if (queue.length === 0) {
    return { attempted: 0, uploadedCount: 0, pendingCount: 0, results: [] };
  }

  const remaining: PendingSyncItem[] = [];
  const results: DriveUploadResult[] = [];
  let uploadedCount = 0;

  for (const item of queue) {
    try {
      const content = await fs.readFile(item.localPath, 'utf8');
      const uploaded = await uploadFileToGoogleDrive({
        token,
        fileName: item.fileName,
        content,
        mimeType: item.mimeType,
        subfolder: item.subfolder,
      });
      results.push(uploaded);
      uploadedCount += 1;
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : 'SYNC_ERROR';
      remaining.push({
        ...item,
        attempts: item.attempts + 1,
        lastError: reason,
      });
      results.push({ uploaded: false, fileName: item.fileName, reason });
    }
  }

  await writePendingSyncQueue(remaining);
  return {
    attempted: queue.length,
    uploadedCount,
    pendingCount: remaining.length,
    results,
  };
}
