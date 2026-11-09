// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { Request, Response } from 'express';
import { createRateLimiter } from '../server/rateLimit';
import { NewsCard } from '../components/NewsCard';
import type { NewsArticle } from '../types';

/* --------------------------------------------------------------- rate limit */

function mockReq(ip = '10.0.0.1'): Request {
  return { ip, socket: { remoteAddress: ip } } as unknown as Request;
}

function mockRes() {
  const res = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: null as unknown,
    setHeader(name: string, value: string) {
      res.headers[name] = value;
    },
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
  };
  return res;
}

describe('createRateLimiter', () => {
  it('lets requests through up to the limit, then returns 429 with Retry-After', () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 3 });
    const req = mockReq();

    for (let i = 0; i < 3; i += 1) {
      const res = mockRes();
      const next = vi.fn();
      limiter(req, res as unknown as Response, next);
      expect(next).toHaveBeenCalledTimes(1);
    }

    const blocked = mockRes();
    const next = vi.fn();
    limiter(req, blocked as unknown as Response, next);

    expect(next).not.toHaveBeenCalled();
    expect(blocked.statusCode).toBe(429);
    expect(blocked.headers['Retry-After']).toBeDefined();
    expect(blocked.body).toMatchObject({ error: expect.stringContaining('Too many requests') });
  });

  it('counts each IP separately', () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 1 });
    const first = mockRes();
    limiter(mockReq('1.1.1.1'), first as unknown as Response, vi.fn());

    const secondIp = mockRes();
    const next = vi.fn();
    limiter(mockReq('2.2.2.2'), secondIp as unknown as Response, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(secondIp.statusCode).toBe(200);
  });

  it('resets the window after it expires', () => {
    vi.useFakeTimers();
    try {
      const limiter = createRateLimiter({ windowMs: 1_000, max: 1 });
      limiter(mockReq(), mockRes() as unknown as Response, vi.fn());

      const second = mockRes();
      limiter(mockReq(), second as unknown as Response, vi.fn());
      expect(second.statusCode).toBe(429);

      vi.advanceTimersByTime(1_100);

      const next = vi.fn();
      limiter(mockReq(), mockRes() as unknown as Response, next);
      expect(next).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('exposes reset/size for tests and pruning', () => {
    const limiter = createRateLimiter({ max: 5 });
    limiter(mockReq(), mockRes() as unknown as Response, vi.fn());
    expect(limiter.size()).toBe(1);
    limiter.reset();
    expect(limiter.size()).toBe(0);
  });
});

/* ------------------------------------------------------------------ NewsCard */

const articles: NewsArticle[] = [
  {
    id: 'a1',
    title: 'Fed holds rates steady',
    description: 'Central bank keeps policy unchanged',
    url: 'https://example.com/1',
    source: 'MSN Money',
    publishedAt: new Date().toISOString(),
    category: 'MSN_MONEY',
    impact: 'HIGH',
  } as unknown as NewsArticle,
];

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('NewsCard auto-analysis scheduling', () => {
  it('no longer re-renders the news list once per second', () => {
    const setIntervalSpy = vi.spyOn(window, 'setInterval');
    render(<NewsCard articles={articles} />);
    const oneSecondTimers = setIntervalSpy.mock.calls.filter(([, delay]) => delay === 1000);
    expect(oneSecondTimers).toHaveLength(0);
  });

  it('shows a clock label instead of a ticking countdown', () => {
    render(<NewsCard articles={articles} />);
    const text = document.body.textContent || '';
    expect(text).not.toMatch(/รอบถัดไป:\s*\d{2}:\d{2}\s*$/m);
    expect(text).toContain('ยังไม่เคยตรวจ');
  });

  it('survives a corrupted timestamp in localStorage', () => {
    localStorage.setItem('last_auto_analysis_time', 'not-a-number');
    expect(() => render(<NewsCard articles={articles} />)).not.toThrow();
    expect(document.body.textContent).toContain('ยังไม่เคยตรวจ');
  });

  it('renders a real clock time once a run is recorded', () => {
    const finishedAt = new Date('2026-11-04T12:34:00+07:00').getTime();
    localStorage.setItem('last_auto_analysis_time', String(finishedAt));
    render(<NewsCard articles={articles} />);
    expect(screen.getByText(/ตรวจล่าสุด/)).toBeTruthy();
  });
});
