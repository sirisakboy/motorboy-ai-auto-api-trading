import type { CryptoCoin, TradingSignal } from '../types';
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

let lastRequestAt = 0;
let consecutiveFailures = 0;
let inFlight: Promise<string | null> | null = null;

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

/**
 * Ask the server (which owns the Gemini key) for one in-character line.
 * Returns `null` on any failure — callers fall back to the canned message.
 */
export async function fetchMascotLine(options: FetchMascotLineOptions): Promise<string | null> {
  // One request at a time: state churn used to fire several in parallel and the
  // bubble flickered between answers. Concurrent callers share the answer.
  if (inFlight) return inFlight;

  const now = Date.now();
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
          apiKey: options.apiKey?.trim() || undefined,
        }),
        signal: options.signal ?? timeoutSignal(),
      });

      if (!res.ok) {
        consecutiveFailures = Math.min(consecutiveFailures + 1, 4);
        return null;
      }
      const data = await res.json();
      const line = typeof data?.line === 'string' ? data.line.trim() : '';
      if (line.length === 0) {
        consecutiveFailures = Math.min(consecutiveFailures + 1, 4);
        return null;
      }
      consecutiveFailures = 0;
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
}
