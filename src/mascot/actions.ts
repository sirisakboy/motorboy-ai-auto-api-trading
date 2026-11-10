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

export type MascotAction =
  | ChangeAssetAction
  | FilterStocksAction
  | OpenNewsAction
  | OpenChatAction;

export type MascotActionName = MascotAction['name'];

const SYMBOL_RE = /^[A-Za-z0-9./_-]{1,15}$/;
const MAX_QUERY = 40;
const MAX_TOPIC = 60;

/** Human/model-facing catalogue — one line per verb, kept tiny for the prompt. */
export const MASCOT_ACTION_CATALOG = `- change_asset { symbol, market?: crypto|forex|th|us|index } — เปิดสินทรัพย์ที่ผู้ใช้ถามถึง
- filter_stocks { query, market? } — กรองรายการด้วยคำค้น
- open_news { topic? } — เปิดหน้าข่าว
- open_chat { question? } — เปิดแชทเต็มเพื่อถามต่อ`;

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

/**
 * Validate one action coming from the model. Returns `null` for anything that
 * is not on the list — an unknown verb is dropped, never forwarded.
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
    default:
      return null;
  }
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
    default:
      return 'เรียบร้อยครับ';
  }
}
