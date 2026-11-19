import { create } from 'zustand';
import type { CryptoCoin, ForexPair, ForeignStock, ThaiStock, TradingSignal } from '../types';

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
export type MascotWindowSurface =
  | 'DASHBOARD_CRYPTO'
  | 'DASHBOARD_FOREX'
  | 'DASHBOARD_THAI_STOCK'
  | 'DASHBOARD_FOREIGN_STOCK'
  | 'DASHBOARD_INDICES'
  | 'ATS_MATRIX_MODAL'
  | 'ATS_BACKTEST_MODAL'
  | 'CHAT_MODAL'
  | 'NEWS_MODAL'
  | 'WATCHLIST_MODAL'
  | 'HISTORY_MODAL'
  | 'SETTINGS_MODAL'
  | 'RISK_CALC_MODAL'
  | 'DRAWDOWN_MODAL'
  | 'SIGNAL_DETAIL_MODAL'
  | 'FOREX_DETAIL_MODAL'
  | 'STOCK_DETAIL_MODAL';

export interface MascotWindowContext {
  activeSurface: MascotWindowSurface;
  windowTitleTh: string;
  activeTabLabel: string;
  selectedAsset: string;
  openWindows: string[];
  focusHint: string;
}

export const DEFAULT_WINDOW_CONTEXT: MascotWindowContext = {
  activeSurface: 'DASHBOARD_CRYPTO',
  windowTitleTh: 'หน้าหลัก · ตลาดคริปโต',
  activeTabLabel: 'คริปโต',
  selectedAsset: 'bitcoin',
  openWindows: [],
  focusHint: 'ภาพรวมราคา สัญญาณเทรด และแนวโน้มตลาดหลัก',
};

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
  /** Other market feeds the mascot may quote in its contextual shortcuts. */
  forexRates: ForexPair[];
  thaiStocks: ThaiStock[];
  foreignStocks: ForeignStock[];
  /** Symbols the user is watching (used for "สรุป watchlist" shortcuts). */
  watchlist: string[];
  /** Active screen/modal and focus guidance so the mascot knows where the user is. */
  windowContext: MascotWindowContext;
  /** Active sub-tab inside AtsMatrixDashboard so mascot knows LIVE_MATRIX vs BACKTEST. */
  atsActiveTab: 'LIVE_MATRIX' | 'BACKTEST';
  /** Optional programmatic tab switch requested inside AtsMatrixDashboard. */
  atsRequestedTab: 'LIVE_MATRIX' | 'BACKTEST' | null;
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
  forexRates: [],
  thaiStocks: [],
  foreignStocks: [],
  watchlist: [],
  windowContext: { ...DEFAULT_WINDOW_CONTEXT },
  atsActiveTab: 'LIVE_MATRIX',
  atsRequestedTab: null,
  updatedAt: 0,
};

export const useMascotFeed = create<MascotFeedState>(() => ({ ...DEFAULT_MASCOT_FEED }));

/** Publish everything the mascot is allowed to know. Safe to call every render. */
export function publishMascotFeed(patch: Partial<MascotFeedState>): void {
  useMascotFeed.setState({ ...patch, updatedAt: Date.now() });
}

export function requestAtsDashboardTab(tab: 'LIVE_MATRIX' | 'BACKTEST' | null): void {
  useMascotFeed.setState({ atsRequestedTab: tab, updatedAt: Date.now() });
}

/** Test helper / sign-out reset. */
export function resetMascotFeed(): void {
  useMascotFeed.setState({ ...DEFAULT_MASCOT_FEED, windowContext: { ...DEFAULT_WINDOW_CONTEXT } });
}

