import { NewsArticle } from '../types';

/**
 * Background Keyword Heuristic Fallback for Headline Impact Categorization
 * Categorizes headlines into 'HIGH', 'MEDIUM', or 'LOW' when AI API is offline.
 */
export function categorizeHeadlinesHeuristic(article: NewsArticle): 'HIGH' | 'MEDIUM' | 'LOW' {
  const titleUpper = (article.title || '').toUpperCase();
  const summaryUpper = (article.summary || '').toUpperCase();
  const text = `${titleUpper} ${summaryUpper}`;

  // High Impact Keywords (Major Central Bank, Macro, Rate Cuts, Geopolitics, Crisis)
  const highKeywords = [
    'FED', 'INTEREST RATE', 'RATE CUT', 'INFLATION', 'CPI', 'WAR', 'WARS',
    'RECESSION', 'OPEC', 'CRASH', 'DEFAULT', 'BANKRUPT', 'SEC', 'NONFARM',
    'STIMULUS', 'BREAKOUT', 'VOLATILITY', 'SANCTIONS', 'GEOPOLITICAL',
    'สงคราม', 'ดอกเบี้ย', 'เงินเฟ้อ', 'ลดดอกเบี้ย', 'วิกฤต', 'วิกฤตการณ์'
  ];

  // Medium Impact Keywords (Earnings, Corporate, Crypto Major, Trade, Commodities)
  const mediumKeywords = [
    'EARNINGS', 'REVENUE', 'QUARTER', 'BITCOIN', 'ETHEREUM', 'GOLD', 'OIL',
    'STOCK', 'STOCKS', 'DIVIDEND', 'ACQUISITION', 'MERGER', 'TECH', 'NVIDIA',
    'TESLA', 'APPLE', 'BYD', 'THB', 'BAHT', 'YEN', 'DOLLAR', 'TRADE',
    'ผลประกอบการ', 'กำไร', 'รายได้', 'ทองคำ', 'น้ำมัน', 'หุ้นไทย'
  ];

  if (highKeywords.some((kw) => text.includes(kw))) {
    return 'HIGH';
  }
  if (mediumKeywords.some((kw) => text.includes(kw))) {
    return 'MEDIUM';
  }
  return 'LOW';
}

const blockedHeadlineKeys = new Set<string>();
const quotaCooldownUntilByKey = new Map<string, number>();
const transientCooldownUntilByKey = new Map<string, number>();
let serverKeyProbe: { value: boolean; checkedAt: number } | null = null;
let lastCategorizedSignature: { signature: string; result: NewsArticle[]; expiresAt: number } | null = null;

const HEADLINE_QUOTA_COOLDOWN_MS = 10 * 60 * 1000;
const HEADLINE_TRANSIENT_COOLDOWN_MS = 2 * 60 * 1000;
const HEADLINE_MEMO_TTL_MS = 5 * 60 * 1000;
const SERVER_PROBE_TTL_MS = 60 * 1000;

async function isServerKeyAvailable(): Promise<boolean> {
  const now = Date.now();
  if (serverKeyProbe && now - serverKeyProbe.checkedAt < SERVER_PROBE_TTL_MS) {
    return serverKeyProbe.value;
  }
  try {
    const res = await fetch('/api/gemini/config');
    if (!res.ok) return false;
    const data = await res.json();
    const available = Boolean(data?.serverKeyConfigured);
    serverKeyProbe = { value: available, checkedAt: now };
    return available;
  } catch {
    return false;
  }
}

function applyHeuristicFallback(articles: NewsArticle[]): NewsArticle[] {
  return articles.map((art) => ({
    ...art,
    impact: art.impact || categorizeHeadlinesHeuristic(art),
  }));
}

function buildArticlesSignature(articles: NewsArticle[], keyToken: string): string {
  const titles = articles
    .slice(0, 15)
    .map((a) => `${a.id || ''}:${(a.title || '').slice(0, 80)}`)
    .join('|');
  return `${keyToken.slice(0, 8)}::${titles}`;
}

export function resetHeadlineCategorizationState(): void {
  blockedHeadlineKeys.clear();
  quotaCooldownUntilByKey.clear();
  transientCooldownUntilByKey.clear();
  serverKeyProbe = null;
  lastCategorizedSignature = null;
}

/**
 * Periodically categorizes global financial headlines into High/Medium/Low market impact via Server Gemini API.
 */
export async function categorizeHeadlinesWithGemini(
  articles: NewsArticle[],
  geminiApiKey?: string
): Promise<NewsArticle[]> {
  if (!articles || articles.length === 0) return articles;

  const keyToken = geminiApiKey?.trim() || '';
  if (blockedHeadlineKeys.has(keyToken)) {
    return applyHeuristicFallback(articles);
  }

  const now = Date.now();
  const quotaUntil = quotaCooldownUntilByKey.get(keyToken) || 0;
  const transientUntil = transientCooldownUntilByKey.get(keyToken) || 0;
  if (quotaUntil > now || transientUntil > now) {
    return applyHeuristicFallback(articles);
  }

  const signature = buildArticlesSignature(articles, keyToken);
  if (lastCategorizedSignature && lastCategorizedSignature.signature === signature && lastCategorizedSignature.expiresAt > now) {
    return lastCategorizedSignature.result;
  }

  if (!keyToken) {
    const hasServerKey = await isServerKeyAvailable();
    if (!hasServerKey) {
      return applyHeuristicFallback(articles);
    }
  }

  try {
    const res = await fetch('/api/gemini/categorize-headlines', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ articles, apiKey: keyToken || undefined }),
    });

    const data = await res.json().catch(() => null);

    if (res.ok && Array.isArray(data?.articles) && data.articles.length > 0) {
      blockedHeadlineKeys.delete(keyToken);
      quotaCooldownUntilByKey.delete(keyToken);
      if (data?.degraded) {
        transientCooldownUntilByKey.set(keyToken, Date.now() + HEADLINE_TRANSIENT_COOLDOWN_MS);
      } else {
        transientCooldownUntilByKey.delete(keyToken);
      }
      lastCategorizedSignature = {
        signature,
        result: data.articles,
        expiresAt: Date.now() + (data?.degraded ? HEADLINE_TRANSIENT_COOLDOWN_MS : HEADLINE_MEMO_TTL_MS),
      };
      return data.articles;
    }

    const kind = data?.kind;
    const code = data?.error;
    if (res.status === 429 || kind === 'QUOTA' || code === 'quota_exceeded') {
      quotaCooldownUntilByKey.set(keyToken, Date.now() + HEADLINE_QUOTA_COOLDOWN_MS);
    } else if (res.status >= 500 || kind === 'SERVER_ERROR' || kind === 'NETWORK') {
      transientCooldownUntilByKey.set(keyToken, Date.now() + HEADLINE_TRANSIENT_COOLDOWN_MS);
    } else if (
      res.status === 400 ||
      res.status === 401 ||
      res.status === 403 ||
      kind === 'INVALID_KEY' ||
      kind === 'MISSING_KEY' ||
      kind === 'PERMISSION_DENIED' ||
      code === 'invalid_api_key' ||
      code === 'missing_gemini_key'
    ) {
      blockedHeadlineKeys.add(keyToken);
    }
  } catch {
    transientCooldownUntilByKey.set(keyToken, Date.now() + HEADLINE_TRANSIENT_COOLDOWN_MS);
  }

  return applyHeuristicFallback(articles);
}
