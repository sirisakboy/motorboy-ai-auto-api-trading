/**
 * MASCOT ACTIONS — the small, boring, safe verb list the mascot is allowed to
 * use on the dashboard.
 *
 * Design rules:
 *  · the model never touches the DOM; it can only *ask* for one of these verbs;
 *  · every argument is re-validated here, because model output is untrusted;
 *  · the mascot does not import the app — the app registers handlers, exactly
 *    like it publishes the market feed. Unregister on unmount and the mascot
 *    simply goes back to talking.
 */

export type MascotMarket = 'crypto' | 'forex' | 'th' | 'us' | 'index';

export const MASCOT_MARKETS: MascotMarket[] = ['crypto', 'forex', 'th', 'us', 'index'];

export type MascotWindowId =
  | 'news'
  | 'chat'
  | 'watchlist'
  | 'history'
  | 'settings'
  | 'risk_calc'
  | 'drawdown'
  | 'ats_matrix'
  | 'backtest';

export const MASCOT_WINDOW_IDS: MascotWindowId[] = [
  'news',
  'chat',
  'watchlist',
  'history',
  'settings',
  'risk_calc',
  'drawdown',
  'ats_matrix',
  'backtest',
];

export interface ChangeAssetAction {
  name: 'change_asset';
  symbol: string;
  market?: MascotMarket;
}

export interface FilterStocksAction {
  name: 'filter_stocks';
  query: string;
  market?: MascotMarket;
}

export interface OpenNewsAction {
  name: 'open_news';
  topic?: string;
}

export interface OpenChatAction {
  name: 'open_chat';
  question?: string;
}

export interface OpenWindowAction {
  name: 'open_window';
  window: MascotWindowId;
}

export interface CloseWindowAction {
  name: 'close_window';
  window?: MascotWindowId | 'detail' | 'all';
}

export interface SwitchMarketTabAction {
  name: 'switch_market_tab';
  market: MascotMarket;
}

export interface SelectChartAssetAction {
  name: 'select_chart_asset';
  symbol: string;
  market?: MascotMarket;
}

export interface InspectAssetAction {
  name: 'inspect_asset';
  symbol: string;
  market?: MascotMarket;
}

export interface ToggleCurrencyAction {
  name: 'toggle_currency';
  currency: 'THB' | 'USD' | 'toggle';
}

export interface ToggleNotificationsAction {
  name: 'toggle_notifications';
  enabled?: boolean;
}

export interface ToggleWatchlistAction {
  name: 'toggle_watchlist';
  symbol: string;
}

export interface SetPriceAlertAction {
  name: 'set_price_alert';
  symbol: string;
  targetPrice: number;
}

export interface RefreshMarketDataAction {
  name: 'refresh_market_data';
}

export interface ToggleAtsInlineAction {
  name: 'toggle_ats_inline';
  enabled?: boolean;
}

export interface ClearFiltersAction {
  name: 'clear_filters';
}

export interface SyncLocalArchiveAction {
  name: 'sync_local_archive';
}

export interface ExportDailyCsvAction {
  name: 'export_daily_csv';
  dataset?: 'combined' | 'prices' | 'news';
  destination?: 'download';
  dateKey?: string;
}

export type MascotAction =
  | ChangeAssetAction
  | FilterStocksAction
  | OpenNewsAction
  | OpenChatAction
  | OpenWindowAction
  | CloseWindowAction
  | SwitchMarketTabAction
  | SelectChartAssetAction
  | InspectAssetAction
  | ToggleCurrencyAction
  | ToggleNotificationsAction
  | ToggleWatchlistAction
  | SetPriceAlertAction
  | RefreshMarketDataAction
  | ToggleAtsInlineAction
  | ClearFiltersAction
  | SyncLocalArchiveAction
  | ExportDailyCsvAction;

export type MascotActionName = MascotAction['name'];

export interface MascotCapabilitySpec {
  name: MascotActionName;
  description: string;
  parameters: {
    type: 'OBJECT';
    properties: Record<
      string,
      {
        type: 'STRING' | 'NUMBER' | 'BOOLEAN';
        description: string;
        enum?: string[];
      }
    >;
    required?: string[];
  };
}

/**
 * Dynamic schema definitions provided to Gemini Function Calling at runtime.
 * No fixed user command strings or keyword triggers exist here — Gemini
 * interprets arbitrary natural user intent against these sandbox capabilities.
 */
export const MASCOT_SANDBOX_CAPABILITIES: MascotCapabilitySpec[] = [
  {
    name: 'change_asset',
    description: 'Search/jump to an asset card on the dashboard market grid and optionally switch market tab.',
    parameters: {
      type: 'OBJECT',
      properties: {
        symbol: { type: 'STRING', description: 'Ticker or asset symbol, e.g. BTC, ETH, AAPL, AOT, EUR/USD.' },
        market: { type: 'STRING', description: 'Market category tab.', enum: MASCOT_MARKETS },
      },
      required: ['symbol'],
    },
  },
  {
    name: 'filter_stocks',
    description: 'Filter asset cards using a search keyword and optionally switch market category.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: { type: 'STRING', description: 'Search keyword such as tech, bank, PTT, SOL.' },
        market: { type: 'STRING', description: 'Optional market tab to switch into.', enum: MASCOT_MARKETS },
      },
      required: ['query'],
    },
  },
  {
    name: 'open_news',
    description: 'Open the Market News & AI Analysis modal window.',
    parameters: {
      type: 'OBJECT',
      properties: {
        topic: { type: 'STRING', description: 'Optional news topic of interest.' },
      },
    },
  },
  {
    name: 'open_chat',
    description: 'Open the full Deep Analysis AI chat modal window with an optional pre-filled prompt.',
    parameters: {
      type: 'OBJECT',
      properties: {
        question: { type: 'STRING', description: 'Optional question to pre-fill in the chat composer.' },
      },
    },
  },
  {
    name: 'open_window',
    description:
      'Open any major feature modal/window inside the app sandbox (news, chat, watchlist, history, settings, risk_calc, drawdown, ats_matrix, backtest).',
    parameters: {
      type: 'OBJECT',
      properties: {
        window: {
          type: 'STRING',
          description: 'Target window identifier inside the web app.',
          enum: MASCOT_WINDOW_IDS,
        },
      },
      required: ['window'],
    },
  },
  {
    name: 'close_window',
    description: 'Close a specific open modal window or dismiss all active overlays.',
    parameters: {
      type: 'OBJECT',
      properties: {
        window: {
          type: 'STRING',
          description: 'Window to close, or detail / all.',
          enum: [...MASCOT_WINDOW_IDS, 'detail', 'all'],
        },
      },
    },
  },
  {
    name: 'switch_market_tab',
    description: 'Switch the primary market board tab (crypto, forex, th, us, index).',
    parameters: {
      type: 'OBJECT',
      properties: {
        market: { type: 'STRING', description: 'Market tab.', enum: MASCOT_MARKETS },
      },
      required: ['market'],
    },
  },
  {
    name: 'select_chart_asset',
    description: 'Load a specific asset onto the interactive main price chart canvas.',
    parameters: {
      type: 'OBJECT',
      properties: {
        symbol: { type: 'STRING', description: 'Ticker or coin id such as BTC, ETH, EUR/USD, AAPL, AOT, SET.' },
        market: { type: 'STRING', description: 'Optional market tab.', enum: MASCOT_MARKETS },
      },
      required: ['symbol'],
    },
  },
  {
    name: 'inspect_asset',
    description: 'Open the detailed analytics/signal inspection modal for a specific crypto, forex pair, or stock.',
    parameters: {
      type: 'OBJECT',
      properties: {
        symbol: { type: 'STRING', description: 'Asset ticker/pair to inspect, e.g. BTC, ETH, EUR/USD, NVDA, PTT.' },
        market: { type: 'STRING', description: 'Optional market category hint.', enum: MASCOT_MARKETS },
      },
      required: ['symbol'],
    },
  },
  {
    name: 'toggle_currency',
    description: 'Switch display currency between THB and USD, or toggle current currency.',
    parameters: {
      type: 'OBJECT',
      properties: {
        currency: { type: 'STRING', description: 'Target display currency.', enum: ['THB', 'USD', 'toggle'] },
      },
      required: ['currency'],
    },
  },
  {
    name: 'toggle_notifications',
    description: 'Enable, disable, or toggle browser/price alert notifications.',
    parameters: {
      type: 'OBJECT',
      properties: {
        enabled: { type: 'BOOLEAN', description: 'True to enable, false to disable; omit to toggle.' },
      },
    },
  },
  {
    name: 'toggle_watchlist',
    description: 'Add or remove an asset symbol in the user watchlist.',
    parameters: {
      type: 'OBJECT',
      properties: {
        symbol: { type: 'STRING', description: 'Asset symbol to star or unstar.' },
      },
      required: ['symbol'],
    },
  },
  {
    name: 'set_price_alert',
    description: 'Register a price alert target for an asset symbol.',
    parameters: {
      type: 'OBJECT',
      properties: {
        symbol: { type: 'STRING', description: 'Asset ticker/pair.' },
        targetPrice: { type: 'NUMBER', description: 'Positive numeric target price.' },
      },
      required: ['symbol', 'targetPrice'],
    },
  },
  {
    name: 'refresh_market_data',
    description: 'Trigger an immediate refresh of live crypto, forex, stock, index, and news feeds.',
    parameters: {
      type: 'OBJECT',
      properties: {},
    },
  },
  {
    name: 'toggle_ats_inline',
    description: 'Show, hide, or toggle the inline ATS Matrix mode panel on the main page.',
    parameters: {
      type: 'OBJECT',
      properties: {
        enabled: { type: 'BOOLEAN', description: 'True to show inline, false to hide, omit to toggle.' },
      },
    },
  },
  {
    name: 'clear_filters',
    description: 'Clear active asset search/filter query so all assets appear again.',
    parameters: {
      type: 'OBJECT',
      properties: {},
    },
  },
  {
    name: 'sync_local_archive',
    description: 'Trigger a background market and news daily snapshot into the local archive.',
    parameters: {
      type: 'OBJECT',
      properties: {},
    },
  },
  {
    name: 'export_daily_csv',
    description:
      'Export daily collected price and news snapshots to structured backtest CSV and download locally.',
    parameters: {
      type: 'OBJECT',
      properties: {
        dataset: {
          type: 'STRING',
          description: 'CSV table structure: combined (price + news join), prices, or news.',
          enum: ['combined', 'prices', 'news'],
        },
        destination: {
          type: 'STRING',
          description: 'Export target: download as browser CSV file.',
          enum: ['download'],
        },
        dateKey: {
          type: 'STRING',
          description: 'Optional YYYY-MM-DD date filter; omit to export all recorded days.',
        },
      },
    },
  },
];

const SYMBOL_RE = /^[A-Za-z0-9./_-]{1,15}$/;
const MAX_QUERY = 40;
const MAX_TOPIC = 60;

/** Human/model-facing catalogue — safe UI sandbox capabilities only. */
export const MASCOT_ACTION_CATALOG = `- change_asset { symbol, market?: crypto|forex|th|us|index } — เปิดสินทรัพย์ที่ผู้ใช้ถามถึง
- filter_stocks { query, market? } — กรองรายการด้วยคำค้น
- open_news { topic? } — เปิดหน้าข่าว
- open_chat { question? } — เปิดแชทเต็มเพื่อถามต่อ
- open_window { window } — เปิดหน้าต่างฟีเจอร์ภายในแอป (news, chat, watchlist, history, settings, risk_calc, drawdown, ats_matrix, backtest)
- close_window { window? } — ปิดหน้าต่างที่เปิดอยู่
- switch_market_tab { market } — สลับหมวดหมู่ตลาดบนหน้าหลัก
- select_chart_asset { symbol, market? } — เปลี่ยนกราฟหลักเป็นสินทรัพย์ที่ระบุ
- inspect_asset { symbol, market? } — เปิดหน้าต่างรายละเอียดสัญญาณของสินทรัพย์
- toggle_currency { currency: THB|USD|toggle } — สลับสกุลเงินแสดงผล
- toggle_notifications { enabled? } — เปิดหรือปิดการแจ้งเตือน
- toggle_watchlist { symbol } — เพิ่มหรือลบออกจากรายการโปรด
- set_price_alert { symbol, targetPrice } — ตั้งแจ้งเตือนราคาเป้าหมาย
- refresh_market_data {} — รีเฟรชฟีดราคาและข่าวล่าสุดทั้งหมด
- toggle_ats_inline { enabled? } — เปิดหรือปิดโหมด ATS Matrix บนหน้าหลัก
- clear_filters {} — ล้างคำค้นหาทั้งหมด
- sync_local_archive {} — บันทึกข้อมูลตลาดเข้าคลังหลังบ้านในเครื่อง
- export_daily_csv { dataset?: combined|prices|news, destination?: download, dateKey? } — ส่งออกข้อมูลราคาและข่าวรายวันเป็นไฟล์ CSV สำหรับ Backtest`;

function asString(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

/** Symbols are validated whole — a truncated ticker is a different ticker. */
function asSymbol(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!SYMBOL_RE.test(trimmed)) return null;
  return trimmed.toUpperCase();
}

function asMarket(value: unknown): MascotMarket | undefined {
  return typeof value === 'string' && (MASCOT_MARKETS as string[]).includes(value)
    ? (value as MascotMarket)
    : undefined;
}

function asWindowId(value: unknown): MascotWindowId | null {
  return typeof value === 'string' && (MASCOT_WINDOW_IDS as string[]).includes(value)
    ? (value as MascotWindowId)
    : null;
}

function asCloseTarget(value: unknown): MascotWindowId | 'detail' | 'all' | undefined {
  if (value === 'detail' || value === 'all') return value;
  const w = asWindowId(value);
  return w ?? undefined;
}

/**
 * Validate one action coming from the model. Returns `null` for anything that
 * is not on the whitelist — an unknown verb is dropped, never forwarded.
 */
export function parseMascotAction(raw: unknown): MascotAction | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Record<string, unknown>;
  const name = candidate.name ?? candidate.action ?? candidate.type;
  const args = (candidate.args ?? candidate.arguments ?? candidate.parameters ?? {}) as Record<
    string,
    unknown
  >;
  if (typeof name !== 'string') return null;

  switch (name) {
    case 'change_asset': {
      const symbol = asSymbol(args.symbol ?? args.asset);
      if (!symbol) return null;
      return {
        name: 'change_asset',
        symbol,
        market: asMarket(args.market),
      };
    }
    case 'filter_stocks': {
      const query = asString(args.query ?? args.keyword ?? args.text, MAX_QUERY);
      if (!query) return null;
      return { name: 'filter_stocks', query, market: asMarket(args.market) };
    }
    case 'open_news':
      return { name: 'open_news', topic: asString(args.topic ?? args.query, MAX_TOPIC) ?? undefined };
    case 'open_chat':
      return {
        name: 'open_chat',
        question: asString(args.question ?? args.query, MAX_TOPIC) ?? undefined,
      };
    case 'open_window': {
      const targetWindow = asWindowId(args.window);
      if (!targetWindow) return null;
      return { name: 'open_window', window: targetWindow };
    }
    case 'close_window':
      return { name: 'close_window', window: asCloseTarget(args.window) };
    case 'switch_market_tab': {
      const market = asMarket(args.market);
      if (!market) return null;
      return { name: 'switch_market_tab', market };
    }
    case 'select_chart_asset': {
      const symbol = asSymbol(args.symbol ?? args.asset);
      if (!symbol) return null;
      return { name: 'select_chart_asset', symbol, market: asMarket(args.market) };
    }
    case 'inspect_asset': {
      const symbol = asSymbol(args.symbol ?? args.asset);
      if (!symbol) return null;
      return { name: 'inspect_asset', symbol, market: asMarket(args.market) };
    }
    case 'toggle_currency': {
      const rawCurrency = typeof args.currency === 'string' ? args.currency.trim().toUpperCase() : '';
      const currency: 'THB' | 'USD' | 'toggle' =
        rawCurrency === 'THB' ? 'THB' : rawCurrency === 'USD' ? 'USD' : 'toggle';
      return { name: 'toggle_currency', currency };
    }
    case 'toggle_notifications':
      return {
        name: 'toggle_notifications',
        enabled: typeof args.enabled === 'boolean' ? args.enabled : undefined,
      };
    case 'toggle_watchlist': {
      const symbol = asSymbol(args.symbol ?? args.asset);
      if (!symbol) return null;
      return { name: 'toggle_watchlist', symbol };
    }
    case 'set_price_alert': {
      const symbol = asSymbol(args.symbol ?? args.asset);
      const targetPrice = Number(args.targetPrice);
      if (!symbol || !Number.isFinite(targetPrice) || targetPrice <= 0) return null;
      return { name: 'set_price_alert', symbol, targetPrice: +targetPrice.toFixed(6) };
    }
    case 'refresh_market_data':
      return { name: 'refresh_market_data' };
    case 'toggle_ats_inline':
      return {
        name: 'toggle_ats_inline',
        enabled: typeof args.enabled === 'boolean' ? args.enabled : undefined,
      };
    case 'clear_filters':
      return { name: 'clear_filters' };
    case 'sync_local_archive':
      return { name: 'sync_local_archive' };
    case 'export_daily_csv': {
      const ds =
        args.dataset === 'prices' || args.dataset === 'news' ? args.dataset : 'combined';
      const rawDate =
        typeof args.dateKey === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(args.dateKey.trim())
          ? args.dateKey.trim()
          : undefined;
      return {
        name: 'export_daily_csv',
        dataset: ds,
        destination: 'download',
        ...(rawDate ? { dateKey: rawDate } : {}),
      };
    }
    default:
      return null;
  }
}

export function parseMascotActions(rawList: unknown): MascotAction[] {
  if (!Array.isArray(rawList)) {
    const single = parseMascotAction(rawList);
    return single ? [single] : [];
  }
  const parsed: MascotAction[] = [];
  for (const item of rawList.slice(0, 4)) {
    const valid = parseMascotAction(item);
    if (valid) parsed.push(valid);
  }
  return parsed;
}

/* --------------------------------------------------------------- registry */

export type MascotActionHandler = (action: MascotAction) => void;
export type MascotActionHandlers = Partial<Record<MascotActionName, MascotActionHandler>>;

let handlers: MascotActionHandlers = {};

/**
 * Register the app's handlers. Returns an unregister function so a component
 * can clean up in its effect teardown.
 */
export function registerMascotActionHandlers(next: MascotActionHandlers): () => void {
  handlers = { ...next };
  return () => {
    handlers = {};
  };
}

export function resetMascotActionHandlers(): void {
  handlers = {};
}

/** True when somebody was listening. Never throws into the mascot. */
export function dispatchMascotAction(action: MascotAction | null): boolean {
  if (!action) return false;
  const handler = handlers[action.name];
  if (!handler) return false;
  try {
    handler(action);
    return true;
  } catch (error) {
    console.warn('[Mascot] action failed:', action.name, error);
    return false;
  }
}

export function dispatchMascotActions(actions: MascotAction[]): number {
  let count = 0;
  for (const act of actions) {
    if (dispatchMascotAction(act)) count += 1;
  }
  return count;
}

/** Short Thai confirmation for the bubble, so the user sees what happened. */
export function describeMascotAction(action: MascotAction): string {
  switch (action.name) {
    case 'change_asset':
      return `เปิด ${action.symbol} ให้แล้วครับ`;
    case 'filter_stocks':
      return `กรองด้วยคำว่า “${action.query}” ให้แล้วครับ`;
    case 'open_news':
      return 'เปิดหน้าข่าวให้แล้วครับ';
    case 'open_chat':
      return 'เปิดแชทเต็มให้แล้วครับ';
    case 'open_window':
      return `เปิดหน้าต่าง ${action.window} ให้แล้วครับ`;
    case 'close_window':
      return 'ปิดหน้าต่างให้แล้วครับ';
    case 'switch_market_tab':
      return `สลับไปหมวด ${action.market.toUpperCase()} แล้วครับ`;
    case 'select_chart_asset':
      return `สลับกราฟไปที่ ${action.symbol} แล้วครับ`;
    case 'inspect_asset':
      return `เปิดรายละเอียดของ ${action.symbol} ให้แล้วครับ`;
    case 'toggle_currency':
      return `ปรับสกุลเงินเป็น ${action.currency} แล้วครับ`;
    case 'toggle_notifications':
      return action.enabled === false ? 'ปิดการแจ้งเตือนแล้วครับ' : 'ปรับสถานะการแจ้งเตือนแล้วครับ';
    case 'toggle_watchlist':
      return `อัปเดตรายการโปรด ${action.symbol} แล้วครับ`;
    case 'set_price_alert':
      return `ตั้งแจ้งเตือน ${action.symbol} ที่ ${action.targetPrice} แล้วครับ`;
    case 'refresh_market_data':
      return 'กำลังรีเฟรชข้อมูลตลาดล่าสุดครับ';
    case 'toggle_ats_inline':
      return 'สลับแผง ATS Matrix บนหน้าหลักแล้วครับ';
    case 'clear_filters':
      return 'ล้างตัวกรองค้นหาให้แล้วครับ';
    case 'sync_local_archive':
      return 'บันทึกข้อมูลเข้าคลังหลังบ้านแล้วครับ';
    case 'export_daily_csv':
      return 'กำลังส่งออกและดาวน์โหลดไฟล์ CSV ข้อมูลราคาและข่าวรายวันครับ';
    default:
      return 'เรียบร้อยครับ';
  }
}
