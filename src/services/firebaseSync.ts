import { TradingHistoryEntry, UserSettingsProfile } from '../types';

/**
 * Local Offline Storage for User Settings & History.
 * Replaces Google Cloud Firestore — completely offline, private on device, zero cloud database requests.
 */

const SETTINGS_KEY_PREFIX = 'trading_engine_settings_';
const HISTORY_KEY_PREFIX = 'trading_engine_history_';

/**
 * Listener for user settings (stored locally on device, no Firestore)
 */
export function subscribeUserSettings(
  userId: string,
  onUpdate: (data: Partial<UserSettingsProfile>) => void
): () => void {
  const key = `${SETTINGS_KEY_PREFIX}${userId || 'local'}`;

  const load = () => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        onUpdate(JSON.parse(raw));
      }
    } catch (e) {
      console.warn('Failed to load local settings:', e);
    }
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
  return () => window.removeEventListener('storage', handleStorage);
}

/**
 * Save user settings locally (no Firestore write)
 */
export async function saveUserSettings(
  userId: string,
  data: Partial<UserSettingsProfile>
): Promise<void> {
  const key = `${SETTINGS_KEY_PREFIX}${userId || 'local'}`;
  try {
    const raw = localStorage.getItem(key);
    const existing = raw ? JSON.parse(raw) : {};
    const updated = {
      ...existing,
      ...data,
      userId,
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(key, JSON.stringify(updated));
  } catch (e) {
    console.warn('Failed to save local user settings:', e);
  }
}

/**
 * Listener for user trading history (stored locally on device, no Firestore)
 */
export function subscribeUserHistory(
  userId: string,
  onUpdate: (entries: TradingHistoryEntry[]) => void
): () => void {
  const key = `${HISTORY_KEY_PREFIX}${userId || 'local'}`;

  const load = () => {
    try {
      const raw = localStorage.getItem(key);
      const items: TradingHistoryEntry[] = raw ? JSON.parse(raw) : [];
      onUpdate(items);
    } catch (e) {
      console.warn('Failed to load local history:', e);
      onUpdate([]);
    }
  };

  load();

  const handleStorage = (e: StorageEvent) => {
    if (e.key === key) {
      load();
    }
  };

  window.addEventListener('storage', handleStorage);
  return () => window.removeEventListener('storage', handleStorage);
}

/**
 * Add a new history entry locally
 */
export async function addHistoryEntry(
  userId: string,
  entry: Omit<TradingHistoryEntry, 'id' | 'userId' | 'timestamp'>
): Promise<string> {
  const key = `${HISTORY_KEY_PREFIX}${userId || 'local'}`;
  const id = `hist_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const newItem: TradingHistoryEntry = {
    ...entry,
    id,
    userId,
    timestamp: new Date().toISOString(),
  };

  try {
    const raw = localStorage.getItem(key);
    const list: TradingHistoryEntry[] = raw ? JSON.parse(raw) : [];
    list.unshift(newItem);
    localStorage.setItem(key, JSON.stringify(list.slice(0, 200)));
  } catch (e) {
    console.warn('Failed to save history entry locally:', e);
  }

  return id;
}

/**
 * Delete a single history entry locally
 */
export async function deleteHistoryEntry(
  userId: string,
  historyId: string
): Promise<void> {
  const key = `${HISTORY_KEY_PREFIX}${userId || 'local'}`;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return;
    const list: TradingHistoryEntry[] = JSON.parse(raw);
    const filtered = list.filter((item) => item.id !== historyId);
    localStorage.setItem(key, JSON.stringify(filtered));
  } catch (e) {
    console.warn('Failed to delete history entry locally:', e);
  }
}

/**
 * Clear all history entries for the user locally
 */
export async function clearAllUserHistory(userId: string): Promise<void> {
  const key = `${HISTORY_KEY_PREFIX}${userId || 'local'}`;
  try {
    localStorage.removeItem(key);
  } catch (e) {
    console.warn('Failed to clear user history locally:', e);
  }
}
