/**
 * FUSION CORE — 02_WHALE (พอร์ต TypeScript จาก `motorboy_production/02_whale.py`)
 *
 * "วาฬ" ในที่นี้ = เงินใหญ่ของสินทรัพย์นั้น ๆ ไม่ใช่แค่คริปโต:
 *   crypto     -> Exchange netflow, stablecoin, Tx ใหญ่, funding, OI
 *   stock      -> Fund Flow สถาบัน, Block Trade, Insider, Short Interest
 *   forex      -> COT, ท่าทีธนาคารกลาง, Bank Flow, ดอกเบี้ยคาดหวัง
 *   gold_index -> ETF Flow, Fund Flow Index, ธนาคารกลางซื้อทอง, Futures
 *
 * กติกาเดียวกับต้นฉบับ:
 *   · ไม่มีชื่อเหรียญ/หุ้นใน logic — รับ symbol/assetType เป็น parameter เสมอ
 *   · ทุกตัวชี้วัดถูก normalize เป็น [-1, +1] ก่อน แล้วรวมเป็น score -2..+2
 *   · ข้อมูลไม่ครบ = มั่นใจต่ำ (ไม่เดา) · สัญญาณสวนกัน = ไม่สุดโต่ง
 *
 * ตัวเลขทุกตัว (scale/weight/deadzone/สูตร confidence) ถูกยืนยันด้วยเทสต์ parity
 * เทียบกับผลของ Python ใน `src/__tests__/fusionWhale.test.ts`
 */

import {
  canonicalAssetType,
  createModuleSignal,
  type CanonicalAssetType,
  type ModuleSignal,
  type SignalScore,
} from './types';

/* --------------------------------------------------------------- field model */

export type FlowUnit = 'usd' | 'pct' | 'ratio' | 'count' | 'enum';
export type MoneyFlowValue = number | string | null | undefined;
export type MoneyFlowData = Readonly<Record<string, MoneyFlowValue>>;

export interface FlowField {
  /** ชื่อ field ที่ยอมรับ (ชื่อหลักก่อน แล้วชื่อสำรอง) */
  readonly keys: readonly string[];
  readonly labelTh: string;
  /** ค่าที่ถือว่า "สุดทาง" (saturate) */
  readonly scale: number;
  readonly weight: number;
  /** ค่ากลาง เช่น ratio ที่ปกติอยู่ 0..1 -> 0.5 */
  readonly center: number;
  /** true = ค่าติดลบเป็น bullish (เช่น เงินไหลออกจาก Exchange) */
  readonly invert: boolean;
  readonly unit: FlowUnit;
  readonly enumMap?: readonly (readonly [string, number])[];
}

function field(config: Partial<FlowField> & Pick<FlowField, 'keys' | 'labelTh' | 'scale'>): FlowField {
  return {
    weight: 1,
    center: 0,
    invert: false,
    unit: 'usd',
    ...config,
  };
}

export interface Reading {
  readonly field: FlowField;
  readonly raw: MoneyFlowValue;
  /** ค่าที่ normalize แล้ว (-1..+1) */
  readonly unitValue: number;
}

/* ------------------------------------------------- profiles by asset type */

export const CRYPTO_FIELDS: readonly FlowField[] = [
  field({
    keys: ['exchange_netflow_usd', 'exchange_net_flow_usd', 'netflow_usd'],
    labelTh: 'เงินเข้า-ออก Exchange',
    scale: 20_000_000,
    weight: 1.5,
    invert: true, // ไหลออก = เก็บของ = bullish
  }),
  field({
    keys: ['stablecoin_inflow_usd', 'stablecoin_exchange_inflow_usd'],
    labelTh: 'Stablecoin เข้า Exchange',
    scale: 50_000_000,
  }),
  field({
    keys: ['large_tx_net_buy_ratio', 'whale_buy_ratio'],
    labelTh: 'สัดส่วน Tx ใหญ่ฝั่งซื้อ',
    scale: 0.5,
    center: 0.5,
    unit: 'ratio',
  }),
  field({
    keys: ['funding_rate_pct', 'funding_rate'],
    labelTh: 'Funding Rate',
    scale: 0.05,
    weight: 0.7,
    invert: true, // funding สูง = long แน่น = เสี่ยงพักฐาน
    unit: 'pct',
  }),
  field({
    keys: ['open_interest_change_pct', 'oi_change_pct'],
    labelTh: 'OI เปลี่ยน',
    scale: 10,
    weight: 0.5,
    unit: 'pct',
  }),
];

export const STOCK_FIELDS: readonly FlowField[] = [
  field({
    keys: ['institutional_net_buy_usd', 'fund_flow_usd', 'foreign_net_buy_usd'],
    labelTh: 'Fund Flow สถาบัน',
    scale: 10_000_000,
    weight: 1.5,
  }),
  field({
    keys: ['block_trade_premium_pct', 'block_trade_pct'],
    labelTh: 'Block Trade ส่วนเกิน',
    scale: 2,
    unit: 'pct',
  }),
  field({
    keys: ['insider_net_buy_usd', 'insider_buy_usd'],
    labelTh: 'Insider ซื้อสุทธิ',
    scale: 2_000_000,
    weight: 0.8,
  }),
  field({
    keys: ['short_interest_change_pct', 'short_change_pct'],
    labelTh: 'Short Interest เปลี่ยน',
    scale: 20,
    weight: 0.6,
    invert: true, // short เพิ่ม = เดิมพันขาลง
    unit: 'pct',
  }),
];

export const FOREX_FIELDS: readonly FlowField[] = [
  field({
    keys: ['cot_net_position_pct', 'cot_net_pct'],
    labelTh: 'COT Net Position',
    scale: 30,
    weight: 1.5,
    unit: 'pct',
  }),
  field({
    keys: ['central_bank_bias', 'cb_bias'],
    labelTh: 'ท่าทีธนาคารกลาง',
    scale: 1,
    weight: 1.2,
    unit: 'enum',
    enumMap: [
      ['hawkish', 1],
      ['neutral', 0],
      ['dovish', -1],
    ],
  }),
  field({
    keys: ['bank_flow_usd', 'bank_flow'],
    labelTh: 'Bank Flow',
    scale: 1_000_000_000,
  }),
  field({
    keys: ['rate_expectation_change_bp', 'rate_change_bp'],
    labelTh: 'ดอกเบี้ยคาดหวัง',
    scale: 25,
    weight: 0.7,
    unit: 'count',
  }),
];

export const GOLD_INDEX_FIELDS: readonly FlowField[] = [
  field({
    keys: ['etf_net_flow_usd', 'etf_flow_usd'],
    labelTh: 'ETF Flow',
    scale: 500_000_000,
    weight: 1.5,
  }),
  field({
    keys: ['fund_flow_index', 'fund_flow'],
    labelTh: 'Fund Flow Index',
    scale: 60,
    unit: 'count',
  }),
  field({
    keys: ['central_bank_gold_buy_tonnes', 'cb_gold_buy_tonnes'],
    labelTh: 'ธนาคารกลางซื้อทอง',
    scale: 30,
    invert: true, // ขายทอง (ลบ) = bearish ตามทิศซื้อ
    unit: 'count',
  }),
  field({
    keys: ['futures_net_long_change_pct', 'net_long_change_pct'],
    labelTh: 'Futures Net Long เปลี่ยน',
    scale: 15,
    weight: 0.6,
    unit: 'pct',
  }),
];

export const DEFAULT_FIELDS: readonly FlowField[] = [
  field({ keys: ['net_flow_usd', 'netflow_usd'], labelTh: 'Net Flow', scale: 10_000_000 }),
  field({
    keys: ['positioning_change_pct', 'positioning_pct'],
    labelTh: 'Positioning เปลี่ยน',
    scale: 20,
    weight: 0.8,
    unit: 'pct',
  }),
  field({
    keys: ['large_tx_net_buy_ratio', 'whale_buy_ratio'],
    labelTh: 'สัดส่วนไม้ใหญ่ฝั่งซื้อ',
    scale: 0.5,
    center: 0.5,
    weight: 0.8,
    unit: 'ratio',
  }),
];

/**
 * PROXY_FIELDS — ชุด field สำหรับ "ข้อมูลที่มีแค่ราคา/วอลุ่ม"
 *
 * ไม่ใช่ preset ที่ 5 ของสเปก (สเปกมี 5 ประเภทเท่านั้น) แต่เป็น *สเกล* ที่ปรับให้
 * เข้ากับหลักฐานที่แอปมีจริง: ราคาเปลี่ยน ±5% ถือว่าสุดทาง, turnover 50 ล้าน =
 * กระแสใหญ่. ชื่อ field ยังเป็นชื่อ canonical เดิมทั้งสามตัว
 */
export const PROXY_FIELDS: readonly FlowField[] = [
  field({
    keys: ['net_flow_usd', 'netflow_usd'],
    labelTh: 'แรงซื้อ-ขายสุทธิ',
    scale: 50_000_000,
    weight: 0.6,
  }),
  field({
    keys: ['positioning_change_pct', 'positioning_pct'],
    labelTh: 'ทิศทางราคา',
    scale: 5,
    unit: 'pct',
  }),
  field({
    keys: ['large_tx_net_buy_ratio', 'whale_buy_ratio'],
    labelTh: 'โมเมนตัมไม้ใหญ่',
    scale: 0.5,
    center: 0.5,
    weight: 0.8,
    unit: 'ratio',
  }),
];

export const PROFILES: Readonly<Record<CanonicalAssetType, readonly FlowField[]>> = {
  crypto: CRYPTO_FIELDS,
  stock: STOCK_FIELDS,
  forex: FOREX_FIELDS,
  gold_index: GOLD_INDEX_FIELDS,
  default: DEFAULT_FIELDS,
};

export const PROFILE_SOURCE: Readonly<Record<CanonicalAssetType, string>> = {
  crypto: 'on-chain: exchange netflow, stablecoin, OI, funding',
  stock: 'institutional: fund flow, block trade, insider, short interest',
  forex: 'positioning: COT, bank flow, central bank, rate expectations',
  gold_index: 'fund flow: ETF, fund index, central bank, futures',
  default: 'generic money flow',
};

/** deadzone กันสัญญาณรบกวน · เกิน 0.45 = สุดทาง */
export const DEADZONE = 0.15;
export const STRONG_AT = 0.45;

/* ----------------------------------------------------------------- helpers */

export function clamp(value: number, low: number, high: number): number {
  if (!Number.isFinite(value)) return 0;
  return value < low ? low : value > high ? high : value;
}

/**
 * ปัดแบบเดียวกับ Python (`round()` = half-to-even) เพื่อให้ผลตรงกับต้นฉบับ
 * ใช้ทั้งตอนคิด confidence และตอนจัดรูปแบบตัวเลขใน reason
 */
export function pythonRound(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const floor = Math.floor(value);
  const diff = value - floor;
  if (diff > 0.5) return floor + 1;
  if (diff < 0.5) return floor;
  return floor % 2 === 0 ? floor : floor + 1;
}

/** toFixed ที่ปัดแบบ Python (half-to-even) */
export function fixed(value: number, digits: number): string {
  const factor = 10 ** digits;
  return (pythonRound(value * factor) / factor).toFixed(digits);
}

/** แปลงเป็นตัวเลขแบบทนมือ: รับ '$12.5M', '3.5%', '1,200' (bool ปัดทิ้ง) */
export function toNumber(value: MoneyFlowValue): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const text = value.trim().replace(/,/g, '').replace(/%/g, '').replace(/\$/g, '');
  if (!text) return null;
  const suffix = text.slice(-1).toUpperCase();
  const multiplier = suffix === 'K' ? 1e3 : suffix === 'M' ? 1e6 : suffix === 'B' ? 1e9 : 1;
  const numeric = Number(multiplier === 1 ? text : text.slice(0, -1));
  return Number.isFinite(numeric) ? numeric * multiplier : null;
}

function unitFromEnum(raw: MoneyFlowValue, enumMap?: readonly (readonly [string, number])[]): number | null {
  if (!enumMap || enumMap.length === 0) return null;
  const key = String(raw ?? '').trim().toLowerCase();
  const hit = enumMap.find(([name]) => name === key);
  return hit ? clamp(hit[1], -1, 1) : null;
}

function fieldValue(fieldDef: FlowField, data: MoneyFlowData): MoneyFlowValue | undefined {
  for (const key of fieldDef.keys) {
    const value = data[key];
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

/** อ่านทุกตัวชี้วัดที่ "มีข้อมูลจริง" — ตัวที่ไม่มีถูกข้าม (ไม่เดา) */
export function readFields(fields: readonly FlowField[], data: MoneyFlowData): Reading[] {
  const readings: Reading[] = [];
  for (const fieldDef of fields) {
    const raw = fieldValue(fieldDef, data);
    if (raw === undefined) continue;

    let unitValue: number | null;
    if (fieldDef.unit === 'enum') {
      unitValue = unitFromEnum(raw, fieldDef.enumMap);
    } else {
      const numeric = toNumber(raw);
      if (numeric === null) continue;
      unitValue = clamp((numeric - fieldDef.center) / fieldDef.scale, -1, 1);
      if (fieldDef.invert) unitValue = -unitValue;
    }
    if (unitValue === null) continue;
    readings.push({ field: fieldDef, raw, unitValue });
  }
  return readings;
}

export interface Composition {
  /** -1..+1 — ทิศทางเงินใหญ่สุทธิ */
  readonly total: number;
  /** 0..1 — สัดส่วนน้ำหนักที่มีข้อมูลจริง */
  readonly coverage: number;
  /** 0..1 — ตัวชี้วัดไปทางเดียวกันแค่ไหน */
  readonly agreement: number;
}

export function compose(readings: readonly Reading[], fields: readonly FlowField[]): Composition {
  if (readings.length === 0) return { total: 0, coverage: 0, agreement: 0 };

  const totalWeight = fields.reduce((sum, f) => sum + f.weight, 0) || 1;
  const presentWeight = readings.reduce((sum, r) => sum + r.field.weight, 0) || 1;
  const weighted = readings.reduce((sum, r) => sum + r.field.weight * r.unitValue, 0);
  const absWeighted = readings.reduce((sum, r) => sum + r.field.weight * Math.abs(r.unitValue), 0);

  return {
    total: clamp(weighted / presentWeight, -1, 1),
    coverage: clamp(presentWeight / totalWeight, 0, 1),
    agreement: absWeighted === 0 ? 0 : clamp(Math.abs(weighted) / absWeighted, 0, 1),
  };
}

/** total [-1..+1] -> score -2..+2 (มี deadzone) */
export function scoreFromTotal(total: number): SignalScore {
  if (total >= STRONG_AT) return 2;
  if (total >= DEADZONE) return 1;
  if (total <= -STRONG_AT) return -2;
  if (total <= -DEADZONE) return -1;
  return 0;
}

/** ความมั่นใจ 0-100: แรง + ข้อมูลครบ + เห็นตรงกัน */
export function confidenceFrom(total: number, coverage: number, agreement: number): number {
  const magnitude = Math.abs(total);
  const raw = 100 * (0.55 * magnitude + 0.3 * coverage * agreement + 0.15 * coverage);
  return pythonRound(clamp(raw, 0, 100));
}

/** พิมพ์เงินแบบอ่านง่าย ($1.20B / $18.5M / -$450K) */
export function moneyText(value: number): string {
  const sign = value < 0 ? '-' : '';
  const size = Math.abs(value);
  if (size >= 1e9) return `${sign}$${fixed(size / 1e9, 2)}B`;
  if (size >= 1e6) return `${sign}$${fixed(size / 1e6, 1)}M`;
  if (size >= 1e3) return `${sign}$${fixed(size / 1e3, 0)}K`;
  return `${sign}$${fixed(size, 0)}`;
}

/** พิมพ์ค่าดิบตามหน่วยของตัวชี้วัด (ใช้ใน reason และ UI) */
export function formatValue(reading: Reading): string {
  if (reading.field.unit === 'enum') return String(reading.raw ?? '').trim().toLowerCase();
  const numeric = toNumber(reading.raw);
  if (numeric === null) return String(reading.raw ?? '');
  const sign = numeric < 0 ? '-' : '+';
  const abs = Math.abs(numeric);
  switch (reading.field.unit) {
    case 'usd':
      return moneyText(numeric);
    case 'pct':
      return `${sign}${fixed(abs, 2)}%`;
    case 'ratio':
      return fixed(numeric, 2);
    default:
      return `${sign}${fixed(abs, 0)}`;
  }
}

/** เหตุผลภาษาไทยสั้น ๆ จากตัวชี้วัดที่เด่นที่สุด */
export function buildReason(readings: readonly Reading[], total: number, coverage: number): string {
  if (readings.length === 0) return 'ยังไม่มีข้อมูลโฟลว์เงินใหญ่ — ขอเป็นกลางก่อน';

  let dominant = readings[0];
  for (const reading of readings) {
    if (reading.field.weight * Math.abs(reading.unitValue) > dominant.field.weight * Math.abs(dominant.unitValue)) {
      dominant = reading;
    }
  }

  const verb =
    total >= STRONG_AT
      ? 'เงินใหญ่เข้าของชัด'
      : total >= DEADZONE
        ? 'เงินใหญ่เริ่มเข้าของ'
        : total <= -STRONG_AT
          ? 'เงินใหญ่เทขายหนัก'
          : total <= -DEADZONE
            ? 'เงินใหญ่เริ่มเทขาย'
            : 'เงินใหญ่ยังไม่ชัด';

  let reason = `${verb}: ${dominant.field.labelTh} ${formatValue(dominant)}`;
  if (coverage < 0.6) reason += ` (ข้อมูลครบ ${pythonRound(coverage * 100)}%)`;
  return reason.slice(0, 200);
}

/* -------------------------------------------------------------- public API */

export interface AnalyzeWhaleInput {
  symbol: string;
  assetType: string;
  data?: MoneyFlowData | null;
  /**
   * บังคับ profile ที่จะใช้ — adapter ใช้ 'default' เมื่อมีแค่ราคา/วอลุ่ม
   * (ไม่เอา proxy ไปยัดเป็น on-chain/สถาบัน เพราะนั่นคือการโกหกข้อมูล)
   */
  profile?: CanonicalAssetType;
  /** ต่อท้าย source เพื่อบอกว่าค่านี้มาจากไหน เช่น 'proxy:price+volume' */
  sourceNote?: string;
  /** ใช้ชุด field กำหนดเอง (เช่น PROXY_FIELDS) แทน profile มาตรฐาน */
  fields?: readonly FlowField[];
  /** ระบุ source ตรง ๆ (ใช้เมื่อไม่อยากให้ต่อท้ายอัตโนมัติ) */
  sourceOverride?: string;
}

export interface WhaleExplanation {
  readonly signal: ModuleSignal;
  readonly profile: CanonicalAssetType;
  readonly readings: readonly Reading[];
  readonly total: number;
  readonly coverage: number;
  readonly agreement: number;
}

/** วิเคราะห์โฟลว์เงินใหญ่ของสินทรัพย์ใด ๆ (ไม่มีการเรียก network) */
export function analyzeWhale(input: AnalyzeWhaleInput): ModuleSignal {
  return explainWhale(input).signal;
}

/** เหมือน analyzeWhale แต่คืนรายละเอียดทุกตัวชี้วัด (สำหรับ UI/debug) */
export function explainWhale(input: AnalyzeWhaleInput): WhaleExplanation {
  const assetType = canonicalAssetType(input.assetType);
  const profile = input.profile ?? assetType;
  const fields = input.fields ?? PROFILES[profile] ?? DEFAULT_FIELDS;
  const symbol = String(input.symbol ?? '').trim().toUpperCase();
  if (!symbol) throw new Error('ต้องระบุ symbol (ห้ามล็อกชื่อสินทรัพย์ในโค้ด)');

  const suffix = input.sourceNote ? ` | ${input.sourceNote}` : '';
  const source =
    input.sourceOverride ?? `whale:${profile}:${PROFILE_SOURCE[profile] ?? 'generic money flow'}${suffix}`;

  if (!input.data || Object.keys(input.data).length === 0) {
    const signal = createModuleSignal({
      symbol,
      assetType,
      score: 0,
      confidence: 0,
      reason: `ยังไม่มีข้อมูลโฟลว์เงินใหญ่ของ ${symbol} — ขอเป็นกลางก่อน`,
      source,
    });
    return { signal, profile, readings: [], total: 0, coverage: 0, agreement: 0 };
  }

  const readings = readFields(fields, input.data);
  const { total, coverage, agreement } = compose(readings, fields);
  const signal = createModuleSignal({
    symbol,
    assetType,
    score: scoreFromTotal(total),
    confidence: confidenceFrom(total, coverage, agreement),
    reason: buildReason(readings, total, coverage),
    source,
  });
  return { signal, profile, readings, total, coverage, agreement };
}

/* -------------------------------------------------------------- mock maker */

export type FlowBias = 'bull' | 'bear' | 'neutral';

/** สร้างข้อมูลตัวอย่างตาม assetType (ใช้ในเทสต์/เดโม — ไม่ผูกกับชื่อเหรียญ) */
export function sampleMoneyFlow(assetType: string, bias: FlowBias = 'bull'): MoneyFlowData {
  const profile = canonicalAssetType(assetType);
  const fields = PROFILES[profile] ?? DEFAULT_FIELDS;
  const direction = bias === 'bull' ? 1 : bias === 'bear' ? -1 : 1;
  const strength = bias === 'neutral' ? 0.1 : 0.95;

  const data: Record<string, number | string> = {};
  fields.forEach((fieldDef, index) => {
    const key = fieldDef.keys[0];
    if (fieldDef.unit === 'enum') {
      const entries = fieldDef.enumMap ?? [];
      const best =
        bias === 'neutral'
          ? entries.reduce((a, b) => (Math.abs(a[1]) <= Math.abs(b[1]) ? a : b), entries[0] ?? ['neutral', 0])
          : entries.reduce((a, b) => (a[1] * direction >= b[1] * direction ? a : b), entries[0] ?? ['neutral', 0]);
      data[key] = String(best[0]);
      return;
    }
    const sign = bias === 'neutral' ? (index % 2 === 0 ? 1 : -1) : direction;
    const jitter = 0.9 + 0.05 * (index % 3);
    let raw = sign * strength * jitter * fieldDef.scale;
    if (fieldDef.invert) raw = -raw;
    if (fieldDef.center) raw = fieldDef.center + raw;
    data[key] = Number(raw.toFixed(6));
  });
  return data;
}
