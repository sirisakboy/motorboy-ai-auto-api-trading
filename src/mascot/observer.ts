import { useEffect, useRef } from 'react';
import type { CryptoCoin } from '../types';
import { useMascotStore, type MascotState } from '../services/mascotService';
import { useMascotFeed } from './feed';

/**
 * MASCOT OBSERVER — the part that notices things without being told.
 *
 * These rules used to live inside `App.tsx` as two ad-hoc `useEffect`s that
 * called `setMascotState` directly. That made the mascot's behaviour impossible
 * to test (it needed the whole dashboard mounted) and impossible to reuse (the
 * rules only ran when that one component re-rendered).
 *
 * Everything here is a pure function of a market snapshot, so the manners are
 * unit-tested — and the hook can be mounted with the mascot, wherever it lives.
 */

/** A 24h move this large counts as a volatility spike (matches the old rule). */
export const VOLATILITY_SPIKE_PCT = 10;
/** Below this average move the market is "flat" and the mascot stops nudging. */
export const FLAT_MARKET_PCT = 0.2;
/** Fewer samples than this and we do not judge the market at all. */
export const MIN_SAMPLES = 3;

export interface MarketReading {
  averageMove: number;
  maxMove: number;
  drawdownBreaches: number;
  samples: number;
}

export function readMarket(cryptoList: CryptoCoin[] = [], drawdownBreaches = 0): MarketReading {
  const moves = cryptoList
    .map((coin) => Math.abs(Number(coin?.change)))
    .filter((value) => Number.isFinite(value));

  if (moves.length === 0) {
    return { averageMove: 0, maxMove: 0, drawdownBreaches, samples: 0 };
  }
  const total = moves.reduce((sum, value) => sum + value, 0);
  return {
    averageMove: total / moves.length,
    maxMove: Math.max(...moves),
    drawdownBreaches,
    samples: moves.length,
  };
}

export type AutoReason = 'drawdown' | 'volatility' | 'flat' | 'resume';

export interface AutoDecision {
  state: MascotState;
  reason: AutoReason;
  message?: string;
}

/** States the observer is allowed to move the mascot out of on its own. */
const AMBIENT_STATES: MascotState[] = ['IDLE', 'SIDEWAYS', 'KILL_SWITCH_ACTIVE'];

export const KILL_SWITCH_LINE = 'Drawdown หนักเกินไปครับ ผมขอหยุดเทรดชั่วคราวก่อน';
export const VOLATILITY_LINE = 'ตลาดผันผวนรุนแรงมากครับ — พักก่อน อย่าเพิ่งเข้าไม้ใหม่';

export interface AutoInput {
  current: MascotState;
  reading: MarketReading;
  /** Breach count at the previous observation, to detect a *new* breach. */
  previousBreaches?: number;
}

/**
 * Decide whether the market snapshot should move the mascot.
 *
 * Returns `null` when nothing should change — including when the mascot is
 * busy with a user-initiated state (scanning, onboarding, celebrating), because
 * the assistant must never talk over the person using it.
 */
export function decideAutoState({
  current,
  reading,
  previousBreaches = reading.drawdownBreaches,
}: AutoInput): AutoDecision | null {
  // 1. A *new* drawdown breach outranks everything, including an active scan.
  if (reading.drawdownBreaches > previousBreaches && reading.drawdownBreaches > 0) {
    if (current === 'KILL_SWITCH_ACTIVE') return null;
    return { state: 'KILL_SWITCH_ACTIVE', reason: 'drawdown', message: KILL_SWITCH_LINE };
  }

  // 2. Anything the user asked for (scan, onboarding, TP) is left alone.
  if (!AMBIENT_STATES.includes(current)) return null;

  if (reading.samples < MIN_SAMPLES) return null;

  // 3. Volatility spike.
  if (reading.maxMove > VOLATILITY_SPIKE_PCT) {
    if (current === 'KILL_SWITCH_ACTIVE') return null;
    return { state: 'KILL_SWITCH_ACTIVE', reason: 'volatility', message: VOLATILITY_LINE };
  }

  // 4. Market went flat — say so once, then stay quiet.
  if (reading.averageMove < FLAT_MARKET_PCT) {
    if (current === 'SIDEWAYS') return null;
    return { state: 'SIDEWAYS', reason: 'flat' };
  }

  // 5. The market calmed down — release a kill switch that was raised by a
  //    volatility spike. Without this the mascot stayed in "หยุดเทรด" forever
  //    once a single 10% candle happened, which is both wrong and alarming.
  if (current === 'KILL_SWITCH_ACTIVE' && reading.drawdownBreaches === 0) {
    return { state: 'IDLE', reason: 'resume' };
  }

  // 6. Market woke up — release the "flat" mood.
  if (current === 'SIDEWAYS') {
    return { state: 'IDLE', reason: 'resume' };
  }

  return null;
}

/** Apply a decision to the shared store. Exported so tests can drive it directly. */
export function applyAutoDecision(decision: AutoDecision | null): boolean {
  if (!decision) return false;
  const store = useMascotStore.getState();
  if (decision.state === 'IDLE') {
    store.resetToIdle();
    return true;
  }
  store.setMascotState(decision.state, decision.message);
  return true;
}

/**
 * Mount this next to the mascot (the overlay already does). It watches the
 * published feed and lets the mascot react on its own — the dashboard no longer
 * has to know that a mascot exists.
 */
export function useMascotAutoPilot(enabled = true): void {
  const cryptoList = useMascotFeed((state) => state.cryptoList);
  const drawdownBreaches = useMascotFeed((state) => state.drawdownBreaches);
  const previousBreaches = useRef(drawdownBreaches);
  const firstPass = useRef(true);

  useEffect(() => {
    if (!enabled) return;
    const current = useMascotStore.getState().state;
    const reading = readMarket(cryptoList, drawdownBreaches);

    // On the first observation there is no "previous" — do not fire a risk
    // event for a breach that was already there when the page loaded.
    const previous = firstPass.current ? drawdownBreaches : previousBreaches.current;
    firstPass.current = false;

    const decision = decideAutoState({ current, reading, previousBreaches: previous });
    previousBreaches.current = drawdownBreaches;
    applyAutoDecision(decision);
  }, [cryptoList, drawdownBreaches, enabled]);
}
