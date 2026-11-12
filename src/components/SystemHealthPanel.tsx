import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { ApiStatusState } from '../types';
import { ApiStatusCard } from './ApiStatusCard';

interface SystemHealthPanelProps {
  status: ApiStatusState;
  onRefresh: () => void;
  /** เปิดรายละเอียดค้างไว้ตั้งแต่แรก (ปกติพับไว้เพื่อลดความรกของ sidebar) */
  defaultOpen?: boolean;
}

/** ค่าที่ถือว่า "ทำงานปกติ" / "สำรอง" — ต้องตรงกับ ApiStatusCard */
const HEALTHY_STATES = ['LIVE', 'ONLINE'];
const FALLBACK_STATES = ['FALLBACK', 'CURATED', 'STALE'];

/**
 * ห่อ ApiStatusCard ไว้ในแท็บพับได้ "🔧 System Health"
 * - พับไว้เป็นค่าเริ่มต้น: sidebar ไม่ถูกกินพื้นที่ด้วยรายละเอียด 6 บริการ
 * - หัวแท็บแสดงสรุปสุขภาพระบบเสมอ แม้พับอยู่ (ไม่ต้องกดเข้าไปดู)
 * - ไม่แก้สไตล์ภายใน ApiStatusCard เดิม (คงสถานะ/ปุ่ม refresh เดิมทั้งหมด)
 */
export const SystemHealthPanel: React.FC<SystemHealthPanelProps> = ({
  status,
  onRefresh,
  defaultOpen = false,
}) => {
  const [open, setOpen] = useState<boolean>(defaultOpen);

  const states = [
    status.binanceWs,
    status.coinGecko,
    status.forex,
    status.stocks,
    status.news,
    status.signals,
  ];

  const liveCount = states.filter((s) => HEALTHY_STATES.includes(s)).length;
  const fallbackCount = states.filter((s) => FALLBACK_STATES.includes(s)).length;
  const totalCount = states.length;

  // ระดับสุขภาพ: ปกติ / ทำงานแบบสำรอง / มีบริการล่ม
  const tone: 'ok' | 'fallback' | 'down' =
    liveCount === totalCount ? 'ok' : liveCount + fallbackCount === totalCount ? 'fallback' : 'down';

  const toneClass =
    tone === 'ok'
      ? 'bg-[#7EE0B5]/15 border-[#7EE0B5]/40 text-[#7EE0B5]'
      : 'bg-[#FFB86B]/15 border-[#FFB86B]/40 text-[#FFB86B]';

  const summary =
    tone === 'ok'
      ? `${liveCount}/${totalCount} LIVE`
      : tone === 'fallback'
      ? `${liveCount}/${totalCount} LIVE • ${fallbackCount} สำรอง`
      : `${liveCount}/${totalCount} LIVE • มีบริการล่ม`;

  const panelId = 'system-health-panel';
  const isChecking = Boolean(status.isChecking);

  return (
    <section className="w-full" data-testid="system-health-panel">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="w-full flex items-center justify-between gap-2 rounded-[16px] bg-[#141725] border border-white/[0.07] px-3.5 py-2.5 text-left transition-colors hover:border-[#7C6CFF]/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7C6CFF]/60"
      >
        <span className="flex items-center gap-2 min-w-0">
          <span aria-hidden="true" className="text-sm leading-none">
            🔧
          </span>
          <span className="text-white font-bold text-xs sm:text-sm tracking-tight truncate">
            System Health
          </span>
        </span>

        <span className="flex items-center gap-2 shrink-0">
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${toneClass}`}
            data-testid="system-health-summary"
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                tone === 'ok' ? 'bg-[#7EE0B5] animate-pulse' : 'bg-[#FFB86B]'
              }`}
            />
            {isChecking ? 'กำลังตรวจสอบ…' : summary}
          </span>
          {open ? (
            <ChevronUp className="w-4 h-4 text-[#A7A4B8]" aria-hidden="true" />
          ) : (
            <ChevronDown className="w-4 h-4 text-[#A7A4B8]" aria-hidden="true" />
          )}
        </span>
      </button>

      {open && (
        <div id={panelId} className="mt-2" role="region" aria-label="รายละเอียดสถานะระบบ">
          <ApiStatusCard status={status} onRefresh={onRefresh} />
        </div>
      )}
    </section>
  );
};
