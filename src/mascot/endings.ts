import type { EndingResult, EndingType, Ohlcv } from './types';
import { DEFAULT_ENDINGS_MODEL, loadEndingsModel, type EndingModel } from './endingsModel';

/**
 * AI ENDINGS ANALYZE — the “brain in”.
 *
 * Not an external model: a deterministic reading of the candle series the app
 * already has, answering exactly one question — *where did the current move
 * end?* Four endings, per the V4.1 spec:
 *
 *   BULL_END      High ทำลาย High เดิม + Volume เพิ่ม        → ไปต่อ
 *   BEAR_END      Low หลุด  Low  เดิม + Volume พุ่ง          → เสี่ยงลง
 *   SIDEWAY_END   High/Low แคบลงเรื่อย ๆ ~30 แท่ง             → รอ
 *   BREAKOUT_END  แคบ + Volume แห้ง แล้วพุ่ง                  → เตรียมเข้า
 *
 * Output is deliberately one Thai sentence (`oneLineTH`); the numeric detail
 * exists for the journal and for tests, not for the trader's eyes.
 */

export interface AnalyzeOptions {
  /** Explicit levels from the chart, when available. */
  support?: number;
  resistance?: number;
  model?: EndingModel;
  /** Injected clock so results are reproducible in tests. */
  now?: number;
  symbol?: string;
}

function clampProb(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function fmt(price: number): string {
  if (!isFinite(price)) return '—';
  const abs = Math.abs(price);
  if (abs >= 1000) return price.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (abs >= 1) return price.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return price.toLocaleString('en-US', { maximumFractionDigits: 6 });
}

/** Average True Range over `period` bars. */
export function atr(candles: Ohlcv[], period = DEFAULT_ENDINGS_MODEL.atrPeriod): number {
  if (candles.length < 2) return 0;
  const start = Math.max(1, candles.length - period);
  let sum = 0;
  let n = 0;
  for (let i = start; i < candles.length; i += 1) {
    const prevClose = candles[i - 1].close;
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - prevClose),
      Math.abs(candles[i].low - prevClose)
    );
    sum += tr;
    n += 1;
  }
  return n > 0 ? sum / n : 0;
}

function averageVolume(candles: Ohlcv[], period: number): number {
  const slice = candles.slice(Math.max(0, candles.length - 1 - period), candles.length - 1);
  if (slice.length === 0) return 0;
  return slice.reduce((acc, c) => acc + (c.volume || 0), 0) / slice.length;
}

/**
 * Analyze the tail of a candle series. Returns `null` when there is no ending
 * worth speaking about (no signal is better than a noisy one), or when the
 * series is too short to be trusted.
 */
export function analyzeEndings(candles: Ohlcv[], options: AnalyzeOptions = {}): EndingResult | null {
  const model = options.model ?? loadEndingsModel();
  const { thresholds } = model;

  const valid = (candles ?? []).filter(
    (c) => isFinite(c?.high) && isFinite(c?.low) && isFinite(c?.close) && c.high >= c.low
  );
  if (valid.length < model.minCandles) return null;

  const last = valid[valid.length - 1];
  const history = valid.slice(0, -1);
  const lookback = history.slice(Math.max(0, history.length - thresholds.breakoutLookback));
  if (lookback.length < 5) return null;

  const priorHigh = Math.max(...lookback.map((c) => c.high));
  const priorLow = Math.min(...lookback.map((c) => c.low));
  const atrValue = atr(valid, model.atrPeriod) || Math.max(last.high - last.low, 1e-9);
  const avgVol = averageVolume(valid, model.volumePeriod) || 1;
  const volumeRatio = (last.volume || 0) / avgVol;

  // Compression box: the last N bars must be getting narrower.
  const boxBars = valid.slice(Math.max(0, valid.length - thresholds.compressionBars));
  const boxHigh = Math.max(...boxBars.map((c) => c.high));
  const boxLow = Math.min(...boxBars.map((c) => c.low));
  const boxHeight = boxHigh - boxLow;
  const compressed = boxBars.length >= Math.min(thresholds.compressionBars, 10) && boxHeight <= atrValue * thresholds.compressionRatio * 6;
  const boxVolumeAvg = boxBars.reduce((acc, c) => acc + (c.volume || 0), 0) / Math.max(1, boxBars.length);
  const volumeDriedUp = boxVolumeAvg < avgVol * 0.95;

  const support = options.support ?? (compressed ? boxLow : priorLow);
  const resistance = options.resistance ?? (compressed ? boxHigh : priorHigh);
  const at = new Date(options.now ?? last.time ?? Date.now()).toISOString();
  const reasons: string[] = [];

  const make = (
    type: EndingType,
    rawProb: number,
    target: number,
    oneLineTH: string
  ): EndingResult => ({
    type,
    prob: clampProb(rawProb, model.prob[type].min, model.prob[type].max),
    target,
    support,
    resistance,
    oneLineTH,
    reasons,
    at,
  });

  /* 1) BREAKOUT_END — box + volume dried up + volume returns */
  if (compressed && volumeDriedUp && volumeRatio >= thresholds.volumeSpike) {
    const upward = last.close >= (boxHigh + boxLow) / 2;
    const target = upward ? boxHigh + boxHeight : boxLow - boxHeight;
    reasons.push(
      `กล่องแคบ ${fmt(boxHeight)} (${thresholds.compressionBars} แท่ง)`,
      `Volume แล้ง ${(boxVolumeAvg / avgVol).toFixed(2)}x แล้วพุ่ง ${volumeRatio.toFixed(2)}x`,
      upward ? 'ทะลุกรอบขึ้น' : 'ทะลุกรอบลง'
    );
    return make(
      'BREAKOUT_END',
      66 + Math.min(22, (volumeRatio - thresholds.volumeSpike) * 14),
      target,
      `จบ Sideway แล้ว เบรก${upward ? 'ขึ้น' : 'ลง'} ${fmt(upward ? boxHigh : boxLow)} เล็ง ${fmt(target)}`
    );
  }

  /* 2) BULL_END — new high + volume expansion */
  if (last.close > priorHigh && volumeRatio >= thresholds.volumeSpike) {
    const target = last.close + atrValue * model.targetAtrMultiple;
    reasons.push(
      `ปิด ${fmt(last.close)} ทำลาย High เดิม ${fmt(priorHigh)}`,
      `Volume ${volumeRatio.toFixed(2)}x ค่าเฉลี่ย ${model.volumePeriod} แท่ง`
    );
    return make(
      'BULL_END',
      70 + Math.min(22, (volumeRatio - thresholds.volumeSpike) * 16),
      target,
      `จบขาขึ้นรอบนี้ต่อ ถือต่อเป้า ${fmt(target)} แนวรับ ${fmt(support)}`
    );
  }

  /* 3) BEAR_END — new low + volume expansion */
  if (last.close < priorLow && volumeRatio >= thresholds.volumeSpike) {
    const target = last.close - atrValue * model.targetAtrMultiple;
    reasons.push(
      `ปิด ${fmt(last.close)} หลุด Low เดิม ${fmt(priorLow)}`,
      `Volume ${volumeRatio.toFixed(2)}x ค่าเฉลี่ย ${model.volumePeriod} แท่ง`
    );
    return make(
      'BEAR_END',
      70 + Math.min(22, (volumeRatio - thresholds.volumeSpike) * 16),
      target,
      `จบขาลง เบรกหลุด ${fmt(priorLow)} ระวังลงต่อ ${fmt(target)}`
    );
  }

  /* 4) SIDEWAY_END — compression without a decision yet */
  if (compressed) {
    const mid = (boxHigh + boxLow) / 2;
    const breakLevel = last.close >= mid ? boxHigh : boxLow;
    reasons.push(
      `กรอบแคบ ${fmt(boxLow)}–${fmt(boxHigh)} (${boxBars.length} แท่ง, ATR ${fmt(atrValue)})`,
      `Volume กรอบ ${(boxVolumeAvg / avgVol).toFixed(2)}x`
    );
    return make(
      'SIDEWAY_END',
      55 + Math.min(17, (1 - boxHeight / Math.max(atrValue, 1e-9)) * 8),
      mid,
      `จบ Sideway รอเบรก ${fmt(breakLevel)} ค่อยเข้า (กรอบ ${fmt(boxLow)}–${fmt(boxHigh)})`
    );
  }

  return null;
}

/* ------------------------------------------------------------------- feed */

/** Binance kline array → Ohlcv. Exported for tests. */
export function mapBinanceKlines(rows: unknown): Ohlcv[] {
  if (!Array.isArray(rows)) return [];
  const out: Ohlcv[] = [];
  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    const open = parseFloat(row[1]);
    const high = parseFloat(row[2]);
    const low = parseFloat(row[3]);
    const close = parseFloat(row[4]);
    const volume = parseFloat(row[5]);
    if (![open, high, low, close, volume].every((v) => isFinite(v))) continue;
    const candle: Ohlcv = { open, high, low, close, volume };
    const time = Number(row[6]);
    if (isFinite(time)) candle.time = time;
    out.push(candle);
  }
  return out;
}

const cache = new Map<string, { at: number; candles: Ohlcv[] }>();
const FEED_TTL_MS = 60_000;

/**
 * Real OHLCV feed (Binance public REST). Returns `null` when unavailable so the
 * overlay simply keeps quiet instead of inventing candles.
 */
export async function fetchEndingsCandles(
  symbol = 'BTCUSDT',
  interval: '15m' | '1h' | '4h' | '1d' = '1h',
  limit = 120,
  now = Date.now()
): Promise<Ohlcv[] | null> {
  const key = `${symbol}:${interval}:${limit}`;
  const cached = cache.get(key);
  if (cached && now - cached.at < FEED_TTL_MS) return cached.candles;

  try {
    const res = await fetch(
      `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
      { signal: AbortSignal.timeout(6000) }
    );
    if (!res.ok) return null;
    const candles = mapBinanceKlines(await res.json());
    if (candles.length < DEFAULT_ENDINGS_MODEL.minCandles) return null;
    cache.set(key, { at: now, candles });
    return candles;
  } catch {
    return null;
  }
}

/** Test helper. */
export function clearEndingsCache(): void {
  cache.clear();
}
