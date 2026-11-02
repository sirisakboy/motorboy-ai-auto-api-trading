import {
  CryptoCoin,
  ThaiStock,
  ForeignStock,
  ForexPair,
  DrawdownAsset,
  DrawdownThresholds,
  PortfolioDrawdownSummary,
  DrawdownRiskStatus,
} from '../types';

export const DEFAULT_THRESHOLDS: DrawdownThresholds = {
  warning: -10,  // -10% drawdown
  critical: -20, // -20% drawdown
  extreme: -35,  // -35% drawdown
  soundEnabled: true,
};

const STORAGE_KEY_THRESHOLDS = 'trading_engine_drawdown_thresholds';
const STORAGE_KEY_CUSTOM_PEAKS = 'trading_engine_drawdown_custom_peaks';

/** Known reference peaks / ATHs if 52w high is unavailable */
const KNOWN_PEAKS: Record<string, { peak: number; trough: number }> = {
  BTC: { peak: 108900, trough: 62000 },
  ETH: { peak: 4090, trough: 2150 },
  SOL: { peak: 260, trough: 110 },
  BNB: { peak: 720, trough: 450 },
  XRP: { peak: 2.85, trough: 0.48 },
  SHIB: { peak: 0.0000350, trough: 0.0000120 },
  ADA: { peak: 1.25, trough: 0.32 },
  DOGE: { peak: 0.48, trough: 0.09 },
  AOT: { peak: 74.5, trough: 52.0 },
  CPALL: { peak: 71.0, trough: 54.0 },
  PTT: { peak: 36.5, trough: 30.5 },
  DELTA: { peak: 165.0, trough: 68.0 },
  SCC: { peak: 310.0, trough: 195.0 },
  KBANK: { peak: 158.0, trough: 122.0 },
  BH: { peak: 285.0, trough: 210.0 },
  ADVANC: { peak: 295.0, trough: 205.0 },
  GULF: { peak: 68.5, trough: 42.0 },
  TRUE: { peak: 12.8, trough: 6.8 },
  AAPL: { peak: 242.0, trough: 165.0 },
  NVDA: { peak: 153.0, trough: 85.0 },
  TSLA: { peak: 358.0, trough: 138.0 },
  GOOGL: { peak: 193.0, trough: 130.0 },
  MSFT: { peak: 468.0, trough: 388.0 },
  META: { peak: 610.0, trough: 420.0 },
  AMZN: { peak: 220.0, trough: 145.0 },
  AVGO: { peak: 185.0, trough: 115.0 },
  'USD/THB': { peak: 37.2, trough: 32.1 },
  'EUR/USD': { peak: 1.12, trough: 1.03 },
};

export function loadThresholds(): DrawdownThresholds {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_THRESHOLDS);
    if (raw) return { ...DEFAULT_THRESHOLDS, ...JSON.parse(raw) };
  } catch {
    // fallback
  }
  return DEFAULT_THRESHOLDS;
}

export function saveThresholds(thresholds: DrawdownThresholds): void {
  try {
    localStorage.setItem(STORAGE_KEY_THRESHOLDS, JSON.stringify(thresholds));
  } catch (e) {
    console.warn('Failed to save drawdown thresholds:', e);
  }
}

export function loadCustomPeaks(): Record<string, number> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CUSTOM_PEAKS);
    if (raw) return JSON.parse(raw);
  } catch {
    // fallback
  }
  return {};
}

export function saveCustomPeak(symbol: string, peak: number): void {
  try {
    const existing = loadCustomPeaks();
    existing[symbol.toUpperCase()] = peak;
    localStorage.setItem(STORAGE_KEY_CUSTOM_PEAKS, JSON.stringify(existing));
  } catch (e) {
    console.warn('Failed to save custom peak:', e);
  }
}

export function determineRiskStatus(
  drawdownPct: number,
  thresholds: DrawdownThresholds
): DrawdownRiskStatus {
  if (drawdownPct <= thresholds.extreme) return 'EXTREME';
  if (drawdownPct <= thresholds.critical) return 'CRITICAL';
  if (drawdownPct <= thresholds.warning) return 'WARNING';
  return 'NORMAL';
}

/**
 * Generate 12-16 simulated/interpolated data points for underwater curve rendering
 */
function generateUnderwaterCurve(
  currentDrawdown: number,
  maxDrawdown: number
): number[] {
  const points = 14;
  const curve: number[] = [0]; // starts at peak (0%)
  const troughIndex = Math.floor(points * 0.65);

  for (let i = 1; i < points - 1; i++) {
    if (i <= troughIndex) {
      // heading down towards trough
      const progress = i / troughIndex;
      const noise = (Math.sin(i * 1.5) * 1.5) * (1 - progress);
      const val = maxDrawdown * Math.pow(progress, 1.2) + noise;
      curve.push(Math.min(0, Math.max(maxDrawdown, Number(val.toFixed(2)))));
    } else {
      // recovering from trough towards current drawdown
      const recProgress = (i - troughIndex) / (points - 1 - troughIndex);
      const val = maxDrawdown + (currentDrawdown - maxDrawdown) * Math.pow(recProgress, 0.8);
      curve.push(Math.min(0, Math.max(maxDrawdown, Number(val.toFixed(2)))));
    }
  }

  curve.push(Number(currentDrawdown.toFixed(2)));
  return curve;
}

/**
 * Builds standard DrawdownAsset objects from market feeds
 */
export function buildDrawdownAssets(params: {
  cryptoList?: CryptoCoin[];
  thaiStocks?: ThaiStock[];
  foreignStocks?: ForeignStock[];
  forexRates?: ForexPair[];
  thresholds: DrawdownThresholds;
  customPeaks?: Record<string, number>;
}): DrawdownAsset[] {
  const {
    cryptoList = [],
    thaiStocks = [],
    foreignStocks = [],
    forexRates = [],
    thresholds,
    customPeaks = {},
  } = params;

  const result: DrawdownAsset[] = [];

  // 1. Process Cryptos
  cryptoList.forEach((c) => {
    const symbol = c.symbol.toUpperCase();
    const currentPrice = c.price;
    const known = KNOWN_PEAKS[symbol];
    const custom = customPeaks[symbol];
    const peakPrice = custom || (c.high && c.high > currentPrice ? c.high * 1.15 : known?.peak || currentPrice * 1.25);
    const troughPrice = known?.trough || (c.low && c.low < currentPrice ? c.low * 0.9 : currentPrice * 0.7);

    const currentDrawdownPct = peakPrice > 0 ? ((currentPrice - peakPrice) / peakPrice) * 100 : 0;
    const maxDrawdownPct = peakPrice > 0 ? ((troughPrice - peakPrice) / peakPrice) * 100 : currentDrawdownPct;
    const recoveryNeededPct = currentPrice > 0 ? ((peakPrice / currentPrice) - 1) * 100 : 0;
    const declineAmount = Math.max(0, peakPrice - currentPrice);
    const status = determineRiskStatus(currentDrawdownPct, thresholds);

    result.push({
      id: `crypto_${symbol}`,
      symbol,
      name: c.name || symbol,
      category: 'CRYPTO',
      currentPrice,
      peakPrice: +peakPrice.toFixed(2),
      troughPrice: +troughPrice.toFixed(2),
      currentDrawdownPct: +currentDrawdownPct.toFixed(2),
      maxDrawdownPct: +maxDrawdownPct.toFixed(2),
      recoveryNeededPct: +recoveryNeededPct.toFixed(2),
      declineAmount: +declineAmount.toFixed(2),
      status,
      daysInDrawdown: Math.max(1, Math.round(Math.abs(currentDrawdownPct) * 2.8)),
      underwaterCurve: generateUnderwaterCurve(currentDrawdownPct, maxDrawdownPct),
      lastUpdated: new Date().toLocaleTimeString('th-TH'),
    });
  });

  // 2. Process Foreign / US Stocks
  foreignStocks.forEach((s) => {
    const symbol = s.symbol.toUpperCase();
    const currentPrice = s.price;
    const known = KNOWN_PEAKS[symbol];
    const custom = customPeaks[symbol];
    const peakPrice = custom || s.high52w || known?.peak || currentPrice * 1.18;
    const troughPrice = s.low52w || known?.trough || currentPrice * 0.78;

    const currentDrawdownPct = peakPrice > 0 ? ((currentPrice - peakPrice) / peakPrice) * 100 : 0;
    const maxDrawdownPct = peakPrice > 0 ? ((troughPrice - peakPrice) / peakPrice) * 100 : currentDrawdownPct;
    const recoveryNeededPct = currentPrice > 0 ? ((peakPrice / currentPrice) - 1) * 100 : 0;
    const declineAmount = Math.max(0, peakPrice - currentPrice);
    const status = determineRiskStatus(currentDrawdownPct, thresholds);

    result.push({
      id: `us_${symbol}`,
      symbol,
      name: s.name || symbol,
      category: 'FOREIGN_STOCK',
      currentPrice,
      peakPrice: +peakPrice.toFixed(2),
      troughPrice: +troughPrice.toFixed(2),
      currentDrawdownPct: +currentDrawdownPct.toFixed(2),
      maxDrawdownPct: +maxDrawdownPct.toFixed(2),
      recoveryNeededPct: +recoveryNeededPct.toFixed(2),
      declineAmount: +declineAmount.toFixed(2),
      status,
      daysInDrawdown: Math.max(1, Math.round(Math.abs(currentDrawdownPct) * 3.2)),
      underwaterCurve: generateUnderwaterCurve(currentDrawdownPct, maxDrawdownPct),
      lastUpdated: new Date().toLocaleTimeString('th-TH'),
    });
  });

  // 3. Process Thai Stocks
  thaiStocks.forEach((s) => {
    const symbol = s.symbol.toUpperCase();
    const currentPrice = s.price;
    const known = KNOWN_PEAKS[symbol];
    const custom = customPeaks[symbol];
    const peakPrice = custom || known?.peak || +(currentPrice * 1.15).toFixed(2);
    const troughPrice = known?.trough || +(currentPrice * 0.85).toFixed(2);

    const currentDrawdownPct = peakPrice > 0 ? ((currentPrice - peakPrice) / peakPrice) * 100 : 0;
    const maxDrawdownPct = peakPrice > 0 ? ((troughPrice - peakPrice) / peakPrice) * 100 : currentDrawdownPct;
    const recoveryNeededPct = currentPrice > 0 ? ((peakPrice / currentPrice) - 1) * 100 : 0;
    const declineAmount = Math.max(0, peakPrice - currentPrice);
    const status = determineRiskStatus(currentDrawdownPct, thresholds);

    result.push({
      id: `thai_${symbol}`,
      symbol,
      name: s.nameEn || s.name || symbol,
      category: 'THAI_STOCK',
      currentPrice,
      peakPrice: +peakPrice.toFixed(2),
      troughPrice: +troughPrice.toFixed(2),
      currentDrawdownPct: +currentDrawdownPct.toFixed(2),
      maxDrawdownPct: +maxDrawdownPct.toFixed(2),
      recoveryNeededPct: +recoveryNeededPct.toFixed(2),
      declineAmount: +declineAmount.toFixed(2),
      status,
      daysInDrawdown: Math.max(1, Math.round(Math.abs(currentDrawdownPct) * 2.5)),
      underwaterCurve: generateUnderwaterCurve(currentDrawdownPct, maxDrawdownPct),
      lastUpdated: new Date().toLocaleTimeString('th-TH'),
    });
  });

  // 4. Process Key Forex Pairs
  forexRates.slice(0, 4).forEach((f) => {
    const symbol = f.pair;
    const currentPrice = f.price;
    const known = KNOWN_PEAKS[symbol];
    const custom = customPeaks[symbol];
    const peakPrice = custom || known?.peak || +(currentPrice * 1.05).toFixed(4);
    const troughPrice = known?.trough || +(currentPrice * 0.95).toFixed(4);

    const currentDrawdownPct = peakPrice > 0 ? ((currentPrice - peakPrice) / peakPrice) * 100 : 0;
    const maxDrawdownPct = peakPrice > 0 ? ((troughPrice - peakPrice) / peakPrice) * 100 : currentDrawdownPct;
    const recoveryNeededPct = currentPrice > 0 ? ((peakPrice / currentPrice) - 1) * 100 : 0;
    const declineAmount = Math.max(0, peakPrice - currentPrice);
    const status = determineRiskStatus(currentDrawdownPct, thresholds);

    result.push({
      id: `fx_${symbol}`,
      symbol,
      name: `อัตราแลกเปลี่ยน ${symbol}`,
      category: 'FOREX',
      currentPrice,
      peakPrice: +peakPrice.toFixed(4),
      troughPrice: +troughPrice.toFixed(4),
      currentDrawdownPct: +currentDrawdownPct.toFixed(2),
      maxDrawdownPct: +maxDrawdownPct.toFixed(2),
      recoveryNeededPct: +recoveryNeededPct.toFixed(2),
      declineAmount: +declineAmount.toFixed(4),
      status,
      daysInDrawdown: Math.max(1, Math.round(Math.abs(currentDrawdownPct) * 4.5)),
      underwaterCurve: generateUnderwaterCurve(currentDrawdownPct, maxDrawdownPct),
      lastUpdated: new Date().toLocaleTimeString('th-TH'),
    });
  });

  return result.sort((a, b) => a.currentDrawdownPct - b.currentDrawdownPct);
}

/**
 * Computes portfolio-wide drawdown metrics and strategic recommendation
 */
export function computePortfolioDrawdownSummary(
  assets: DrawdownAsset[]
): PortfolioDrawdownSummary {
  if (assets.length === 0) {
    return {
      monitoredCount: 0,
      warningCount: 0,
      criticalCount: 0,
      extremeCount: 0,
      worstAssetSymbol: '-',
      worstDrawdownPct: 0,
      avgDrawdownPct: 0,
      portfolioStatus: 'NORMAL',
      recommendedActionTh: 'ไม่มีสินทรัพย์ที่กำลังติดตามในระบบ',
    };
  }

  let warningCount = 0;
  let criticalCount = 0;
  let extremeCount = 0;
  let totalDrawdown = 0;
  let worstAsset = assets[0];

  assets.forEach((a) => {
    totalDrawdown += a.currentDrawdownPct;
    if (a.status === 'EXTREME') extremeCount++;
    else if (a.status === 'CRITICAL') criticalCount++;
    else if (a.status === 'WARNING') warningCount++;

    if (a.currentDrawdownPct < worstAsset.currentDrawdownPct) {
      worstAsset = a;
    }
  });

  const avgDrawdownPct = +(totalDrawdown / assets.length).toFixed(2);

  let portfolioStatus: DrawdownRiskStatus = 'NORMAL';
  let recommendedActionTh = 'พอร์ตโฟลิโออยู่ในเกณฑ์ปกติ การย่อตัวยังอยู่ในกรอบบริหารความเสี่ยงทั่วไป';

  if (extremeCount > 0 || avgDrawdownPct <= -25) {
    portfolioStatus = 'EXTREME';
    recommendedActionTh = `⚠️ สัญญาณอันตรายระดับรุนแรง: มี ${extremeCount} สินทรัพย์ย่อตัวเกินเกณฑ์วิกฤต แนะนำปรับลดขนาด Position (De-risk), ตั้ง Hard Stop Loss ทันที และงดเปิดสถานะ Leverage เพิ่ม`;
  } else if (criticalCount > 0 || avgDrawdownPct <= -15) {
    portfolioStatus = 'CRITICAL';
    recommendedActionTh = `🚨 สินทรัพย์หลุดแนวรับสำคัญ: มี ${criticalCount} สินทรัพย์แตะระดับ Critical (${worstAsset.symbol} ลดลง ${worstAsset.currentDrawdownPct}%) แนะนำเตรียมแผน Cut Loss หรือกระจายความเสี่ยง (Hedging)`;
  } else if (warningCount > 0 || avgDrawdownPct <= -8) {
    portfolioStatus = 'WARNING';
    recommendedActionTh = `⚡ เฝ้าระวังใกล้ชิด: ตรวจพบ ${warningCount} สินทรัพย์เริ่มเข้าสู่โซนย่อตัว แนะนำทบทวนจุด Trailing Stop และจำกัดการถัวเฉลี่ยขาลง`;
  }

  return {
    monitoredCount: assets.length,
    warningCount,
    criticalCount,
    extremeCount,
    worstAssetSymbol: worstAsset.symbol,
    worstDrawdownPct: worstAsset.currentDrawdownPct,
    avgDrawdownPct,
    portfolioStatus,
    recommendedActionTh,
  };
}

/**
 * Web Audio API gentle alert beep (safe, non-blocking)
 */
export function playDrawdownAlertChime(severity: 'WARNING' | 'CRITICAL' | 'EXTREME'): void {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = severity === 'EXTREME' ? 'sawtooth' : severity === 'CRITICAL' ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(severity === 'EXTREME' ? 220 : severity === 'CRITICAL' ? 330 : 440, ctx.currentTime);
    
    // Frequency drop for warning effect
    osc.frequency.exponentialRampToValueAtTime(180, ctx.currentTime + 0.28);

    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.32);
  } catch (e) {
    // Audio may be blocked by browser policy until user interacts, safely ignore
  }
}
