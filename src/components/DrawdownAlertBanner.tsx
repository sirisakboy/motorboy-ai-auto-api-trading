import React from 'react';
import { AlertTriangle, ShieldAlert, ArrowRight, X, Volume2, VolumeX } from 'lucide-react';
import { DrawdownAsset, PortfolioDrawdownSummary } from '../types';

interface DrawdownAlertBannerProps {
  summary: PortfolioDrawdownSummary;
  breachedAssets: DrawdownAsset[];
  onOpenMonitor: () => void;
  onDismiss: () => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
}

export const DrawdownAlertBanner: React.FC<DrawdownAlertBannerProps> = ({
  summary,
  breachedAssets,
  onOpenMonitor,
  onDismiss,
  soundEnabled,
  onToggleSound,
}) => {
  if (breachedAssets.length === 0) return null;

  const isExtreme = summary.extremeCount > 0;
  const isCritical = summary.criticalCount > 0;

  const bgCls = isExtreme
    ? 'bg-gradient-to-r from-[#f9df7b]/95 via-rose-900/90 to-[#f9df7b]/95 border-[#f9df7b]/80 text-white shadow-[0_0_20px_rgba(239,68,68,0.35)]'
    : isCritical
    ? 'bg-gradient-to-r from-[#f9df7b]/90 via-[#f9df7b]/90 to-[#f9df7b]/90 border-[#f9df7b]/60 text-white shadow-[0_0_15px_rgba(239,68,68,0.25)]'
    : 'bg-gradient-to-r from-amber-950/90 via-amber-900/80 to-amber-950/90 border-amber-500/60 text-amber-100';

  return (
    <div className={`w-full border-b transition-all duration-300 relative z-20 ${bgCls}`}>
      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-2 sm:py-2.5 flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap">
        {/* Left: Icon & Alert Message */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`p-1.5 rounded-lg shrink-0 ${isExtreme ? 'bg-[#f9df7b] text-black animate-pulse' : 'bg-[#f9df7b]/20 text-[#f9df7b]'}`}>
            {isExtreme ? <ShieldAlert className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          </div>
          <div className="text-xs leading-snug truncate">
            <span className="font-bold tracking-wide mr-1.5 uppercase font-mono">
              {isExtreme ? '🛑 เบรกก่อนจิ! [KILL SWITCH EXTREME]' : isCritical ? '🛑 เบรกก่อนจิ! [KILL SWITCH CRITICAL]' : '⚡ MOTORBOY RISK WARNING'}:
            </span>
            <span className="text-slate-200 hidden md:inline">
              ตรวจพบ {breachedAssets.length} สินทรัพย์ย่อตัวหลุดเกณฑ์ความเสี่ยง (Drawdown &gt; 5%) สั่งตัดความเสี่ยงทันที
            </span>
            <span className="text-slate-300 font-mono ml-1.5">
              [{breachedAssets.slice(0, 3).map((a) => `${a.symbol} ${a.currentDrawdownPct}%`).join(', ')}
              {breachedAssets.length > 3 ? ` +${breachedAssets.length - 3}` : ''}]
            </span>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1.5 shrink-0 ml-auto">
          <button
            type="button"
            onClick={onToggleSound}
            className="p-1 rounded-md hover:bg-white/10 text-slate-300 hover:text-white transition-colors"
            title={soundEnabled ? 'ปิดเสียงเตือน' : 'เปิดเสียงเตือน'}
            aria-label="สลับเสียงแจ้งเตือน"
          >
            {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5 text-slate-500" />}
          </button>

          <button
            type="button"
            onClick={onOpenMonitor}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold font-mono inline-flex items-center gap-1 transition-all shadow-xs cursor-pointer ${
              isExtreme
                ? 'bg-[#f9df7b] hover:bg-[#f9df7b] text-black font-extrabold animate-bounce'
                : 'bg-white/15 hover:bg-white/25 text-white border border-white/20'
            }`}
          >
            <span>ตรวจสอบ Drawdown</span>
            <ArrowRight className="w-3 h-3" />
          </button>

          <button
            type="button"
            onClick={onDismiss}
            className="p-1 rounded-md hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer"
            aria-label="ปิดการแจ้งเตือนชั่วคราว"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
