import React from 'react';
import {
  TrendingUp,
  TrendingDown,
  Star,
  BarChart3,
  Globe,
  Activity,
} from 'lucide-react';
import { ForeignStock, TradingSignal } from '../types';

interface ForeignStockCardProps {
  stock: ForeignStock;
  signal?: TradingSignal;
  isWatchlisted: boolean;
  useThb: boolean;
  usdThbRate?: number;
  onToggleWatchlist: (symbol: string) => void;
  onSelect: () => void;
}

export const ForeignStockCard: React.FC<ForeignStockCardProps> = ({
  stock,
  signal,
  isWatchlisted,
  useThb,
  usdThbRate = 36.45,
  onToggleWatchlist,
  onSelect,
}) => {
  const isPositive = stock.change >= 0;
  const multiplier = useThb ? usdThbRate : 1;
  const currencyPrefix = useThb ? '฿' : '$';

  return (
    <div
      onClick={onSelect}
      className="w-full rounded-[18px] bg-[#1A1D29] border border-[#252A3A] p-4 transition-all duration-150 active:scale-[0.99] hover:border-[#6366F1]/50 cursor-pointer"
    >
      <div className="flex flex-wrap sm:flex-nowrap items-start sm:items-center justify-between gap-2">
        {/* Left: Symbol + Name */}
        <div className="flex items-center space-x-3 min-w-0">
          <div className="w-10 h-10 shrink-0 rounded-xl bg-gradient-to-br from-[#6366F1]/20 to-[#8B5CF6]/20 border border-[#6366F1]/30 flex items-center justify-center">
            <span className="text-[#A5B4FC] text-xs font-black">
              {stock.symbol.slice(0, 2)}
            </span>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h3 className="text-white font-bold text-sm leading-tight truncate">
                {stock.symbol}
              </h3>
              <span className="bg-[#6366F1]/20 text-[#A5B4FC] text-[9px] font-bold px-1.5 py-0.2 rounded flex items-center gap-0.5">
                <Globe className="w-2.5 h-2.5" />
                US
              </span>
              <span
                className={`text-[9px] font-bold px-1.5 py-0.2 rounded border ${
                  stock.isLive === false
                    ? 'bg-[#F59E0B]/15 border-[#F59E0B]/40 text-[#FBBF24]'
                    : 'bg-[#22C55E]/15 border-[#22C55E]/40 text-[#4ADE80]'
                }`}
                title={stock.updatedAt ? `อัปเดต: ${stock.updatedAt}` : stock.isLive === false ? 'ราคาล่าสุดที่ดึงได้ (ตลาดปิด/ออฟไลน์)' : 'ราคา live'}
              >
                {stock.isLive === false ? '○ STALE' : '● LIVE'}
              </span>
            </div>
            <p className="text-[#94A3B8] text-[11px] mt-0.5 truncate">
              {stock.name}
            </p>
          </div>
        </div>

        {/* Right: Price + Change */}
        <div className="text-right shrink-0 flex items-center gap-3">
          <div>
            <div className="text-white font-black text-lg tabular-nums">
              {currencyPrefix}{(stock.price * multiplier).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div
              className={`text-sm font-extrabold flex items-center justify-end gap-1 ${
                isPositive ? 'text-[#22C55E]' : 'text-[#EF4444]'
              }`}
            >
              {isPositive ? (
                <TrendingUp className="w-3.5 h-3.5" />
              ) : (
                <TrendingDown className="w-3.5 h-3.5" />
              )}
              {isPositive ? '+' : ''}{stock.change.toFixed(2)}%
            </div>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleWatchlist(stock.symbol);
            }}
            className={`p-1.5 rounded-lg transition-colors ${
              isWatchlisted
                ? 'bg-[#6366F1]/20 text-[#A5B4FC]'
                : 'bg-[#0F1117] text-[#6B7280] hover:text-[#A5B4FC]'
            }`}
            title={isWatchlisted ? 'ลบออกจากรายการ' : 'เพิ่มลง Watchlist'}
          >
            <Star
              className="w-4 h-4"
              fill={isWatchlisted ? 'currentColor' : 'none'}
            />
          </button>
        </div>
      </div>

      {/* Info Row */}
      <div className="flex items-center gap-3 mt-3 flex-wrap">
        <div className="flex items-center gap-1 text-[10px] text-[#94A3B8]">
          <BarChart3 className="w-3 h-3" />
          <span>Vol: {(stock.volume / 1000000).toFixed(1)}M</span>
        </div>
        <div className="flex items-center gap-1 text-[10px] text-[#94A3B8]">
          <Activity className="w-3 h-3" />
          <span>P/E: {stock.pe}</span>
        </div>
        <span className="text-[9px] text-[#A5B4FC] bg-[#6366F1]/10 px-1.5 py-0.5 rounded font-medium">
          {stock.sector}
        </span>
      </div>

      {/* 52-Week Range Bar */}
      <div className="mt-3 pt-3 border-t border-[#252A3A]/60">
        <div className="flex items-center justify-between text-[10px] text-[#94A3B8] mb-1">
          <span>52W Low: {currencyPrefix}{(stock.low52w * multiplier).toLocaleString()}</span>
          <span>52W High: {currencyPrefix}{(stock.high52w * multiplier).toLocaleString()}</span>
        </div>
        <div className="w-full h-1.5 bg-[#0F1117] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#EF4444] via-[#F59E0B] to-[#22C55E]"
            style={{
              width: `${Math.min(100, Math.max(0, ((stock.price - stock.low52w) / (stock.high52w - stock.low52w)) * 100))}%`,
            }}
          />
        </div>
      </div>

      {/* Signal Badge */}
      {signal && (
        <div className="flex items-center justify-between flex-wrap gap-2 mt-3 pt-3 border-t border-[#252A3A]/60">
          <div className="flex items-center gap-2">
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                signal.type === 'LONG'
                  ? 'bg-[#22C55E]/20 text-[#4ADE80]'
                  : 'bg-[#EF4444]/20 text-[#F87171]'
              }`}
            >
              {signal.type === 'LONG' ? 'LONG สะสม' : 'SHORT ขาย'}
            </span>
            <span className="text-[10px] text-[#94A3B8]">
              ความน่าจะเป็น {signal.probability}%
            </span>
          </div>
          <span className="text-[10px] text-[#6B7280]">
            SL: {currencyPrefix}{(signal.sl * multiplier).toFixed(2)} • TP: {currencyPrefix}{(signal.tp * multiplier).toFixed(2)}
          </span>
        </div>
      )}
    </div>
  );
};
