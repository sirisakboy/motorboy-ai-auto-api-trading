// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import {
  buildMascotSuggestions,
  loadRecentSuggestionIds,
  recordSuggestionUse,
  resetSuggestionMemory,
  type SuggestionInput,
} from '../mascot/suggestions';
import type { MascotWindowContext, MascotWindowSurface } from '../mascot/feed';
import { MascotOverlay } from '../components/MascotOverlay';
import { resetMascotFeed, publishMascotFeed } from '../mascot/feed';
import { resetMascotAiCooldown } from '../services/mascotAiService';
import { resetMascotActionHandlers } from '../mascot/actions';
import { useMascotStore } from '../services/mascotService';

const ctx = (surface: MascotWindowSurface, selectedAsset = 'bitcoin'): MascotWindowContext => ({
  activeSurface: surface,
  windowTitleTh: surface,
  activeTabLabel: surface,
  selectedAsset,
  openWindows: [],
  focusHint: surface,
});

const crypto = [
  { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', binanceSymbol: 'BTCUSDT', price: 71858, change: -3.19 },
  { id: 'ethereum', symbol: 'ETH', name: 'Ethereum', binanceSymbol: 'ETHUSDT', price: 2015.76, change: 2.4 },
  { id: 'shiba', symbol: 'SHIB', name: 'Shiba Inu', binanceSymbol: 'SHIBUSDT', price: 0.00000431, change: 0.8 },
];

const base: SuggestionInput = {
  windowContext: ctx('DASHBOARD_CRYPTO'),
  cryptoList: crypto as never,
  signals: [
    { id: 's1', symbol: 'BTC', type: 'SHORT', probability: 84, sl: 74058.57, tp: 67823.63 },
  ] as never,
  forexRates: [{ pair: 'USD/THB', price: 36.45, change: -0.15 }] as never,
  thaiStocks: [
    { symbol: 'PTT', name: 'ปตท.', nameEn: 'PTT', sector: 'พลังงาน', price: 34.5, change: 1.2, pe: 9.4, dividendYield: 5.2 },
    { symbol: 'CPALL', name: 'ซีพีออลล์', nameEn: 'CPALL', sector: 'ค้าปลีก', price: 56, change: -0.8, pe: 22.1, dividendYield: 2.1 },
  ] as never,
  foreignStocks: [
    { symbol: 'AAPL', name: 'Apple', price: 200, change: 1.2, high52w: 260, low52w: 160 },
  ] as never,
  watchlist: ['BTC', 'PTT'],
  drawdownBreaches: 0,
  worstDrawdownPct: 0,
  seed: 0,
  now: 1_700_000_000_000,
};

beforeEach(() => {
  localStorage.clear();
  resetMascotFeed();
  resetMascotActionHandlers();
  useMascotStore.setState({ state: 'IDLE', message: 'สวัสดีครับ' });
});

describe('buildMascotSuggestions — generated per window, never fixed', () => {
  it('quotes the live numbers of the window the user is in', () => {
    const list = buildMascotSuggestions(base);
    const all = list.map((s) => `${s.label} ${s.prompt}`).join(' | ');
    expect(all).toContain('71,858'); // BTC price straight from the feed
    expect(all).toContain('BTC');
    expect(list.every((s) => s.prompt.trim().length > 8)).toBe(true);
  });

  it('changes the whole set when the user moves to another window', () => {
    // universal + explore chips are shared by design; only surface chips must move
    const scoped = (id: string) => !id.startsWith('explore:') && !id.startsWith('global:');
    const cryptoList = buildMascotSuggestions(base).map((s) => s.id).filter(scoped);
    const drawdown = buildMascotSuggestions({
      ...base,
      windowContext: ctx('DRAWDOWN_MODAL', 'BTC'),
      drawdownBreaches: 3,
      worstDrawdownPct: -21.09,
    });
    const drawdownIds = drawdown.map((s) => s.id).filter(scoped);
    expect(drawdownIds.some((id) => cryptoList.includes(id))).toBe(false);
    expect(drawdownIds.length).toBeGreaterThan(0);
    // and it actually talks about the risk, with the real numbers
    expect(drawdown.map((s) => s.prompt).join(' ')).toContain('21.09');
  });

  it('always reserves one off-topic explore chip, and it rotates', () => {
    const exploreOf = (seed: number, now: number) =>
      buildMascotSuggestions({ ...base, seed, now }).find((s) => s.origin === 'EXPLORE');

    expect(exploreOf(0, 1_700_000_000_000)).toBeTruthy();
    const prompts = new Set<string>();
    for (let i = 0; i < 12; i += 1) {
      const chip = exploreOf(i, 1_700_000_000_000 + i * 60_000);
      if (chip) prompts.add(chip.prompt);
    }
    expect(prompts.size).toBeGreaterThan(3); // the wildcard is not one hardcoded line
  });

  it('reshuffles on demand (the "สุ่มใหม่" button) instead of showing one fixed order', () => {
    const sets = new Set<string>();
    for (let seed = 0; seed < 8; seed += 1) {
      sets.add(buildMascotSuggestions({ ...base, seed }).map((s) => s.id).join('>'));
    }
    expect(sets.size).toBeGreaterThan(1);
  });

  it('demotes chips the user just tapped', () => {
    const first = buildMascotSuggestions({ ...base, seed: 3 })[0];
    const again = buildMascotSuggestions({ ...base, seed: 3, recentIds: [first.id] });
    expect(again[0]?.id).not.toBe(first.id);
  });

  it('never returns duplicates, respects max, and survives empty feeds', () => {
    const list = buildMascotSuggestions({ windowContext: ctx('DASHBOARD_CRYPTO'), seed: 1, max: 4 });
    expect(list.length).toBeLessThanOrEqual(4);
    expect(new Set(list.map((s) => s.id)).size).toBe(list.length);
    expect(list.length).toBeGreaterThan(0); // still useful with zero market data
  });

  it('does not depend on a fixed command vocabulary — prompts are plain questions', () => {
    const list = buildMascotSuggestions(base);
    list.forEach((s) => {
      expect(s.prompt).not.toMatch(/^\/(help|ดู|เปิด)$/); // no slash-command syntax
      expect(s.label.length).toBeLessThanOrEqual(32);
      expect(['CONTEXT', 'LIVE_DATA', 'RISK', 'EXPLORE']).toContain(s.origin);
    });
  });

  it('remembers taps in localStorage and reset clears them', () => {
    expect(loadRecentSuggestionIds()).toEqual([]);
    recordSuggestionUse('crypto:mover');
    recordSuggestionUse('th:dividend');
    expect(loadRecentSuggestionIds()).toEqual(['th:dividend', 'crypto:mover']);
    resetSuggestionMemory();
    expect(loadRecentSuggestionIds()).toEqual([]);
  });
});

describe('MascotOverlay — contextual shortcuts in the bubble', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    resetMascotActionHandlers();
    resetMascotAiCooldown();
  });

  it('shows generated chips for the active window', () => {
    publishMascotFeed({
      windowContext: ctx('DASHBOARD_CRYPTO'),
      cryptoList: crypto as never,
    });
    render(<MascotOverlay disableEndingsFeed disableAutoPilot />);
    fireEvent.click(screen.getByRole('button', { name: /น้องมอเตอร์บอย/ }));

    const tray = screen.getByTestId('mascot-suggestions');
    expect(tray.querySelectorAll('button[data-origin]').length).toBeGreaterThanOrEqual(3);
    expect(tray.textContent).toContain('ทางลัดของหน้านี้');
  });

  it('sends the chip prompt through the same free-text path', async () => {
    publishMascotFeed({
      windowContext: ctx('DASHBOARD_CRYPTO'),
      cryptoList: crypto as never,
    });
    const spy = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = typeof input === 'string' ? input : String(input);
      if (url.includes('/api/gemini/mascot-action')) {
        return {
          ok: true,
          json: async () => ({ reply: 'ได้เลยครับ ดูให้แล้ว' }),
        } as unknown as Response;
      }
      throw new Error('offline');
    });
    vi.stubGlobal('fetch', spy);

    render(<MascotOverlay disableEndingsFeed disableAutoPilot />);
    fireEvent.click(screen.getByRole('button', { name: /น้องมอเตอร์บอย/ }));

    const chip = screen.getByTestId('mascot-suggestions').querySelector('button[data-origin]') as HTMLButtonElement;
    const chipPrompt = chip.getAttribute('title');
    fireEvent.click(chip);

    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('ได้เลยครับ'));
    const call = spy.mock.calls.find(([input]) => String(input).includes('/api/gemini/mascot-action'));
    expect(call).toBeTruthy();
    const body = String(call?.[1]?.body ?? '');
    expect(body.length).toBeGreaterThan(0);
    expect(body).toContain((chipPrompt ?? '').slice(0, 20));
  });

  it('never locks the input: any free sentence is still accepted', () => {
    publishMascotFeed({ cryptoList: crypto as never });
    render(<MascotOverlay disableEndingsFeed disableAutoPilot />);
    fireEvent.click(screen.getByRole('button', { name: /น้องมอเตอร์บอย/ }));
    const input = screen.getByLabelText('สั่งงานน้องมอเตอร์บอย') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'ช่วยเล่าเรื่องตลาดให้ฟังหน่อยแบบที่ไม่มีในเมนู' } });
    expect(input.value).toContain('แบบที่ไม่มีในเมนู');
    expect(input.disabled).toBe(false);
  });
});
