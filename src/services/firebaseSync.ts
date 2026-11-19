import { TradingHistoryEntry, UserSettingsProfile } from '../types';

const SETTINGS_KEY_PREFIX = 'trading_engine_settings_';
const HISTORY_KEY_PREFIX = 'trading_engine_history_';

function loadLocalSettings(userId: string): Partial<UserSettingsProfile> | null {
  try {
    const raw = localStorage.getItem(`${SETTINGS_KEY_PREFIX}${userId || 'local'}`);
    return raw ? (JSON.parse(raw) as Partial<UserSettingsProfile>) : null;
  } catch {
    return null;
  }
}

function saveLocalSettings(userId: string, data: Record<string, unknown>): void {
  try {
    const key = `${SETTINGS_KEY_PREFIX}${userId || 'local'}`;
    const existing = loadLocalSettings(userId) || {};
    localStorage.setItem(key, JSON.stringify({ ...existing, ...data }));
  } catch (e) {
    console.warn('Failed to save local user settings:', e);
  }
}

/**
 * Listener for user settings (local browser storage + cross-tab sync)
 */
export function subscribeUserSettings(
  userId: string,
  onUpdate: (data: Partial<UserSettingsProfile>) => void
): () => void {
  const key = `${SETTINGS_KEY_PREFIX}${userId || 'local'}`;

  const load = () => {
    const local = loadLocalSettings(userId);
    if (local) onUpdate(local);
  };
  load();

  const handleStorage = (e: StorageEvent) => {
    if (e.key === key && e.newValue) {
      try {
        onUpdate(JSON.parse(e.newValue));
      } catch (err) {
        console.warn('Failed to parse updated settings:', err);
      }
    }
  };
  window.addEventListener('storage', handleStorage);

  return () => {
    window.removeEventListener('storage', handleStorage);
  };
}

/**
 * Save user settings to local browser storage.
 */
export async function saveUserSettings(
  userId: string,
  data: Partial<UserSettingsProfile>
): Promise<void> {
  const existing = loadLocalSettings(userId) || {};
  const merged = {
    ...existing,
    ...data,
    userId,
    updatedAt: new Date().toISOString(),
  };
  saveLocalSettings(userId, merged);
}

function loadLocalHistory(userId: string): TradingHistoryEntry[] {
  try {
    const raw = localStorage.getItem(`${HISTORY_KEY_PREFIX}${userId || 'local'}`);
    return raw ? (JSON.parse(raw) as TradingHistoryEntry[]) : [];
  } catch {
    return [];
  }
}

function saveLocalHistory(userId: string, items: TradingHistoryEntry[]): void {
  try {
    localStorage.setItem(`${HISTORY_KEY_PREFIX}${userId || 'local'}`, JSON.stringify(items.slice(0, 200)));
  } catch (e) {
    console.warn('Failed to save history locally:', e);
  }
}

/**
 * Listener for user trading history (local browser storage + cross-tab sync)
 */
export function subscribeUserHistory(
  userId: string,
  onUpdate: (entries: TradingHistoryEntry[]) => void
): () => void {
  const key = `${HISTORY_KEY_PREFIX}${userId || 'local'}`;

  const load = () => {
    onUpdate(loadLocalHistory(userId));
  };
  load();

  const handleStorage = (e: StorageEvent) => {
    if (e.key === key) load();
  };
  window.addEventListener('storage', handleStorage);

  return () => {
    window.removeEventListener('storage', handleStorage);
  };
}

/**
 * Add a new history entry to local browser storage.
 */
export async function addHistoryEntry(
  userId: string,
  entry: Omit<TradingHistoryEntry, 'id' | 'userId' | 'timestamp'>
): Promise<string> {
  const id = `hist_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const timestamp = new Date().toISOString();
  const newItem: TradingHistoryEntry = {
    ...entry,
    id,
    userId,
    timestamp,
  };

  const list = loadLocalHistory(userId);
  list.unshift(newItem);
  saveLocalHistory(userId, list);
  return id;
}

/**
 * Delete a single history entry from local browser storage.
 */
export async function deleteHistoryEntry(userId: string, historyId: string): Promise<void> {
  const list = loadLocalHistory(userId);
  saveLocalHistory(
    userId,
    list.filter((item) => item.id !== historyId)
  );
}

/**
 * Clear all history entries for the user from local browser storage.
 */
export async function clearAllUserHistory(userId: string): Promise<void> {
  try {
    localStorage.removeItem(`${HISTORY_KEY_PREFIX}${userId || 'local'}`);
  } catch (e) {
    console.warn('Failed to clear user history locally:', e);
  }
}
