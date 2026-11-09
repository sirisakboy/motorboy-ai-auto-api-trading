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
      className="w-full rounded-[18px] bg-[#141725] border border-white/[0.07] p-4 transition-all duration-150 active:scale-[0.99] hover:border-[#A89FFF]/50 cursor-pointer"
    >
      <div className="flex flex-wrap sm:flex-nowrap items-start sm:items-center justify-between gap-2">
        {/* Left: Symbol + Name */}
        <div className="flex items-center space-x-3 min-w-0">
          <div className="w-10 h-10 shrink-0 rounded-xl bg-gradient-to-br from-[#A89FFF]/20 to-[#8B5CF6]/20 border border-[#A89FFF]/30 flex items-center justify-center">
            <span className="text-[#A89FFF] text-xs font-black">
              {stock.symbol.slice(0, 2)}
            </span>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h3 className="text-white font-bold text-sm leading-tight truncate">
                {stock.symbol}
              </h3>
              <span className="bg-[#A89FFF]/20 text-[#A89FFF] text-[9px] font-bold px-1.5 py-0.2 rounded flex items-center gap-0.5">
                <Globe className="w-2.5 h-2.5" />
                US
              </span>
              <span
                className={`text-[9px] font-bold px-1.5 py-0.2 rounded border ${
                  stock.isLive === false
                    ? 'bg-[#FFB86B]/15 border-[#FFB86B]/40 text-[#FFB86B]'
                    : 'bg-[#7EE0B5]/15 border-[#7EE0B5]/40 text-[#7EE0B5]'
                }`}
                title={stock.updatedAt ? `อัปเดต: ${stock.updatedAt}` : stock.isLive === false ? 'ราคาล่าสุดที่ดึงได้ (ตลาดปิด/ออฟไลน์)' : 'ราคา live'}
              >
                {stock.isLive === false ? '○ STALE' : '● LIVE'}
              </span>
            </div>
            <p className="text-[#A7A4B8] text-[11px] mt-0.5 truncate">
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
                isPositive ? 'text-[#7EE0B5]' : 'text-[#FFB86B]'
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
                ? 'bg-[#A89FFF]/20 text-[#A89FFF]'
                : 'bg-[#0F1117] text-[#A7A4B8] hover:text-[#A89FFF]'
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
        <div className="flex items-center gap-1 text-[10px] text-[#A7A4B8]">
          <BarChart3 className="w-3 h-3" />
          <span>Vol: {(stock.volume / 1000000).toFixed(1)}M</span>
        </div>
        <div className="flex items-center gap-1 text-[10px] text-[#A7A4B8]">
          <Activity className="w-3 h-3" />
          <span>P/E: {stock.pe}</span>
        </div>
        <span className="text-[9px] text-[#A89FFF] bg-[#A89FFF]/10 px-1.5 py-0.5 rounded font-medium">
          {stock.sector}
        </span>
      </div>

      {/* 52-Week Range Bar */}
      <div className="mt-3 pt-3 border-t border-white/[0.07]/60">
        <div className="flex items-center justify-between text-[10px] text-[#A7A4B8] mb-1">
          <span>52W Low: {currencyPrefix}{(stock.low52w * multiplier).toLocaleString()}</span>
          <span>52W High: {currencyPrefix}{(stock.high52w * multiplier).toLocaleString()}</span>
        </div>
        <div className="w-full h-1.5 bg-[#0F1117] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#FFB86B] via-[#FFB86B] to-[#7EE0B5]"
            style={{
              width: `${Math.min(100, Math.max(0, ((stock.price - stock.low52w) / (stock.high52w - stock.low52w)) * 100))}%`,
            }}
          />
        </div>
      </div>

      {/* Signal Badge */}
      {signal && (
        <div className="flex items-center justify-between flex-wrap gap-2 mt-3 pt-3 border-t border-white/[0.07]/60">
          <div className="flex items-center gap-2">
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                signal.type === 'LONG'
                  ? 'bg-[#7EE0B5]/20 text-[#7EE0B5]'
                  : 'bg-[#FFB86B]/20 text-[#FFB86B]'
              }`}
            >
              {signal.type === 'LONG' ? 'LONG สะสม' : 'SHORT ขาย'}
            </span>
            <span className="text-[10px] text-[#A7A4B8]">
              ความน่าจะเป็น {signal.probability}%
            </span>
          </div>
          <span className="text-[10px] text-[#A7A4B8]">
            SL: {currencyPrefix}{(signal.sl * multiplier).toFixed(2)} • TP: {currencyPrefix}{(signal.tp * multiplier).toFixed(2)}
          </span>
        </div>
      )}
    </div>
  );
};
