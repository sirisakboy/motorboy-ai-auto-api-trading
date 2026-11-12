import React from 'react';
import { Star, TrendingDown, TrendingUp } from 'lucide-react';
import { formatPercent, formatAsOf, formatAsOfLabel } from '../../utils';

export type StockAccent = 'amber' | 'lavender';

/**
 * Accent tokens per market — the only thing that differed visually between the
 * SET card (amber) and the US card (lavender).
 */
const ACCENT: Record<
  StockAccent,
  {
    avatar: string;
    avatarText: string;
    badge: string;
    badgeLayout: string;
    hover: string;
    star: string;
    starIdle: string;
    sector: string;
  }
> = {
  amber: {
    avatar:
      'bg-gradient-to-br from-[#FFB86B]/20 to-[#F97316]/20 border border-[#FFB86B]/30',
    avatarText: 'text-[#FFB86B]',
    badge: 'bg-[#FFB86B]/20 text-[#FFB86B]',
    badgeLayout: '',
    hover: 'hover:border-[#FFB86B]/50',
    star: 'bg-[#FFB86B]/20 text-[#FFB86B]',
    starIdle: 'bg-[#0F1117] text-[#A7A4B8] hover:text-[#FFB86B]',
    sector: 'text-[#FFB86B] bg-[#FFB86B]/10',
  },
  lavender: {
    avatar:
      'bg-gradient-to-br from-[#A89FFF]/20 to-[#8B5CF6]/20 border border-[#A89FFF]/30',
    avatarText: 'text-[#A89FFF]',
    badge: 'bg-[#A89FFF]/20 text-[#A89FFF]',
    badgeLayout: 'flex items-center gap-0.5',
    hover: 'hover:border-[#A89FFF]/50',
    star: 'bg-[#A89FFF]/20 text-[#A89FFF]',
    starIdle: 'bg-[#0F1117] text-[#A7A4B8] hover:text-[#A89FFF]',
    sector: 'text-[#A89FFF] bg-[#A89FFF]/10',
  },
};

export interface StockCardStat {
  icon: React.ReactNode;
  label: string;
}

export interface StockCardSignalView {
  type: 'LONG' | 'SHORT';
  probability: number;
  slText: string;
  tpText: string;
}

export interface StockCardView {
  symbol: string;
  /** secondary line under the ticker */
  name: string;
  accent: StockAccent;
  /** market chip label, e.g. `SET50` or `US` */
  badgeLabel: string;
  badgeIcon?: React.ReactNode;
  priceText: string;
  change: number;
  isLive?: boolean;
  updatedAt?: string;
  stats: StockCardStat[];
  sector: string;
  range?: { lowText: string; highText: string; pct: number };
  signal?: StockCardSignalView;
  isWatchlisted: boolean;
  onToggleWatchlist: () => void;
  onSelect: () => void;
}

/**
 * Shared shell for `ThaiStockCard` and `ForeignStockCard`.
 *
 * The two cards were the same markup twice (header, live/stale pill, price,
 * watchlist star, stats row, optional 52-week bar, signal footer) and differed
 * only in accent colour, currency and which optional rows were shown. Each card
 * now just computes its numbers and hands a `StockCardView` to this shell, so a
 * layout or a11y fix only has to be made once.
 */
export const StockCardShell: React.FC<StockCardView> = ({
  symbol,
  name,
  accent,
  badgeLabel,
  badgeIcon,
  priceText,
  change,
  isLive,
  updatedAt,
  stats,
  sector,
  range,
  signal,
  isWatchlisted,
  onToggleWatchlist,
  onSelect,
}) => {
  const tone = ACCENT[accent];
  const isPositive = change >= 0;
  const asOfLabel = isLive === false ? formatAsOfLabel(updatedAt) : '';
  const liveTitle = isLive === false
    ? asOfLabel
      ? `ข้อมูล ณ ${formatAsOf(updatedAt)} — ไม่ใช่ราคาสด (ตลาดปิด/ออฟไลน์)`
      : 'ราคาล่าสุดที่ดึงได้ (ตลาดปิด/ออฟไลน์)'
    : 'ราคา live';

  return (
    <div
      onClick={onSelect}
      className={`w-full rounded-[18px] bg-[#141725] border border-white/[0.07] p-4 transition-all duration-150 active:scale-[0.99] ${tone.hover} cursor-pointer`}
    >
      <div className="flex flex-wrap sm:flex-nowrap items-start sm:items-center justify-between gap-2">
        {/* Left: Symbol + Name */}
        <div className="flex items-center space-x-3 min-w-0">
          <div
            className={`w-10 h-10 shrink-0 rounded-xl ${tone.avatar} flex items-center justify-center`}
          >
            <span className={`${tone.avatarText} text-xs font-black`}>
              {symbol.slice(0, 2)}
            </span>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h3 className="text-white font-bold text-sm leading-tight truncate">
                {symbol}
              </h3>
              <span
                className={`${tone.badge} text-[9px] font-bold px-1.5 py-0.2 rounded ${tone.badgeLayout}`}
              >
                {badgeIcon}
                {badgeLabel}
              </span>
              {/* colour never carries the meaning alone — the pill spells LIVE / STALE out */}
              <span
                className={`text-[9px] font-bold px-1.5 py-0.2 rounded border ${
                  isLive === false
                    ? 'bg-[#FFB86B]/15 border-[#FFB86B]/40 text-[#FFB86B]'
                    : 'bg-[#7EE0B5]/15 border-[#7EE0B5]/40 text-[#7EE0B5]'
                }`}
                title={liveTitle}
              >
                {isLive === false ? '○ STALE' : '● LIVE'}
              </span>
            </div>
            <p className="text-[#A7A4B8] text-[11px] mt-0.5 truncate">{name}</p>
            {/* ข้อมูลที่ไม่ใช่ราคาสดต้องบอกเวลาอ้างอิงเสมอ */}
            {asOfLabel && (
              <p
                className="text-[9px] text-[#8E8BA3] mt-0.5 tabular-nums"
                data-testid={`as-of-${symbol}`}
                title={`ข้อมูล ณ ${formatAsOf(updatedAt)} (ไม่ใช่ราคาสด)`}
              >
                {asOfLabel}
              </p>
            )}
          </div>
        </div>

        {/* Right: Price + Change + Watchlist */}
        <div className="text-right shrink-0 flex items-center gap-3">
          <div>
            <div className="text-white font-black text-lg tabular-nums">{priceText}</div>
            <div
              className={`text-sm font-extrabold flex items-center justify-end gap-1 ${
                isPositive ? 'text-[#7EE0B5]' : 'text-[#FFB86B]'
              }`}
            >
              {isPositive ? (
                <TrendingUp className="w-3.5 h-3.5" aria-hidden="true" />
              ) : (
                <TrendingDown className="w-3.5 h-3.5" aria-hidden="true" />
              )}
              {formatPercent(change)}
            </div>
          </div>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onToggleWatchlist();
            }}
            aria-pressed={isWatchlisted}
            aria-label={
              isWatchlisted ? `ลบ ${symbol} ออกจากรายการ` : `เพิ่ม ${symbol} ลง Watchlist`
            }
            title={isWatchlisted ? 'ลบออกจากรายการ' : 'เพิ่มลง Watchlist'}
            className={`p-1.5 rounded-lg transition-colors ${
              isWatchlisted ? tone.star : tone.starIdle
            }`}
          >
            <Star className="w-4 h-4" fill={isWatchlisted ? 'currentColor' : 'none'} />
          </button>
        </div>
      </div>

      {/* Info Row */}
      <div className="flex items-center gap-3 mt-3 flex-wrap">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="flex items-center gap-1 text-[10px] text-[#A7A4B8] tabular-nums"
          >
            {stat.icon}
            <span>{stat.label}</span>
          </div>
        ))}
        <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${tone.sector}`}>
          {sector}
        </span>
      </div>

      {/* Optional 52-week range bar */}
      {range && (
        <div className="mt-3 pt-3 border-t border-white/[0.07]/60">
          <div className="flex items-center justify-between text-[10px] text-[#A7A4B8] mb-1 tabular-nums">
            <span>52W Low: {range.lowText}</span>
            <span>52W High: {range.highText}</span>
          </div>
          <div className="w-full h-1.5 bg-[#0F1117] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#FFB86B] via-[#FFB86B] to-[#7EE0B5]"
              style={{ width: `${Math.min(100, Math.max(0, range.pct))}%` }}
            />
          </div>
        </div>
      )}

      {/* Optional signal badge */}
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
          <span className="text-[10px] text-[#A7A4B8] tabular-nums">
            SL: {signal.slText} • TP: {signal.tpText}
          </span>
        </div>
      )}
    </div>
  );
};
