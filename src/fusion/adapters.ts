/**
 * FUSION CORE — adapter ชั้นบางระหว่าง "ข้อมูลที่แอปมีจริง" กับ "schema ของสเปก"
 *
 * แนวคิดที่ตกลงกัน: schema หลักยังเป็นชื่อ field ตามสเปก (exchange_netflow_usd,
 * etf_net_flow_usd, cot_net_position_pct …) และมี adapter แปลงข้อมูลในโปรเจกต์
 * ให้เข้ารูปนั้น — ไม่ใช่ไปเปลี่ยนสเปกให้ตรงกับของที่เรามี
 *
 * ⚠️ ความซื่อสัตย์ของข้อมูล: แอปนี้มีราคา/ส่วนเปลี่ยน/วอลุ่ม ไม่มี on-chain flow
 * หรือ Fund Flow จริง adapter จึงสร้าง **proxy** และติดป้ายไว้เสมอ
 * (`source: … | proxy:price+volume` + reason ขึ้นต้นว่า "ประมาณจากราคา/วอลุ่ม")
 * เมื่อมี API โฟลว์จริงในอนาคต แค่ส่งข้อมูลชุด canonical เข้า `analyzeWhale()`
 * ตรง ๆ — ไม่ต้องแก้ scoring เลย
 */

import type { CryptoCoin, ForexPair, ForeignStock, StockIndex, ThaiStock } from '../types';
import { createModuleSignal, canonicalAssetType, type ModuleSignal } from './types';
import { PROXY_FIELDS, analyzeWhale, clamp, pythonRound, type MoneyFlowData } from './whale';

/**
 * ตัวคูณลดความมั่นใจเมื่อใช้ proxy (ราคา/วอลุ่ม ไม่ใช่โฟลว์จริง)
 * 0.55 = หลักฐานแบบนี้อ่อนกว่าข้อมูล on-chain/สถาบันจริงประมาณครึ่งหนึ่ง
 */
export const PROXY_CONFIDENCE_FACTOR = 0.55;

/** ชื่อแท็บจริงของแดชบอร์ด (ตรงกับ `tabs` ใน App.tsx) */
export type AppTab = 'crypto' | 'forex' | 'th' | 'us' | 'index';

/** ข้อมูลหนึ่งสินทรัพย์ในรูปที่แอปมี — ไม่ผูกกับ UI ใด ๆ */
export interface AppQuote {
  symbol: string;
  assetType: AppTab | string;
  price?: number;
  /** % เปลี่ยนแปลง (แอปเก็บเป็นเปอร์เซ็นต์ทุกแท็บ) */
  changePct?: number;
  /** ปริมาณซื้อขาย — คริปโตเป็น quote volume (USD), หุ้นเป็นจำนวนหุ้น */
  volume?: number;
  high?: number;
  low?: number;
  prevClose?: number;
}

function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/* ------------------------------------------------------- app shape -> quote */

/** คริปโต: `volume` ของแอปเป็น quote volume (USD) อยู่แล้ว */
export function quoteFromCryptoCoin(coin: CryptoCoin): AppQuote {
  return {
    symbol: coin.symbol,
    assetType: 'crypto',
    price: num(coin.price),
    changePct: num(coin.change),
    volume: num(coin.volume),
    high: num(coin.high),
    low: num(coin.low),
    prevClose: num(coin.prevPrice),
  };
}

/** ฟอเรกซ์: แอปไม่มีวอลุ่ม — ได้แค่ทิศทางราคา (coverage จะต่ำตามจริง) */
export function quoteFromForexPair(pair: ForexPair): AppQuote {
  return {
    symbol: pair.pair,
    assetType: 'forex',
    price: num(pair.price),
    changePct: num(pair.change),
  };
}

/** หุ้นไทย: `volume` เป็นจำนวนหุ้น → ต้องคูณราคาก่อนใช้เป็นเงิน */
export function quoteFromThaiStock(stock: ThaiStock): AppQuote {
  return {
    symbol: stock.symbol,
    assetType: 'th',
    price: num(stock.price),
    changePct: num(stock.change),
    volume: num(stock.volume),
  };
}

/** หุ้นนอก: `volume` เป็นจำนวนหุ้นเช่นกัน */
export function quoteFromForeignStock(stock: ForeignStock): AppQuote {
  return {
    symbol: stock.symbol,
    assetType: 'us',
    price: num(stock.price),
    changePct: num(stock.change),
    volume: num(stock.volume),
    high: num(stock.high52w),
    low: num(stock.low52w),
  };
}

/** ดัชนี: ไม่มีวอลุ่มในข้อมูลของแอป */
export function quoteFromStockIndex(index: StockIndex): AppQuote {
  return {
    symbol: index.symbol,
    assetType: 'index',
    price: num(index.price),
    changePct: num(index.change),
  };
}

/* -------------------------------------------------- quote -> canonical flow */

const CRYPTO_TABS: readonly string[] = ['crypto', 'crypto_major', 'crypto_meme', 'coin'];
const SHARE_TABS: readonly string[] = ['th', 'us', 'thai_stock', 'us_stock', 'stock', 'foreign_stocks'];

/** มูลค่าซื้อขายเป็นเงิน (turnover) — คริปโตให้มาแล้ว, หุ้นต้องคูณราคา */
export function turnoverOf(quote: AppQuote): number | undefined {
  const volume = num(quote.volume);
  if (volume === undefined || volume <= 0) return undefined;
  const tab = String(quote.assetType).trim().toLowerCase();
  if (CRYPTO_TABS.includes(tab)) return volume; // quote volume (USD)
  if (SHARE_TABS.includes(tab)) {
    const price = num(quote.price);
    return price !== undefined && price > 0 ? volume * price : undefined;
  }
  return undefined;
}

/**
 * แปลง quote ของแอปเป็น field ตาม schema ของสเปก (เป็น proxy ทั้งหมด)
 *
 * | field ของสเปก              | มาจากไหนในแอป                                |
 * | -------------------------- | -------------------------------------------- |
 * | `net_flow_usd`             | turnover × ทิศทางและขนาดของ %เปลี่ยน          |
 * | `positioning_change_pct`   | %เปลี่ยนของราคา (ใช้เป็นทิศทาง positioning)   |
 * | `large_tx_net_buy_ratio`   | 0.5 ± (%เปลี่ยน/20) — โมเมนตัมเป็น proxy      |
 *
 * ตัวเลขที่ไม่มีข้อมูลจะไม่ถูกใส่เข้าไปเลย (ให้ coverage ต่ำตามจริง)
 */
export function moneyFlowFromQuote(quote: AppQuote): MoneyFlowData {
  const data: Record<string, number> = {};
  const changePct = num(quote.changePct);
  const turnover = turnoverOf(quote);

  if (turnover !== undefined && changePct !== undefined) {
    // ทิศทาง = เครื่องหมายของ %เปลี่ยน, ขนาด = สัดส่วนการเปลี่ยน (สูงสุด 100%)
    data.net_flow_usd = turnover * clamp(changePct / 100, -1, 1);
  }
  if (changePct !== undefined) {
    data.positioning_change_pct = changePct;
    data.large_tx_net_buy_ratio = clamp(0.5 + clamp(changePct / 20, -0.45, 0.45), 0.05, 0.95);
  }
  return data;
}

/**
 * วิเคราะห์ "เงินใหญ่" จาก quote ของแอป
 *
 * ใช้ PROXY_FIELDS (สเกลที่ปรับให้เข้ากับราคา/วอลุ่ม) ไม่ใช่ profile สถาบัน
 * เพราะข้อมูลที่มีไม่ใช่ on-chain/Fund Flow จริง และ **ลดความมั่นใจ** ตามคุณภาพ
 * ข้อมูล (PROXY_CONFIDENCE_FACTOR) เพื่อไม่ให้ proxy ดูมั่นใจเท่าข้อมูลจริง
 */
export function analyzeWhaleFromApp(quote: AppQuote): ModuleSignal {
  const symbol = String(quote?.symbol ?? '').trim();
  if (!symbol) {
    // UI อาจส่งแถวที่ยังโหลดไม่เสร็จเข้ามา — คืนสัญญาณกลาง ไม่โยน error ใส่หน้าจอ
    return createModuleSignal({
      symbol: 'UNKNOWN',
      assetType: quote?.assetType ?? 'default',
      score: 0,
      confidence: 0,
      reason: 'ยังไม่มีชื่อสินทรัพย์ให้วิเคราะห์ — ขอเป็นกลางก่อน',
      source: 'whale:proxy:price+volume',
    });
  }

  const data = moneyFlowFromQuote(quote);
  const base = analyzeWhale({
    symbol: quote.symbol,
    assetType: quote.assetType,
    profile: 'default',
    fields: PROXY_FIELDS,
    data,
    sourceOverride: 'whale:proxy:price+volume',
  });

  if (base.confidence === 0) return base; // ไม่มีข้อมูลพอ — คงข้อความ "ขอเป็นกลางก่อน"

  return createModuleSignal({
    symbol: base.symbol,
    assetType: canonicalAssetType(quote.assetType),
    score: base.score,
    confidence: pythonRound(base.confidence * PROXY_CONFIDENCE_FACTOR),
    reason: `ประมาณจากราคา/วอลุ่ม: ${base.reason}`,
    source: base.source,
  });
}

/** รวมหลาย quote ในแท็บเดียว — คืนเฉพาะตัวที่แอปรู้จัก (ไม่ throw) */
export function analyzeWhaleBatch(quotes: readonly AppQuote[]): ModuleSignal[] {
  return quotes
    .filter((quote) => typeof quote?.symbol === 'string' && quote.symbol.trim().length > 0)
    .map((quote) => analyzeWhaleFromApp(quote));
}

/** ตัวที่สัญญาณแรงที่สุดในชุด (ใช้โชว์ในมาสคอต/สรุป) — ไม่มีข้อมูล = null */
export function strongestWhaleSignal(signals: readonly ModuleSignal[]): ModuleSignal | null {
  let best: ModuleSignal | null = null;
  for (const signal of signals) {
    if (!best) {
      best = signal;
      continue;
    }
    const score = Math.abs(signal.score) * 100 + signal.confidence;
    const bestScore = Math.abs(best.score) * 100 + best.confidence;
    if (score > bestScore) best = signal;
  }
  return best;
}
