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

let lastRequestAt = 0;

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
  const now = Date.now();
  if (!options.force && now - lastRequestAt < MASCOT_AI_COOLDOWN_MS) return null;
  lastRequestAt = now;

  try {
    const res = await fetch('/api/gemini/mascot-line', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        state: options.state,
        marketBrief: buildMascotMarketBrief(options),
        apiKey: options.apiKey?.trim() || undefined,
      }),
      signal: options.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const line = typeof data?.line === 'string' ? data.line.trim() : '';
    return line.length > 0 ? line : null;
  } catch {
    return null;
  }
}

/** Test helper: forget the cooldown window. */
export function resetMascotAiCooldown(): void {
  lastRequestAt = 0;
}
