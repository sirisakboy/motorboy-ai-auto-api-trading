// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';

import { MascotOverlay } from '../components/MascotOverlay';
import { useMascotStore, type MascotState } from '../services/mascotService';
import {
  buildMascotMarketBrief,
  fetchMascotLine,
  resetMascotAiCooldown,
  MASCOT_AI_COOLDOWN_MS,
} from '../services/mascotAiService';
import { CRYPTO_INITIAL, generateRealSignals } from '../services/apiClient';

const DEFAULT_MESSAGE = 'สวัสดีครับ ผมมอเตอร์บอย พร้อมเป็น Co-Pilot ให้คุณแล้ว!';

function setMascotState(state: MascotState, message?: string) {
  useMascotStore.getState().setMascotState(state, message);
}

beforeEach(() => {
  resetMascotAiCooldown();
  useMascotStore.setState({ state: 'IDLE', message: DEFAULT_MESSAGE });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('MascotOverlay — never blocks the UI', () => {
  it('is a fixed, click-through layer (pointer-events-none on the wrapper)', () => {
    render(<MascotOverlay />);
    const layer = screen.getByTestId('mascot-overlay');
    expect(layer.className).toContain('fixed');
    expect(layer.className).toContain('pointer-events-none');
    expect(layer.className).toContain('z-40'); // below every modal (z-50)
  });

  it('collapses to a 56px chip when idle and exposes an accessible name', () => {
    render(<MascotOverlay />);
    const chip = screen.getByRole('button', { name: /น้องมอเตอร์บอย/ });
    expect(chip.className).toContain('w-14');
    expect(chip.className).toContain('pointer-events-auto');
  });

  it('expands on click and shows the current message as a live region', () => {
    render(<MascotOverlay />);
    fireEvent.click(screen.getByRole('button', { name: /น้องมอเตอร์บอย/ }));

    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.textContent).toContain(DEFAULT_MESSAGE);
  });

  it('can be dismissed for the session', () => {
    render(<MascotOverlay />);
    fireEvent.click(screen.getByRole('button', { name: /น้องมอเตอร์บอย/ }));
    fireEvent.click(screen.getByRole('button', { name: 'ซ่อน' }));
    expect(screen.queryByTestId('mascot-overlay')).toBeNull();
  });
});

describe('MascotOverlay — state driven by the shared mascot store', () => {
  it('expands automatically and shows the critical styling on KILL_SWITCH_ACTIVE', () => {
    render(<MascotOverlay />);
    act(() => setMascotState('KILL_SWITCH_ACTIVE'));

    const status = screen.getByRole('status');
    expect(status.textContent).toContain('หยุดเทรดชั่วคราว');
    expect(status.className).toContain('border-red-500/80');
  });

  it('shows the GOD SPEED flourish while executing', () => {
    render(<MascotOverlay />);
    act(() => setMascotState('READY_TO_EXECUTE'));
    expect(screen.getByRole('status').textContent).toContain('GOD SPEED');
  });

  it('stays a compact chip for low-priority states (SIDEWAYS)', () => {
    render(<MascotOverlay />);
    act(() => setMascotState('SIDEWAYS'));
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('button', { name: /น้องมอเตอร์บอย/ })).toBeTruthy();
  });
});

describe('MascotOverlay — real Gemini speech', () => {
  it('replaces the canned line with the Gemini line when the server answers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ line: 'BTC กำลังยืดตัวแรง อย่าลืมวาง SL ให้ครบก่อนบิดครับ' }),
      }))
    );

    render(<MascotOverlay cryptoList={CRYPTO_INITIAL} signals={generateRealSignals(CRYPTO_INITIAL)} />);
    fireEvent.click(screen.getByRole('button', { name: /น้องมอเตอร์บอย/ }));

    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain('BTC กำลังยืดตัวแรง')
    );

    const body = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string);
    expect(body.state).toBe('IDLE');
    expect(body.marketBrief).toContain('BTC');
  });

  it('keeps the Gemini line while the market feed keeps polling', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ line: 'เส้นต้านสำคัญอยู่ที่ 93,200 ครับ' }) }))
    );

    const { rerender } = render(<MascotOverlay cryptoList={CRYPTO_INITIAL} />);
    fireEvent.click(screen.getByRole('button', { name: /น้องมอเตอร์บอย/ }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('93,200'));

    // Simulate the 15s price poll producing brand-new array identities.
    rerender(<MascotOverlay cryptoList={[...CRYPTO_INITIAL]} signals={[]} />);
    expect(screen.getByRole('status').textContent).toContain('93,200');
  });

  it('keeps the canned line (no crash, no spinner) when Gemini fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({}) })));

    render(<MascotOverlay />);
    fireEvent.click(screen.getByRole('button', { name: /น้องมอเตอร์บอย/ }));

    await waitFor(() => expect(screen.getByRole('status').textContent).toContain(DEFAULT_MESSAGE));
  });
});

describe('mascotAiService', () => {
  it('builds a compact market brief for the prompt', () => {
    const brief = buildMascotMarketBrief({
      cryptoList: CRYPTO_INITIAL,
      signals: generateRealSignals(CRYPTO_INITIAL),
      useThb: true,
      usdThbRate: 34.12,
    });
    expect(brief).toContain('BTC');
    expect(brief).toContain('34.12');
    expect(brief.length).toBeLessThan(600);
  });

  it('returns null instead of throwing when the network fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    resetMascotAiCooldown();
    await expect(fetchMascotLine({ state: 'IDLE', force: true })).resolves.toBeNull();
  });

  it('throttles repeat calls inside the cooldown window', async () => {
    const spy = vi.fn(async () => ({ ok: true, json: async () => ({ line: 'ok' }) }));
    vi.stubGlobal('fetch', spy);
    resetMascotAiCooldown();

    expect(await fetchMascotLine({ state: 'IDLE' })).toBe('ok');
    expect(await fetchMascotLine({ state: 'IDLE' })).toBeNull(); // throttled
    expect(spy).toHaveBeenCalledTimes(1);

    resetMascotAiCooldown();
    expect(await fetchMascotLine({ state: 'IDLE', force: true })).toBe('ok');
    expect(spy).toHaveBeenCalledTimes(2);

    // cooldown is long enough to matter in a trading session
    expect(MASCOT_AI_COOLDOWN_MS).toBeGreaterThanOrEqual(10_000);
  });
});
