import { create } from 'zustand';
import type { CryptoCoin, TradingSignal } from '../types';

/**
 * MASCOT FEED — the mascot's own copy of "what the app knows".
 *
 * Before this module the overlay needed five props (`cryptoList`, `signals`,
 * `useThb`, `usdThbRate`, `geminiApiKey`) drilled through `App.tsx`, which meant
 * the mascot could only ever live at the bottom of that one component tree and
 * could not react to anything unless the parent re-rendered.
 *
 * Now the app *publishes* a snapshot here and the mascot *subscribes*. The
 * consequence that matters: `<MascotOverlay />` renders and behaves correctly
 * with **no props at all** — it can be dropped into any surface (a modal, a
 * settings preview, a future docs page) and still sees live data.
 *
 * Props still win when supplied, so existing call sites keep working and tests
 * can pin an exact snapshot.
 */
export interface MascotFeedState {
  cryptoList: CryptoCoin[];
  signals: TradingSignal[];
  useThb: boolean;
  usdThbRate: number;
  /** Gemini key the user may have pasted in settings (optional). */
  apiKey: string;
  /** Assets currently breaching their drawdown threshold. */
  drawdownBreaches: number;
  /** Worst drawdown across the portfolio, in percent. */
  worstDrawdownPct: number;
  /** Timestamp of the last publish — useful for "stale feed" reasoning. */
  updatedAt: number;
}

export const DEFAULT_MASCOT_FEED: MascotFeedState = {
  cryptoList: [],
  signals: [],
  useThb: false,
  usdThbRate: 36.45,
  apiKey: '',
  drawdownBreaches: 0,
  worstDrawdownPct: 0,
  updatedAt: 0,
};

export const useMascotFeed = create<MascotFeedState>(() => ({ ...DEFAULT_MASCOT_FEED }));

/** Publish everything the mascot is allowed to know. Safe to call every render. */
export function publishMascotFeed(patch: Partial<MascotFeedState>): void {
  useMascotFeed.setState({ ...patch, updatedAt: Date.now() });
}

/** Test helper / sign-out reset. */
export function resetMascotFeed(): void {
  useMascotFeed.setState({ ...DEFAULT_MASCOT_FEED });
}
