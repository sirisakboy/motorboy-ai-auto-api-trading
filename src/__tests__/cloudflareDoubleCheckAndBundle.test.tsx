// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

import { onRequest } from '../../functions/api/[[path]]';
import {
  parseRssOrAtomXml,
  resetRssAndAnalysisMemoryForTest,
  validateExternalFeedUrl,
  type D1DatabaseLike,
} from '../cloudflare/rssAndAnalysisEngine';
import {
  CF_LLAMA3_MODEL,
  analyzeRssWithWorkersAi,
  runCloudflareAndMainAiDoubleCheck,
} from '../services/cloudflareAiService';
import { AiAnalysisPanel } from '../components/AiAnalysisPanel';
import { BackgroundMusic } from '../components/BackgroundMusic';

function createMockD1(): { db: D1DatabaseLike; insertedTables: string[] } {
  const insertedTables: string[] = [];
  const rowsByTable: Record<string, Record<string, unknown>[]> = {
    rss_feeds: [],
    rss_items: [],
    ai_analysis: [],
    songs: [],
  };

  const db: D1DatabaseLike = {
    prepare(query: string) {
      let boundValues: unknown[] = [];
      const stmt = {
        bind(...vals: unknown[]) {
          boundValues = vals;
          return stmt;
        },
        async all<T = Record<string, unknown>>() {
          if (query.includes('FROM ai_analysis')) {
            return { results: rowsByTable.ai_analysis.slice() as unknown as T[] };
          }
          if (query.includes('FROM rss_items')) {
            return { results: rowsByTable.rss_items.slice() as unknown as T[] };
          }
          if (query.includes('FROM rss_feeds')) {
            return { results: rowsByTable.rss_feeds.slice() as unknown as T[] };
          }
          return { results: [] as T[] };
        },
        async first<T = Record<string, unknown>>() {
          if (query.includes('FROM rss_feeds')) {
            return { id: 1 } as unknown as T;
          }
          if (query.includes('FROM rss_items')) {
            return { id: 10 } as unknown as T;
          }
          return null as T | null;
        },
        async run() {
          if (query.includes('INSERT INTO ai_analysis')) {
            insertedTables.push('ai_analysis');
            rowsByTable.ai_analysis.unshift({
              id: rowsByTable.ai_analysis.length + 1,
              rss_item_id: boundValues[0],
              rss_source: boundValues[1],
              headline: boundValues[2],
              cf_ai_model: boundValues[3],
              cf_ai_status: boundValues[4],
              cf_ai_summary: boundValues[5],
              main_ai_model: boundValues[6],
              main_ai_verdict: boundValues[7],
              main_ai_summary: boundValues[8],
              sentiment: boundValues[9],
              confidence: boundValues[10],
              created_at: boundValues[11],
            });
            return { success: true, meta: { last_row_id: rowsByTable.ai_analysis.length } };
          }
          if (query.includes('INSERT INTO rss_feeds')) {
            insertedTables.push('rss_feeds');
          }
          if (query.includes('INSERT INTO rss_items')) {
            insertedTables.push('rss_items');
          }
          return { success: true, meta: { last_row_id: 1 } };
        },
      };
      return stmt;
    },
  };

  return { db, insertedTables };
}

describe('Single-entry functions/api/[[path]].ts + D1 + cloudflareAiService + UI', () => {
  beforeEach(() => {
    resetRssAndAnalysisMemoryForTest();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('fetches & caches RSS for 10 minutes via single API entry and stores into rss_feeds + rss_items', async () => {
    const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0"><channel>
        <item>
          <title><![CDATA[Bitcoin surges as institutional ETF inflows hit weekly high]]></title>
          <link>https://www.coindesk.com/markets/btc-etf</link>
          <pubDate>${new Date().toUTCString()}</pubDate>
          <description><![CDATA[<p>Strong spot demand supports crypto liquidity.</p>]]></description>
        </item>
      </channel></rss>`;

    const parsed = parseRssOrAtomXml(sampleXml, {
      name: 'CoinDesk',
      url: 'https://www.coindesk.com/arc/outboundfeeds/rss/',
      category: 'CRYPTO',
    });
    expect(parsed).toHaveLength(1);
    expect(parsed[0].sentiment).toBe('BULLISH');

    expect(validateExternalFeedUrl('http://127.0.0.1:8080/rss')).toBeNull();
    expect(validateExternalFeedUrl('https://feeds.bbci.co.uk/news/business/rss.xml')).toBe(
      'https://feeds.bbci.co.uk/news/business/rss.xml'
    );

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(sampleXml, { status: 200, headers: { 'Content-Type': 'application/rss+xml' } })
    );
    vi.stubGlobal('fetch', fetchMock);

    const { db, insertedTables } = createMockD1();
    const firstRes = await onRequest({
      request: new Request('https://motorboy.pages.dev/api/rss'),
      env: { DB: db },
      waitUntil: () => {},
    });
    expect(firstRes.status).toBe(200);
    expect(firstRes.headers.get('Cache-Control')).toContain('max-age=600');
    const firstJson = await firstRes.json();
    expect(firstJson.cached).toBe(false);
    expect(firstJson.articles.length).toBeGreaterThan(0);

    await new Promise((r) => setTimeout(r, 15));
    expect(insertedTables).toContain('rss_feeds');
    expect(insertedTables).toContain('rss_items');

    const callCountAfterFirst = fetchMock.mock.calls.length;
    const secondRes = await onRequest({
      request: new Request('https://motorboy.pages.dev/api/rss'),
      env: { DB: db },
      waitUntil: () => {},
    });
    const secondJson = await secondRes.json();
    expect(secondJson.cached).toBe(true);
    expect(fetchMock.mock.calls.length).toBe(callCountAfterFirst);
  });

  it('runs Workers AI (@cf/meta/llama-3-8b-instruct) -> Main AI verification and persists to D1 ai_analysis', async () => {
    const cfAiRun = vi.fn().mockResolvedValue({
      response: 'สรุปเบื้องต้นจาก Cloudflare AI: ข่าวส่งสัญญาณบวกต่อหุ้นเทคโนโลยีและคริปโต',
    });

    const stage1 = await analyzeRssWithWorkersAi(
      { AI: { run: cfAiRun } },
      { rssSource: 'Yahoo Top Stories', headline: 'AI chip demand grows' }
    );
    expect(stage1.model).toBe(CF_LLAMA3_MODEL);
    expect(stage1.status).toBe('OK');

    const geminiFetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      sentiment: 'BULLISH',
                      confidenceScore: 91,
                      mainAiVerdict: 'เชิงบวก — ทยอยสะสมตามแนวรับสำคัญ (Verified Bullish)',
                      correctionsTh: 'ตรวจสอบแล้วสอดคล้องกับปัจจัยมหภาค',
                      mainAiSummary: 'เงินทุนสถาบันหนุนสภาพคล่องตลาดอย่างมีนัยสำคัญ',
                    }),
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', geminiFetchMock);

    const { db, insertedTables } = createMockD1();

    const postRes = await onRequest({
      request: new Request('https://motorboy.pages.dev/api/analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          article: {
            source: 'Yahoo Top Stories',
            title: 'Global AI data center investment accelerates across Asia',
            url: 'https://finance.yahoo.com',
            category: 'YAHOO_WORLD',
          },
        }),
      }),
      env: {
        DB: db,
        AI: { run: cfAiRun },
        GEMINI_API_KEY: 'AIzaTestPrimaryServerKey123456',
      },
    });

    expect(postRes.status).toBe(200);
    const body = await postRes.json();
    expect(body.analysis.cfAiStatus).toBe('OK');
    expect(body.analysis.mainAiVerdict).toContain('Verified Bullish');
    expect(body.analysis.confidenceScore).toBe(91);
    expect(insertedTables).toContain('ai_analysis');
  });

  it('calls geminiService.ts as MAIN AI verifier in runCloudflareAndMainAiDoubleCheck and survives quota failure', async () => {
    const quotaErr = Object.assign(new Error('429 Free tier daily neurons quota exceeded'), {
      status: 429,
    });
    const cfAiRun = vi.fn().mockRejectedValue(quotaErr);

    const res = await onRequest({
      request: new Request('https://motorboy.pages.dev/api/analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          article: {
            source: 'Bangkok Post Business',
            title: 'ตลาดหุ้นไทยฟื้นตัวรับแรงซื้อกลุ่มธนาคารและพลังงาน',
            category: 'MSN_MONEY',
          },
        }),
      }),
      env: { AI: { run: cfAiRun } },
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.analysis.cfAiStatus).toBe('QUOTA_EXCEEDED');
    expect(data.analysis.mainAiModel).toContain('MotorBoy Primary AI');

    // Client-side orchestrator calling `/api/analysis` + `geminiService.ts` (`POST /api/gemini/analyze-news`)
    const clientFetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/gemini/analyze-news')) {
        return new Response(
          JSON.stringify({
            newsId: '1',
            title: 'BTC breakout',
            source: 'CoinDesk',
            url: 'https://www.coindesk.com',
            sentiment: 'BULLISH',
            sentimentLabelTh: 'เชิงบวกแข็งแกร่ง (Verified by Gemini Main AI)',
            accuracyScore: 93,
            marketImpact: 'HIGH',
            affectedMarkets: ['BTC'],
            impactHorizon: 'SHORT_TERM',
            coreTakeaway: 'แรงซื้อสถาบันหนุนชัดเจน',
            marketImplication: 'สภาพคล่องไหลเข้าต่อเนื่อง',
            tradingStrategyAdvice: 'ทยอยสะสมใกล้แนวรับและตั้ง SL',
            keyMetrics: {
              macroRisk: 'LOW',
              volatilityForecast: 'EXPANDING',
              recommendedPositioning: 'ACCUMULATE',
            },
            riskFactors: ['ความผันผวนระยะสั้น'],
            timestamp: '2026-11-23T09:30:00.000Z',
          }),
          { status: 200 }
        );
      }
      return new Response(
        JSON.stringify({
          status: 'ok',
          analysis: {
            id: 7,
            rssSource: 'CoinDesk',
            headline: 'BTC breakout',
            cfAiModel: CF_LLAMA3_MODEL,
            cfAiResult: 'สรุปจาก Cloudflare AI: โมเมนตัมเป็นบวก',
            cfAiStatus: 'OK',
            mainAiModel: 'MotorBoy Primary AI',
            mainAiVerdict: 'Draft',
            mainAiSummary: 'Draft',
            sentiment: 'BULLISH',
            confidenceScore: 80,
            timestamp: '2026-11-23T09:30:00.000Z',
          },
        }),
        { status: 200 }
      );
    });
    vi.stubGlobal('fetch', clientFetchMock);

    const verified = await runCloudflareAndMainAiDoubleCheck({
      article: { title: 'BTC breakout', source: 'CoinDesk' },
      apiKey: 'AIzaUserKey1234567890',
    });
    expect(verified).not.toBeNull();
    expect(verified?.mainAiVerdict).toContain('Verified by Gemini Main AI');
    expect(verified?.confidenceScore).toBe(93);
  });

  it('renders AI Analysis skeleton first, then displays RSS Source, Cloudflare AI & Main AI Verdict', async () => {
    const sampleRecord = {
      id: 1,
      rssSource: 'CoinDesk',
      rssUrl: 'https://www.coindesk.com',
      headline: 'Bitcoin holds support ahead of macro release',
      cfAiModel: '@cf/meta/llama-3-8b-instruct',
      cfAiResult: 'สรุป Cloudflare AI: แนวรับแข็งแกร่ง ตลาดรอดูตัวเลขเศรษฐกิจ',
      cfAiStatus: 'OK',
      mainAiModel: 'MotorBoy Primary AI (gemini-3.1-flash-lite)',
      mainAiVerdict: 'ถือรอดูจังหวะใกล้แนวรับ (Verified Neutral)',
      mainAiSummary: 'ตรวจสอบซ้ำโดย Main AI: แนะนำคุมความเสี่ยงและตั้ง SL ใต้กรอบรับ',
      sentiment: 'NEUTRAL',
      confidenceScore: 84,
      timestamp: '2026-11-23T09:00:00.000Z',
    };

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ status: 'ok', items: [sampleRecord] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );

    render(<AiAnalysisPanel articles={[]} />);
    expect(screen.getByTestId('ai-analysis-skeleton')).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByTestId('cloudflare-ai-result')).toBeTruthy();
    });

    expect(screen.getByTestId('ai-analysis-rss-source').textContent).toBe('CoinDesk');
    expect(screen.getByText('[Cloudflare AI Result]')).toBeTruthy();
    expect(screen.getByText('[Final Verified by Main AI]')).toBeTruthy();
    expect(screen.getByTestId('ai-analysis-confidence').textContent).toBe('84%');
  });

  it('renders hidden <audio loop preload="auto"> at volume 0.3 for /assets/song.mp3 and plays on first click/touchstart', async () => {
    const playSpy = vi
      .spyOn(window.HTMLMediaElement.prototype, 'play')
      .mockImplementation(() => Promise.resolve());

    render(<BackgroundMusic />);
    const audio = screen.getByTestId('bg-music-audio') as HTMLAudioElement;
    expect(audio.getAttribute('src')).toBe('/assets/song.mp3');
    expect(audio.getAttribute('preload')).toBe('auto');
    expect(audio.loop).toBe(true);
    expect(audio.hidden).toBe(true);
    expect(audio.volume).toBeCloseTo(0.3, 5);
    expect(playSpy).not.toHaveBeenCalled();

    fireEvent.touchStart(document);
    await waitFor(() => {
      expect(playSpy).toHaveBeenCalledTimes(1);
    });
  });
});
