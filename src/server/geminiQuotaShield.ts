/**
 * Free-Tier Gemini Quota Shield & Short-TTL Response Cache.
 *
 * Free-tier Google AI Studio keys often have zero or very tight RPM/RPD quota
 * for `googleSearch` grounding. Without tracking cooldowns, every AI request
 * attempts grounded search first, hits 429 QUOTA / 400 BAD_REQUEST, and then
 * retries plain generation — consuming 2x requests on every click.
 *
 * This module:
 *  1. Tracks per-key SHA-256 fingerprints where grounding is unavailable/throttled
 *     for 15 minutes so subsequent calls immediately run plain generation (1x cost).
 *  2. Provides a bounded in-memory TTL cache for identical read-heavy requests
 *     (`categorize-headlines`, `holistic-stance`) to protect shared free-tier quota.
 */

import crypto from 'node:crypto';
import type { GeminiErrorInfo } from './geminiConfig';

export const DEFAULT_GROUNDING_COOLDOWN_MS = 15 * 60 * 1000;
const MAX_CACHE_ENTRIES = 120;

const groundingBlockedUntil = new Map<string, number>();

interface CacheRecord<T> {
  expiresAt: number;
  value: T;
}

const responseCache = new Map<string, CacheRecord<unknown>>();

export function fingerprintApiKey(apiKey?: string | null): string {
  const normalized = typeof apiKey === 'string' ? apiKey.trim() : '';
  if (!normalized) return 'anonymous';
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

export function isGroundingGloballyEnabled(): boolean {
  return true;
}

export function shouldAttemptGrounding(
  apiKey?: string | null,
  now = Date.now()
): boolean {
  const fp = fingerprintApiKey(apiKey);
  const blockedUntil = groundingBlockedUntil.get(fp);
  if (!blockedUntil) return true;
  if (blockedUntil <= now) {
    groundingBlockedUntil.delete(fp);
    return true;
  }
  return false;
}

export function shouldCooldownGroundingOnError(info: GeminiErrorInfo): boolean {
  return info.kind === 'QUOTA' || info.kind === 'BAD_REQUEST' || info.kind === 'PERMISSION_DENIED';
}

export function markGroundingBlocked(
  apiKey?: string | null,
  durationMs = DEFAULT_GROUNDING_COOLDOWN_MS,
  now = Date.now()
): void {
  const fp = fingerprintApiKey(apiKey);
  groundingBlockedUntil.set(fp, now + durationMs);
}

export function getCachedAiResponse<T>(cacheKey: string, now = Date.now()): T | null {
  const entry = responseCache.get(cacheKey);
  if (!entry) return null;
  if (entry.expiresAt <= now) {
    responseCache.delete(cacheKey);
    return null;
  }
  return entry.value as T;
}

export function setCachedAiResponse<T>(
  cacheKey: string,
  value: T,
  ttlMs: number,
  now = Date.now()
): void {
  if (ttlMs <= 0) return;
  for (const [key, item] of responseCache.entries()) {
    if (item.expiresAt <= now) {
      responseCache.delete(key);
    }
  }
  while (responseCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = responseCache.keys().next().value;
    if (!oldestKey) break;
    responseCache.delete(oldestKey);
  }
  responseCache.set(cacheKey, {
    expiresAt: now + ttlMs,
    value,
  });
}

export function hashPromptSignature(parts: unknown): string {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(parts))
    .digest('hex')
    .slice(0, 24);
}

export function resetGeminiQuotaShieldForTest(): void {
  groundingBlockedUntil.clear();
  responseCache.clear();
}
