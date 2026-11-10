// @vitest-environment node
import { describe, it, expect } from 'vitest';

import type { CryptoCoin, ForexPair, ForeignStock, StockIndex, ThaiStock } from '../types';
import {
  CRYPTO_INITIAL,
  FOREIGN_STOCKS,
  STOCK_SYMBOLS,
  THAI_STOCKS,
} from '../services/apiClient';
import {
  DEADZONE,
  PROFILES,
  STRONG_AT,
  analyzeWhale,
  analyzeWhaleFromApp,
  analyzeWhaleBatch,
  canonicalAssetType,
  compose,
  confidenceFrom,
  createFusionResult,
  createModuleSignal,
  explainWhale,
  formatValue,
  fromSignalDict,
  moneyFlowFromQuote,
  moneyText,
  quoteFromCryptoCoin,
  quoteFromForexPair,
  quoteFromForeignStock,
  quoteFromStockIndex,
  quoteFromThaiStock,
  readFields,
  sampleMoneyFlow,
  scoreFromTotal,
  strongestWhaleSignal,
  toSignalDict,
  turnoverOf,
  type MoneyFlowData,
  type ModuleSignal,
} from '../fusion';

/* --------------------------------------------------------------------------
 * PARITY FIXTURES
 * ผลที่คำนวณจาก reference implementation (Python):
 *   motorboy_production/02_whale.py --selftest / describe_flow()
 * ถ้าตัวเลขใน TS ไม่ตรงชุดนี้ แปลว่าพอร์ตเพี้ยน — ห้ามแก้ fixture ให้ตามโค้ด
 * ------------------------------------------------------------------------ */

interface ParityCase {
  name: string;
  assetType: string;
  data: Record<string, number | string>;
  score: number;
  confidence: number;
  total: number;
  coverage: number;
  agreement: number;
  reason: string;
}

const PARITY: ParityCase[] = [
  {
    name: 'crypto-bull',
    assetType: 'crypto',
    data: {
      exchange_netflow_usd: -17100000,
      stablecoin_inflow_usd: 45125000,
      large_tx_net_buy_ratio: 0.975,
      funding_rate_pct: -0.04275,
      open_interest_change_pct: 9.025,
    },
    score: 2,
    confidence: 94,
    total: 0.890372,
    coverage: 1,
    agreement: 1,
    reason: 'เงินใหญ่เข้าของชัด: เงินเข้า-ออก Exchange -$17.1M',
  },
  {
    name: 'crypto-bear',
    assetType: 'crypto',
    data: {
      exchange_netflow_usd: 17100000,
      stablecoin_inflow_usd: -45125000,
      large_tx_net_buy_ratio: 0.025,
      funding_rate_pct: 0.04275,
      open_interest_change_pct: -9.025,
    },
    score: -2,
    confidence: 94,
    total: -0.890372,
    coverage: 1,
    agreement: 1,
    reason: 'เงินใหญ่เทขายหนัก: เงินเข้า-ออก Exchange $17.1M',
  },
  {
    name: 'crypto-neutral',
    assetType: 'crypto',
    data: {
      exchange_netflow_usd: -1800000,
      stablecoin_inflow_usd: -4750000,
      large_tx_net_buy_ratio: 0.55,
      funding_rate_pct: 0.0045,
      open_interest_change_pct: 0.95,
    },
    score: 0,
    confidence: 25,
    total: 0.026489,
    coverage: 1,
    agreement: 0.282633,
    reason: 'เงินใหญ่ยังไม่ชัด: เงินเข้า-ออก Exchange -$1.8M',
  },
  {
    name: 'stock-bull',
    assetType: 'stock',
    data: {
      institutional_net_buy_usd: 8550000,
      block_trade_premium_pct: 1.805,
      insider_net_buy_usd: 1900000,
      short_interest_change_pct: -17.1,
    },
    score: 2,
    confidence: 94,
    total: 0.886667,
    coverage: 1,
    agreement: 1,
    reason: 'เงินใหญ่เข้าของชัด: Fund Flow สถาบัน $8.6M',
  },
  {
    name: 'stock-bear',
    assetType: 'stock',
    data: {
      institutional_net_buy_usd: -8550000,
      block_trade_premium_pct: -1.805,
      insider_net_buy_usd: -1900000,
      short_interest_change_pct: 17.1,
    },
    score: -2,
    confidence: 94,
    total: -0.886667,
    coverage: 1,
    agreement: 1,
    reason: 'เงินใหญ่เทขายหนัก: Fund Flow สถาบัน -$8.6M',
  },
  {
    name: 'forex-neutral',
    assetType: 'forex',
    data: {
      cot_net_position_pct: 2.7,
      central_bank_bias: 'neutral',
      bank_flow_usd: 100000000,
      rate_expectation_change_bp: -2.25,
    },
    score: 0,
    confidence: 34,
    total: 0.039091,
    coverage: 1,
    agreement: 0.577181,
    reason: 'เงินใหญ่ยังไม่ชัด: COT Net Position +2.70%',
  },
  {
    name: 'forex-bull',
    assetType: 'forex',
    data: {
      cot_net_position_pct: 25.65,
      central_bank_bias: 'hawkish',
      bank_flow_usd: 950000000,
      rate_expectation_change_bp: 21.375,
    },
    score: 2,
    confidence: 95,
    total: 0.916136,
    coverage: 1,
    agreement: 1,
    reason: 'เงินใหญ่เข้าของชัด: COT Net Position +25.65%',
  },
  {
    name: 'gold_index-bear',
    assetType: 'gold_index',
    data: {
      etf_net_flow_usd: -427500000,
      fund_flow_index: -54.15,
      central_bank_gold_buy_tonnes: 28.5,
      futures_net_long_change_pct: -12.825,
    },
    score: -2,
    confidence: 94,
    total: -0.889756,
    coverage: 1,
    agreement: 1,
    reason: 'เงินใหญ่เทขายหนัก: ETF Flow -$427.5M',
  },
  {
    name: 'crypto-mixed',
    assetType: 'crypto',
    data: {
      exchange_netflow_usd: 25000000,
      stablecoin_inflow_usd: 45125000,
      large_tx_net_buy_ratio: 0.975,
      funding_rate_pct: -0.04275,
      open_interest_change_pct: 9.025,
    },
    score: 1,
    confidence: 41,
    total: 0.298351,
    coverage: 1,
    agreement: 0.31853,
    reason: 'เงินใหญ่เริ่มเข้าของ: เงินเข้า-ออก Exchange $25.0M',
  },
];

describe('fusion/whale — parity กับ reference implementation (Python)', () => {
  it.each(PARITY)('$name ตรงกับผลของ Python', (testCase) => {
    const detail = explainWhale({
      symbol: 'TEST',
      assetType: testCase.assetType,
      data: testCase.data,
    });

    expect(detail.signal.score).toBe(testCase.score);
    expect(detail.signal.confidence).toBe(testCase.confidence);
    expect(Number(detail.total.toFixed(6))).toBeCloseTo(testCase.total, 6);
    expect(Number(detail.coverage.toFixed(6))).toBeCloseTo(testCase.coverage, 6);
    expect(Number(detail.agreement.toFixed(6))).toBeCloseTo(testCase.agreement, 6);
    expect(detail.signal.reason).toBe(testCase.reason);
  });
});

describe('fusion/whale — สัญญาณต้องอยู่ในช่วงที่ Fusion อ่านได้', () => {
  it('score -2..+2 และ confidence 0..100 ครบทุก asset_type × ทุก bias', () => {
    for (const assetType of ['crypto', 'stock', 'forex', 'gold_index', 'default']) {
      for (const bias of ['bull', 'bear', 'neutral'] as const) {
        const signal = analyzeWhale({ symbol: 'ANY', assetType, data: sampleMoneyFlow(assetType, bias) });
        expect(signal.score).toBeGreaterThanOrEqual(-2);
        expect(signal.score).toBeLessThanOrEqual(2);
        expect(signal.confidence).toBeGreaterThanOrEqual(0);
        expect(signal.confidence).toBeLessThanOrEqual(100);
        expect(signal.reason.length).toBeGreaterThan(0);
        expect(signal.reason.length).toBeLessThanOrEqual(200);
      }
    }
  });

  it('ทิศทางตามกระแสเงิน: bull > 0, bear < 0, neutral = 0', () => {
    for (const assetType of ['crypto', 'stock', 'forex', 'gold_index']) {
      const bull = analyzeWhale({ symbol: 'X', assetType, data: sampleMoneyFlow(assetType, 'bull') });
      const bear = analyzeWhale({ symbol: 'X', assetType, data: sampleMoneyFlow(assetType, 'bear') });
      const flat = analyzeWhale({ symbol: 'X', assetType, data: sampleMoneyFlow(assetType, 'neutral') });

      expect(bull.score).toBeGreaterThan(0);
      expect(bear.score).toBeLessThan(0);
      expect(flat.score).toBe(0);
      expect(bull.direction).toBe('bullish');
      expect(bear.direction).toBe('bearish');
      expect(flat.direction).toBe('neutral');
    }
  });

  it('ไม่มีข้อมูล = เป็นกลาง + confidence 0 (ไม่เดา)', () => {
    const signal = analyzeWhale({ symbol: 'BTCUSDT', assetType: 'crypto', data: null });
    expect(signal.score).toBe(0);
    expect(signal.confidence).toBe(0);
    expect(signal.reason).toContain('ขอเป็นกลางก่อน');
  });

  it('ข้อมูลไม่ครบต้องมั่นใจไม่เกินข้อมูลครบ', () => {
    const full = sampleMoneyFlow('crypto', 'bull');
    const firstKey = Object.keys(full)[0];
    const half = { [firstKey]: (full as Record<string, number>)[firstKey] };

    const fullSignal = analyzeWhale({ symbol: 'ETH', assetType: 'crypto', data: full });
    const halfSignal = analyzeWhale({ symbol: 'ETH', assetType: 'crypto', data: half });
    expect(halfSignal.confidence).toBeLessThanOrEqual(fullSignal.confidence);
  });

  it('สัญญาณสวนทางกันต้องไม่ให้คะแนนสุดโต่ง', () => {
    const mixed: MoneyFlowData = { ...sampleMoneyFlow('crypto', 'bull'), exchange_netflow_usd: 25_000_000 };
    expect(Math.abs(analyzeWhale({ symbol: 'SOL', assetType: 'crypto', data: mixed }).score)).toBeLessThanOrEqual(1);
  });

  it('symbol ไม่มีผลต่อผลลัพธ์ (ห้าม hardcode ชื่อสินทรัพย์)', () => {
    const data = sampleMoneyFlow('forex', 'bull');
    const a = analyzeWhale({ symbol: 'EURUSD', assetType: 'forex', data });
    const b = analyzeWhale({ symbol: 'USDJPY', assetType: 'forex', data });
    expect({ score: a.score, confidence: a.confidence, reason: a.reason }).toEqual({
      score: b.score,
      confidence: b.confidence,
      reason: b.reason,
    });
  });
});

describe('fusion/whale — ชิ้นส่วนที่ใช้ซ้ำได้', () => {
  it('scoreFromTotal ใช้ deadzone/strong ตามสเปก', () => {
    expect(scoreFromTotal(STRONG_AT)).toBe(2);
    expect(scoreFromTotal(DEADZONE)).toBe(1);
    expect(scoreFromTotal(DEADZONE - 0.001)).toBe(0);
    expect(scoreFromTotal(-DEADZONE)).toBe(-1);
    expect(scoreFromTotal(-STRONG_AT)).toBe(-2);
  });

  it('confidenceFrom ให้ 0 เมื่อไม่มีข้อมูล และ 100 เมื่อแรงเต็มที่+ครบ+เห็นตรงกัน', () => {
    expect(confidenceFrom(0, 0, 0)).toBe(0);
    expect(confidenceFrom(1, 1, 1)).toBe(100);
  });

  it('compose ไม่ระเบิดเมื่อไม่มี reading', () => {
    expect(compose([], PROFILES.crypto)).toEqual({ total: 0, coverage: 0, agreement: 0 });
  });

  it('readFields รองรับค่าแบบ string พร้อมหน่วย และ enum ภาษาไทย/อังกฤษ', () => {
    const [byString] = readFields(PROFILES.stock, { institutional_net_buy_usd: '$12.5M' });
    expect(byString.unitValue).toBeGreaterThan(0);

    const [enumReading] = readFields(PROFILES.forex, { central_bank_bias: 'HAWKISH' });
    expect(enumReading.unitValue).toBe(1);

    const [dovish] = readFields(PROFILES.forex, { central_bank_bias: 'dovish' });
    expect(dovish.unitValue).toBe(-1);
  });

  it('formatValue/moneyText อ่านง่ายและตรงกับรูปแบบของ Python', () => {
    expect(moneyText(-17_100_000)).toBe('-$17.1M');
    expect(moneyText(8_550_000)).toBe('$8.6M');
    expect(moneyText(-450_000)).toBe('-$450K');
    expect(moneyText(427_500_000)).toBe('$427.5M');
    const [pct] = readFields(PROFILES.forex, { cot_net_position_pct: 25.65 });
    expect(formatValue(pct)).toBe('+25.65%');
  });
});

describe('fusion/types — interface แช่แข็ง', () => {
  it('canonicalAssetType รับชื่อแท็บจริงของแอปได้', () => {
    expect(canonicalAssetType('crypto')).toBe('crypto');
    expect(canonicalAssetType('forex')).toBe('forex');
    expect(canonicalAssetType('th')).toBe('stock');
    expect(canonicalAssetType('us')).toBe('stock');
    expect(canonicalAssetType('indices')).toBe('gold_index');
    expect(canonicalAssetType('nft_jpeg')).toBe('default');
    expect(canonicalAssetType(null)).toBe('default');
  });

  it('createModuleSignal ปฏิเสธค่าที่หลุดสเปก', () => {
    const base = { symbol: 'BTC', assetType: 'crypto', score: 1, confidence: 50, reason: 'ok', source: 's' };
    expect(() => createModuleSignal({ ...base, score: 3 })).toThrow();
    expect(() => createModuleSignal({ ...base, score: 0.5 })).toThrow();
    expect(() => createModuleSignal({ ...base, confidence: 101 })).toThrow();
    expect(() => createModuleSignal({ ...base, reason: '   ' })).toThrow();
  });

  it('toSignalDict/fromSignalDict ไปกลับได้ (ใช้คุยกับ Python)', () => {
    const signal = analyzeWhale({ symbol: 'btcusdt', assetType: 'crypto', data: sampleMoneyFlow('crypto', 'bull') });
    const dict = toSignalDict(signal);
    expect(Object.keys(dict).sort()).toEqual(
      ['asset_type', 'confidence', 'reason', 'score', 'source', 'symbol'].sort()
    );
    expect(fromSignalDict(dict)).toEqual(signal);
    expect(fromSignalDict(null)).toBeNull();
  });

  it('createFusionResult ตรวจ decision ที่ไม่รู้จัก', () => {
    const ok = createFusionResult({
      symbol: 'aapl',
      assetType: 'us',
      decision: 'buy',
      finalScore: 0.61,
      finalConfidence: 78,
      vetoTriggered: false,
    });
    expect(ok.decision).toBe('BUY');
    expect(ok.assetType).toBe('stock');
    expect(() =>
      createFusionResult({
        symbol: 'AAPL',
        assetType: 'us',
        decision: 'HOLD',
        finalScore: 0,
        finalConfidence: 50,
        vetoTriggered: false,
      })
    ).toThrow();
  });
});

/* ------------------------------------------------------------- adapters */

const cryptoCoin = {
  symbol: 'BTC',
  price: 68_000,
  change: 2.35,
  volume: 34_500_000, // quote volume (USD) ตามข้อมูลของแอป
  high: 69_000,
  low: 66_500,
} as unknown as CryptoCoin;

const forexPair = { pair: 'EURUSD', price: 1.085, change: 0.42 } as unknown as ForexPair;
const thaiStock = { symbol: 'AOT', price: 62.5, change: 1.2, volume: 12_000_000 } as unknown as ThaiStock;
const foreignStock = { symbol: 'NVDA', price: 142.5, change: 3.4, volume: 3_000_000 } as unknown as ForeignStock;
const stockIndex = { symbol: 'SET', price: 1378.45, change: 0.42 } as unknown as StockIndex;

describe('fusion/adapters — ข้อมูลจริงของแอป -> schema ของสเปก', () => {
  it('turnover: คริปโตใช้ quote volume, หุ้นคูณราคา, ดัชนีไม่มีวอลุ่ม', () => {
    expect(turnoverOf(quoteFromCryptoCoin(cryptoCoin))).toBe(34_500_000);
    expect(turnoverOf(quoteFromThaiStock(thaiStock))).toBeCloseTo(62.5 * 12_000_000, 6);
    expect(turnoverOf(quoteFromForeignStock(foreignStock))).toBeCloseTo(142.5 * 3_000_000, 6);
    expect(turnoverOf(quoteFromStockIndex(stockIndex))).toBeUndefined();
    expect(turnoverOf(quoteFromForexPair(forexPair))).toBeUndefined();
  });

  it('สร้าง proxy field ตาม schema จริง (ไม่ตั้งชื่อ field ใหม่)', () => {
    const data = moneyFlowFromQuote(quoteFromCryptoCoin(cryptoCoin));
    expect(Object.keys(data).sort()).toEqual(
      ['large_tx_net_buy_ratio', 'net_flow_usd', 'positioning_change_pct'].sort()
    );
    expect(data.net_flow_usd as number).toBeGreaterThan(0); // บวกเพราะราคาขึ้น
    expect(data.positioning_change_pct).toBe(2.35);
  });

  it('ติดป้าย proxy ทุกครั้ง (ไม่แอบอ้างว่าเป็นข้อมูลสถาบัน/on-chain)', () => {
    const signal = analyzeWhaleFromApp(quoteFromCryptoCoin(cryptoCoin));
    expect(signal.source).toContain('proxy:price+volume');
    expect(signal.reason.startsWith('ประมาณจากราคา/วอลุ่ม')).toBe(true);
  });

  it('assetType ของแท็บจริงถูกแมปเป็น 5 preset แต่ยังบอกประเภทเดิม', () => {
    expect(analyzeWhaleFromApp(quoteFromThaiStock(thaiStock)).assetType).toBe('stock');
    expect(analyzeWhaleFromApp(quoteFromStockIndex(stockIndex)).assetType).toBe('gold_index');
    expect(analyzeWhaleFromApp(quoteFromForexPair(forexPair)).assetType).toBe('forex');
  });

  it('แท็บที่ไม่มีวอลุ่ม (forex/index) ต้องมั่นใจน้อยกว่าแท็บที่มีวอลุ่ม', () => {
    const rich = analyzeWhaleFromApp(quoteFromCryptoCoin(cryptoCoin));
    const thin = analyzeWhaleFromApp(quoteFromForexPair(forexPair));
    expect(thin.confidence).toBeLessThan(rich.confidence);
  });

  it('ข้อมูลไม่พอ = 0/0 ไม่ throw', () => {
    const empty = analyzeWhaleFromApp({ symbol: 'UNKNOWN', assetType: 'index' });
    expect(empty.score).toBe(0);
    expect(empty.confidence).toBe(0);
  });

  it('batch/strongest ทำงานกับชุดข้อมูลจริง', () => {
    const signals = analyzeWhaleBatch([
      quoteFromCryptoCoin(cryptoCoin),
      quoteFromForexPair(forexPair),
      quoteFromThaiStock(thaiStock),
    ].map((quote) => quote));
    expect(signals).toHaveLength(3);

    const strongest = strongestWhaleSignal(signals);
    expect(strongest).not.toBeNull();
    expect(signals).toContain(strongest as ModuleSignal);
    expect(strongestWhaleSignal([])).toBeNull();
  });

  it('ไม่ล็อกชื่อสินทรัพย์: symbol เปลี่ยนผลไม่เปลี่ยน', () => {
    const a = analyzeWhaleFromApp({ ...quoteFromCryptoCoin(cryptoCoin), symbol: 'AAA' });
    const b = analyzeWhaleFromApp({ ...quoteFromCryptoCoin(cryptoCoin), symbol: 'ZZZ' });
    expect({ score: a.score, confidence: a.confidence }).toEqual({
      score: b.score,
      confidence: b.confidence,
    });
  });
});

describe('fusion/adapters — วิ่งบนข้อมูลตั้งต้นจริงของโปรเจกต์', () => {
  it('ทุกสินทรัพย์ในแอป (คริปโต/หุ้นไทย/หุ้นนอก/ดัชนี) ให้สัญญาณที่ถูกต้อง', () => {
    const quotes = [
      ...CRYPTO_INITIAL.map(quoteFromCryptoCoin),
      ...THAI_STOCKS.map(quoteFromThaiStock),
      ...FOREIGN_STOCKS.map(quoteFromForeignStock),
      ...STOCK_SYMBOLS.map(quoteFromStockIndex),
    ];
    expect(quotes.length).toBeGreaterThan(10);

    for (const signal of analyzeWhaleBatch(quotes)) {
      expect([-2, -1, 0, 1, 2]).toContain(signal.score);
      expect(signal.confidence).toBeGreaterThanOrEqual(0);
      expect(signal.confidence).toBeLessThanOrEqual(100);
      expect(signal.reason).toMatch(/ประมาณจากราคา\/วอลุ่ม/);
      expect(['crypto', 'stock', 'forex', 'gold_index']).toContain(signal.assetType);
    }
  });

  it('อ่านข้อมูลจริงแล้วบอกทิศทางเดียวกับส่วนเปลี่ยนของราคา', () => {
    const upCoin = CRYPTO_INITIAL.find((coin) => coin.change > 2) as CryptoCoin;
    expect(upCoin).toBeDefined();
    const up = quoteFromCryptoCoin(upCoin);
    expect(analyzeWhaleFromApp(up).score).toBeGreaterThan(0);

    // ทิศทางกลับด้านด้วยข้อมูลรูปร่างเดียวกัน (ไม่ผูกชื่อเหรียญ)
    const down = { ...up, symbol: 'TEST', changePct: -3.1 };
    expect(analyzeWhaleFromApp(down).score).toBeLessThan(0);

    // แรงกว่า = คะแนนไม่น้อยกว่า (monotonic)
    const flat = { ...up, symbol: 'TEST', changePct: 0.05 };
    const strong = { ...up, symbol: 'TEST', changePct: 4.9 };
    const scores = [down, flat, up, strong].map((quote) => analyzeWhaleFromApp(quote).score);
    expect(scores).toEqual([...scores].sort((a, b) => a - b));
  });

  it('ความมั่นใจของ proxy ถูกหรี่ลงตามคุณภาพข้อมูล (ไม่หลอกว่ามั่นใจเท่าข้อมูลจริง)', () => {
    const proxy = analyzeWhaleFromApp(quoteFromCryptoCoin(CRYPTO_INITIAL[2] as CryptoCoin));
    const real = analyzeWhale({
      symbol: 'SOLUSDT',
      assetType: 'crypto',
      data: sampleMoneyFlow('crypto', 'bull'),
    });
    expect(proxy.confidence).toBeLessThan(real.confidence);
  });
});
