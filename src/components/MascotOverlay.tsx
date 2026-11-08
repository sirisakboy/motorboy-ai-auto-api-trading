import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles, ChevronDown, RefreshCw, ShieldAlert, Zap } from 'lucide-react';
import { useMascotStore, type MascotState } from '../services/mascotService';
import { fetchMascotLine } from '../services/mascotAiService';
import type { CryptoCoin, TradingSignal } from '../types';
import mascotHero from '../assets/images/nong_motorboy_hero_1794000288918.jpg';

/**
 * Floating "Nong MotorBoy" mascot.
 *
 * Adapted from the drop-in HTML/CSS/JS snippet to this codebase:
 *  - React component (no global <div>/script injection, no `window.zenitsuUI`)
 *  - driven by the existing Zustand `useMascotStore` states instead of a private
 *    state machine, so every mascot trigger already wired in App/modals works
 *  - speech bubble text can come from a real Gemini call (`/api/gemini/mascot-line`),
 *    falling back silently to the canned Thai line from the store
 *
 * Layout contract (this is the important part):
 *  - the fixed wrapper is `pointer-events-none`, so clicks go straight through to
 *    the chart and the BUY/SELL buttons — nothing is ever blocked
 *  - only the small bubble/card itself is `pointer-events-auto`
 *  - while the pointer hovers any interactive element or the chart, the mascot
 *    fades to 30% and shrinks so it never sits on top of a price or a control
 *  - it collapses back to a 56px chip after a few seconds and can be hidden
 *  - z-40: below every modal (z-50), above page content
 */

const AUTO_COLLAPSE_MS = 7000;
const INTERACTIVE_SELECTOR =
  'button, a[href], input, select, textarea, canvas, [role="button"], [data-mascot-avoid]';

const STATE_META: Record<
  MascotState,
  { accent: string; ring: string; label: string; emoji: string }
> = {
  IDLE: { accent: 'text-[#FF2D55]', ring: 'border-[#252A3A]', label: 'พร้อมช่วยครับ', emoji: '🏍️' },
  SCANNING: { accent: 'text-sky-400', ring: 'border-sky-500/60', label: 'กำลังสแกนตลาด', emoji: '🧐' },
  CONFIRM_TRADE: { accent: 'text-amber-300', ring: 'border-amber-400/60', label: 'รอยืนยันแผน', emoji: '🤔' },
  READY_TO_EXECUTE: { accent: 'text-[#00F0FF]', ring: 'border-[#00F0FF]/70', label: 'GOD SPEED ⚡', emoji: '🚀' },
  TP_CELEBRATE: { accent: 'text-emerald-400', ring: 'border-emerald-500/70', label: 'ถึงเป้า TP แล้ว', emoji: '🥳' },
  SL_RESPECTED: { accent: 'text-orange-400', ring: 'border-orange-500/60', label: 'คัต SL ตามวินัย', emoji: '😢' },
  RISK_REJECT: { accent: 'text-orange-400', ring: 'border-orange-500/70', label: 'เสี่ยงเกินกำหนด', emoji: '😠' },
  KILL_SWITCH_ACTIVE: { accent: 'text-red-400', ring: 'border-red-500/80', label: 'หยุดเทรดชั่วคราว', emoji: '🛑' },
  SIDEWAYS: { accent: 'text-slate-300', ring: 'border-slate-600/70', label: 'ตลาดนิ่ง พักก่อน', emoji: '😴' },
  ONBOARDING: { accent: 'text-[#A855F7]', ring: 'border-[#A855F7]/60', label: 'ยินดีต้อนรับ', emoji: '👋' },
};

const ACTIVE_STATES: MascotState[] = [
  'SCANNING',
  'CONFIRM_TRADE',
  'READY_TO_EXECUTE',
  'TP_CELEBRATE',
  'SL_RESPECTED',
  'RISK_REJECT',
  'KILL_SWITCH_ACTIVE',
  'ONBOARDING',
];

export interface MascotOverlayProps {
  cryptoList?: CryptoCoin[];
  signals?: TradingSignal[];
  useThb?: boolean;
  usdThbRate?: number;
  geminiApiKey?: string;
}

export const MascotOverlay: React.FC<MascotOverlayProps> = ({
  cryptoList = [],
  signals = [],
  useThb = false,
  usdThbRate = 36.45,
  geminiApiKey = '',
}) => {
  const { state, message } = useMascotStore();
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [nearInteractive, setNearInteractive] = useState(false);
  const [aiLine, setAiLine] = useState<string | null>(null);
  const [isLoadingLine, setIsLoadingLine] = useState(false);

  // Context changes every market tick; keep it in a ref so `requestLine` stays
  // stable and the bubble text does not flicker back to the canned line.
  const ctxRef = useRef({ cryptoList, signals, useThb, usdThbRate, geminiApiKey });
  ctxRef.current = { cryptoList, signals, useThb, usdThbRate, geminiApiKey };
  const stateRef = useRef(state);
  stateRef.current = state;

  const isActive = ACTIVE_STATES.includes(state);
  const meta = STATE_META[state] ?? STATE_META.IDLE;
  const isCritical = state === 'KILL_SWITCH_ACTIVE' || state === 'RISK_REJECT';

  /* ---------------------------------------------------------------- Gemini */
  const requestLine = useCallback(async (force: boolean) => {
    setIsLoadingLine(true);
    try {
      const line = await fetchMascotLine({
        state: stateRef.current,
        force,
        ...ctxRef.current,
      });
      if (line) setAiLine(line);
      return line;
    } finally {
      setIsLoadingLine(false);
    }
  }, []);

  // A new mascot state invalidates the previous AI sentence…
  useEffect(() => {
    setAiLine(null);
  }, [state]);

  // …and triggers exactly one attempt (the service throttles to 1/min).
  // Failure is silent: the bubble keeps the canned line from the store.
  useEffect(() => {
    if (!isActive && state !== 'IDLE') return;
    let cancelled = false;
    (async () => {
      const line = await requestLine(false);
      if (!cancelled && line) setAiLine(line);
    })();
    return () => {
      cancelled = true;
    };
  }, [state, isActive, requestLine]);

  /* ------------------------------------------------- expand / auto-collapse */
  useEffect(() => {
    if (!isActive) return;
    setExpanded(true);
    const timer = window.setTimeout(() => setExpanded(false), AUTO_COLLAPSE_MS);
    return () => window.clearTimeout(timer);
  }, [state, message, isActive]);

  /* ------------------------------------------------------- don't block the UI */
  useEffect(() => {
    let frame = 0;
    let last = false;

    const onPointerMove = (event: PointerEvent) => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const target = document.elementFromPoint(event.clientX, event.clientY);
        const hit = !!(target && target.closest(INTERACTIVE_SELECTOR));
        if (hit !== last) {
          last = hit;
          setNearInteractive(hit);
        }
      });
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  // Escape collapses the bubble without closing anything else.
  useEffect(() => {
    if (!expanded) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setExpanded(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [expanded]);

  const bubbleText = useMemo(() => aiLine || message, [aiLine, message]);

  if (dismissed) return null;

  const showCard = expanded || isActive;

  return (
    <div
      className="fixed z-40 pointer-events-none select-none"
      style={{
        right: 'calc(0.75rem + env(safe-area-inset-right, 0px))',
        bottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))',
      }}
      data-testid="mascot-overlay"
    >
      <div
        className={`flex flex-col items-end transition-all duration-300 ${
          nearInteractive ? 'opacity-30 scale-90' : 'opacity-100 scale-100'
        }`}
      >
        {showCard ? (
          <div
            role="status"
            aria-live="polite"
            className={`pointer-events-auto w-[248px] sm:w-[264px] rounded-2xl border bg-[#141721]/95 backdrop-blur-md shadow-[0_10px_30px_rgba(0,0,0,0.45)] p-3 ${meta.ring} ${
              isCritical ? 'shadow-[0_0_25px_rgba(239,68,68,0.35)]' : ''
            }`}
          >
            <div className="flex items-start gap-2.5">
              <div className="relative shrink-0">
                <img
                  src={mascotHero}
                  alt="น้องมอเตอร์บอย"
                  className="w-12 h-12 rounded-xl object-cover border border-white/10"
                />
                <span
                  className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-[#141721] flex items-center justify-center text-[9px] ${
                    isCritical ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'
                  }`}
                  aria-hidden="true"
                >
                  {meta.emoji}
                </span>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <span className={`text-[10px] font-black uppercase tracking-wider ${meta.accent} flex items-center gap-1`}>
                    {isCritical ? <ShieldAlert className="w-3 h-3" aria-hidden="true" /> : <Sparkles className="w-3 h-3" aria-hidden="true" />}
                    {meta.label}
                  </span>
                  <button
                    type="button"
                    onClick={() => setExpanded(false)}
                    aria-label="ย่อมาสคอต"
                    className="text-slate-400 hover:text-white p-0.5 rounded transition-colors"
                  >
                    <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-200 break-words">{bubbleText}</p>
              </div>
            </div>

            <div className="mt-2 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => requestLine(true)}
                disabled={isLoadingLine}
                className="inline-flex items-center gap-1 text-[10px] font-bold text-[#A5B4FC] hover:text-white disabled:opacity-50 transition-colors"
              >
                <RefreshCw className={`w-3 h-3 ${isLoadingLine ? 'animate-spin' : ''}`} aria-hidden="true" />
                {isLoadingLine ? 'กำลังคิด...' : 'ให้ AI พูด'}
              </button>
              <button
                type="button"
                onClick={() => setDismissed(true)}
                className="text-[10px] font-bold text-slate-500 hover:text-slate-300 transition-colors"
              >
                ซ่อน
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            aria-label={`น้องมอเตอร์บอย — ${meta.label}. เปิดกล่องข้อความ`}
            className={`pointer-events-auto w-14 h-14 rounded-full border bg-[#141721]/95 backdrop-blur-md shadow-lg flex items-center justify-center overflow-hidden relative ${meta.ring} hover:scale-105 transition-transform`}
          >
            <img src={mascotHero} alt="" className="w-full h-full object-cover" aria-hidden="true" />
            <span
              className={`absolute bottom-0.5 right-0.5 w-3 h-3 rounded-full border-2 border-[#141721] ${
                isCritical ? 'bg-red-500' : state === 'READY_TO_EXECUTE' ? 'bg-[#00F0FF]' : 'bg-emerald-500'
              }`}
              aria-hidden="true"
            />
            {state === 'READY_TO_EXECUTE' && (
              <Zap className="absolute top-1 left-1 w-3 h-3 text-[#00F0FF]" aria-hidden="true" />
            )}
          </button>
        )}
      </div>
    </div>
  );
};

export default MascotOverlay;
