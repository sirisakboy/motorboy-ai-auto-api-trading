import React, { useState } from 'react';
import {
  History,
  Trash2,
  Bot,
  Bell,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  Search,
  Globe,
  Building2,
  Zap,
} from 'lucide-react';
import { TradingHistoryEntry } from '../types';

interface HistoryListProps {
  entries: TradingHistoryEntry[];
  userEmail?: string | null;
  useThb: boolean;
  usdThbRate?: number;
  onDeleteEntry: (id: string) => void;
  onClearAll: () => void;
}

export const HistoryList: React.FC<HistoryListProps> = ({
  entries,
  userEmail,
  useThb,
  usdThbRate = 36.45,
  onDeleteEntry,
  onClearAll,
}) => {
  const [filterType, setFilterType] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [confirmClear, setConfirmClear] = useState<boolean>(false);

  const filteredEntries = entries.filter((item) => {
    const matchesType =
      filterType === 'ALL' || item.type === filterType;
    const matchesSearch =
      item.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.aiSummary.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesType && matchesSearch;
  });

  const formatPrice = (p: number) => {
    if (useThb) {
      return `฿${(p * usdThbRate).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
    }
    return `$${p.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  };

  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('th-TH', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="rounded-2xl bg-[#1A1D29] border border-[#252A3A] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-[#7C6CFF]/20 border border-[#7C6CFF]/40 flex items-center justify-center text-[#A5B4FC]">
            <History className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-white font-bold text-sm">
                ประวัติการวิเคราะห์ & สัญญาณที่บันทึก
              </h2>
              <span className="bg-[#22C55E]/15 border border-[#22C55E]/30 text-[#4ADE80] text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center space-x-1">
                <CheckCircle2 className="w-3 h-3 inline" />
                <span>ซิงค์กับ Google Firestore</span>
              </span>
            </div>
            <p className="text-[#9CA3AF] text-xs mt-0.5">
              บันทึกบนคลาวด์อัตโนมัติสำหรับบัญชี{' '}
              <span className="text-[#A5B4FC] font-semibold">
                {userEmail || 'Google User'}
              </span>
            </p>
          </div>
        </div>

        {entries.length > 0 && (
          <div>
            {!confirmClear ? (
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                className="text-xs text-[#EF4444] hover:text-red-300 border border-red-500/30 hover:bg-red-500/10 px-3 py-1.5 rounded-xl font-medium transition-colors flex items-center space-x-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>ล้างประวัติทั้งหมด</span>
              </button>
            ) : (
              <div className="flex items-center space-x-2">
                <span className="text-xs text-red-400 font-semibold">ยืนยันการลบ?</span>
                <button
                  type="button"
                  onClick={() => {
                    onClearAll();
                    setConfirmClear(false);
                  }}
                  className="text-xs bg-red-600 hover:bg-red-700 text-white font-bold px-2.5 py-1 rounded-lg transition-colors"
                >
                  ลบ
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClear(false)}
                  className="text-xs bg-[#252A3A] hover:bg-[#32384D] text-[#9CA3AF] px-2.5 py-1 rounded-lg transition-colors"
                >
                  ยกเลิก
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Filter and Search */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-1 bg-[#1A1D29] p-1 rounded-2xl border border-[#252A3A] overflow-x-auto text-xs">
          {[
            { id: 'ALL', label: 'ทั้งหมด', count: entries.length },
            {
              id: 'AUTO_MARKET_IMPACT',
              label: '⚡️ Auto ทุก 1 ชม.',
              count: entries.filter((e) => e.type === 'AUTO_MARKET_IMPACT').length,
            },
            {
              id: 'LONG_TERM_PROJECT',
              label: '🏗️ โครงการ & Capex',
              count: entries.filter((e) => e.type === 'LONG_TERM_PROJECT').length,
            },
            {
              id: 'NEWS_ANALYSIS',
              label: 'วิเคราะห์ข่าว',
              count: entries.filter((e) => e.type === 'NEWS_ANALYSIS').length,
            },
            {
              id: 'AI_ANALYSIS',
              label: 'วิเคราะห์ AI',
              count: entries.filter((e) => e.type === 'AI_ANALYSIS').length,
            },
            {
              id: 'SIGNAL_SAVED',
              label: 'สัญญาณที่เซฟ',
              count: entries.filter((e) => e.type === 'SIGNAL_SAVED').length,
            },
            {
              id: 'PRICE_ALERT',
              label: 'แจ้งเตือนราคา',
              count: entries.filter((e) => e.type === 'PRICE_ALERT').length,
            },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilterType(tab.id)}
              className={`px-3 py-1.5 rounded-xl font-semibold transition-colors flex items-center space-x-1.5 whitespace-nowrap ${
                filterType === tab.id
                  ? 'bg-white text-black font-bold shadow-xs'
                  : 'text-[#9CA3AF] hover:text-white'
              }`}
            >
              <span>{tab.label}</span>
              <span className="text-[10px] opacity-70">({tab.count})</span>
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="w-4 h-4 text-[#6B7280] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ค้นหาในประวัติ..."
            className="w-full sm:w-56 bg-[#1A1D29] border border-[#252A3A] focus:border-[#7C6CFF] rounded-xl pl-9 pr-3 py-1.5 text-xs text-white outline-none placeholder-[#6B7280]"
          />
        </div>
      </div>

      {/* List */}
      {filteredEntries.length === 0 ? (
        <div className="rounded-2xl bg-[#1A1D29] border border-[#252A3A] p-10 text-center space-y-3">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-[#252A3A] flex items-center justify-center text-[#9CA3AF]">
            <History className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-white font-bold text-sm">ยังไม่มีประวัติในหมวดหมู่นี้</h3>
            <p className="text-[#6B7280] text-xs mt-1 max-w-md mx-auto leading-relaxed">
              ระบบมีกลไก <strong>Auto-Analysis ทุก 1 ชั่วโมง</strong> ที่สรุปปัจจัยที่มีผลต่อราคาลงประวัตินี้โดยอัตโนมัติ
              รวมถึงการวิเคราะห์โครงการก่อสร้างและขยายบริษัทเพื่อการลงทุนระยะยาว
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredEntries.map((item) => {
            const isLong = item.action === 'LONG' || item.action === 'BUY';
            const isShort = item.action === 'SHORT' || item.action === 'SELL';
            const isAuto = item.type === 'AUTO_MARKET_IMPACT';
            const isProject = item.type === 'LONG_TERM_PROJECT';

            return (
              <div
                key={item.id}
                className={`rounded-2xl border p-4 transition-all duration-200 space-y-3 ${
                  isAuto
                    ? 'bg-[#1A1D29] border-[#0284C7]/40 hover:border-[#38BDF8]'
                    : isProject
                    ? 'bg-[#1A1D29] border-[#F59E0B]/40 hover:border-[#FBBF24]'
                    : 'bg-[#1A1D29] border-[#252A3A] hover:border-[#7C6CFF]/40'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs ${
                        isAuto
                          ? 'bg-[#0284C7]/20 text-[#38BDF8] border border-[#0284C7]/40'
                          : isProject
                          ? 'bg-[#F59E0B]/20 text-[#FBBF24] border border-[#F59E0B]/40'
                          : isLong
                          ? 'bg-[#22C55E]/15 text-[#4ADE80] border border-[#22C55E]/30'
                          : isShort
                          ? 'bg-[#EF4444]/15 text-[#F87171] border border-[#EF4444]/30'
                          : 'bg-[#7C6CFF]/15 text-[#A5B4FC] border border-[#7C6CFF]/30'
                      }`}
                    >
                      {isAuto ? (
                        <Zap className="w-4 h-4 text-[#38BDF8]" />
                      ) : isProject ? (
                        <Building2 className="w-4 h-4 text-[#FBBF24]" />
                      ) : item.type === 'AI_ANALYSIS' ? (
                        <Bot className="w-4 h-4" />
                      ) : item.type === 'PRICE_ALERT' ? (
                        <Bell className="w-4 h-4" />
                      ) : item.type === 'NEWS_ANALYSIS' ? (
                        <Globe className="w-4 h-4 text-[#38BDF8]" />
                      ) : (
                        <History className="w-4 h-4" />
                      )}
                    </div>

                    <div>
                      <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                        <span className="text-white font-extrabold text-sm tracking-wide">
                          {item.symbol}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center space-x-1 ${
                            isLong
                              ? 'bg-[#22C55E]/20 text-[#4ADE80]'
                              : isShort
                              ? 'bg-[#EF4444]/20 text-[#F87171]'
                              : 'bg-slate-700 text-slate-300'
                          }`}
                        >
                          {isLong ? (
                            <TrendingUp className="w-3 h-3 inline mr-0.5" />
                          ) : isShort ? (
                            <TrendingDown className="w-3 h-3 inline mr-0.5" />
                          ) : null}
                          {item.action}
                        </span>

                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-md font-semibold border ${
                            isAuto
                              ? 'bg-[#0284C7]/20 border-[#0284C7]/40 text-[#38BDF8]'
                              : isProject
                              ? 'bg-[#F59E0B]/20 border-[#F59E0B]/40 text-[#FBBF24]'
                              : item.type === 'AI_ANALYSIS'
                              ? 'bg-[#7C6CFF]/20 border-[#7C6CFF]/40 text-[#A5B4FC]'
                              : item.type === 'PRICE_ALERT'
                              ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                              : item.type === 'NEWS_ANALYSIS'
                              ? 'bg-sky-500/20 border-sky-500/40 text-sky-300'
                              : 'bg-[#0F1117] border-[#252A3A] text-[#9CA3AF]'
                          }`}
                        >
                          {isAuto
                            ? '⚡️ Auto-Analysis 1 ชม.'
                            : isProject
                            ? '🏗️ โครงการ & ขยายบริษัท'
                            : item.type === 'AI_ANALYSIS'
                            ? 'Gemini AI'
                            : item.type === 'PRICE_ALERT'
                            ? 'แจ้งเตือนราคา'
                            : item.type === 'NEWS_ANALYSIS'
                            ? 'วิเคราะห์ข่าว MSN / ตลาด'
                            : 'สัญญาณที่เซฟ'}
                        </span>
                      </div>

                      <div className="flex items-center space-x-2 text-[11px] text-[#9CA3AF] mt-0.5">
                        {item.price > 0 && (
                          <>
                            <span>ราคา ณ ตอนบันทึก:</span>
                            <span className="text-white font-semibold">
                              {formatPrice(item.price)}
                            </span>
                          </>
                        )}
                        {item.confidence && (
                          <span className="text-[#A5B4FC]">
                            • ความแม่นยำ/มั่นใจ {item.confidence}%
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <span className="text-[10px] text-[#6B7280]">
                      {formatDate(item.timestamp)}
                    </span>
                    <button
                      type="button"
                      onClick={() => onDeleteEntry(item.id)}
                      className="text-[#6B7280] hover:text-red-400 p-1 transition-colors rounded-lg"
                      title="ลบรายการนี้"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* AI Summary Text */}
                {item.aiSummary && (
                  <div className="bg-[#0F1117] rounded-xl p-3 border border-[#252A3A] text-xs text-[#D1D5DB] leading-relaxed whitespace-pre-line">
                    {item.aiSummary}
                  </div>
                )}

                {/* Targets if available */}
                {(item.sl || item.tp) && (
                  <div className="flex items-center space-x-3 text-[11px] pt-1">
                    {item.sl && (
                      <span className="text-red-400">
                        Stop Loss: <strong>{formatPrice(item.sl)}</strong>
                      </span>
                    )}
                    {item.tp && (
                      <span className="text-green-400">
                        Take Profit: <strong>{formatPrice(item.tp)}</strong>
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
