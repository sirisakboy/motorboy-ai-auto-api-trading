import type { EndingResult, PoseId } from './types';
import type { MascotSettings } from './journal';

/**
 * ENDING GUARD — “1 REAL JOB” (spec §6, ten rules for never blocking the UI).
 *
 * Pure functions only, so the manners of the mascot are unit-tested instead of
 * relying on “น่าจะไม่บัง”:
 *
 *  1 NEVER_BLOCK       hard-coded list of things the mascot may never cover
 *  2 Smart avoidance   pointer within 100px of a control → dodge/ghost
 *  3 Ghost mode        near price/controls → 50% opacity
 *  4 Minimize         2 minutes with nothing to say → 32px chip, no walking
 *  5 Auto hide        after speaking → disappear (3s), never linger
 *  6 Quiet mode        user hides the body, AI keeps running
 *  7 Onboarding        first run points at the real buttons, not random spots
 *  8 Auto journal      (see journal.ts)
 *  9 One line          one sentence, never 10 indicators
 * 10 Knock alert       BEAR_END while the user is away → sound + vibrate
 */

/** Rule 1 — never cover these. Includes the spec's literal class list. */
export const NEVER_BLOCK_SELECTOR = [
  '.buy-btn',
  '.sell-btn',
  '.price-label',
  '.tp-input',
  // every real control in this app + the chart canvas + explicit opt-out
  'button',
  'a[href]',
  'input',
  'select',
  'textarea',
  'canvas',
  '[role="button"]',
  '[data-mascot-avoid]',
].join(',');

/** Rule 2/3 — proximity threshold in CSS pixels. */
export const AVOID_DISTANCE_PX = 100;
/** Rule 4 — idle before collapsing to the 32px head. */
export const MINIMIZE_AFTER_MS = 120_000;
/** Rule 5 — how long a spoken line stays on screen. */
export const AUTO_HIDE_AFTER_SPEAK_MS = 3000;

export interface Point {
  x: number;
  y: number;
}

export interface RectLike {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Distance from a point to a rect (0 when inside). */
export function distanceToRect(point: Point, rect: RectLike): number {
  const dx = Math.max(rect.left - point.x, 0, point.x - rect.right);
  const dy = Math.max(rect.top - point.y, 0, point.y - rect.bottom);
  return Math.hypot(dx, dy);
}

/** Rule 2: is the pointer close enough to a protected element that we must dodge? */
export function isNearProtected(
  point: Point | null,
  rect: RectLike | null,
  distance = AVOID_DISTANCE_PX
): boolean {
  if (!point || !rect) return false;
  return distanceToRect(point, rect) <= distance;
}

/** Rule 3: ghost (translucent) instead of hidden — the trader still sees it. */
export function ghostOpacity(nearProtected: boolean): number {
  return nearProtected ? 0.5 : 1;
}

/** Rule 4: collapse to the minimal head after a long silence. */
export function shouldMinimize(lastActivityAt: number, now = Date.now(), idleMs = MINIMIZE_AFTER_MS): boolean {
  return now - lastActivityAt >= idleMs;
}

/**
 * Rule 7: onboarding targets the real controls. Returns the selector the
 * spotlight should highlight, in the order a beginner needs them.
 */
export const ONBOARDING_TARGETS = ['[data-tour="chart"]', 'button', '.price-label'] as const;

export function onboardingTarget(index: number): string {
  return ONBOARDING_TARGETS[Math.min(index, ONBOARDING_TARGETS.length - 1)];
}

/* --------------------------------------------------------------- pose logic */

export interface PoseContext {
  mascotState: string;
  ending?: EndingResult | null;
  idleMs: number;
}

/**
 * Pose resolution — behaviour first, state second (spec §4).
 * A real trader's day: wait → walk the chart → climb green candles → analyse →
 * celebrate TP → parachute on SL → fib-drag → sleep when nothing moves.
 */
export function resolvePose(ctx: PoseContext): PoseId {
  const { mascotState, ending, idleMs } = ctx;

  switch (mascotState) {
    case 'TP_CELEBRATE':
      return 'HAPPY_TP';
    case 'SL_RESPECTED':
    case 'KILL_SWITCH_ACTIVE':
    case 'RISK_REJECT':
      return 'SAD_SL';
    case 'SCANNING':
    case 'CONFIRM_TRADE':
      return 'WORK_ANALYZE';
    case 'READY_TO_EXECUTE':
      return 'DRAG_FIBO';
    default:
      break;
  }

  if (ending) {
    switch (ending.type) {
      case 'BULL_END':
        return 'CLIMB_CANDLE';
      case 'BEAR_END':
        return 'FALL_BREAK';
      case 'BREAKOUT_END':
        return 'WORK_ANALYZE';
      case 'SIDEWAY_END':
        return idleMs >= MINIMIZE_AFTER_MS ? 'SLEEP_WAIT' : 'IDLE';
      default:
        break;
    }
  }

  if (idleMs >= MINIMIZE_AFTER_MS) return 'SLEEP_WAIT';
  if (mascotState === 'SIDEWAYS') return 'IDLE';
  return 'IDLE';
}

/* ------------------------------------------------------------- knock alert */

/** Rule 10: knock only when it matters and only if the user asked for it. */
export function shouldKnock(
  ending: EndingResult | null | undefined,
  settings: Pick<MascotSettings, 'knockAlert' | 'quietMode'>,
  isAway: boolean
): boolean {
  if (!ending || !settings.knockAlert) return false;
  if (ending.type !== 'BEAR_END') return false;
  return settings.quietMode || isAway;
}

/**
 * Fire the knock: short vibration + the app's existing alert chime.
 * Everything is wrapped — a blocked AudioContext must never break trading.
 */
export async function knock(now = Date.now()): Promise<{ vibrated: boolean; chimed: boolean }> {
  let vibrated = false;
  let chimed = false;

  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate([120, 60, 120]);
      vibrated = true;
    }
  } catch {
    // ignore
  }

  try {
    const { playDrawdownAlertChime } = await import('../services/drawdownService');
    playDrawdownAlertChime('CRITICAL');
    chimed = true;
  } catch {
    // ignore
  }

  return { vibrated, chimed, at: now } as { vibrated: boolean; chimed: boolean };
}
