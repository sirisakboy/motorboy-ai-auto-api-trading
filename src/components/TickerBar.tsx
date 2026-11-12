import React from 'react';
import { CryptoCoin } from '../types';
import { formatCryptoPrice } from '../utils';

interface TickerBarProps {
  coins: CryptoCoin[];
  useThb: boolean;
  usdThbRate?: number;
}

export const TickerBar: React.FC<TickerBarProps> = ({ coins, useThb, usdThbRate = 36.45 }) => {
  const priceMode = useThb ? 'THB' : 'USD';

  return (
    <div className="w-full bg-[#0F1117]/95 border-b border-white/[0.07] select-none">
      <div className="max-w-7xl mx-auto px-4 h-9 flex items-center overflow-x-auto [no-scrollbar::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] gap-4 sm:gap-6 text-xs">
        {coins.slice(0, 6).map((coin, index) => {
          // ทศนิยมตามขนาดราคา — SHIB ต้องไม่กลายเป็น $0.00 ในแถบวิ่ง
          const displayPrice = formatCryptoPrice({
            price: coin.price,
            mode: priceMode,
            usdThbRate,
          });
          const isPositive = coin.change >= 0;

          return (
            <div key={coin.id} className="flex items-center gap-4 sm:gap-6 shrink-0">
              <div className="flex items-center gap-2">
                <span className="font-bold text-white tracking-tight">{coin.symbol}</span>
                <span className="font-medium text-[#ECEAF4] tabular-nums">
                  {displayPrice}
                </span>
                <span
                  className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-semibold tabular-nums ${
                    isPositive
                      ? 'bg-[#7EE0B5]/15 text-[#7EE0B5]'
                      : 'bg-[#FFB86B]/15 text-[#FFB86B]'
                  }`}
                >
                  {isPositive ? '+' : ''}
                  {coin.change.toFixed(2)}%
                </span>
              </div>
              {index < Math.min(coins.length, 6) - 1 && (
                <span className="text-[#5B6478] select-none text-[10px]" aria-hidden="true">
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
