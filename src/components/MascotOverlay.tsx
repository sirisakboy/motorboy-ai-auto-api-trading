import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Sparkles,
  ChevronDown,
  RefreshCw,
  ShieldAlert,
  Volume2,
  VolumeX,
  TrendingUp,
  TrendingDown,
  Activity,
} from 'lucide-react';
import { useMascotStore, type MascotState } from '../services/mascotService';
import { useMascotFeed } from '../mascot/feed';
import { useMascotAutoPilot } from '../mascot/observer';
import { canReachServer, fetchMascotLine } from '../services/mascotAiService';
import type { CryptoCoin, TradingSignal } from '../types';
import type { EndingResult, EndingType, Ohlcv, PoseId } from '../mascot/types';
import { FACE_ID, MASCOT_FACE_ATTR, MASCOT_ROOT_ATTR, countMountedFaces } from '../mascot/core';
import { resolveMascot } from '../mascot/adapter';
import { formatPrice } from '../utils';
import { RUST_MODERN_COLORS, RUST_MODERN_LAYOUT } from '../mascot/tokens';
import { poseVisual, TRADING_SKIN } from '../mascot/skins';
import { analyzeEndings, fetchEndingsCandles } from '../mascot/endings';
import { loadEndingsModel } from '../mascot/endingsModel';
import {
  loadMascotPosition,
  loadMascotSettings,
  recordEnding,
  saveMascotPosition,
  saveMascotSettings,
  type MascotPosition,
  type MascotSettings,
} from '../mascot/journal';
import {
  AUTO_HIDE_AFTER_SPEAK_MS,
  NEVER_BLOCK_SELECTOR,
  knock,
  ghostOpacity,
  isNearProtected,
  onboardingTarget,
  resolvePose,
  shouldKnock,
  shouldMinimize,
} from '../mascot/guard';

/**
 * MOTORBOY CENTRAL V4.1 — floating “ending guard”.
 *
 * The drop-in snippet from the spec, rebuilt inside this app's architecture:
 *   · identity / assets come from L1 `mascot/core.ts` + L2 `mascot/adapter.ts`
 *   · every colour comes from L3 `mascot/skins.ts` (no hex literals here)
 *   · the pose follows real behaviour (spec §4), not just the store state
 *   · the brain (`mascot/endings.ts`) speaks ONE Thai sentence about where the
 *     current move ends — bull / bear / sideways / breakout
 *   · manners (`mascot/guard.ts`) keep it off the chart: click-through layer,
 *     100px avoidance, ghost opacity, 2-minute minimize, auto-hide after
 *     speaking, quiet mode, knock alert (§6.1–6.10)
 *
 * It must never block the chart or a button. If in doubt, it gets smaller.
 */

const STATE_LABEL_TH: Record<string, string> = {
  IDLE: 'พร้อมช่วยครับ',
  SCANNING: 'กำลังสแกนตลาด',
  CONFIRM_TRADE: 'รอยืนยันแผน',
  READY_TO_EXECUTE: 'GOD SPEED ⚡',
  TP_CELEBRATE: 'ถึงเป้า TP แล้ว',
  SL_RESPECTED: 'คัต SL ตามวินัย',
  RISK_REJECT: 'เสี่ยงเกินกำหนด',
  KILL_SWITCH_ACTIVE: 'หยุดเทรดชั่วคราว',
  SIDEWAYS: 'ตลาดนิ่ง พักก่อน',
  ONBOARDING: 'ยินดีต้อนรับ',
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

const ENDING_LABEL: Record<EndingType, { short: string; icon: React.ReactNode }> = {
  BULL_END: { short: 'BULL END', icon: <TrendingUp className="w-3 h-3" aria-hidden="true" /> },
  BEAR_END: { short: 'BEAR END', icon: <TrendingDown className="w-3 h-3" aria-hidden="true" /> },
  SIDEWAY_END: { short: 'SIDEWAY', icon: <Activity className="w-3 h-3" aria-hidden="true" /> },
  BREAKOUT_END: { short: 'BREAKOUT', icon: <Sparkles className="w-3 h-3" aria-hidden="true" /> },
};

export interface MascotOverlayProps {
  /**
   * Every prop is optional. Leave them out and the mascot reads the published
   * snapshot from `mascot/feed.ts` instead — `<MascotOverlay />` on its own is a
   * complete, self-driving mascot. Passing a prop still wins, which is what the
   * tests use to pin an exact market.
   */
  cryptoList?: CryptoCoin[];
  signals?: TradingSignal[];
  useThb?: boolean;
  usdThbRate?: number;
  geminiApiKey?: string;
  /** Skip the built-in volatility / drawdown observer (tests, demos). */
  disableAutoPilot?: boolean;
  /** Market analysed for endings (Binance symbol). Defaults to the first tile. */
  endingSymbol?: string;
  /** Disable the candle feed (tests / offline demo). */
  disableEndingsFeed?: boolean;
  /** Open the full AI chat — the mascot is the door to it. */
  onOpenChat?: () => void;
}

export const MascotOverlay: React.FC<MascotOverlayProps> = ({
  cryptoList: cryptoListProp,
  signals: signalsProp,
  useThb: useThbProp,
  usdThbRate: usdThbRateProp,
  geminiApiKey: geminiApiKeyProp,
  endingSymbol,
  disableEndingsFeed = false,
  disableAutoPilot = false,
  onOpenChat,
}) => {
  const { state, message } = useMascotStore();
  const feed = useMascotFeed();
  // Props win, feed fills the gaps, constants are the last resort.
  const cryptoList = cryptoListProp ?? feed.cryptoList;
  const signals = signalsProp ?? feed.signals;
  const useThb = useThbProp ?? feed.useThb;
  const usdThbRate = usdThbRateProp ?? feed.usdThbRate ?? 36.45;
  const geminiApiKey = geminiApiKeyProp ?? feed.apiKey;

  // The mascot runs its own detector; the dashboard only publishes data.
  useMascotAutoPilot(!disableAutoPilot);
  const skin = TRADING_SKIN;
  const palette = skin.palette;
  const mascot = resolveMascot();
  const symbol = endingSymbol || cryptoList[0]?.binanceSymbol || 'BTCUSDT';

  const [expanded, setExpanded] = useState(false);
  const [settings, setSettings] = useState<MascotSettings>(() => loadMascotSettings());
  const [dismissed, setDismissed] = useState(false);
  const [nearInteractive, setNearInteractive] = useState(false);
  const [aiLine, setAiLine] = useState<string | null>(null);
  const [isLoadingLine, setIsLoadingLine] = useState(false);
  const [ending, setEnding] = useState<EndingResult | null>(null);
  const [candles, setCandles] = useState<Ohlcv[] | null>(null);
  const [lastActivityAt, setLastActivityAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [knockedAt, setKnockedAt] = useState<number | null>(null);

  const isActive = ACTIVE_STATES.includes(state);
  const isCritical =
    state === 'KILL_SWITCH_ACTIVE' || state === 'RISK_REJECT' || ending?.type === 'BEAR_END';

  /* --------------------------------------- live market context kept in a ref */
  const ctxRef = useRef({ cryptoList, signals, useThb, usdThbRate, geminiApiKey });
  ctxRef.current = { cryptoList, signals, useThb, usdThbRate, geminiApiKey };
  const stateRef = useRef(state);
  stateRef.current = state;

  /* ------------------------------------------------------- L1/L2 mount guard */
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const mounted = countMountedFaces(document);
    // 1 = this component. Anything above means a second face exists (legacy
    // script, double mount, hot reload) — the core contract forbids it.
    if (mounted > 1) {
      console.warn(`[Mascot] one-face rule violated: ${mounted} roots found`);
    }
  }, []);

  /* ---------------------------------------- detected risk must be seen (§6) */
  // "ซ่อน" hides the chip for this session, but it must not swallow a risk
  // event the detectors catch *afterwards*. KILL_SWITCH_ACTIVE / RISK_REJECT
  // re-open the bubble so a warning can never be lost silently.
  const riskDetected = state === 'KILL_SWITCH_ACTIVE' || state === 'RISK_REJECT';
  useEffect(() => {
    if (riskDetected) setDismissed(false);
  }, [riskDetected]);

  /* ---------------------------------------------------------------- timers */
  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(tick);
  }, []);

  const idleMs = Math.max(0, now - lastActivityAt);
  const minimized = shouldMinimize(lastActivityAt, now) && !isActive;

  /* --------------------------------------------------- endings brain (§5) */
  useEffect(() => {
    if (disableEndingsFeed) return;
    let cancelled = false;

    const run = async () => {
      // No point polling candles for a tab nobody is looking at.
      if (typeof document !== 'undefined' && document.hidden) return;
      const feed = await fetchEndingsCandles(symbol, '1h', 120);
      if (cancelled || !feed) return;
      setCandles(feed);
      const result = analyzeEndings(feed, { model: loadEndingsModel(), symbol });
      setEnding(result);
      if (result) {
        recordEnding(result, { symbol });
        if (shouldKnock(result, settings, minimized || settings.quietMode)) {
          await knock();
          if (!cancelled) setKnockedAt(Date.now());
        }
      }
    };

    run();
    const timer = window.setInterval(run, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [symbol, disableEndingsFeed, settings.quietMode, settings.knockAlert, minimized]);

  /* -------------------------------------------------------- Gemini speech */
  const requestLine = useCallback(async (force: boolean) => {
    // Offline: the canned line is already on screen, do not spin a loader.
    if (!canReachServer()) return null;
    setIsLoadingLine(true);
    try {
      const line = await fetchMascotLine({ state: stateRef.current, force, ...ctxRef.current });
      if (line) setAiLine(line);
      return line;
    } finally {
      setIsLoadingLine(false);
    }
  }, []);

  useEffect(() => {
    setAiLine(null);
  }, [state]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const line = await requestLine(false);
      if (!cancelled && line) setAiLine(line);
    })();
    return () => {
      cancelled = true;
    };
  }, [state, requestLine]);

  /* ------------------------------------------------ expand / auto-collapse */
  useEffect(() => {
    if (!isActive) return;
    setExpanded(true);
    setLastActivityAt(Date.now());
    // Rule 5: disappear shortly after speaking instead of lingering on screen.
    const timer = window.setTimeout(() => setExpanded(false), AUTO_HIDE_AFTER_SPEAK_MS + 4000);
    return () => window.clearTimeout(timer);
  }, [state, message, isActive]);

  /* ------------------------------------------ never block — rules 1, 2, 3 */
  useEffect(() => {
    let frame = 0;
    let last = false;

    const onPointerMove = (event: PointerEvent) => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const el = document.elementFromPoint(event.clientX, event.clientY);
        const protectedEl = (el as HTMLElement | null)?.closest?.(
          NEVER_BLOCK_SELECTOR
        ) as HTMLElement | null;
        const hit =
          !!protectedEl &&
          typeof protectedEl.getBoundingClientRect === 'function' &&
          isNearProtected({ x: event.clientX, y: event.clientY }, protectedEl.getBoundingClientRect());
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

  useEffect(() => {
    if (!expanded) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setExpanded(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [expanded]);

  /* ------------------------------------------------------------ derived UI */
  const pose: PoseId = useMemo(
    () => resolvePose({ mascotState: state, ending, idleMs }),
    [state, ending, idleMs]
  );
  const visual = poseVisual(pose, skin);
  const stateLabel = STATE_LABEL_TH[state] ?? visual.caption;
  const bubbleText = aiLine || ending?.oneLineTH || message;
  const endingLabel = ending ? ENDING_LABEL[ending.type] : null;
  const endingColor = ending
    ? ending.type === 'BULL_END'
      ? palette.bull
      : ending.type === 'BEAR_END'
        ? palette.bear
        : ending.type === 'BREAKOUT_END'
          ? palette.signal
          : palette.signal
    : palette.signal;

  const updateSettings = (patch: Partial<MascotSettings>) => setSettings(saveMascotSettings(patch));

  // Same formatter, currency mode and live FX as the ticker/cards/modals, so the
  // mascot never quotes a price in a different unit than the chart beside it.
  const money = (value: number) =>
    formatPrice({ price: value, mode: useThb ? 'THB' : 'USD', usdThbRate });

  /**
   * Rule 7 — onboarding points at the real buttons. We outline the actual
   * control for 2.5s instead of drawing a coach-mark overlay, so the mascot can
   * never become the thing that blocks the first click.
   */
  const pointAtFirstControl = () => {
    if (typeof document === 'undefined') return;
    for (let i = 0; i < 3; i += 1) {
      // Never point at ourselves: the mascot's own buttons are `button` too.
      const el =
        Array.from(document.querySelectorAll<HTMLElement>(onboardingTarget(i))).find(
          (candidate) => !candidate.closest(`[${MASCOT_ROOT_ATTR}]`)
        ) ?? null;
      if (!el) continue;
      const previous = { outline: el.style.outline, offset: el.style.outlineOffset };
      el.style.outline = `2px solid ${palette.signal}`;
      el.style.outlineOffset = '4px';
      el.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
      window.setTimeout(() => {
        el.style.outline = previous.outline;
        el.style.outlineOffset = previous.offset;
      }, 2500);
      return;
    }
  };

  /* ==================================================================
   * FREE-FLOATING CHARACTER
   *
   * The mascot is no longer a card in the page: it is a transparent cut-out
   * that the trader can drag anywhere, and the drop point survives a reload.
   * Everything still sits on a `pointer-events-none` layer, so a stray click
   * never lands on her instead of the chart.
   * ================================================================== */

  const rootRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<MascotPosition | null>(() => loadMascotPosition());
  const [dragging, setDragging] = useState(false);
  /** A drag ends with a click event — remember it so dragging never toggles the bubble. */
  const draggedRef = useRef(false);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    lastX: number;
    lastY: number;
    pointerId: number;
  } | null>(null);

  const clampToViewport = useCallback((next: MascotPosition): MascotPosition => {
    if (typeof window === 'undefined') return next;
    const rect = rootRef.current?.getBoundingClientRect();
    const width = rect && rect.width > 0 ? rect.width : 220;
    const height = rect && rect.height > 0 ? rect.height : 150;
    const maxX = Math.max(8, window.innerWidth - width - 8);
    const maxY = Math.max(8, window.innerHeight - height - 8);
    return {
      x: Math.min(Math.max(8, next.x), maxX),
      y: Math.min(Math.max(8, next.y), maxY),
    };
  }, []);

  // Rotating the phone must not leave her half off-screen.
  useEffect(() => {
    if (!pos) return;
    const onResize = () => setPos((current) => (current ? clampToViewport(current) : current));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [pos, clampToViewport]);

  const currentOrigin = () => {
    const rect = rootRef.current?.getBoundingClientRect();
    return { x: rect?.left ?? 0, y: rect?.top ?? 0 };
  };

  const onDragStart = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    const origin = currentOrigin();
    draggedRef.current = false;
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: origin.x,
      originY: origin.y,
      lastX: event.clientX,
      lastY: event.clientY,
      pointerId: event.pointerId,
    };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // older browsers — dragging still works, it just may lose the pointer
    }
    setDragging(true);
  };

  const dragFrame = useRef(0);
  const onDragMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    // 4px of slop so a tap on a touch screen is not read as a drag.
    if (!draggedRef.current && Math.hypot(dx, dy) < 4) return;
    draggedRef.current = true;
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    setLastActivityAt(Date.now());
    // One state update per frame: pointermove fires far more often than the
    // browser paints, and every update re-renders the speech bubble too.
    if (dragFrame.current) return;
    dragFrame.current = window.requestAnimationFrame(() => {
      dragFrame.current = 0;
      const active = dragRef.current;
      if (!active) return;
      setPos(
        clampToViewport({
          x: active.originX + (active.lastX - active.startX),
          y: active.originY + (active.lastY - active.startY),
        })
      );
    });
  };

  const onDragEnd = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (dragFrame.current) {
      window.cancelAnimationFrame(dragFrame.current);
      dragFrame.current = 0;
    }
    setDragging(false);
    if (!drag) return;
    try {
      event.currentTarget.releasePointerCapture(drag.pointerId);
    } catch {
      // ignore
    }
    if (draggedRef.current) {
      // Always commit the final point: a fast drag can end before the next
      // animation frame, and then the last frame's position would be lost.
      const final = clampToViewport({
        x: drag.originX + (drag.lastX - drag.startX),
        y: drag.originY + (drag.lastY - drag.startY),
      });
      setPos(final);
      saveMascotPosition(final);
    }
  };

  const onCharacterClick = () => {
    if (draggedRef.current) {
      draggedRef.current = false;
      return;
    }
    setExpanded((value) => !value);
    setLastActivityAt(Date.now());
  };

  const onCharacterKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const step = event.shiftKey ? 48 : 16;
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = delta[event.key];
    if (!move) return;
    event.preventDefault();
    setPos((current) => {
      const base = current ?? currentOrigin();
      const next = clampToViewport({ x: base.x + move[0], y: base.y + move[1] });
      saveMascotPosition(next);
      return next;
    });
    setLastActivityAt(Date.now());
  };

  const positionStyle: React.CSSProperties = pos
    ? { left: pos.x, top: pos.y }
    : {
        right: 'calc(0.75rem + env(safe-area-inset-right, 0px))',
        bottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))',
      };
  const rootAttrs = { [MASCOT_ROOT_ATTR]: '', [MASCOT_FACE_ATTR]: FACE_ID };

  if (dismissed || settings.hidden) return null;

  /* --------------------------------------------------- quiet mode (§6.6) */
  if (settings.quietMode) {
    return (
      <div
        className="fixed z-40 pointer-events-none select-none"
        style={positionStyle}
        data-testid="mascot-overlay"
        {...rootAttrs}
      >
        <button
          type="button"
          onClick={() => updateSettings({ quietMode: false })}
          aria-label="โหมดเงียบ — AI ยังทำงานอยู่ กดเพื่อเปิดมาสคอต"
          className="pointer-events-auto px-2.5 py-1 rounded-full border bg-black/70 backdrop-blur-md text-[10px] font-mono font-bold"
          style={{
            color: ending ? endingColor : '#A7A4B8',
            borderColor: ending ? `${endingColor}66` : palette.border,
          }}
        >
          {ending && endingLabel ? `${endingLabel.short} ${ending.prob}%` : 'AI · เงียบ'}
        </button>
      </div>
    );
  }

  const showBubble = expanded || isActive;
  const artHeight = minimized ? 88 : isActive ? 220 : 190;
  // Dragged into the left third? The bubble grows to the other side so it never
  // runs off the edge of the screen.
  const bubbleFlip = pos !== null && pos.x < 320;
  const accent = isCritical ? palette.bear : palette.primary;

  return (
    <div
      ref={rootRef}
      className="fixed z-40 pointer-events-none select-none"
      style={positionStyle}
      data-testid="mascot-overlay"
      {...rootAttrs}
    >
      <div
        className={`flex items-end gap-1 ${bubbleFlip ? 'flex-row-reverse' : ''} transition-opacity duration-300`}
        style={{ opacity: nearInteractive && !dragging ? ghostOpacity(true) : ghostOpacity(false) }}
      >
        {showBubble && (
          <div
            role="status"
            aria-live="polite"
            className="pointer-events-auto relative mb-6 w-[232px] sm:w-[264px] rounded-2xl border backdrop-blur-md p-3 shadow-[0_10px_30px_rgba(0,0,0,0.45)]"
            style={{
              backgroundColor: `${palette.surface}F2`,
              borderColor: isCritical ? palette.bear : palette.border,
              borderRadius: RUST_MODERN_LAYOUT.radius,
              boxShadow: isCritical ? `0 0 25px ${palette.bear}59` : undefined,
            }}
          >
            {/* speech tail pointing at the character */}
            <span
              aria-hidden="true"
              className={`absolute bottom-6 h-2.5 w-2.5 rotate-45 ${
                bubbleFlip ? '-left-[5px] border-b border-l' : '-right-[5px] border-r border-t'
              }`}
              style={{
                backgroundColor: `${palette.surface}F2`,
                borderColor: isCritical ? palette.bear : palette.border,
              }}
            />
            <div className="flex items-center justify-between gap-1">
              <span
                className="text-[10px] font-black uppercase tracking-wider flex items-center gap-1"
                style={{ color: accent }}
              >
                {isCritical ? (
                  <ShieldAlert className="w-3 h-3" aria-hidden="true" />
                ) : (
                  <Sparkles className="w-3 h-3" aria-hidden="true" />
                )}
                {stateLabel}
              </span>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                aria-label="ย่อมาสคอต"
                className="text-[#A7A4B8] hover:text-white p-0.5 rounded transition-colors"
              >
                <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-[#ECEAF4] break-words">
              {bubbleText}
            </p>

            {ending && endingLabel && (
              <div
                className="mt-2 rounded-xl border px-2 py-1.5"
                style={{
                  borderColor: `${endingColor}66`,
                  backgroundColor: `${endingColor}1A`,
                  color: endingColor,
                }}
              >
                <div className="mb-num flex items-center justify-between text-[10px] font-mono font-bold">
                  <span className="inline-flex items-center gap-1">
                    {endingLabel.icon}
                    {endingLabel.short}
                  </span>
                  <span>
                    {ending.prob}% • เป้า {money(ending.target)}
                  </span>
                </div>
                <div className="mb-num mt-0.5 text-[9px] text-[#A7A4B8] font-mono">
                  รับ {money(ending.support)} · ต้าน {money(ending.resistance)}
                </div>
              </div>
            )}

            {!ending && candles && (
              <div className="mt-2 text-[9px] font-mono text-[#8B88A0]">
                ยังไม่มีจุดจบเทรนที่ชัดเจน — ขอเงียบไว้ก่อน
              </div>
            )}

            {riskDetected && (
              <button
                type="button"
                onClick={() => {
                  useMascotStore.getState().resetToIdle();
                  setExpanded(false);
                }}
                className="mt-2 w-full rounded-lg border px-2 py-1 text-[10px] font-bold text-[#ECEAF4] transition-colors hover:bg-white/5"
                style={{ borderColor: palette.border }}
              >
                รับทราบครับ
              </button>
            )}

            {state === 'ONBOARDING' && (
              <button
                type="button"
                onClick={pointAtFirstControl}
                className="mt-2 w-full rounded-lg border px-2 py-1 text-[10px] font-bold"
                style={{ borderColor: `${palette.signal}66`, color: palette.signal }}
              >
                ชี้จุดเริ่มให้หน่อย
              </button>
            )}

            <div className="mt-2 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => requestLine(true)}
                disabled={isLoadingLine}
                className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold hover:text-white disabled:opacity-50 transition-colors"
                style={{
                  color: RUST_MODERN_COLORS.neonBlue,
                  borderColor: `${RUST_MODERN_COLORS.neonBlue}66`,
                }}
              >
                <RefreshCw
                  className={`w-3 h-3 ${isLoadingLine ? 'animate-spin' : ''}`}
                  aria-hidden="true"
                />
                {isLoadingLine ? 'กำลังคิด...' : 'ให้ AI พูด'}
              </button>
              <div className="flex items-center gap-2">
                {onOpenChat && (
                  <button
                    type="button"
                    onClick={onOpenChat}
                    className="text-[10px] font-bold text-[#A89FFF] hover:text-[#ECEAF4] transition-colors"
                  >
                    คุยกับผม
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => updateSettings({ quietMode: !settings.quietMode })}
                  aria-label={settings.quietMode ? 'ปิดโหมดเงียบ' : 'เปิดโหมดเงียบ'}
                  className="text-[10px] font-bold text-[#8B88A0] hover:text-[#ECEAF4] inline-flex items-center gap-1"
                >
                  {settings.quietMode ? (
                    <Volume2 className="w-3 h-3" aria-hidden="true" />
                  ) : (
                    <VolumeX className="w-3 h-3" aria-hidden="true" />
                  )}
                  เงียบ
                </button>
                <button
                  type="button"
                  onClick={() => setDismissed(true)}
                  className="text-[10px] font-bold text-[#8B88A0] hover:text-[#ECEAF4] transition-colors"
                >
                  ซ่อน
                </button>
              </div>
            </div>

            {knockedAt && (
              <div className="mt-1 text-[9px] font-mono" style={{ color: palette.bear }}>
                🔔 แจ้งเตือน BEAR_END เมื่อ {new Date(knockedAt).toLocaleTimeString('th-TH')}
              </div>
            )}
          </div>
        )}

        {/* The character herself: transparent PNG, draggable, never a box. */}
        <button
          type="button"
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
          onClick={onCharacterClick}
          onKeyDown={onCharacterKeyDown}
          aria-label={`น้องมอเตอร์บอย — ${stateLabel}. ลากเพื่อย้าย กดเพื่อเปิดกล่องข้อความ`}
          title={`${visual.emoji} ${visual.caption} · ลากเพื่อย้าย`}
          className={`pointer-events-auto touch-none select-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0F1117] ${
            dragging ? 'cursor-grabbing' : 'cursor-grab'
          } ${dragging ? '' : 'animate-mascot-drift'}`}
          style={{ height: artHeight, ['--tw-ring-color' as string]: accent }}
        >
          <span className="relative block h-full">
            {mascot.assets.hero ? (
              <img
                src={mascot.assets.hero}
                alt=""
                aria-hidden="true"
                draggable={false}
                className="pointer-events-none h-full w-auto drop-shadow-[0_10px_22px_rgba(0,0,0,0.55)]"
              />
            ) : (
              <span className="text-2xl" aria-hidden="true">
                {visual.emoji}
              </span>
            )}
            <span
              className={`absolute bottom-1 right-0 flex h-4 w-4 items-center justify-center rounded-full border-2 text-[9px] ${
                isCritical ? 'animate-pulse' : ''
              }`}
              style={{
                backgroundColor: isCritical ? palette.bear : palette.bull,
                borderColor: palette.surface,
              }}
              aria-hidden="true"
            >
              {visual.emoji}
            </span>
          </span>
        </button>
      </div>
    </div>
  );
};

export default MascotOverlay;
