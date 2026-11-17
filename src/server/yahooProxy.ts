/**
 * Production Yahoo Finance Reverse Proxy & Short-TTL Cache.
 *
 * In local development, Vite proxies `/api/yahoo/*` to Yahoo Finance.
 * When published/deployed (`NODE_ENV=production`), Express serves `dist/`
 * directly — without this route, stock/index/forex quotes calling `/api/yahoo`
 * would receive 404 Not Found.
 */

import type { Request, Response } from 'express';

const YAHOO_HOSTS = [
  'https://query1.finance.yahoo.com',
  'https://query2.finance.yahoo.com',
] as const;

const CACHE_TTL_MS = 30_000;
const MAX_CACHE_ENTRIES = 200;
const UPSTREAM_TIMEOUT_MS = 7_000;

interface CachedYahooEntry {
  expiresAt: number;
  status: number;
  contentType: string;
  body: string;
}

const yahooResponseCache = new Map<string, CachedYahooEntry>();

/**
 * Only permit read-only market quote/chart and search paths so `/api/yahoo/*`
 * cannot be abused as an open SSRF relay.
 */
export function sanitizeYahooProxyPath(rawRelativePath: string): string | null {
  if (!rawRelativePath || typeof rawRelativePath !== 'string') return null;

  // Express `/api/yahoo` mount strips the mount prefix, so req.url starts with `/`
  const trimmed = rawRelativePath.trim();
  if (!trimmed.startsWith('/')) return null;

  // Block protocol-relative or encoded traversal attempts
  if (trimmed.startsWith('//') || trimmed.includes('..') || trimmed.includes('@')) {
    return null;
  }

  const pathname = trimmed.split('?')[0];
  const allowed =
    /^\/v8\/finance\/chart\/[A-Za-z0-9._^=%-]+$/.test(pathname) ||
    pathname === '/v1/finance/search';

  return allowed ? trimmed : null;
}

function pruneCacheIfNeeded() {
  const now = Date.now();
  for (const [key, entry] of yahooResponseCache.entries()) {
    if (entry.expiresAt <= now) {
      yahooResponseCache.delete(key);
    }
  }
  while (yahooResponseCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = yahooResponseCache.keys().next().value;
    if (!oldestKey) break;
    yahooResponseCache.delete(oldestKey);
  }
}

export function clearYahooProxyCache(): void {
  yahooResponseCache.clear();
}

export async function handleYahooProxyRequest(req: Request, res: Response): Promise<Response> {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const safePath = sanitizeYahooProxyPath(req.url);
  if (!safePath) {
    return res.status(400).json({ error: 'invalid_yahoo_path' });
  }

  const now = Date.now();
  const cached = yahooResponseCache.get(safePath);
  if (cached && cached.expiresAt > now) {
    res.setHeader('Content-Type', cached.contentType);
    res.setHeader('X-Cache', 'HIT');
    return res.status(cached.status).send(cached.body);
  }

  let lastStatus = 502;
  for (const host of YAHOO_HOSTS) {
    try {
      const upstream = await fetch(`${host}${safePath}`, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          Accept: 'application/json, text/plain, */*',
        },
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      });

      lastStatus = upstream.status;
      if (!upstream.ok) continue;

      const body = await upstream.text();
      const contentType = upstream.headers.get('content-type') || 'application/json; charset=utf-8';

      pruneCacheIfNeeded();
      yahooResponseCache.set(safePath, {
        expiresAt: Date.now() + CACHE_TTL_MS,
        status: upstream.status,
        contentType,
        body,
      });

      res.setHeader('Content-Type', contentType);
      res.setHeader('X-Cache', 'MISS');
      return res.status(upstream.status).send(body);
    } catch {
      // Fail over to secondary Yahoo host
    }
  }

  return res.status(lastStatus >= 500 ? lastStatus : 502).json({
    error: 'yahoo_upstream_unavailable',
    message: 'ไม่สามารถดึงข้อมูลราคาจาก Yahoo Finance ได้ในขณะนี้',
  });
}
