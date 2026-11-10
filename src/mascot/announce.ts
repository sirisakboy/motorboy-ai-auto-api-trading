import { create } from 'zustand';

/**
 * MASCOT ANNOUNCEMENTS — "น้องทักเองตอนมีเรื่อง".
 *
 * The overlay's line normally comes from the market state (idle / risk / a
 * detected ending). This is the other channel: a *context event* that isn't
 * market data — "เพิ่มเข้า watchlist แล้ว", "อ่านข่าวจบแล้ว" — which the mascot
 * should say once and then forget.
 *
 * Rules, because an assistant that talks to itself is worse than a silent one:
 *  · one line at a time, throttled — never a queue that plays out of order;
 *  · the same line twice in a row is dropped (idempotent UI events);
 *  · no persistence — a reload should not replay old congratulations.
 */

export interface MascotAnnouncement {
  id: number;
  text: string;
  at: number;
}

export const MASCOT_ANNOUNCE_MIN_INTERVAL_MS = 8_000;
export const MASCOT_ANNOUNCE_REPEAT_WINDOW_MS = 30_000;
export const MASCOT_ANNOUNCE_MAX_CHARS = 140;

interface AnnounceState {
  current: MascotAnnouncement | null;
}

export const useMascotAnnouncements = create<AnnounceState>(() => ({ current: null }));

let seq = 0;
/** -Infinity, not 0: a caller may pass a small fake `now` in tests. */
let lastAt = Number.NEGATIVE_INFINITY;
let lastText = '';

/** True when the line was accepted (and will be spoken by the overlay). */
export function announceMascot(
  text: string,
  options: { force?: boolean; now?: number } = {}
): boolean {
  const trimmed = text.trim().slice(0, MASCOT_ANNOUNCE_MAX_CHARS);
  if (!trimmed) return false;

  const now = options.now ?? Date.now();
  if (!options.force) {
    if (now - lastAt < MASCOT_ANNOUNCE_MIN_INTERVAL_MS) return false;
    if (trimmed === lastText && now - lastAt < MASCOT_ANNOUNCE_REPEAT_WINDOW_MS) return false;
  }

  seq += 1;
  lastAt = now;
  lastText = trimmed;
  useMascotAnnouncements.setState({ current: { id: seq, text: trimmed, at: now } });
  return true;
}

/** Test helper / sign-out reset. */
export function resetMascotAnnouncements(): void {
  seq = 0;
  lastAt = Number.NEGATIVE_INFINITY;
  lastText = '';
  useMascotAnnouncements.setState({ current: null });
}
