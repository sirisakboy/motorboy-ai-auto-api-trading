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

/**
 * Calm Notice (Brand Book v2.0, component 04).
 *
 * The book replaces the old "DrawdownAlertBanner แดงเต็มกว้าง" with a thin
 * peach–lavender strip that says what happened in one sentence and offers a
 * rest button. No red gradient, no blinking, no "เบรกก่อนจิ!" alarm copy, and
 * the colour is never the only signal — there is an icon and a word.
 */
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

  // พีช = ระวัง, อำพัน = ต้องดูให้ดี — ทั้งคู่เป็นโทนอ่อน ไม่ใช่แดงเตือนภัย
  const tone = isExtreme
    ? 'border-[#F4A6A6]/40 bg-[linear-gradient(135deg,rgba(244,166,166,0.16),rgba(124,108,255,0.12))]'
    : isCritical
      ? 'border-[#FFB86B]/40 bg-[linear-gradient(135deg,rgba(255,184,107,0.14),rgba(124,108,255,0.1))]'
      : 'border-[#7C6CFF]/35 bg-[linear-gradient(135deg,rgba(124,108,255,0.12),rgba(76,201,240,0.08))]';

  const headline = isExtreme
    ? 'พอร์ตย่อตัวแรงกว่าปกติ'
    : isCritical
      ? 'พอร์ตย่อตัวลงพอสมควร'
      : 'พอร์ตย่อตัวลงนิดหน่อย';

  return (
    <div className={`w-full border-b ${tone} text-[#ECEAF4] relative z-20`}>
      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-2 sm:py-2.5 flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap">
        {/* Left: icon + one calm line */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-1.5 rounded-lg shrink-0 bg-[#F4A6A6]/15 text-[#F4A6A6]">
            {isExtreme ? <ShieldAlert className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          </div>
          <div className="text-xs leading-snug truncate">
            <span className="font-semibold mr-1.5">{headline}:</span>
            <span className="text-[#A7A4B8]">
              {breachedAssets.length} ตัวลงเกินเกณฑ์ เทียบ “จุดพีคที่คุณบันทึกไว้” — พักสักครู่ไหมครับ
            </span>
            <span className="text-[#A7A4B8] font-mono ml-1.5 tabular-nums">
              [{breachedAssets.slice(0, 3).map((a) => `${a.symbol} ${a.currentDrawdownPct}%`).join(', ')}
              {breachedAssets.length > 3 ? ` +${breachedAssets.length - 3}` : ''}]
            </span>
          </div>
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-1.5 shrink-0 ml-auto">
          <button
            type="button"
            onClick={onToggleSound}
            className="p-1 rounded-md hover:bg-white/[0.07] text-[#A7A4B8] hover:text-[#ECEAF4] transition-colors"
            title={soundEnabled ? 'ปิดเสียงเตือน' : 'เปิดเสียงเตือน'}
            aria-label="สลับเสียงแจ้งเตือน"
          >
            {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5 text-[#8B88A0]" />}
          </button>

          <button
            type="button"
            onClick={onOpenMonitor}
            className="px-2.5 py-1 rounded-xl text-xs font-semibold inline-flex items-center gap-1 bg-[#222640] border border-white/[0.07] text-[#ECEAF4] hover:bg-[#2A3050] transition-colors cursor-pointer"
          >
            <span>ดูรายละเอียด</span>
            <ArrowRight className="w-3 h-3" />
          </button>

          <button
            type="button"
            onClick={onDismiss}
            className="p-1 rounded-md hover:bg-white/[0.07] text-[#8B88A0] hover:text-[#ECEAF4] transition-colors cursor-pointer"
            aria-label="ปิดการแจ้งเตือนชั่วคราว"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
