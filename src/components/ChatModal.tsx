import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, Radio, Bot, RotateCcw } from 'lucide-react';
import {
  ChatMessage,
  CryptoCoin,
  ForexPair,
  ThaiStock,
  ForeignStock,
  StockIndex,
  NewsArticle,
} from '../types';
import { GLOBAL_ROOM_ID, subscribeRoomMessages, sendRoomMessage } from '../services/chatRoomService';
import { STICKERS, stickerCode } from './ChatStickers';
import { getAiEngineStatus } from '../services/aiChatService';
import { streamChatReply } from '../services/chatStreamClient';
import {
  CHAT_TONE_ORDER,
  CHAT_TONES,
  ChatTone,
  extractReasons,
  sanitizeVoice,
} from '../services/chatStreamCore';
import { useModalA11y } from '../hooks/useModalA11y';
import { ChatMessageItem } from './chat/ChatMessageItem';
import { ChatComposer } from './chat/ChatComposer';

interface ChatUser {
  uid: string;
  displayName?: string | null;
  photoURL?: string | null;
  email?: string | null;
}

export interface ChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDark?: boolean;
  user?: ChatUser | null;
  cryptoList?: CryptoCoin[];
  forexRates?: ForexPair[];
  thaiStocks?: ThaiStock[];
  foreignStocks?: ForeignStock[];
  stockIndices?: StockIndex[];
  articles?: NewsArticle[];
  geminiApiKey?: string;
  onOpenAtsMatrix?: () => void;
  onOpenSettings?: () => void;
}

const TONE_STORAGE_KEY = 'motorboy_chat_tone';
const AI_UID = 'ai-deep-analyze';
const AI_NAME = '🏍️ น้องมอเตอร์บอย';

const SUGGESTIONS: Array<{ label: string; query: string; accent: string }> = [
  { label: 'BTC น่าสนใจไหม', query: 'BTC SPOT & NIULAI4', accent: '#7EE0B5' },
  { label: 'หุ้นไทย AOT / DELTA', query: 'วิเคราะห์หุ้นไทย AOT และ DELTA', accent: '#FFB86B' },
  { label: 'ค่าเงิน USD/THB', query: 'ตรวจอัตราแลกเปลี่ยน USD/THB', accent: '#4CC9F0' },
  { label: 'หุ้นนอก NVDA', query: 'วิเคราะห์หุ้นสหรัฐฯ NVDA', accent: '#A89FFF' },
  { label: 'ข่าวเศรษฐกิจวันนี้', query: 'สรุปข่าวเศรษฐกิจโลกวันนี้', accent: '#A89FFF' },
  { label: 'ความเสี่ยงพอร์ต', query: 'วิเคราะห์ Drawdown พอร์ตและความเสี่ยง Peak-to-Trough', accent: '#FFB86B' },
];

function readStoredTone(): ChatTone {
  try {
    const stored = localStorage.getItem(TONE_STORAGE_KEY);
    if (stored === 'friend' || stored === 'coach' || stored === 'expert') return stored;
  } catch {
    /* localStorage may be blocked */
  }
  return 'friend';
}

export const ChatModal: React.FC<ChatModalProps> = ({
  isOpen,
  onClose,
  isDark = true,
  user = null,
  cryptoList = [],
  forexRates = [],
  thaiStocks = [],
  foreignStocks = [],
  stockIndices = [],
  articles = [],
  geminiApiKey = '',
  onOpenAtsMatrix,
  onOpenSettings,
}) => {
  const engineStatus = getAiEngineStatus(geminiApiKey);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [tone, setTone] = useState<ChatTone>(readStoredTone);
  const [isSending, setIsSending] = useState(false);
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [error, setError] = useState<{ message: string; query: string } | null>(null);
  const [showStickers, setShowStickers] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [atBottom, setAtBottom] = useState(true);

  const abortRef = useRef<AbortController | null>(null);
  const rafRef = useRef<number | null>(null);
  const pendingRef = useRef('');
  const streamTextRef = useRef('');
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const atBottomRef = useRef(true);
  // setState is async: two fast clicks used to fire two AI requests before
  // `isSending` flipped. A ref is the actual lock.
  const sendingRef = useRef(false);
  const copyTimerRef = useRef<number | null>(null);

  const chatContext = useMemo(
    () => ({
      cryptoList,
      forexRates,
      thaiStocks,
      foreignStocks,
      stockIndices,
      articles,
      geminiApiKey,
    }),
    [cryptoList, forexRates, thaiStocks, foreignStocks, stockIndices, articles, geminiApiKey]
  );

  /* ------------------------------------------------------------ lifecycle */

  useEffect(() => {
    if (!isOpen) return;
    const unsub = subscribeRoomMessages(GLOBAL_ROOM_ID, setMessages);
    return () => unsub();
  }, [isOpen]);

  useEffect(() => {
    try {
      localStorage.setItem(TONE_STORAGE_KEY, tone);
    } catch {
      /* ignore */
    }
  }, [tone]);

  // ปิดแชท = ยกเลิกสตรีมที่ค้างอยู่ ไม่ปล่อยให้กินโควตา API ต่อ
  useEffect(() => {
    if (isOpen) return;
    abortRef.current?.abort();
    abortRef.current = null;
  }, [isOpen]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
    },
    []
  );

  const scrollToBottom = useCallback((smooth: boolean) => {
    const anchor = bottomRef.current;
    // some embedded webviews (and jsdom) do not implement scrollIntoView
    if (anchor && typeof anchor.scrollIntoView === 'function') {
      anchor.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'end' });
    }
  }, []);

  useEffect(() => {
    if (atBottomRef.current) scrollToBottom(false);
  }, [messages.length, scrollToBottom]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    const next = distance < 80;
    atBottomRef.current = next;
    setAtBottom((prev) => (prev === next ? prev : next));
  }, []);

  /* ----------------------------------------------------------- AI stream */

  const flushStream = useCallback(() => {
    rafRef.current = null;
    const chunk = pendingRef.current;
    if (!chunk) return;
    pendingRef.current = '';
    streamTextRef.current += chunk;
    setStreamingText(sanitizeVoice(streamTextRef.current));
    if (atBottomRef.current) scrollToBottom(false);
  }, [scrollToBottom]);

  const scheduleFlush = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(flushStream);
  }, [flushStream]);

  const runAiTurn = useCallback(
    async (query: string) => {
      const controller = new AbortController();
      abortRef.current = controller;
      sendingRef.current = true;
      setIsSending(true);
      setError(null);
      setStreamingText('');
      streamTextRef.current = '';
      pendingRef.current = '';
      atBottomRef.current = true;

      try {
        const result = await streamChatReply({
          query,
          context: chatContext,
          tone,
          geminiApiKey,
          signal: controller.signal,
          onDelta: (chunk) => {
            pendingRef.current += chunk;
            scheduleFlush();
          },
        });

        if (controller.signal.aborted) return;

        // flush token สุดท้ายที่ยังค้างใน buffer
        if (pendingRef.current) flushStream();

        const finalText = (result.text || streamTextRef.current).trim();
        if (!finalText) throw new Error('ไม่ได้คำตอบจาก AI ลองถามใหม่อีกครั้งครับ');

        await sendRoomMessage(GLOBAL_ROOM_ID, {
          uid: AI_UID,
          name: AI_NAME,
          photoURL: null,
          text: finalText,
          meta: {
            tone: result.tone,
            sources: result.sources,
            reasons: extractReasons(finalText),
            depth: result.depth,
            streamed: result.streamed,
            latencyMs: result.latencyMs,
          },
        });

      } catch (err) {
        if (controller.signal.aborted) return;
        const message =
          err instanceof Error ? err.message : 'เชื่อมต่อ AI ไม่สำเร็จ ลองอีกครั้งได้เลยครับ';
        setError({ message, query });
      } finally {
        abortRef.current = null;
        sendingRef.current = false;
        setIsSending(false);
        setStreamingText(null);
        streamTextRef.current = '';
        pendingRef.current = '';
      }
    },
    [chatContext, flushStream, geminiApiKey, scheduleFlush, tone]
  );

  const sendQuery = useCallback(
    async (rawQuery: string) => {
      const query = rawQuery.trim();
      if (!query || isSending || sendingRef.current) return;

      setDraft('');
      setError(null);
      setShowStickers(false);

      const senderUid = user?.uid || 'guest-trader';
      const senderName = user?.displayName || user?.email || 'Trader (Guest)';

      try {
        await sendRoomMessage(GLOBAL_ROOM_ID, {
          uid: senderUid,
          name: senderName,
          photoURL: user?.photoURL ?? null,
          text: query,
        });
      } catch (err) {
        setError({
          message: err instanceof Error ? err.message : 'ส่งข้อความไม่สำเร็จ',
          query,
        });
        return;
      }

      await runAiTurn(query);
    },
    [isSending, runAiTurn, user]
  );

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    sendingRef.current = false;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setIsSending(false);
    setStreamingText(null);
    streamTextRef.current = '';
    pendingRef.current = '';
  }, []);

  const handleRegenerate = useCallback(() => {
    if (isSending || sendingRef.current) return;
    const lastUser = [...messages].reverse().find((m) => m.uid !== AI_UID && !m.name.includes('AI'));
    if (lastUser) void runAiTurn(lastUser.text);
  }, [isSending, messages, runAiTurn]);

  const handleCopy = useCallback((id: string, text: string) => {
    void navigator.clipboard?.writeText(text).catch(() => {
      /* clipboard permission denied on http:// origins — nothing to do */
    });
    setCopiedId(id);
    if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
    copyTimerRef.current = window.setTimeout(() => {
      copyTimerRef.current = null;
      setCopiedId((current) => (current === id ? null : current));
    }, 1800);
  }, []);

  const handleSendSticker = useCallback(
    async (id: string) => {
      if (isSending || sendingRef.current) return;
      const senderUid = user?.uid || 'guest-trader';
      const senderName = user?.displayName || user?.email || 'Trader (Guest)';

      setShowStickers(false);
      try {
        await sendRoomMessage(GLOBAL_ROOM_ID, {
          uid: senderUid,
          name: senderName,
          photoURL: user?.photoURL ?? null,
          text: stickerCode(id),
        });
        await sendRoomMessage(GLOBAL_ROOM_ID, {
          uid: AI_UID,
          name: AI_NAME,
          photoURL: null,
          text:
            id === 'bull'
              ? 'เห็นสติ๊กเกอร์กระทิงแล้วครับ — ถ้าจะเข้าไม้ ขอให้ตั้งจุดตัดขาดทุนไว้ก่อนเสมอ แล้วค่อยดูว่า RR ถึง 1:1.5 ไหมครับ'
              : id === 'bear'
                ? 'เห็นสติ๊กเกอร์หมีแล้วครับ — ช่วงปรับฐานชอบหลอกคนรีบเข้า รอดูแท่งปิดก่อนก็ได้ครับ'
                : id === 'moon'
                  ? 'อยากไปดวงจันทร์ก็ได้ครับ แต่ขอให้ทยอยปิดทำกำไรเป็นขั้น ไม่โยนหมดไม้ทีเดียว'
                  : 'ถือตามแผนก็เป็นวินัยที่ดีครับ ขอแค่ตรวจข่าวใหญ่ก่อนถือข้ามคืน',
          meta: { tone, depth: 'quant', sources: ['สติ๊กเกอร์ที่คุณส่ง'], reasons: [] },
        });
      } catch (err) {
        setError({
          message: err instanceof Error ? err.message : 'ส่งสติ๊กเกอร์ไม่สำเร็จ',
          query: '',
        });
      }
    },
    [isSending, tone, user]
  );

  const dialogRef = useModalA11y({ onClose, enabled: isOpen });
  if (!isOpen) return null;

  const streamingMessage: ChatMessage | null =
    streamingText === null
      ? null
      : {
          id: 'streaming',
          uid: AI_UID,
          name: AI_NAME,
          text: streamingText,
          createdAt: new Date().toISOString(),
          meta: { tone, depth: 'llm', sources: [], streamed: true },
        };

  const showEmptyState = messages.length === 0 && !streamingMessage;

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="แชทวิเคราะห์ตลาดกับน้องมอเตอร์บอย"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center sm:p-6"
    >
      <div
        className={`flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-[20px] border sm:max-w-xl sm:rounded-[20px] sm:my-8 ${
          isDark
            ? 'border-white/[0.07] bg-[#0F1117] text-[#ECEAF4]'
            : 'border-[#E8E6E0] bg-[#F7F5F0] text-[#1C1F2E]'
        } shadow-[0_8px_30px_rgba(0,0,0,0.45)]`}
      >
        {/* ------------------------------------------------------- header */}
        <header className="flex items-center justify-between gap-2 border-b border-white/[0.07] bg-[#141725] px-3.5 py-2.5 sm:px-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px] border border-[#7C6CFF]/40 bg-[#7C6CFF]/15 text-base">
              🏍️
              <span
                className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#141725] bg-[#7EE0B5]"
                aria-hidden="true"
              />
            </div>
            <div className="min-w-0">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold text-[#ECEAF4] sm:text-base">
                น้องมอเตอร์บอย
                <span className="rounded-full border border-[#7C6CFF]/35 bg-[#7C6CFF]/12 px-1.5 py-0.5 text-[9px] font-semibold text-[#A89FFF]">
                  AI
                </span>
              </h2>
              <p className="truncate text-[10px] text-[#8B88A0]">
                {engineStatus.isOnlineLlm ? 'Gemini + ข้อมูลตลาดสด' : 'เครื่องคำนวณในเครื่อง'} • ตอบทีละคำ
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {onOpenAtsMatrix && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenAtsMatrix();
                }}
                className="hidden items-center gap-1 rounded-full border border-[#7EE0B5]/35 bg-[#7EE0B5]/10 px-2.5 py-1 text-[10px] font-semibold text-[#7EE0B5] transition-colors hover:bg-[#7EE0B5]/20 sm:flex"
                title="สลับเป็น ATS MATRIX MODE"
              >
                <Radio className="h-3 w-3" />
                ATS Matrix
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-[#A7A4B8] transition-colors hover:bg-white/[0.07] hover:text-[#ECEAF4]"
              aria-label="ปิดแชท"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </header>

        {/* ------------------------------------------------- tone selector */}
        <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.07] bg-[#141725] px-3.5 pb-2 pt-1.5 sm:px-4">
          <span className="text-[10px] font-semibold text-[#8B88A0]">โทนตอบ</span>
          <div
            role="radiogroup"
            aria-label="เลือกโทนการตอบของ AI"
            className="flex rounded-full border border-white/[0.07] bg-[#0F1117] p-0.5"
          >
            {CHAT_TONE_ORDER.map((id) => {
              const active = tone === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setTone(id)}
                  title={CHAT_TONES[id].hintTh}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                    active ? 'bg-[#7C6CFF] text-[#0F1117]' : 'text-[#A7A4B8] hover:text-[#ECEAF4]'
                  }`}
                >
                  {CHAT_TONES[id].labelTh}
                </button>
              );
            })}
          </div>
          <span className="hidden text-[10px] text-[#8B88A0] sm:inline">{CHAT_TONES[tone].hintTh}</span>

          {onOpenSettings && !engineStatus.isOnlineLlm && (
            <button
              type="button"
              onClick={onOpenSettings}
              className="ml-auto text-[10px] font-semibold text-[#4CC9F0] hover:underline"
              title="ใส่ Gemini API Key ในตั้งค่าเพื่อเปิดโหมด Gemini"
            >
              ⚙️ ใส่ API Key
            </button>
          )}
        </div>

        {/* -------------------------------------------------------- thread */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          role="log"
          aria-live="polite"
          aria-relevant="additions text"
          className="relative min-h-[300px] flex-1 overflow-y-auto bg-[#0F1117] px-3.5 py-3 sm:px-4"
        >
          {showEmptyState && (
            <div className="mx-auto max-w-md px-1 pb-2 pt-3 text-center">
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-[16px] border border-[#7C6CFF]/30 bg-[#7C6CFF]/10">
                <Bot className="h-6 w-6 text-[#A89FFF]" aria-hidden="true" />
              </div>
              <h3 className="text-sm font-semibold text-[#ECEAF4]">สวัสดีครับ ผมช่วยดูให้ได้</h3>
              <p className="mx-auto mt-1 max-w-xs text-[11px] leading-relaxed text-[#A7A4B8]">
                ถามเรื่องหุ้นไทย หุ้นนอก คริปโต ค่าเงิน หรือข่าววันนี้
                ผมจะบอกว่าดูจากอะไร ให้เหตุผล 3 ข้อ และไม่เร่งให้คุณตัดสินใจครับ
              </p>

              <div className="mt-3 grid grid-cols-2 gap-1.5">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s.label}
                    type="button"
                    onClick={() => void sendQuery(s.query)}
                    disabled={isSending}
                    className="rounded-xl border border-white/[0.07] bg-[#1C1F2E] px-2.5 py-2 text-left text-[11px] font-medium text-[#ECEAF4] transition-colors hover:border-white/[0.14] hover:bg-[#222640] disabled:opacity-50"
                  >
                    <span className="mr-1" aria-hidden="true" style={{ color: s.accent }}>
                      ●
                    </span>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-3">
            {messages.map((message) => (
              <ChatMessageItem
                key={message.id}
                message={message}
                isMine={
                  message.uid !== AI_UID &&
                  !message.name.includes('AI') &&
                  (message.uid === (user?.uid || 'guest-trader') ||
                    message.name === (user?.displayName || user?.email))
                }
                copied={copiedId === message.id}
                onCopy={handleCopy}
                onRegenerate={handleRegenerate}
              />
            ))}

            {streamingMessage && (
              <ChatMessageItem
                message={streamingMessage}
                isMine={false}
                streaming
                onCopy={handleCopy}
              />
            )}

            {error && (
              <div className="rounded-xl border border-[#F4A6A6]/30 bg-[#F4A6A6]/10 px-3 py-2.5">
                <p className="text-[11px] leading-relaxed text-[#F4A6A6]">{error.message}</p>
                <div className="mt-1.5 flex gap-1.5">
                  {error.query && (
                    <button
                      type="button"
                      onClick={() => void runAiTurn(error.query)}
                      className="inline-flex items-center gap-1 rounded-full bg-[#222640] px-2.5 py-1 text-[10px] font-semibold text-[#ECEAF4] transition-colors hover:bg-[#2A3050]"
                    >
                      <RotateCcw className="h-3 w-3" />
                      ลองอีกครั้ง
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setError(null)}
                    className="rounded-full px-2.5 py-1 text-[10px] font-semibold text-[#8B88A0] hover:text-[#ECEAF4]"
                  >
                    ปิด
                  </button>
                </div>
              </div>
            )}
          </div>

          <div ref={bottomRef} className="h-0.5" />

          {!atBottom && (
            <button
              type="button"
              onClick={() => {
                atBottomRef.current = true;
                setAtBottom(true);
                scrollToBottom(true);
              }}
              className="sticky bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/[0.07] bg-[#222640] px-3 py-1 text-[10px] font-semibold text-[#ECEAF4] shadow-[0_8px_30px_rgba(0,0,0,0.45)]"
            >
              ↓ ไปข้อความล่าสุด
            </button>
          )}
        </div>

        {/* ------------------------------------------------------ stickers */}
        {showStickers && (
          <div className="mx-3 mb-1 rounded-xl border border-white/[0.07] bg-[#141725] p-2">
            <p className="px-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#8B88A0]">
              สติ๊กเกอร์เทรด • แตะเพื่อส่ง
            </p>
            <div className="grid max-h-[150px] grid-cols-6 gap-1 overflow-y-auto">
              {STICKERS.map(({ id, name, Art }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => void handleSendSticker(id)}
                  title={name}
                  className="flex flex-col items-center justify-center gap-0.5 rounded-lg p-1.5 transition-colors hover:bg-white/[0.07]"
                >
                  <Art size={34} />
                  <span className="max-w-full truncate text-[9px] text-[#8B88A0]">{name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ------------------------------------------------------ composer */}
        <ChatComposer
          value={draft}
          onChange={setDraft}
          onSend={() => void sendQuery(draft)}
          onStop={handleStop}
          onToggleStickers={() => setShowStickers((v) => !v)}
          stickersOpen={showStickers}
          busy={isSending}
        />
      </div>
    </div>
  );
};
