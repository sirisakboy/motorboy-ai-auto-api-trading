import {
  collection,
  deleteDoc,
  doc,
  getDocFromServer,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import { TradingHistoryEntry, UserSettingsProfile } from '../types';

const SETTINGS_KEY_PREFIX = 'trading_engine_settings_';
const HISTORY_KEY_PREFIX = 'trading_engine_history_';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

function isVitestEnv(): boolean {
  return Boolean((globalThis as { __vitest_worker__?: unknown }).__vitest_worker__);
}

export function isCloudFirestoreActive(userId: string): boolean {
  if (isVitestEnv()) return false;
  if (!userId || userId === 'guest' || userId === 'local') return false;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  const current = auth.currentUser;
  return Boolean(current && current.uid === userId && current.emailVerified);
}

let connectionTested = false;
export async function validateFirestoreConnection(): Promise<void> {
  if (connectionTested || isVitestEnv()) return;
  connectionTested = true;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

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

function sanitizeUserSettingsForFirestore(
  userId: string,
  merged: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {
    userId,
    updatedAt: typeof merged.updatedAt === 'string' ? merged.updatedAt : new Date().toISOString(),
  };
  if (typeof merged.email === 'string') out.email = merged.email.slice(0, 320);
  if (typeof merged.geminiApiKey === 'string') out.geminiApiKey = merged.geminiApiKey.slice(0, 256);
  if (Array.isArray(merged.watchlist)) {
    out.watchlist = merged.watchlist.filter((s): s is string => typeof s === 'string').slice(0, 200);
  }
  if (Array.isArray(merged.priceAlerts)) {
    out.priceAlerts = merged.priceAlerts.slice(0, 100);
  }
  if (typeof merged.useThb === 'boolean') out.useThb = merged.useThb;
  if (typeof merged.notificationsEnabled === 'boolean') {
    out.notificationsEnabled = merged.notificationsEnabled;
  }
  if (merged.psychologySettings && typeof merged.psychologySettings === 'object') {
    out.psychologySettings = merged.psychologySettings;
  }
  return out;
}

/**
 * Listener for user settings (local fast cache + live Firestore sync when authenticated)
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

  let unsubFirestore: (() => void) | null = null;
  if (isCloudFirestoreActive(userId)) {
    void validateFirestoreConnection();
    const path = `users/${userId}`;
    unsubFirestore = onSnapshot(
      doc(db, 'users', userId),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as Partial<UserSettingsProfile>;
          saveLocalSettings(userId, data);
          onUpdate(data);
        }
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.GET, path);
        } catch {
          // Handled safely so app continues on cached local state
        }
      }
    );
  }

  return () => {
    window.removeEventListener('storage', handleStorage);
    if (unsubFirestore) unsubFirestore();
  };
}

/**
 * Save user settings locally and synchronize to Firestore when signed in.
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

  if (!isCloudFirestoreActive(userId)) return;

  const path = `users/${userId}`;
  try {
    const payload = sanitizeUserSettingsForFirestore(userId, merged);
    await setDoc(doc(db, 'users', userId), payload, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
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
 * Listener for user trading history (local fast cache + live Firestore sync when authenticated)
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

  let unsubFirestore: (() => void) | null = null;
  if (isCloudFirestoreActive(userId)) {
    const path = `users/${userId}/history`;
    const q = query(
      collection(db, 'users', userId, 'history'),
      orderBy('timestamp', 'desc'),
      limit(200)
    );
    unsubFirestore = onSnapshot(
      q,
      (snap) => {
        const items = snap.docs.map((d) => d.data() as TradingHistoryEntry);
        saveLocalHistory(userId, items);
        onUpdate(items);
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.LIST, path);
        } catch {
          // Keep cached local history responsive
        }
      }
    );
  }

  return () => {
    window.removeEventListener('storage', handleStorage);
    if (unsubFirestore) unsubFirestore();
  };
}

/**
 * Add a new history entry locally and persist to Firestore when signed in.
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

  if (isCloudFirestoreActive(userId)) {
    const path = `users/${userId}/history/${id}`;
    const firestorePayload: Record<string, unknown> = {
      id,
      userId,
      symbol: String(entry.symbol || '').slice(0, 32),
      timestamp,
      type: String(entry.type || 'AI_ANALYSIS').slice(0, 40),
      action: String(entry.action || 'NEUTRAL').slice(0, 40),
      price: Number.isFinite(Number(entry.price)) ? Number(entry.price) : 0,
      aiSummary: String(entry.aiSummary || '').slice(0, 4000),
    };
    if (typeof entry.confidence === 'number' && Number.isFinite(entry.confidence)) {
      firestorePayload.confidence = entry.confidence;
    }

    try {
      await setDoc(doc(db, 'users', userId, 'history', id), firestorePayload);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  }

  return id;
}

/**
 * Delete a single history entry locally and from Firestore when signed in.
 */
export async function deleteHistoryEntry(userId: string, historyId: string): Promise<void> {
  const list = loadLocalHistory(userId);
  saveLocalHistory(
    userId,
    list.filter((item) => item.id !== historyId)
  );

  if (!isCloudFirestoreActive(userId)) return;
  const path = `users/${userId}/history/${historyId}`;
  try {
    await deleteDoc(doc(db, 'users', userId, 'history', historyId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

/**
 * Clear all history entries for the user locally and in Firestore when signed in.
 */
export async function clearAllUserHistory(userId: string): Promise<void> {
  try {
    localStorage.removeItem(`${HISTORY_KEY_PREFIX}${userId || 'local'}`);
  } catch (e) {
    console.warn('Failed to clear user history locally:', e);
  }

  if (!isCloudFirestoreActive(userId)) return;
  const path = `users/${userId}/history`;
  try {
    const snap = await getDocs(collection(db, 'users', userId, 'history'));
    const batch = writeBatch(db);
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
