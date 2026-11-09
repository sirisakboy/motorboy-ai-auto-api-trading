import React, { useState } from 'react';
import { Bot, Check, ChevronDown, Copy, RefreshCw, Sparkles } from 'lucide-react';
import { ChatMessage } from '../../types';
import { CHAT_TONES, ChatTone } from '../../services/chatStreamCore';
import { STICKER_MAP, parseStickerCode } from '../ChatStickers';
import { MarkdownLite } from './MarkdownLite';

interface ChatMessageItemProps {
  message: ChatMessage;
  isMine: boolean;
  /** ข้อความ AI ที่ยังสตรีมอยู่ — ซ่อนปุ่มคัดลอก/สร้างใหม่ระหว่างนั้น */
  streaming?: boolean;
  onCopy: (id: string, text: string) => void;
  onRegenerate?: () => void;
  copied?: boolean;
}

const isAiMessage = (message: ChatMessage) =>
  message.uid === 'ai-deep-analyze' || message.uid.startsWith('ats-matrix') || message.name.includes('AI');

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

/**
 * One chat row. AI answers carry the Brand Book §09 disclosure:
 * "ดูจาก …" + a collapsible "ทำไมถึงตอบแบบนี้" listing the 3 reasons,
 * plus which voice (เพื่อน/โค้ช/ผู้เชี่ยวชาญ) produced it.
 */
export const ChatMessageItem: React.FC<ChatMessageItemProps> = React.memo(
  ({ message, isMine, streaming = false, onCopy, onRegenerate, copied = false }) => {
    const [reasonsOpen, setReasonsOpen] = useState(false);
    const ai = isAiMessage(message);
    const stickerId = parseStickerCode(message.text);
    const StickerArt = stickerId ? STICKER_MAP[stickerId]?.Art : null;

    if (!ai) {
      return (
        <div className={`flex gap-2 ${isMine ? 'flex-row-reverse' : ''}`}>
          {message.photoURL ? (
            <img
              src={message.photoURL}
              alt=""
              className="h-7 w-7 shrink-0 rounded-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#222640] text-xs font-semibold text-[#A89FFF]">
              {message.name.charAt(0).toUpperCase()}
            </span>
          )}
          <div
            className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 ${
              isMine
                ? 'bg-[#7C6CFF]/15 border border-[#7C6CFF]/30'
                : 'bg-[#1C1F2E] border border-white/[0.07]'
            }`}
          >
            <p className="mb-0.5 text-[10px] font-semibold text-[#A7A4B8]">
              {isMine ? 'คุณ' : message.name} • {formatTime(message.createdAt)}
            </p>
            {StickerArt ? (
              <span className="mt-1 inline-block drop-shadow-lg">
                <StickerArt size={84} />
              </span>
            ) : (
              <p className="whitespace-pre-wrap break-words text-[13px] leading-[1.7] text-[#ECEAF4]">
                {message.text}
              </p>
            )}
          </div>
        </div>
      );
    }

    const tone: ChatTone = message.meta?.tone ?? 'friend';
    const toneLabel = CHAT_TONES[tone]?.labelTh ?? 'เพื่อน';
    const sources = message.meta?.sources ?? [];
    const reasons = message.meta?.reasons ?? [];
    const latency = message.meta?.latencyMs;

    return (
      <article className="flex items-start gap-2.5">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-[#7C6CFF]/40 bg-[#7C6CFF]/15">
          <Bot className="h-4 w-4 text-[#A89FFF]" aria-hidden="true" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="rounded-2xl border border-white/[0.07] bg-[#1C1F2E] px-3.5 py-3 shadow-[0_8px_30px_rgba(0,0,0,0.25)]">
            <header className="mb-2 flex flex-wrap items-center gap-1.5 border-b border-white/[0.07] pb-2">
              <span className="text-[11px] font-semibold text-[#ECEAF4]">น้องมอเตอร์บอย</span>

              <span className="inline-flex items-center gap-1 rounded-full border border-[#7C6CFF]/35 bg-[#7C6CFF]/12 px-2 py-0.5 text-[9px] font-semibold text-[#A89FFF]">
                <Sparkles className="h-2.5 w-2.5" aria-hidden="true" />
                AI • โทน{toneLabel}
              </span>

              {message.meta?.depth === 'quant' && (
                <span className="rounded-full border border-[#4CC9F0]/35 bg-[#4CC9F0]/10 px-2 py-0.5 text-[9px] font-semibold text-[#4CC9F0]">
                  คำนวณในเครื่อง
                </span>
              )}

              <span className="ml-auto flex items-center gap-1.5 text-[10px] tabular-nums text-[#8B88A0]">
                {typeof latency === 'number' && latency > 0 && <span>{(latency / 1000).toFixed(1)} วิ</span>}
                <span>{formatTime(message.createdAt)}</span>
                {!streaming && (
                  <>
                    <button
                      type="button"
                      onClick={() => onCopy(message.id, message.text)}
                      className="rounded-md p-1 transition-colors hover:bg-white/[0.07] hover:text-[#ECEAF4]"
                      title="คัดลอกคำตอบ"
                      aria-label="คัดลอกคำตอบ"
                    >
                      {copied ? (
                        <Check className="h-3 w-3 text-[#7EE0B5]" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </button>
                    {onRegenerate && (
                      <button
                        type="button"
                        onClick={onRegenerate}
                        className="rounded-md p-1 transition-colors hover:bg-white/[0.07] hover:text-[#ECEAF4]"
                        title="ถามใหม่อีกครั้ง"
                        aria-label="ถามใหม่อีกครั้ง"
                      >
                        <RefreshCw className="h-3 w-3" />
                      </button>
                    )}
                  </>
                )}
              </span>
            </header>

            {streaming && !message.text ? (
              <div className="flex items-center gap-1.5 py-1" aria-label="กำลังคิด">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="h-1.5 w-1.5 rounded-full bg-[#A89FFF] animate-calm-pulse"
                    style={{ animationDelay: `${i * 0.18}s` }}
                  />
                ))}
                <span className="ml-1 text-[11px] text-[#A7A4B8]">กำลังดูข้อมูลให้ครับ…</span>
              </div>
            ) : (
              <>
                {StickerArt ? (
                  <span className="inline-block drop-shadow-lg">
                    <StickerArt size={84} />
                  </span>
                ) : (
                  <MarkdownLite text={message.text} />
                )}
                {streaming && (
                  <span
                    className="mt-1 inline-block h-3.5 w-[2px] animate-calm-pulse bg-[#A89FFF] align-middle"
                    aria-hidden="true"
                  />
                )}
              </>
            )}
          </div>

          {/* Disclosure: what it looked at + why (Brand Book §09) */}
          {(sources.length > 0 || reasons.length > 0) && !streaming && (
            <div className="mt-1.5 px-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-[#8B88A0]">
                {sources.length > 0 && (
                  <span className="inline-flex min-w-0 items-center gap-1">
                    <span aria-hidden="true">👁️</span>
                    <span className="truncate">ดูจาก: {sources.join(' · ')}</span>
                  </span>
                )}
                {reasons.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setReasonsOpen((v) => !v)}
                    aria-expanded={reasonsOpen}
                    className="inline-flex items-center gap-1 rounded-full border border-white/[0.07] bg-[#141725] px-2 py-0.5 text-[10px] text-[#A7A4B8] transition-colors hover:text-[#ECEAF4]"
                  >
                    ทำไมถึงตอบแบบนี้
                    <ChevronDown
                      className={`h-3 w-3 transition-transform ${reasonsOpen ? 'rotate-180' : ''}`}
                      aria-hidden="true"
                    />
                  </button>
                )}
              </div>

              {reasonsOpen && reasons.length > 0 && (
                <ol className="mt-1.5 space-y-1 rounded-xl border border-white/[0.07] bg-[#141725] p-2.5">
                  {reasons.map((reason, index) => (
                    <li key={index} className="flex gap-2 text-[11px] leading-relaxed text-[#A7A4B8]">
                      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#7C6CFF]/15 text-[9px] font-semibold tabular-nums text-[#A89FFF]">
                        {index + 1}
                      </span>
                      <span className="min-w-0 flex-1">{reason}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
        </div>
      </article>
    );
  }
);

ChatMessageItem.displayName = 'ChatMessageItem';
