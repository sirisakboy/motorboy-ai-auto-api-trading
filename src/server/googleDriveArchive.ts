/**
 * Backend Local Market & Backtest Archive Storage.
 *
 * Persists daily market/news snapshots, per-asset sensitivity matrices, and
 * historical backtest anomaly reports cleanly on local disk without external
 * Google Drive or cloud storage dependencies.
 */

import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export type ArchiveSubfolder =
  | 'root'
  | 'daily-snapshots'
  | 'backtest-anomalies'
  | 'daily-csv-combined'
  | 'daily-csv-prices'
  | 'daily-csv-news';

const ARCHIVE_ROOT_FOLDER_NAME = 'MotorBoy-AI-TH-Archive';
const ARCHIVE_SUBFOLDERS: Record<Exclude<ArchiveSubfolder, 'root'>, string> = {
  'daily-snapshots': 'daily-snapshots',
  'backtest-anomalies': 'backtest-anomalies',
  'daily-csv-combined': 'daily-csv/combined-backtest',
  'daily-csv-prices': 'daily-csv/prices',
  'daily-csv-news': 'daily-csv/news',
};

let fallbackTmpRootDir: string | null = null;
let testArchiveRootOverride: string | null = null;

/** Test-only helper to isolate archive paths without relying on custom env vars. */
export function setArchiveDataDirForTest(dir: string | null): void {
  testArchiveRootOverride = dir ? path.resolve(dir) : null;
  fallbackTmpRootDir = null;
}

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
  if (testArchiveRootOverride) {
    return testArchiveRootOverride;
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
  };
}

export function getArchiveFolderDisplayPath(subfolder: ArchiveSubfolder): string {
  if (subfolder === 'root') return ARCHIVE_ROOT_FOLDER_NAME;
  return `${ARCHIVE_ROOT_FOLDER_NAME}/${ARCHIVE_SUBFOLDERS[subfolder]}`;
}

export async function ensureArchiveDirectories(): Promise<void> {
  const paths = getArchivePaths();
  try {
    await fs.mkdir(paths.dailyDir, { recursive: true });
    await fs.mkdir(paths.dailyCsvDir, { recursive: true });
    await fs.mkdir(paths.backtestDir, { recursive: true });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException | undefined)?.code;
    if (!testArchiveRootOverride && (code === 'EACCES' || code === 'EROFS' || code === 'EPERM')) {
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

export async function saveArchiveFileLocally(params: {
  localPath: string;
  content: string;
}): Promise<{ saved: boolean; localPath: string }> {
  await ensureArchiveDirectories();
  await fs.mkdir(path.dirname(params.localPath), { recursive: true });
  await fs.writeFile(params.localPath, params.content, 'utf8');
  return { saved: true, localPath: params.localPath };
}
