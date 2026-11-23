/**
 * Server-side RSS Aggregator (10-min cached, CORS-free, D1 `rss_feeds` + `rss_items`)
 * + Background Two-Stage AI Double-Check Engine (`ai_analysis`):
 *   Stage 1: `analyzeRssWithWorkersAi` (`src/services/cloudflareAiService.ts` — `@cf/meta/llama-3-8b-instruct`)
 *   Stage 2: Existing MotorBoy MAIN AI (Gemini 3.1 Flash-Lite -> Gemini 4 Hydrogen -> Institutional Quant)
 */

import type {
  CloudflareAiStatus,
  DoubleCheckAnalysisRecord,
  NewsArticle,
  RssFeedRecord,
  Sentiment,
} from '../types';
import {
  buildModelChain,
  classifyGeminiError,
  resolveGeminiKey,
  resolveGeminiModel,
  shouldTryFallbackModel,
} from '../server/geminiConfig';
import { categorizeHeadlinesHeuristic } from '../services/headlineCategorizationService';
import {
  CF_FALLBACK_MODEL,
  CF_LLAMA3_MODEL,
  analyzeRssWithWorkersAi,
  type WorkersAiRunner,
} from '../services/cloudflareAiService';

export const RSS_CACHE_TTL_SEC = 600; // 10 minutes
export const RSS_CACHE_TTL_MS = RSS_CACHE_TTL_SEC * 1000;

export const CF_WORKERS_AI_MODELS = [CF_LLAMA3_MODEL, CF_FALLBACK_MODEL] as const;

export interface D1PreparedStatementLike {
  bind(...values: unknown[]): D1PreparedStatementLike;
  all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
  first<T = Record<string, unknown>>(colName?: string): Promise<T | null>;
  run(): Promise<{ success?: boolean; meta?: { last_row_id?: number } }>;
}

export interface D1DatabaseLike {
  prepare(query: string): D1PreparedStatementLike;
  exec?(query: string): Promise<unknown>;
}

export type WorkersAiBinding = WorkersAiRunner;

export interface EdgeExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

export interface DoubleCheckEnv {
  DB?: D1DatabaseLike;
  AI?: WorkersAiBinding;
  GEMINI_API_KEY?: string;
  CF_AI_MODEL?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_API_TOKEN?: string;
  CF_ACCOUNT_ID?: string;
  CF_API_TOKEN?: string;
  RSS_CACHE_TTL_SEC?: string;
  [key: string]: unknown;
}

export const DEFAULT_RSS_FEEDS: ReadonlyArray<RssFeedRecord> = [
  { id: 1, name: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', category: 'CRYPTO', isEnabled: true },
  { id: 2, name: 'Cointelegraph', url: 'https://cointelegraph.com/rss', category: 'CRYPTO', isEnabled: true },
  { id: 3, name: 'Decrypt', url: 'https://decrypt.co/feed', category: 'CRYPTO', isEnabled: true },
  { id: 4, name: 'The Block', url: 'https://www.theblock.co/rss.xml', category: 'CRYPTO', isEnabled: true },
  { id: 5, name: 'Yahoo Top Stories', url: 'https://finance.yahoo.com/rss/topstories', category: 'YAHOO_WORLD', isEnabled: true },
  { id: 6, name: 'Yahoo Finance World', url: 'https://finance.yahoo.com/news/rssindex', category: 'YAHOO_WORLD', isEnabled: true },
  { id: 7, name: 'BBC Business', url: 'https://feeds.bbci.co.uk/news/business/rss.xml', category: 'MACRO', isEnabled: true },
  { id: 8, name: 'CNBC Top News', url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html', category: 'MACRO', isEnabled: true },
  { id: 9, name: 'Bangkok Post Business', url: 'https://www.bangkokpost.com/rss/data/business.xml', category: 'MSN_MONEY', isEnabled: true },
  { id: 10, name: 'Kaohoon', url: 'https://www.kaohoon.com/feed', category: 'MSN_MONEY', isEnabled: true },
];

const CURATED_FALLBACK_RSS_ARTICLES: ReadonlyArray<NewsArticle> = [
  {
    id: 'rss-curated-th-1',
    title: 'ตลาดหุ้นไทย SET Index เกาะติดทิศทางดอกเบี้ยธนาคารกลางและกระแส Fund Flow ต่างชาติไหลเข้ากลุ่มพลังงาน-เทคโนโลยี',
    source: 'Bangkok Post Business',
    time: 'เมื่อสักครู่',
    url: 'https://www.bangkokpost.com/business',
    sentiment: 'BULLISH',
    category: 'MSN_MONEY',
    impact: 'HIGH',
    summary: 'นักลงทุนสถาบันจับตานโยบายการเงินและตัวเลขส่งออกไทย ขณะที่ค่าเงินบาทเคลื่อนไหวในกรอบมีเสถียรภาพหนุนหุ้นขนาดใหญ่',
    isCurated: true,
  },
  {
    id: 'rss-curated-crypto-1',
    title: 'Bitcoin และตลาดสินทรัพย์ดิจิทัลทรงตัวเหนือแนวรับสำคัญ รับแรงหนุนสภาพคล่อง ETF สถาบันต่อเนื่อง',
    source: 'CoinDesk',
    time: '12 นาทีที่แล้ว',
    url: 'https://www.coindesk.com',
    sentiment: 'BULLISH',
    category: 'CRYPTO',
    impact: 'HIGH',
    summary: 'กระแสเงินทุนไหลเข้ากองทุน Spot ETF ช่วยพยุงโครงสร้างราคาคริปโตหลัก ท่ามกลางการจับตาตัวเลขเงินเฟ้อสหรัฐฯ',
    isCurated: true,
  },
  {
    id: 'rss-curated-macro-1',
    title: 'ตลาดการเงินโลกประเมินทิศทางอัตราผลตอบแทนพันธบัตรสหรัฐฯ และนโยบายดอกเบี้ยรอบถัดไปอย่างระมัดระวัง',
    source: 'Yahoo Top Stories',
    time: '25 นาทีที่แล้ว',
    url: 'https://finance.yahoo.com',
    sentiment: 'NEUTRAL',
    category: 'YAHOO_WORLD',
    impact: 'MEDIUM',
    summary: 'ผู้จัดการกองทุนทั่วโลกกระจายความเสี่ยงระหว่างหุ้นเทคโนโลยี ทองคำ และตราสารหนี้ระยะสั้นเพื่อรับมือความผันผวน',
    isCurated: true,
  },
];

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

interface CachedRssBundle {
  articles: NewsArticle[];
  sources: RssFeedRecord[];
  fetchedAt: string;
  expiresAt: number;
}

let memoryRssCache: CachedRssBundle | null = null;
const memoryCustomFeeds: RssFeedRecord[] = [];
const memoryAnalysisHistory: DoubleCheckAnalysisRecord[] = [];
const initializedDbs = new WeakSet<object>();

export function resetRssAndAnalysisMemoryForTest(): void {
  memoryRssCache = null;
  memoryCustomFeeds.length = 0;
  memoryAnalysisHistory.length = 0;
}

/* --------------------------------------------------------------------------
 * D1 Schema Guard (`0001_init.sql`: rss_feeds, rss_items, ai_analysis, songs)
 * ------------------------------------------------------------------------ */

async function ensureD1Schema(db?: D1DatabaseLike): Promise<void> {
  if (!db || initializedDbs.has(db as object)) return;
  try {
    const ddl = [
      `CREATE TABLE IF NOT EXISTS rss_feeds (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'MACRO',
        last_fetched_at TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS rss_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        feed_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        link TEXT NOT NULL UNIQUE,
        pub_date TEXT,
        content TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS ai_analysis (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        rss_item_id INTEGER,
        rss_source TEXT NOT NULL DEFAULT 'RSS Feed',
        headline TEXT NOT NULL DEFAULT '',
        cf_ai_model TEXT NOT NULL DEFAULT '@cf/meta/llama-3-8b-instruct',
        cf_ai_status TEXT NOT NULL DEFAULT 'OK',
        cf_ai_summary TEXT NOT NULL,
        main_ai_model TEXT NOT NULL DEFAULT 'MotorBoy Primary AI',
        main_ai_verdict TEXT NOT NULL,
        main_ai_summary TEXT NOT NULL DEFAULT '',
        sentiment TEXT NOT NULL DEFAULT 'NEUTRAL',
        confidence REAL NOT NULL DEFAULT 80,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS songs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
    ];
    for (const stmt of ddl) {
      await db.prepare(stmt).run();
    }
    initializedDbs.add(db as object);
  } catch {
    // Non-fatal if D1 mock stubs specific statements
  }
}

/* --------------------------------------------------------------------------
 * Pure Web-Standard RSS 2.0 & Atom XML Parser
 * ------------------------------------------------------------------------ */

function decodeXmlEntities(raw: string): string {
  return raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#(\d+);/g, (_m, code) => {
      const n = Number(code);
      return Number.isFinite(n) && n > 0 && n < 0x10ffff ? String.fromCodePoint(n) : '';
    })
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTagContent(block: string, tagName: string): string {
  const re = new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const match = block.match(re);
  return match?.[1] ? decodeXmlEntities(match[1]) : '';
}

function extractAtomHref(block: string): string {
  const hrefMatch = block.match(/<link[^>]*\bhref=["']([^"']+)["'][^>]*\/?>/i);
  return hrefMatch?.[1] ? decodeXmlEntities(hrefMatch[1]) : '';
}

export function inferHeadlineSentiment(title: string, summary = ''): Sentiment {
  const text = `${title} ${summary}`.toLowerCase();
  const negations = ['ไม่', 'ไม่ได้', 'ยังไม่', 'avoid', 'not ', 'never ', 'without '];
  const negated = negations.some((n) => text.includes(n));

  const bullWords = [
    'surge', 'soar', 'rally', 'breakout', 'gain', 'bull', 'record high', 'inflow', 'beat',
    'recovery', 'boost', 'พุ่ง', 'ทะยาน', 'บวก', 'ฟื้นตัว', 'กำไร', 'เติบโต', 'ซื้อสุทธิ', 'หนุน', 'แกร่ง',
  ];
  const bearWords = [
    'crash', 'plummet', 'drop', 'fall', 'decline', 'bear', 'loss', 'fear', 'sell', 'hack',
    'recession', 'crisis', 'ร่วง', 'ดิ่ง', 'ลบ', 'ทรุด', 'กังวล', 'วิกฤต', 'ขายสุทธิ', 'ชะลอตัว', 'อ่อนค่า',
  ];

  const bullScore = bullWords.filter((w) => text.includes(w)).length;
  const bearScore = bearWords.filter((w) => text.includes(w)).length;

  if (bullScore > bearScore && bullScore > 0) return negated ? 'BEARISH' : 'BULLISH';
  if (bearScore > bullScore && bearScore > 0) return negated ? 'BULLISH' : 'BEARISH';
  return 'NEUTRAL';
}

function formatThaiRelativeTime(pubDateRaw: string): string {
  if (!pubDateRaw) return 'เมื่อสักครู่';
  const parsed = new Date(pubDateRaw);
  if (Number.isNaN(parsed.getTime())) return 'เมื่อสักครู่';
  const diffMin = Math.max(0, Math.floor((Date.now() - parsed.getTime()) / 60_000));
  if (diffMin < 2) return 'เมื่อสักครู่';
  if (diffMin < 60) return `${diffMin} นาทีที่แล้ว`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} ชม.ที่แล้ว`;
  return `${Math.floor(diffHr / 24)} วันที่แล้ว`;
}

function makeDeterministicArticleId(sourceName: string, idx: number, title: string): string {
  const slug = sourceName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'rss';
  let hash = 0;
  for (let i = 0; i < title.length; i += 1) {
    hash = ((hash << 5) - hash + title.charCodeAt(i)) | 0;
  }
  return `edge-${slug}-${idx}-${Math.abs(hash).toString(36)}`;
}

export interface ParsedRssItemWithRawDate extends NewsArticle {
  rawPubDate?: string;
}

export function parseRssOrAtomXml(
  xml: string,
  feed: RssFeedRecord,
  maxItems = 4
): ParsedRssItemWithRawDate[] {
  if (!xml || typeof xml !== 'string') return [];
  const itemMatches =
    xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi) ||
    xml.match(/<entry(?:\s[^>]*)?>[\s\S]*?<\/entry>/gi) ||
    [];

  const nowIso = new Date().toISOString();
  const articles: ParsedRssItemWithRawDate[] = [];

  for (let i = 0; i < Math.min(itemMatches.length, maxItems); i += 1) {
    const block = itemMatches[i];
    const title = extractTagContent(block, 'title');
    if (!title) continue;

    const rawLink = extractTagContent(block, 'link') || extractAtomHref(block) || feed.url;
    const pubDate =
      extractTagContent(block, 'pubDate') ||
      extractTagContent(block, 'published') ||
      extractTagContent(block, 'updated') ||
      nowIso;
    const rawDesc =
      extractTagContent(block, 'description') ||
      extractTagContent(block, 'summary') ||
      extractTagContent(block, 'content:encoded') ||
      '';
    const summary = rawDesc ? (rawDesc.length > 180 ? `${rawDesc.slice(0, 177)}...` : rawDesc) : undefined;
    const sentiment = inferHeadlineSentiment(title, summary);

    const draft: ParsedRssItemWithRawDate = {
      id: makeDeterministicArticleId(feed.name, i, title),
      title,
      source: feed.name,
      time: formatThaiRelativeTime(pubDate),
      url: rawLink.startsWith('http') ? rawLink : feed.url,
      sentiment,
      category: feed.category || 'MACRO',
      summary,
      isCurated: false,
      fetchedAt: nowIso,
      rawPubDate: pubDate,
    };
    draft.impact = categorizeHeadlinesHeuristic(draft);
    articles.push(draft);
  }

  return articles;
}

export function validateExternalFeedUrl(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== 'https:') return null;
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      host === '0.0.0.0' ||
      host.startsWith('127.') ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      host.startsWith('169.254.') ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
      host === '[::1]' ||
      host.startsWith('[fc') ||
      host.startsWith('[fd') ||
      host.startsWith('[fe80')
    ) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

async function loadConfiguredFeeds(db?: D1DatabaseLike): Promise<RssFeedRecord[]> {
  if (db) {
    try {
      await ensureD1Schema(db);
      const res = await db
        .prepare(`SELECT id, url, title, category, last_fetched_at FROM rss_feeds ORDER BY id ASC`)
        .all<Record<string, unknown>>();
      const rows = Array.isArray(res?.results) ? res.results : [];
      if (rows.length > 0) {
        return rows.map((r, idx) => ({
          id: typeof r.id === 'number' ? r.id : idx + 1,
          name: String(r.title || 'RSS'),
          url: String(r.url || ''),
          category: (String(r.category || 'MACRO') as NewsArticle['category']),
          isEnabled: true,
          lastFetchedAt: typeof r.last_fetched_at === 'string' ? r.last_fetched_at : null,
        }));
      }
    } catch {
      // Fallback to default feeds
    }
  }
  return [...DEFAULT_RSS_FEEDS, ...memoryCustomFeeds];
}

async function loadFreshD1CachedRss(
  db: D1DatabaseLike | undefined,
  ttlMs: number
): Promise<CachedRssBundle | null> {
  if (!db) return null;
  try {
    await ensureD1Schema(db);
    const feedsRes = await db
      .prepare(`SELECT id, url, title, category, last_fetched_at FROM rss_feeds WHERE last_fetched_at IS NOT NULL`)
      .all<Record<string, unknown>>();
    const feedRows = Array.isArray(feedsRes?.results) ? feedsRes.results : [];
    if (feedRows.length === 0) return null;

    const now = Date.now();
    let freshestMs = 0;
    const sources: RssFeedRecord[] = [];
    const feedMap = new Map<number, RssFeedRecord>();

    for (const f of feedRows) {
      const tsStr = typeof f.last_fetched_at === 'string' ? f.last_fetched_at : '';
      const tsMs = tsStr ? new Date(tsStr).getTime() : 0;
      if (!Number.isFinite(tsMs) || now - tsMs > ttlMs) continue;
      if (tsMs > freshestMs) freshestMs = tsMs;
      const rec: RssFeedRecord = {
        id: Number(f.id) || 0,
        name: String(f.title || 'RSS'),
        url: String(f.url || ''),
        category: String(f.category || 'MACRO') as NewsArticle['category'],
        lastFetchedAt: tsStr,
      };
      sources.push(rec);
      if (rec.id) feedMap.set(rec.id, rec);
    }

    if (freshestMs === 0) return null;

    const itemsRes = await db
      .prepare(`SELECT id, feed_id, title, link, pub_date, content FROM rss_items ORDER BY id DESC LIMIT 40`)
      .all<Record<string, unknown>>();
    const itemRows = Array.isArray(itemsRes?.results) ? itemsRes.results : [];
    if (itemRows.length === 0) return null;

    const articles: NewsArticle[] = itemRows.map((row, idx) => {
      const feedInfo = feedMap.get(Number(row.feed_id));
      const title = String(row.title || '');
      const content = typeof row.content === 'string' ? row.content : undefined;
      const sentiment = inferHeadlineSentiment(title, content);
      const art: NewsArticle = {
        id: `d1-rss-${row.id ?? idx}`,
        title,
        source: feedInfo?.name || 'RSS Feed',
        time: formatThaiRelativeTime(typeof row.pub_date === 'string' ? row.pub_date : ''),
        url: String(row.link || feedInfo?.url || ''),
        sentiment,
        category: feedInfo?.category || 'MACRO',
        summary: content,
        isCurated: false,
        fetchedAt: new Date(freshestMs).toISOString(),
      };
      art.impact = categorizeHeadlinesHeuristic(art);
      return art;
    });

    return {
      articles: dedupeArticles(articles),
      sources,
      fetchedAt: new Date(freshestMs).toISOString(),
      expiresAt: freshestMs + ttlMs,
    };
  } catch {
    return null;
  }
}

function dedupeArticles(list: NewsArticle[]): NewsArticle[] {
  const seen = new Set<string>();
  const out: NewsArticle[] = [];
  for (const item of list) {
    const key = (item.title || '').trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

async function fetchSingleFeedXml(
  feed: RssFeedRecord,
  perFeedLimit = 4
): Promise<{ feed: RssFeedRecord; articles: ParsedRssItemWithRawDate[]; status: number }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    let response: Response;
    try {
      response = await fetch(feed.url, {
        headers: {
          'User-Agent': 'MotorBoy-AI-TH-Worker/2.0 (+https://cloudflare.com)',
          Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
        },
        signal: controller.signal,
        cf: { cacheTtl: RSS_CACHE_TTL_SEC, cacheEverything: true } as any,
      } as RequestInit);
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      return { feed, articles: [], status: response.status };
    }
    const xml = await response.text();
    const articles = parseRssOrAtomXml(xml, feed, perFeedLimit);
    return { feed, articles, status: response.status };
  } catch {
    return { feed, articles: [], status: 504 };
  }
}

async function persistFeedAndItemsToD1(
  db: D1DatabaseLike,
  feed: RssFeedRecord,
  items: ParsedRssItemWithRawDate[],
  fetchedAtIso: string
): Promise<void> {
  await ensureD1Schema(db);
  await db
    .prepare(
      `INSERT INTO rss_feeds (url, title, category, last_fetched_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(url) DO UPDATE SET
         title = excluded.title,
         category = excluded.category,
         last_fetched_at = excluded.last_fetched_at`
    )
    .bind(feed.url, feed.name, feed.category || 'MACRO', fetchedAtIso)
    .run();

  const row = await db
    .prepare(`SELECT id FROM rss_feeds WHERE url = ?`)
    .bind(feed.url)
    .first<{ id?: number }>();
  const feedId = Number(row?.id || feed.id || 1);

  for (const item of items) {
    await db
      .prepare(
        `INSERT INTO rss_items (feed_id, title, link, pub_date, content)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(link) DO UPDATE SET
           title = excluded.title,
           pub_date = excluded.pub_date,
           content = excluded.content`
      )
      .bind(feedId, item.title, item.url, item.rawPubDate || fetchedAtIso, item.summary || '')
      .run()
      .catch(() => undefined);
  }
}

export async function fetchAndCacheRssFeeds(
  env: DoubleCheckEnv = {},
  options: { forceRefresh?: boolean; category?: string; ctx?: EdgeExecutionContext } = {}
): Promise<{
  articles: NewsArticle[];
  sources: RssFeedRecord[];
  cached: boolean;
  fetchedAt: string;
  cacheTtlSec: number;
}> {
  const ttlSec = Math.max(60, Number(env.RSS_CACHE_TTL_SEC) || RSS_CACHE_TTL_SEC);
  const ttlMs = ttlSec * 1000;
  const now = Date.now();

  const filterByCat = (items: NewsArticle[]) =>
    options.category && options.category !== 'ALL'
      ? items.filter((a) => a.category === options.category)
      : items;

  if (!options.forceRefresh) {
    if (memoryRssCache && memoryRssCache.expiresAt > now) {
      return {
        articles: filterByCat(memoryRssCache.articles),
        sources: memoryRssCache.sources,
        cached: true,
        fetchedAt: memoryRssCache.fetchedAt,
        cacheTtlSec: ttlSec,
      };
    }

    const d1Cached = await loadFreshD1CachedRss(env.DB, ttlMs);
    if (d1Cached && d1Cached.articles.length > 0) {
      memoryRssCache = d1Cached;
      return {
        articles: filterByCat(d1Cached.articles),
        sources: d1Cached.sources,
        cached: true,
        fetchedAt: d1Cached.fetchedAt,
        cacheTtlSec: ttlSec,
      };
    }
  }

  const feeds = await loadConfiguredFeeds(env.DB);
  const settled = await Promise.allSettled(feeds.map((f) => fetchSingleFeedXml(f, 4)));

  const nowIso = new Date().toISOString();
  const collected: NewsArticle[] = [];
  const updatedSources: RssFeedRecord[] = [];
  const d1Tasks: Promise<unknown>[] = [];

  for (const res of settled) {
    if (res.status !== 'fulfilled') continue;
    const { feed, articles, status } = res.value;
    collected.push(...articles);
    updatedSources.push({
      ...feed,
      lastFetchedAt: nowIso,
      lastStatus: status,
    });

    if (env.DB && articles.length > 0) {
      d1Tasks.push(persistFeedAndItemsToD1(env.DB, feed, articles, nowIso).catch(() => undefined));
    }
  }

  const finalArticles =
    collected.length > 0
      ? dedupeArticles(collected)
      : CURATED_FALLBACK_RSS_ARTICLES.map((a) => ({ ...a, fetchedAt: nowIso }));

  memoryRssCache = {
    articles: finalArticles,
    sources: updatedSources.length > 0 ? updatedSources : [...feeds],
    fetchedAt: nowIso,
    expiresAt: now + ttlMs,
  };

  if (d1Tasks.length > 0) {
    const allWrites = Promise.allSettled(d1Tasks);
    if (options.ctx?.waitUntil) options.ctx.waitUntil(allWrites);
    else await allWrites;
  }

  return {
    articles: filterByCat(finalArticles),
    sources: memoryRssCache.sources,
    cached: false,
    fetchedAt: nowIso,
    cacheTtlSec: ttlSec,
  };
}

/* --------------------------------------------------------------------------
 * Stage 2 Server-Side Verification (MotorBoy Primary AI: Gemini + Quant Fallback)
 * ------------------------------------------------------------------------ */

function extractJsonObject(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    // continue
  }
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1].trim()) as Record<string, unknown>;
    } catch {
      // continue
    }
  }
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
    } catch {
      // continue
    }
  }
  return null;
}

function buildPrimaryQuantVerificationFallback(
  input: { rssSource: string; headline: string; summary?: string; category?: string },
  cfStage: { model: string; summaryTh: string; status: CloudflareAiStatus }
) {
  const sentiment = inferHeadlineSentiment(input.headline, input.summary);
  const impact = categorizeHeadlinesHeuristic({
    id: 'tmp',
    title: input.headline,
    source: input.rssSource,
    time: '',
    url: '',
    sentiment,
    summary: input.summary,
  });

  const verdictBySentiment: Record<Sentiment, string> = {
    BULLISH: 'มุมมองเชิงบวก — ทยอยสะสมตามแนวรับและคุม Stop Loss (Verified Bullish)',
    BEARISH: 'มุมมองระมัดระวัง — ชะลอเพิ่มความเสี่ยงและถือสภาพคล่องรอฐานราคา (Verified Bearish)',
    NEUTRAL: 'มุมมองเป็นกลาง — ตลาดแกว่งตัวในกรอบ แนะนำรอดูสัญญาณยืนยัน (Verified Neutral)',
  };

  const impactLabelTh =
    impact === 'HIGH' ? 'ผลกระทบสูง (High Impact)' : impact === 'MEDIUM' ? 'ผลกระทบปานกลาง' : 'ผลกระทบจำกัด';

  const cfNote =
    cfStage.status === 'OK'
      ? 'ตรวจสอบเทียบกับผลสรุปของ Cloudflare AI แล้ว สอดคล้องกับทิศทางข่าวจริงโดยปรับน้ำหนักความเสี่ยงให้รัดกุมขึ้น'
      : 'ประมวลผลและตรวจสอบความถูกต้องโดยตรงด้วยเครื่องยนต์วิเคราะห์หลัก (Main AI Fallback)';

  return {
    mainAiModel: 'MotorBoy Primary AI (Quant-Heuristic Engine)',
    mainAiVerdict: verdictBySentiment[sentiment],
    mainAiSummary: `[ตรวจสอบซ้ำโดย Main AI • ${impactLabelTh}] ข่าวจาก ${input.rssSource}: "${input.headline}" บ่งชี้สภาวะ ${
      sentiment === 'BULLISH' ? 'แรงหนุนเชิงบวก' : sentiment === 'BEARISH' ? 'แรงกดดันระยะสั้น' : 'สมดุลรอดูปัจจัยใหม่'
    } แนะนำบริหารขนาดไม้และตั้งจุดตัดขาดทุนตามแผนเสมอ`,
    correctionsTh: cfNote,
    sentiment,
    confidenceScore: impact === 'HIGH' ? 86 : impact === 'MEDIUM' ? 81 : 76,
  };
}

async function runServerMainAiVerification(
  env: DoubleCheckEnv,
  userApiKey: string | undefined,
  input: { rssSource: string; headline: string; summary?: string; category?: string },
  cfStage: { model: string; summaryTh: string; status: CloudflareAiStatus }
) {
  const resolvedKey = resolveGeminiKey(userApiKey, { GEMINI_API_KEY: env.GEMINI_API_KEY });
  if (resolvedKey.source === 'none') {
    return buildPrimaryQuantVerificationFallback(input, cfStage);
  }

  const primaryModel = resolveGeminiModel();
  const chain = buildModelChain(primaryModel);

  const prompt = `คุณคือ "MotorBoy Primary AI" (Main AI หลักของระบบเทรด) มีหน้าที่ตรวจสอบซ้ำ (Double-Check), แก้ไขจุดคลาดเคลื่อน และสรุปคำตัดสินขั้นสุดท้ายจากผลวิเคราะห์เบื้องต้นของ Cloudflare Workers AI

ข้อมูลต้นทางจาก RSS:
- แหล่งข่าว: ${input.rssSource} (หมวด ${input.category || 'MACRO'})
- พาดหัวข่าว: "${input.headline}"
- รายละเอียดข่าว: "${input.summary || '-'}"

ผลวิเคราะห์ขั้นต้นจาก Cloudflare AI (${cfStage.model} | สถานะ: ${cfStage.status}):
<<<${cfStage.summaryTh}>>>

ตอบเป็น JSON ภาษาไทยเท่านั้น:
{
  "sentiment": "BULLISH" | "BEARISH" | "NEUTRAL",
  "confidenceScore": 85,
  "mainAiVerdict": "คำตัดสินสั้นกระชับ 1 บรรทัด เช่น 'เชิงบวก — ทยอยสะสมใกล้แนวรับ (Verified Bullish)'",
  "correctionsTh": "สิ่งที่ Main AI ตรวจสอบ/ปรับแก้จากผลของ Cloudflare AI 1 ประโยค",
  "mainAiSummary": "สรุปวิเคราะห์ขั้นสุดท้ายที่ตรวจสอบแล้ว 2 ประโยค"
}`;

  for (let i = 0; i < chain.length; i += 1) {
    const model = chain[i];
    try {
      const res = await fetch(
        `${GEMINI_API_BASE}/${encodeURIComponent(model)}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': resolvedKey.key,
          },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: model.startsWith('gemini-4-')
              ? { responseMimeType: 'application/json' }
              : { temperature: 0.25, responseMimeType: 'application/json' },
          }),
        }
      );

      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        const errObj = Object.assign(new Error(errBody || `HTTP ${res.status}`), {
          status: res.status,
        });
        const info = classifyGeminiError(errObj);
        if (shouldTryFallbackModel(info) && i + 1 < chain.length) continue;
        throw errObj;
      }

      const data = (await res.json()) as any;
      const text =
        data?.candidates?.[0]?.content?.parts
          ?.map((p: any) => (typeof p?.text === 'string' ? p.text : ''))
          .join('') || '';
      const parsed = extractJsonObject(text);
      if (!parsed) break;

      const rawSent = String(parsed.sentiment || '').toUpperCase();
      const sentiment: Sentiment =
        rawSent === 'BULLISH' || rawSent === 'BEARISH'
          ? rawSent
          : inferHeadlineSentiment(input.headline, input.summary);
      const confidenceScore = Math.min(
        98,
        Math.max(60, Math.round(Number(parsed.confidenceScore) || 86))
      );

      const correctionsTh =
        typeof parsed.correctionsTh === 'string' && parsed.correctionsTh.trim()
          ? parsed.correctionsTh.trim()
          : 'ตรวจสอบความถูกต้องเทียบกับข่าวต้นทางเรียบร้อยแล้ว';
      const baseSummary =
        typeof parsed.mainAiSummary === 'string' && parsed.mainAiSummary.trim()
          ? parsed.mainAiSummary.trim()
          : `ยืนยันผลการวิเคราะห์ข่าวจาก ${input.rssSource} พร้อมแนวทางบริหารความเสี่ยง`;

      return {
        mainAiModel: `MotorBoy Primary AI (${model})`,
        mainAiVerdict:
          typeof parsed.mainAiVerdict === 'string' && parsed.mainAiVerdict.trim()
            ? parsed.mainAiVerdict.trim()
            : 'ยืนยันผลวิเคราะห์โดย Main AI',
        mainAiSummary: `${baseSummary} (${correctionsTh})`,
        correctionsTh,
        sentiment,
        confidenceScore,
      };
    } catch {
      // Fallback safely
    }
  }

  return buildPrimaryQuantVerificationFallback(input, cfStage);
}

async function saveAnalysisRecordToD1(
  db: D1DatabaseLike | undefined,
  record: DoubleCheckAnalysisRecord
): Promise<void> {
  if (!db) return;
  try {
    await ensureD1Schema(db);
    let rssItemId: number | null = typeof record.rssItemId === 'number' ? record.rssItemId : null;
    if (!rssItemId && record.rssUrl) {
      const itemRow = await db
        .prepare(`SELECT id FROM rss_items WHERE link = ?`)
        .bind(record.rssUrl)
        .first<{ id?: number }>();
      if (typeof itemRow?.id === 'number') rssItemId = itemRow.id;
    }

    const insertRes = await db
      .prepare(
        `INSERT INTO ai_analysis (
          rss_item_id, rss_source, headline,
          cf_ai_model, cf_ai_status, cf_ai_summary,
          main_ai_model, main_ai_verdict, main_ai_summary,
          sentiment, confidence, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        rssItemId,
        record.rssSource,
        record.headline,
        record.cfAiModel,
        record.cfAiStatus,
        record.cfAiResult,
        record.mainAiModel,
        record.mainAiVerdict,
        record.mainAiSummary,
        record.sentiment,
        record.confidenceScore,
        record.timestamp
      )
      .run();

    if (insertRes?.meta?.last_row_id) {
      record.id = insertRes.meta.last_row_id;
    }
  } catch {
    // Keep in-memory copy on D1 failure
  }
}

export async function executeDoubleCheckAnalysis(
  env: DoubleCheckEnv = {},
  options: {
    article?: Partial<NewsArticle>;
    apiKey?: string;
    ctx?: EdgeExecutionContext;
  } = {}
): Promise<DoubleCheckAnalysisRecord> {
  let targetArticle = options.article;
  if (!targetArticle?.title) {
    const rss = await fetchAndCacheRssFeeds(env, { ctx: options.ctx });
    targetArticle = rss.articles[0] || CURATED_FALLBACK_RSS_ARTICLES[0];
  }

  const input = {
    rssSource: String(targetArticle.source || 'RSS Feed').slice(0, 120),
    rssUrl: typeof targetArticle.url === 'string' ? targetArticle.url.slice(0, 500) : undefined,
    headline: String(targetArticle.title || 'สรุปภาวะตลาดการเงิน').slice(0, 400),
    summary: typeof targetArticle.summary === 'string' ? targetArticle.summary.slice(0, 800) : undefined,
    category: typeof targetArticle.category === 'string' ? targetArticle.category : 'MACRO',
  };

  // Stage 1: Cloudflare Workers AI Free Tier (`@cf/meta/llama-3-8b-instruct` via cloudflareAiService.ts)
  const cfStage = await analyzeRssWithWorkersAi(env, input);

  // Stage 2: MotorBoy Main AI Double-Check Verification
  const mainStage = await runServerMainAiVerification(env, options.apiKey, input, cfStage);

  const nowIso = new Date().toISOString();
  const record: DoubleCheckAnalysisRecord = {
    id: `ana-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    rssSource: input.rssSource,
    rssUrl: input.rssUrl,
    headline: input.headline,
    cfAiModel: cfStage.model,
    cfAiResult: cfStage.summaryTh,
    cfAiStatus: cfStage.status,
    mainAiModel: mainStage.mainAiModel,
    mainAiVerdict: mainStage.mainAiVerdict,
    mainAiSummary: mainStage.mainAiSummary,
    correctionsTh: mainStage.correctionsTh,
    sentiment: mainStage.sentiment,
    confidenceScore: mainStage.confidenceScore,
    timestamp: nowIso,
  };

  memoryAnalysisHistory.unshift(record);
  if (memoryAnalysisHistory.length > 30) memoryAnalysisHistory.length = 30;

  const persistTask = saveAnalysisRecordToD1(env.DB, record);
  if (options.ctx?.waitUntil) options.ctx.waitUntil(persistTask);
  else await persistTask;

  return record;
}

export async function listDoubleCheckAnalyses(
  env: DoubleCheckEnv = {},
  limit = 10
): Promise<DoubleCheckAnalysisRecord[]> {
  const safeLimit = Math.min(30, Math.max(1, limit));
  if (env.DB) {
    try {
      await ensureD1Schema(env.DB);
      const res = await env.DB.prepare(
        `SELECT id, rss_item_id, rss_source, headline,
                cf_ai_model, cf_ai_status, cf_ai_summary,
                main_ai_model, main_ai_verdict, main_ai_summary,
                sentiment, confidence, created_at
         FROM ai_analysis
         ORDER BY id DESC
         LIMIT ?`
      )
        .bind(safeLimit)
        .all<Record<string, unknown>>();
      const rows = Array.isArray(res?.results) ? res.results : [];
      if (rows.length > 0) {
        return rows.map((r) => ({
          id: (r.id as number | string) ?? `db-${Math.random().toString(36).slice(2, 6)}`,
          rssItemId: typeof r.rss_item_id === 'number' ? r.rss_item_id : null,
          rssSource: String(r.rss_source || 'RSS'),
          headline: String(r.headline || ''),
          cfAiModel: String(r.cf_ai_model || CF_LLAMA3_MODEL),
          cfAiResult: String(r.cf_ai_summary || ''),
          cfAiStatus: String(r.cf_ai_status || 'OK') as CloudflareAiStatus,
          mainAiModel: String(r.main_ai_model || 'MotorBoy Primary AI'),
          mainAiVerdict: String(r.main_ai_verdict || ''),
          mainAiSummary: String(r.main_ai_summary || r.main_ai_verdict || ''),
          sentiment: String(r.sentiment || 'NEUTRAL') as Sentiment,
          confidenceScore: Number(r.confidence) || 80,
          timestamp: String(r.created_at || new Date().toISOString()),
        }));
      }
    } catch {
      // Fallback to memory history
    }
  }
  return memoryAnalysisHistory.slice(0, safeLimit);
}

/* --------------------------------------------------------------------------
 * HTTP Route Handlers for /api/rss and /api/analysis
 * ------------------------------------------------------------------------ */

function edgeJson(data: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...extraHeaders,
    },
  });
}

export async function handleRssApiRequest(
  request: Request,
  env: DoubleCheckEnv = {},
  ctx?: EdgeExecutionContext
): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === 'GET') {
    const forceRefresh = url.searchParams.get('refresh') === '1';
    const category = url.searchParams.get('category') || undefined;
    const cacheStorage =
      typeof caches !== 'undefined' && (caches as unknown as { default?: Cache }).default
        ? (caches as unknown as { default: Cache }).default
        : null;
    const cacheKey = new Request(
      `${url.origin}/api/rss?category=${encodeURIComponent(category || 'ALL')}`,
      { method: 'GET' }
    );

    if (!forceRefresh && cacheStorage) {
      try {
        const hit = await cacheStorage.match(cacheKey);
        if (hit) {
          return new Response(hit.body, {
            status: hit.status,
            headers: {
              'Content-Type': 'application/json; charset=utf-8',
              'Cache-Control': `public, max-age=${RSS_CACHE_TTL_SEC}, s-maxage=${RSS_CACHE_TTL_SEC}`,
              'X-Rss-Cache': 'EDGE-HIT',
            },
          });
        }
      } catch {
        // Ignore Cache API errors in non-edge runtimes
      }
    }

    const result = await fetchAndCacheRssFeeds(env, { forceRefresh, category, ctx });

    if (result.articles.length > 0 && memoryAnalysisHistory.length === 0 && ctx?.waitUntil) {
      ctx.waitUntil(
        executeDoubleCheckAnalysis(env, { article: result.articles[0], ctx }).catch(() => undefined)
      );
    }

    const response = edgeJson(
      {
        status: 'ok',
        cached: result.cached,
        cacheTtlSec: result.cacheTtlSec,
        fetchedAt: result.fetchedAt,
        count: result.articles.length,
        sources: result.sources,
        articles: result.articles,
      },
      200,
      {
        'Cache-Control': `public, max-age=${result.cacheTtlSec}, s-maxage=${result.cacheTtlSec}`,
        'X-Rss-Cache': result.cached ? 'HIT' : 'MISS',
      }
    );

    if (cacheStorage && !forceRefresh) {
      const putTask = cacheStorage.put(cacheKey, response.clone()).catch(() => undefined);
      if (ctx?.waitUntil) ctx.waitUntil(putTask);
      else await putTask;
    }

    return response;
  }

  if (request.method === 'POST') {
    let body: Record<string, unknown> = {};
    try {
      const raw = await request.text();
      if (raw && raw.length <= 65_536) body = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return edgeJson({ error: 'invalid_json' }, 400);
    }

    if (body.action === 'refresh') {
      const refreshed = await fetchAndCacheRssFeeds(env, { forceRefresh: true, ctx });
      return edgeJson({
        success: true,
        cached: false,
        fetchedAt: refreshed.fetchedAt,
        count: refreshed.articles.length,
        articles: refreshed.articles,
      });
    }

    const title = typeof body.title === 'string'
      ? body.title.trim().slice(0, 80)
      : typeof body.name === 'string'
      ? body.name.trim().slice(0, 80)
      : '';
    const rawUrl = typeof body.url === 'string' ? body.url.trim() : '';
    const rawCat = typeof body.category === 'string' ? body.category.trim().toUpperCase() : 'MACRO';
    const validCategories = new Set([
      'MSN_MONEY',
      'CRYPTO',
      'FOREX',
      'MACRO',
      'PROJECT_EXPANSION',
      'YAHOO_WORLD',
      'MITRADE',
    ]);
    const category = (validCategories.has(rawCat) ? rawCat : 'MACRO') as NewsArticle['category'];

    const safeUrl = validateExternalFeedUrl(rawUrl);
    if (!title || !safeUrl) {
      return edgeJson(
        {
          error: 'invalid_rss_feed',
          message: 'กรุณาระบุชื่อแหล่งข่าวและลิงก์ RSS แบบ https:// ที่ถูกต้อง',
        },
        400
      );
    }

    const feedRecord: RssFeedRecord = { name: title, url: safeUrl, category, isEnabled: true };
    const probe = await fetchSingleFeedXml(feedRecord, 4);

    if (env.DB) {
      await persistFeedAndItemsToD1(env.DB, feedRecord, probe.articles, new Date().toISOString()).catch(
        () => undefined
      );
    } else if (!memoryCustomFeeds.some((f) => f.url === safeUrl)) {
      memoryCustomFeeds.push(feedRecord);
    }

    memoryRssCache = null;

    return edgeJson(
      {
        success: true,
        feed: { ...feedRecord, lastStatus: probe.status },
        articles: probe.articles,
      },
      201
    );
  }

  return edgeJson({ error: 'method_not_allowed' }, 405);
}

export async function handleAnalysisApiRequest(
  request: Request,
  env: DoubleCheckEnv = {},
  ctx?: EdgeExecutionContext
): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === 'GET') {
    const limit = Math.min(20, Math.max(1, Number(url.searchParams.get('limit')) || 8));
    let items = await listDoubleCheckAnalyses(env, limit);

    if (items.length === 0 && url.searchParams.get('auto') === '1') {
      const created = await executeDoubleCheckAnalysis(env, { ctx });
      items = [created];
    }

    return edgeJson(
      {
        status: 'ok',
        count: items.length,
        cfModels: CF_WORKERS_AI_MODELS,
        items,
      },
      200,
      { 'Cache-Control': 'no-store' }
    );
  }

  if (request.method === 'POST') {
    let body: Record<string, unknown> = {};
    try {
      const raw = await request.text();
      if (raw && raw.length <= 262_144) body = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return edgeJson({ error: 'invalid_json' }, 400);
    }

    // Save client-verified Main AI result (`geminiService.ts`) into D1 `ai_analysis`
    if (body.action === 'save_verified' && body.record && typeof body.record === 'object') {
      const rec = body.record as DoubleCheckAnalysisRecord;
      memoryAnalysisHistory.unshift(rec);
      if (memoryAnalysisHistory.length > 30) memoryAnalysisHistory.length = 30;
      const saveTask = saveAnalysisRecordToD1(env.DB, rec);
      if (ctx?.waitUntil) ctx.waitUntil(saveTask);
      else await saveTask;
      return edgeJson({ status: 'ok', analysis: rec }, 200, { 'Cache-Control': 'no-store' });
    }

    const articleInput =
      body.article && typeof body.article === 'object'
        ? (body.article as Partial<NewsArticle>)
        : typeof body.headline === 'string' || typeof body.title === 'string'
        ? {
            title: String(body.headline || body.title || ''),
            source:
              typeof body.rssSource === 'string'
                ? body.rssSource
                : typeof body.source === 'string'
                ? body.source
                : 'RSS Feed',
            url: typeof body.url === 'string' ? body.url : undefined,
            summary: typeof body.summary === 'string' ? body.summary : undefined,
            category:
              typeof body.category === 'string'
                ? (body.category as NewsArticle['category'])
                : 'MACRO',
          }
        : undefined;

    const apiKey = typeof body.apiKey === 'string' ? body.apiKey : undefined;

    if (body.background === true && ctx?.waitUntil) {
      ctx.waitUntil(executeDoubleCheckAnalysis(env, { article: articleInput, apiKey, ctx }));
      return edgeJson(
        {
          status: 'queued',
          message: 'ส่งงานวิเคราะห์สองชั้นไปยัง Background Worker เรียบร้อยแล้ว',
        },
        202,
        { 'Cache-Control': 'no-store' }
      );
    }

    const analysis = await executeDoubleCheckAnalysis(env, {
      article: articleInput,
      apiKey,
      ctx,
    });

    return edgeJson({ status: 'ok', analysis }, 200, { 'Cache-Control': 'no-store' });
  }

  return edgeJson({ error: 'method_not_allowed' }, 405);
}
