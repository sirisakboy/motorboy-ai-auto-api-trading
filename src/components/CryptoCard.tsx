import React from 'react';
import { Star } from 'lucide-react';
import { TradingSignal, CryptoCoin } from '../types';

interface CryptoCardProps {
  signal: TradingSignal;
  coin?: CryptoCoin;
  isWatchlisted: boolean;
  useThb: boolean;
  usdThbRate?: number;
  onToggleWatchlist: (symbol: string) => void;
  onSelect: () => void;
}

export const CryptoCard: React.FC<CryptoCardProps> = ({
  signal,
  coin,
  isWatchlisted,
  useThb,
  usdThbRate = 36.45,
  onToggleWatchlist,
  onSelect,
}) => {
  const isLong = signal.type === 'LONG';
  const isForex = signal.symbol.includes('/');
  const decimals = isForex && signal.price < 100 ? 4 : 2;
  const multiplier = useThb ? usdThbRate : 1;
  const currencyPrefix = useThb ? '฿' : '$';

  const displayPrice = ((coin?.price || signal.price) * multiplier).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  const displaySl = (signal.sl * multiplier).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  const displayTp = (signal.tp * multiplier).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  const currentChange = coin?.change ?? signal.change;
  const isPositive = currentChange >= 0;

  // Flash styling
  const flashBg =
    coin?.flash === 'UP'
      ? 'bg-[#22C55E]/20'
      : coin?.flash === 'DOWN'
      ? 'bg-[#f9df7b]/20'
      : 'bg-[#1A1D29]';

  return (
    <div
      onClick={onSelect}
      className={`w-full rounded-[18px] ${flashBg} border border-[#252A3A] p-4 transition-colors duration-400 cursor-pointer hover:border-[#7C6CFF]/50 active:scale-[0.99]`}
      data-testid={`signal_card_${signal.symbol.toLowerCase()}`}
    >
      {/* Header Row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2.5 min-w-0">
          <div className="w-9 h-9 rounded-full bg-[#0F1117] border border-[#252A3A] flex items-center justify-center text-xs font-bold text-[#A5B4FC]">
            {signal.symbol.slice(0, 3)}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap sm:flex-nowrap items-center gap-1 sm:gap-1.5">
              <span className="font-bold text-white text-base leading-tight truncate">
                {signal.symbol}
              </span>
              <span className="text-[#9CA3AF] text-xs shrink-0">
                {signal.base}/{signal.quote}
              </span>
            </div>
            <p className="text-[#909AAB] text-[11px] leading-tight mt-0.5 truncate">
              {signal.sources.join(' • ')}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleWatchlist(signal.symbol);
            }}
            className="p-2 text-[#909AAB] hover:text-[#7C6CFF] transition-colors rounded-full"
            aria-label="Toggle Watchlist"
            data-testid={`watchlist_btn_${signal.symbol}`}
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
            className={`px-2 py-0.5 rounded-xl text-xs font-bold border ${
              isLong
                ? 'bg-[#22C55E]/15 border-[#22C55E]/40 text-[#4ADE80]'
                : 'bg-[#f9df7b]/15 border-[#f9df7b]/40 text-[#f9df7b]'
            }`}
          >
            {signal.type}
          </span>
        </div>
      </div>

      {/* Timeframe & Confidence */}
      <div className="mt-2.5">
        <span className="text-xs font-medium text-[#A5B4FC]">
          {signal.timeframe} • {signal.probability}% มั่นใจ
        </span>
      </div>

      {/* Price & Change */}
      <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-2">
        <span className="text-white text-[22px] font-black tracking-tight">
          {currencyPrefix}{displayPrice}
        </span>
        <span
          className={`text-base font-extrabold ${
            isPositive ? 'text-[#22C55E]' : 'text-[#f9df7b]'
          }`}
        >
          {isPositive ? '+' : ''}{currentChange.toFixed(2)}%
        </span>
      </div>

      {/* Status & Reason Pill */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <div className="bg-[#0F1117] border border-[#252A3A] rounded-lg px-2 py-1 text-[11px] text-[#9CA3AF]">
          {signal.statusText}
        </div>
        <div className="bg-[#6366F1]/15 border border-[#6366F1]/30 rounded-lg px-2 py-1 text-[11px] text-[#A5B4FC]">
          {signal.reason} • {signal.etfFlow}
        </div>
      </div>

      {/* SL & TP Quick view + trigger */}
      <div className="mt-3 flex flex-wrap items-center justify-between text-xs gap-2">
        <div className="flex items-center space-x-3">
          <span className="font-semibold text-[#f9df7b]">
            SL: {currencyPrefix}{displaySl}
          </span>
          <span className="font-semibold text-[#22C55E]">
            TP: {currencyPrefix}{displayTp}
          </span>
        </div>
        <span className="font-bold text-[#7C6CFF] hover:underline shrink-0">
          ดูโบ๊ะแตกเพิ่มเติม →
        </span>
      </div>

      {/* Tags & AI Similarity */}
      <div className="mt-2 pt-2 border-t border-[#252A3A]/50 flex items-center justify-between text-[11px]">
        <div className="flex items-center space-x-1">
          {signal.tags.map((tag) => (
            <span
              key={tag}
              className="bg-[#252A3A] text-[#9CA3AF] rounded px-1.5 py-0.5 text-[10px]"
            >
              {tag}
            </span>
          ))}
        </div>
        <span className="font-medium text-[#A5B4FC]">
          Momentum {signal.similarity}%
        </span>
      </div>
    </div>
  );
};
