import { CryptoCoin, ForexPair, ForeignStock, ThaiStock } from '../types';

/**
 * AI auto peak tracker
 * ---------------------------------------------------------------------------
 * เดิมจุดพีค (peak) ของ drawdown ต้องให้ผู้ใช้กด "ตั้งจุดพีค" เองทีละตัว
 * ทำให้หน้าจอว่างเปล่าและไม่มีใครตั้งจริง ระบบจึงไม่เคยเตือนอะไรเลย
 *
 * ตัวนี้ให้ "AI ภายใน" เก็บ high-water mark ของราคาที่แอปเห็นจริงแบบเรียลไทม์:
 * - ทุกครั้งที่ฟีดราคาใหม่เข้ามา (คริปโต/หุ้นไทย/หุ้นต่างประเทศ/ฟอเร็กซ์)
 *   จะเทียบกับพีคเดิม แล้วเก็บค่าที่สูงกว่า
 * - เก็บลง localStorage เพื่อให้พีคไม่หายเมื่อรีเฟรช
 * - ไม่แต่งตัวเลขขึ้นเอง: พีคทุกตัวมาจากราคาจริงที่เคยเห็นเท่านั้น
 *   และพีคที่ผู้ใช้ตั้งเองยังชนะเสมอ (จัดการที่ drawdownService)
 */

export const AUTO_PEAK_STORAGE_KEY = 'trading_engine_drawdown_auto_peaks';

export interface AutoPeakEntry {
  /** ราคาสูงสุดที่ AI เคยเห็น (high-water mark) */
  peak: number;
  /** เวลาที่พีคนี้ถูกบันทึก (ISO) */
  at: string;
}

export type AutoPeakBook = Record<string, AutoPeakEntry>;

export interface PeakObservation {
  symbol: string;
  price: number;
}

function isUsablePrice(price: unknown): price is number {
  return typeof price === 'number' && Number.isFinite(price) && price > 0;
}

/** โหลดพีคที่ AI เก็บไว้ (ถ้าเสียหายให้เริ่มใหม่ ไม่ throw) */
export function loadAutoPeaks(): AutoPeakBook {
  try {
    const raw = localStorage.getItem(AUTO_PEAK_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const book: AutoPeakBook = {};
    Object.entries(parsed as Record<string, unknown>).forEach(([symbol, entry]) => {
      if (!entry || typeof entry !== 'object') return;
      const { peak, at } = entry as { peak?: unknown; at?: unknown };
      if (!isUsablePrice(peak)) return;
      book[symbol.toUpperCase()] = {
        peak,
        at: typeof at === 'string' && !Number.isNaN(Date.parse(at)) ? at : new Date().toISOString(),
      };
    });
    return book;
  } catch {
    return {};
  }
}

export function saveAutoPeaks(book: AutoPeakBook): void {
  try {
    localStorage.setItem(AUTO_PEAK_STORAGE_KEY, JSON.stringify(book));
  } catch (error) {
    console.warn('Failed to save AI peaks:', error);
  }
}

/**
 * อัปเดต high-water mark จากราคาที่เพิ่งเห็น
 *
 * คืน object เดิม (reference เดียวกัน) เมื่อไม่มีอะไรเปลี่ยน เพื่อไม่ให้ React
 * re-render ทุก 15 วินาทีโดยไม่จำเป็น
 */
export function trackPeaks(
  book: AutoPeakBook,
  observations: PeakObservation[],
  nowIso: string = new Date().toISOString()
): AutoPeakBook {
  let changed = false;
  const next: AutoPeakBook = { ...book };

  observations.forEach(({ symbol, price }) => {
    if (!symbol || !isUsablePrice(price)) return;
    const key = symbol.toUpperCase();
    const previous = next[key];
    if (!previous) {
      next[key] = { peak: price, at: nowIso };
      changed = true;
      return;
    }
    if (price > previous.peak) {
      next[key] = { peak: price, at: nowIso };
      changed = true;
    }
  });

  return changed ? next : book;
}

/** แปลง book → Record<symbol, peak> ให้ drawdownService ใช้ */
export function autoPeakValues(book: AutoPeakBook): Record<string, number> {
  const values: Record<string, number> = {};
  Object.entries(book).forEach(([symbol, entry]) => {
    if (isUsablePrice(entry.peak)) values[symbol] = entry.peak;
  });
  return values;
}

/**
 * ดึงราคาจากทุกฟีดที่แอปมีอยู่แล้ว → observation list สำหรับ trackPeaks
 *
 * ข้าม 2 กรณี:
 * - ราคาเป็น 0/ไม่มีค่า (เช่น ข้อมูลตั้งต้นที่ยังไม่ได้ดึงราคา)
 * - `isLive === false` (ราคาสำรอง/ข้อมูล ณ เวลาหนึ่ง) — พีคต้องมาจากราคาสดจริง
 *   เท่านั้น ไม่งั้นข้อมูลตั้งต้นจะกลายเป็น "จุดพีค" ปลอมที่ทำให้ drawdown เพี้ยน
 */
export function observationsFromFeeds(params: {
  cryptoList?: CryptoCoin[];
  thaiStocks?: ThaiStock[];
  foreignStocks?: ForeignStock[];
  forexRates?: ForexPair[];
}): PeakObservation[] {
  const { cryptoList = [], thaiStocks = [], foreignStocks = [], forexRates = [] } = params;
  const observations: PeakObservation[] = [];

  // CryptoCoin ไม่มีฟิลด์ isLive (ราคา 0 = ยังไม่เคยดึง) จึงตรวจแบบ structural
  const stillLive = (item: object) => (item as { isLive?: boolean }).isLive !== false;

  cryptoList.forEach((coin) => {
    if (stillLive(coin) && isUsablePrice(coin.price)) {
      observations.push({ symbol: coin.symbol, price: coin.price });
    }
  });
  thaiStocks.forEach((stock) => {
    if (stillLive(stock) && isUsablePrice(stock.price)) {
      observations.push({ symbol: stock.symbol, price: stock.price });
    }
  });
  foreignStocks.forEach((stock) => {
    if (stillLive(stock) && isUsablePrice(stock.price)) {
      observations.push({ symbol: stock.symbol, price: stock.price });
    }
  });
  forexRates.forEach((rate) => {
    if (stillLive(rate) && isUsablePrice(rate.price)) {
      observations.push({ symbol: rate.pair, price: rate.price });
    }
  });

  return observations;
}
