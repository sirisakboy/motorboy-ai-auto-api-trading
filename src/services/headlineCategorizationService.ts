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
let serverKeyProbe: boolean | null = null;

async function isServerKeyAvailable(): Promise<boolean> {
  if (serverKeyProbe !== null) return serverKeyProbe;
  try {
    const res = await fetch('/api/gemini/config');
    if (!res.ok) return false;
    const data = await res.json();
    serverKeyProbe = Boolean(data?.serverKeyConfigured);
    return serverKeyProbe;
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

  if (!keyToken) {
    const hasServerKey = await isServerKeyAvailable();
    if (!hasServerKey) {
      blockedHeadlineKeys.add('');
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
      return data.articles;
    }

    const kind = data?.kind;
    const code = data?.error;
    if (
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
    // Fallback cleanly to local heuristic without noisy console errors
  }

  return applyHeuristicFallback(articles);
}
