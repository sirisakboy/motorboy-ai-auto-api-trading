// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';

import {
  decideAutoState,
  readMarket,
  applyAutoDecision,
  KILL_SWITCH_LINE,
  FLAT_MARKET_PCT,
  MIN_SAMPLES,
} from '../mascot/observer';
import { publishMascotFeed, resetMascotFeed, useMascotFeed } from '../mascot/feed';
import { useMascotStore, type MascotState } from '../services/mascotService';
import type { CryptoCoin } from '../types';

const coin = (symbol: string, change: number) =>
  ({ symbol, name: symbol, price: 100, change }) as unknown as CryptoCoin;

const DEFAULT_MESSAGE = 'สวัสดีครับ ผมมอเตอร์บอย พร้อมเป็น Co-Pilot ให้คุณแล้ว!';

beforeEach(() => {
  resetMascotFeed();
  useMascotStore.setState({ state: 'IDLE', message: DEFAULT_MESSAGE });
  localStorage.clear();
});

describe('readMarket', () => {
  it('averages absolute moves and keeps the largest', () => {
    const reading = readMarket([coin('BTC', -4), coin('ETH', 2), coin('XRP', 0)]);
    expect(reading.averageMove).toBeCloseTo(2);
    expect(reading.maxMove).toBe(4);
    expect(reading.samples).toBe(3);
  });

  it('never divides by zero on an empty feed', () => {
    expect(readMarket([])).toEqual({
      averageMove: 0,
      maxMove: 0,
      drawdownBreaches: 0,
      samples: 0,
    });
  });

  it('ignores broken numbers instead of reporting NaN', () => {
    const reading = readMarket([coin('BTC', 3), coin('ETH', Number.NaN)]);
    expect(Number.isFinite(reading.averageMove)).toBe(true);
    expect(reading.samples).toBe(1);
  });
});

describe('decideAutoState — the mascot notices the market on its own', () => {
  const flat = [coin('BTC', 0.05), coin('ETH', 0.1), coin('XRP', 0.02)];
  const busy = [coin('BTC', 2.5), coin('ETH', 1.5), coin('XRP', 0.8)];
  const wild = [coin('BTC', -14), coin('ETH', 3), coin('XRP', 1)];

  it('raises the kill switch when a new drawdown breach appears', () => {
    const decision = decideAutoState({
      current: 'IDLE',
      reading: readMarket(busy, 2),
      previousBreaches: 1,
    });
    expect(decision).toMatchObject({ state: 'KILL_SWITCH_ACTIVE', reason: 'drawdown' });
    expect(decision?.message).toBe(KILL_SWITCH_LINE);
  });

  it('does not re-fire for a breach that was already counted', () => {
    expect(
      decideAutoState({ current: 'IDLE', reading: readMarket(busy, 2), previousBreaches: 2 })
    ).toBeNull();
  });

  it('reports a volatility spike', () => {
    const decision = decideAutoState({ current: 'IDLE', reading: readMarket(wild, 0) });
    expect(decision).toMatchObject({ state: 'KILL_SWITCH_ACTIVE', reason: 'volatility' });
  });

  it('goes quiet when the market is flat, then lets go when it wakes up', () => {
    expect(decideAutoState({ current: 'IDLE', reading: readMarket(flat, 0) })).toMatchObject({
      state: 'SIDEWAYS',
      reason: 'flat',
    });
    expect(decideAutoState({ current: 'SIDEWAYS', reading: readMarket(busy, 0) })).toMatchObject({
      state: 'IDLE',
      reason: 'resume',
    });
  });

  it('stays out of the way while the user is doing something', () => {
    for (const state of ['SCANNING', 'ONBOARDING', 'TP_CELEBRATE', 'READY_TO_EXECUTE'] as MascotState[]) {
      expect(decideAutoState({ current: state, reading: readMarket(wild, 0) })).toBeNull();
    }
  });

  it('lets a drawdown breach interrupt the scan — risk outranks the task', () => {
    expect(
      decideAutoState({ current: 'SCANNING', reading: readMarket(busy, 1), previousBreaches: 0 })
    ).toMatchObject({ state: 'KILL_SWITCH_ACTIVE', reason: 'drawdown' });
  });

  it('releases the kill switch once the market calms down', () => {
    expect(
      decideAutoState({ current: 'KILL_SWITCH_ACTIVE', reading: readMarket(busy, 0) })
    ).toMatchObject({ state: 'IDLE', reason: 'resume' });
  });

  it('keeps the kill switch while a drawdown breach is still open', () => {
    expect(
      decideAutoState({
        current: 'KILL_SWITCH_ACTIVE',
        reading: readMarket(busy, 1),
        previousBreaches: 1,
      })
    ).toBeNull();
  });

  it('says nothing when there is too little data to judge', () => {
    const reading = readMarket([coin('BTC', 0)], 0);
    expect(reading.samples).toBeLessThan(MIN_SAMPLES);
    expect(decideAutoState({ current: 'IDLE', reading })).toBeNull();
  });

  it('treats a merely calm market as "not flat"', () => {
    const calm = [coin('BTC', FLAT_MARKET_PCT + 0.3), coin('ETH', 0.9), coin('XRP', 0.6)];
    expect(decideAutoState({ current: 'IDLE', reading: readMarket(calm, 0) })).toBeNull();
  });
});

describe('applyAutoDecision', () => {
  it('writes the decision to the shared store', () => {
    const applied = applyAutoDecision({
      state: 'KILL_SWITCH_ACTIVE',
      reason: 'drawdown',
      message: KILL_SWITCH_LINE,
    });
    expect(applied).toBe(true);
    expect(useMascotStore.getState().state).toBe('KILL_SWITCH_ACTIVE');
    expect(useMascotStore.getState().message).toBe(KILL_SWITCH_LINE);
  });

  it('returns to idle without a message', () => {
    useMascotStore.setState({ state: 'SIDEWAYS', message: 'ตลาดนิ่ง' });
    applyAutoDecision({ state: 'IDLE', reason: 'resume' });
    expect(useMascotStore.getState().state).toBe('IDLE');
  });

  it('does nothing for a null decision', () => {
    expect(applyAutoDecision(null)).toBe(false);
  });
});

describe('mascot feed', () => {
  it('publishes and resets the snapshot', () => {
    publishMascotFeed({ useThb: true, usdThbRate: 34.2, drawdownBreaches: 3 });
    expect(useMascotFeed.getState().useThb).toBe(true);
    expect(useMascotFeed.getState().drawdownBreaches).toBe(3);
    expect(useMascotFeed.getState().updatedAt).toBeGreaterThan(0);

    resetMascotFeed();
    expect(useMascotFeed.getState()).toMatchObject({ useThb: false, usdThbRate: 36.45, drawdownBreaches: 0 });
  });
});
