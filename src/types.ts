export type FlashDirection = 'UP' | 'DOWN' | 'NONE';

export type Sentiment = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

export type MarketStatus = 'OPEN' | 'CLOSED';

export interface Asset {
  id: string;
  symbol: string;
  name: string;
  binanceSymbol: string;
  exchange?: string;
}

export interface PriceData {
  symbol: string;
  price: number;
  change: number;
  high?: number;
  low?: number;
  volume?: number;
  timestamp?: number;
}

export interface CryptoCoin {
  id: string;
  symbol: string;
  name: string;
  binanceSymbol: string;
  price: number;
  change: number;
  prevPrice?: number;
  marketCap?: number | null;
  high?: number;
  low?: number;
  volume?: number;
  flash?: FlashDirection;
}

export interface ForexPair {
  pair: string;
  price: number;
  change: number;
  flash?: FlashDirection;
  signal?: TradingSignal;
  isLive?: boolean;
  updatedAt?: string;
}

export interface StockIndex {
  symbol: string;
  name: string;
  price: number;
  change: number;
  status: MarketStatus;
  schedule: string;
  isLive?: boolean;
  updatedAt?: string;
}

export interface ThaiStock {
  symbol: string;
  name: string;
  nameEn: string;
  sector: string;
  price: number;
  change: number;
  volume: number;
  marketCap: string;
  pe: number;
  dividendYield: number;
  flash?: FlashDirection;
  isLive?: boolean;
  updatedAt?: string;
  googleFinanceUrl?: string;
}

export interface ForeignStock {
  symbol: string;
  name: string;
  sector: string;
  price: number;
  change: number;
  volume: number;
  marketCap: string;
  pe: number;
  high52w: number;
  low52w: number;
  flash?: FlashDirection;
  isLive?: boolean;
  updatedAt?: string;
  googleFinanceUrl?: string;
}

export interface TradingSignal {
  id: string;
  symbol: string;
  base: string;
  quote: string;
  type: 'LONG' | 'SHORT';
  probability: number;
  timeframe: string;
  price: number;
  change: number;
  statusText: string;
  reason: string;
  sources: string[];
  tags: string[];
  sl: number;
  tp: number;
  similarity: number;
  etfFlow: string;
  support?: number;
  resistance?: number;
  category?: 'CRYPTO' | 'FOREX' | 'THAI_STOCK' | 'FOREIGN_STOCK';
}

export interface ProjectDetails {
  company: string;
  projectName: string;
  capexValue?: string;
  constructionTimeline?: string;
  projectType: 'INFRASTRUCTURE' | 'FACTORY_EXPANSION' | 'DATA_CENTER' | 'RENEWABLE_ENERGY' | 'LOGISTICS';
  targetBeneficiaries: string[];
}

export interface NewsArticle {
  id: string;
  title: string;
  source: string;
  time: string;
  url: string;
  sentiment: Sentiment;
  category?: 'MSN_MONEY' | 'CRYPTO' | 'FOREX' | 'MACRO' | 'PROJECT_EXPANSION' | 'YAHOO_WORLD' | 'MITRADE';
  impact?: 'HIGH' | 'MEDIUM' | 'LOW';
  summary?: string;
  projectDetails?: ProjectDetails;
  isCurated?: boolean;
  fetchedAt?: string;
}

export interface MarketHoursInfo {
  setStatus: MarketStatus;
  forexStatus: MarketStatus;
  cryptoStatus: MarketStatus;
  countdown: string;
  timestamp: string;
}

export interface ChartData {
  prices: number[];
  ema20: number[];
  ema50: number[];
  support?: number;
  resistance?: number;
  isLive?: boolean;
  source?: string;
}

export interface ApiStatusState {
  binanceWs: string;
  coinGecko: string;
  forex: string;
  news: string;
  signals: string;
  stocks: string;
  lastChecked?: string;
  isChecking?: boolean;
}

export interface LongTermProjectAnalysis {
  company: string;
  projectName: string;
  capexValue: string;
  constructionTimeline: string;
  paybackPeriod: string;
  roiProjection: string;
  economicMoat: string;
  debtRiskAssessment: string;
  longTermVerdict: 'STRONG_ACCUMULATE' | 'ACCUMULATE' | 'WATCHLIST' | 'CAUTION';
  longTermVerdictTh: string;
  confidenceScore: number;
  coreDrivers: string[];
  strategicRisk: string;
  investmentHorizon: string;
  strategyAdvice: string;
  source: 'GEMINI_AI' | 'FUNDAMENTAL_QUANT';
  timestamp: string;
}

export interface AutoMarketSynthesisResult {
  headline: string;
  overallStance: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  overallStanceTh: string;
  confidence: number;
  keyCatalysts: string[];
  mostImpactedAssets: Array<{
    symbol: string;
    expectedImpact: 'POSITIVE' | 'NEGATIVE' | 'VOLATILE';
    reason: string;
  }>;
  riskHorizon: string;
  actionableSummary: string;
  timestamp: string;
}

export interface TradingHistoryEntry {
  id: string;
  userId: string;
  type:
    | 'AI_ANALYSIS'
    | 'SIGNAL_SAVED'
    | 'PRICE_ALERT'
    | 'NEWS_ANALYSIS'
    | 'AUTO_MARKET_IMPACT'
    | 'LONG_TERM_PROJECT'
    | 'PORTFOLIO_REBALANCE';
  symbol: string;
  action: 'LONG' | 'SHORT' | 'ALERT' | 'NEUTRAL' | 'BUY' | 'SELL' | 'HOLD';
  price: number;
  aiSummary: string;
  confidence?: number;
  sl?: number;
  tp?: number;
  timestamp: string;
}

export interface PortfolioRebalanceAsset {
  id: string;
  symbol: string;
  name: string;
  currentUnits: number;
  currentPrice: number;
  targetPct: number;
  category?: 'CRYPTO' | 'STOCK' | 'FOREX' | 'CASH';
}

export interface PortfolioRebalanceItemResult {
  asset: PortfolioRebalanceAsset;
  currentValue: number;
  currentPct: number;
  targetValue: number;
  targetUnits: number;
  driftPct: number;
  deltaValue: number; // positive = BUY, negative = SELL
  deltaUnits: number;
  action: 'BUY' | 'SELL' | 'HOLD';
}

export interface PortfolioRebalancePlan {
  totalCurrentValue: number;
  effectiveTotalValue: number;
  cashAdjustment: number;
  totalTargetPct: number;
  isBalanced: boolean;
  items: PortfolioRebalanceItemResult[];
  ordersToExecute: {
    symbol: string;
    action: 'BUY' | 'SELL';
    amountValue: number;
    amountUnits: number;
    targetPct: number;
  }[];
}

export interface HolisticMarketAdvice {
  recommendation: 'BUY' | 'SELL' | 'HOLD';
  recommendationLabelTh: string;
  confidence: number;
  marketStance: string;
  summaryReason: string;
  keyDrivers: string[];
  riskFactor: string;
  bullishSignalsCount: number;
  bearishSignalsCount: number;
  bullishNewsCount: number;
  bearishNewsCount: number;
  source: 'GEMINI_AI' | 'TECHNICAL_QUANT';
  timestamp: string;
}

export interface TradingPsychologySettings {
  riskToleranceLevel: 'CONSERVATIVE' | 'MODERATE' | 'AGGRESSIVE';
  enableEmotionalCheckIn: boolean;
  dailyLimitRiskPct: number;
}

export interface UserSettingsProfile {
  userId: string;
  email?: string | null;
  geminiApiKey: string;
  watchlist: string[];
  priceAlerts: Array<{ symbol: string; targetPrice: number }>;
  useThb: boolean;
  notificationsEnabled: boolean;
  psychologySettings?: TradingPsychologySettings;
  updatedAt: string;
}

/** Unified realtime chat message (Firestore `chatRooms/{roomId}/messages`). */
/**
 * Metadata that turns a chat bubble into a transparent AI answer
 * (Brand Book v2.0 §09): what it looked at, why it said it, which voice it used.
 * Optional so messages stored before this upgrade still load.
 */
export interface ChatMessageMeta {
  /** โทนเสียงที่ใช้ตอบ */
  tone?: 'friend' | 'coach' | 'expert';
  /** "ดูจาก: …" — แหล่งข้อมูลที่ใช้จริง */
  sources?: string[];
  /** เหตุผล 3 ข้อ (ดึงจากคำตอบ) */
  reasons?: string[];
  /** llm = Gemini, quant = เครื่องคำนวณในเครื่อง */
  depth?: 'llm' | 'quant';
  /** ข้อความนี้สตรีมมาทีละคำหรือไม่ */
  streamed?: boolean;
  /** เวลาตอบ หน่วยมิลลิวินาที */
  latencyMs?: number;
}

export interface ChatMessage {
  id: string;
  uid: string;
  name: string;
  photoURL?: string | null;
  text: string;
  createdAt: string;
  meta?: ChatMessageMeta;
}

/* ========================================================================
 * AI Analysis & Sentiment Types
 * ======================================================================== */

export interface MarketSentimentScore {
  score: number;
  sentimentLabel: 'EXTREME_GREED' | 'BULLISH' | 'NEUTRAL' | 'BEARISH' | 'EXTREME_FEAR';
  sentimentTextTh: string;
  summaryReason: string;
  socialMomentum: 'HIGH' | 'MODERATE' | 'LOW';
  whaleActivity: 'ACCUMULATION' | 'DISTRIBUTION' | 'NEUTRAL';
  source: 'GEMINI_AI' | 'TECHNICAL_FALLBACK';
  safetyMargin: number;
  timestamp: string;
}

export interface AiAnalysisResult {
  symbol: string;
  action: 'LONG' | 'SHORT' | 'ALERT' | 'NEUTRAL';
  confidence: number;
  summary: string;
  supportLevel: number;
  resistanceLevel: number;
  strategyAdvice: string;
  keyDrivers?: string[];
  risks?: string[];
  source: 'GEMINI_AI' | 'TECHNICAL_FALLBACK';
  timestamp: string;
  /** Sentiment analysis included by some callers (e.g. SignalDetailModal). */
  sentiment?: MarketSentimentScore;
}

/** Raw AI response parsed from Gemini, used internally by apiClient. */
export interface RssItem {
  title?: string;
  link?: string;
  pubDate?: string;
  description?: string;
}

/** Shape of a CoinGecko /api/v3/simple/price response entry. */
export interface CoinGeckoPriceEntry {
  usd?: number;
  usd_24h_change?: number;
  usd_market_cap?: number;
  usd_24h_vol?: number;
}

/** Shape of a Binance /api/v3/ticker/24hr response entry. */
export interface BinanceTicker24h {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
  highPrice: string;
  lowPrice: string;
  quoteVolume: string;
}

/** Shape of a Binance /api/v3/klines response row (first 5 elements used). */
export interface BinanceKline {
  [index: number]: string;
}

/** Result of news analysis from Gemini or the fallback heuristic engine. */
export interface NewsAnalysisResult {
  newsId: string;
  title: string;
  source: string;
  url: string;
  sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  sentimentLabelTh: string;
  accuracyScore: number;
  marketImpact: 'HIGH' | 'MEDIUM' | 'LOW';
  affectedMarkets: string[];
  impactHorizon: 'SHORT_TERM' | 'MEDIUM_TERM' | 'LONG_TERM';
  coreTakeaway: string;
  marketImplication: string;
  tradingStrategyAdvice: string;
  keyMetrics: {
    macroRisk: 'LOW' | 'MODERATE' | 'ELEVATED' | 'HIGH';
    volatilityForecast: 'EXPANDING' | 'STABLE' | 'COMPRESSING';
    recommendedPositioning: 'ACCUMULATE' | 'HOLD' | 'REDUCE_RISK' | 'HEDGE';
  };
  riskFactors: string[];
  timestamp: string;
}

/** Drawdown Monitor & Peak-to-Trough Analytics Types */
export type DrawdownRiskStatus = 'NORMAL' | 'WARNING' | 'CRITICAL' | 'EXTREME';

/**
 * จุดอ้างอิงที่ใช้คำนวณ drawdown — ต้องเป็นข้อมูลจริงเท่านั้น
 * CUSTOM = จุดสูงสุด/ต้นทุนที่ผู้ใช้บันทึกเอง · API_52W = 52-week high จากผู้ให้บริการข้อมูล
 * NONE = ยังไม่มีจุดอ้างอิง (ห้ามแต่งตัวเลขขึ้นมาเอง)
 */
/**
 * ที่มาของจุดพีคที่ใช้คำนวณ drawdown
 * - CUSTOM: ผู้ใช้ตั้งเอง (ชนะเสมอ)
 * - API_52W: จุดสูงสุด 52 สัปดาห์จากผู้ให้บริการข้อมูล
 * - AI_AUTO: AI เก็บ high-water mark จากราคาสดที่แอปเห็น (เรียลไทม์)
 * - NONE: ยังไม่มีจุดอ้างอิงจริง (ไม่นับ ไม่แจ้งเตือน)
 */
export type DrawdownReferenceSource = 'CUSTOM' | 'API_52W' | 'AI_AUTO' | 'NONE';

export interface DrawdownAsset {
  id: string;
  symbol: string;
  name: string;
  category: 'CRYPTO' | 'THAI_STOCK' | 'FOREIGN_STOCK' | 'FOREX';
  currentPrice: number;
  peakPrice: number;
  /** ที่มาของ peakPrice — 'NONE' แปลว่ายังติดตามไม่ได้ (แสดง 0% ไม่ใช่ค่าสมมติ) */
  referenceSource?: DrawdownReferenceSource;
  troughPrice: number;
  currentDrawdownPct: number;
  maxDrawdownPct: number;
  recoveryNeededPct: number;
  declineAmount: number;
  status: DrawdownRiskStatus;
  daysInDrawdown: number;
  underwaterCurve: number[];
  allocationPct?: number;
  lastUpdated: string;
}

export interface DrawdownThresholds {
  warning: number;  // e.g. -10
  critical: number; // e.g. -20
  extreme: number;  // e.g. -35
  soundEnabled: boolean;
}

export interface PortfolioDrawdownSummary {
  monitoredCount: number;
  warningCount: number;
  criticalCount: number;
  extremeCount: number;
  worstAssetSymbol: string;
  worstDrawdownPct: number;
  avgDrawdownPct: number;
  portfolioStatus: DrawdownRiskStatus;
  recommendedActionTh: string;
}
