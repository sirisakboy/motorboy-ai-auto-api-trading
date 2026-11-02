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

/**
 * Periodically categorizes global financial headlines into High/Medium/Low market impact via Server Gemini API.
 */
export async function categorizeHeadlinesWithGemini(
  articles: NewsArticle[],
  geminiApiKey?: string
): Promise<NewsArticle[]> {
  if (!articles || articles.length === 0) return articles;

  try {
    const res = await fetch('/api/gemini/categorize-headlines', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ articles, apiKey: geminiApiKey }),
    });

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.articles) && data.articles.length > 0) {
        return data.articles;
      }
    }
  } catch (err) {
    console.warn('Headline categorization server endpoint warning (fallback to heuristic):', err);
  }

  // Fallback for all articles if server call fails
  return articles.map((art) => ({
    ...art,
    impact: art.impact || categorizeHeadlinesHeuristic(art),
  }));
}
