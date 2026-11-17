import { describe, it, expect, afterEach, vi } from 'vitest';

import worker from '../cloudflare/worker';
import { handleCloudflareApiRequest } from '../cloudflare/apiHandler';
import { onRequest } from '../../functions/api/[[path]]';

describe('Cloudflare Workers & Pages Functions deployment adapter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('serves /api/health and /api/gemini/config cleanly without Node dependencies', async () => {
    const healthRes = await handleCloudflareApiRequest(
      new Request('https://motorboy.pages.dev/api/health'),
      {}
    );
    expect(healthRes.status).toBe(200);
    const health = await healthRes.json();
    expect(health).toMatchObject({ status: 'ok', runtime: 'cloudflare' });

    const cfgRes = await handleCloudflareApiRequest(
      new Request('https://motorboy.pages.dev/api/gemini/config'),
      { GEMINI_API_KEY: 'AIzaTestEdgeServerKey12345' }
    );
    expect(cfgRes.status).toBe(200);
    const cfg = await cfgRes.json();
    expect(cfg).toMatchObject({
      model: 'gemini-3.1-flash-lite',
      fallbackModels: ['gemini-4-hydrogen'],
      serverKeyConfigured: true,
      runtime: 'cloudflare',
    });
  });

  it('blocks SSRF /api/yahoo paths and proxies allowed finance paths', async () => {
    const blockedRes = await handleCloudflareApiRequest(
      new Request('https://motorboy.workers.dev/api/yahoo//evil.com/steal'),
      {}
    );
    expect(blockedRes.status).toBe(400);

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ chart: { result: [] } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const okRes = await handleCloudflareApiRequest(
      new Request('https://motorboy.workers.dev/api/yahoo/v8/finance/chart/AAPL?interval=1d&range=5d'),
      {}
    );
    expect(okRes.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('gracefully falls back to heuristic categorization when Gemini returns 503', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'Service Unavailable' } }), { status: 503 })
    );
    vi.stubGlobal('fetch', fetchMock);

    const res = await onRequest({
      request: new Request('https://motorboy.pages.dev/api/gemini/categorize-headlines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          articles: [{ id: '1', title: 'FED warns on inflation and interest rate trajectory' }],
        }),
      }),
      env: { GEMINI_API_KEY: 'AIzaTestEdgeServerKey12345' },
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.source).toBe('HEURISTIC_FALLBACK');
    expect(data.degraded).toBe(true);
    expect(data.articles[0].impact).toBe('HIGH');
  });

  it('delegates non-API requests to Cloudflare static ASSETS binding', async () => {
    const assetsFetch = vi.fn().mockResolvedValue(new Response('<html>SPA</html>', { status: 200 }));
    const res = await worker.fetch(new Request('https://motorboy.workers.dev/'), {
      ASSETS: { fetch: assetsFetch },
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('<html>SPA</html>');
    expect(assetsFetch).toHaveBeenCalledTimes(1);
  });
});
