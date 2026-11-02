import React, { useState, useEffect, useRef } from 'react';
import { X, Send, Sticker as StickerIcon, Radio, Bot, Sparkles, Copy, Check, User as UserIcon } from 'lucide-react';
import { ChatMessage, CryptoCoin, ForexPair, ThaiStock, ForeignStock, StockIndex, NewsArticle } from '../types';
import { GLOBAL_ROOM_ID, subscribeRoomMessages, sendRoomMessage } from '../services/chatRoomService';
import { STICKERS, STICKER_MAP, parseStickerCode, stickerCode } from './ChatStickers';
import { generateAiChatReply, getAiEngineStatus } from '../services/aiChatService';

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

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('th-TH', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
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
  const engineStatus = getAiEngineStatus();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [showStickers, setShowStickers] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // Realtime subscription to the unified chat room
  useEffect(() => {
    if (!isOpen) return;
    const unsub = subscribeRoomMessages(GLOBAL_ROOM_ID, setMessages);
    return () => unsub();
  }, [isOpen]);

  // Auto-scroll to latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isAiThinking]);

  const handleCopyText = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSend = async (overrideText?: string) => {
    const text = (overrideText !== undefined ? overrideText : draft).trim();
    if (!text || isSending) return;

    setIsSending(true);
    setError(null);
    setDraft('');

    // Guest fallback identity if user is not signed in with Google
    const senderUid = user?.uid || 'guest-trader';
    const senderName = user?.displayName || user?.email || 'Trader (Guest)';
    const senderPhoto = user?.photoURL ?? null;

    try {
      // 1. Post user's message to chat room
      await sendRoomMessage(GLOBAL_ROOM_ID, {
        uid: senderUid,
        name: senderName,
        photoURL: senderPhoto,
        text,
      });

      // 2. Trigger 100% AI Response
      setIsAiThinking(true);
      try {
        const aiResponse = await generateAiChatReply(text, {
          cryptoList,
          forexRates,
          thaiStocks,
          foreignStocks,
          stockIndices,
          articles,
          geminiApiKey,
        });

        // 3. Post AI's response to chat room
        await sendRoomMessage(GLOBAL_ROOM_ID, {
          uid: 'ai-deep-analyze',
          name: '🤖 AI Deep Analyze [100% AI]',
          photoURL: null,
          text: aiResponse,
        });
      } catch (aiErr) {
        console.error('Error generating AI response:', aiErr);
        // Fallback message
        await sendRoomMessage(GLOBAL_ROOM_ID, {
          uid: 'ai-deep-analyze',
          name: '🤖 AI Deep Analyze [100% AI]',
          photoURL: null,
          text: `⚠️ [AI Deep Analyze]\nระบบกำลังอัปเดตข้อมูลตลาดสด กรุณาสอบถามซ้ำอีกครั้ง\nคำถามของคุณ: "${text}"\n\nการเทรดมีความเสี่ยง โปรดบริหารความเสี่ยงอย่างรอบคอบ`,
        });
      }
    } catch (err: unknown) {
      console.error('Failed to send message:', err);
      setError(err instanceof Error ? err.message : 'ส่งข้อความไม่สำเร็จ');
    } finally {
      setIsSending(false);
      setIsAiThinking(false);
    }
  };

  const handleSendSticker = async (id: string) => {
    if (isSending) return;
    setIsSending(true);
    setError(null);
    const senderUid = user?.uid || 'guest-trader';
    const senderName = user?.displayName || user?.email || 'Trader (Guest)';
    const senderPhoto = user?.photoURL ?? null;

    try {
      const code = stickerCode(id);
      await sendRoomMessage(GLOBAL_ROOM_ID, {
        uid: senderUid,
        name: senderName,
        photoURL: senderPhoto,
        text: code,
      });
      setShowStickers(false);

      // AI reacts to trading stickers
      setIsAiThinking(true);
      setTimeout(async () => {
        try {
          const stickerReplies: Record<string, string> = {
            bull: '🐂 [AI Deep Analyze] รับทราบสัญญาณ Bull! โมเมนตัมตลาดกำลังทดสอบแนวต้านหลัก เฝ้าระวังจุด Take Profit ให้เหมาะสมครับ\n\n⚠️ การเทรดมีความเสี่ยง',
            bear: '🐻 [AI Deep Analyze] ตรวจพบสัญญาณ Bear ตลาดอยู่ในโหมดระมัดระวัง แนะนำตั้ง Stop Loss รัดกุมเพื่อรักษาเงินต้น\n\n⚠️ การเทรดมีความเสี่ยง',
            moon: '🚀 [AI Deep Analyze] To The Moon! อย่าลืมแบ่งสัดส่วน Take Profit ตามแผน ไม่แนะนำให้เทรดเกินตัว\n\n⚠️ การเทรดมีความเสี่ยง',
            hodl: '💎 [AI Deep Analyze] Diamond Hands! บริหารสัดส่วนพอร์ต DCA และคุมความเสี่ยงไม่เกิน 2% ต่อไม้\n\n⚠️ การเทรดมีความเสี่ยง',
          };
          const reply = stickerReplies[id] || '⚡ [AI Deep Analyze] รับทราบสัญญาณสติ๊กเกอร์! AI พร้อมวิเคราะห์ตลาดเชิงลึก พิมพ์ชื่อสินทรัพย์เพื่อดูแนวรับ-แนวต้านสดได้เลยครับ\n\n⚠️ การเทรดมีความเสี่ยง';
          await sendRoomMessage(GLOBAL_ROOM_ID, {
            uid: 'ai-deep-analyze',
            name: '🤖 AI Deep Analyze [100% AI]',
            photoURL: null,
            text: reply,
          });
        } finally {
          setIsAiThinking(false);
        }
      }, 500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'ส่งสติ๊กเกอร์ไม่สำเร็จ');
    } finally {
      setIsSending(false);
    }
  };

  if (!isOpen) return null;

  const myUid = user?.uid || 'guest-trader';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6 bg-black/75 backdrop-blur-xs overflow-y-auto">
      <div className={`w-full sm:max-w-xl rounded-t-2xl sm:rounded-2xl flex flex-col overflow-hidden border-t sm:border max-h-[92vh] sm:my-8 shadow-2xl ${isDark ? 'bg-[#0F1117] text-white border-[#252A3A]' : 'bg-white text-slate-900 border-slate-200'}`}>
        
        {/* Header: Short title & 100% AI badge */}
        <div className="flex justify-between items-center px-4 py-3 border-b border-[#252A3A]/60 bg-[#141824]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[#00FF66]/15 border border-[#00FF66]/40 flex items-center justify-center">
              <Bot className="w-4 h-4 text-[#00FF66]" />
            </div>
            <div>
              <h2 className="font-bold flex items-center gap-1.5 text-sm sm:text-base">
                <span>AI Deep Analyze</span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-[#00FF66]/15 border border-[#00FF66]/40 text-[#00FF66] font-mono">
                  ● AI 100%
                </span>
              </h2>
              <p className="text-[10px] text-[#9CA3AF] flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-[#38BDF8]" />
                วิเคราะห์การเงิน หุ้นไทย-เทศ Forex ข่าวโลก และคริปโต
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {onOpenAtsMatrix && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenAtsMatrix();
                }}
                className="px-2.5 py-1 rounded-lg bg-[#00FF66]/15 hover:bg-[#00FF66]/25 border border-[#00FF66]/40 text-[#00FF66] text-[11px] font-mono font-bold flex items-center gap-1 transition-all cursor-pointer"
                title="สลับเป็น ATS MATRIX MODE"
              >
                <Radio className="w-3 h-3 animate-pulse" />
                <span className="hidden sm:inline">ATS Matrix</span>
              </button>
            )}
            <button onClick={onClose} className="text-[#6B7280] hover:text-white p-1 rounded-lg transition-colors cursor-pointer" aria-label="ปิดแชท">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Identity & Live Engine bar */}
        <div className="px-4 py-2 text-[11px] text-[#9CA3AF] border-b border-[#252A3A]/60 flex items-center justify-between bg-[#0A0D14] flex-wrap gap-2">
          <div className="flex items-center gap-2">
            {user ? (
              <>
                {user.photoURL ? (
                  <img src={user.photoURL} alt="" className="w-4 h-4 rounded-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <span className="w-4 h-4 rounded-full bg-[#7C6CFF]/20 text-[#A5B4FC] flex items-center justify-center text-[9px] font-bold">
                    {(user.displayName || user.email || 'T').charAt(0)}
                  </span>
                )}
                <span>คุณ: <strong className="text-white">{user.displayName || user.email}</strong></span>
              </>
            ) : (
              <div className="flex items-center gap-1.5 text-[#34D399]">
                <UserIcon className="w-3.5 h-3.5" />
                <span>โหมด Trader • วิเคราะห์สด 100%</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold border flex items-center gap-1 ${
                engineStatus.isOnlineLlm
                  ? 'bg-purple-500/15 text-purple-300 border-purple-500/40'
                  : 'bg-[#00FF66]/15 text-[#00FF66] border-[#00FF66]/40'
              }`}
              title={engineStatus.labelTh}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${engineStatus.isOnlineLlm ? 'bg-purple-400' : 'bg-[#00FF66] animate-pulse'}`} />
              {engineStatus.badgeTh}
            </span>
            {onOpenSettings && !engineStatus.isOnlineLlm && (
              <button
                type="button"
                onClick={onOpenSettings}
                className="text-[10px] font-mono text-[#38BDF8] hover:underline cursor-pointer"
                title="ใส่ Gemini API Key ในตั้งค่าเพื่อเปิดระบบประมวลผล LLM ออนไลน์"
              >
                ⚙️ ใส่ API Key
              </button>
            )}
          </div>
        </div>

        {/* Messages list */}
        <div className="flex-1 min-h-[320px] max-h-[440px] overflow-y-auto px-4 py-3 space-y-3 bg-[#0A0D14]">
          {messages.length === 0 && (
            <div className="p-4 rounded-2xl bg-[#141824] border border-[#252A3A] text-center my-4 space-y-2">
              <Bot className="w-10 h-10 text-[#00FF66] mx-auto animate-bounce" />
              <h3 className="text-white font-bold text-sm">ยินดีต้อนรับสู่ AI Deep Analyze (AI 100%)</h3>
              <p className="text-xs text-[#9CA3AF] max-w-sm mx-auto leading-relaxed">
                ถามคำถาม วิเคราะห์แนวรับ-แนวต้าน หุ้นไทย (SET), หุ้นนอก (US), Forex, คริปโต หรือสรุปข่าวสารการเงินโลก AI จะประมวลผลตอบกลับ 100% ทุกข้อความ
              </p>
            </div>
          )}

          {messages.map((m) => {
            const isAi = m.uid === 'ai-deep-analyze' || m.uid.startsWith('ats-matrix') || m.name.includes('AI');
            const mine = !isAi && (m.uid === myUid || m.name === (user?.displayName || user?.email));
            const stickerId = parseStickerCode(m.text);
            const StickerArt = stickerId ? STICKER_MAP[stickerId].Art : null;

            if (isAi) {
              return (
                <div key={m.id} className="flex gap-2.5 items-start">
                  <div className="w-7 h-7 rounded-xl bg-[#00FF66]/20 border border-[#00FF66]/40 flex items-center justify-center shrink-0 mt-0.5 shadow-[0_0_10px_rgba(0,255,102,0.2)]">
                    <Bot className="w-4 h-4 text-[#00FF66]" />
                  </div>
                  <div className="flex-1 rounded-2xl p-3.5 bg-[#0F1622] border border-[#00FF66]/30 shadow-[0_0_15px_rgba(0,255,102,0.06)] relative group">
                    <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-[#252A3A]/60">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-bold text-[#00FF66] font-mono">{m.name}</span>
                        <span className="text-[9px] px-1 rounded bg-[#00FF66]/20 text-[#00FF66] font-mono font-bold">VERIFIED</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] text-[#6B7280]">
                        <span>{formatTime(m.createdAt)}</span>
                        <button
                          type="button"
                          onClick={() => handleCopyText(m.id, m.text)}
                          className="hover:text-white transition-colors p-0.5"
                          title="คัดลอกบทวิเคราะห์"
                        >
                          {copiedId === m.id ? <Check className="w-3 h-3 text-[#00FF66]" /> : <Copy className="w-3 h-3" />}
                        </button>
                      </div>
                    </div>
                    <div className="text-xs text-slate-200 font-mono leading-relaxed whitespace-pre-wrap select-text">
                      {m.text}
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <div key={m.id} className={`flex gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
                {m.photoURL ? (
                  <img src={m.photoURL} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" referrerPolicy="no-referrer" />
                ) : (
                  <span className="w-7 h-7 rounded-full bg-[#252A3A] text-[#A5B4FC] flex items-center justify-center text-xs font-bold shrink-0">
                    {m.name.charAt(0)}
                  </span>
                )}
                <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 ${mine ? 'bg-[#7C6CFF]/25 border border-[#7C6CFF]/40' : 'bg-[#1A1D29] border border-[#252A3A]'}`}>
                  <p className="text-[10px] text-[#9CA3AF] font-semibold mb-0.5">
                    {m.name} • {formatTime(m.createdAt)}
                  </p>
                  {StickerArt ? (
                    <span className="inline-block mt-1 drop-shadow-lg">
                      <StickerArt size={88} />
                    </span>
                  ) : (
                    <p className="text-xs sm:text-sm leading-snug break-words text-white">{m.text}</p>
                  )}
                </div>
              </div>
            );
          })}

          {/* AI Thinking Animation */}
          {isAiThinking && (
            <div className="flex gap-2.5 items-start animate-pulse">
              <div className="w-7 h-7 rounded-xl bg-[#00FF66]/20 border border-[#00FF66]/40 flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="w-4 h-4 text-[#00FF66] animate-spin" />
              </div>
              <div className="rounded-2xl px-3.5 py-2.5 bg-[#0F1622] border border-[#00FF66]/30 text-xs text-[#00FF66] font-mono flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#00FF66] animate-ping" />
                <span>AI Deep Analyze กำลังประมวลผลข้อมูลตลาดเชิงลึก...</span>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Error notification */}
        {error && (
          <div className="mx-4 mb-2 text-[#f9df7b] bg-[#f9df7b]/10 border border-[#f9df7b]/30 rounded-lg px-3 py-2 text-xs">
            {error}
          </div>
        )}

        {/* Sticker picker */}
        {showStickers && (
          <div className="mx-3 mb-2 rounded-xl border border-[#252A3A] bg-[#1A1D29] p-2">
            <p className="px-1 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">
              สติ๊กเกอร์เทรด • แตะเพื่อส่งให้ AI วิเคราะห์
            </p>
            <div className="grid grid-cols-6 gap-1 max-h-[160px] overflow-y-auto">
              {STICKERS.map(({ id, name, Art }) => (
                <button
                  key={id}
                  onClick={() => handleSendSticker(id)}
                  title={name}
                  className="p-1.5 rounded-lg hover:bg-white/10 flex flex-col items-center justify-center gap-0.5 transition-colors cursor-pointer"
                >
                  <Art size={36} />
                  <span className="text-[9px] text-[#9CA3AF] truncate max-w-full font-mono">{name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Quick Suggestion Chips */}
        <div className="px-3 py-1.5 border-t border-[#252A3A]/40 bg-[#0F1117] flex items-center gap-1.5 overflow-x-auto text-[11px] font-mono [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          <span className="text-slate-500 text-[10px] shrink-0 font-bold">คำสั่งด่วน:</span>
          <button
            type="button"
            onClick={() => handleSend('BTC SPOT & NIULAI4')}
            disabled={isSending || isAiThinking}
            className="px-2 py-0.5 rounded-md bg-[#00FF66]/10 hover:bg-[#00FF66]/20 border border-[#00FF66]/30 text-[#00FF66] shrink-0 whitespace-nowrap transition-colors cursor-pointer"
          >
            ⚡ วิเคราะห์ BTC
          </button>
          <button
            type="button"
            onClick={() => handleSend('วิเคราะห์หุ้นไทย AOT และ DELTA')}
            disabled={isSending || isAiThinking}
            className="px-2 py-0.5 rounded-md bg-[#F59E0B]/10 hover:bg-[#F59E0B]/20 border border-[#F59E0B]/30 text-[#FBBF24] shrink-0 whitespace-nowrap transition-colors cursor-pointer"
          >
            ⚡ หุ้นไทย AOT/DELTA
          </button>
          <button
            type="button"
            onClick={() => handleSend('ตรวจอัตราแลกเปลี่ยน USD/THB')}
            disabled={isSending || isAiThinking}
            className="px-2 py-0.5 rounded-md bg-[#38BDF8]/10 hover:bg-[#38BDF8]/20 border border-[#38BDF8]/30 text-[#38BDF8] shrink-0 whitespace-nowrap transition-colors cursor-pointer"
          >
            ⚡ ค่าเงินบาท USD/THB
          </button>
          <button
            type="button"
            onClick={() => handleSend('วิเคราะห์หุ้นสหรัฐฯ NVDA')}
            disabled={isSending || isAiThinking}
            className="px-2 py-0.5 rounded-md bg-[#A855F7]/10 hover:bg-[#A855F7]/20 border border-[#A855F7]/30 text-[#C084FC] shrink-0 whitespace-nowrap transition-colors cursor-pointer"
          >
            ⚡ หุ้นนอก NVDA
          </button>
          <button
            type="button"
            onClick={() => handleSend('สรุปข่าวเศรษฐกิจโลกวันนี้')}
            disabled={isSending || isAiThinking}
            className="px-2 py-0.5 rounded-md bg-[#EC4899]/10 hover:bg-[#EC4899]/20 border border-[#EC4899]/30 text-[#F472B6] shrink-0 whitespace-nowrap transition-colors cursor-pointer"
          >
            ⚡ ข่าวเศรษฐกิจโลก
          </button>
          <button
            type="button"
            onClick={() => handleSend('วิเคราะห์ Drawdown พอร์ตและความเสี่ยง Peak-to-Trough')}
            disabled={isSending || isAiThinking}
            className="px-2 py-0.5 rounded-md bg-[#f9df7b]/10 hover:bg-[#f9df7b]/20 border border-[#f9df7b]/30 text-[#f9df7b] shrink-0 whitespace-nowrap transition-colors cursor-pointer"
          >
            📉 ตรวจ Drawdown พอร์ต
          </button>
        </div>

        {/* Input Bar */}
        <div className="p-3 border-t border-[#252A3A]/60 flex gap-2 bg-[#141824]">
          <button
            onClick={() => setShowStickers((v) => !v)}
            title="สติ๊กเกอร์"
            aria-label="เปิดชุดสติ๊กเกอร์"
            className={`px-2.5 rounded-xl border transition-colors cursor-pointer ${
              showStickers
                ? 'bg-[#F59E0B]/20 border-[#F59E0B]/50 text-[#FBBF24]'
                : 'bg-[#1A1D29] border-[#252A3A] text-[#9CA3AF] hover:text-[#FBBF24]'
            }`}
          >
            <StickerIcon className="w-5 h-5" />
          </button>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="พิมพ์คำถามหรือสินทรัพย์ให้ AI วิเคราะห์... (เช่น BTC, AOT, NVDA, EUR/USD)"
            disabled={isSending || isAiThinking}
            maxLength={500}
            className="flex-1 bg-[#0F1117] border border-[#252A3A] rounded-xl px-3 py-2 text-xs sm:text-sm outline-none focus:border-[#00FF66] placeholder-[#6B7280] text-white disabled:opacity-60"
          />
          <button
            onClick={() => handleSend()}
            disabled={isSending || isAiThinking || !draft.trim()}
            className="px-4 py-2 bg-[#00FF66] hover:bg-[#00E55B] text-black disabled:opacity-50 rounded-xl text-xs sm:text-sm font-bold inline-flex items-center gap-1.5 transition-all shadow-[0_0_10px_rgba(0,255,102,0.3)] cursor-pointer disabled:cursor-not-allowed"
          >
            {isAiThinking ? (
              <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            <span>{isAiThinking ? 'คิด...' : 'ส่ง'}</span>
          </button>
        </div>

      </div>
    </div>
  );
};
