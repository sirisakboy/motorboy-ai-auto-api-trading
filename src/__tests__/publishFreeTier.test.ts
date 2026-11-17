import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Request, Response } from 'express';

import { GEMINI_MODEL_FALLBACKS, classifyGeminiError } from '../server/geminiConfig';
import {
  clearYahooProxyCache,
  handleYahooProxyRequest,
  sanitizeYahooProxyPath,
} from '../server/yahooProxy';
import {
  fingerprintApiKey,
  getCachedAiResponse,
  hashPromptSignature,
  isGroundingGloballyEnabled,
  markGroundingBlocked,
  resetGeminiQuotaShieldForTest,
  setCachedAiResponse,
  shouldAttemptGrounding,
  shouldCooldownGroundingOnError,
} from '../server/geminiQuotaShield';
import {
  categorizeHeadlinesWithGemini,
  resetHeadlineCategorizationState,
} from '../services/headlineCategorizationService';
import {
  fetchMascotLine,
  resetMascotAiCooldown,
} from '../services/mascotAiService';
import { resolveWritableArchiveRoot } from '../server/googleDriveArchive';

function mockExpressRes() {
  const headers: Record<string, string> = {};
  const res: any = {
    statusCode: 200,
    body: undefined as unknown,
    setHeader(k: string, v: string) {
      headers[k] = v;
      return res;
    },
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(data: unknown) {
      res.body = data;
      return res;
    },
    send(data: unknown) {
      res.body = data;
      return res;
    },
  };
  return { res: res as Response, state: res, headers };
}

describe('publish & free-tier readiness', () => {
  beforeEach(() => {
    clearYahooProxyCache();
    resetGeminiQuotaShieldForTest();
    resetHeadlineCategorizationState();
    resetMascotAiCooldown();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses active free-tier fallback model chain without non-existent model IDs', () => {
    expect(GEMINI_MODEL_FALLBACKS).toEqual(['gemini-4-hydrogen']);
  });

  it('sanitizes /api/yahoo proxy paths strictly to finance chart & search endpoints', () => {
    expect(sanitizeYahooProxyPath('/v8/finance/chart/AAPL?interval=1d&range=5d')).toBe(
      '/v8/finance/chart/AAPL?interval=1d&range=5d'
    );
    expect(sanitizeYahooProxyPath('/v8/finance/chart/%5ESET.BK?interval=1d&range=5d')).toBe(
      '/v8/finance/chart/%5ESET.BK?interval=1d&range=5d'
    );
    expect(sanitizeYahooProxyPath('/v1/finance/search?q=PTT')).toBe('/v1/finance/search?q=PTT');

    expect(sanitizeYahooProxyPath('//evil.com/steal')).toBeNull();
    expect(sanitizeYahooProxyPath('/v8/finance/chart/../../etc/passwd')).toBeNull();
    expect(sanitizeYahooProxyPath('/admin/secret')).toBeNull();
    expect(sanitizeYahooProxyPath('/v8/finance/chart/AAPL@evil.com')).toBeNull();
  });

  it('caches upstream Yahoo Finance responses for production GET requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      text: async () => JSON.stringify({ chart: { result: [{ meta: { regularMarketPrice: 123 } }] } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const req = {
      method: 'GET',
      url: '/v8/finance/chart/AAPL?interval=1d&range=5d',
    } as Request;

    const first = mockExpressRes();
    await handleYahooProxyRequest(req, first.res);
    expect(first.state.statusCode).toBe(200);
    expect(first.headers['X-Cache']).toBe('MISS');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const second = mockExpressRes();
    await handleYahooProxyRequest(req, second.res);
    expect(second.state.statusCode).toBe(200);
    expect(second.headers['X-Cache']).toBe('HIT');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const blocked = mockExpressRes();
    await handleYahooProxyRequest({ method: 'GET', url: '//evil.com' } as Request, blocked.res);
    expect(blocked.state.statusCode).toBe(400);
  });

  it('tracks grounding cooldown per hashed API key to avoid 2x free-tier quota burn', () => {
    expect(isGroundingGloballyEnabled({ GEMINI_ENABLE_GROUNDING: 'false' })).toBe(false);
    expect(isGroundingGloballyEnabled({})).toBe(true);

    const key = 'AIzaTestFreeTierKey_12345';
    expect(fingerprintApiKey(key)).not.toContain(key);
    expect(shouldAttemptGrounding(key, {}, 1_000)).toBe(true);

    const quotaErr = classifyGeminiError({ status: 429, message: 'RESOURCE_EXHAUSTED' });
    expect(shouldCooldownGroundingOnError(quotaErr)).toBe(true);

    markGroundingBlocked(key, 60_000, 1_000);
    expect(shouldAttemptGrounding(key, {}, 10_000)).toBe(false);
    expect(shouldAttemptGrounding(key, {}, 70_000)).toBe(true);
  });

  it('stores short-TTL AI responses cleanly in quota shield cache', () => {
    const key = `stance:${hashPromptSignature({ a: 1 })}`;
    setCachedAiResponse(key, { recommendation: 'HOLD' }, 10_000, 1_000);
    expect(getCachedAiResponse(key, 5_000)).toEqual({ recommendation: 'HOLD' });
    expect(getCachedAiResponse(key, 15_000)).toBeNull();
  });

  it('pauses headline Gemini categorization on 429 QUOTA and falls back to heuristics', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ kind: 'QUOTA', error: 'quota_exceeded' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const sampleNews = [
      {
        id: 'n1',
        title: 'FED announces interest rate outlook amid CPI report',
        source: 'Reuters',
        time: '10m ago',
        sentiment: 'NEUTRAL' as const,
        url: 'https://example.com/1',
      },
    ];

    const first = await categorizeHeadlinesWithGemini(sampleNews, 'AIzaUserFreeTierKey');
    expect(first[0].impact).toBe('HIGH');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Second call while quota cooldown is active must NOT call fetch again
    const second = await categorizeHeadlinesWithGemini(sampleNews, 'AIzaUserFreeTierKey');
    expect(second[0].impact).toBe('HIGH');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('pauses headline Gemini categorization on 502 SERVER_ERROR or degraded fallback', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => ({ kind: 'SERVER_ERROR', error: 'gemini_unavailable' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const sampleNews = [
      {
        id: 'n2',
        title: 'Bitcoin rally accelerates after ETF inflows',
        source: 'CoinDesk',
        time: '5m ago',
        sentiment: 'BULLISH' as const,
        url: 'https://example.com/2',
      },
    ];

    const first = await categorizeHeadlinesWithGemini(sampleNews, 'AIzaTransientKey');
    expect(first[0].impact).toBe('MEDIUM');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const second = await categorizeHeadlinesWithGemini(sampleNews, 'AIzaTransientKey');
    expect(second[0].impact).toBe('MEDIUM');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('pauses floating mascot AI calls on 429 QUOTA', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ kind: 'QUOTA', error: 'quota_exceeded' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const first = await fetchMascotLine({ state: 'IDLE', apiKey: 'AIzaUserFreeTierKey' });
    expect(first).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const second = await fetchMascotLine({ state: 'SCANNING', apiKey: 'AIzaUserFreeTierKey' });
    expect(second).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('resolves a writable archive root directory cleanly', () => {
    const dir = resolveWritableArchiveRoot();
    expect(typeof dir).toBe('string');
    expect(dir.length).toBeGreaterThan(0);
  });
});
