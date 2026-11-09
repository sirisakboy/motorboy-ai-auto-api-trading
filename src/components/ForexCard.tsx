import React from 'react';
import { Star, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { ForexPair, TradingSignal } from '../types';

interface ForexCardProps {
  forex: ForexPair;
  signal?: TradingSignal;
  isWatchlisted: boolean;
  onToggleWatchlist: (symbol: string) => void;
  onSelect: () => void;
}

export const ForexCard: React.FC<ForexCardProps> = ({
  forex,
  signal,
  isWatchlisted,
  onToggleWatchlist,
  onSelect,
}) => {
  const currentSignal = signal || forex.signal;
  const isLong = currentSignal ? currentSignal.type === 'LONG' : forex.change >= 0;
  const isPositive = forex.change >= 0;

  // Flash styling matching CryptoCard
  const flashBg =
    forex.flash === 'UP'
      ? 'bg-[#22C55E]/20'
      : forex.flash === 'DOWN'
      ? 'bg-[#f9df7b]/20'
      : 'bg-[#1A1D29]';

  // Currency decimal formatting (4 decimals for pairs under 10 like EUR/USD, 2 for JPY/THB)
  const formatPrice = (val: number) => {
    const decimals = val < 10 ? 4 : 2;
    return val.toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  };

  const displayPrice = formatPrice(forex.price);
  const displaySl = currentSignal ? formatPrice(currentSignal.sl) : null;
  const displayTp = currentSignal ? formatPrice(currentSignal.tp) : null;
  const displaySupport = currentSignal?.support ? formatPrice(currentSignal.support) : null;
  const displayResistance = currentSignal?.resistance ? formatPrice(currentSignal.resistance) : null;

  const [base, quote] = forex.pair.split('/');

  return (
    <div
      onClick={onSelect}
      className={`w-full rounded-[18px] ${flashBg} border border-[#2A2E45] p-4 transition-colors duration-400 cursor-pointer hover:border-[#7C6CFF]/50 active:scale-[0.99]`}
      data-testid={`forex_card_${forex.pair.replace('/', '_').toLowerCase()}`}
    >
      {/* Header Row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2.5 min-w-0">
          <div className="w-9 h-9 rounded-full bg-[#0F1117] border border-[#2A2E45] flex items-center justify-center text-xs font-bold text-[#A5B4FC]">
            {base}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap sm:flex-nowrap items-center gap-1 sm:gap-1.5">
              <span className="font-bold text-white text-base leading-tight truncate">
                {forex.pair}
              </span>
              <span className="text-[#9CA3AF] text-xs shrink-0">
                {base}/{quote}
              </span>
              <span className="text-[10px] bg-[#6366F1]/20 text-[#A5B4FC] border border-[#6366F1]/40 px-1.5 py-0.2 rounded font-mono shrink-0">
                FX
              </span>
              <span
                className={`text-[10px] font-bold px-1.5 py-0.2 rounded border ${
                  forex.isLive === false
                    ? 'bg-[#F59E0B]/15 border-[#F59E0B]/40 text-[#FBBF24]'
                    : 'bg-[#22C55E]/15 border-[#22C55E]/40 text-[#4ADE80]'
                }`}
                title={forex.updatedAt ? `อัปเดต: ${forex.updatedAt}` : forex.isLive === false ? 'เรทล่าสุด (ออฟไลน์)' : 'เรท live'}
              >
                {forex.isLive === false ? '○ STALE' : '● LIVE'}
              </span>
            </div>
            <p className="text-[#909AAB] text-[11px] leading-tight mt-0.5 truncate">
              {currentSignal?.sources?.join(' • ') || 'open.er-api • Frankfurter • Bloomberg'}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleWatchlist(forex.pair);
            }}
            className="p-2 text-[#909AAB] hover:text-[#7C6CFF] transition-colors rounded-full"
            aria-label="Toggle Watchlist"
            data-testid={`watchlist_btn_${forex.pair}`}
          >
            <Star
              className={`w-5 h-5 ${
                isWatchlisted
                  ? 'fill-[#7C6CFF] text-[#7C6CFF]'
                  : 'text-[#909AAB]'
              }`}
            />
          </button>

          <span
            className={`px-2 py-0.5 rounded-xl text-xs font-bold border flex items-center space-x-1 ${
              isLong
                ? 'bg-[#22C55E]/15 border-[#22C55E]/40 text-[#4ADE80]'
                : 'bg-[#f9df7b]/15 border-[#f9df7b]/40 text-[#f9df7b]'
            }`}
          >
            {isLong ? (
              <ArrowUpRight className="w-3.5 h-3.5" />
            ) : (
              <ArrowDownRight className="w-3.5 h-3.5" />
            )}
            <span>{isLong ? 'LONG' : 'SHORT'}</span>
          </span>
        </div>
      </div>

      {/* Timeframe & Confidence */}
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-1">
        <span className="text-xs font-medium text-[#A5B4FC]">
          {currentSignal?.timeframe || 'สวิงเทรด 4H/1D'} • {currentSignal?.probability || 78}% มั่นใจ
        </span>
        <span className="text-[10px] text-[#9CA3AF]">
          Forex Pip Spread: มาตรฐาน
        </span>
      </div>

      {/* Price & Change */}
      <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-2">
        <span className="text-white text-[22px] font-black tracking-tight font-mono">
          {displayPrice}
        </span>
        <span
          className={`text-base font-extrabold ${
            isPositive ? 'text-[#22C55E]' : 'text-[#f9df7b]'
          }`}
        >
          {isPositive ? '+' : ''}{forex.change.toFixed(2)}%
        </span>
      </div>

      {/* Status & Reason Pill */}
      {currentSignal && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <div className="bg-[#0F1117] border border-[#2A2E45] rounded-lg px-2 py-1 text-[11px] text-[#9CA3AF]">
            {currentSignal.statusText}
          </div>
          <div className="bg-[#6366F1]/15 border border-[#6366F1]/30 rounded-lg px-2 py-1 text-[11px] text-[#A5B4FC]">
            {currentSignal.reason} • {currentSignal.etfFlow}
          </div>
        </div>
      )}

      {/* Support & Resistance (แนวรับ / แนวต้าน) Quick View */}
      {displaySupport && displayResistance && (
        <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          <div className="bg-[#10B981]/10 border border-[#10B981]/25 rounded-lg px-2.5 py-1.5 flex items-center justify-between">
            <span className="text-[#34D399] text-[11px] font-medium">แนวรับ (Support)</span>
            <span className="text-white font-mono font-bold text-[11px]">{displaySupport}</span>
          </div>
          <div className="bg-[#f9df7b]/10 border border-[#f9df7b]/25 rounded-lg px-2.5 py-1.5 flex items-center justify-between">
            <span className="text-[#f9df7b] text-[11px] font-medium">แนวต้าน (Resistance)</span>
            <span className="text-white font-mono font-bold text-[11px]">{displayResistance}</span>
          </div>
        </div>
      )}

      {/* SL & TP Quick view + trigger */}
      {displaySl && displayTp && (
        <div className="mt-2.5 flex flex-wrap items-center justify-between text-xs gap-2">
          <div className="flex items-center space-x-3">
            <span className="font-semibold text-[#f9df7b]">
              SL: {displaySl}
            </span>
            <span className="font-semibold text-[#22C55E]">
              TP: {displayTp}
            </span>
          </div>
          <span className="font-bold text-[#7C6CFF] hover:underline shrink-0">
            ดูวิเคราะห์ AI & สัญญาณ →
          </span>
        </div>
      )}

      {/* Tags & AI Similarity */}
      <div className="mt-2 pt-2 border-t border-[#2A2E45]/50 flex items-center justify-between text-[11px]">
        <div className="flex items-center space-x-1 overflow-x-auto">
          {(currentSignal?.tags || ['Major FX', 'Central Bank', 'Macro']).map((tag) => (
            <span
              key={tag}
              className="bg-[#2A2E45] text-[#9CA3AF] rounded px-1.5 py-0.5 text-[10px] whitespace-nowrap"
            >
              {tag}
            </span>
          ))}
        </div>
        <span className="font-medium text-[#A5B4FC] shrink-0 ml-2">
          Momentum {currentSignal?.similarity || 88}%
        </span>
      </div>
    </div>
  );
};
