import type { EndingThresholds } from './types';

/**
 * `endings.model.json` in the V4.1 plan, kept as a typed default + an optional
 * local override so the trader can re-tune the brain without touching code:
 *
 *   localStorage['motorboy_endings_model_v1'] = { "volumeSpike": 1.8, ... }
 *
 * Everything the engine measures is derived from these numbers — there is no
 * randomness anywhere in the analysis, so a given candle series always produces
 * the same ending (and can be unit-tested / back-tested).
 */
export interface EndingModel {
  thresholds: EndingThresholds;
  /** Probability floor/ceiling per ending type. */
  prob: Record<'BULL_END' | 'BEAR_END' | 'SIDEWAY_END' | 'BREAKOUT_END', { min: number; max: number }>;
  /** Target distance in ATRs for trend endings. */
  targetAtrMultiple: number;
  /** ATR period. */
  atrPeriod: number;
  /** Volume average period. */
  volumePeriod: number;
  /** Minimum candles required before the engine will speak at all. */
  minCandles: number;
}

export const DEFAULT_ENDINGS_MODEL: EndingModel = {
  thresholds: {
    volumeSpike: 1.6,
    compressionRatio: 0.55,
    compressionBars: 30,
    breakoutLookback: 20,
  },
  prob: {
    BULL_END: { min: 70, max: 92 },
    BEAR_END: { min: 70, max: 92 },
    SIDEWAY_END: { min: 55, max: 72 },
    BREAKOUT_END: { min: 66, max: 88 },
  },
  targetAtrMultiple: 1.5,
  atrPeriod: 14,
  volumePeriod: 20,
  minCandles: 40,
};

export const ENDINGS_MODEL_STORAGE_KEY = 'motorboy_endings_model_v1';

/** Merge a partial override onto the defaults (ignores junk). */
export function mergeModel(override?: Partial<EndingModel> | null): EndingModel {
  if (!override) return DEFAULT_ENDINGS_MODEL;
  return {
    ...DEFAULT_ENDINGS_MODEL,
    ...override,
    thresholds: { ...DEFAULT_ENDINGS_MODEL.thresholds, ...(override.thresholds ?? {}) },
    prob: { ...DEFAULT_ENDINGS_MODEL.prob, ...(override.prob ?? {}) },
  };
}

/** Read the trader's tuned model from storage when running in a browser. */
export function loadEndingsModel(): EndingModel {
  try {
    if (typeof localStorage === 'undefined') return DEFAULT_ENDINGS_MODEL;
    const raw = localStorage.getItem(ENDINGS_MODEL_STORAGE_KEY);
    if (!raw) return DEFAULT_ENDINGS_MODEL;
    return mergeModel(JSON.parse(raw));
  } catch {
    return DEFAULT_ENDINGS_MODEL;
  }
}
