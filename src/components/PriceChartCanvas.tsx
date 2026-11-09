import React, { useRef, useEffect, useState } from 'react';
import { ChartData } from '../types';

interface PriceChartCanvasProps {
  chartData: ChartData | null;
  isLoading: boolean;
  assetSymbol?: string;
  useThb?: boolean;
  usdThbRate?: number;
}

export const PriceChartCanvas: React.FC<PriceChartCanvasProps> = ({
  chartData,
  isLoading,
  assetSymbol = 'BTC',
  useThb = false,
  usdThbRate = 36.45,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const handleResize = () => {
      setDimensions({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isThai =
    assetSymbol === 'SET' ||
    assetSymbol.includes('THB') ||
    assetSymbol.endsWith('.BK') ||
    ['PTT', 'KBANK', 'AOT', 'CPALL', 'DELTA', 'SCC', 'BH', 'TRUE', 'SCB', 'BDMS', 'PTTEP', 'ADVANC', 'GULF'].includes(assetSymbol);
  const multiplier = useThb && !isThai ? usdThbRate : 1;
  const currencySymbol = useThb || isThai ? '฿' : '$';

  const formatVal = (v: number) => {
    if (v === undefined || v === null || isNaN(v)) return '0.00';
    const converted = v * multiplier;
    const decimals = converted < 10 ? 4 : 2;
    return `${currencySymbol}${converted.toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })}`;
  };

  const scaledPrices = chartData?.prices.map((p) => p * multiplier) || [];
  const scaledEma20 = chartData?.ema20.map((p) => p * multiplier) || [];
  const scaledEma50 = chartData?.ema50.map((p) => p * multiplier) || [];
  const scaledSupport = chartData?.support ? chartData.support * multiplier : undefined;
  const scaledResistance = chartData?.resistance ? chartData.resistance * multiplier : undefined;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || scaledPrices.length === 0 || isLoading) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle high DPI
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const pad = 16;

    ctx.clearRect(0, 0, w, h);

    const allVals = [
      ...scaledPrices,
      ...scaledEma20,
      ...scaledEma50,
      ...(scaledSupport ? [scaledSupport] : []),
      ...(scaledResistance ? [scaledResistance] : []),
    ];
    const minP = Math.min(...allVals) * 0.99;
    const maxP = Math.max(...allVals) * 1.01;
    const range = maxP - minP > 0 ? maxP - minP : 1.0;

    // 1. Grid lines
    ctx.strokeStyle = '#2A2E45';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = (h * i) / 4;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // 2. Draw Support Level
    if (scaledSupport) {
      const ySup = h - ((scaledSupport - minP) / range) * (h - pad * 2) - pad;
      ctx.strokeStyle = '#10B981';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(0, ySup);
      ctx.lineTo(w, ySup);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 3. Draw Resistance Level
    if (scaledResistance) {
      const yRes = h - ((scaledResistance - minP) / range) * (h - pad * 2) - pad;
      ctx.strokeStyle = '#f9df7b';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(0, yRes);
      ctx.lineTo(w, yRes);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 4. Draw Curves Helper
    const drawCurve = (data: number[], strokeColor: string, lineWidth: number) => {
      if (data.length < 2) return;
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();

      data.forEach((val, idx) => {
        const x = (idx / (data.length - 1)) * w;
        const y = h - ((val - minP) / range) * (h - pad * 2) - pad;
        if (idx === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();
    };

    drawCurve(scaledEma50, '#6366F1', 2.0);
    drawCurve(scaledEma20, '#A5B4FC', 2.0);
    drawCurve(scaledPrices, '#22C55E', 2.5);

    // 5. Draw Tooltip
    if (hoveredIdx !== null && hoveredIdx >= 0 && hoveredIdx < scaledPrices.length) {
      const x = (hoveredIdx / (scaledPrices.length - 1)) * w;
      const price = scaledPrices[hoveredIdx];
      const y = h - ((price - minP) / range) * (h - pad * 2) - pad;

      ctx.strokeStyle = '#A5B4FC';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#22C55E';
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      const tooltipText = formatVal(chartData!.prices[hoveredIdx]);
      const boxW = Math.max(80, tooltipText.length * 8);
      const boxX = Math.min(Math.max(10, x - boxW / 2), w - boxW - 10);
      const boxY = y > 45 ? y - 36 : y + 15;

      ctx.fillStyle = '#1A1D29';
      ctx.strokeStyle = '#7C6CFF';
      ctx.lineWidth = 1;
      ctx.fillRect(boxX, boxY, boxW, 24);
      ctx.strokeRect(boxX, boxY, boxW, 24);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(tooltipText, boxX + boxW / 2, boxY + 16);
    }
  }, [chartData, isLoading, hoveredIdx, dimensions, multiplier, useThb, usdThbRate]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!chartData || chartData.prices.length === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const idx = Math.round((x / rect.width) * (chartData.prices.length - 1));
    setHoveredIdx(idx);
  };

  const handleMouseLeave = () => {
    setHoveredIdx(null);
  };

  return (
    <div className="w-full space-y-2.5">
      <div className="flex items-center justify-between text-[11px]">
        <span
          className={`font-bold px-2 py-0.5 rounded-lg border ${
            chartData?.isLive === false
              ? 'bg-[#F59E0B]/15 border-[#F59E0B]/40 text-[#FBBF24]'
              : 'bg-[#22C55E]/15 border-[#22C55E]/40 text-[#4ADE80]'
          }`}
        >
          {chartData?.isLive === false
            ? `○ ออฟไลน์${chartData?.source ? ` • ${chartData.source}` : ''} — ไม่มีข้อมูลจริง`
            : `● LIVE${chartData?.source ? ` • ${chartData.source}` : ''}`}
        </span>
        <span className="text-[#909AAB] font-mono text-[10px]">
          {chartData?.source ? `${chartData.source} 1D Closes` : assetSymbol.includes('/') ? 'Forex Daily Closes' : '1D Closes'} ({currencySymbol})
        </span>
      </div>

      {chartData && (chartData.support || chartData.resistance) && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 bg-[#0F1117] border border-[#2A2E45] rounded-xl px-3 py-2 text-xs">
          <div className="flex items-center space-x-2">
            <span className="text-[#9CA3AF] text-[11px]">การวิเคราะห์กรอบราคา 1000 วัน ({currencySymbol}):</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {chartData.support && (
              <div className="flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-[#10B981]" />
                <span className="text-[#9CA3AF] text-[11px]">แนวรับ (Support):</span>
                <span className="text-[#34D399] font-mono font-bold">
                  {formatVal(chartData.support)}
                </span>
              </div>
            )}
            {chartData.resistance && (
              <div className="flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-[#f9df7b]" />
                <span className="text-[#9CA3AF] text-[11px]">แนวต้าน (Resistance):</span>
                <span className="text-[#f9df7b] font-mono font-bold">
                  {formatVal(chartData.resistance)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="w-full h-[210px] bg-[#131620] rounded-[14px] border border-[#2A2E45] p-2 relative flex items-center justify-center overflow-hidden">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center space-y-2">
            <div className="w-8 h-8 border-2 border-[#7C6CFF] border-t-transparent rounded-full animate-spin" />
            <span className="text-xs text-[#9CA3AF]">กำลังโหลดข้อมูลกราฟ 1000 วัน...</span>
          </div>
        ) : chartData && chartData.prices.length > 0 ? (
          <canvas
            ref={canvasRef}
            className="w-full h-full block cursor-crosshair"
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
          />
        ) : (
          <span className="text-xs text-[#909AAB]">
            {chartData?.isLive === false
              ? 'ดึงประวัติย้อนหลังไม่สำเร็จ (ออฟไลน์) — จะลองใหม่เมื่อเปลี่ยนสินทรัพย์'
              : 'เลือกสินทรัพย์เพื่อดูกราฟ 1000 วัน'}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between text-[11px] text-[#9CA3AF] gap-2">
        <div className="flex items-center space-x-3 sm:space-x-4">
          <div className="flex items-center space-x-1.5">
            <span className="w-2.5 h-1 bg-[#22C55E] rounded-xs inline-block" />
            <span className="font-medium text-white">ราคา Price</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="w-2.5 h-1 bg-[#A5B4FC] rounded-xs inline-block" />
            <span className="font-medium">EMA 20</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="w-2.5 h-1 bg-[#6366F1] rounded-xs inline-block" />
            <span className="font-medium">EMA 50</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="w-2.5 h-0.5 border-b-2 border-dashed border-[#10B981] inline-block" />
            <span className="font-medium text-[#34D399]">แนวรับ</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="w-2.5 h-0.5 border-b-2 border-dashed border-[#f9df7b] inline-block" />
            <span className="font-medium text-[#f9df7b]">แนวต้าน</span>
          </div>
        </div>

        <span className="text-[#909AAB] font-mono text-[10px]">
          {chartData?.source ? `${chartData.source} Daily Candles & Pivots` : assetSymbol.includes('/') ? 'Forex Daily Candles & Pivots' : '1D Candles & Pivots'} • {currencySymbol}
        </span>
      </div>
    </div>
  );
};
