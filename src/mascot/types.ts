/**
 * MOTORBOY CENTRAL V4.1 — shared types
 *
 * Three layers, one direction of dependency:
 *   L1 `core.ts`    identity lock + one-face guard   (frozen, read-only)
 *   L2 `adapter.ts` namespace isolation, assets, conflict guard, version bridge
 *   L3 `skins.ts`   per-project palette + pose visuals (editable per project)
 * `endings.ts`, `journal.ts`, `guard.ts` are the "brain" and the "manners" that
 * sit on top of the three layers and never reach back into L1.
 */

/** One candle. Matches Binance kline subset (open/high/low/close/volume). */
export interface Ohlcv {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  /** Close time (ms). Optional so synthetic/partial feeds still work. */
  time?: number;
}

/* ------------------------------------------------------------------ L1 core */

/** The eight trading poses from the V4.1 spec. */
export type PoseId =
  | 'IDLE'
  | 'WALK_CHART'
  | 'CLIMB_CANDLE'
  | 'FALL_BREAK'
  | 'WORK_ANALYZE'
  | 'HAPPY_TP'
  | 'SAD_SL'
  | 'DRAG_FIBO'
  | 'SLEEP_WAIT';

/** Immutable identity contract — changing any value breaks every project. */
export interface FaceLock {
  readonly faceId: string;
  readonly hash: string;
  readonly realismPct: number;
  readonly features: readonly string[];
}

/* --------------------------------------------------------------- L2 adapter */

export type ProjectId = 'MOTORBOY.PROJECT.TRADING' | 'MOTORBOY.PROJECT.GARMENT' | 'MOTORBOY.PROJECT.RACING' | 'MOTORBOY.PROJECT.TEMPLE';

export interface MascotAssetSet {
  /** Hero/portrait image used by the bubble (bundler-resolved URL). */
  hero: string;
  /** Optional per-pose art; when a pose has no art the skin falls back to an emoji. */
  poses?: Partial<Record<PoseId, string>>;
}

/* ----------------------------------------------------------------- L3 skins */

export interface Palette {
  /** Master brand black (V4.1 §3). */
  masterBlack: string;
  /** Brand primary red. */
  primary: string;
  /** Bullish / positive. */
  bull: string;
  /** Bearish / risk. */
  bear: string;
  /** Signal / neutral accent. */
  signal: string;
  /** Bubble surface + border. */
  surface: string;
  border: string;
  /** In-character label shown in the bubble header. */
  label: string;
}

export interface PoseVisual {
  emoji: string;
  caption: string;
  /** Tailwind classes for the bubble ring while this pose is active. */
  ring: string;
}

export interface MascotSkin {
  projectId: ProjectId;
  /** Human name of the outfit/skin, e.g. "Trader suit". */
  name: string;
  palette: Palette;
  poses: Record<PoseId, PoseVisual>;
  /** Copy shown when onboarding a first-time user. */
  onboardingLine: string;
}

/* --------------------------------------------------------------- AI endings */

export type EndingType = 'BULL_END' | 'BEAR_END' | 'SIDEWAY_END' | 'BREAKOUT_END';

export interface EndingResult {
  type: EndingType;
  /** 0–100 confidence, already clamped. */
  prob: number;
  /** Suggested price target for the end of the move. */
  target: number;
  /** Nearest support used by the decision. */
  support: number;
  /** Nearest resistance used by the decision. */
  resistance: number;
  /** One Thai sentence — the only thing the trader is meant to read. */
  oneLineTH: string;
  /** Why, for the journal / debugging (never rendered by default). */
  reasons: string[];
  /** Candle timestamp of the decision, ISO. */
  at: string;
}

export interface EndingThresholds {
  /** Volume multiple vs 20-bar average that counts as "volume พุ่ง". */
  volumeSpike: number;
  /** Max range compression (fraction of ATR) for a sideways box. */
  compressionRatio: number;
  /** Bars of compression required before a SIDEWAY_END is declared. */
  compressionBars: number;
  /** Lookback used for the prior high/low breakout. */
  breakoutLookback: number;
}
