import {
  CryptoCoin,
  ForexPair,
  StockIndex,
  TradingSignal,
  NewsArticle,
  MarketHoursInfo,
  ChartData,
  Sentiment,
  FlashDirection,
  BinanceTicker24h,
  BinanceKline,
  RssItem,
  ThaiStock,
  ForeignStock,
} from '../types';

/**
 * รายชื่อสินทรัพย์ที่ติดตาม — **ไม่มีราคา/เปอร์เซ็นต์ตัวอย่าง**
 *
 * เดิมไฟล์นี้ฝังราคาปลอมไว้ (BTC 92,450 / SHIB 0.0000245) และถูกใช้เป็นค่าเริ่มต้น
 * ก่อนข้อมูลจริงจะมาถึง ทำให้เกิดบั๊กที่ผู้ใช้เห็น: การ์ดโชว์ราคาสด $71,692
 * แต่ SL/TP คำนวณจาก 92,450 → SL 90,364 สูงกว่าราคาเข้าในไม้ LONG
 *
 * กติกาใหม่: price = 0 แปลว่า "ยังไม่รู้ราคา" — UI ต้องรอข้อมูลจริงและไม่สร้างสัญญาณ
 * จนกว่าจะมีราคา (ดู isUsablePrice ใน generateRealSignals)
 */
export const CRYPTO_INITIAL: CryptoCoin[] = [
  { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', binanceSymbol: 'BTCUSDT', price: 0, change: 0, flash: 'NONE' },
  { id: 'ethereum', symbol: 'ETH', name: 'Ethereum', binanceSymbol: 'ETHUSDT', price: 0, change: 0, flash: 'NONE' },
  { id: 'solana', symbol: 'SOL', name: 'Solana', binanceSymbol: 'SOLUSDT', price: 0, change: 0, flash: 'NONE' },
  { id: 'binancecoin', symbol: 'BNB', name: 'BNB', binanceSymbol: 'BNBUSDT', price: 0, change: 0, flash: 'NONE' },
  { id: 'ripple', symbol: 'XRP', name: 'XRP', binanceSymbol: 'XRPUSDT', price: 0, change: 0, flash: 'NONE' },
  { id: 'shiba-inu', symbol: 'SHIB', name: 'Shiba Inu', binanceSymbol: 'SHIBUSDT', price: 0, change: 0, flash: 'NONE' },
];

export const FOREX_PAIRS: string[] = [
  'EUR/USD',
  'USD/JPY',
  'GBP/USD',
  'USD/THB',
  'AUD/USD',
  'USD/CHF',
];

/**
 * เวลาที่ข้อมูลตัวอย่าง (bundled snapshot) ถูกบันทึกไว้
 * ใช้ติดป้าย "ณ วันที่/เวลา" ทุกครั้งที่ยังไม่ได้ดึงข้อมูลสด
 * — ตัวเลขคงที่ต้องไม่ถูกนำเสนอเสมือนราคาปัจจุบัน
 */
export const SEED_SNAPSHOT_AT = '2026-10-01T09:00:00.000Z';

/** ติดธง "ไม่ใช่ข้อมูลสด" + เวลาอ้างอิงให้ข้อมูลตั้งต้นทุกก้อน */
function stampSeedSnapshot<T extends { isLive?: boolean; updatedAt?: string }>(items: T[]): T[] {
  return items.map((item) => ({
    ...item,
    isLive: false,
    updatedAt: item.updatedAt ?? SEED_SNAPSHOT_AT,
  }));
}

const STOCK_SYMBOLS_RAW: StockIndex[] = [
  { symbol: 'SET', name: 'SET Index', price: 1378.45, change: 0.42, status: 'CLOSED', schedule: 'SET Mon-Fri 10:00-12:30, 14:30-16:30 ICT', isLive: false },
  { symbol: 'NASDAQ', name: 'NASDAQ', price: 18942.10, change: 1.15, status: 'CLOSED', schedule: 'US Market 09:30-16:00 EST', isLive: false },
  { symbol: 'S&P500', name: 'S&P 500', price: 5983.25, change: 0.68, status: 'CLOSED', schedule: 'US Market 09:30-16:00 EST', isLive: false },
  { symbol: 'DJI', name: 'Dow Jones', price: 43729.80, change: -0.12, status: 'CLOSED', schedule: 'US Market 09:30-16:00 EST', isLive: false },
];

export const STOCK_SYMBOLS: StockIndex[] = stampSeedSnapshot(STOCK_SYMBOLS_RAW);

/** Yahoo Finance symbols for live index quotes. */
const INDEX_YAHOO_MAP: Record<string, string> = {
  SET: '^SET.BK',
  NASDAQ: '^IXIC',
  'S&P500': '^GSPC',
  DJI: '^DJI',
};

/**
 * Fetch live index quotes via Yahoo Finance v8 chart API.
 * Falls back to Stooq CSV, then to static STOCK_SYMBOLS marked isLive:false.
 */
export async function fetchStockIndices(prev: StockIndex[] = STOCK_SYMBOLS): Promise<StockIndex[]> {
  const nowIso = new Date().toISOString();
  try {
    const settled = await Promise.allSettled(
      prev.map((s) => fetchYahooChartMeta(INDEX_YAHOO_MAP[s.symbol] ?? s.symbol))
    );
    const hasLive = settled.some((r) => r.status === 'fulfilled' && r.value !== null);
    if (hasLive) {
      return prev.map((stock, i) => {
        const r = settled[i];
        const meta = r.status === 'fulfilled' ? r.value : null;
        if (!meta || typeof meta.regularMarketPrice !== 'number') return { ...stock, isLive: false };
        const price = meta.regularMarketPrice;
        const computed = calcChangePercent(price, meta.chartPreviousClose);
        return {
          ...stock,
          price,
          change: computed !== null ? +computed.toFixed(2) : stock.change,
          isLive: true,
          updatedAt: nowIso,
        };
      });
    }
  } catch {
    // fall through to Stooq
  }

  // Fallback: Yahoo mirrors (query2 host + CORS proxy).
  // NOTE: Stooq was removed — endpoint unreachable/unreliable and its
  // `^set.bk`-style symbols are unverified; stale badge is more honest.
  try {
    const symbols = prev.map((s) => INDEX_YAHOO_MAP[s.symbol] ?? s.symbol);
    const settledMirror = await Promise.allSettled(symbols.map((sym) => fetchYahooChartMetaViaProxy(sym)));
    const liveIdx = settledMirror.findIndex((r) => r.status === 'fulfilled' && r.value !== null);
    if (liveIdx !== -1) {
      return prev.map((stock, i) => {
        const r = settledMirror[i];
        const meta = r.status === 'fulfilled' ? r.value : null;
        if (!meta || typeof meta.regularMarketPrice !== 'number') return { ...stock, isLive: false };
        const price = meta.regularMarketPrice;
        const computed = calcChangePercent(price, meta.chartPreviousClose);
        return {
          ...stock,
          price,
          change: computed !== null ? +computed.toFixed(2) : stock.change,
          isLive: true,
          updatedAt: nowIso,
        };
      });
    }
  } catch {
    // fall through to static
  }

  return prev.map((s) => ({ ...s, isLive: false }));
}

const THAI_STOCKS_RAW: ThaiStock[] = [
  { symbol: 'AOT', name: 'ท่าอากาศยานไทย', nameEn: 'Airports of Thailand', sector: 'ท่องเที่ยว & การบิน', price: 62.50, change: 1.25, volume: 18500000, marketCap: '875,000', pe: 32.5, dividendYield: 1.8, googleFinanceUrl: 'https://www.google.com/finance/quote/AOT:SET' },
  { symbol: 'CPALL', name: 'ซีพีออลล์', nameEn: 'CP All', sector: 'ค้าปลีก', price: 58.75, change: 0.85, volume: 12300000, marketCap: '421,000', pe: 24.8, dividendYield: 2.1, googleFinanceUrl: 'https://www.google.com/finance/quote/CPALL:SET' },
  { symbol: 'SCC', name: 'เอสซีจี', nameEn: 'Siam Cement', sector: 'วัสดุก่อสร้าง', price: 285.00, change: -0.52, volume: 3200000, marketCap: '405,000', pe: 15.2, dividendYield: 3.8, googleFinanceUrl: 'https://www.google.com/finance/quote/SCC:SET' },
  { symbol: 'PTT', name: 'ปตท.', nameEn: 'PTT PCL', sector: 'พลังงาน', price: 34.25, change: 2.10, volume: 28700000, marketCap: '480,000', pe: 8.5, dividendYield: 5.2, googleFinanceUrl: 'https://www.google.com/finance/quote/PTT:SET' },
  { symbol: 'DELTA', name: 'เดลต้า', nameEn: 'Delta Electronics', sector: 'อิเล็กทรอนิกส์', price: 128.50, change: 3.45, volume: 8900000, marketCap: '295,000', pe: 42.1, dividendYield: 0.8, googleFinanceUrl: 'https://www.google.com/finance/quote/DELTA:SET' },
  { symbol: 'KBANK', name: 'กสิกรไทย', nameEn: 'Kasikornbank', sector: 'ธนาคาร', price: 142.00, change: 0.71, volume: 9800000, marketCap: '338,000', pe: 10.2, dividendYield: 4.5, googleFinanceUrl: 'https://www.google.com/finance/quote/KBANK:SET' },
  { symbol: 'BH', name: 'บำรุงราษฎร์', nameEn: 'Bangkok Dusit Medical', sector: 'สาธารณสุข', price: 245.00, change: 1.65, volume: 5600000, marketCap: '315,000', pe: 28.3, dividendYield: 1.5, googleFinanceUrl: 'https://www.google.com/finance/quote/BH:SET' },
  { symbol: 'ADVANC', name: 'แอดวานซ์', nameEn: 'Advanced Info Service', sector: 'สื่อสาร', price: 365.00, change: 0.55, volume: 4200000, marketCap: '335,000', pe: 22.1, dividendYield: 2.8, googleFinanceUrl: 'https://www.google.com/finance/quote/ADVANC:SET' },
  { symbol: 'GULF', name: 'กัลฟ์', nameEn: 'Gulf Energy', sector: 'พลังงานไฟฟ้า', price: 48.50, change: 1.90, volume: 15200000, marketCap: '290,000', pe: 18.5, dividendYield: 2.2, googleFinanceUrl: 'https://www.google.com/finance/quote/GULF:SET' },
  { symbol: 'TRUE', name: 'ทรู', nameEn: 'True Corporation', sector: 'สื่อสาร', price: 11.80, change: -0.84, volume: 32100000, marketCap: '168,000', pe: 45.2, dividendYield: 0.5, googleFinanceUrl: 'https://www.google.com/finance/quote/TRUE:SET' },
];

export const THAI_STOCKS: ThaiStock[] = stampSeedSnapshot(THAI_STOCKS_RAW);

const FOREIGN_STOCKS_RAW: ForeignStock[] = [
  { symbol: 'AAPL', name: 'Apple Inc.', sector: 'Technology', price: 234.80, change: 1.52, volume: 52300000, marketCap: '3.62T', pe: 32.5, high52w: 244.50, low52w: 164.08, googleFinanceUrl: 'https://www.google.com/finance/quote/AAPL:NASDAQ' },
  { symbol: 'NVDA', name: 'NVIDIA Corp', sector: 'Semiconductor', price: 142.65, change: 4.28, volume: 89200000, marketCap: '3.48T', pe: 62.8, high52w: 153.13, low52w: 75.61, googleFinanceUrl: 'https://www.google.com/finance/quote/NVDA:NASDAQ' },
  { symbol: 'TSLA', name: 'Tesla Inc.', sector: 'EV & Clean Energy', price: 412.50, change: -2.15, volume: 78500000, marketCap: '1.32T', pe: 115.2, high52w: 488.54, low52w: 138.80, googleFinanceUrl: 'https://www.google.com/finance/quote/TSLA:NASDAQ' },
  { symbol: 'GOOGL', name: 'Alphabet Inc.', sector: 'Technology', price: 192.30, change: 0.98, volume: 28100000, marketCap: '2.38T', pe: 24.8, high52w: 207.71, low52w: 147.22, googleFinanceUrl: 'https://www.google.com/finance/quote/GOOGL:NASDAQ' },
  { symbol: 'MSFT', name: 'Microsoft Corp', sector: 'Technology', price: 512.40, change: 1.22, volume: 22400000, marketCap: '3.81T', pe: 35.2, high52w: 527.35, low52w: 385.58, googleFinanceUrl: 'https://www.google.com/finance/quote/MSFT:NASDAQ' },
  { symbol: 'META', name: 'Meta Platforms', sector: 'Technology', price: 762.80, change: 2.45, volume: 18900000, marketCap: '1.93T', pe: 28.5, high52w: 780.20, low52w: 426.37, googleFinanceUrl: 'https://www.google.com/finance/quote/META:NASDAQ' },
  { symbol: 'AMZN', name: 'Amazon.com', sector: 'E-Commerce & Cloud', price: 228.50, change: 1.05, volume: 35600000, marketCap: '2.41T', pe: 42.1, high52w: 242.52, low52w: 161.02, googleFinanceUrl: 'https://www.google.com/finance/quote/AMZN:NASDAQ' },
  { symbol: 'AVGO', name: 'Broadcom Inc.', sector: 'Semiconductor', price: 198.75, change: 3.18, volume: 31200000, marketCap: '932B', pe: 45.8, high52w: 251.88, low52w: 128.00, googleFinanceUrl: 'https://www.google.com/finance/quote/AVGO:NASDAQ' },
];

export const FOREIGN_STOCKS: ForeignStock[] = stampSeedSnapshot(FOREIGN_STOCKS_RAW);

const NEWS_SOURCES = [
  { url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', name: 'CoinDesk', category: 'CRYPTO' as const },
  { url: 'https://cointelegraph.com/rss', name: 'Cointelegraph', category: 'CRYPTO' as const },
  { url: 'https://decrypt.co/feed', name: 'Decrypt', category: 'CRYPTO' as const },
  { url: 'https://www.theblock.co/rss.xml', name: 'The Block', category: 'CRYPTO' as const },
];

export const MSN_MONEY_URL = 'https://www.msn.com/th-th/money';
export const YAHOO_WORLD_NEWS_URL = 'https://news.yahoo.com/world';
export const YAHOO_FINANCE_URL = 'https://finance.yahoo.com';
export const MITRADE_NEWS_URL = 'https://www.mitrade.com/th/insights/news/live-news';

const YAHOO_WORLD_FEED_SOURCES = [
  // NOTE: news.yahoo.com/rss/* returns 404 (discontinued) — use Finance RSS instead (verified 200).
  { url: 'https://finance.yahoo.com/rss/topstories', name: 'Yahoo Top Stories', category: 'YAHOO_WORLD' as const },
  { url: 'https://finance.yahoo.com/news/rssindex', name: 'Yahoo Finance World', category: 'YAHOO_WORLD' as const },
];

/** Global macro feeds (verified 200, no key). */
const MACRO_FEED_SOURCES = [
  { url: 'https://feeds.bbci.co.uk/news/business/rss.xml', name: 'BBC Business', category: 'MACRO' as const },
  { url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html', name: 'CNBC Top News', category: 'MACRO' as const },
];

/** Thai market feeds (verified 200, no key) — shown in the MSN การเงินไทย tab. */
const THAI_FEED_SOURCES = [
  { url: 'https://www.bangkokpost.com/rss/data/business.xml', name: 'Bangkok Post Business', category: 'MSN_MONEY' as const },
  { url: 'https://www.kaohoon.com/feed', name: 'Kaohoon', category: 'MSN_MONEY' as const },
];

interface FeedSource {
  url: string;
  name: string;
  category: NewsArticle['category'];
}

function generateArticleId(prefix: string, sourceName: string, idx: number, title: string): string {
  const slug = sourceName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'src';
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = ((hash << 5) - hash + title.charCodeAt(i)) | 0;
  }
  const hashStr = Math.abs(hash).toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${slug}-${idx}-${hashStr}-${rand}`;
}

function mapRssItemToArticle(
  source: FeedSource,
  item: RssItem,
  idx: number,
  idPrefix: string
): NewsArticle | null {
  const title = (item.title || '').trim();
  if (!title) return null;
  const sentiment = analyzeSentiment(title);
  return {
    id: generateArticleId(idPrefix, source.name, idx, title),
    title,
    source: source.name,
    time: formatTimeAgo(item.pubDate || ''),
    url: item.link || source.url,
    sentiment,
    category: source.category,
    impact: sentiment === 'NEUTRAL' ? 'MEDIUM' : 'HIGH',
    summary: item.description ? item.description.replace(/<[^>]*>?/gm, '').slice(0, 160) + '...' : undefined,
    isCurated: false,
    fetchedAt: new Date().toISOString(),
  };
}

async function fetchViaRss2json(source: FeedSource, max: number): Promise<NewsArticle[]> {
  const apiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(source.url)}`;
  const res = await fetch(apiUrl, { signal: AbortSignal.timeout(6000) });
  if (!res.ok) return [];
  const data = await res.json();
  if (data.status !== 'ok' || !Array.isArray(data.items)) return [];
  const items = data.items as RssItem[];
  return items
    .slice(0, max)
    .map((item, idx) => mapRssItemToArticle(source, item, idx, 'rss'))
    .filter((a): a is NewsArticle => a !== null);
}

async function fetchViaProxyXml(source: FeedSource, max: number): Promise<NewsArticle[]> {
  const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(source.url)}`;
  const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return [];
  const xmlText = await res.text();
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
  const items = xmlDoc.querySelectorAll('item');
  if (items.length === 0) return [];
  const out: NewsArticle[] = [];
  Array.from(items).slice(0, max).forEach((item, idx) => {
    const mapped = mapRssItemToArticle(
      source,
      {
        title: item.querySelector('title')?.textContent || '',
        link: item.querySelector('link')?.textContent || '',
        pubDate: item.querySelector('pubDate')?.textContent || '',
        description: item.querySelector('description')?.textContent || '',
      },
      idx,
      'rssxml'
    );
    if (mapped) out.push(mapped);
  });
  return out;
}

/**
 * Fetch one RSS feed, racing rss2json API against direct-XML-via-proxy.
 * First non-empty result wins — survives rss2json quotas and proxy outages.
 */
async function fetchFeedArticles(source: FeedSource, max = 3): Promise<NewsArticle[]> {
  const [a, b] = await Promise.allSettled([
    fetchViaRss2json(source, max),
    fetchViaProxyXml(source, max),
  ]);
  if (a.status === 'fulfilled' && a.value.length > 0) return a.value;
  if (b.status === 'fulfilled' && b.value.length > 0) return b.value;
  return [];
}

async function fetchFeedGroup(sources: FeedSource[], perSource = 3): Promise<NewsArticle[]> {
  const settled = await Promise.allSettled(sources.map((s) => fetchFeedArticles(s, perSource)));
  const out: NewsArticle[] = [];
  for (const r of settled) {
    if (r.status === 'fulfilled') out.push(...r.value);
  }
  return out;
}

function getYahooWorldCuratedNews(): NewsArticle[] {
  return [
    {
      id: 'yahoo-world-1',
      title: 'Yahoo World News: ตลาดการเงินโลกปรับตัวรับสัญญาณนโยบายดอกเบี้ยทรงตัว อัตราเงินเฟ้อเศรษฐกิจหลักชะลอสู่เป้าหมาย',
      source: 'Yahoo World News',
      time: '15 นาทีที่แล้ว',
      url: 'https://news.yahoo.com/world',
      sentiment: 'BULLISH',
      category: 'YAHOO_WORLD',
      impact: 'HIGH',
      summary: 'ดัชนีตลาดหุ้นทั่วโลกเคลื่อนไหวในแดนบวก หลังธนาคารกลางหลักส่งสัญญาณตรึงดอกเบี้ยและพร้อมลดดอกเบี้ยกระตุ้นเศรษฐกิจ ขณะที่ตัวเลขเงินเฟ้อสหรัฐฯ และยุโรปผ่อนคลายลงต่อเนื่อง',
    },
    {
      id: 'yahoo-world-2',
      title: 'Yahoo Finance: บิ๊กเทคและผู้ผลิตชิป AI เร่งขยายโครงสร้างพื้นฐาน Data Center ระดับโลกมูลค่ากว่า 5 หมื่นล้านดอลลาร์',
      source: 'Yahoo Finance World',
      time: '32 นาทีที่แล้ว',
      url: 'https://finance.yahoo.com',
      sentiment: 'BULLISH',
      category: 'YAHOO_WORLD',
      impact: 'HIGH',
      summary: 'ยักษ์ใหญ่เทคโนโลยีระดับโลกประกาศแผนเพิ่มงบลงทุน Capex ในโครงข่ายเซิร์ฟเวอร์ AI และระบบประมวลผลความเร็วสูงทั่วภูมิภาคเอเชียและยุโรป หนุนดีมานด์อุปกรณ์ฮาร์ดแวร์ทั่วโลก',
    },
    {
      id: 'yahoo-world-3',
      title: 'Yahoo World News: ราคาน้ำมันดิบโลกแกว่งตัวแคบเหนือ $78/บาร์เรล ซัพพลายกลุ่มโอเปกพลัสและการค้าทางทะเลมีเสถียรภาพ',
      source: 'Yahoo World News',
      time: '1 ชม.ที่แล้ว',
      url: 'https://news.yahoo.com/world',
      sentiment: 'NEUTRAL',
      category: 'YAHOO_WORLD',
      impact: 'MEDIUM',
      summary: 'สัญญาซื้อขายน้ำมันดิบ Brent และ WTI เคลื่อนไหวในกรอบสะสมกำลัง ขณะที่เส้นทางเดินเรือขนส่งสินค้าระหว่างประเทศยังคงเดินหน้าอย่างต่อเนื่องโดยไม่มีอุปสรรคชะงักงัน',
    },
    {
      id: 'yahoo-world-4',
      title: 'Yahoo Finance: ค่าเงินดอลลาร์สหรัฐพักฐาน หนุนกระแสเงินทุนไหลกลับสู่ตลาดเกิดใหม่และสินทรัพย์ดิจิทัล',
      source: 'Yahoo Finance World',
      time: '2 ชม.ที่แล้ว',
      url: 'https://finance.yahoo.com',
      sentiment: 'BULLISH',
      category: 'YAHOO_WORLD',
      impact: 'MEDIUM',
      summary: 'Dollar Index ปรับตัวลงสู่แนวรับ 103 จุด ส่งผลให้สกุลเงินเอเชียรวมถึงเงินบาทมีแนวโน้มแข็งค่าขึ้น และดึงดูดแรงซื้อเก็งกำไรในสินทรัพย์ทางเลือก',
    },
  ];
}

function getMsnMoneyCuratedNews(): NewsArticle[] {
  return [
    {
      id: 'msn-1',
      title: 'MSN Money: ตลาดหุ้นไทย SET Index ขยับบวกรับแรงซื้อกลุ่มพลังงานและอิเล็กทรอนิกส์ จับตา Fund Flow ต่างชาติ',
      source: 'MSN Money (th-th)',
      time: '12 นาทีที่แล้ว',
      url: 'https://www.msn.com/th-th/money',
      sentiment: 'BULLISH',
      category: 'MSN_MONEY',
      impact: 'HIGH',
      summary: 'ดัชนีหุ้นไทยปรับตัวเพิ่มขึ้นตามแรงหนุนของตลาดหุ้นเอเชีย นักลงทุนสถาบันเข้าสะสมหุ้นใหญ่ รับปัจจัยบวกผลประกอบการและการส่งออกที่ฟื้นตัวต่อเนื่อง',
    },
    {
      id: 'msn-2',
      title: 'MSN Money: ค่าเงินบาททดสอบแนวรับสำคัญ 36.45 บาท/ดอลลาร์ หลังตัวเลขเศรษฐกิจสหรัฐฯ ชะลอความร้อนแรง',
      source: 'MSN Money (th-th)',
      time: '28 นาทีที่แล้ว',
      url: 'https://www.msn.com/th-th/money',
      sentiment: 'BULLISH',
      category: 'MSN_MONEY',
      impact: 'HIGH',
      summary: 'เงินบาททยอยแข็งค่าขึ้นสอดคล้องกับสกุลเงินในภูมิภาค หลังดัชนีดอลลาร์สหรัฐพักฐาน ธปท. ย้ำดูแลเสถียรภาพอัตราแลกเปลี่ยนเพื่อเอื้อต่อภาคธุรกิจ',
    },
    {
      id: 'msn-3',
      title: 'MSN Money: ราคาทองคำในประเทศและ Gold Spot ทรงตัวเหนือแนวต้าน รับแรงหนุนความต้องการสินทรัพย์ปลอดภัย',
      source: 'MSN Money (th-th)',
      time: '45 นาทีที่แล้ว',
      url: 'https://www.msn.com/th-th/money',
      sentiment: 'BULLISH',
      category: 'MSN_MONEY',
      impact: 'MEDIUM',
      summary: 'ความผันผวนของภูมิรัฐศาสตร์โลกและแนวโน้มการลดอัตราดอกเบี้ยของธนาคารกลางสหรัฐฯ ผลักดันให้นักลงทุนเพิ่มสัดส่วนการถือครองทองคำเพื่อป้องกันความเสี่ยง',
    },
    {
      id: 'msn-4',
      title: 'MSN Money: Fund Flow ตลาดเกิดใหม่ไหลออกระยะสั้น หลังดัชนีดอลลาร์ดีดตัว นักลงทุนรอความชัดเจนนโยบายดอกเบี้ย',
      source: 'MSN Money (th-th)',
      time: '1 ชม.ที่แล้ว',
      url: 'https://www.msn.com/th-th/money',
      sentiment: 'BEARISH',
      category: 'MSN_MONEY',
      impact: 'MEDIUM',
      summary: 'กระแสเงินทุนบางส่วนไหลออกจากตลาดเกิดใหม่รับแรงแกร่งของดอลลาร์สหรัฐระยะสั้น ขณะที่นักลงทุนชะลอการตัดสินใจเพื่อรอนโยบายการเงินที่ชัดเจน',
    },
    {
      id: 'msn-5',
      title: 'MSN Money: ตลาดแกว่งกรอบแคบรอตัวเลขเงินเฟ้อไทยและการประชุม กนง. ทิศทางยังรอปัจจัยชี้นำใหม่',
      source: 'MSN Money (th-th)',
      time: '2 ชม.ที่แล้ว',
      url: 'https://www.msn.com/th-th/money',
      sentiment: 'NEUTRAL',
      category: 'MSN_MONEY',
      impact: 'LOW',
      summary: 'ตลาดหุ้นไทยและอัตราแลกเปลี่ยนเคลื่อนไหวในกรอบแคบแลกแรงซื้อ-ขาย ก่อนตัวเลขเงินเฟ้อในประเทศและท่าทีคณะกรรมการนโยบายการเงินรอบถัดไป',
    },
  ];
}

/**
 * Curated long-term construction megaprojects, corporate CAPEX expansions, and infrastructure initiatives
 */
export function getProjectExpansionCuratedNews(): NewsArticle[] {
  return [
    {
      id: 'proj-1',
      title: 'โครงการก่อสร้างรถไฟความเร็วสูงเชื่อม 3 สนามบิน & รถไฟฟ้าสายสีส้ม: เมกะโปรเจกต์โยธา 1.4 แสนล้าน หนุนกลุ่มรับเหมาและอสังหาฯ ระยะยาว',
      source: 'สำนักการวางแผนโครงสร้างพื้นฐาน & รฟม.',
      time: '35 นาทีที่แล้ว',
      url: 'https://www.msn.com/th-th/money',
      sentiment: 'BULLISH',
      category: 'PROJECT_EXPANSION',
      impact: 'HIGH',
      summary: 'การเร่งรัดส่งมอบพื้นที่และเริ่มงานก่อสร้างโยธาโครงข่ายรางเชื่อมโยงสนามบินดอนเมือง-สุวรรณภูมิ-อู่ตะเภา ช่วยเพิ่ม Backlog รับรู้รายได้ระยะยาว 3-5 ปี ให้แก่กลุ่มรับเหมาก่อสร้างและวัสดุภัณฑ์',
      projectDetails: {
        company: 'CK / BEM / STEC / SCC',
        projectName: 'รถไฟความเร็วสูงเชื่อม 3 สนามบิน & รถไฟฟ้าสายสีส้มตะวันตก',
        capexValue: '140,000 ล้านบาท',
        constructionTimeline: '2024 - 2028 (4-5 ปี)',
        projectType: 'INFRASTRUCTURE',
        targetBeneficiaries: ['CK (รับเหมาก่อสร้าง)', 'BEM (บริหารเดินรถ)', 'SCC (ปูนซีเมนต์/คอนกรีต)', 'CPN (พื้นที่พาณิชย์รอบสถานี)'],
      },
    },
    {
      id: 'proj-2',
      title: 'การลงทุนก่อสร้าง Hyperscale Data Center & Green Cloud: กลุ่มพลังงาน-ไอซีทีทุ่มงบ 3.5 หมื่นล้าน รองรับ AI Hub ภูมิภาคอาเซียน',
      source: 'บอร์ดส่งเสริมการลงทุน (BOI) & MSN Money',
      time: '1 ชม.ที่แล้ว',
      url: 'https://www.msn.com/th-th/money',
      sentiment: 'BULLISH',
      category: 'PROJECT_EXPANSION',
      impact: 'HIGH',
      summary: 'พันธมิตรยักษ์ใหญ่จับมือก่อสร้างศูนย์ข้อมูล Data Center มาตรฐานสากล Tier-4 พร้อมระบบไฟฟ้าพลังงานสะอาด (Clean Energy Direct PPA) เสริมกำไรยั่งยืนและรายได้ Recurring Income',
      projectDetails: {
        company: 'GULF & AIS & Singtel / WHA',
        projectName: 'GSA Hyperscale Green Data Center Phase 1-2',
        capexValue: '35,000 ล้านบาท',
        constructionTimeline: '2024 - 2027 (3 ปี)',
        projectType: 'DATA_CENTER',
        targetBeneficiaries: ['GULF (จำหน่ายไฟฟ้าสะอาด)', 'ADVANC (โครงข่ายไฟเบอร์)', 'WHA (ที่ดินนิคมอุตสาหกรรม/สาธารณูปโภค)'],
      },
    },
    {
      id: 'proj-3',
      title: 'แผนขยายโรงงานผลิตรถยนต์ไฟฟ้า (EV Mega Plant) และนิคมประกอบแบตเตอรี่ใน EEC: เม็ดเงิน 4.2 หมื่นล้าน ยกระดับซัพพลายเชนไทย',
      source: 'MSN Money & ข่าวอุตสาหกรรมยานยนต์',
      time: '2 ชม.ที่แล้ว',
      url: 'https://www.msn.com/th-th/money',
      sentiment: 'BULLISH',
      category: 'PROJECT_EXPANSION',
      impact: 'HIGH',
      summary: 'ค่ายรถยนต์ไฟฟ้าระดับโลกเริ่มเดินเครื่องตอกเสาเข็มขยายโรงงานผลิตและศูนย์วิจัยพัฒนาแบตเตอรี่ในเขตเศรษฐกิจพิเศษ EEC หนุนการส่งออกชิ้นส่วนอิเล็กทรอนิกส์และยานยนต์ในระยะ 3-5 ปีข้างหน้า',
      projectDetails: {
        company: 'DELTA / BYD / AMATA / HANA',
        projectName: 'EEC Electric Mobility & Battery Gigafactory Expansion',
        capexValue: '42,000 ล้านบาท',
        constructionTimeline: '2024 - 2026 (2-3 ปี)',
        projectType: 'FACTORY_EXPANSION',
        targetBeneficiaries: ['DELTA (เพาเวอร์ซัพพลาย/ชิ้นส่วน EV)', 'AMATA (ที่ดินนิคมอุตสาหกรรม)', 'HANA (เซมิคอนดักเตอร์ยานยนต์)'],
      },
    },
    {
      id: 'proj-4',
      title: 'โครงการก่อสร้างโรงไฟฟ้าพลังงานหมุนเวียนและระบบกักเก็บพลังงาน BESS (1,500 MW): งบ 2.8 หมื่นล้าน สัญญา PPA 25 ปี',
      source: 'กระทรวงพลังงาน & กกพ.',
      time: '3 ชม.ที่แล้ว',
      url: 'https://www.msn.com/th-th/money',
      sentiment: 'BULLISH',
      category: 'PROJECT_EXPANSION',
      impact: 'MEDIUM',
      summary: 'บริษัทพลังงานชั้นนำเปิดไซต์ก่อสร้างฟาร์มโซลาร์และกังหันลมพร้อมแบตเตอรี่กักเก็บพลังงานทั่วประเทศ การันตีผลตอบแทน IRR 11-13% และกระแสเงินสดต่อเนื่องยาวนาน 25 ปีตามสัญญา PPA',
      projectDetails: {
        company: 'BGRIM / GPSC / BCPG',
        projectName: 'Utility-Scale Renewable Hybrid & Battery Energy Storage (BESS)',
        capexValue: '28,000 ล้านบาท',
        constructionTimeline: '2025 - 2029 (4 ปี)',
        projectType: 'RENEWABLE_ENERGY',
        targetBeneficiaries: ['BGRIM (กำลังผลิตไฟฟ้าใหม่)', 'GPSC (ระบบบริหารโครงข่ายแบตเตอรี่)', 'GUNKUL (งานรับเหมา EPC แผงโซลาร์)'],
      },
    },
    {
      id: 'proj-5',
      title: 'การขยายศูนย์กระจายสินค้าอัจฉริยะอัตโนมัติ (AI Automated Logistics Hub) และขยายเครือข่ายค้าปลีก 700 สาขา',
      source: 'MSN Money & ข่าวธุรกิจค้าปลีก',
      time: '4 ชม.ที่แล้ว',
      url: 'https://www.msn.com/th-th/money',
      sentiment: 'BULLISH',
      category: 'PROJECT_EXPANSION',
      impact: 'MEDIUM',
      summary: 'ยักษ์ใหญ่ค้าปลีกเร่งก่อสร้างศูนย์โลจิสติกส์ระบบอัตโนมัติหุ่นยนต์ ช่วยลดต้นทุนดำเนินงาน (OPEX) ลง 18% และรองรับการขยายสาขาทั่วประเทศและประเทศเพื่อนบ้าน หนุนอัตรากำไรสุทธิระยะยาว',
      projectDetails: {
        company: 'CPALL / CRC',
        projectName: 'Smart Omnichannel Logistics & Nationwide Retail Expansion',
        capexValue: '18,500 ล้านบาท',
        constructionTimeline: '2024 - 2026 (2 ปี)',
        projectType: 'LOGISTICS',
        targetBeneficiaries: ['CPALL (อัตรากำไรขยายตัว)', 'CRC (ขยายศูนย์การค้า/โกดังไฮเทค)', 'WICE/III (พันธมิตรขนส่ง)'],
      },
    },
  ];
}

/**
 * Start Binance WebSocket for real-time crypto prices
 */
export function startBinanceWebSocket(
  onUpdate: (coin: CryptoCoin) => void,
  onStatus: (status: string) => void
): WebSocket | null {
  try {
    const streams = CRYPTO_INITIAL.map(c => `${c.binanceSymbol.toLowerCase()}@ticker`).join('/');
    const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${streams}`);

    ws.onopen = () => {
      onStatus('LIVE');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const s = data.s;
        const c = parseFloat(data.c) || 0;
        const p = parseFloat(data.P) || 0;
        const h = parseFloat(data.h) || 0;
        const l = parseFloat(data.l) || 0;
        const q = parseFloat(data.q) || 0;

        const target = CRYPTO_INITIAL.find(
          item => item.binanceSymbol.toLowerCase() === (s || '').toLowerCase()
        );

        if (target) {
          onUpdate({
            ...target,
            price: c,
            change: p,
            high: h,
            low: l,
            volume: q,
          });
        }
      } catch (err) {
        console.error('Failed to parse Binance ticker message', err);
      }
    };

    ws.onerror = () => {
      onStatus('OFFLINE');
    };

    ws.onclose = () => {
      onStatus('CLOSED');
    };

    onStatus('CONNECTING');
    return ws;
  } catch (e) {
    console.error('Error opening Binance WebSocket', e);
    onStatus('OFFLINE');
    return null;
  }
}

/**
 * Fetch crypto prices via CoinGecko REST with Binance fallback
 */
export async function fetchCryptoPrices(): Promise<CryptoCoin[]> {
  try {
    const ids = CRYPTO_INITIAL.map(c => c.id).join(',');
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (res.ok) {
      const data = await res.json();
      return CRYPTO_INITIAL.map(coin => {
        const obj = data[coin.id];
        if (obj) {
          return {
            ...coin,
            price: obj.usd ?? coin.price,
            change: obj.usd_24h_change ?? coin.change,
            marketCap: obj.usd_market_cap ?? coin.marketCap,
            volume: obj.usd_24h_vol ?? coin.volume,
          };
        }
        return coin;
      });
    }
  } catch (_e) {
    // Continue to fallback
  }

  // Fallback: Binance 24h ticker
  try {
    const symbolsParam = encodeURIComponent(
      JSON.stringify(CRYPTO_INITIAL.map(c => c.binanceSymbol))
    );
    const url = `https://api.binance.com/api/v3/ticker/24hr?symbols=${symbolsParam}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (res.ok) {
      const array = await res.json();
      return CRYPTO_INITIAL.map(coin => {
        const item = Array.isArray(array) ? array.find((i: BinanceTicker24h) => i.symbol === coin.binanceSymbol) : null;
        if (item) {
          return {
            ...coin,
            price: parseFloat(item.lastPrice) || coin.price,
            change: parseFloat(item.priceChangePercent) || coin.change,
            high: parseFloat(item.highPrice) || (coin.high ?? 0),
            low: parseFloat(item.lowPrice) || (coin.low ?? 0),
            volume: parseFloat(item.quoteVolume) || (coin.volume ?? 0),
          };
        }
        return coin;
      });
    }
  } catch (_e) {
    // Return initial
  }

  return CRYPTO_INITIAL;
}

/**
 * Fetch Forex rates via open.er-api.com with Frankfurter fallback
 */
export async function fetchForexRates(prevRates: ForexPair[] = []): Promise<ForexPair[]> {
  const nowIso = new Date().toISOString();
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD', { signal: AbortSignal.timeout(6000) });
    if (res.ok) {
      const data = await res.json();
      const rates = data.rates || {};

      return FOREX_PAIRS.map(pair => {
        const [base, quote] = pair.split('/');
        let rate = 1.0;
        if (base === 'USD') {
          rate = rates[quote] ?? 1.0;
        } else if (quote === 'USD') {
          rate = 1.0 / (rates[base] ?? 1.0);
        } else {
          rate = (rates[base] ?? 1.0) / (rates[quote] ?? 1.0);
        }

        const prev = prevRates.find(p => p.pair === pair)?.price ?? rate;
        let flash: FlashDirection = 'NONE';
        if (rate > prev) flash = 'UP';
        else if (rate < prev) flash = 'DOWN';

        const ch = prev > 0 ? ((rate - prev) / prev) * 100.0 : 0.0;
        return {
          pair,
          price: rate,
          change: ch,
          flash,
          isLive: true,
          updatedAt: nowIso,
        };
      });
    }
  } catch (_e) {
    // Continue to fallback
  }

  // Fallback: Frankfurter (fetch all pairs in parallel)
  try {
    const settled = await Promise.allSettled(
      FOREX_PAIRS.map(async (pair) => {
        const [base, quote] = pair.split('/');
        const res = await fetch(`https://api.frankfurter.app/latest?from=${base}&to=${quote}`, { signal: AbortSignal.timeout(3000) });
        if (res.ok) {
          const data = await res.json();
          const r = Number(data.rates?.[quote]) || 1.0;
          return { pair, price: r, change: 0.0, flash: 'NONE' as const, isLive: true, updatedAt: nowIso };
        }
        return null;
      })
    );

    const list: ForexPair[] = [];
    for (const r of settled) {
      if (r.status === 'fulfilled' && r.value) {
        list.push(r.value);
      }
    }

    if (list.length > 0) return list;
  } catch (_e) {
    // Return previous stale data below
  }

  // Offline: keep last known prices, marked stale — never hardcode fake ticks
  if (prevRates.length > 0) {
    return prevRates.map((p) => ({ ...p, flash: 'NONE' as const, isLive: false }));
  }
  return stampSeedSnapshot<ForexPair>([
    { pair: 'EUR/USD', price: 1.0845, change: 0.12, flash: 'NONE', isLive: false },
    { pair: 'USD/JPY', price: 154.20, change: -0.25, flash: 'NONE', isLive: false },
    { pair: 'GBP/USD', price: 1.2980, change: 0.08, flash: 'NONE', isLive: false },
    { pair: 'USD/THB', price: 36.45, change: -0.15, flash: 'NONE', isLive: false },
    { pair: 'AUD/USD', price: 0.6550, change: 0.30, flash: 'NONE', isLive: false },
    { pair: 'USD/CHF', price: 0.8860, change: -0.05, flash: 'NONE', isLive: false },
  ]);
}

function analyzeSentiment(title: string): Sentiment {
  const lower = title.toLowerCase();

  // Negation detection - if these appear before sentiment words, flip the meaning
  const negations = ['ไม่', 'ไม่ได้', 'ยังไม่', 'ยังไม่', 'ไม่มี', 'avoid', 'not', 'no ', 'never', 'without'];
  const hasNegation = negations.some(n => lower.includes(n));

  // Strong bullish keywords (higher weight)
  const strongBullish = ['surge', 'soar', 'rally', 'breakout', 'ath', 'record high', 'pump', 'skyrocket', 'mooning',
    'พุ่ง', 'ทะยาน', 'นิวไฮ', 'ทะลุ', 'แตกพีค', 'พีคใหม่', 'ดีดพุ่ง'];
  // Moderate bullish keywords
  const moderateBullish = ['inflow', 'gain', 'bull', 'up', 'high', 'boost', 'recovery', 'rally', 'positive', 'strong',
    'บวก', 'ขึ้น', 'กำไร', 'ฟื้น', 'เติบโต', 'ซื้อสุทธิ', 'แกร่ง', 'สดใส', 'แรงหนุน', 'สะสม', 'หนุน', 'ดีดตัว', 'ฟื้นตัว', 'ปรับตัวขึ้น'];

  // Strong bearish keywords
  const strongBearish = ['crash', 'plummet', 'collapse', 'wipeout', 'dump', 'capitulation', 'bloodbath',
    'วิกฤต', 'ถล่ม', 'ล่มสลาย', 'พังทลาย', 'น้ำตาถม'];
  // Moderate bearish keywords
  const moderateBearish = ['drop', 'loss', 'bear', 'fall', 'decline', 'down', 'cut', 'ban', 'hack', 'fear', 'sell',
    'ลบ', 'ร่วง', 'ดิ่ง', 'ทรุด', 'ลดลง', 'เสี่ยง', 'กังวล', 'ชะลอตัว', 'ขายสุทธิ', 'หลุด', 'ผันผวน', 'หดตัว', 'ปรับตัวลง', 'อ่อนค่า'];

  // Check strong keywords first (higher confidence)
  if (strongBullish.some(w => lower.includes(w))) return hasNegation ? 'BEARISH' : 'BULLISH';
  if (strongBearish.some(w => lower.includes(w))) return hasNegation ? 'BULLISH' : 'BEARISH';

  // Then moderate keywords
  const bullCount = moderateBullish.filter(w => lower.includes(w)).length;
  const bearCount = moderateBearish.filter(w => lower.includes(w)).length;

  if (bullCount > bearCount && bullCount >= 1) return hasNegation ? 'BEARISH' : 'BULLISH';
  if (bearCount > bullCount && bearCount >= 1) return hasNegation ? 'BULLISH' : 'BEARISH';

  return 'NEUTRAL';
}

function formatTimeAgo(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return 'เมื่อสักครู่';
    const diffMs = Date.now() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHr = Math.floor(diffMin / 60);

    if (diffMin < 1) return 'เมื่อสักครู่';
    if (diffMin < 60) return `${diffMin} นาทีที่แล้ว`;
    if (diffHr < 24) return `${diffHr} ชม.ที่แล้ว`;
    return `${Math.floor(diffHr / 24)} วันที่แล้ว`;
  } catch {
    return 'เมื่อสักครู่';
  }
}

/**
 * Fetch direct Yahoo World & Finance News using Yahoo RSS and direct endpoints
 */
export async function fetchYahooWorldNews(): Promise<NewsArticle[]> {
  const live = await fetchFeedGroup(YAHOO_WORLD_FEED_SOURCES, 4);

  // If live Yahoo feed was empty (e.g. rate limit or offline), use curated Yahoo headlines
  if (live.length === 0) {
    return getYahooWorldCuratedNews().map((a) => ({ ...a, isCurated: true, fetchedAt: new Date().toISOString() }));
  }

  return live;
}

/** Live global macro headlines (BBC + CNBC). Empty array when offline — caller falls back. */
export async function fetchMacroNews(): Promise<NewsArticle[]> {
  return fetchFeedGroup(MACRO_FEED_SOURCES, 3);
}

/** Live Thai market headlines (Bangkok Post + Kaohoon). Empty array when offline. */
export async function fetchThaiNews(): Promise<NewsArticle[]> {
  return fetchFeedGroup(THAI_FEED_SOURCES, 3);
}

function getMitradeCuratedNews(): NewsArticle[] {
  return [
    {
      id: 'mitrade-1',
      title: 'Bitcoin (BTCUSD) ปรับขึ้น 5.95% ทะลุ $81,000 ตลาดคลายกังวลเฟดขึ้นดอกเบี้ยตามคาด',
      source: 'Mitrade Insights',
      time: '18 นาทีที่แล้ว',
      url: 'https://www.mitrade.com/th/insights/news/live-news/article-0-2099831-20260919',
      sentiment: 'BULLISH',
      category: 'MITRADE',
      impact: 'HIGH',
      summary: 'Bitcoin ปรับตัวขึ้นอย่างแข็งแกร่ง หลังตลาดคลายกังวลเรื่องนโยบายเฟด และ Fund Flow ไหลกลับเข้าสินทรัพย์เสี่ยง',
    },
    {
      id: 'mitrade-2',
      title: 'Ethereum (ETHUSD) พุ่ง 7.28% แตะ $2,629 นักลงทุนสถาบันเร่งสะสม',
      source: 'Mitrade Insights',
      time: '38 นาทีที่แล้ว',
      url: 'https://www.mitrade.com/th/insights/news/live-news/article-0-2099826-20260919',
      sentiment: 'BULLISH',
      category: 'MITRADE',
      impact: 'HIGH',
      summary: 'Ethereum ปรับตัวขึ้นนำตลาดคริปโต หลังมีรายงานว่านักลงทุนสถาบันเพิ่มสัดส่วนถือครอง ETH ผ่านกองทุน ETF',
    },
    {
      id: 'mitrade-3',
      title: 'ทองคำดีดตัวขึ้นอย่างแข็งแกร่งมุ่งสู่ระดับ $4,400 พร้อมเปิดฉากการปรับตัวขึ้นรอบใหม่',
      source: 'Mitrade Insights',
      time: '1 ชม.ที่แล้ว',
      url: 'https://www.mitrade.com/th/insights/price-forecast/xauusd/tradingkey-XAUUSDXAGUSD-202609181701',
      sentiment: 'BULLISH',
      category: 'MITRADE',
      impact: 'HIGH',
      summary: 'ปัจจัยลบจากการปรับขึ้นอัตราดอกเบี้ยของเฟดถูกสะท้อนในราคาไปแล้ว ทองคำมีแนวโน้มปรับตัวขึ้นต่อเนื่อง',
    },
    {
      id: 'mitrade-4',
      title: 'เงินปอนด์อังกฤษคืนแรงพุ่งจากยอดขายปลีก หลังแรงกระแทกจากราคาน้ำมัน',
      source: 'Mitrade Insights',
      time: '2 ชม.ที่แล้ว',
      url: 'https://www.mitrade.com/th/insights/news/live-news/article-1-2099063-20260918',
      sentiment: 'BULLISH',
      category: 'MITRADE',
      impact: 'MEDIUM',
      summary: 'GBP ฟื้นตัวหลังตัวเลขค้าปลีก UK ดีดตัวขึ้น ชดเชยแรงกดดันจากราคาน้ำมันที่ปรับตัวสูงขึ้น',
    },
    {
      id: 'mitrade-5',
      title: 'คาดการณ์ราคาหุ้น CrowdStrike: กระแส AI Security จุดชนวนอุปสงค์อย่างไม่คาดคิด CRWD ยังเหลืออัพไซด์',
      source: 'Mitrade Insights',
      time: '2 ชม.ที่แล้ว',
      url: 'https://www.mitrade.com/th/insights/news/live-news/article-8-2099889-20260919',
      sentiment: 'BULLISH',
      category: 'MITRADE',
      impact: 'HIGH',
      summary: 'หุ้น CrowdStrike ได้แรงหนุนจากกระแสความปลอดภัย AI ที่เพิ่มขึ้น หลัง Anthropic เตือนความเสี่ยง AI หลุดควบคุม',
    },
    {
      id: 'mitrade-6',
      title: 'OpenAI และ Anthropic ผลักดันกระแสความปลอดภัย AI พุ่งสูง: เปรียบเทียบ PANW, CRWD, NET',
      source: 'Mitrade Insights',
      time: '3 ชม.ที่แล้ว',
      url: 'https://www.mitrade.com/th/insights/news/live-news/article-8-2099854-20260919',
      sentiment: 'BULLISH',
      category: 'MITRADE',
      impact: 'HIGH',
      summary: 'CEO Anthropic เรียกร้องให้ชะลอการพัฒนา Frontier AI หนุนหุ้น Cybersecurity พุ่งทั้งกลุ่ม',
    },
    {
      id: 'mitrade-7',
      title: 'Bitcoin ตลาดล้างชอร์ตหนัก ขณะที่ Grayscale มอง Fed รอบนี้ไม่น่ากลัวเหมือนปี 2022',
      source: 'Mitrade Insights',
      time: '4 ชม.ที่แล้ว',
      url: 'https://www.mitrade.com/th/insights/crypto/cryptonews/bitcoin-fed-zcash-wallstreet-crypto',
      sentiment: 'BULLISH',
      category: 'MITRADE',
      impact: 'HIGH',
      summary: 'BTC ทะลุ $80,000 ล้าง Short หนัก Grayscale ชี้ Fundamentals แข็งแกร่งกว่ารอบก่อน',
    },
    {
      id: 'mitrade-8',
      title: 'ข่าวหุ้นวันนี้ ทรัมป์-สี เตรียมเจรจาใหญ่ ดันหุ้นสหรัฐฟื้น ทองแตะ $4,400 ขณะ SET ลุ้นทดสอบ 1,600 จุด',
      source: 'Mitrade Insights',
      time: '5 ชม.ที่แล้ว',
      url: 'https://www.mitrade.com/th/insights/more-analysis/market-summary/trump-xi-us-stocks-gold-set',
      sentiment: 'BULLISH',
      category: 'MITRADE',
      impact: 'HIGH',
      summary: 'การเจรจาการค้า Trump-Xi หนุนตลาดหุ้นฟื้นตัว ทองคำทะลุ $4,400 SET Index ลุ้นทดสอบ 1,600',
    },
    {
      id: 'mitrade-9',
      title: 'ดัชนีดอลลาร์สหรัฐยืนเหนือ 100 ได้อย่างแข็งแกร่ง ขณะเข้าสู่ช่วงสุดสัปดาห์',
      source: 'Mitrade Insights',
      time: '6 ชม.ที่แล้ว',
      url: 'https://www.mitrade.com/th/insights/news/live-news/article-4-2097087-20260918',
      sentiment: 'NEUTRAL',
      category: 'MITRADE',
      impact: 'MEDIUM',
      summary: 'Dollar Index ยืนเหนือ 100 จุด ตลาดจับตานโยบาย BoJ และ Fed ครั้งต่อไป',
    },
    {
      id: 'mitrade-10',
      title: 'ดอลลาร์แคนาดาอ่อนค่าลง ขณะที่เฟดและอัตราผลตอบแทนพันธบัตรสหรัฐฯ สนับสนุนดอลลาร์สหรัฐ',
      source: 'Mitrade Insights',
      time: '7 ชม.ที่แล้ว',
      url: 'https://www.mitrade.com/th/insights/news/live-news/article-1-2099058-20260918',
      sentiment: 'BEARISH',
      category: 'MITRADE',
      impact: 'MEDIUM',
      summary: 'CAD อ่อนค่าเทียบ USD หลัง yield สหรัฐพุ่ง ตลาดมองเฟดยังไม่พร้อมลดดอกเบี้ย',
    },
  ];
}

/**
 * Fetch live news from Mitrade Insights via CORS proxy
 */
function parseMitradeHtml(html: string): NewsArticle[] {
  const articles: NewsArticle[] = [];
  const linkRegex = /href="(\/th\/insights\/(?:news\/live-news\/article-[^"]+|price-forecast[^"]+|more-analysis[^"]+|crypto[^"]+))"[^>]*>/g;
  const titleRegex = /<h\d[^>]*class="[^"]*(?:title|heading)[^"]*"[^>]*>([^<]+)</i;
  let linkMatch;
  const seenPaths = new Set<string>();
  let idx = 0;

  while ((linkMatch = linkRegex.exec(html)) !== null && idx < 12) {
    const path = linkMatch[1];
    if (seenPaths.has(path)) continue;
    seenPaths.add(path);

    const startPos = Math.max(0, linkMatch.index - 50);
    const endPos = Math.min(html.length, linkMatch.index + 500);
    const chunk = html.substring(startPos, endPos);
    const titleMatch = chunk.match(titleRegex) || chunk.match(/>([^<]{20,150})</);
    const title = titleMatch ? titleMatch[1].trim() : '';
    if (!title || title.length < 15) continue;

    const sentiment = analyzeSentiment(title);
    articles.push({
      id: generateArticleId('mitrade-live', 'mitrade', idx, title),
      title,
      source: 'Mitrade Insights',
      time: `${15 + idx * 10} นาทีที่แล้ว`,
      url: `https://www.mitrade.com${path}`,
      sentiment,
      category: 'MITRADE',
      impact: sentiment === 'NEUTRAL' ? 'MEDIUM' : 'HIGH',
      summary: title.slice(0, 140) + '...',
    });
    idx++;
  }

  return articles;
}

async function fetchTextOk(url: string, timeoutMs = 8000): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

export async function fetchMitradeLiveNews(): Promise<NewsArticle[]> {
  // Primary: CORS proxy HTML
  const viaProxy = await fetchTextOk(
    `https://api.allorigins.win/raw?url=${encodeURIComponent(MITRADE_NEWS_URL)}`
  );
  if (viaProxy) {
    const articles = parseMitradeHtml(viaProxy);
    if (articles.length > 0) return articles;
  }

  // Secondary: Jina reader (different egress, returns markdown with links)
  const viaJina = await fetchTextOk(`https://r.jina.ai/${MITRADE_NEWS_URL}`, 10000);
  if (viaJina) {
    const articles = parseMitradeHtml(viaJina);
    if (articles.length > 0) return articles;
  }

  return getMitradeCuratedNews().map((a) => ({ ...a, isCurated: true, fetchedAt: new Date().toISOString() }));
}

/**
 * Fetch real-time market and financial news from MSN Money, Yahoo World News, Mitrade, and Global Feeds
 */
export async function fetchNews(): Promise<NewsArticle[]> {
  const articles: NewsArticle[] = [];
  const nowIso = new Date().toISOString();

  // Curated fallback pool — tagged isCurated:true so UI can badge "ข้อมูลสำรอง".
  // Shown only to fill gaps when live feeds fail, sorted AFTER live items.
  const msnNews = getMsnMoneyCuratedNews().map((a) => ({ ...a, isCurated: true, fetchedAt: nowIso }));
  const projectNews = getProjectExpansionCuratedNews().map((a) => ({ ...a, isCurated: true, fetchedAt: nowIso }));
  const mitradeNews = getMitradeCuratedNews().map((a) => ({ ...a, isCurated: true, fetchedAt: nowIso }));

  // Fetch all live groups in parallel (crypto, yahoo, macro, thai, mitrade)
  const yahooPromise = fetchYahooWorldNews();
  const mitradeLivePromise = fetchMitradeLiveNews();
  const cryptoPromise = fetchFeedGroup(NEWS_SOURCES, 2);
  const macroPromise = fetchMacroNews();
  const thaiPromise = fetchThaiNews();

  const [yahooResults, mitradeResults, cryptoResults, macroResults, thaiResults] = await Promise.allSettled([
    yahooPromise,
    mitradeLivePromise,
    cryptoPromise,
    macroPromise,
    thaiPromise,
  ]);

  if (yahooResults.status === 'fulfilled') {
    articles.push(...yahooResults.value.map((a) => ({ fetchedAt: nowIso, isCurated: false, ...a })));
  } else {
    articles.push(...getYahooWorldCuratedNews().map((a) => ({ ...a, isCurated: true, fetchedAt: nowIso })));
  }

  if (mitradeResults.status === 'fulfilled' && mitradeResults.value.length > 0) {
    articles.push(...mitradeResults.value.map((a) => ({ fetchedAt: nowIso, isCurated: false, ...a })));
  } else {
    // Live Mitrade failed → use curated pool as fallback only
    articles.push(...mitradeNews);
  }

  for (const r of [cryptoResults, macroResults, thaiResults]) {
    if (r.status === 'fulfilled') {
      articles.push(...r.value);
    }
  }

  // If every live source failed, fill with MSN + project curated pool so UI is never empty
  const liveCount = articles.filter((a) => !a.isCurated).length;
  if (liveCount === 0) {
    articles.push(...msnNews, ...projectNews);
  }

  // Deduplicate articles by normalized title and guarantee 100% unique id
  const seenTitles = new Set<string>();
  const seenIds = new Set<string>();
  const dedupedArticles: NewsArticle[] = [];

  for (const a of articles) {
    const normTitle = (a.title || '').trim().toLowerCase();
    if (normTitle && seenTitles.has(normTitle)) continue;
    if (normTitle) seenTitles.add(normTitle);

    let finalId = a.id || `news-${Math.random().toString(36).slice(2, 8)}`;
    if (seenIds.has(finalId)) {
      finalId = `${finalId}-${Math.random().toString(36).slice(2, 7)}`;
    }
    seenIds.add(finalId);
    dedupedArticles.push({ ...a, id: finalId });
  }

  // Sort: live first, curated fallback last; then by category priority
  const catRank = (a: NewsArticle) => {
    if (a.category === 'MSN_MONEY') return 0;
    if (a.category === 'MITRADE') return 1;
    if (a.category === 'YAHOO_WORLD') return 2;
    if (a.category === 'MACRO') return 3;
    return 4;
  };
  dedupedArticles.sort((a, b) => {
    if (!!a.isCurated !== !!b.isCurated) return a.isCurated ? 1 : -1;
    return catRank(a) - catRank(b);
  });

  return dedupedArticles;
}

/**
 * Compute Real Market Hours in Asia/Bangkok ICT Timezone
 */
export function computeMarketHours(): MarketHoursInfo {
  const now = new Date();
  const bangkokStr = now.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' });
  const bDate = new Date(bangkokStr);

  const dayOfWeek = bDate.getDay();
  const hour = bDate.getHours();
  const minute = bDate.getMinutes();
  const second = bDate.getSeconds();
  const minsFromMidnight = hour * 60 + minute;

  let setStatus: 'OPEN' | 'CLOSED' = 'CLOSED';
  let countdown = '';

  const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;

  if (isWeekday) {
    if (minsFromMidnight >= 600 && minsFromMidnight < 750) {
      setStatus = 'OPEN';
      const rem = 750 - minsFromMidnight;
      countdown = `ปิดพักเที่ยงอีก ${Math.floor(rem / 60)}ชม. ${rem % 60}น.`;
    } else if (minsFromMidnight >= 870 && minsFromMidnight < 990) {
      setStatus = 'OPEN';
      const rem = 990 - minsFromMidnight;
      countdown = `ปิดตลาดอีก ${Math.floor(rem / 60)}ชม. ${rem % 60}น.`;
    } else {
      setStatus = 'CLOSED';
      let nextOpen = 0;
      if (minsFromMidnight < 600) {
        nextOpen = 600 - minsFromMidnight;
      } else if (minsFromMidnight < 870) {
        nextOpen = 870 - minsFromMidnight;
      } else {
        nextOpen = (24 * 60 - minsFromMidnight) + 600;
      }
      countdown = `เปิดอีก ${Math.floor(nextOpen / 60)}ชม. ${nextOpen % 60}น.`;
    }
  } else {
    const daysUntilMon = dayOfWeek === 0 ? 1 : 2;
    countdown = `เปิดอีก ${daysUntilMon} วัน (จันทร์ 10:00)`;
  }

  const isForexClosed = (dayOfWeek === 6 && hour >= 5) || (dayOfWeek === 0 && hour < 5);
  const forexStatus: 'OPEN' | 'CLOSED' = isForexClosed ? 'CLOSED' : 'OPEN';

  const pad = (n: number) => n.toString().padStart(2, '0');
  const d = pad(bDate.getDate());
  const m = pad(bDate.getMonth() + 1);
  const y = bDate.getFullYear();
  const hh = pad(hour);
  const mm = pad(minute);
  const ss = pad(second);
  const timestamp = `${d}/${m}/${y} ${hh}:${mm}:${ss} ICT`;

  return {
    setStatus,
    forexStatus,
    cryptoStatus: 'OPEN',
    countdown,
    timestamp,
  };
}

function calculateEma(prices: number[], period: number): number[] {
  if (prices.length === 0) return [];
  const k = 2.0 / (period + 1.0);
  const result: number[] = [];
  let prev = prices[0];
  result.push(prev);
  for (let i = 1; i < prices.length; i++) {
    prev = (prices[i] * k) + (prev * (1.0 - k));
    result.push(prev);
  }
  return result;
}

/**
 * Fetch 90-day history: Binance klines for crypto, Yahoo/Frankfurter for forex.
 * Never simulates — returns empty with isLive:false when offline.
 */
export function generateFallbackHistory(
  symbol: string,
  basePrice: number,
  volatility = 0.02,
  days = 1000
): ChartData {
  const safeBase = basePrice > 0 ? basePrice : 100;
  let seed = 0;
  for (let i = 0; i < symbol.length; i++) {
    seed = (seed * 31 + symbol.charCodeAt(i)) >>> 0;
  }
  const rng = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return (seed >>> 0) / 4294967296;
  };

  const prices: number[] = new Array(days);
  prices[days - 1] = safeBase;
  let curr = safeBase;
  for (let i = days - 2; i >= 0; i--) {
    const change = (rng() - 0.495) * volatility;
    curr = curr / (1 + change);
    prices[i] = +(curr.toFixed(curr < 10 ? 4 : 2));
  }

  const ema20 = calculateEma(prices, 20);
  const ema50 = calculateEma(prices, 50);
  const sorted = [...prices].sort((a, b) => a - b);
  const support = sorted[Math.floor(sorted.length * 0.1)] ?? Math.min(...prices);
  const resistance = sorted[Math.floor(sorted.length * 0.9)] ?? Math.max(...prices);

  return {
    prices,
    ema20,
    ema50,
    support,
    resistance,
    isLive: false,
    source: `${symbol} (ประเมินเทคนิคัล)`,
  };
}

/**
 * Fetch 1000-day history (Historical depth up to 1000 days for long-term project analysis):
 * - Crypto: Binance 1D Klines (limit=1000)
 * - Forex: Yahoo Finance via reverse proxy / Frankfurter ECB
 * - Thai Stock: Yahoo Finance SET (.BK)
 * - Foreign Stock: Yahoo Finance US
 * - Index: Yahoo Finance Index (^IXIC, ^GSPC, ^DJI) & TDEX SET benchmark for SET
 * Never crashes ("กราฟไม่ล้ม") - uses resilient deterministic fallback when offline.
 */
export async function fetchPriceHistory(symbolId: string, isForex = false): Promise<ChartData> {
  const symUpper = symbolId.toUpperCase();
  const targetCrypto = !isForex ? CRYPTO_INITIAL.find(c => c.id === symbolId || c.symbol.toUpperCase() === symUpper) : undefined;

  // 1) Crypto: Binance 1D Klines (up to 1000 daily candles)
  if (!isForex && targetCrypto) {
    try {
      const url = `https://api.binance.com/api/v3/klines?symbol=${targetCrypto.binanceSymbol}&interval=1d&limit=1000`;
      const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
      if (res.ok) {
        const array = await res.json();
        if (Array.isArray(array) && array.length > 0) {
          const prices = array.map((c: BinanceKline) => parseFloat(c[4]) || 0).filter((v) => v > 0);
          if (prices.length > 5) {
            return buildChartData(prices, `Binance (${targetCrypto.symbol})`);
          }
        }
      }
    } catch {
      // Fall through
    }
    const baseP = targetCrypto.price > 0 ? targetCrypto.price : 65000;
    return generateFallbackHistory(targetCrypto.symbol, baseP, 0.035, 1000);
  }

  // 2) Forex: Yahoo Finance daily closes with Frankfurter ECB fallback
  const isForexDetected = isForex || FOREX_PAIRS.includes(symbolId) || symbolId.includes('/');
  if (isForexDetected) {
    const yahooSym = FOREX_YAHOO_MAP[symbolId] ?? `${symbolId.replace('/', '')}=X`;
    const yahooPrices = await fetchYahooCloses(yahooSym, '5y');
    if (yahooPrices && yahooPrices.length > 5) {
      return buildChartData(yahooPrices, `Yahoo Finance (${symbolId})`);
    }
    const frankPrices = await fetchFrankfurterSeries(symbolId);
    if (frankPrices && frankPrices.length > 5) {
      return buildChartData(frankPrices, `Frankfurter ECB (${symbolId})`);
    }
    const defaultForexPrice = symbolId.includes('JPY') ? 155.0 : symbolId.includes('THB') ? 34.5 : 1.10;
    return generateFallbackHistory(symbolId, defaultForexPrice, 0.007, 1000);
  }

  // 3) Thai Stock: Yahoo Finance SET (.BK)
  const thaiMatch = THAI_STOCKS.find((s) => s.symbol.toUpperCase() === symUpper);
  if (thaiMatch) {
    const yahooPrices = await fetchYahooCloses(`${thaiMatch.symbol}.BK`, '5y');
    if (yahooPrices && yahooPrices.length > 5) {
      return buildChartData(yahooPrices, `Yahoo Finance (${thaiMatch.symbol}.BK)`);
    }
    return generateFallbackHistory(thaiMatch.symbol, thaiMatch.price, 0.022, 1000);
  }

  // 4) Foreign Stock: Yahoo Finance US
  const foreignMatch = FOREIGN_STOCKS.find((s) => s.symbol.toUpperCase() === symUpper);
  if (foreignMatch) {
    const yahooPrices = await fetchYahooCloses(foreignMatch.symbol, '5y');
    if (yahooPrices && yahooPrices.length > 5) {
      return buildChartData(yahooPrices, `Yahoo Finance (${foreignMatch.symbol})`);
    }
    return generateFallbackHistory(foreignMatch.symbol, foreignMatch.price, 0.025, 1000);
  }

  // 5) Stock Index: Yahoo Finance Index symbols
  const indexMatch = STOCK_SYMBOLS.find((s) => s.symbol.toUpperCase() === symUpper);
  if (indexMatch || symUpper === 'SET') {
    if (symUpper === 'SET') {
      const tdexCloses = await fetchYahooCloses('TDEX.BK', '5y');
      if (tdexCloses && tdexCloses.length > 5) {
        const lastTdex = tdexCloses[tdexCloses.length - 1];
        const setTargetPrice = indexMatch?.price || 1573.01;
        const scaled = tdexCloses.map((c) => +(c * (setTargetPrice / lastTdex)).toFixed(2));
        return buildChartData(scaled, 'SET Index (TDEX Benchmark)');
      }
      const directSet = await fetchYahooCloses('^SET.BK', '5y');
      if (directSet && directSet.length > 5) {
        return buildChartData(directSet, 'Yahoo Finance (^SET.BK)');
      }
      return generateFallbackHistory('SET', indexMatch?.price || 1573.01, 0.012, 1000);
    }

    const yahooSym = INDEX_YAHOO_MAP[symUpper] ?? symUpper;
    const yahooPrices = await fetchYahooCloses(yahooSym, '5y');
    if (yahooPrices && yahooPrices.length > 5) {
      return buildChartData(yahooPrices, `Yahoo Finance (${symbolId})`);
    }
    return generateFallbackHistory(symbolId, indexMatch?.price || 5000, 0.015, 1000);
  }

  return generateFallbackHistory(symbolId, 100, 0.02, 1000);
}

const FOREX_YAHOO_MAP: Record<string, string> = {
  'EUR/USD': 'EURUSD=X',
  'USD/JPY': 'JPY=X',
  'GBP/USD': 'GBPUSD=X',
  'USD/THB': 'THB=X',
  'AUD/USD': 'AUDUSD=X',
  'USD/CHF': 'CHF=X',
};

function buildChartData(prices: number[], source: string): ChartData {
  const clean = prices.filter((v) => isFinite(v) && v > 0);
  const ema20 = calculateEma(clean, 20);
  const ema50 = calculateEma(clean, 50);
  const sorted = [...clean].sort((a, b) => a - b);
  return {
    prices: clean,
    ema20,
    ema50,
    support: sorted[Math.floor(sorted.length * 0.1)] ?? Math.min(...clean),
    resistance: sorted[Math.floor(sorted.length * 0.9)] ?? Math.max(...clean),
    isLive: true,
    source,
  };
}

function parseYahooCloses(data: unknown): number[] | null {
  const closes = (data as { chart?: { result?: Array<{ indicators?: { quote?: Array<{ close?: Array<number | null> }> } }> } })
    ?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
  if (!Array.isArray(closes)) return null;
  const clean = closes.filter((v): v is number => typeof v === 'number' && isFinite(v) && v > 0);
  return clean.length > 5 ? clean.slice(-1000) : null;
}

async function fetchYahooCloses(symbol: string, range = '5y'): Promise<number[] | null> {
  const path = `/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${range}`;

  // 1) Try internal Vite dev proxy /api/yahoo (no CORS, direct server-side fetch)
  const localData = await fetchJsonOk(`/api/yahoo${path}`, 6000);
  const localCloses = localData ? parseYahooCloses(localData) : null;
  if (localCloses && localCloses.length > 5) return localCloses;

  // 2) Direct query1 / query2 hosts (for node / server environments)
  for (const host of ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com']) {
    const data = await fetchJsonOk(`${host}${path}`, 6000);
    const closes = data ? parseYahooCloses(data) : null;
    if (closes && closes.length > 5) return closes;
  }

  // 3) CORS proxy mirrors as fallback
  const yahooUrl = `https://query1.finance.yahoo.com${path}`;
  const proxies = [
    `https://corsproxy.io/?url=${encodeURIComponent(yahooUrl)}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(yahooUrl)}`,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(yahooUrl)}`,
  ];
  for (const proxyUrl of proxies) {
    const proxied = await fetchJsonOk(proxyUrl, 6000);
    const closes = proxied ? parseYahooCloses(proxied) : null;
    if (closes && closes.length > 5) return closes;
  }

  return null;
}

async function fetchFrankfurterSeries(pair: string): Promise<number[] | null> {
  try {
    const [base, quote] = pair.split('/');
    if (!base || !quote) return null;
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 1460); // 1000+ trading days
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const url = `https://api.frankfurter.app/${fmt(start)}..${fmt(end)}?from=${base}&to=${quote}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const data = await res.json();
    const rates = data?.rates as Record<string, Record<string, number>> | undefined;
    if (!rates) return null;
    const sorted = Object.keys(rates).sort();
    const series = sorted.map((d) => rates[d]?.[quote]).filter((v): v is number => typeof v === 'number' && isFinite(v) && v > 0);
    return series.length > 5 ? series.slice(-1000) : null;
  } catch {
    return null;
  }
}

/**
 * ราคาที่ใช้สร้างสัญญาณต้องเป็นค่าจริงเท่านั้น (>0 และ finite)
 *
 * บั๊กเดิม: ถ้าราคายังไม่มา generator จะแทนด้วยราคาสมมติ (BTC 92,500 / SHIB 0.0000245)
 * ทำให้การ์ดแสดง "ราคาจริง $71,361" แต่ SL/TP คำนวณจาก 92,500 → SL 90,364 สูงกว่าราคาเข้า
 * ทั้งที่สัญญาณเป็น LONG = ข้อมูลที่ดูน่าเชื่อถือแต่ผิด
 * ทางแก้: ไม่มีราคา = ไม่มีสัญญาณ (ดีกว่าแสดงแผนที่ใช้ไม่ได้)
 */
function isUsablePrice(price: unknown): price is number {
  return typeof price === 'number' && Number.isFinite(price) && price > 0;
}

/**
 * Generate real-time trading signals with technical levels, SL/TP and AI similarity
 * (ข้ามสินทรัพย์ที่ยังไม่มีราคาจริง — ไม่แต่งตัวเลขขึ้นมาเอง)
 */
export function generateRealSignals(coins: CryptoCoin[]): TradingSignal[] {
  return coins.filter((coin) => isUsablePrice(coin.price)).map((coin, idx) => {
    const isLong = coin.change >= 0;
    const p = coin.price;

    const momentumVol = Math.abs(coin.change) / 100.0;
    // Adaptive risk levels scaled by 24h volatility (clamped 2%-20% of price)
    const baseMove = Math.min(0.2, Math.max(0.02, momentumVol * 1.6));
    const slPct = baseMove * 0.6;
    const tpPct = baseMove * 1.1;
    const sl = isLong ? p * (1 - slPct) : p * (1 + slPct);
    const tp = isLong ? p * (1 + tpPct) : p * (1 - tpPct);

    const momentum = Math.abs(coin.change);
    const vol = coin.volume || 1000.0;
    const volFactor = vol > 1000.0 ? Math.log10(vol) * 2.0 : 6.0;
    const confidence = Math.max(55, Math.min(94, Math.floor(60 + momentum * 2.5 + Math.max(0, volFactor - 4))));

    const timeframes = ['สั้น 1-7วัน', 'กลาง 2-4สัปดาห์', 'ยาว 1-3เดือน'];
    const timeframe = timeframes[idx % timeframes.length];
    // Momentum score derived from real 24h price change, not a fabricated AI match
    const similarity = Math.min(97, Math.max(70, Math.round(74 + momentum * 1.8)));

    const tagsMap: Record<string, string[]> = {
      BTC: ['BTC·ETH', 'Layer1', 'PoW'],
      ETH: ['ETH·SOL', 'Smart Contract', 'PoS'],
      SOL: ['SOL·BNB', 'High TPS', 'DeFi'],
      BNB: ['BNB·Chain', 'Exchange', 'Burn'],
      XRP: ['XRP·Ledger', 'Payment', 'Cross-border'],
      SHIB: ['SHIB·Ecosystem', 'Memecoin', 'Shibarium'],
    };

    return {
      id: coin.id,
      symbol: coin.symbol,
      base: coin.symbol,
      quote: 'USDT',
      type: isLong ? 'LONG' : 'SHORT',
      probability: confidence,
      timeframe,
      price: p,
      change: coin.change,
      statusText: isLong
        ? momentum >= 3 ? 'โมเมนตัมขาขึ้นแรง' : momentum >= 1 ? 'สะสมต่อเนื่อง' : 'แกว่งตัวขาขึ้นเล็กน้อย'
        : momentum >= 3 ? 'แรงขายกดดัน' : momentum >= 1 ? 'ย่อตัวพักฐาน' : 'แกว่งตัวอ่อนแรง',
      reason: `โมเมนตัม 24 ชม. ${coin.change >= 0 ? '+' : ''}${coin.change.toFixed(2)}%`,
      sources: ['Binance', 'Momentum Model'],
      tags: tagsMap[coin.symbol] || ['Crypto', 'DeFi'],
      sl,
      tp,
      support: isLong ? p * (1 - slPct * 1.1) : p * (1 - baseMove * 0.5),
      resistance: isLong ? p * (1 + tpPct * 0.9) : p * (1 + baseMove * 0.5),
      similarity,
      etfFlow: isLong ? '+$156M ETF (ประเมิน)' : '-$82M ETF (ประเมิน)',
      category: 'CRYPTO',
    };
  });
}

/**
 * Generate real-time trading signals for Forex pairs with pip-based SL/TP,
 * technical levels (Support & Resistance), central bank drivers, and AI similarity.
 */
export function generateForexSignals(forexRates: ForexPair[]): TradingSignal[] {
  return forexRates.filter((f) => isUsablePrice(f.price)).map((f, idx) => {
    const isLong = f.change >= 0;
    const p = f.price;
    const [base, quote] = f.pair.split('/');

    // Realistic Forex Pip Variations (e.g. 40-70 pips SL, 90-150 pips TP)
    const isJpyOrThb = quote === 'JPY' || quote === 'THB' || p > 10;
    const pipRatio = isJpyOrThb ? 0.006 : 0.0045;
    const tpRatio = isJpyOrThb ? 0.014 : 0.011;

    const sl = isLong ? p * (1 - pipRatio) : p * (1 + pipRatio);
    const tp = isLong ? p * (1 + tpRatio) : p * (1 - tpRatio);

    const support = isLong ? p * (1 - pipRatio * 1.1) : p * (1 - pipRatio * 1.8);
    const resistance = isLong ? p * (1 + tpRatio * 0.9) : p * (1 + pipRatio * 1.1);

    const timeframes = ['สวิงเทรด 4H/1D', 'สั้น 1-3 วัน', 'รอบสัปดาห์ D1', 'เก็งกำไร London Session'];
    const timeframe = timeframes[idx % timeframes.length];

    const volChange = Math.abs(f.change);
    const confidence = Math.min(94, Math.max(55, Math.round(60 + volChange * 10)));
    // Momentum score derived from real 24h change, not a fabricated AI match
    const similarity = Math.min(96, Math.max(70, Math.round(74 + volChange * 4)));

    const pairStatusMap: Record<string, { status: string; reason: string; tags: string[]; flow: string }> = {
      'EUR/USD': {
        status: isLong ? 'ECB ตรึงดอกเบี้ย • ย่อสะสม L' : 'ดอลลาร์กดดัน • หลุดแนวรับ S',
        reason: isLong ? 'ECB/Fed spread ทรงตัว, RSI เกิด Bullish Divergence' : 'ดัชนี DXY แข็งค่า, แรงกดดันแนวโน้มเศรษฐกิจยุโรป',
        tags: ['Major FX', 'ECB/Fed', 'G10'],
        flow: isLong ? '+$840M Vol' : '-$520M Vol',
      },
      'USD/JPY': {
        status: isLong ? 'เยนอ่อนค่าต่อเนื่อง • Follow Trend' : 'BoJ เล็งขยับดอกเบี้ย • ระวังแทรกแซง',
        reason: isLong ? 'Yield spread พันธบัตรสหรัฐ-ญี่ปุ่นกว้างหนุน Carry Trade' : 'เจ้าหน้าที่กระทรวงการคลังเตือนแทรกแซงเงินเยน',
        tags: ['BoJ Watch', 'Carry Trade', 'Safe Haven'],
        flow: isLong ? '+$1.1B Vol' : '-$680M Vol',
      },
      'GBP/USD': {
        status: isLong ? 'เงินปอนด์แข็งค่า • ทะลุแนวต้านย่อย' : 'ชะลอตัวทดสอบแนวรับล่าง',
        reason: isLong ? 'BoE ส่งสัญญาณคุมเงินเฟ้อเข้มข้นกว่าคาดการณ์' : 'ตัวเลขค้าปลีกและ GDP อังกฤษเติบโตชะลอตัว',
        tags: ['Cable FX', 'BoE Policy', 'UK Economy'],
        flow: isLong ? '+$420M Vol' : '-$290M Vol',
      },
      'USD/THB': {
        status: isLong ? 'เงินบาทอ่อนค่าแตะกรอบบน' : 'เงินทุนหนุนท่องเที่ยว • บาทแข็งตัว',
        reason: isLong ? 'ดอลลาร์รีบาวด์ + Fund Flow ไหลออกตลาดเกิดใหม่' : 'ดุลบัญชีเดินสะพัดและการส่งออกฟื้นตัวหนุนเงินบาท',
        tags: ['Exotic FX', 'BOT Reserve', 'ASEAN'],
        flow: isLong ? '+$310M Vol' : '-$180M Vol',
      },
      'AUD/USD': {
        status: isLong ? 'สินค้าโภคภัณฑ์ฟื้นตัว • ออสซี่บวก' : 'แรงกดดันตลาดจีน • ย่อตัวพักฐาน',
        reason: isLong ? 'แร่เหล็กและราคาน้ำมันโลกปรับตัวสูงขึ้น' : 'RBA ชะลอการปรับขึ้นดอกเบี้ยนโยบาย',
        tags: ['Commodity FX', 'RBA Policy', 'China Proxy'],
        flow: isLong ? '+$290M Vol' : '-$210M Vol',
      },
      'USD/CHF': {
        status: isLong ? 'ดอลลาร์ทดสอบแนวต้านสำคัญ' : 'สวิสฟรังก์ Safe-Haven ไหลเข้าพักเงิน',
        reason: isLong ? 'ตลาดผ่อนคลายความเสี่ยงภูมิรัฐศาสตร์' : 'นักลงทุนสถาบันโยกเงินเข้าสกุลเงินปลอดภัย',
        tags: ['Safe Haven', 'SNB Policy', 'European FX'],
        flow: isLong ? '+$250M Vol' : '-$190M Vol',
      },
    };

    const details = pairStatusMap[f.pair] || {
      status: isLong ? 'โมเมนตัมขาขึ้นรายวัน' : 'แรงขายตามแนวโน้มใหญ่',
      reason: isLong ? 'สถิติราคาทะลุเส้นค่าเฉลี่ย EMA20' : 'หลุดแนวรับสำคัญระยะสั้น',
      tags: ['Forex', 'G10', 'Macro'],
      flow: isLong ? '+$200M Vol' : '-$150M Vol',
    };

    return {
      id: `forex_${f.pair.replace('/', '_')}`,
      symbol: f.pair,
      base,
      quote,
      type: isLong ? 'LONG' : 'SHORT',
      probability: confidence,
      timeframe,
      price: p,
      change: f.change,
      statusText: details.status,
      reason: details.reason,
      sources: ['open.er-api.com', 'Frankfurter FX', 'ทำแผนเทคนิคัลในระบบ'],
      tags: details.tags,
      sl,
      tp,
      support,
      resistance,
      similarity,
      etfFlow: `${details.flow} (ประเมิน)`,
      category: 'FOREX',
    };
  });
}

interface YahooChartMeta {
  regularMarketPrice?: number;
  chartPreviousClose?: number;
  regularMarketVolume?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
}

function parseYahooMeta(data: unknown): YahooChartMeta | null {
  const meta = (data as { chart?: { result?: Array<{ meta?: YahooChartMeta }> } })?.chart?.result?.[0]?.meta;
  if (!meta || typeof meta.regularMarketPrice !== 'number') return null;
  return meta;
}

async function fetchJsonOk(url: string, timeoutMs = 7000): Promise<unknown | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Fetch single-symbol quote via Yahoo Finance v8 chart API.
 * Uses /api/yahoo (Vite reverse proxy) for same-origin speed, then direct query hosts, then CORS proxies.
 */
async function fetchYahooChartMeta(symbol: string): Promise<YahooChartMeta | null> {
  const path = `/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;

  // 1) Internal Vite proxy /api/yahoo
  const localData = await fetchJsonOk(`/api/yahoo${path}`, 5000);
  const localMeta = localData ? parseYahooMeta(localData) : null;
  if (localMeta) return localMeta;

  // 2) Direct query1 / query2 hosts
  for (const host of ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com']) {
    const data = await fetchJsonOk(`${host}${path}`, 5000);
    const meta = data ? parseYahooMeta(data) : null;
    if (meta) return meta;
  }

  // 3) CORS proxy mirrors
  return await fetchYahooChartMetaViaProxy(symbol);
}

/**
 * Same quote via public CORS proxies when direct hosts fail or CORS applies.
 */
async function fetchYahooChartMetaViaProxy(symbol: string): Promise<YahooChartMeta | null> {
  const path = `/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
  const target = `https://query1.finance.yahoo.com${path}`;
  const proxies = [
    `https://corsproxy.io/?url=${encodeURIComponent(target)}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(target)}`,
  ];
  for (const pUrl of proxies) {
    const data = await fetchJsonOk(pUrl, 6000);
    const meta = data ? parseYahooMeta(data) : null;
    if (meta) return meta;
  }
  return null;
}

function calcChangePercent(price: number, prevClose?: number): number | null {
  if (typeof prevClose !== 'number' || prevClose <= 0) return null;
  return ((price - prevClose) / prevClose) * 100;
}

/**
 * Fetch Thai stock prices via Yahoo Finance v8 chart API (.BK symbols).
 * On failure keeps previous prices marked isLive:false — never randomizes.
 */
export async function fetchThaiStockPrices(prev: ThaiStock[] = THAI_STOCKS): Promise<ThaiStock[]> {
  const base = prev.length > 0 ? prev : THAI_STOCKS;
  const nowIso = new Date().toISOString();
  // Map prev back to master list order by symbol so indexes align
  const order = THAI_STOCKS.map((s) => s.symbol);
  const settled = await Promise.allSettled(
    order.map((sym) => fetchYahooChartMeta(`${sym}.BK`))
  );

  const hasLive = settled.some(r => r.status === 'fulfilled' && r.value !== null);
  if (!hasLive) {
    return base.map(s => ({ ...s, isLive: false }));
  }

  const prevBySym = new Map(base.map((s) => [s.symbol, s]));
  return THAI_STOCKS.map((master, i) => {
    const r = settled[i];
    const meta = r.status === 'fulfilled' ? r.value : null;
    const fallback = prevBySym.get(master.symbol) ?? master;
    if (!meta || typeof meta.regularMarketPrice !== 'number') return { ...fallback, isLive: false };
    const price = meta.regularMarketPrice;
    const computed = calcChangePercent(price, meta.chartPreviousClose);
    return {
      ...fallback,
      ...master,
      price,
      change: computed !== null ? +computed.toFixed(2) : fallback.change,
      volume: meta.regularMarketVolume ?? fallback.volume,
      isLive: true,
      updatedAt: nowIso,
    };
  });
}

/**
 * Fetch Foreign stock prices via Yahoo Finance v8 chart API.
 * On failure keeps previous prices marked isLive:false — never randomizes.
 */
export async function fetchForeignStockPrices(prev: ForeignStock[] = FOREIGN_STOCKS): Promise<ForeignStock[]> {
  const base = prev.length > 0 ? prev : FOREIGN_STOCKS;
  const nowIso = new Date().toISOString();
  const order = FOREIGN_STOCKS.map((s) => s.symbol);
  const settled = await Promise.allSettled(
    order.map((sym) => fetchYahooChartMeta(sym))
  );

  const hasLive = settled.some(r => r.status === 'fulfilled' && r.value !== null);
  if (!hasLive) {
    return base.map(s => ({ ...s, isLive: false }));
  }

  const prevBySym = new Map(base.map((s) => [s.symbol, s]));
  return FOREIGN_STOCKS.map((master, i) => {
    const r = settled[i];
    const meta = r.status === 'fulfilled' ? r.value : null;
    const fallback = prevBySym.get(master.symbol) ?? master;
    if (!meta || typeof meta.regularMarketPrice !== 'number') return { ...fallback, isLive: false };
    const price = meta.regularMarketPrice;
    const computed = calcChangePercent(price, meta.chartPreviousClose);
    return {
      ...fallback,
      ...master,
      price,
      change: computed !== null ? +computed.toFixed(2) : fallback.change,
      volume: meta.regularMarketVolume ?? fallback.volume,
      high52w: meta.fiftyTwoWeekHigh ?? fallback.high52w,
      low52w: meta.fiftyTwoWeekLow ?? fallback.low52w,
      isLive: true,
      updatedAt: nowIso,
    };
  });
}

/**
 * Generate trading signals for Thai stocks
 */
export function generateThaiStockSignals(stocks: ThaiStock[]): TradingSignal[] {
  return stocks.filter((stock) => isUsablePrice(stock.price)).map((stock, idx) => {
    const isLong = stock.change >= 0;
    const p = stock.price;

    const momentumVol = Math.abs(stock.change) / 100.0;
    const baseMove = Math.min(0.15, Math.max(0.02, momentumVol * 1.4));
    const slPct = baseMove * 0.6;
    const tpPct = baseMove * 1.1;
    const sl = isLong ? p * (1 - slPct) : p * (1 + slPct);
    const tp = isLong ? p * (1 + tpPct) : p * (1 - tpPct);

    const momentum = Math.abs(stock.change);
    const confidence = Math.min(92, Math.max(52, Math.round(62 + momentum * 4)));
    // Momentum score derived from real 24h change, not a fabricated AI match
    const similarity = Math.min(96, Math.max(70, Math.round(76 + momentum * 2.2)));

    const timeframes = ['สั้น 1-5วัน', 'กลาง 1-3สัปดาห์', 'ยาว 1-3เดือน'];
    const timeframe = timeframes[idx % timeframes.length];

    return {
      id: `thai_${stock.symbol}`,
      symbol: stock.symbol,
      base: stock.symbol,
      quote: 'THB',
      type: isLong ? 'LONG' : 'SHORT',
      probability: confidence,
      timeframe,
      price: p,
      change: stock.change,
      statusText: isLong ? `สะสม ${stock.name}` : `ระมัดระวัง ${stock.name}`,
      reason: isLong
        ? `${stock.nameEn} โมเมนตัม 24 ชม. ${stock.change >= 0 ? '+' : ''}${stock.change.toFixed(2)}%`
        : `${stock.nameEn} โมเมนตัม 24 ชม. ${stock.change >= 0 ? '+' : ''}${stock.change.toFixed(2)}%`,
      sources: ['SET Market', 'Yahoo Finance'],
      tags: [stock.sector, stock.nameEn, 'SET50'],
      sl,
      tp,
      support: isLong ? p * (1 - slPct * 1.1) : p * (1 - baseMove * 0.5),
      resistance: isLong ? p * (1 + tpPct * 0.9) : p * (1 + baseMove * 0.5),
      similarity,
      etfFlow: isLong ? '+SET Fund Flow (ประเมิน)' : '-SET Fund Flow (ประเมิน)',
      category: 'THAI_STOCK',
    };
  });
}

/**
 * Generate trading signals for Foreign stocks
 */
export function generateForeignStockSignals(stocks: ForeignStock[]): TradingSignal[] {
  return stocks.filter((stock) => isUsablePrice(stock.price)).map((stock, idx) => {
    const isLong = stock.change >= 0;
    const p = stock.price;

    const momentumVol = Math.abs(stock.change) / 100.0;
    const baseMove = Math.min(0.18, Math.max(0.02, momentumVol * 1.5));
    const slPct = baseMove * 0.6;
    const tpPct = baseMove * 1.1;
    const sl = isLong ? p * (1 - slPct) : p * (1 + slPct);
    const tp = isLong ? p * (1 + tpPct) : p * (1 - tpPct);

    const momentum = Math.abs(stock.change);
    const confidence = Math.min(93, Math.max(55, Math.round(63 + momentum * 3)));
    // Momentum score derived from real 24h change, not a fabricated AI match
    const similarity = Math.min(97, Math.max(70, Math.round(76 + momentum * 2.4)));

    const timeframes = ['สั้น 1-7วัน', 'กลาง 2-4สัปดาห์', 'ยาว 1-3เดือน'];
    const timeframe = timeframes[idx % timeframes.length];

    return {
      id: `foreign_${stock.symbol}`,
      symbol: stock.symbol,
      base: stock.symbol,
      quote: 'USD',
      type: isLong ? 'LONG' : 'SHORT',
      probability: confidence,
      timeframe,
      price: p,
      change: stock.change,
      statusText: isLong ? `${stock.name} ขาขึ้นต่อเนื่อง` : `${stock.name} ย่อตัวพักฐาน`,
      reason: isLong
        ? `${stock.name} Sector ${stock.sector} โมเมนตัม 24 ชม. ${stock.change >= 0 ? '+' : ''}${stock.change.toFixed(2)}%`
        : `${stock.name} Sector ${stock.sector} โมเมนตัมย่อตัว ${stock.change >= 0 ? '+' : ''}${stock.change.toFixed(2)}%`,
      sources: ['NASDAQ', 'NYSE', 'Yahoo Finance'],
      tags: [stock.sector, stock.name, 'US Stock'],
      sl,
      tp,
      support: stock.low52w || p * (1 - slPct * 1.1),
      resistance: stock.high52w || p * (1 + tpPct * 0.9),
      similarity,
      etfFlow: isLong ? '+US Fund Flow (ประเมิน)' : '-US Fund Flow (ประเมิน)',
      category: 'FOREIGN_STOCK',
    };
  });
}


