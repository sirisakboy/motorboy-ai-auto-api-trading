import { describe, it, expect } from 'vitest';
import {
  isAtsMatrixTrigger,
  computeAtsMatrixAnalysis,
  getBtcFromCryptoList,
} from '../services/atsMatrixService';
import { CRYPTO_INITIAL } from '../services/apiClient';
import { generateAiChatReply } from '../services/aiChatService';

describe('isAtsMatrixTrigger (search-box trigger)', () => {
  it('fires on market words — the keyword set this function documents', () => {
    expect(isAtsMatrixTrigger('MARKETS')).toBe(true);
    expect(isAtsMatrixTrigger('btc')).toBe(true);
    expect(isAtsMatrixTrigger('Bitcoin today?')).toBe(true);
    expect(isAtsMatrixTrigger('polymarket arb')).toBe(true);
  });

  it('does not fire on unrelated text or empty input', () => {
    expect(isAtsMatrixTrigger('')).toBe(false);
    expect(isAtsMatrixTrigger('how is my portfolio doing')).toBe(false);
  });

  it('KNOWN DIVERGENCE: the literal command "ATS" does not open the dashboard', () => {
    // The search-box trigger above and aiChatService's private
    // isExplicitAtsReportCommand() use two different keyword lists.
    // "ATS" / "ATS MATRIX" / "Torus" trigger a chat report but not this UI
    // trigger — see CODE_REVIEW.md P3 (duplicated trigger logic).
    expect(isAtsMatrixTrigger('ATS')).toBe(false);
    expect(isAtsMatrixTrigger('Torus Model')).toBe(false);
  });
});

describe('chat-side ATS command (aiChatService)', () => {
  it('answers an explicit ATS command from local data without any network call', async () => {
    const reply = await generateAiChatReply('ATS', { cryptoList: CRYPTO_INITIAL });
    expect(typeof reply).toBe('string');
    expect(reply.length).toBeGreaterThan(0);
    expect(reply).toBe(
      computeAtsMatrixAnalysis(CRYPTO_INITIAL[0].price, CRYPTO_INITIAL[0].change).rawTraderTextTh
    );
  });
});

describe('getBtcFromCryptoList', () => {
  it('finds BTC in the feed', () => {
    const btc = getBtcFromCryptoList(CRYPTO_INITIAL);
    expect(btc.price).toBe(CRYPTO_INITIAL[0].price);
    expect(Number.isFinite(btc.change)).toBe(true);
  });

  it('returns a safe default for an empty list', () => {
    const btc = getBtcFromCryptoList([]);
    expect(btc.price).toBeGreaterThan(0);
    expect(Number.isFinite(btc.change)).toBe(true);
  });
});

describe('computeAtsMatrixAnalysis', () => {
  it('is deterministic for identical inputs', () => {
    const a = computeAtsMatrixAnalysis(92000, 1.8);
    const b = computeAtsMatrixAnalysis(92000, 1.8);
    expect(b.dashboard.btcSpot).toBe(a.dashboard.btcSpot);
    expect(b.dashboard.winRatePct).toBe(a.dashboard.winRatePct);
    expect(b.rawTraderTextTh).toBe(a.rawTraderTextTh);
  });

  it('returns a complete, renderable payload', () => {
    const analysis = computeAtsMatrixAnalysis(92000, 1.8);
    expect(analysis.rawTraderTextTh.length).toBeGreaterThan(0);
    expect(analysis.riskWarningTh.length).toBeGreaterThan(0);
    expect(analysis.dashboard.btcSpot).toBe(92000);
    expect(Number.isFinite(analysis.dashboard.modelEdgePct)).toBe(true);
    expect(['BID', 'ASK']).toContain(analysis.torusOrderBook.dominantSide);
    expect(['LONG', 'SHORT', 'ACCUMULATE', 'HOLD']).toContain(analysis.forecasts.oneMin.action);
  });

  it('does not blow up on zero / negative prices', () => {
    expect(() => computeAtsMatrixAnalysis(0, 0)).not.toThrow();
    const analysis = computeAtsMatrixAnalysis(0, 0);
    expect(Number.isFinite(analysis.dashboard.modelEdgePct)).toBe(true);
  });
});
