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
 * ปัดราคาตามขนาดจริง (SHIB ต้องไม่ถูกปัดเป็น 0.00)
 * ใช้กติกาเดียวกับ formatCryptoPrice: <0.01 → 8 ตำแหน่ง, <1 → 4, >=1 → 2
 */
function roundPrice(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const abs = Math.abs(value);
  const decimals = abs < 0.01 ? 8 : abs < 1 ? 4 : 2;
  return Number(value.toFixed(decimals));
}

/**
 * จุดพีคที่ "ใช้ได้จริง" เท่านั้น:
 * ต้องเป็นค่าบวก finite, ต้องสูงกว่าราคาปัจจุบัน (ไม่งั้นไม่ใช่จุดพีค)
 * และต้องไม่ผิดสเกลจนเกิน 20 เท่า (เช่น ข้อมูลคนละหน่วย/คนละสินทรัพย์)
 */
function sanitizePeak(peak: number | undefined | null, currentPrice: number): number | null {
  if (typeof peak !== 'number' || !Number.isFinite(peak) || peak <= 0) return null;
  if (!Number.isFinite(currentPrice) || currentPrice <= 0) return null;
  if (peak <= currentPrice) return null;
  if (peak > currentPrice * 20) return null;
  return peak;
}

interface BuildRowParams {
  id: string;
  symbol: string;
  name: string;
  category: DrawdownAsset['category'];
  currentPrice: number;
  /** จุดสูงสุดที่ผู้ใช้บันทึกเอง (มาก่อนเสมอ) */
  customPeak?: number;
  /** 52-week high จากผู้ให้บริการข้อมูล (มีเฉพาะหุ้นต่างประเทศ) */
  apiPeak?: number;
  troughPrice?: number;
  thresholds: DrawdownThresholds;
  /** ตัวคูณประมาณจำนวนวันใน drawdown (ใช้เฉพาะเมื่อมีจุดอ้างอิงจริง) */
  daysFactor: number;
}

/**
 * สร้างแถว drawdown จาก "จุดอ้างอิงจริง" เท่านั้น
 *
 * บั๊กเดิม: ถ้าไม่มีข้อมูล peak โค้ดจะแต่งขึ้นมา (`currentPrice * 1.25`) และมี
 * ตาราง KNOWN_PEAKS ที่ฝัง ATH เก่าไว้ (SHIB 0.0000350) → แบนเนอร์เด้งว่า
 * "พอร์ตย่อตัวแรง SHIB -85.79%" ทั้งที่ราคาปัจจุบันเพิ่งวิ่งขึ้น
 * ตอนนี้: ไม่มีจุดอ้างอิง = 0% + `referenceSource: 'NONE'` (ไม่แจ้งเตือน)
 */
function buildDrawdownRow(params: BuildRowParams): DrawdownAsset {
  const {
    id, symbol, name, category, currentPrice, customPeak, apiPeak, troughPrice, thresholds, daysFactor,
  } = params;

  const custom = sanitizePeak(customPeak, currentPrice);
  const fromApi = sanitizePeak(apiPeak, currentPrice);
  const peakPrice = custom ?? fromApi ?? null;
  const referenceSource = custom !== null ? 'CUSTOM' : fromApi !== null ? 'API_52W' : 'NONE';

  const currentDrawdownPct =
    peakPrice !== null ? Number((((currentPrice - peakPrice) / peakPrice) * 100).toFixed(2)) : 0;

  const effectivePeak = peakPrice ?? currentPrice;
  const effectiveTrough =
    typeof troughPrice === 'number' && Number.isFinite(troughPrice) && troughPrice > 0 && troughPrice < effectivePeak
      ? troughPrice
      : effectivePeak;
  const maxDrawdownPct =
    effectivePeak > 0
      ? Number((((effectiveTrough - effectivePeak) / effectivePeak) * 100).toFixed(2))
      : currentDrawdownPct;

  const recoveryNeededPct =
    peakPrice !== null && currentPrice > 0
      ? Number((((peakPrice / currentPrice) - 1) * 100).toFixed(2))
      : 0;

  return {
    id,
    symbol,
    name,
    category,
    currentPrice: roundPrice(currentPrice),
    peakPrice: roundPrice(effectivePeak),
    troughPrice: roundPrice(effectiveTrough),
    currentDrawdownPct,
    maxDrawdownPct,
    recoveryNeededPct,
    declineAmount: peakPrice !== null ? roundPrice(peakPrice - currentPrice) : 0,
    status: peakPrice !== null ? determineRiskStatus(currentDrawdownPct, thresholds) : 'NORMAL',
    daysInDrawdown:
      peakPrice !== null ? Math.max(1, Math.round(Math.abs(currentDrawdownPct) * daysFactor)) : 0,
    underwaterCurve: generateUnderwaterCurve(currentDrawdownPct, maxDrawdownPct),
    referenceSource,
    lastUpdated: new Date().toLocaleTimeString('th-TH'),
  };
}

/**
 * Builds standard DrawdownAsset objects from market feeds.
 * เฉพาะสินทรัพย์ที่มีราคาจริง และมี "จุดอ้างอิงจริง" เท่านั้นที่จะถูกนับเป็น drawdown
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
  const hasPrice = (price: unknown): price is number =>
    typeof price === 'number' && Number.isFinite(price) && price > 0;

  // 1) คริปโต — จุดอ้างอิงมาจากที่ผู้ใช้บันทึกเท่านั้น (ข้อมูล 52w ไม่มีในฟีดนี้)
  cryptoList.filter((c) => hasPrice(c.price)).forEach((c) => {
    const symbol = c.symbol.toUpperCase();
    result.push(
      buildDrawdownRow({
        id: `crypto_${symbol}`,
        symbol,
        name: c.name || symbol,
        category: 'CRYPTO',
        currentPrice: c.price,
        customPeak: customPeaks[symbol],
        troughPrice: c.low,
        thresholds,
        daysFactor: 2.8,
      })
    );
  });

  // 2) หุ้นสหรัฐฯ — ใช้ 52-week high จากผู้ให้บริการข้อมูลเป็นจุดอ้างอิงจริงได้
  foreignStocks.filter((s) => hasPrice(s.price)).forEach((s) => {
    const symbol = s.symbol.toUpperCase();
    result.push(
      buildDrawdownRow({
        id: `us_${symbol}`,
        symbol,
        name: s.name || symbol,
        category: 'FOREIGN_STOCK',
        currentPrice: s.price,
        customPeak: customPeaks[symbol],
        apiPeak: s.high52w,
        troughPrice: s.low52w,
        thresholds,
        daysFactor: 3.2,
      })
    );
  });

  // 3) หุ้นไทย
  thaiStocks.filter((s) => hasPrice(s.price)).forEach((s) => {
    const symbol = s.symbol.toUpperCase();
    result.push(
      buildDrawdownRow({
        id: `thai_${symbol}`,
        symbol,
        name: s.nameEn || s.name || symbol,
        category: 'THAI_STOCK',
        currentPrice: s.price,
        customPeak: customPeaks[symbol],
        thresholds,
        daysFactor: 2.5,
      })
    );
  });

  // 4) คู่เงินหลัก
  forexRates.filter((f) => hasPrice(f.price)).slice(0, 4).forEach((f) => {
    result.push(
      buildDrawdownRow({
        id: `fx_${f.pair}`,
        symbol: f.pair,
        name: `อัตราแลกเปลี่ยน ${f.pair}`,
        category: 'FOREX',
        currentPrice: f.price,
        customPeak: customPeaks[f.pair],
        thresholds,
        daysFactor: 4.5,
      })
    );
  });

  // สินทรัพย์ที่ยังไม่มีจุดอ้างอิงไปท้ายรายการ (ให้ผู้ใช้ตั้งจุดพีคก่อน)
  return result.sort((a, b) => {
    const aNone = a.referenceSource === 'NONE' ? 1 : 0;
    const bNone = b.referenceSource === 'NONE' ? 1 : 0;
    if (aNone !== bNone) return aNone - bNone;
    return a.currentDrawdownPct - b.currentDrawdownPct;
  });
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

  // นับเฉพาะสินทรัพย์ที่มี "จุดอ้างอิงจริง" — สินทรัพย์ที่ยังไม่มีจุดพีค
  // ไม่ควรถูกนับเป็น 0% แล้วถ่วงค่าเฉลี่ยจนดูปลอดภัยกว่าความเป็นจริง
  const monitored = assets.filter((a) => a.referenceSource !== 'NONE');
  if (monitored.length === 0) {
    return {
      monitoredCount: 0,
      warningCount: 0,
      criticalCount: 0,
      extremeCount: 0,
      worstAssetSymbol: '-',
      worstDrawdownPct: 0,
      avgDrawdownPct: 0,
      portfolioStatus: 'NORMAL',
      recommendedActionTh:
        'ยังไม่มีจุดอ้างอิงสำหรับคำนวณ Drawdown — เปิดหน้าติดตามแล้วตั้ง “จุดสูงสุด” ของสินทรัพย์ที่คุณถืออยู่ก่อน',
    };
  }

  let warningCount = 0;
  let criticalCount = 0;
  let extremeCount = 0;
  let totalDrawdown = 0;
  let worstAsset = monitored[0];

  monitored.forEach((a) => {
    totalDrawdown += a.currentDrawdownPct;
    if (a.status === 'EXTREME') extremeCount++;
    else if (a.status === 'CRITICAL') criticalCount++;
    else if (a.status === 'WARNING') warningCount++;

    if (a.currentDrawdownPct < worstAsset.currentDrawdownPct) {
      worstAsset = a;
    }
  });

  const avgDrawdownPct = +(totalDrawdown / monitored.length).toFixed(2);

  let portfolioStatus: DrawdownRiskStatus = 'NORMAL';
  let recommendedActionTh = 'พอร์ตโฟลิโออยู่ในเกณฑ์ปกติ การย่อตัวยังอยู่ในกรอบบริหารความเสี่ยงทั่วไป';

  if (extremeCount > 0 || avgDrawdownPct <= -25) {
    portfolioStatus = 'EXTREME';
    recommendedActionTh = `⚠️ สัญญาณอันตรายระดับรุนแรง: มี ${extremeCount} สินทรัพย์ย่อตัวเกินเกณฑ์วิกฤต แนะนำปรับลดขนาด Position (De-risk), ตั้ง Hard Stop Loss ทันที และงดเปิดสถานะ Leverage เพิ่ม`;
  } else if (criticalCount > 0 || avgDrawdownPct <= -15) {
    portfolioStatus = 'CRITICAL';
    recommendedActionTh = `⚠️ สินทรัพย์หลุดแนวรับสำคัญ: มี ${criticalCount} สินทรัพย์แตะระดับ Critical (${worstAsset.symbol} ลดลง ${worstAsset.currentDrawdownPct}%) แนะนำเตรียมแผน Cut Loss หรือกระจายความเสี่ยง (Hedging)`;
  } else if (warningCount > 0 || avgDrawdownPct <= -8) {
    portfolioStatus = 'WARNING';
    recommendedActionTh = `⚡ เฝ้าระวังใกล้ชิด: ตรวจพบ ${warningCount} สินทรัพย์เริ่มเข้าสู่โซนย่อตัว แนะนำทบทวนจุด Trailing Stop และจำกัดการถัวเฉลี่ยขาลง`;
  }

  return {
    monitoredCount: monitored.length,
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
