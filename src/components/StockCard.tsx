import React from 'react';
import { StockIndex } from '../types';
import { formatAsOfLabel } from '../utils';

interface StockCardProps {
  stock: StockIndex;
  marketStatusText: string;
  countdown: string;
  useThb?: boolean;
  usdThbRate?: number;
}

export const StockCard: React.FC<StockCardProps> = ({
  stock,
  marketStatusText,
  countdown,
  useThb = false,
  usdThbRate = 36.45,
}) => {
  const isPositive = stock.change >= 0;
  const isThai = stock.symbol === 'SET';
  const multiplier = useThb && !isThai ? usdThbRate : 1;
  const currencySymbol = useThb || isThai ? '฿' : '$';
  const displayPrice = (stock.price * multiplier).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return (
    <div className="w-full rounded-[18px] bg-[#141725] border border-white/[0.07] p-4 transition-transform duration-150 active:scale-[0.99]">
      <div className="flex flex-wrap sm:flex-nowrap items-start sm:items-center justify-between gap-2">
        <div className="flex items-center space-x-2.5 min-w-0">
          <div className="w-9 h-9 shrink-0 rounded-full bg-[#0F1117] border border-white/[0.07] flex items-center justify-center text-sm font-bold text-[#A89FFF]">
            {stock.symbol.charAt(0)}
          </div>
          <div className="min-w-0">
            <h3 className="text-white font-bold text-[15px] leading-tight truncate">
              {stock.symbol} • {stock.name}
            </h3>
            <p className="text-[#A7A4B8] text-[11px] mt-0.5 leading-tight truncate">
              {stock.schedule} • {marketStatusText} • {countdown}
            </p>
          </div>
        </div>

        <div className="text-right shrink-0">
          <div className="flex items-center justify-end gap-1.5">
            <span
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md border ${
                stock.isLive
                  ? 'bg-[#7EE0B5]/15 border-[#7EE0B5]/40 text-[#7EE0B5]'
                  : 'bg-[#FFB86B]/15 border-[#FFB86B]/40 text-[#FFB86B]'
              }`}
              title={stock.updatedAt ? `อัปเดตเมื่อ: ${stock.updatedAt}` : 'ใช้ราคาสำรอง (ยังไม่ได้ดึงข้อมูล Live)'}
            >
              {stock.isLive ? '● LIVE' : '○ สำรอง'}
            </span>
            {formatAsOfLabel(stock.updatedAt) && (
              <span className="block text-[9px] text-[#A7A4B8] mt-0.5 tabular-nums">
                {formatAsOfLabel(stock.updatedAt)}
              </span>
            )}
          </div>
          <div className="text-white font-black text-lg">
            {currencySymbol}{displayPrice}
          </div>
          <div
            className={`text-sm font-extrabold ${
              isPositive ? 'text-[#7EE0B5]' : 'text-[#FFB86B]'
            }`}
          >
            {isPositive ? '+' : ''}{stock.change.toFixed(2)}%
          </div>
        </div>
      </div>

      {stock.symbol === 'SET' && (
        <div className="mt-3 w-full h-[54px] bg-[#0F1117] rounded-xl border border-white/[0.07] px-3 py-1.5 flex items-center justify-between">
          <svg className="w-[140px] h-9 overflow-visible" viewBox="0 0 140 36">
            <path
              d="M 5,25 Q 42,4 70,14 Q 105,22 135,9"
              fill="none"
              stroke="#A89FFF"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            <circle cx="70" cy="14" r="4.5" fill="#7C6CFF" />
          </svg>
          <span className="text-[#A7A4B8] text-[11px]">
            {stock.isLive
              ? 'กราฟแสดงข้อมูลแบบเรียลไทม์'
              : 'ตลาดปิดหรือออฟไลน์ • ใช้ราคาสำรอง'}
          </span>
        </div>
      )}
    </div>
  );
};
