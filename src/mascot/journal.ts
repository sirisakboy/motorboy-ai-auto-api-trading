import type { EndingResult } from './types';

/**
 * AUTO JOURNAL (spec §6.8) + QUIET MODE / KNOCK settings (§6.6, §6.10).
 *
 * Every ending the brain emits is written here automatically, so the trader
 * never has to remember what the mascot said. Persistence is `localStorage`
 * (same convention as the rest of the app — no Firestore dependency), capped so
 * a long-running tab cannot grow unbounded.
 */

export interface JournalEntry {
  at: string;
  symbol: string;
  type: EndingResult['type'];
  prob: number;
  target: number;
  support: number;
  oneLineTH: string;
}

export interface MascotSettings {
  /** ซ่อนตัวมาร์ค แต่ AI ยังรันเบื้องหลัง (แสดงแค่ตัวเลขมุมจอ) */
  quietMode: boolean;
  /** เคาะจอ + สั่น + เสียง เมื่อ BEAR_END เกิดตอนผู้ใช้เผลอ */
  knockAlert: boolean;
  /** ผู้ใช้กดซ่อนมาสคอตถาวรในเครื่องนี้ */
  hidden: boolean;
}

export const JOURNAL_STORAGE_KEY = 'motorboy_journal_v1';
export const SETTINGS_STORAGE_KEY = 'motorboy_mascot_settings_v1';
export const JOURNAL_MAX_ENTRIES = 200;
/** ไม่บันทึกซ้ำ type เดิมในหน้าต่างนี้ (กัน spam จาก poll ทุก 60 วิ) */
export const JOURNAL_DEDUPE_MS = 5 * 60_000;

export const DEFAULT_MASCOT_SETTINGS: MascotSettings = {
  quietMode: false,
  knockAlert: true,
  hidden: false,
};

function readStorage<T>(key: string, fallback: T): T {
  try {
    if (typeof localStorage === 'undefined') return fallback;
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeStorage(key: string, value: unknown): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // quota / private mode — journal is a convenience, never a blocker
  }
}

/* --------------------------------------------------- free-floating position */

export const POSITION_STORAGE_KEY = 'motorboy_mascot_position_v1';

/** Where the trader last dropped the mascot, in viewport pixels. */
export interface MascotPosition {
  x: number;
  y: number;
}

function isPosition(value: unknown): value is MascotPosition {
  const p = value as MascotPosition | null;
  return (
    !!p && typeof p.x === 'number' && typeof p.y === 'number' && isFinite(p.x) && isFinite(p.y)
  );
}

/** Saved drop point, or null when the mascot should fall back to its corner. */
export function loadMascotPosition(): MascotPosition | null {
  const stored = readStorage<unknown>(POSITION_STORAGE_KEY, null);
  return isPosition(stored) ? { x: stored.x, y: stored.y } : null;
}

export function saveMascotPosition(position: MascotPosition): void {
  if (isPosition(position)) writeStorage(POSITION_STORAGE_KEY, position);
}

export function clearMascotPosition(): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(POSITION_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function loadMascotSettings(): MascotSettings {
  const stored = readStorage<Partial<MascotSettings>>(SETTINGS_STORAGE_KEY, {});
  return { ...DEFAULT_MASCOT_SETTINGS, ...stored };
}

export function saveMascotSettings(patch: Partial<MascotSettings>): MascotSettings {
  const next = { ...loadMascotSettings(), ...patch };
  writeStorage(SETTINGS_STORAGE_KEY, next);
  return next;
}

export function loadJournal(): JournalEntry[] {
  const list = readStorage<JournalEntry[]>(JOURNAL_STORAGE_KEY, []);
  return Array.isArray(list) ? list.filter((e) => e && typeof e.at === 'string') : [];
}

/**
 * Append an ending. Returns the resulting journal and whether it was recorded
 * (false = duplicate inside the dedupe window).
 */
export function recordEnding(
  ending: EndingResult,
  options: { symbol?: string; now?: number; dedupeMs?: number } = {}
): { entries: JournalEntry[]; recorded: boolean } {
  const now = options.now ?? Date.now();
  const dedupeMs = options.dedupeMs ?? JOURNAL_DEDUPE_MS;
  const symbol = options.symbol ?? 'BTCUSDT';
  const entries = loadJournal();

  const last = entries[0];
  if (last && last.type === ending.type && last.symbol === symbol) {
    const lastAt = Date.parse(last.at);
    if (isFinite(lastAt) && now - lastAt < dedupeMs) {
      return { entries, recorded: false };
    }
  }

  const entry: JournalEntry = {
    at: new Date(now).toISOString(),
    symbol,
    type: ending.type,
    prob: ending.prob,
    target: ending.target,
    support: ending.support,
    oneLineTH: ending.oneLineTH,
  };
  const next = [entry, ...entries].slice(0, JOURNAL_MAX_ENTRIES);
  writeStorage(JOURNAL_STORAGE_KEY, next);
  return { entries: next, recorded: true };
}

export function clearJournal(): void {
  writeStorage(JOURNAL_STORAGE_KEY, []);
}

/** Most recent entry per symbol, newest first — used by the overlay tooltip. */
export function summarizeJournal(entries: JournalEntry[] = loadJournal()) {
  const byType: Record<string, number> = {};
  entries.forEach((e) => {
    byType[e.type] = (byType[e.type] ?? 0) + 1;
  });
  return { total: entries.length, byType, latest: entries[0] ?? null };
}
