// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StockCardShell } from '../components/stocks/StockCardShell';
import { ForexCard } from '../components/ForexCard';
import { DrawdownMonitorModal } from '../components/DrawdownMonitorModal';
import { buildDrawdownAssets, DEFAULT_THRESHOLDS, computePortfolioDrawdownSummary } from '../services/drawdownService';
import { SEED_SNAPSHOT_AT } from '../services/apiClient';
import type { ForexPair } from '../types';

const noop = () => {};

describe('as-of labelling for non-live data', () => {
  it('shows the timestamp under a stale stock card', () => {
    render(
      <StockCardShell
        symbol="PTT"
        name="ปตท. (PTT)"
        accent="amber"
        badgeLabel="SET50"
        priceText="฿34.50"
        change={0.5}
        isLive={false}
        updatedAt={SEED_SNAPSHOT_AT}
        stats={[]}
        sector="พลังงาน"
        isWatchlisted={false}
        onToggleWatchlist={noop}
        onSelect={noop}
      />
    );

    const asOf = screen.getByTestId('as-of-PTT');
    expect(asOf.textContent).toContain('ณ');
    expect(asOf.textContent).toMatch(/ณ \d{1,2} .+ \d{4} \d{2}:\d{2}/);
    expect(screen.getByText(/STALE/)).toBeTruthy();
  });

  it('does not date a live card (live means now)', () => {
    render(
      <StockCardShell
        symbol="AAPL"
        name="Apple"
        accent="lavender"
        badgeLabel="US"
        priceText="$200.00"
        change={1}
        isLive
        updatedAt={new Date().toISOString()}
        stats={[]}
        sector="Tech"
        isWatchlisted={false}
        onToggleWatchlist={noop}
        onSelect={noop}
      />
    );
    expect(screen.queryByTestId('as-of-AAPL')).toBeNull();
  });

  it('dates a stale forex rate', () => {
    const forex: ForexPair = {
      pair: 'USD/THB',
      price: 36.45,
      change: -0.15,
      isLive: false,
      updatedAt: SEED_SNAPSHOT_AT,
    };
    render(
      <ForexCard
        forex={forex}
        isWatchlisted={false}
        onToggleWatchlist={noop}
        onSelect={noop}
      />
    );
    expect(screen.getByTestId('fx-as-of-USD/THB').textContent).toContain('ณ');
  });
});

describe('drawdown modal shows where the peak came from', () => {
  const assets = buildDrawdownAssets({
    cryptoList: [
      { id: 'btc', symbol: 'BTC', name: 'Bitcoin', binanceSymbol: 'BTCUSDT', price: 70000, change: 1 },
    ],
    thresholds: DEFAULT_THRESHOLDS,
    autoPeaks: { BTC: 77777.78 },
  });

  it('tags the AI peak and shows the automatic badge', () => {
    render(
      <DrawdownMonitorModal
        isOpen
        onClose={noop}
        assets={assets}
        summary={computePortfolioDrawdownSummary(assets)}
        thresholds={DEFAULT_THRESHOLDS}
        onUpdateThresholds={vi.fn()}
        onUpdateCustomPeak={vi.fn()}
      />
    );

    expect(screen.getByTestId('ai-peak-badge').textContent).toContain('AI PEAK');
    expect(screen.getByTestId('ai-peak-BTC').textContent).toContain('อัตโนมัติ');
    // no manual onboarding prompt for a row the AI already tracks
    expect(screen.queryByText('ตั้งจุดพีค')).toBeNull();
  });
});
