import type { CryptoCoin, TradingSignal } from '../types';
import type { MascotWindowContext } from '../mascot/feed';
import type { MascotState } from './mascotService';

/**
 * Real-Gemini brain for the floating mascot.
 *
 * The mascot card already shows the canned Thai lines from `mascotService`.
 * This module upgrades the *floating* overlay so its speech bubble can be
 * written by Gemini from the live market snapshot — one short sentence,
 * server-side key, and a hard failure path: if anything goes wrong the overlay
 * silently keeps the canned line, so the UI never blocks on the network.
 */

const REQUEST_TIMEOUT_MS = 9000;
/** Never call Gemini more than once per this window, whatever the state churn. */
export const MASCOT_AI_COOLDOWN_MS = 30_000;
/** After a failure, wait longer before trying again (30s → 60s → 120s, capped). */
export const MASCOT_AI_MAX_BACKOFF_MS = 120_000;

/** Wait 5 minutes after HTTP 429 / QUOTA to protect free-tier daily quota. */
export const MASCOT_QUOTA_COOLDOWN_MS = 5 * 60_000;

let lastRequestAt = 0;
let consecutiveFailures = 0;
let inFlight: Promise<string | null> | null = null;
const blockedKeyTokens = new Set<string>();
const quotaCooldownUntilByKey = new Map<string, number>();

/**
 * `AbortSignal.timeout` is not in every browser this app supports (Safari < 16,
 * older Chrome). Fall back to a controller + timer instead of throwing.
 */
export function timeoutSignal(ms = REQUEST_TIMEOUT_MS): AbortSignal | undefined {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms);
  }
  if (typeof AbortController === 'undefined') return undefined;
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

/** How long the mascot must stay quiet right now (grows after failures). */
export function currentCooldownMs(): number {
  if (consecutiveFailures === 0) return MASCOT_AI_COOLDOWN_MS;
  return Math.min(MASCOT_AI_COOLDOWN_MS * 2 ** consecutiveFailures, MASCOT_AI_MAX_BACKOFF_MS);
}

export interface MascotAiContext {
  cryptoList?: CryptoCoin[];
  signals?: TradingSignal[];
  useThb?: boolean;
  usdThbRate?: number;
  windowContext?: MascotWindowContext;
}

/** Compact, cheap prompt payload — max ~400 chars so the route stays fast. */
export function buildMascotMarketBrief(ctx: MascotAiContext): string {
  const top = (ctx.cryptoList ?? []).slice(0, 3).map((c) => `${c.symbol} ${c.change.toFixed(2)}%`);
  const signalCount = (ctx.signals ?? []).length;
  const longs = (ctx.signals ?? []).filter((s) => s.type === 'LONG').length;
  const shorts = signalCount - longs;
  const fx = ctx.useThb ? `FX USD/THB ${(ctx.usdThbRate ?? 36.45).toFixed(2)}; ` : '';

  if (top.length === 0 && signalCount === 0) return `${fx}ยังไม่มีข้อมูลตลาดสด`;
  return [
    `${fx}ราคา/เปลี่ยนแปลง 24 ชม.: ${top.join(', ') || 'n/a'}`,
    `สัญญาณในระบบ: ${signalCount} (LONG ${longs} / SHORT ${shorts})`,
  ].join(' | ');
}

export interface FetchMascotLineOptions extends MascotAiContext {
  state: MascotState;
  apiKey?: string;
  /** Bypass the cooldown (used by the explicit "ให้ AI พูด" button). */
  force?: boolean;
  signal?: AbortSignal;
}

function isKeyRejectedPayload(status: number | undefined, data: any): boolean {
  if (status === 400 || status === 401 || status === 403) return true;
  const kind = data?.kind;
  const code = data?.error;
  return (
    kind === 'INVALID_KEY' ||
    kind === 'MISSING_KEY' ||
    kind === 'PERMISSION_DENIED' ||
    code === 'invalid_api_key' ||
    code === 'missing_gemini_key' ||
    code === 'permission_denied' ||
    code === 'invalid_key_format'
  );
}

function isQuotaExceededPayload(status: number | undefined, data: any): boolean {
  return status === 429 || data?.kind === 'QUOTA' || data?.error === 'quota_exceeded';
}

/**
 * Ask the server (which owns the Gemini key) for one in-character line.
 * Returns `null` on any failure — callers fall back to the canned message.
 */
export async function fetchMascotLine(options: FetchMascotLineOptions): Promise<string | null> {
  // One request at a time: state churn used to fire several in parallel and the
  // bubble flickered between answers. Concurrent callers share the answer.
  if (inFlight) return inFlight;

  const keyToken = options.apiKey?.trim() || '';
  if (!options.force && blockedKeyTokens.has(keyToken)) return null;

  const now = Date.now();
  if (!options.force && (quotaCooldownUntilByKey.get(keyToken) || 0) > now) return null;
  if (!options.force && now - lastRequestAt < currentCooldownMs()) return null;

  lastRequestAt = now;

  inFlight = (async () => {
    try {
      const res = await fetch('/api/gemini/mascot-line', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          state: options.state,
          marketBrief: buildMascotMarketBrief(options),
          windowContext: options.windowContext,
          apiKey: keyToken || undefined,
        }),
        signal: options.signal ?? timeoutSignal(),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        consecutiveFailures = Math.min(consecutiveFailures + 1, 4);
        if (isQuotaExceededPayload(res.status, data)) {
          quotaCooldownUntilByKey.set(keyToken, Date.now() + MASCOT_QUOTA_COOLDOWN_MS);
        } else if (isKeyRejectedPayload(res.status, data)) {
          blockedKeyTokens.add(keyToken);
        }
        return null;
      }

      const line = typeof data?.line === 'string' ? data.line.trim() : '';
      if (line.length === 0) {
        consecutiveFailures = Math.min(consecutiveFailures + 1, 4);
        return null;
      }
      consecutiveFailures = 0;
      blockedKeyTokens.delete(keyToken);
      quotaCooldownUntilByKey.delete(keyToken);
      return line;
    } catch {
      consecutiveFailures = Math.min(consecutiveFailures + 1, 4);
      return null;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/** True when the user is offline — the mascot should not even try. */
export function canReachServer(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

/** Test helper: forget the cooldown window and any backoff. */
export function resetMascotAiCooldown(): void {
  lastRequestAt = 0;
  consecutiveFailures = 0;
  inFlight = null;
  blockedKeyTokens.clear();
  quotaCooldownUntilByKey.clear();
}
