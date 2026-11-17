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
import { generateRealSignals } from '../services/apiClient';
import { LIVE_CRYPTO_FEED as CRYPTO_INITIAL } from './fixtures/liveCryptoFeed';
import { loadJournal, loadMascotPosition, saveMascotSettings } from '../mascot/journal';
import { publishMascotFeed, resetMascotFeed } from '../mascot/feed';
import { clearEndingsCache } from '../mascot/endings';

const DEFAULT_MESSAGE = 'สวัสดีครับ ผมมอเตอร์บอย พร้อมเป็น Co-Pilot ให้คุณแล้ว!';

/** Minimal Binance-shaped kline payload: a climb that ends on a volume spike. */
function bullKlines(): unknown[] {
  const rows: unknown[] = [];
  for (let i = 0; i < 43; i += 1) {
    const open = 100 + 0.5 * i;
    rows.push([0, String(open), String(open + 0.7), String(open - 0.2), String(open + 0.5), '100', 0]);
  }
  rows.push([0, '121.5', '124.2', '121.3', '124', '300', 0]);
  return rows;
}

function setMascotState(state: MascotState, message?: string) {
  useMascotStore.getState().setMascotState(state, message);
}

beforeEach(() => {
  resetMascotAiCooldown();
  resetMascotFeed();
  useMascotStore.setState({ state: 'IDLE', message: DEFAULT_MESSAGE });
  localStorage.clear();
  clearEndingsCache(); // the 60s feed cache would leak candles between tests
  // Offline by default: the overlay's candle feed must never hit the real network
  // from a unit test. Individual tests stub `fetch` on top of this.
  vi.stubGlobal('fetch', vi.fn(async () => {
    throw new Error('offline');
  }));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('MascotOverlay — never blocks the UI', () => {
  it('is a fixed, click-through layer above all modals (pointer-events-none on the wrapper)', () => {
    render(<MascotOverlay />);
    const layer = screen.getByTestId('mascot-overlay');
    expect(layer.className).toContain('fixed');
    expect(layer.className).toContain('pointer-events-none');
    expect(layer.className).toContain('z-[55]'); // above every modal (z-50)
  });

  it('renders the transparent character as a draggable, accessible control', () => {
    render(<MascotOverlay />);
    const chip = screen.getByRole('button', { name: /น้องมอเตอร์บอย/ });
    expect(chip.className).toContain('pointer-events-auto');
    expect(chip.className).toContain('cursor-grab');
    // no card chrome: the cut-out PNG is the whole button
    const art = chip.querySelector('img');
    expect(art).toBeTruthy();
    expect(art?.getAttribute('alt')).toBe('');
  });

  it('expands on click and shows the current message as a live region', () => {
    render(<MascotOverlay />);
    fireEvent.click(screen.getByRole('button', { name: /น้องมอเตอร์บอย/ }));

    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.textContent).toContain(DEFAULT_MESSAGE);
  });

  it('displays active window awareness when windowContext changes', () => {
    publishMascotFeed({
      windowContext: {
        activeSurface: 'ATS_BACKTEST_MODAL',
        windowTitleTh: 'ห้องทดสอบกลยุทธ์ย้อนหลัง (Backtest Lab)',
        activeTabLabel: 'Backtest',
        selectedAsset: 'BTC',
        openWindows: ['BacktestLab'],
        focusHint: 'โฟกัส Win Rate และ Max Drawdown',
      },
    });
    render(<MascotOverlay />);
    fireEvent.click(screen.getByRole('button', { name: /น้องมอเตอร์บอย/ }));
    expect(screen.getByTestId('mascot-window-focus').textContent).toContain('Backtest Lab');
  });

  it('can be dismissed for the session', () => {
    render(<MascotOverlay />);
    fireEvent.click(screen.getByRole('button', { name: /น้องมอเตอร์บอย/ }));
    fireEvent.click(screen.getByRole('button', { name: 'ซ่อน' }));
    expect(screen.queryByTestId('mascot-overlay')).toBeNull();
  });
});

describe('MascotOverlay — independent, self-driving mascot', () => {
  it('reacts to the published feed with no props at all', async () => {
    publishMascotFeed({
      cryptoList: [
        { symbol: 'BTC', name: 'Bitcoin', price: 100, change: -14.5 },
        { symbol: 'ETH', name: 'Ethereum', price: 50, change: 2 },
        { symbol: 'XRP', name: 'XRP', price: 1, change: 1 },
      ] as never,
    });

    render(<MascotOverlay disableEndingsFeed />);

    await waitFor(() => expect(useMascotStore.getState().state).toBe('KILL_SWITCH_ACTIVE'));
    expect(screen.getByRole('status').textContent).toContain('พักเครื่อง'); // the engine-off label
    expect(screen.getByRole('status').textContent).toContain('พักก่อน'); // …and the observer's own line
  });

  it('still lets an explicit prop pin the market (tests, demos)', () => {
    publishMascotFeed({
      cryptoList: [{ symbol: 'BTC', name: 'Bitcoin', price: 100, change: -14.5 }] as never,
    });

    render(<MascotOverlay disableEndingsFeed disableAutoPilot />);

    expect(useMascotStore.getState().state).toBe('IDLE');
  });
});

describe('MascotOverlay — the character is the door to the chat', () => {
  it('opens the full AI chat from the bubble', () => {
    const onOpenChat = vi.fn();
    render(<MascotOverlay onOpenChat={onOpenChat} />);
    fireEvent.click(screen.getByRole('button', { name: /น้องมอเตอร์บอย/ }));
    fireEvent.click(screen.getByRole('button', { name: 'คุยกับผม' }));
    expect(onOpenChat).toHaveBeenCalledTimes(1);
  });
});

describe('MascotOverlay — free-floating character', () => {
  it('moves with the pointer and remembers where it was dropped', () => {
    render(<MascotOverlay />);
    const layer = screen.getByTestId('mascot-overlay');
    const chip = screen.getByRole('button', { name: /น้องมอเตอร์บอย/ });

    fireEvent.pointerDown(chip, { clientX: 40, clientY: 40, pointerId: 1, button: 0 });
    fireEvent.pointerMove(chip, { clientX: 140, clientY: 90, pointerId: 1 });
    fireEvent.pointerUp(chip, { clientX: 140, clientY: 90, pointerId: 1 });

    expect(layer.style.left).toBe('100px');
    expect(layer.style.top).toBe('50px');
    expect(loadMascotPosition()).toEqual({ x: 100, y: 50 });
  });

  it('does not open the bubble when the gesture was a drag', () => {
    render(<MascotOverlay />);
    const chip = screen.getByRole('button', { name: /น้องมอเตอร์บอย/ });

    fireEvent.pointerDown(chip, { clientX: 40, clientY: 40, pointerId: 1, button: 0 });
    fireEvent.pointerMove(chip, { clientX: 160, clientY: 120, pointerId: 1 });
    fireEvent.pointerUp(chip, { clientX: 160, clientY: 120, pointerId: 1 });
    fireEvent.click(chip);

    expect(screen.queryByRole('status')).toBeNull();
  });

  it('can be moved with the keyboard for people who cannot drag', () => {
    render(<MascotOverlay />);
    const chip = screen.getByRole('button', { name: /น้องมอเตอร์บอย/ });

    fireEvent.keyDown(chip, { key: 'ArrowLeft' });
    fireEvent.keyDown(chip, { key: 'ArrowUp' });

    // clamped to the 8px viewport margin, then persisted
    expect(loadMascotPosition()).toEqual({ x: 8, y: 8 });
  });
});

describe('MascotOverlay — automatic detection replaces the dashboard card', () => {
  it('re-appears when a risk event is detected after the trader hid it', () => {
    render(<MascotOverlay />);
    fireEvent.click(screen.getByRole('button', { name: /น้องมอเตอร์บอย/ }));
    fireEvent.click(screen.getByRole('button', { name: 'ซ่อน' }));
    expect(screen.queryByTestId('mascot-overlay')).toBeNull();

    // The drawdown / volatility detectors raise this state on their own.
    act(() => setMascotState('KILL_SWITCH_ACTIVE'));

    expect(screen.getByTestId('mascot-overlay')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('หยุดเทรดชั่วคราว');
  });

  it('acknowledging a detected risk returns it to idle', () => {
    render(<MascotOverlay />);
    act(() => setMascotState('RISK_REJECT'));

    fireEvent.click(screen.getByRole('button', { name: 'รับทราบครับ' }));

    expect(useMascotStore.getState().state).toBe('IDLE');
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('MascotOverlay — state driven by the shared mascot store', () => {
  it('expands automatically and shows the critical styling on KILL_SWITCH_ACTIVE', () => {
    render(<MascotOverlay />);
    act(() => setMascotState('KILL_SWITCH_ACTIVE'));

    const status = screen.getByRole('status');
    expect(status.textContent).toContain('พักเครื่อง');
    // skin-defined bear colour, applied inline because it depends on state
    expect(status.style.borderColor.replace(/\s/g, '')).toBe('rgb(244,166,166)');
  });

  it('reads as parked (not sad) when the engine is off', () => {
    const { container } = render(<MascotOverlay />);
    act(() => setMascotState('KILL_SWITCH_ACTIVE'));

    const character = screen.getByRole('button', { name: /น้องมอเตอร์บอย/ });
    // switched off: no drift animation, the character is desaturated…
    expect(character.className).not.toContain('animate-mascot-drift');
    const img = container.querySelector('img');
    expect(img?.style.filter).toContain('grayscale');
    // …and a small "พักเครื่อง" tag replaces the SL-umbrella reading
    expect(character.textContent).toContain('พักเครื่อง');
    expect(character.getAttribute('title')).toContain('kill switch');
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

    const post = vi
      .mocked(fetch)
      .mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === 'POST');
    expect(post).toBeTruthy();
    const body = JSON.parse((post![1] as RequestInit).body as string);
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

describe('MascotOverlay — AI endings (V4.1 brain)', () => {
  function stubEndingsFeed(klines: unknown[], line = 'ประโยคเดียวจาก AI ครับ') {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) =>
        (init as RequestInit | undefined)?.method === 'POST'
          ? { ok: true, json: async () => ({ line }) }
          : { ok: true, json: async () => klines }
      )
    );
  }

  it('shows the ending badge and journals it automatically', async () => {
    stubEndingsFeed(bullKlines());
    render(<MascotOverlay />);
    fireEvent.click(screen.getByRole('button', { name: /น้องมอเตอร์บอย/ }));

    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('BULL END'));

    const status = screen.getByRole('status');
    expect(status.textContent).toMatch(/BULL END/);
    expect(status.textContent).toContain('%');
    expect(status.textContent).toContain('เป้า');

    // auto journal (§6.8) — the trader never has to remember what was said
    await waitFor(() => expect(loadJournal()[0]?.type).toBe('BULL_END'));
  });

  it('stays quiet when the candle feed is unavailable (no invented ending)', async () => {
    render(<MascotOverlay />); // default stub throws → offline
    fireEvent.click(screen.getByRole('button', { name: /น้องมอเตอร์บอย/ }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain(DEFAULT_MESSAGE));
    expect(screen.getByRole('status').textContent).not.toContain('BULL END');
    expect(loadJournal()).toHaveLength(0);
  });

  it('quiet mode keeps the AI running but renders only the numbers', async () => {
    saveMascotSettings({ quietMode: true });
    stubEndingsFeed(bullKlines());

    render(<MascotOverlay />);

    expect(screen.queryByRole('status')).toBeNull();
    const toggle = screen.getByRole('button', { name: /โหมดเงียบ/ });
    expect(toggle.textContent).toBeTruthy();

    // numbers still update in the background
    await waitFor(() => expect(toggle.textContent).toMatch(/BULL END \d+%/));
  });

  it('quotes the ending in the same currency mode as the rest of the app', async () => {
    stubEndingsFeed(bullKlines());
    render(<MascotOverlay useThb usdThbRate={35} />);
    fireEvent.click(screen.getByRole('button', { name: /น้องมอเตอร์บอย/ }));

    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('BULL END'));
    // project formatter => ฿ when the trader is in ฿ mode (never a bare number)
    expect(screen.getByRole('status').textContent).toContain('฿');
  });

  it('onboarding outlines a real control instead of covering it (rule 7)', () => {
    render(<MascotOverlay />);
    act(() => setMascotState('ONBOARDING'));

    const realButton = document.createElement('button');
    realButton.textContent = 'ซื้อ';
    document.body.appendChild(realButton);

    fireEvent.click(screen.getByRole('button', { name: 'ชี้จุดเริ่มให้หน่อย' }));

    expect(realButton.style.outline).toContain('solid');
    realButton.remove();
  });

  it('carries the L1 face id on its root so the one-face guard can see it', () => {
    render(<MascotOverlay />);
    const layer = screen.getByTestId('mascot-overlay');
    expect(layer.getAttribute('data-motorboy-root')).toBe('');
    expect(layer.getAttribute('data-motorboy-face')).toBe('MB-33-MASTER-001');
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
