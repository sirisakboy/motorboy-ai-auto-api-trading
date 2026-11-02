import React from 'react';
import { CryptoCoin } from '../types';

interface TickerBarProps {
  coins: CryptoCoin[];
  useThb: boolean;
  usdThbRate?: number;
}

export const TickerBar: React.FC<TickerBarProps> = ({ coins, useThb, usdThbRate = 36.45 }) => {
  const currencyPrefix = useThb ? '฿' : '$';
  const multiplier = useThb ? usdThbRate : 1;

  return (
    <div className="w-full bg-[#141721]/95 border-b border-[#252A3A] select-none">
      <div className="max-w-7xl mx-auto px-4 h-9 flex items-center overflow-x-auto [no-scrollbar::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] gap-4 sm:gap-6 text-xs">
        {coins.slice(0, 6).map((coin, index) => {
          const displayPrice = (coin.price * multiplier).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          });
          const isPositive = coin.change >= 0;

          return (
            <div key={coin.id} className="flex items-center gap-4 sm:gap-6 shrink-0">
              <div className="flex items-center gap-2">
                <span className="font-bold text-white tracking-tight">{coin.symbol}</span>
                <span className="font-medium text-[#E2E8F0] tabular-nums">
                  {currencyPrefix}{displayPrice}
                </span>
                <span
                  className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-semibold tabular-nums ${
                    isPositive
                      ? 'bg-[#22C55E]/15 text-[#4ADE80]'
                      : 'bg-[#f9df7b]/15 text-[#f9df7b]'
                  }`}
                >
                  {isPositive ? '+' : ''}
                  {coin.change.toFixed(2)}%
                </span>
              </div>
              {index < Math.min(coins.length, 6) - 1 && (
                <span className="text-[#374151] select-none text-[10px]" aria-hidden="true">
                  •
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
