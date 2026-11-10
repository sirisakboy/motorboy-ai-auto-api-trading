import { describe, it, expect } from 'vitest';
import {
  DEFAULT_THRESHOLDS,
  determineRiskStatus,
  computePortfolioDrawdownSummary,
} from '../services/drawdownService';
import type { DrawdownAsset, DrawdownRiskStatus } from '../types';

function asset(
  symbol: string,
  currentDrawdownPct: number,
  status: DrawdownRiskStatus
): DrawdownAsset {
  return {
    id: symbol.toLowerCase(),
    symbol,
    name: symbol,
    category: 'CRYPTO',
    currentPrice: 100,
    peakPrice: 100,
    troughPrice: 100,
    currentDrawdownPct,
    maxDrawdownPct: currentDrawdownPct,
    recoveryNeededPct: 0,
    declineAmount: 0,
    status,
    daysInDrawdown: 1,
    underwaterCurve: [0, currentDrawdownPct],
    lastUpdated: new Date('2026-01-01T00:00:00Z').toISOString(),
  };
}

describe('determineRiskStatus', () => {
  it('classifies exactly on the configured boundaries', () => {
    expect(determineRiskStatus(-35, DEFAULT_THRESHOLDS)).toBe('EXTREME');
    expect(determineRiskStatus(-20, DEFAULT_THRESHOLDS)).toBe('CRITICAL');
    expect(determineRiskStatus(-10, DEFAULT_THRESHOLDS)).toBe('WARNING');
    expect(determineRiskStatus(0, DEFAULT_THRESHOLDS)).toBe('NORMAL');
    expect(determineRiskStatus(-50, DEFAULT_THRESHOLDS)).toBe('EXTREME');
  });

  it('respects custom thresholds', () => {
    const tight = { ...DEFAULT_THRESHOLDS, warning: -3, critical: -6, extreme: -9 };
    expect(determineRiskStatus(-4, tight)).toBe('WARNING'); // worse than -3, better than -6
    expect(determineRiskStatus(-7, tight)).toBe('CRITICAL');
    expect(determineRiskStatus(-10, tight)).toBe('EXTREME');
    expect(determineRiskStatus(-2, tight)).toBe('NORMAL');
  });
});

describe('computePortfolioDrawdownSummary', () => {
  it('returns an empty, NORMAL summary for an empty portfolio', () => {
    const summary = computePortfolioDrawdownSummary([]);
    expect(summary.monitoredCount).toBe(0);
    expect(summary.worstAssetSymbol).toBe('-');
    expect(summary.portfolioStatus).toBe('NORMAL');
    expect(summary.recommendedActionTh.length).toBeGreaterThan(0);
  });

  it('counts assets by severity and reports the worst one', () => {
    const summary = computePortfolioDrawdownSummary([
      asset('BTC', -5, 'NORMAL'),
      asset('ETH', -12, 'WARNING'),
      asset('SOL', -24, 'CRITICAL'),
      asset('XRP', -40, 'EXTREME'),
    ]);
    expect(summary.monitoredCount).toBe(4);
    expect(summary.warningCount).toBe(1);
    expect(summary.criticalCount).toBe(1);
    expect(summary.extremeCount).toBe(1);
    expect(summary.worstAssetSymbol).toBe('XRP');
    expect(summary.worstDrawdownPct).toBe(-40);
    expect(summary.portfolioStatus).toBe('EXTREME');
  });

  it('averages drawdowns across the monitored set', () => {
    const summary = computePortfolioDrawdownSummary([
      asset('BTC', -10, 'WARNING'),
      asset('ETH', -20, 'CRITICAL'),
    ]);
    expect(summary.avgDrawdownPct).toBe(-15);
  });
});
