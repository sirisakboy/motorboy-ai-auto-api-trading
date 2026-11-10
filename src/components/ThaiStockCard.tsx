import React from 'react';
import { BarChart3, Clock, Shield } from 'lucide-react';
import { ThaiStock, TradingSignal } from '../types';
import { StockCardShell } from './stocks/StockCardShell';
import { formatCompact, formatNumber } from '../utils';

interface ThaiStockCardProps {
  stock: ThaiStock;
  signal?: TradingSignal;
  isWatchlisted: boolean;
  onToggleWatchlist: (symbol: string) => void;
  onSelect: () => void;
}

/**
 * SET card. Layout lives in `StockCardShell` (shared with the foreign card);
 * this file only decides what the Thai numbers are.
 */
export const ThaiStockCard: React.FC<ThaiStockCardProps> = ({
  stock,
  signal,
  isWatchlisted,
  onToggleWatchlist,
  onSelect,
}) => (
  <StockCardShell
    symbol={stock.symbol}
    name={`${stock.name} (${stock.nameEn})`}
    accent="amber"
    badgeLabel="SET50"
    priceText={`฿${formatNumber(stock.price)}`}
    change={stock.change}
    isLive={stock.isLive}
    updatedAt={stock.updatedAt}
    isWatchlisted={isWatchlisted}
    onToggleWatchlist={() => onToggleWatchlist(stock.symbol)}
    onSelect={onSelect}
    sector={stock.sector}
    stats={[
      { icon: <BarChart3 className="w-3 h-3" aria-hidden="true" />, label: `Vol: ${formatCompact(stock.volume)}` },
      { icon: <Shield className="w-3 h-3" aria-hidden="true" />, label: `P/E: ${stock.pe}` },
      { icon: <Clock className="w-3 h-3" aria-hidden="true" />, label: `Div: ${stock.dividendYield}%` },
    ]}
    signal={
      signal
        ? {
            type: signal.type,
            probability: signal.probability,
            slText: `฿${formatNumber(signal.sl)}`,
            tpText: `฿${formatNumber(signal.tp)}`,
          }
        : undefined
    }
  />
);
