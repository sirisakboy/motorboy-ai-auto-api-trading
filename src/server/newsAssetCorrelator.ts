/**
 * Backend Per-Asset News-Type Sensitivity & Volatility Classifier.
 *
 * Classifies financial news into granular event categories, maps impacted assets,
 * measures daily per-asset direction & volatility alignment, and maintains a
 * cumulative sensitivity matrix so each asset's reaction profile is separated
 * cleanly by news category.
 */

export type NewsEventCategory =
  | 'MONETARY_POLICY_RATES'
  | 'INFLATION_MACRO_DATA'
  | 'GEOPOLITICS_CONFLICT_ENERGY'
  | 'CRYPTO_ETF_REGULATION'
  | 'TECH_AI_EARNINGS'
  | 'THAI_DOMESTIC_POLICY'
  | 'CAPEX_INFRASTRUCTURE'
  | 'FX_LIQUIDITY_CARRY'
  | 'GENERAL_MARKET';

export type AssetClass =
  | 'CRYPTO'
  | 'FOREX'
  | 'INDEX'
  | 'THAI_STOCK'
  | 'FOREIGN_STOCK'
  | 'COMMODITY';

export type SensitivityTier = 'EXTREME' | 'HIGH' | 'MODERATE' | 'LOW';
export type VolatilityRegime = 'EXTREME' | 'ELEVATED' | 'NORMAL' | 'LOW';

export const NEWS_CATEGORY_LABELS_TH: Record<NewsEventCategory, string> = {
  MONETARY_POLICY_RATES: 'นโยบายการเงิน & ดอกเบี้ย (Fed / กนง. / ECB / BoJ)',
  INFLATION_MACRO_DATA: 'ตัวเลขเงินเฟ้อ & เศรษฐกิจมหภาค (CPI / GDP / Nonfarm)',
  GEOPOLITICS_CONFLICT_ENERGY: 'ภูมิรัฐศาสตร์ สงคราม ภาษีการค้า & พลังงาน/น้ำมัน',
  CRYPTO_ETF_REGULATION: 'ข่าวคริปโต ก.ล.ต. Spot ETF & ระบบบล็อกเชน',
  TECH_AI_EARNINGS: 'งบเทค ชิป AI Data Center & หุ้นเติบโตสหรัฐฯ',
  THAI_DOMESTIC_POLICY: 'เศรษฐกิจไทย ตลาดหุ้น SET & ค่าเงินบาท',
  CAPEX_INFRASTRUCTURE: 'โครงการลงทุนขนาดใหญ่ ก่อสร้าง & ขยายกำลังผลิต (CAPEX)',
  FX_LIQUIDITY_CARRY: 'กระแสเงินทุนต่างชาติ (Fund Flow) & ค่าเงินโลก',
  GENERAL_MARKET: 'ข่าวตลาดการเงินทั่วไป',
};

export interface AssetSnapshotInput {
  symbol: string;
  name: string;
  assetClass: AssetClass;
  price: number;
  change24hPct: number;
  high24h?: number;
  low24h?: number;
  volume24h?: number;
  isLive?: boolean;
}

export interface NewsItemInput {
  id?: string;
  title: string;
  source: string;
  summary?: string;
  url?: string;
  category?: string;
  publishedAt?: string;
  sentiment?: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
}

export interface ClassifiedNewsRecord {
  id: string;
  title: string;
  source: string;
  url: string;
  publishedAt: string;
  primaryCategory: NewsEventCategory;
  secondaryCategories: NewsEventCategory[];
  sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  intensityScore: number;
  matchedAssets: string[];
}

export interface AssetCategoryObservationStat {
  category: NewsEventCategory;
  categoryLabelTh: string;
  sampleCount: number;
  avgAbsMovePct: number;
  maxAbsMovePct: number;
  avgSignedReturnPct: number;
  highVolatilityHits: number;
  bullishReactionCount: number;
  bearishReactionCount: number;
  priorMultiplier: number;
  sensitivityScore: number;
  sensitivityTier: SensitivityTier;
}

export interface AssetDirectionProfile {
  symbol: string;
  name: string;
  assetClass: AssetClass;
  price: number;
  change24hPct: number;
  intradayRangePct: number;
  direction: 'BULLISH' | 'BEARISH' | 'SIDEWAYS';
  volatilityRegime: VolatilityRegime;
  newsDrivenVolatilityScore: number;
  activeNewsDrivers: Array<{
    category: NewsEventCategory;
    categoryLabelTh: string;
    matchingHeadlineCount: number;
    dominantSentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    sensitivityTier: SensitivityTier;
    sampleHeadlines: string[];
  }>;
  topVolatileNewsTypes: Array<{
    category: NewsEventCategory;
    categoryLabelTh: string;
    sensitivityScore: number;
    sensitivityTier: SensitivityTier;
    avgAbsMovePct: number;
    sampleCount: number;
  }>;
}

export interface AssetCumulativeRecord {
  symbol: string;
  name: string;
  assetClass: AssetClass;
  totalObservations: number;
  lastUpdatedAt: string;
  lastPrice: number;
  lastChange24hPct: number;
  byCategory: Partial<Record<NewsEventCategory, AssetCategoryObservationStat>>;
  topVolatileNewsTypes: Array<{
    category: NewsEventCategory;
    categoryLabelTh: string;
    sensitivityScore: number;
    sensitivityTier: SensitivityTier;
    avgAbsMovePct: number;
    sampleCount: number;
  }>;
}

export interface SensitivityMatrixStore {
  version: number;
  updatedAt: string;
  recordedDates: string[];
  assets: Record<string, AssetCumulativeRecord>;
}

const ALL_CATEGORIES: NewsEventCategory[] = [
  'MONETARY_POLICY_RATES',
  'INFLATION_MACRO_DATA',
  'GEOPOLITICS_CONFLICT_ENERGY',
  'CRYPTO_ETF_REGULATION',
  'TECH_AI_EARNINGS',
  'THAI_DOMESTIC_POLICY',
  'CAPEX_INFRASTRUCTURE',
  'FX_LIQUIDITY_CARRY',
  'GENERAL_MARKET',
];

const CATEGORY_PATTERNS: Array<{ category: NewsEventCategory; patterns: RegExp[]; weight: number }> = [
  {
    category: 'MONETARY_POLICY_RATES',
    weight: 1.25,
    patterns: [
      /\b(fed|fomc|powell|rate cut|rate hike|interest rate|central bank|ecb|boj|boe|treasury|yield|bond)\b/i,
      /(ดอกเบี้ย|ลดดอกเบี้ย|ขึ้นดอกเบี้ย|เฟด|ธนาคารกลาง|กนง\.|ธปท\.|พันธบัตร)/i,
    ],
  },
  {
    category: 'INFLATION_MACRO_DATA',
    weight: 1.2,
    patterns: [
      /\b(cpi|ppi|pce|inflation|nonfarm|payroll|unemployment|gdp|recession|retail sales|pmi|jobs report)\b/i,
      /(เงินเฟ้อ|จีดีพี|gdp|การจ้างงาน|เศรษฐกิจถดถอย|ตัวเลขเศรษฐกิจ|ดัชนีราคา)/i,
    ],
  },
  {
    category: 'GEOPOLITICS_CONFLICT_ENERGY',
    weight: 1.25,
    patterns: [
      /\b(war|conflict|missile|sanction|tariff|trade war|opec|brent|wti|crude|oil|middle east|iran|israel|russia|ukraine|gold|safe haven)\b/i,
      /(สงคราม|คว่ำบาตร|ภาษีการค้า|น้ำมัน|โอเปก|ตะวันออกกลาง|ทองคำ|สินทรัพย์ปลอดภัย)/i,
    ],
  },
  {
    category: 'CRYPTO_ETF_REGULATION',
    weight: 1.2,
    patterns: [
      /\b(bitcoin|btc|ethereum|eth|solana|sol|xrp|bnb|shib|crypto|etf|spot etf|sec|stablecoin|binance|defi|halving|blockchain|altcoin)\b/i,
      /(บิตคอยน์|คริปโต|สินทรัพย์ดิจิทัล|spot etf|บล็อกเชน|ก\.ล\.ต\.)/i,
    ],
  },
  {
    category: 'TECH_AI_EARNINGS',
    weight: 1.15,
    patterns: [
      /\b(nvidia|nvda|apple|aapl|tesla|tsla|microsoft|msft|google|googl|meta|amazon|amzn|avgo|broadcom|semiconductor|chip|ai|gpu|earnings|revenue|guidance|nasdaq|tech)\b/i,
      /(ชิป|เซมิคอนดักเตอร์|ปัญญาประดิษฐ์|บิ๊กเทค|ผลประกอบการ|รายได้|หุ้นเทค)/i,
    ],
  },
  {
    category: 'THAI_DOMESTIC_POLICY',
    weight: 1.15,
    patterns: [
      /\b(thailand|thai|set index|set50|baht|thb|bangkok|tourism|aot|cpall|ptt|kbank|delta|gulf|advanc|kaohoon)\b/i,
      /(หุ้นไทย|ตลาดหุ้นไทย|set index|เงินบาท|ค่าเงินบาท|ส่งออก|ท่องเที่ยว|ดิจิทัลวอลเล็ต|คลัง)/i,
    ],
  },
  {
    category: 'CAPEX_INFRASTRUCTURE',
    weight: 1.1,
    patterns: [
      /\b(capex|data center|hyperscale|megaproject|infrastructure|ev plant|eec|ppa|renewable|bess|factory expansion|backlog)\b/i,
      /(เมกะโปรเจกต์|ก่อสร้าง|งบลงทุน|ขยายโรงงาน|โครงสร้างพื้นฐาน|นิคมอุตสาหกรรม|พลังงานหมุนเวียน)/i,
    ],
  },
  {
    category: 'FX_LIQUIDITY_CARRY',
    weight: 1.1,
    patterns: [
      /\b(dxy|dollar|yen|euro|pound|fx|forex|currency|carry trade|fund flow|liquidity|capital flow|emerging market)\b/i,
      /(ดอลลาร์|ฟันด์โฟลว์|fund flow|อัตราแลกเปลี่ยน|สภาพคล่อง|ตลาดเกิดใหม่|เงินเยน)/i,
    ],
  },
];

const BULLISH_WORDS = /\b(surge|rally|soar|jump|gain|bull|bullish|breakout|record high|beat|approval|approve|cut rate|easing|inflow|stimulus|expand|growth)\b|พุ่ง|บวก|ขาขึ้น|ทะลุ|ฟื้นตัว|เติบโต|ไหลเข้า|หนุน/i;
const BEARISH_WORDS = /\b(crash|plunge|drop|fall|slump|bear|bearish|selloff|sell-off|warning|fear|risk|recession|war|sanction|tariff|outflow|miss|downgrade|hack|exploit|hike)\b|ร่วง|ดิ่ง|ลบ|ขาลง|แรงขาย|กดดัน|ชะลอ|วิกฤต|ไหลออก|อ่อนค่า/i;

const EXPLICIT_ASSET_ALIASES: Array<{ symbol: string; pattern: RegExp }> = [
  { symbol: 'BTC', pattern: /\b(btc|bitcoin)\b|บิตคอยน์/i },
  { symbol: 'ETH', pattern: /\b(eth|ethereum)\b/i },
  { symbol: 'SOL', pattern: /\b(sol|solana)\b/i },
  { symbol: 'BNB', pattern: /\b(bnb|binance)\b/i },
  { symbol: 'XRP', pattern: /\b(xrp|ripple)\b/i },
  { symbol: 'SHIB', pattern: /\b(shib|shiba)\b/i },
  { symbol: 'USD/THB', pattern: /\b(usd\/thb|usdthb|thb|baht)\b|เงินบาท|ค่าเงินบาท/i },
  { symbol: 'USD/JPY', pattern: /\b(usd\/jpy|usdjpy|yen|boj)\b|เงินเยน/i },
  { symbol: 'EUR/USD', pattern: /\b(eur\/usd|eurusd|euro|ecb)\b/i },
  { symbol: 'GBP/USD', pattern: /\b(gbp\/usd|gbpusd|pound|boe)\b/i },
  { symbol: 'AUD/USD', pattern: /\b(aud\/usd|audusd|rba|aussie)\b/i },
  { symbol: 'USD/CHF', pattern: /\b(usd\/chf|usdchf|franc|snb)\b/i },
  { symbol: 'SET', pattern: /\b(set index|set50)\b|หุ้นไทย|ตลาดหุ้นไทย/i },
  { symbol: 'NASDAQ', pattern: /\b(nasdaq|qqq|ixic)\b/i },
  { symbol: 'S&P500', pattern: /\b(s&p\s*500|spx|spy)\b/i },
  { symbol: 'DJI', pattern: /\b(dow jones|djia|dji)\b/i },
  { symbol: 'NVDA', pattern: /\b(nvda|nvidia)\b/i },
  { symbol: 'AAPL', pattern: /\b(aapl|apple)\b/i },
  { symbol: 'TSLA', pattern: /\b(tsla|tesla)\b/i },
  { symbol: 'GOOGL', pattern: /\b(googl|alphabet|google)\b/i },
  { symbol: 'MSFT', pattern: /\b(msft|microsoft)\b/i },
  { symbol: 'META', pattern: /\b(meta|facebook)\b/i },
  { symbol: 'AMZN', pattern: /\b(amzn|amazon)\b/i },
  { symbol: 'AVGO', pattern: /\b(avgo|broadcom)\b/i },
  { symbol: 'AOT', pattern: /\b(aot)\b|ท่าอากาศยานไทย/i },
  { symbol: 'PTT', pattern: /\b(ptt|crude|oil|opec)\b|ปตท\.|น้ำมัน/i },
  { symbol: 'DELTA', pattern: /\b(delta)\b|เดลต้า/i },
  { symbol: 'KBANK', pattern: /\b(kbank)\b|กสิกรไทย/i },
  { symbol: 'CPALL', pattern: /\b(cpall)\b|ซีพีออลล์/i },
  { symbol: 'GULF', pattern: /\b(gulf)\b|กัลฟ์/i },
  { symbol: 'SCC', pattern: /\b(scc)\b|เอสซีจี/i },
  { symbol: 'ADVANC', pattern: /\b(advanc|ais)\b|แอดวานซ์/i },
  { symbol: 'GOLD', pattern: /\b(gold|xau|gc=f)\b|ทองคำ/i },
];

/**
 * Domain-grounded prior sensitivity multiplier per asset & asset class for each news category.
 * Real daily observations update empirical move stats alongside this baseline prior.
 */
export function getStructuralCategoryMultiplier(
  symbol: string,
  assetClass: AssetClass,
  category: NewsEventCategory
): number {
  const sym = symbol.toUpperCase();

  // Symbol-specific overrides for sharpest precision
  const symbolOverrides: Record<string, Partial<Record<NewsEventCategory, number>>> = {
    BTC: {
      CRYPTO_ETF_REGULATION: 1.95,
      MONETARY_POLICY_RATES: 1.75,
      INFLATION_MACRO_DATA: 1.65,
      FX_LIQUIDITY_CARRY: 1.45,
      GEOPOLITICS_CONFLICT_ENERGY: 1.35,
    },
    ETH: {
      CRYPTO_ETF_REGULATION: 1.95,
      MONETARY_POLICY_RATES: 1.65,
      INFLATION_MACRO_DATA: 1.55,
      TECH_AI_EARNINGS: 1.3,
    },
    SOL: {
      CRYPTO_ETF_REGULATION: 2.0,
      MONETARY_POLICY_RATES: 1.7,
      FX_LIQUIDITY_CARRY: 1.5,
    },
    NVDA: {
      TECH_AI_EARNINGS: 2.0,
      CAPEX_INFRASTRUCTURE: 1.75,
      MONETARY_POLICY_RATES: 1.5,
      GEOPOLITICS_CONFLICT_ENERGY: 1.45,
    },
    DELTA: {
      TECH_AI_EARNINGS: 1.85,
      CAPEX_INFRASTRUCTURE: 1.65,
      THAI_DOMESTIC_POLICY: 1.55,
      FX_LIQUIDITY_CARRY: 1.4,
    },
    PTT: {
      GEOPOLITICS_CONFLICT_ENERGY: 1.9,
      THAI_DOMESTIC_POLICY: 1.65,
      INFLATION_MACRO_DATA: 1.35,
    },
    GULF: {
      CAPEX_INFRASTRUCTURE: 1.85,
      THAI_DOMESTIC_POLICY: 1.65,
      MONETARY_POLICY_RATES: 1.45,
    },
    AOT: {
      THAI_DOMESTIC_POLICY: 1.85,
      GEOPOLITICS_CONFLICT_ENERGY: 1.45,
      FX_LIQUIDITY_CARRY: 1.4,
    },
    'USD/THB': {
      MONETARY_POLICY_RATES: 1.85,
      THAI_DOMESTIC_POLICY: 1.8,
      FX_LIQUIDITY_CARRY: 1.75,
      INFLATION_MACRO_DATA: 1.65,
    },
    'USD/JPY': {
      MONETARY_POLICY_RATES: 1.95,
      FX_LIQUIDITY_CARRY: 1.85,
      INFLATION_MACRO_DATA: 1.65,
      GEOPOLITICS_CONFLICT_ENERGY: 1.45,
    },
    GOLD: {
      GEOPOLITICS_CONFLICT_ENERGY: 1.95,
      MONETARY_POLICY_RATES: 1.85,
      INFLATION_MACRO_DATA: 1.75,
      FX_LIQUIDITY_CARRY: 1.5,
    },
  };

  if (symbolOverrides[sym]?.[category] !== undefined) {
    return symbolOverrides[sym][category]!;
  }

  // Class-level baseline multipliers
  const classMatrix: Record<AssetClass, Partial<Record<NewsEventCategory, number>>> = {
    CRYPTO: {
      CRYPTO_ETF_REGULATION: 1.9,
      MONETARY_POLICY_RATES: 1.65,
      INFLATION_MACRO_DATA: 1.55,
      FX_LIQUIDITY_CARRY: 1.4,
      TECH_AI_EARNINGS: 1.25,
      GEOPOLITICS_CONFLICT_ENERGY: 1.3,
    },
    FOREX: {
      MONETARY_POLICY_RATES: 1.85,
      FX_LIQUIDITY_CARRY: 1.8,
      INFLATION_MACRO_DATA: 1.7,
      GEOPOLITICS_CONFLICT_ENERGY: 1.4,
      THAI_DOMESTIC_POLICY: sym.includes('THB') ? 1.75 : 0.8,
    },
    INDEX: {
      MONETARY_POLICY_RATES: 1.75,
      INFLATION_MACRO_DATA: 1.7,
      TECH_AI_EARNINGS: sym === 'NASDAQ' ? 1.9 : 1.45,
      GEOPOLITICS_CONFLICT_ENERGY: 1.45,
      THAI_DOMESTIC_POLICY: sym === 'SET' ? 1.85 : 0.75,
    },
    THAI_STOCK: {
      THAI_DOMESTIC_POLICY: 1.8,
      CAPEX_INFRASTRUCTURE: 1.65,
      MONETARY_POLICY_RATES: 1.45,
      FX_LIQUIDITY_CARRY: 1.4,
      GEOPOLITICS_CONFLICT_ENERGY: 1.3,
    },
    FOREIGN_STOCK: {
      TECH_AI_EARNINGS: 1.85,
      MONETARY_POLICY_RATES: 1.6,
      INFLATION_MACRO_DATA: 1.5,
      CAPEX_INFRASTRUCTURE: 1.45,
      GEOPOLITICS_CONFLICT_ENERGY: 1.35,
    },
    COMMODITY: {
      GEOPOLITICS_CONFLICT_ENERGY: 1.9,
      MONETARY_POLICY_RATES: 1.8,
      INFLATION_MACRO_DATA: 1.75,
      FX_LIQUIDITY_CARRY: 1.45,
    },
  };

  return classMatrix[assetClass]?.[category] ?? (category === 'GENERAL_MARKET' ? 0.9 : 1.0);
}

/** Determine default asset symbols linked to each news category even when ticker is not named explicitly. */
function defaultCategoryAssets(category: NewsEventCategory): string[] {
  switch (category) {
    case 'CRYPTO_ETF_REGULATION':
      return ['BTC', 'ETH', 'SOL', 'BNB', 'XRP'];
    case 'MONETARY_POLICY_RATES':
      return ['BTC', 'NASDAQ', 'S&P500', 'USD/JPY', 'EUR/USD', 'USD/THB', 'GOLD'];
    case 'INFLATION_MACRO_DATA':
      return ['S&P500', 'NASDAQ', 'BTC', 'USD/JPY', 'GOLD', 'USD/THB'];
    case 'GEOPOLITICS_CONFLICT_ENERGY':
      return ['GOLD', 'PTT', 'USD/CHF', 'S&P500', 'BTC'];
    case 'TECH_AI_EARNINGS':
      return ['NVDA', 'AAPL', 'MSFT', 'META', 'GOOGL', 'AMZN', 'AVGO', 'TSLA', 'NASDAQ', 'DELTA'];
    case 'THAI_DOMESTIC_POLICY':
      return ['SET', 'USD/THB', 'AOT', 'KBANK', 'CPALL', 'PTT', 'GULF', 'SCC', 'ADVANC'];
    case 'CAPEX_INFRASTRUCTURE':
      return ['GULF', 'DELTA', 'SCC', 'CPALL', 'NVDA', 'AOT'];
    case 'FX_LIQUIDITY_CARRY':
      return ['EUR/USD', 'USD/JPY', 'GBP/USD', 'USD/THB', 'AUD/USD', 'USD/CHF', 'SET'];
    default:
      return ['BTC', 'S&P500', 'SET', 'USD/THB'];
  }
}

function scoreToTier(score: number): SensitivityTier {
  if (score >= 78) return 'EXTREME';
  if (score >= 58) return 'HIGH';
  if (score >= 38) return 'MODERATE';
  return 'LOW';
}

export function classifyNewsArticle(item: NewsItemInput, index = 0): ClassifiedNewsRecord {
  const combined = `${item.title || ''} ${item.summary || ''} ${item.source || ''} ${item.category || ''}`.trim();
  const scored: Array<{ category: NewsEventCategory; hits: number; score: number }> = [];

  for (const rule of CATEGORY_PATTERNS) {
    let hits = 0;
    for (const pattern of rule.patterns) {
      const global = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
      const matches = combined.match(global);
      if (matches) hits += matches.length;
    }
    if (hits > 0) {
      scored.push({ category: rule.category, hits, score: hits * rule.weight });
    }
  }

  // Honor explicit category hint when keyword density is sparse
  const hint = (item.category || '').toUpperCase();
  if (scored.length === 0) {
    if (hint.includes('CRYPTO')) {
      scored.push({ category: 'CRYPTO_ETF_REGULATION', hits: 1, score: 1.0 });
    } else if (hint.includes('PROJECT')) {
      scored.push({ category: 'CAPEX_INFRASTRUCTURE', hits: 1, score: 1.0 });
    } else if (hint.includes('MSN')) {
      scored.push({ category: 'THAI_DOMESTIC_POLICY', hits: 1, score: 1.0 });
    } else if (hint.includes('MACRO')) {
      scored.push({ category: 'INFLATION_MACRO_DATA', hits: 1, score: 1.0 });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const primaryCategory: NewsEventCategory = scored[0]?.category ?? 'GENERAL_MARKET';
  const secondaryCategories = scored.slice(1, 3).map((s) => s.category);

  let sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = item.sentiment ?? 'NEUTRAL';
  if (!item.sentiment) {
    const bullMatches = (combined.match(new RegExp(BULLISH_WORDS.source, 'gi')) || []).length;
    const bearMatches = (combined.match(new RegExp(BEARISH_WORDS.source, 'gi')) || []).length;
    if (bullMatches > bearMatches) sentiment = 'BULLISH';
    else if (bearMatches > bullMatches) sentiment = 'BEARISH';
  }

  const explicitAssets = new Set<string>();
  for (const alias of EXPLICIT_ASSET_ALIASES) {
    if (alias.pattern.test(combined)) {
      explicitAssets.add(alias.symbol);
    }
  }
  for (const fallbackSym of defaultCategoryAssets(primaryCategory)) {
    explicitAssets.add(fallbackSym);
  }

  const totalHits = scored.reduce((sum, s) => sum + s.hits, 0);
  const intensityScore = Math.min(
    100,
    Math.max(25, Math.round(35 + totalHits * 12 + (sentiment === 'NEUTRAL' ? 0 : 12)))
  );

  return {
    id: item.id || `news-${Date.now()}-${index}`,
    title: item.title,
    source: item.source || 'RSS',
    url: item.url || '',
    publishedAt: item.publishedAt || new Date().toISOString(),
    primaryCategory,
    secondaryCategories,
    sentiment,
    intensityScore,
    matchedAssets: Array.from(explicitAssets),
  };
}

export function createEmptySensitivityMatrix(): SensitivityMatrixStore {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    recordedDates: [],
    assets: {},
  };
}

function classifyVolatilityRegime(assetClass: AssetClass, absChangePct: number, rangePct: number): VolatilityRegime {
  const effectiveMove = Math.max(absChangePct, rangePct * 0.75);
  const thresholds =
    assetClass === 'CRYPTO'
      ? { extreme: 7.0, elevated: 3.8, normal: 1.5 }
      : assetClass === 'FOREX'
      ? { extreme: 1.35, elevated: 0.75, normal: 0.3 }
      : { extreme: 4.0, elevated: 2.2, normal: 0.9 };

  if (effectiveMove >= thresholds.extreme) return 'EXTREME';
  if (effectiveMove >= thresholds.elevated) return 'ELEVATED';
  if (effectiveMove >= thresholds.normal) return 'NORMAL';
  return 'LOW';
}

export function analyzeAssetsAgainstNews(params: {
  dateKey: string;
  assets: AssetSnapshotInput[];
  news: NewsItemInput[];
  existingMatrix?: SensitivityMatrixStore | null;
}): {
  classifiedNews: ClassifiedNewsRecord[];
  perAssetAnalysis: AssetDirectionProfile[];
  updatedMatrix: SensitivityMatrixStore;
} {
  const matrix: SensitivityMatrixStore = params.existingMatrix
    ? {
        version: params.existingMatrix.version ?? 1,
        updatedAt: new Date().toISOString(),
        recordedDates: Array.from(new Set([...(params.existingMatrix.recordedDates || []), params.dateKey])).sort(),
        assets: { ...(params.existingMatrix.assets || {}) },
      }
    : {
        version: 1,
        updatedAt: new Date().toISOString(),
        recordedDates: [params.dateKey],
        assets: {},
      };

  const classifiedNews = params.news.map((item, i) => classifyNewsArticle(item, i));
  const alreadyRecordedDate = Boolean(
    params.existingMatrix?.recordedDates?.includes(params.dateKey)
  );

  const perAssetAnalysis: AssetDirectionProfile[] = params.assets.map((asset) => {
    const sym = asset.symbol.toUpperCase();
    const absChange = Math.abs(asset.change24hPct || 0);
    const rangePct =
      asset.price > 0 && asset.high24h && asset.low24h && asset.high24h >= asset.low24h
        ? +(((asset.high24h - asset.low24h) / asset.price) * 100).toFixed(2)
        : +Math.max(absChange, 0.25).toFixed(2);

    const direction: 'BULLISH' | 'BEARISH' | 'SIDEWAYS' =
      asset.change24hPct > 0.25 ? 'BULLISH' : asset.change24hPct < -0.25 ? 'BEARISH' : 'SIDEWAYS';

    const volatilityRegime = classifyVolatilityRegime(asset.assetClass, absChange, rangePct);

    // Filter news impacting this asset directly or via primary category exposure
    const relevantNews = classifiedNews.filter(
      (n) =>
        n.matchedAssets.includes(sym) ||
        getStructuralCategoryMultiplier(sym, asset.assetClass, n.primaryCategory) >= 1.4
    );

    const groupedByCat = new Map<NewsEventCategory, ClassifiedNewsRecord[]>();
    for (const item of relevantNews) {
      const cats = [item.primaryCategory, ...item.secondaryCategories];
      for (const cat of cats) {
        if (!groupedByCat.has(cat)) groupedByCat.set(cat, []);
        groupedByCat.get(cat)!.push(item);
      }
    }

    const prevRecord: AssetCumulativeRecord = matrix.assets[sym] ?? {
      symbol: sym,
      name: asset.name,
      assetClass: asset.assetClass,
      totalObservations: 0,
      lastUpdatedAt: matrix.updatedAt,
      lastPrice: asset.price,
      lastChange24hPct: asset.change24hPct,
      byCategory: {},
      topVolatileNewsTypes: [],
    };

    const nextByCategory: Partial<Record<NewsEventCategory, AssetCategoryObservationStat>> = {
      ...prevRecord.byCategory,
    };

    const activeNewsDrivers: AssetDirectionProfile['activeNewsDrivers'] = [];

    for (const category of ALL_CATEGORIES) {
      const priorMultiplier = getStructuralCategoryMultiplier(sym, asset.assetClass, category);
      const hitsToday = groupedByCat.get(category) || [];
      const prevStat = nextByCategory[category];

      if (hitsToday.length > 0) {
        let bullCount = 0;
        let bearCount = 0;
        for (const h of hitsToday) {
          if (h.sentiment === 'BULLISH') bullCount += 1;
          else if (h.sentiment === 'BEARISH') bearCount += 1;
        }
        const dominantSentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL' =
          bullCount > bearCount ? 'BULLISH' : bearCount > bullCount ? 'BEARISH' : 'NEUTRAL';

        const alignedWithNews =
          (dominantSentiment === 'BULLISH' && asset.change24hPct > 0) ||
          (dominantSentiment === 'BEARISH' && asset.change24hPct < 0);

        const prevSamples = prevStat?.sampleCount ?? 0;
        const shouldIncrement = !alreadyRecordedDate || prevSamples === 0;
        const nextSamples = shouldIncrement ? prevSamples + 1 : prevSamples;
        const moveStrength = Math.max(absChange, rangePct * 0.65);

        const prevAvgAbs = prevStat?.avgAbsMovePct ?? moveStrength;
        const avgAbsMovePct = shouldIncrement
          ? +((prevAvgAbs * prevSamples + moveStrength) / Math.max(1, nextSamples)).toFixed(3)
          : prevAvgAbs;

        const prevAvgSigned = prevStat?.avgSignedReturnPct ?? asset.change24hPct;
        const avgSignedReturnPct = shouldIncrement
          ? +((prevAvgSigned * prevSamples + asset.change24hPct) / Math.max(1, nextSamples)).toFixed(3)
          : prevAvgSigned;

        const isHighVolHit = volatilityRegime === 'ELEVATED' || volatilityRegime === 'EXTREME';
        const highVolatilityHits =
          (prevStat?.highVolatilityHits ?? 0) + (shouldIncrement && isHighVolHit ? 1 : 0);
        const bullishReactionCount =
          (prevStat?.bullishReactionCount ?? 0) + (shouldIncrement && asset.change24hPct > 0.25 ? 1 : 0);
        const bearishReactionCount =
          (prevStat?.bearishReactionCount ?? 0) + (shouldIncrement && asset.change24hPct < -0.25 ? 1 : 0);

        const highVolRate = highVolatilityHits / Math.max(1, nextSamples);
        const alignmentBonus = alignedWithNews ? 14 : 4;
        const normalizedClassMove =
          asset.assetClass === 'FOREX'
            ? avgAbsMovePct * 35
            : asset.assetClass === 'CRYPTO'
            ? avgAbsMovePct * 7
            : avgAbsMovePct * 14;

        const empiricalScore = Math.min(45, normalizedClassMove + highVolRate * 25);
        const priorScore = Math.min(50, priorMultiplier * 24);
        const sensitivityScore = Math.min(100, Math.round(priorScore + empiricalScore + alignmentBonus * 0.4));
        const sensitivityTier = scoreToTier(sensitivityScore);

        nextByCategory[category] = {
          category,
          categoryLabelTh: NEWS_CATEGORY_LABELS_TH[category],
          sampleCount: nextSamples,
          avgAbsMovePct,
          maxAbsMovePct: Math.max(prevStat?.maxAbsMovePct ?? 0, +moveStrength.toFixed(3)),
          avgSignedReturnPct,
          highVolatilityHits,
          bullishReactionCount,
          bearishReactionCount,
          priorMultiplier,
          sensitivityScore,
          sensitivityTier,
        };

        activeNewsDrivers.push({
          category,
          categoryLabelTh: NEWS_CATEGORY_LABELS_TH[category],
          matchingHeadlineCount: hitsToday.length,
          dominantSentiment,
          sensitivityTier,
          sampleHeadlines: hitsToday.slice(0, 2).map((h) => h.title),
        });
      } else if (!prevStat && priorMultiplier >= 1.35) {
        // Seed structural prior even before first matching headline arrives
        const sensitivityScore = Math.min(92, Math.round(priorMultiplier * 38));
        nextByCategory[category] = {
          category,
          categoryLabelTh: NEWS_CATEGORY_LABELS_TH[category],
          sampleCount: 0,
          avgAbsMovePct: 0,
          maxAbsMovePct: 0,
          avgSignedReturnPct: 0,
          highVolatilityHits: 0,
          bullishReactionCount: 0,
          bearishReactionCount: 0,
          priorMultiplier,
          sensitivityScore,
          sensitivityTier: scoreToTier(sensitivityScore),
        };
      }
    }

    const rankedCategories = Object.values(nextByCategory)
      .filter((c): c is AssetCategoryObservationStat => Boolean(c))
      .sort((a, b) => b.sensitivityScore - a.sensitivityScore)
      .slice(0, 5)
      .map((c) => ({
        category: c.category,
        categoryLabelTh: c.categoryLabelTh,
        sensitivityScore: c.sensitivityScore,
        sensitivityTier: c.sensitivityTier,
        avgAbsMovePct: c.avgAbsMovePct,
        sampleCount: c.sampleCount,
      }));

    activeNewsDrivers.sort((a, b) => b.matchingHeadlineCount - a.matchingHeadlineCount);

    const topActiveDriverTier = activeNewsDrivers[0]?.sensitivityTier;
    const tierBoost =
      topActiveDriverTier === 'EXTREME' ? 30 : topActiveDriverTier === 'HIGH' ? 22 : topActiveDriverTier === 'MODERATE' ? 14 : 6;
    const volBoost =
      volatilityRegime === 'EXTREME' ? 40 : volatilityRegime === 'ELEVATED' ? 28 : volatilityRegime === 'NORMAL' ? 16 : 8;
    const newsDrivenVolatilityScore = Math.min(
      100,
      volBoost + tierBoost + Math.min(30, relevantNews.length * 4)
    );

    matrix.assets[sym] = {
      symbol: sym,
      name: asset.name,
      assetClass: asset.assetClass,
      totalObservations:
        prevRecord.totalObservations + (!alreadyRecordedDate || prevRecord.totalObservations === 0 ? 1 : 0),
      lastUpdatedAt: matrix.updatedAt,
      lastPrice: asset.price,
      lastChange24hPct: asset.change24hPct,
      byCategory: nextByCategory,
      topVolatileNewsTypes: rankedCategories,
    };

    return {
      symbol: sym,
      name: asset.name,
      assetClass: asset.assetClass,
      price: asset.price,
      change24hPct: asset.change24hPct,
      intradayRangePct: rangePct,
      direction,
      volatilityRegime,
      newsDrivenVolatilityScore,
      activeNewsDrivers: activeNewsDrivers.slice(0, 4),
      topVolatileNewsTypes: rankedCategories,
    };
  });

  return { classifiedNews, perAssetAnalysis, updatedMatrix: matrix };
}
