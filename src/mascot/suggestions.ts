import type { CryptoCoin, ForexPair, ForeignStock, ThaiStock, TradingSignal } from '../types';
import type { MascotWindowContext, MascotWindowSurface } from './feed';

/**
 * MASCOT SUGGESTIONS — the mascot reads the room and offers shortcuts.
 *
 * The problem this solves: a fixed command list ("ดู BTC", "เปิดข่าว", …) is
 * either useless or wrong the moment the user is somewhere else. The mascot
 * should know which window/feature is open and offer 3-4 questions that fit
 * *that* screen, *right now*, built from the live numbers it can already see.
 *
 * Design rules (the "อิสระ" contract):
 *  · nothing here restricts what the user may type — every suggestion is only a
 *    HEAD START that lands in the same free-text box, editable before sending;
 *  · the list is generated, never hardcoded: prompts interpolate real symbols,
 *    real prices and real percentages from the current snapshot;
 *  · the order is not fixed — a rotating seed + a 15-minute time bucket reshuffle
 *    the ranking, and suggestions the user just used are demoted;
 *  · one slot is always reserved for an off-topic "explore" idea, so the mascot
 *    never becomes a page-only button bar.
 */

export type SuggestionOrigin = 'CONTEXT' | 'LIVE_DATA' | 'RISK' | 'EXPLORE';

export type SuggestionIcon = 'sparkles' | 'trend' | 'shield' | 'globe' | 'chart' | 'news' | 'dice';

export interface MascotSuggestion {
  /** stable-ish id: `<surface|universal>:<slug>` — used to avoid repeats */
  id: string;
  /** short chip label (aim ≤ 22 Thai characters) */
  label: string;
  /** the actual question that gets put into the input box (editable, never auto-sent) */
  prompt: string;
  origin: SuggestionOrigin;
  icon: SuggestionIcon;
  /** base priority; higher wins before jitter */
  weight: number;
}

export interface SuggestionInput {
  windowContext: MascotWindowContext;
  cryptoList?: CryptoCoin[];
  signals?: TradingSignal[];
  forexRates?: ForexPair[];
  thaiStocks?: ThaiStock[];
  foreignStocks?: ForeignStock[];
  watchlist?: string[];
  drawdownBreaches?: number;
  worstDrawdownPct?: number;
  /** ids the user already tapped recently — demoted, not banned */
  recentIds?: string[];
  /** bump this to reshuffle (the "สุ่มใหม่" button) */
  seed?: number;
  /** injectable clock so tests are deterministic */
  now?: number;
  /** how many chips to return (default 4) */
  max?: number;
}

/* ------------------------------------------------------------------ helpers */

const pct = (value: number): string => `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;

const money = (value: number, digits?: number): string => {
  if (!Number.isFinite(value)) return '-';
  const abs = Math.abs(value);
  const d = digits ?? (abs < 0.01 ? 6 : abs < 1 ? 4 : 2);
  return value.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
};

const usable = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

/** biggest absolute move among rows that actually have a price */
function topMover<T extends { change?: number }>(rows: T[] | undefined, priceOf: (row: T) => number): T | null {
  if (!rows || rows.length === 0) return null;
  const priced = rows.filter((row) => usable(priceOf(row)));
  if (priced.length === 0) return null;
  return [...priced].sort((a, b) => Math.abs(b.change ?? 0) - Math.abs(a.change ?? 0))[0];
}

/** stable 32-bit hash for deterministic jitter */
function hash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/* ---------------------------------------------------------------- explore pool */

/**
 * Wildcards — deliberately NOT tied to the open window. One is picked per call
 * and rotates, so the mascot keeps offering ideas the page cannot predict.
 */
const EXPLORE_POOL: Array<{ slug: string; label: string; prompt: string }> = [
  { slug: 'rsi', label: 'อ่าน RSI ให้หน่อย', prompt: 'สอนวิธีอ่าน RSI แบบใช้จริงใน 30 วินาที พร้อมตัวอย่าง' },
  { slug: 'risk-today', label: 'วันนี้เสี่ยงอะไร', prompt: 'วันนี้มีอะไรที่ควรระวังเป็นพิเศษไหม มองจากภาพตลาดตอนนี้' },
  { slug: 'funding', label: 'Funding rate คืออะไร', prompt: 'อธิบาย funding rate ให้เข้าใจง่าย ๆ และมันบอกอะไรกับผมได้' },
  { slug: 'discipline', label: 'วางวินัยเทรด', prompt: 'ช่วยออกแบบวินัยการเทรด 5 ข้อที่ทำตามได้จริงสำหรับผม' },
  { slug: 'trailing', label: 'SL vs trailing', prompt: 'ต่างกันยังไงระหว่าง Stop Loss แบบปกติกับ trailing stop ควรใช้ตอนไหน' },
  { slug: 'critique', label: 'วิจารณ์แผนผม', prompt: 'ช่วยวิจารณ์แผนเทรดของผมตรง ๆ ว่าจุดอ่อนอยู่ตรงไหน' },
  { slug: 'blindspot', label: 'ผมมองข้ามอะไร', prompt: 'มีอะไรที่ผมกำลังมองข้ามอยู่ไหม ช่วยชี้จุดบอดให้หน่อย' },
  { slug: 'liquidity', label: 'Liquidity sweep', prompt: 'อธิบาย liquidity sweep และวิธีสังเกตก่อนเกิด ให้เห็นภาพ' },
  { slug: 'journal', label: 'เขียนบันทึกเทรด', prompt: 'ช่วยร่างบันทึกการเทรดประจำวันให้หน่อย ควรมีหัวข้ออะไรบ้าง' },
  { slug: 'psych', label: 'คุมอารมณ์ตอนขาดทุน', prompt: 'มีวิธีคุมอารมณ์ตอนขาดทุนติดกันหลายไม้ยังไงบ้าง' },
];

/* -------------------------------------------------------------------- recipes */

type Recipe = (input: SuggestionInput) => MascotSuggestion | null;

const chip = (
  id: string,
  label: string,
  prompt: string,
  origin: SuggestionOrigin,
  icon: SuggestionIcon,
  weight: number
): MascotSuggestion => ({ id, label, prompt, origin, icon, weight });

/* ------ dashboard: crypto ------------------------------------------------- */
const cryptoRecipes: Recipe[] = [
  ({ cryptoList }) => {
    const mover = topMover(cryptoList, (c) => c.price);
    if (!mover) return null;
    return chip(
      'crypto:mover',
      `${mover.symbol} ไปทางไหนต่อ`,
      `ตอนนี้ ${mover.symbol} อยู่ที่ ${money(mover.price)} (${pct(mover.change ?? 0)}) ` +
        'ช่วยดูแนวรับ-แนวต้านและบอกว่าจังหวะต่อไปควรทำอะไร',
      'LIVE_DATA',
      'trend',
      82
    );
  },
  ({ signals }) => {
    const signal = signals?.find((s) => s && Number.isFinite(s.probability));
    if (!signal) return null;
    return chip(
      'crypto:signal',
      `อธิบายสัญญาณ ${signal.symbol}`,
      `อธิบายสัญญาณ ${signal.type} ของ ${signal.symbol} ให้เข้าใจใน 1 นาที ` +
        `(SL ${money(signal.sl)} / TP ${money(signal.tp)}) ว่าเสี่ยงตรงไหน`,
      'LIVE_DATA',
      'sparkles',
      78
    );
  },
  ({ cryptoList }) => {
    if (!cryptoList || cryptoList.length < 2) return null;
    const ranked = cryptoList.filter((c) => usable(c.price)).sort((a, b) => (b.change ?? 0) - (a.change ?? 0));
    if (ranked.length < 2) return null;
    const best = ranked[0];
    const worst = ranked[ranked.length - 1];
    return chip(
      'crypto:compare',
      `เทียบ ${best.symbol} กับ ${worst.symbol}`,
      `วันนี้ ${best.symbol} (${pct(best.change ?? 0)}) กับ ${worst.symbol} (${pct(worst.change ?? 0)}) ` +
        'ตัวไหนน่าสนใจกว่ากัน และเพราะอะไร',
      'LIVE_DATA',
      'chart',
      64
    );
  },
  ({ cryptoList }) => {
    const mover = topMover(cryptoList, (c) => c.price);
    if (!mover) return null;
    return chip(
      'crypto:entry',
      `ถ้าจะเข้า ${mover.symbol}`,
      `ถ้าจะเข้า ${mover.symbol} ที่ ${money(mover.price)} วันนี้ ควรตั้งจุดเข้าและจุดตัดขาดทุนตรงไหน`,
      'CONTEXT',
      'shield',
      58
    );
  },
];

/* ------ dashboard: forex -------------------------------------------------- */
const forexRecipes: Recipe[] = [
  ({ forexRates }) => {
    const rate = topMover(forexRates, (f) => f.price);
    if (!rate) return null;
    return chip(
      'forex:mover',
      `${rate.pair} เป็นยังไง`,
      `ตอนนี้ ${rate.pair} อยู่ที่ ${money(rate.price)} (${pct(rate.change ?? 0)}) ` +
        'ช่วยวิเคราะห์ทิศทางระยะสั้นและปัจจัยที่ต้องจับตา',
      'LIVE_DATA',
      'globe',
      82
    );
  },
  ({ forexRates }) => {
    const thb = forexRates?.find((f) => f.pair.includes('THB') && usable(f.price));
    if (!thb) return null;
    return chip(
      'forex:thb',
      'เงินบาทกระทบพอร์ตไหม',
      `เงินบาทอยู่ที่ ${money(thb.price)} ต่อดอลลาร์ (${pct(thb.change ?? 0)}) ` +
        'แบบนี้กระทบพอร์ตที่ถือสินทรัพย์ดอลลาร์ของผมยังไง',
      'LIVE_DATA',
      'globe',
      70
    );
  },
  () =>
    chip(
      'forex:session',
      'ช่วงไหนควรเล่น',
      'ตอนนี้เป็นช่วงเซสชันไหนของตลาด forex และสภาพคล่องเป็นอย่างไร ควรเล่นคู่เงินแบบไหน',
      'CONTEXT',
      'chart',
      52
    ),
];

/* ------ dashboard: thai stock -------------------------------------------- */
const thaiRecipes: Recipe[] = [
  ({ thaiStocks }) => {
    const mover = topMover(thaiStocks, (s) => s.price);
    if (!mover) return null;
    return chip(
      'th:mover',
      `${mover.symbol} น่าสนไหม`,
      `${mover.symbol} (${mover.name}) ราคา ${money(mover.price)} บาท (${pct(mover.change ?? 0)}) ` +
        'พื้นฐานกับจังหวะตอนนี้เป็นอย่างไร',
      'LIVE_DATA',
      'trend',
      82
    );
  },
  ({ thaiStocks }) => {
    const dividend = [...(thaiStocks ?? [])]
      .filter((s) => usable(s.price) && typeof s.dividendYield === 'number')
      .sort((a, b) => (b.dividendYield ?? 0) - (a.dividendYield ?? 0))[0];
    if (!dividend) return null;
    return chip(
      'th:dividend',
      'ปันผลตัวไหนดี',
      `${dividend.symbol} ให้ปันผล ${dividend.dividendYield}% ถือเพื่อรับปันผลคุ้มไหมเมื่อเทียบกับความเสี่ยง`,
      'LIVE_DATA',
      'chart',
      68
    );
  },
  ({ thaiStocks }) => {
    const cheapest = [...(thaiStocks ?? [])]
      .filter((s) => usable(s.price) && typeof s.pe === 'number' && s.pe > 0)
      .sort((a, b) => (a.pe ?? 0) - (b.pe ?? 0))[0];
    if (!cheapest) return null;
    return chip(
      'th:pe',
      `${cheapest.symbol} P/E ${cheapest.pe}`,
      `${cheapest.symbol} มี P/E ${cheapest.pe} ถือว่าถูกหรือแพงเมื่อเทียบกับกลุ่ม ${cheapest.sector ?? 'เดียวกัน'}`,
      'LIVE_DATA',
      'sparkles',
      60
    );
  },
];

/* ------ dashboard: foreign stock ----------------------------------------- */
const foreignRecipes: Recipe[] = [
  ({ foreignStocks }) => {
    const mover = topMover(foreignStocks, (s) => s.price);
    if (!mover) return null;
    return chip(
      'us:mover',
      `${mover.symbol} เป็นยังไง`,
      `${mover.symbol} (${mover.name}) ราคา ${money(mover.price)} (${pct(mover.change ?? 0)}) ` +
        'ควรถือ รับเพิ่ม หรือรอ',
      'LIVE_DATA',
      'trend',
      82
    );
  },
  ({ foreignStocks }) => {
    const row = (foreignStocks ?? []).find((s) => usable(s.price) && usable(s.high52w));
    if (!row || !row.high52w) return null;
    const gap = ((row.price - row.high52w) / row.high52w) * 100;
    return chip(
      'us:52w',
      `${row.symbol} ห่างพีค ${gap.toFixed(1)}%`,
      `${row.symbol} ยังห่างจุดสูงสุด 52 สัปดาห์ ${gap.toFixed(1)}% แบบนี้คือโอกาสหรือสัญญาณอ่อนตัว`,
      'LIVE_DATA',
      'chart',
      70
    );
  },
  () =>
    chip(
      'us:earnings',
      'ต้องดูงบอะไร',
      'หุ้นสหรัฐฯ กลุ่มนี้ต้องดูตัวเลขอะไรในงบการเงินก่อนตัดสินใจ',
      'CONTEXT',
      'news',
      55
    ),
];

/* ------ dashboard: indices ----------------------------------------------- */
const indexRecipes: Recipe[] = [
  () =>
    chip(
      'index:set',
      'SET วันนี้เป็นไง',
      'ภาพรวม SET วันนี้เป็นอย่างไร นักลงทุนต่างชาติซื้อหรือขาย และแนวโน้มระยะสั้น',
      'CONTEXT',
      'chart',
      78
    ),
  () =>
    chip(
      'index:compare',
      'SET vs NASDAQ',
      'SET กับ NASDAQ วันนี้ทิศทางสวนกันไหม และมันบอกอะไรกับพอร์ตที่ถือทั้งสองตลาด',
      'CONTEXT',
      'globe',
      70
    ),
  () =>
    chip(
      'index:risk',
      'ดัชนีไหนเสี่ยงสุด',
      'ในกลุ่ม SET, NASDAQ, S&P 500, DJI ตอนนี้ดัชนีไหนเสี่ยงที่สุดและเพราะอะไร',
      'CONTEXT',
      'shield',
      58
    ),
];

/* ------ modal surfaces --------------------------------------------------- */
const atsRecipes: Recipe[] = [
  () =>
    chip('ats:flow', 'Order flow ตอนนี้', 'สรุป order flow กับความหนาแน่นของ order book ตอนนี้ให้หน่อย', 'CONTEXT', 'chart', 80),
  () =>
    chip('ats:spread', 'จับ arbitrage', 'ตอนนี้มีคู่ไหน spread กว้างพอให้จับ arbitrage ได้บ้าง และความเสี่ยงคืออะไร', 'CONTEXT', 'sparkles', 68),
];

const backtestRecipes: Recipe[] = [
  () =>
    chip('bt:params', 'ปรับพารามิเตอร์', 'ควรปรับพารามิเตอร์ backtest ยังไงให้ win rate ดีขึ้นโดยไม่ overfit', 'CONTEXT', 'chart', 80),
  () =>
    chip('bt:dd', 'Max DD ในผลทดสอบ', 'ผลทดสอบบอกอะไรเรื่อง max drawdown และผมควรรับได้แค่ไหน', 'CONTEXT', 'shield', 68),
];

const drawdownRecipes: Recipe[] = [
  ({ drawdownBreaches, worstDrawdownPct }) =>
    chip(
      'dd:status',
      'พอร์ตย่อตัวเท่าไร',
      `ตอนนี้มี ${drawdownBreaches ?? 0} ตัวที่ย่อตัวเกินเกณฑ์ และแย่สุด ${Math.abs(worstDrawdownPct ?? 0).toFixed(
        2
      )}% ควรจัดการยังไงต่อ`,
      'RISK',
      'shield',
      86
    ),
  () =>
    chip(
      'dd:action',
      'ตัวที่แย่สุดทำไงดี',
      'ตัวที่ drawdown ลึกที่สุดตอนนี้ ควรตัดขาย รอฟื้น หรือลดน้ำหนักพอร์ต',
      'RISK',
      'shield',
      74
    ),
  () =>
    chip(
      'dd:peak',
      'จุดพีคตั้งจากไหน',
      'จุดพีคที่ใช้คำนวณ drawdown มาจากอะไร และ AI ตั้งให้อัตโนมัติได้อย่างไร',
      'CONTEXT',
      'sparkles',
      58
    ),
];

const riskCalcRecipes: Recipe[] = [
  () =>
    chip('risk:size', 'คำนวณ position size', 'ช่วยคำนวณขนาด position ที่เสี่ยง 2% ต่อไม้ให้หน่อย จากพอร์ตสมมติ 100,000', 'CONTEXT', 'shield', 80),
  () =>
    chip('risk:rr', 'Risk/Reward เท่าไหร่ดี', 'ค่า Risk/Reward ขั้นต่ำที่ควรใช้คือเท่าไหร่ และทำไม', 'CONTEXT', 'chart', 66),
];

const newsRecipes: Recipe[] = [
  () => chip('news:impact', 'ข่าวไหนกระทบพอร์ต', 'ข่าวไหนวันนี้กระทบพอร์ตผมมากที่สุด และควรทำอะไร', 'CONTEXT', 'news', 80),
  () => chip('news:summary', 'สรุปข่าว 3 บรรทัด', 'สรุปข่าวตลาดวันนี้ให้ 3 บรรทัด อ่านจบใน 10 วินาที', 'CONTEXT', 'news', 68),
];

const chatRecipes: Recipe[] = [
  () => chip('chat:recap', 'สรุปที่คุยเมื่อกี้', 'ช่วยสรุปสิ่งที่เราคุยกันเมื่อกี้เป็นข้อ ๆ', 'CONTEXT', 'sparkles', 78),
  () => chip('chat:next', 'ถามต่อเรื่องความเสี่ยง', 'จากที่คุยกันมา ช่วยยกความเสี่ยงที่ผมยังไม่ได้พูดถึงให้หน่อย', 'CONTEXT', 'shield', 62),
];

const watchlistRecipes: Recipe[] = [
  ({ watchlist }) => {
    const first = watchlist?.[0];
    if (!first) return null;
    return chip(
      'wl:check',
      `เช็ค ${first}`,
      `ช่วยเช็ค ${first} ใน watchlist ให้หน่อยว่ายังน่าสนใจอยู่ไหม`,
      'LIVE_DATA',
      'trend',
      76
    );
  },
  () => chip('wl:add', 'ควรเพิ่มอะไรอีก', 'จากตลาดตอนนี้ มีสินทรัพย์อะไรที่ควรเพิ่มเข้าดูแลเป็นพิเศษ', 'CONTEXT', 'sparkles', 64),
];

const historyRecipes: Recipe[] = [
  () => chip('hist:review', 'ทบทวนไม้ที่แพ้', 'ช่วยทบทวนไม้ที่แพ้ล่าสุดว่าผิดตรงไหน และครั้งหน้าควรทำต่างออกไปยังไง', 'CONTEXT', 'chart', 78),
  () => chip('hist:stats', 'สถิติของผมเป็นไง', 'สรุปสถิติการเทรดของผมให้หน่อย ควรโฟกัสปรับอะไรก่อน', 'CONTEXT', 'chart', 66),
];

const settingsRecipes: Recipe[] = [
  () => chip('set:risk', 'ตั้งความเสี่ยงต่อวัน', 'ควรตั้งความเสี่ยงต่อวันเท่าไหร่สำหรับพอร์ตขนาดเล็ก และเพราะอะไร', 'CONTEXT', 'shield', 76),
  () => chip('set:api', 'API key ตั้งยังไง', 'วิธีตั้ง API key ของ Gemini ให้ปลอดภัยที่สุดต้องทำยังไง', 'CONTEXT', 'sparkles', 62),
];

const detailRecipes: Recipe[] = [
  ({ windowContext }) => {
    const symbol = windowContext.selectedAsset?.toUpperCase();
    if (!symbol) return null;
    return chip(
      'detail:plan',
      `แผนเทรด ${symbol}`,
      `ช่วยร่างแผนเทรด ${symbol} ให้หน่อย: จุดเข้า จุดตัดขาดทุน จุดทำกำไร และขนาดโพซิชัน`,
      'CONTEXT',
      'shield',
      80
    );
  },
  ({ windowContext }) => {
    const symbol = windowContext.selectedAsset?.toUpperCase();
    if (!symbol) return null;
    return chip(
      'detail:risk',
      `${symbol} เสี่ยงตรงไหน`,
      `ความเสี่ยงหลักของ ${symbol} ตอนนี้มีอะไรบ้าง เรียงจากหนักไปเบา`,
      'CONTEXT',
      'shield',
      70
    );
  },
];

const SURFACE_RECIPES: Record<MascotWindowSurface, Recipe[]> = {
  DASHBOARD_CRYPTO: cryptoRecipes,
  DASHBOARD_FOREX: forexRecipes,
  DASHBOARD_THAI_STOCK: thaiRecipes,
  DASHBOARD_FOREIGN_STOCK: foreignRecipes,
  DASHBOARD_INDICES: indexRecipes,
  ATS_MATRIX_MODAL: atsRecipes,
  ATS_BACKTEST_MODAL: backtestRecipes,
  CHAT_MODAL: chatRecipes,
  NEWS_MODAL: newsRecipes,
  WATCHLIST_MODAL: watchlistRecipes,
  HISTORY_MODAL: historyRecipes,
  SETTINGS_MODAL: settingsRecipes,
  RISK_CALC_MODAL: riskCalcRecipes,
  DRAWDOWN_MODAL: drawdownRecipes,
  SIGNAL_DETAIL_MODAL: detailRecipes,
  FOREX_DETAIL_MODAL: detailRecipes,
  STOCK_DETAIL_MODAL: detailRecipes,
};

/* --------------------------------------------------------------- universals */

const universalRecipes: Recipe[] = [
  ({ drawdownBreaches, worstDrawdownPct }) => {
    if (!drawdownBreaches || drawdownBreaches <= 0) return null;
    return chip(
      'global:risk',
      `มี ${drawdownBreaches} ตัวเกินเกณฑ์`,
      `มี ${drawdownBreaches} ตัวที่ย่อตัวเกินเกณฑ์ (แย่สุด ${Math.abs(worstDrawdownPct ?? 0).toFixed(2)}%) ` +
        'ควรจัดลำดับการจัดการยังไงก่อน',
      'RISK',
      'shield',
      92
    );
  },
  ({ watchlist }) => {
    if (!watchlist || watchlist.length === 0) return null;
    return chip(
      'global:watchlist',
      'สรุป watchlist',
      `สรุปสถานะ watchlist ${watchlist.length} ตัวของผมให้หน่อย ตัวไหนควรจับตาที่สุด`,
      'CONTEXT',
      'trend',
      60
    );
  },
];

/* ------------------------------------------------------------------ builder */

/**
 * Builds the contextual shortcut list for the current window.
 *
 * Order is: risk → live-data context → universal → explore wildcard.
 * That is the *intent*; the returned order is re-ranked with a jitter so two
 * consecutive calls (or two different minutes) do not look identical.
 */
export function buildMascotSuggestions(input: SuggestionInput): MascotSuggestion[] {
  const { windowContext, recentIds = [], seed = 0, max = 4 } = input;
  const now = input.now ?? Date.now();
  // 15-minute bucket: the list refreshes a few times an hour without flickering.
  const bucket = Math.floor(now / (15 * 60 * 1000));

  const surfaceRecipes = SURFACE_RECIPES[windowContext.activeSurface] ?? cryptoRecipes;
  const candidates: MascotSuggestion[] = [];

  [...surfaceRecipes, ...universalRecipes].forEach((recipe) => {
    try {
      const suggestion = recipe(input);
      if (suggestion) candidates.push(suggestion);
    } catch {
      // A recipe must never break the mascot — skip it.
    }
  });

  const seen = new Set<string>();
  const unique = candidates.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });

  const scored = unique.map((item) => {
    const jitter = hash(`${item.id}:${seed}:${bucket}`) % 13;
    const repeatPenalty = recentIds.includes(item.id) ? 40 : 0;
    return { item, score: item.weight + jitter - repeatPenalty };
  });

  scored.sort((a, b) => b.score - a.score);

  const limit = Math.max(1, max);
  const exploreSlug = EXPLORE_POOL[hash(`${seed}:${bucket}`) % EXPLORE_POOL.length];
  const explore: MascotSuggestion = chip(
    `explore:${exploreSlug.slug}`,
    exploreSlug.label,
    exploreSlug.prompt,
    'EXPLORE',
    'dice',
    50
  );

  // Reserve the last slot for the wildcard so the mascot stays more than a menu.
  const picked = scored.slice(0, limit - 1).map((entry) => entry.item);
  const alreadyThere = picked.some((item) => item.origin === 'EXPLORE');
  if (!alreadyThere) picked.push(explore);

  return picked.slice(0, limit);
}

/* ------------------------------------------------------------------ memory */

export const SUGGESTION_MEMORY_KEY = 'trading_engine_mascot_suggestions_v1';
const MEMORY_LIMIT = 12;

/** Suggestion ids the user tapped recently (newest first). */
export function loadRecentSuggestionIds(): string[] {
  try {
    const raw = localStorage.getItem(SUGGESTION_MEMORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === 'string').slice(0, MEMORY_LIMIT);
  } catch {
    return [];
  }
}

/** Remember a tap so the same chip is not offered again right away. */
export function recordSuggestionUse(id: string): string[] {
  const next = [id, ...loadRecentSuggestionIds().filter((existing) => existing !== id)].slice(0, MEMORY_LIMIT);
  try {
    localStorage.setItem(SUGGESTION_MEMORY_KEY, JSON.stringify(next));
  } catch {
    // storage full / private mode — suggestions still work, they just repeat.
  }
  return next;
}

export function resetSuggestionMemory(): void {
  try {
    localStorage.removeItem(SUGGESTION_MEMORY_KEY);
  } catch {
    // ignore
  }
}
