import React from 'react';
import { Star } from 'lucide-react';
import { TradingSignal, CryptoCoin } from '../types';
import {
  formatCryptoPrice,
  validateTradingSignal,
  INCONSISTENT_SIGNAL_LABEL,
} from '../utils';

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
  const priceMode = useThb ? 'THB' : 'USD';

  // ทศนิยมแบบไดนามิก: SHIB (< 0.01) ต้องเห็น 8 ตำแหน่ง ไม่ใช่ $0.00
  const displayPrice = formatCryptoPrice({
    price: coin?.price ?? signal.price,
    mode: priceMode,
    usdThbRate,
  });

  // ตรวจกับ "ราคาที่การ์ดแสดงจริง" (coin.price) ไม่ใช่ราคาตอนสร้างสัญญาณ:
  // ถาราคาเปลี่ยนหลังสร้างสัญญาณ SL/TP เดิมอาจอยู่ผิดฝั่งไปแล้ว
  const referencePrice = coin?.price ?? signal.price;

  // SL/TP ที่อยู่ผิดฝั่งของราคา = ข้อมูลเสีย ห้ามแสดงเป็นตัวเลขปกติ
  const validation = validateTradingSignal({
    type: signal.type,
    price: referencePrice,
    sl: signal.sl,
    tp: signal.tp,
  });

  const displaySl = formatCryptoPrice({ price: signal.sl, mode: priceMode, usdThbRate });
  const displayTp = formatCryptoPrice({ price: signal.tp, mode: priceMode, usdThbRate });

  const currentChange = coin?.change ?? signal.change;
  const isPositive = currentChange >= 0;

  // Flash styling
  const flashBg =
    coin?.flash === 'UP'
      ? 'bg-[#7EE0B5]/20'
      : coin?.flash === 'DOWN'
      ? 'bg-[#FFB86B]/20'
      : 'bg-[#141725]';

  return (
    <div
      onClick={onSelect}
      className={`w-full rounded-[18px] ${flashBg} border border-white/[0.07] p-4 transition-colors duration-400 cursor-pointer hover:border-[#7C6CFF]/50 active:scale-[0.99]`}
      data-testid={`signal_card_${signal.symbol.toLowerCase()}`}
    >
      {/* Header Row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2.5 min-w-0">
          <div className="w-9 h-9 rounded-full bg-[#0F1117] border border-white/[0.07] flex items-center justify-center text-xs font-bold text-[#A89FFF]">
            {signal.symbol.slice(0, 3)}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap sm:flex-nowrap items-center gap-1 sm:gap-1.5">
              <span className="font-bold text-white text-base leading-tight truncate">
                {signal.symbol}
              </span>
              <span className="text-[#A7A4B8] text-xs shrink-0">
                {signal.base}/{signal.quote}
              </span>
            </div>
            <p className="text-[#A7A4B8] text-[11px] leading-tight mt-0.5 truncate">
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
            className="p-2 text-[#A7A4B8] hover:text-[#7C6CFF] transition-colors rounded-full"
            aria-label="Toggle Watchlist"
            data-testid={`watchlist_btn_${signal.symbol}`}
          >
            <Star
              className={`w-5 h-5 ${
                isWatchlisted
                  ? 'fill-[#7C6CFF] text-[#7C6CFF]'
                  : 'text-[#A7A4B8]'
              }`}
            />
          </button>

          <span
            className={`px-2 py-0.5 rounded-xl text-xs font-bold border ${
              isLong
                ? 'bg-[#7EE0B5]/15 border-[#7EE0B5]/40 text-[#7EE0B5]'
                : 'bg-[#FFB86B]/15 border-[#FFB86B]/40 text-[#FFB86B]'
            }`}
          >
            {signal.type}
          </span>
        </div>
      </div>

      {/* Timeframe & Confidence */}
      <div className="mt-2.5">
        <span className="text-xs font-medium text-[#A89FFF]">
          {signal.timeframe} • {signal.probability}% มั่นใจ
        </span>
      </div>

      {/* Price & Change */}
      <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-2">
        <span className="text-white text-[22px] font-black tracking-tight">
          {displayPrice}
        </span>
        <span
          className={`text-base font-extrabold ${
            isPositive ? 'text-[#7EE0B5]' : 'text-[#FFB86B]'
          }`}
        >
          {isPositive ? '+' : ''}{currentChange.toFixed(2)}%
        </span>
      </div>

      {/* Status & Reason Pill */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <div className="bg-[#0F1117] border border-white/[0.07] rounded-lg px-2 py-1 text-[11px] text-[#A7A4B8]">
          {signal.statusText}
        </div>
        <div className="bg-[#A89FFF]/15 border border-[#A89FFF]/30 rounded-lg px-2 py-1 text-[11px] text-[#A89FFF]">
          {signal.reason} • {signal.etfFlow}
        </div>
      </div>

      {/* SL & TP Quick view + trigger */}
      <div className="mt-3 flex flex-wrap items-center justify-between text-xs gap-2">
        <div className="flex items-center space-x-3">
          {validation.valid ? (
            <>
              <span className="font-semibold text-[#FFB86B]">SL: {displaySl}</span>
              <span className="font-semibold text-[#7EE0B5]">TP: {displayTp}</span>
            </>
          ) : (
            <span
              className="font-semibold text-[#FFB86B]"
              title={validation.detail}
              data-testid={`signal_inconsistent_${signal.symbol.toLowerCase()}`}
            >
              {INCONSISTENT_SIGNAL_LABEL}
            </span>
          )}
        </div>
        <span className="font-bold text-[#7C6CFF] hover:underline shrink-0">
          ดูโบ๊ะแตกเพิ่มเติม →
        </span>
      </div>

      {/* Tags & AI Similarity */}
      <div className="mt-2 pt-2 border-t border-white/[0.07]/50 flex items-center justify-between text-[11px]">
        <div className="flex items-center space-x-1">
          {signal.tags.map((tag) => (
            <span
              key={tag}
              className="bg-[#222640] text-[#A7A4B8] rounded px-1.5 py-0.5 text-[10px]"
            >
              {tag}
            </span>
          ))}
        </div>
        <span className="font-medium text-[#A89FFF]">
          Momentum {signal.similarity}%
        </span>
      </div>
    </div>
  );
};
