/**
 * FUSION CORE — สัญญาณกลาง (interface แช่แข็ง)
 *
 * ต้นฉบับคือสเปก MotorBoy Fusion Core ข้อ 3 ซึ่งเขียนไว้สำหรับ Python
 * (`motorboy_production/signals.py` = reference) ไฟล์นี้คือสำเนาที่รันได้จริง
 * ในเบราว์เซอร์ของโปรเจกต์นี้ — ชื่อ field และความหมายต้องตรงกันเป๊ะ
 *
 * ห้ามเปลี่ยนชื่อ/ช่วงค่า: score -2..+2, confidence 0..100
 * ถ้าต้องส่งข้ามภาษา ใช้ `toSignalDict()` ซึ่งคืน key แบบ snake_case ให้ตรง Python
 */

/** 5 กลุ่มของสเปก (Preset เลือกตามประเภทสินทรัพย์ ไม่ใช่ตามชื่อเหรียญ) */
export const CANONICAL_ASSET_TYPES = ['crypto', 'stock', 'forex', 'gold_index'] as const;
export type CanonicalAssetType = (typeof CANONICAL_ASSET_TYPES)[number] | 'default';

/** ค่าที่ Fusion ยอมรับ — ห้ามมีค่าอื่นหลุดเข้ามา */
export type SignalScore = -2 | -1 | 0 | 1 | 2;

export const SIGNAL_SCORES: readonly SignalScore[] = [-2, -1, 0, 1, 2];

export const VALID_DECISIONS = [
  'STRONG BUY',
  'BUY',
  'WAIT',
  'SELL',
  'STRONG SELL',
  'NO TRADE',
] as const;
export type FusionDecision = (typeof VALID_DECISIONS)[number];

/** ใช้เมื่อ caller ไม่ระบุประเภท (สเปกข้อ 5: "default") */
export const DEFAULT_ASSET_TYPE: CanonicalAssetType = 'default';

/**
 * ชื่อประเภทที่รับได้ — ชื่อแท็บจริงของโปรเจกต์นี้อยู่ในรายการด้วย
 * (th / us / indices) เพื่อให้ส่งค่าจาก App เข้ามาได้ตรง ๆ
 */
const ASSET_ALIASES: Readonly<Record<string, CanonicalAssetType>> = {
  crypto: 'crypto',
  crypto_major: 'crypto',
  crypto_meme: 'crypto',
  coin: 'crypto',

  stock: 'stock',
  equity: 'stock',
  th: 'stock',
  thai: 'stock',
  thai_stock: 'stock',
  thai_stocks: 'stock',
  th_stock: 'stock',
  us: 'stock',
  us_stock: 'stock',
  us_stocks: 'stock',
  foreign: 'stock',
  foreign_stocks: 'stock',

  forex: 'forex',
  fx: 'forex',
  currency: 'forex',

  gold: 'gold_index',
  gold_index: 'gold_index',
  index: 'gold_index',
  indices: 'gold_index',
  commodity: 'gold_index',

  default: 'default',
};

/** แปลงชื่อประเภทให้เป็นมาตรฐาน (ไม่รู้จัก -> 'default' ไม่ throw) */
export function canonicalAssetType(raw: unknown): CanonicalAssetType {
  if (typeof raw !== 'string') return DEFAULT_ASSET_TYPE;
  const key = raw.trim().toLowerCase().replace(/[-\s]+/g, '_');
  return ASSET_ALIASES[key] ?? DEFAULT_ASSET_TYPE;
}

/** ผลจากโมดูลลูก 1 ตัว — ส่งให้ "หัวหน้า" เท่านั้น ห้ามคุยกันเอง (สเปกข้อ 2) */
export interface ModuleSignal {
  readonly symbol: string;
  readonly assetType: CanonicalAssetType;
  readonly score: SignalScore;
  readonly confidence: number;
  readonly reason: string;
  readonly source: string;
  /** อนุมานจาก score เพื่อให้ UI พูดถูกโดยไม่ต้องคำนวณซ้ำ */
  readonly direction: 'bullish' | 'bearish' | 'neutral';
}

export interface ModuleSignalInput {
  symbol: string;
  assetType: string;
  score: number;
  confidence: number;
  reason: string;
  source: string;
}

function requireText(value: unknown, name: string, maxChars = 200): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} ห้ามว่าง`);
  }
  return value.trim().slice(0, maxChars);
}

function requireScore(value: unknown): SignalScore {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < -2 || value > 2) {
    throw new Error(`score ต้องเป็นจำนวนเต็ม -2..+2 (ได้ ${String(value)})`);
  }
  return value as SignalScore;
}

function requireConfidence(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`confidence ต้องเป็นตัวเลข 0..100 (ได้ ${String(value)})`);
  }
  const rounded = Math.round(value);
  if (rounded < 0 || rounded > 100) {
    throw new Error(`confidence ต้องอยู่ระหว่าง 0 ถึง 100 (ได้ ${rounded})`);
  }
  return rounded;
}

/** สร้าง ModuleSignal พร้อมตรวจช่วงค่า — ใช้แทน literal ตรง ๆ */
export function createModuleSignal(input: ModuleSignalInput): ModuleSignal {
  const score = requireScore(input.score);
  return {
    symbol: requireText(input.symbol, 'symbol', 32).toUpperCase(),
    assetType: canonicalAssetType(input.assetType),
    score,
    confidence: requireConfidence(input.confidence),
    reason: requireText(input.reason, 'reason'),
    source: requireText(input.source, 'source', 160),
    direction: score > 0 ? 'bullish' : score < 0 ? 'bearish' : 'neutral',
  };
}

/** ผลแบ็คเทส 100 ไม้ล่าสุด — เป็น "เบรกมือ" ไม่ใช่ "น้ำหนัก" (กฎข้อ 3) */
export interface BacktestSignal {
  readonly symbol: string;
  readonly assetType: CanonicalAssetType;
  readonly winRate: number;
  readonly trades: number;
  readonly profitFactor: number;
  readonly maxDd: number;
  readonly reason: string;
}

/** คำตัดสินสุดท้ายของหัวหน้า — มีที่เดียว มีคนเดียว */
export interface FusionResult {
  readonly symbol: string;
  readonly assetType: CanonicalAssetType;
  readonly decision: FusionDecision;
  readonly finalScore: number;
  readonly finalConfidence: number;
  readonly vetoTriggered: boolean;
  readonly reasons: readonly string[];
  readonly breakdown: Readonly<Record<string, unknown>>;
}

export function createFusionResult(input: {
  symbol: string;
  assetType: string;
  decision: string;
  finalScore: number;
  finalConfidence: number;
  vetoTriggered: boolean;
  reasons?: readonly string[];
  breakdown?: Record<string, unknown>;
}): FusionResult {
  const decision = input.decision.trim().toUpperCase() as FusionDecision;
  if (!VALID_DECISIONS.includes(decision)) {
    throw new Error(`decision ต้องเป็นหนึ่งใน ${VALID_DECISIONS.join(' / ')} (ได้ ${input.decision})`);
  }
  return {
    symbol: requireText(input.symbol, 'symbol', 32).toUpperCase(),
    assetType: canonicalAssetType(input.assetType),
    decision,
    finalScore: Number.isFinite(input.finalScore) ? input.finalScore : 0,
    finalConfidence: requireConfidence(input.finalConfidence),
    vetoTriggered: Boolean(input.vetoTriggered),
    reasons: (input.reasons ?? []).map((r) => String(r).trim()).filter(Boolean),
    breakdown: input.breakdown ?? {},
  };
}

/* ------------------------------------------------------------------ bridges */

/** ค่าที่ใช้คุยกับ Python (`motorboy_production/`) — key แบบ snake_case */
export interface ModuleSignalDict {
  symbol: string;
  asset_type: string;
  score: number;
  confidence: number;
  reason: string;
  source: string;
}

export function toSignalDict(signal: ModuleSignal): ModuleSignalDict {
  return {
    symbol: signal.symbol,
    asset_type: signal.assetType,
    score: signal.score,
    confidence: signal.confidence,
    reason: signal.reason,
    source: signal.source,
  };
}

/** รับค่าจาก Python (หรือ JSON ที่บันทึกไว้) กลับมาเป็น ModuleSignal */
export function fromSignalDict(raw: unknown): ModuleSignal | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  const symbol = typeof data.symbol === 'string' ? data.symbol : '';
  const reason = typeof data.reason === 'string' ? data.reason : '';
  if (!symbol || !reason) return null;
  try {
    return createModuleSignal({
      symbol,
      assetType: String(data.asset_type ?? data.assetType ?? 'default'),
      score: Number(data.score ?? 0),
      confidence: Number(data.confidence ?? 0),
      reason,
      source: typeof data.source === 'string' ? data.source : '',
    });
  } catch {
    return null;
  }
}
