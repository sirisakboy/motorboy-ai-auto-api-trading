import React from 'react';
import { MarketHoursInfo } from '../types';

interface MarketHoursCardProps {
  marketHours: MarketHoursInfo;
}

export const MarketHoursCard: React.FC<MarketHoursCardProps> = ({ marketHours }) => {
  return (
    <div className="w-full rounded-[18px] bg-[#1A1D29] border border-[#252A3A] p-4">
      <h3 className="text-white font-bold text-sm">
        สถานะตลาด • Market Hours Engine
      </h3>

      <div className="mt-3 space-y-2">
        {/* SET Thai */}
        <MarketRow
          title="SET ไทย"
          subtitle="จ-ศ 10:00-12:30, 14:30-16:30 ICT"
          isOpen={marketHours.setStatus === 'OPEN'}
        />

        {/* Forex */}
        <MarketRow
          title="Forex 24h"
          subtitle="ปิด เสาร์เช้า-อาทิตย์เช้า"
          isOpen={marketHours.forexStatus === 'OPEN'}
        />

        {/* Crypto */}
        <MarketRow
          title="Crypto"
          subtitle="24/7 ไม่มีวันหยุด"
          isOpen={true}
        />
      </div>

      <div className="mt-3 flex items-center justify-between text-xs pt-1 border-t border-[#252A3A]/40">
        <span className="text-[#A5B4FC] font-medium text-[11px]">
          {marketHours.countdown}
        </span>
        <span className="text-[#909AAB] text-[10px]">
          {marketHours.timestamp}
        </span>
      </div>
    </div>
  );
};

interface MarketRowProps {
  title: string;
  subtitle: string;
  isOpen: boolean;
}

const MarketRow: React.FC<MarketRowProps> = ({ title, subtitle, isOpen }) => {
  return (
    <div className="w-full rounded-xl bg-[#0F1117] border border-[#252A3A] px-3 py-2 flex items-center justify-between">
      <div>
        <h4 className="text-white text-xs font-semibold">{title}</h4>
        <p className="text-[#909AAB] text-[10px] mt-0.5">{subtitle}</p>
      </div>

      <span
        className={`px-2 py-0.5 rounded-xl text-[10px] font-bold border ${
          isOpen
            ? 'bg-[#22C55E]/15 border-[#22C55E]/40 text-[#4ADE80]'
            : 'bg-[#252A3A] border-[#252A3A] text-[#9CA3AF]'
        }`}
      >
        {isOpen ? '● OPEN' : '○ CLOSED'}
      </span>
    </div>
  );
};
