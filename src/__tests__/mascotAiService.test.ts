// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

import {
  MASCOT_AI_COOLDOWN_MS,
  buildMascotMarketBrief,
  currentCooldownMs,
  fetchMascotLine,
  resetMascotAiCooldown,
  timeoutSignal,
} from '../services/mascotAiService';
import type { CryptoCoin } from '../types';

const coins = [
  { symbol: 'BTC', name: 'Bitcoin', price: 100, change: -4.2 },
  { symbol: 'ETH', name: 'Ethereum', price: 50, change: 1.1 },
] as unknown as CryptoCoin[];

beforeEach(() => {
  resetMascotAiCooldown();
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('buildMascotMarketBrief', () => {
  it('describes the snapshot in one short line', () => {
    const brief = buildMascotMarketBrief({ cryptoList: coins, signals: [], useThb: true, usdThbRate: 35 });
    expect(brief).toContain('BTC -4.20%');
    expect(brief).toContain('FX USD/THB 35.00');
  });

  it('says so when there is nothing to report', () => {
    expect(buildMascotMarketBrief({})).toContain('ยังไม่มีข้อมูลตลาดสด');
  });
});

describe('fetchMascotLine', () => {
  it('collapses concurrent requests into one network call', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ line: 'สวัสดีครับ' }) }));
    vi.stubGlobal('fetch', fetchMock);

    const [a, b] = await Promise.all([
      fetchMascotLine({ state: 'SCANNING' }),
      fetchMascotLine({ state: 'SCANNING' }),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a).toBe('สวัสดีครับ');
    expect(b).toBe('สวัสดีครับ');
  });

  it('respects the cooldown instead of hammering the route', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ line: 'หนึ่ง' }) }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await fetchMascotLine({ state: 'IDLE' })).toBe('หนึ่ง');
    expect(await fetchMascotLine({ state: 'SIDEWAYS' })).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('the explicit "ให้ AI พูด" button still bypasses the cooldown', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ line: 'สอง' }) }));
    vi.stubGlobal('fetch', fetchMock);

    await fetchMascotLine({ state: 'IDLE' });
    expect(await fetchMascotLine({ state: 'IDLE', force: true })).toBe('สอง');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('backs off further after a failed call', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({}) })));

    expect(currentCooldownMs()).toBe(MASCOT_AI_COOLDOWN_MS);
    expect(await fetchMascotLine({ state: 'IDLE' })).toBeNull();
    expect(currentCooldownMs()).toBeGreaterThan(MASCOT_AI_COOLDOWN_MS);

    resetMascotAiCooldown();
    expect(currentCooldownMs()).toBe(MASCOT_AI_COOLDOWN_MS);
  });

  it('never throws when the network explodes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('offline');
    }));
    await expect(fetchMascotLine({ state: 'IDLE' })).resolves.toBeNull();
  });

  it('circuit-breaks background calls after 400 invalid_api_key until key changes or forced', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 400,
      json: async () => ({ error: 'invalid_api_key', kind: 'INVALID_KEY' }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    // First background call hits the server once and records the rejected key
    expect(await fetchMascotLine({ state: 'IDLE', apiKey: 'bad-key' })).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Subsequent background call with the same bad key is skipped (even after reset of cooldown timer if we test same state)
    expect(await fetchMascotLine({ state: 'SCANNING', apiKey: 'bad-key' })).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Explicit user click (force: true) still attempts again
    expect(await fetchMascotLine({ state: 'IDLE', apiKey: 'bad-key', force: true })).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('timeoutSignal', () => {
  it('returns an abort signal that fires on its own', async () => {
    const signal = timeoutSignal(5);
    expect(signal).toBeInstanceOf(AbortSignal);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(signal?.aborted).toBe(true);
  });
});
