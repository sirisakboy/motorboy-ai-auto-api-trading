import React, { useEffect, useRef } from 'react';
import { ArrowUp, Square, Sticker as StickerIcon } from 'lucide-react';

interface ChatComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  onToggleStickers: () => void;
  stickersOpen: boolean;
  busy: boolean;
  maxChars?: number;
}

/**
 * Composer: auto-growing textarea (Enter = ส่ง, Shift+Enter = ขึ้นบรรทัดใหม่),
 * แสดงจำนวนตัวอักษรเฉพาะตอนใกล้เต็ม และปุ่มเดียวที่เปลี่ยนเป็น "หยุด" ระหว่าง
 * ที่ AI กำลังตอบ — ไม่มีปุ่มสองปุ่มให้สับสน
 */
export const ChatComposer: React.FC<ChatComposerProps> = ({
  value,
  onChange,
  onSend,
  onStop,
  onToggleStickers,
  stickersOpen,
  busy,
  maxChars = 500,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // auto-grow up to ~5 lines without measuring on every keystroke of the model
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
  }, [value]);

  // focus เมื่อเปิดแชท/ส่งเสร็จ
  useEffect(() => {
    if (!busy) textareaRef.current?.focus();
  }, [busy]);

  const nearLimit = value.length > maxChars * 0.85;

  return (
    <div className="border-t border-white/[0.07] bg-[#141725] p-2.5 sm:p-3">
      <div className="flex items-end gap-2">
        <button
          type="button"
          onClick={onToggleStickers}
          aria-label="เปิดชุดสติ๊กเกอร์"
          aria-pressed={stickersOpen}
          title="สติ๊กเกอร์"
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border transition-colors ${
            stickersOpen
              ? 'border-[#FFB86B]/50 bg-[#FFB86B]/15 text-[#FFB86B]'
              : 'border-white/[0.07] bg-[#1C1F2E] text-[#A7A4B8] hover:text-[#FFB86B]'
          }`}
        >
          <StickerIcon className="h-[18px] w-[18px]" />
        </button>

        <div className="relative min-w-0 flex-1">
          <label htmlFor="motorboy-chat-input" className="sr-only">
            พิมพ์คำถามถึงน้องมอเตอร์บอย
          </label>
          <textarea
            id="motorboy-chat-input"
            ref={textareaRef}
            value={value}
            rows={1}
            maxLength={maxChars}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
            placeholder="ถามได้เลยครับ เช่น BTC น่าสนใจไหม หรือ AOT แนวรับอยู่ตรงไหน"
            className="block w-full resize-none rounded-[14px] border border-white/[0.07] bg-[#141725] px-3 py-2.5 pr-14 text-[13px] leading-[1.6] text-[#ECEAF4] outline-none transition-colors placeholder:text-[#8B88A0] focus:border-[#7C6CFF]/60"
          />
          {nearLimit && (
            <span className="pointer-events-none absolute bottom-2 right-3 text-[10px] tabular-nums text-[#8B88A0]">
              {value.length}/{maxChars}
            </span>
          )}
        </div>

        {busy ? (
          <button
            type="button"
            onClick={onStop}
            className="flex h-10 shrink-0 items-center gap-1.5 rounded-[14px] border border-[#F4A6A6]/40 bg-[#F4A6A6]/15 px-3 text-[12px] font-semibold text-[#F4A6A6] transition-colors hover:bg-[#F4A6A6]/25"
          >
            <Square className="h-3 w-3 fill-current" />
            หยุด
          </button>
        ) : (
          <button
            type="button"
            onClick={onSend}
            disabled={!value.trim()}
            aria-label="ส่งคำถาม"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-[linear-gradient(135deg,#8E80FF,#4CC9F0)] text-[#0F1117] shadow-[0_8px_30px_rgba(124,108,255,0.25)] transition-transform hover:brightness-105 active:scale-[0.98] disabled:opacity-40 disabled:shadow-none"
          >
            <ArrowUp className="h-[18px] w-[18px]" />
          </button>
        )}
      </div>

      <p className="mt-1.5 px-1 text-[10px] text-[#8B88A0]">
        Enter = ส่ง • Shift+Enter = ขึ้นบรรทัดใหม่ • AI อาจผิดพลาดได้ ใช้เป็นการวิเคราะห์ ไม่ใช่คำแนะนำการลงทุน
      </p>
    </div>
  );
};
