/**
 * Firestore Cloud Synchronization for 1,000-day internal candle caches,
 * daily market/sensitivity snapshots, and backtest anomaly records.
 *
 * Keeps database interactions strictly invisible in the background.
 */

import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import {
  OperationType,
  handleFirestoreError,
  isCloudFirestoreActive,
  validateFirestoreConnection,
} from './firebaseSync';

const SYNC_COOLDOWN_MS = 10 * 60 * 1000;
let lastFirestoreArchiveSyncAt = 0;

function sanitizeDocId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128) || 'doc';
}

export async function syncMarketArchivesToFirestore(userId: string): Promise<void> {
  if (!isCloudFirestoreActive(userId)) return;
  if (typeof window === 'undefined' || typeof fetch !== 'function') return;

  const now = Date.now();
  if (now - lastFirestoreArchiveSyncAt < SYNC_COOLDOWN_MS) return;
  lastFirestoreArchiveSyncAt = now;

  await validateFirestoreConnection();

  try {
    const [cacheRes, backtestRes, statusRes] = await Promise.all([
      fetch('/api/archive/historical-cache'),
      fetch('/api/archive/backtest?limit=10'),
      fetch('/api/archive/status'),
    ]);

    if (cacheRes.ok) {
      const cacheData = (await cacheRes.json()) as {
        rotationState?: { lastRotatedAsset?: string; lastRotationDateKey?: string };
        cachedAssets?: Array<{ assetId: string; lastRotatedDateKey: string; updatedAt: string }>;
      };
      const targetSummaries = (cacheData.cachedAssets || []).slice(0, 5);
      for (const summary of targetSummaries) {
        const assetId = sanitizeDocId(summary.assetId);
        const docPath = `users/${userId}/assetHistories/${assetId}`;
        try {
          const existingSnap = await getDoc(doc(db, 'users', userId, 'assetHistories', assetId));
          if (existingSnap.exists() && existingSnap.data()?.lastRotatedDateKey === summary.lastRotatedDateKey) {
            continue;
          }
          const detailRes = await fetch(`/api/archive/historical-cache/${encodeURIComponent(assetId)}`);
          if (!detailRes.ok) continue;
          const fullRecord = (await detailRes.json()) as {
            assetId: string;
            symbol: string;
            assetClass?: string;
            source: string;
            candleCount: number;
            startDate?: string | null;
            endDate?: string | null;
            lastRotatedDateKey: string;
            updatedAt: string;
            candles: Array<{
              date: string;
              timestamp: number;
              open: number;
              high: number;
              low: number;
              close: number;
              volume: number;
            }>;
          };

          const payload: Record<string, unknown> = {
            assetId,
            userId,
            symbol: String(fullRecord.symbol || assetId).slice(0, 32),
            assetClass: String(fullRecord.assetClass || 'CRYPTO').slice(0, 32),
            source: String(fullRecord.source || 'BINANCE_SPOT_DAILY').slice(0, 40),
            candleCount: Math.min(1000, Number(fullRecord.candleCount) || 0),
            lastRotatedDateKey: String(fullRecord.lastRotatedDateKey || '').slice(0, 20),
            candles: (fullRecord.candles || []).slice(-1000),
            updatedAt: String(fullRecord.updatedAt || new Date().toISOString()).slice(0, 64),
          };
          if (fullRecord.startDate) payload.startDate = String(fullRecord.startDate).slice(0, 20);
          if (fullRecord.endDate) payload.endDate = String(fullRecord.endDate).slice(0, 20);

          await setDoc(doc(db, 'users', userId, 'assetHistories', assetId), payload);
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, docPath);
        }
      }
    }

    if (statusRes.ok) {
      const statusData = (await statusRes.json()) as {
        todayBangkokDateKey?: string;
        trackedAssetsInMatrix?: number;
        historicalCache?: { lastRotatedAsset?: string | null };
      };
      const dateKey = sanitizeDocId(statusData.todayBangkokDateKey || new Date().toISOString().slice(0, 10));
      const snapPath = `users/${userId}/marketArchives/${dateKey}`;
      try {
        const payload: Record<string, unknown> = {
          dateKey,
          userId,
          assetCount: Math.round(Number(statusData.trackedAssetsInMatrix) || 0),
          newsCount: 0,
          updatedAt: new Date().toISOString(),
        };
        if (statusData.historicalCache?.lastRotatedAsset) {
          payload.rotatedAssetSymbol = String(statusData.historicalCache.lastRotatedAsset).slice(0, 32);
        }
        await setDoc(doc(db, 'users', userId, 'marketArchives', dateKey), payload, { merge: true });
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, snapPath);
      }
    }

    if (backtestRes.ok) {
      const btData = (await backtestRes.json()) as {
        records?: Array<{
          archiveId: string;
          assetSymbol: string;
          strategyId: string;
          timeframe?: string;
          periodDays: number;
          historicalFeedSource?: string;
          realCandleCount?: number;
          anomalyCount?: number;
          anomalyWindows?: unknown[];
          recordedAt: string;
        }>;
      };
      for (const rec of (btData.records || []).slice(0, 5)) {
        const archiveId = sanitizeDocId(rec.archiveId);
        const btPath = `users/${userId}/backtestArchives/${archiveId}`;
        try {
          const existing = await getDoc(doc(db, 'users', userId, 'backtestArchives', archiveId));
          if (existing.exists()) continue;

          const payload: Record<string, unknown> = {
            archiveId,
            userId,
            assetSymbol: String(rec.assetSymbol).slice(0, 32),
            strategyId: String(rec.strategyId).slice(0, 64),
            timeframe: String(rec.timeframe || '1d').slice(0, 16),
            periodDays: Math.round(Number(rec.periodDays) || 90),
            historicalFeedSource: String(rec.historicalFeedSource || 'BINANCE_SPOT_DAILY').slice(0, 40),
            realCandleCount: Math.round(Number(rec.realCandleCount) || 0),
            anomalyCount: Math.round(Number(rec.anomalyCount) || 0),
            anomalyWindows: Array.isArray(rec.anomalyWindows) ? rec.anomalyWindows.slice(0, 30) : [],
            recordedAt: String(rec.recordedAt || new Date().toISOString()).slice(0, 64),
          };
          await setDoc(doc(db, 'users', userId, 'backtestArchives', archiveId), payload);
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, btPath);
        }
      }
    }
  } catch {
    // Silent background archival sync; never interrupts UI
  }
}
