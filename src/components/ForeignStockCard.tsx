import React from 'react';
import { Activity, BarChart3, Globe } from 'lucide-react';
import { ForeignStock, TradingSignal } from '../types';
import { StockCardShell } from './stocks/StockCardShell';
import { formatCompact, formatNumber } from '../utils';

interface ForeignStockCardProps {
  stock: ForeignStock;
  signal?: TradingSignal;
  isWatchlisted: boolean;
  onToggleWatchlist: (symbol: string) => void;
  onSelect: () => void;
  useThb?: boolean;
  usdThbRate?: number;
}

/**
 * US card — same shell as the SET card, different currency and an extra
 * 52-week range bar.
 */
export const ForeignStockCard: React.FC<ForeignStockCardProps> = ({
  stock,
  signal,
  isWatchlisted,
  onToggleWatchlist,
  onSelect,
  useThb = false,
  usdThbRate = 36.45,
}) => {
  const multiplier = useThb ? usdThbRate : 1;
  const prefix = useThb ? '฿' : '$';
  const money = (value: number) => `${prefix}${formatNumber(value * multiplier)}`;
  const rangeSpan = stock.high52w - stock.low52w;
  const rangePct = rangeSpan > 0 ? ((stock.price - stock.low52w) / rangeSpan) * 100 : 0;

  return (
    <StockCardShell
      symbol={stock.symbol}
      name={stock.name}
      accent="lavender"
      badgeLabel="US"
      badgeIcon={<Globe className="w-2.5 h-2.5" aria-hidden="true" />}
      priceText={money(stock.price)}
      change={stock.change}
      isLive={stock.isLive}
      updatedAt={stock.updatedAt}
      isWatchlisted={isWatchlisted}
      onToggleWatchlist={() => onToggleWatchlist(stock.symbol)}
      onSelect={onSelect}
      sector={stock.sector}
      stats={[
        { icon: <BarChart3 className="w-3 h-3" aria-hidden="true" />, label: `Vol: ${formatCompact(stock.volume)}` },
        { icon: <Activity className="w-3 h-3" aria-hidden="true" />, label: `P/E: ${stock.pe}` },
      ]}
      range={{
        lowText: `${prefix}${formatNumber(stock.low52w * multiplier, 0)}`,
        highText: `${prefix}${formatNumber(stock.high52w * multiplier, 0)}`,
        pct: rangePct,
      }}
      signal={
        signal
          ? {
              type: signal.type,
              probability: signal.probability,
              slText: money(signal.sl),
              tpText: money(signal.tp),
            }
          : undefined
      }
    />
  );
};
