// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

import {
  getCryptoDecimals,
  formatCryptoPrice,
  validateTradingSignal,
  momentumLabel,
  INCONSISTENT_SIGNAL_LABEL,
} from '../utils';
import { CryptoCard } from '../components/CryptoCard';
import { SystemHealthPanel } from '../components/SystemHealthPanel';
import { SignalDetailModal } from '../components/SignalDetailModal';
import type { TradingSignal, ApiStatusState } from '../types';

// Firebase Auth พ่น warning ใน jsdom — component ชุดนี้ไม่ได้ใช้ auth เลย
vi.mock('firebase/auth', () => ({
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
  onAuthStateChanged: vi.fn(),
  GoogleAuthProvider: { credentialFromResult: vi.fn() },
  getAuth: vi.fn(() => ({ currentUser: null })),
}));

vi.mock('../firebase', () => ({
  auth: { currentUser: null },
  db: {},
  googleProvider: { setCustomParameters: vi.fn(), addScope: vi.fn() },
  workspaceGoogleProvider: { setCustomParameters: vi.fn(), addScope: vi.fn() },
  GMAIL_SCOPES: [],
  CALENDAR_SCOPES: [],
  CHAT_SCOPES: [],
}));

afterEach(() => {
  cleanup();
  document.body.style.overflow = '';
});

const makeSignal = (over: Partial<TradingSignal> = {}): TradingSignal => ({
  id: 'sig-1',
  symbol: 'BTC',
  base: 'BTC',
  quote: 'USDT',
  type: 'LONG',
  probability: 72,
  timeframe: '1H',
  price: 92450,
  change: 2.4,
  statusText: 'Breakout',
  reason: 'Volume expansion',
  sources: ['Binance'],
  tags: ['Breakout'],
  sl: 89500,
  tp: 98000,
  similarity: 88,
  etfFlow: '+$120M',
  category: 'CRYPTO',
  ...over,
});

const statusFixture = (over: Partial<ApiStatusState> = {}): ApiStatusState => ({
  binanceWs: 'LIVE',
  coinGecko: 'LIVE',
  forex: 'LIVE',
  news: 'LIVE',
  signals: 'LIVE',
  stocks: 'LIVE',
  ...over,
});

describe('getCryptoDecimals / formatCryptoPrice', () => {
  it('scales decimals by price magnitude', () => {
    expect(getCryptoDecimals(0.0000245)).toBe(8); // SHIB
    expect(getCryptoDecimals(0.0099)).toBe(8);
    expect(getCryptoDecimals(0.01)).toBe(4);
    expect(getCryptoDecimals(0.42)).toBe(4);
    expect(getCryptoDecimals(1)).toBe(2);
    expect(getCryptoDecimals(92450)).toBe(2);
  });

  it('never collapses a micro-cap price to $0.00', () => {
    const out = formatCryptoPrice({ price: 0.0000245 });
    expect(out).toBe('$0.00002450');
    expect(out).not.toBe('$0.00');
  });

  it('applies the THB multiplier before choosing decimals', () => {
    // 0.42 * 36.45 = 15.309 → >= 1 → 2 ตำแหน่ง
    expect(formatCryptoPrice({ price: 0.42, mode: 'THB', usdThbRate: 36.45 })).toBe('฿15.31');
    // SHIB ยังต้องไม่หายไปเป็น ฿0.00
    expect(formatCryptoPrice({ price: 0.0000245, mode: 'THB', usdThbRate: 36.45 })).toContain(
      '฿0.000893'
    );
  });

  it('returns "-" for non-finite input instead of NaN strings', () => {
    expect(formatCryptoPrice({ price: Number.NaN })).toBe('-');
    expect(formatCryptoPrice({ price: Number.POSITIVE_INFINITY })).toBe('-');
  });
});

describe('validateTradingSignal', () => {
  it('accepts a consistent LONG (SL < price < TP)', () => {
    const res = validateTradingSignal({ type: 'LONG', price: 100, sl: 95, tp: 110 });
    expect(res.valid).toBe(true);
    expect(res.code).toBe('OK');
  });

  it('accepts a consistent SHORT (TP < price < SL)', () => {
    expect(validateTradingSignal({ type: 'SHORT', price: 100, sl: 105, tp: 90 }).valid).toBe(true);
  });

  it('rejects LONG with SL above price', () => {
    const res = validateTradingSignal({ type: 'LONG', price: 100, sl: 105, tp: 110 });
    expect(res.valid).toBe(false);
    expect(res.code).toBe('INVALID_RANGE');
    expect(res.message).toContain(INCONSISTENT_SIGNAL_LABEL);
  });

  it('rejects LONG with TP below price', () => {
    expect(validateTradingSignal({ type: 'LONG', price: 100, sl: 95, tp: 90 }).valid).toBe(false);
  });

  it('rejects SHORT with inverted levels', () => {
    expect(validateTradingSignal({ type: 'SHORT', price: 100, sl: 95, tp: 90 }).valid).toBe(false);
  });

  it('treats equal levels and non-finite values as invalid', () => {
    expect(validateTradingSignal({ type: 'LONG', price: 100, sl: 100, tp: 100 }).valid).toBe(false);
    expect(validateTradingSignal({ type: 'LONG', price: Number.NaN, sl: 95, tp: 110 }).code).toBe(
      'MISSING_PRICE'
    );
    expect(validateTradingSignal(null).valid).toBe(false);
  });
});

describe('momentumLabel', () => {
  it('always carries the timeframe', () => {
    expect(momentumLabel({ changePct: 2.4, timeframe: '1H' })).toBe('โมเมนตัมบวก (1H)');
    expect(momentumLabel({ changePct: -1.1, timeframe: '4H' })).toBe('โมเมนตัมชะลอ (4H)');
  });

  it('flags the contradiction with the signal direction', () => {
    expect(momentumLabel({ changePct: 2.4, timeframe: '1H', direction: 'SHORT' })).toBe(
      'โมเมนตัมบวก (1H) แต่แนวโน้มหลักยังเป็นขาลง'
    );
    expect(momentumLabel({ changePct: -2.4, timeframe: '1D', direction: 'LONG' })).toBe(
      'โมเมนตัมชะลอ (1D) แต่แนวโน้มหลักยังเป็นขาขึ้น'
    );
  });

  it('degrades gracefully without data', () => {
    expect(momentumLabel({ changePct: Number.NaN, timeframe: '1H' })).toBe('โมเมนตัมยังไม่ชัดเจน');
  });
});

describe('CryptoCard — price & signal integrity', () => {
  const noop = () => {};

  it('shows micro-cap prices with 8 decimals', () => {
    render(
      <CryptoCard
        signal={makeSignal({ symbol: 'SHIB', base: 'SHIB', price: 0.0000245, sl: 0.000023, tp: 0.000028 })}
        isWatchlisted={false}
        useThb={false}
        onToggleWatchlist={noop}
        onSelect={noop}
      />
    );
    expect(screen.getByText('$0.00002450')).toBeTruthy();
    expect(screen.queryByText('$0.00')).toBeNull();
  });

  it('replaces inverted SL/TP with the inconsistency warning', () => {
    render(
      <CryptoCard
        signal={makeSignal({ type: 'LONG', price: 100, sl: 110, tp: 120 })}
        isWatchlisted={false}
        useThb={false}
        onToggleWatchlist={noop}
        onSelect={noop}
      />
    );
    expect(screen.getByText(INCONSISTENT_SIGNAL_LABEL)).toBeTruthy();
    expect(screen.queryByText(/SL:/)).toBeNull();
    expect(screen.queryByText(/TP:/)).toBeNull();
  });
});

describe('SystemHealthPanel', () => {
  it('is collapsed by default but still summarises health', () => {
    render(<SystemHealthPanel status={statusFixture()} onRefresh={() => {}} />);
    const toggle = screen.getByRole('button', { name: /System Health/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByTestId('system-health-summary').textContent).toContain('6/6 LIVE');
    expect(screen.queryByText('API สถานะ • Error Handling')).toBeNull();
  });

  it('expands to the original API status card and collapses again', () => {
    render(<SystemHealthPanel status={statusFixture({ news: 'FALLBACK' })} onRefresh={() => {}} />);
    const toggle = screen.getByRole('button', { name: /System Health/ });
    expect(screen.getByTestId('system-health-summary').textContent).toContain('สำรอง');

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('API สถานะ • Error Handling')).toBeTruthy();

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('API สถานะ • Error Handling')).toBeNull();
  });
});

describe('SignalDetailModal — inconsistent signal', () => {
  it('hides the SL/TP numbers and shows the warning', () => {
    render(
      <SignalDetailModal
        signal={makeSignal({ type: 'LONG', price: 100, sl: 112, tp: 90, change: -1.2 })}
        useThb={false}
        geminiApiKey=""
        onDismiss={() => {}}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'SL / TP' }));
    expect(screen.getByTestId('signal-inconsistent-warning')).toBeTruthy();
    expect(screen.queryByText('Stop Loss (SL)')).toBeNull();
  });

  it('shows momentum with timeframe and contradiction note', () => {
    render(
      <SignalDetailModal
        signal={makeSignal({ type: 'SHORT', change: 3.1, timeframe: '1H' })}
        useThb={false}
        geminiApiKey=""
        onDismiss={() => {}}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'เทคนิคอล' }));
    expect(screen.getByTestId('momentum-label').textContent).toBe(
      'โมเมนตัมบวก (1H) แต่แนวโน้มหลักยังเป็นขาลง'
    );
  });
});
