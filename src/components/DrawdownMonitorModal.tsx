import React, { useState, useMemo } from 'react';
import {
  X,
  TrendingDown,
  AlertTriangle,
  ShieldAlert,
  Sliders,
  Volume2,
  Copy,
  Check,
  Send,
  Edit2,
  RotateCcw,
  Sparkles,
  Search,
  ArrowUpRight,
  ShieldCheck,
  Activity,
} from 'lucide-react';
import {
  DrawdownAsset,
  DrawdownThresholds,
  PortfolioDrawdownSummary,
  DrawdownRiskStatus,
} from '../types';
import {
  saveThresholds,
  saveCustomPeak,
  playDrawdownAlertChime,
} from '../services/drawdownService';
import { useModalA11y } from '../hooks/useModalA11y';

interface DrawdownMonitorModalProps {
  isOpen: boolean;
  onClose: () => void;
  assets: DrawdownAsset[];
  summary: PortfolioDrawdownSummary;
  thresholds: DrawdownThresholds;
  onUpdateThresholds: (next: DrawdownThresholds) => void;
  onUpdateCustomPeak: (symbol: string, peak: number) => void;
  onSendReportToChat?: (reportText: string) => void;
  isDark?: boolean;
}

export const DrawdownMonitorModal: React.FC<DrawdownMonitorModalProps> = ({
  isOpen,
  onClose,
  assets,
  summary,
  thresholds,
  onUpdateThresholds,
  onUpdateCustomPeak,
  onSendReportToChat,
  isDark = true,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [stressTestDropPct, setStressTestDropPct] = useState<number>(0);
  const [copied, setCopied] = useState(false);
  const [sentToChat, setSentToChat] = useState(false);
  const [editingSymbol, setEditingSymbol] = useState<string | null>(null);
  const [customPeakInput, setCustomPeakInput] = useState<string>('');

  // Local threshold edits
  const [localWarning, setLocalWarning] = useState(thresholds.warning);
  const [localCritical, setLocalCritical] = useState(thresholds.critical);
  const [localExtreme, setLocalExtreme] = useState(thresholds.extreme);
  const [soundEnabled, setSoundEnabled] = useState(thresholds.soundEnabled);

  // Apply Stress Test multiplier if active
  const processedAssets = useMemo(() => {
    return assets.map((a) => {
      if (stressTestDropPct === 0) return a;
      const stressedPrice = +(a.currentPrice * (1 + stressTestDropPct / 100)).toFixed(
        a.currentPrice < 10 ? 4 : 2
      );
      const stressedDrawdown = a.peakPrice > 0 ? ((stressedPrice - a.peakPrice) / a.peakPrice) * 100 : 0;
      const stressedTrough = Math.min(a.troughPrice, stressedPrice);
      const stressedMaxDrawdown = a.peakPrice > 0 ? ((stressedTrough - a.peakPrice) / a.peakPrice) * 100 : stressedDrawdown;
      const stressedRecovery = stressedPrice > 0 ? ((a.peakPrice / stressedPrice) - 1) * 100 : 0;

      let status: DrawdownRiskStatus = 'NORMAL';
      if (stressedDrawdown <= thresholds.extreme) status = 'EXTREME';
      else if (stressedDrawdown <= thresholds.critical) status = 'CRITICAL';
      else if (stressedDrawdown <= thresholds.warning) status = 'WARNING';

      return {
        ...a,
        currentPrice: stressedPrice,
        currentDrawdownPct: +stressedDrawdown.toFixed(2),
        maxDrawdownPct: +stressedMaxDrawdown.toFixed(2),
        recoveryNeededPct: +stressedRecovery.toFixed(2),
        declineAmount: +(a.peakPrice - stressedPrice).toFixed(2),
        status,
      };
    });
  }, [assets, stressTestDropPct, thresholds]);

  const filteredAssets = useMemo(() => {
    return processedAssets.filter((a) => {
      const matchCat =
        selectedCategory === 'ALL' ||
        (selectedCategory === 'BREACHED' && (a.status === 'WARNING' || a.status === 'CRITICAL' || a.status === 'EXTREME')) ||
        a.category === selectedCategory;

      const q = searchQuery.trim().toLowerCase();
      const matchSearch =
        !q ||
        a.symbol.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q);

      return matchCat && matchSearch;
    });
  }, [processedAssets, selectedCategory, searchQuery]);

  const dialogRef = useModalA11y({ onClose, enabled: isOpen });
  if (!isOpen) return null;

  const handleSaveThresholdSettings = () => {
    const next: DrawdownThresholds = {
      warning: localWarning,
      critical: localCritical,
      extreme: localExtreme,
      soundEnabled,
    };
    onUpdateThresholds(next);
    saveThresholds(next);
    setShowSettings(false);
  };

  const handleTestSound = () => {
    playDrawdownAlertChime('CRITICAL');
  };

  const handleSavePeak = (symbol: string) => {
    const val = parseFloat(customPeakInput);
    if (!isNaN(val) && val > 0) {
      onUpdateCustomPeak(symbol, val);
      saveCustomPeak(symbol, val);
    }
    setEditingSymbol(null);
  };

  const generateReportText = (): string => {
    const breached = processedAssets.filter((a) => a.status !== 'NORMAL');
    const lines = [
      `📉 [DRAWDOWN MONITOR // AUDIT REPORT]`,
      `เวลาตรวจสอบ: ${new Date().toLocaleString('th-TH')}`,
      `สถานะภาพรวมพอร์ต: ${summary.portfolioStatus} (ย่อตัวเฉลี่ย: ${summary.avgDrawdownPct}%)`,
      `สินทรัพย์เกินเกณฑ์เตือน: ${breached.length} รายการ`,
      `สินทรัพย์ย่อตัวลึกสุด: ${summary.worstAssetSymbol} (${summary.worstDrawdownPct}%)`,
      ``,
      `--- รายการสินทรัพย์ที่น่าจับตามอง ---`,
      ...processedAssets.slice(0, 8).map(
        (a) =>
          `• ${a.symbol} (${a.category}): ราคา $${a.currentPrice.toLocaleString()} | จุดพีค $${a.peakPrice.toLocaleString()} | ย่อตัว ${a.currentDrawdownPct}% (ต้องการ +${a.recoveryNeededPct}% ฟื้นตัว) [สถานะ: ${a.status}]`
      ),
      ``,
      `คำแนะนำกลยุทธ์: ${summary.recommendedActionTh}`,
      `⚠️ การลงทุนมีความเสี่ยง โปรดบริหารความเสี่ยงและจำกัด Drawdown อย่างรอบคอบ`,
    ];
    return lines.join('\n');
  };

  const handleCopyReport = () => {
    navigator.clipboard.writeText(generateReportText());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendToChat = () => {
    if (onSendReportToChat) {
      onSendReportToChat(generateReportText());
      setSentToChat(true);
      setTimeout(() => setSentToChat(false), 2500);
    }
  };

  const getStatusBadge = (status: DrawdownRiskStatus) => {
    switch (status) {
      case 'EXTREME':
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold font-mono bg-[#FFB86B]/20 text-[#FFB86B] border border-[#FFB86B]/50 flex items-center gap-1 animate-pulse">
            <ShieldAlert className="w-3 h-3 text-[#FFB86B]" />
            EXTREME ({thresholds.extreme}%)
          </span>
        );
      case 'CRITICAL':
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold font-mono bg-[#F4A6A6]/15 text-[#F4A6A6] border border-rose-500/40 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 text-[#F4A6A6]" />
            CRITICAL ({thresholds.critical}%)
          </span>
        );
      case 'WARNING':
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold font-mono bg-[#FFB86B]/15 text-[#FFB86B] border border-amber-500/40 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 text-[#FFB86B]" />
            WARNING ({thresholds.warning}%)
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold font-mono bg-[#7EE0B5]/15 text-[#7EE0B5] border border-emerald-500/30 flex items-center gap-1">
            <ShieldCheck className="w-3 h-3 text-[#7EE0B5]" />
            NORMAL
          </span>
        );
    }
  };

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="ติดตาม Drawdown ของพอร์ต"
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-xs overflow-y-auto"
    >
      <div
        className={`w-full max-w-5xl rounded-2xl flex flex-col overflow-hidden border shadow-2xl max-h-[94vh] my-auto ${
          isDark ? 'bg-[#0F1117] text-white border-white/[0.07]' : 'bg-white text-[#0F1117] border-white/[0.07]'
        }`}
      >
        {/* Header */}
        <div className="px-4 sm:px-6 py-3.5 border-b border-white/[0.07]/70 flex items-center justify-between bg-gradient-to-r from-[#141725] via-[#0F1117] to-[#141725]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#FFB86B]/15 border border-[#FFB86B]/40 flex items-center justify-center text-[#FFB86B] shadow-[0_0_15px_rgba(239,68,68,0.2)]">
              <TrendingDown className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-base sm:text-lg tracking-tight">
                  <span className="bg-gradient-to-r from-[#7C6CFF] to-[#8E80FF] text-transparent bg-clip-text font-black">
                    MotorBoy
                  </span>{' '}
                  Kill Switch & Risk Guard
                </h2>
                <span className="text-[10px] font-bold font-mono px-1.5 py-0.5 rounded bg-[#7C6CFF]/20 text-[#7C6CFF] border border-[#7C6CFF]/40">
                  DRAWDOWN STOP 5%
                </span>
                {stressTestDropPct !== 0 && (
                  <span className="text-[10px] font-bold font-mono px-1.5 py-0.5 rounded bg-[#FFB86B]/20 text-[#FFB86B] border border-amber-500/40 animate-pulse">
                    STRESS TEST: {stressTestDropPct}%
                  </span>
                )}
              </div>
              <p className="text-xs text-[#A7A4B8] flex items-center gap-1">
                <span className="text-[#7C6CFF] font-bold font-mono">⚠️ เบรกก่อนจิ!</span>
                <span>— คุมความเสี่ยงสูงสุดไม่เกิน 2% ต่อไม้ และหยุดเทรดทันทีเมื่อ Drawdown เกิน 5%</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => setShowSettings((v) => !v)}
              className={`p-2 rounded-xl border text-xs font-mono font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                showSettings
                  ? 'bg-[#FFB86B]/20 border-[#FFB86B]/60 text-[#FFB86B]'
                  : 'bg-[#141725] border-white/[0.07] text-[#A7A4B8] hover:text-white'
              }`}
              title="ตั้งค่าเกณฑ์แจ้งเตือน"
            >
              <Sliders className="w-4 h-4" />
              <span className="hidden sm:inline">เกณฑ์แจ้งเตือน</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-[#A7A4B8] hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              aria-label="ปิดหน้าต่าง"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          
          {/* Threshold Settings Panel (Collapsible) */}
          {showSettings && (
            <div className="p-4 rounded-xl border border-[#FFB86B]/30 bg-[#FFB86B]/20 backdrop-blur-xs space-y-3 animate-in fade-in duration-200">
              <div className="flex items-center justify-between pb-2 border-b border-white/[0.07]">
                <div className="flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-[#FFB86B]" />
                  <span className="font-bold text-xs sm:text-sm text-[#FFB86B]">
                    กำหนดเกณฑ์การแจ้งเตือน Drawdown (Alert Thresholds)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleTestSound}
                    className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/15 border border-white/20 text-xs font-mono flex items-center gap-1 text-[#ECEAF4] cursor-pointer"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>ทดสอบเสียง</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveThresholdSettings}
                    className="px-3 py-1 rounded-lg bg-[#FFB86B] hover:bg-[#FFB86B] text-black font-bold text-xs font-mono transition-colors cursor-pointer"
                  >
                    บันทึกเกณฑ์
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Warning Slider */}
                <div className="p-3 rounded-lg bg-[#0F1117] border border-amber-500/30 space-y-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-[#FFB86B] font-bold flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" /> Warning Threshold
                    </span>
                    <span className="font-mono font-bold text-[#FFB86B]">{localWarning}%</span>
                  </div>
                  <input
                    type="range"
                    min={-25}
                    max={-5}
                    step={1}
                    value={localWarning}
                    onChange={(e) => setLocalWarning(Number(e.target.value))}
                    className="w-full accent-amber-400 cursor-pointer"
                  />
                  <p className="text-[10px] text-[#A7A4B8]">แจ้งเตือนเตือนภัยเมื่อราคาลดลงจากจุดพีค</p>
                </div>

                {/* Critical Slider */}
                <div className="p-3 rounded-lg bg-[#0F1117] border border-rose-500/30 space-y-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-[#F4A6A6] font-bold flex items-center gap-1">
                      <ShieldAlert className="w-3.5 h-3.5" /> Critical Threshold
                    </span>
                    <span className="font-mono font-bold text-[#F4A6A6]">{localCritical}%</span>
                  </div>
                  <input
                    type="range"
                    min={-45}
                    max={-15}
                    step={1}
                    value={localCritical}
                    onChange={(e) => setLocalCritical(Number(e.target.value))}
                    className="w-full accent-rose-500 cursor-pointer"
                  />
                  <p className="text-[10px] text-[#A7A4B8]">เปิดแบนเนอร์แจ้งเตือนระดับวิกฤตทันที</p>
                </div>

                {/* Extreme Slider */}
                <div className="p-3 rounded-lg bg-[#0F1117] border border-[#FFB86B]/40 space-y-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-[#FFB86B] font-bold flex items-center gap-1">
                      <ShieldAlert className="w-3.5 h-3.5" /> Extreme Risk
                    </span>
                    <span className="font-mono font-bold text-[#FFB86B]">{localExtreme}%</span>
                  </div>
                  <input
                    type="range"
                    min={-70}
                    max={-25}
                    step={1}
                    value={localExtreme}
                    onChange={(e) => setLocalExtreme(Number(e.target.value))}
                    className="w-full accent-[#FFB86B] cursor-pointer"
                  />
                  <p className="text-[10px] text-[#A7A4B8]">ระดับฉุกเฉิน / ล้างพอร์ต / Cut Loss</p>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1 text-xs text-[#ECEAF4]">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={soundEnabled}
                    onChange={(e) => setSoundEnabled(e.target.checked)}
                    className="rounded accent-[#FFB86B] cursor-pointer"
                  />
                  <span>เปิดเสียงแจ้งเตือนอัตโนมัติเมื่อเกิด Drawdown หลุดเกณฑ์ (Chime Alert)</span>
                </label>
              </div>
            </div>
          )}

          {/* KPI Dashboard Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-3">
            {/* 1. Avg Portfolio Drawdown */}
            <div className="p-3.5 rounded-xl border border-white/[0.07] bg-[#141725] space-y-1">
              <span className="text-[11px] font-mono uppercase text-[#A7A4B8] flex items-center gap-1">
                <Activity className="w-3.5 h-3.5 text-[#4CC9F0]" />
                ย่อตัวเฉลี่ยพอร์ต (Avg DD)
              </span>
              <div className="flex items-baseline gap-1.5">
                <span
                  className={`text-xl sm:text-2xl font-black font-mono tracking-tight ${
                    summary.avgDrawdownPct <= -20
                      ? 'text-[#FFB86B]'
                      : summary.avgDrawdownPct <= -10
                      ? 'text-[#FFB86B]'
                      : 'text-[#7EE0B5]'
                  }`}
                >
                  {summary.avgDrawdownPct}%
                </span>
                <span className="text-[10px] text-[#A7A4B8] font-mono">จากจุดสูงสุด</span>
              </div>
              <p className="text-[10px] text-[#A7A4B8] truncate">
                {summary.monitoredCount} สินทรัพย์ในมอนิเตอร์
              </p>
            </div>

            {/* 2. Worst Peak-to-Trough */}
            <div className="p-3.5 rounded-xl border border-[#FFB86B]/30 bg-[#FFB86B]/20 space-y-1 shadow-[0_0_15px_rgba(239,68,68,0.06)]">
              <span className="text-[11px] font-mono uppercase text-[#FFB86B] flex items-center gap-1">
                <TrendingDown className="w-3.5 h-3.5 text-[#FFB86B]" />
                ย่อตัวลึกสุด (Max DD)
              </span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl sm:text-2xl font-black font-mono text-[#FFB86B] tracking-tight">
                  {summary.worstDrawdownPct}%
                </span>
                <span className="text-xs font-bold text-[#FFB86B] font-mono">
                  {summary.worstAssetSymbol}
                </span>
              </div>
              <p className="text-[10px] text-[#A7A4B8] truncate">จุดทดสอบแนวรับสำคัญ</p>
            </div>

            {/* 3. Breached Assets Count */}
            <div className="p-3.5 rounded-xl border border-white/[0.07] bg-[#141725] space-y-1">
              <span className="text-[11px] font-mono uppercase text-[#A7A4B8] flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5 text-[#FFB86B]" />
                หลุดเกณฑ์เตือน (Breached)
              </span>
              <div className="flex items-baseline gap-1.5">
                <span
                  className={`text-xl sm:text-2xl font-black font-mono ${
                    summary.criticalCount + summary.extremeCount > 0 ? 'text-[#F4A6A6]' : 'text-[#ECEAF4]'
                  }`}
                >
                  {summary.warningCount + summary.criticalCount + summary.extremeCount}
                </span>
                <span className="text-[10px] text-[#A7A4B8] font-mono">
                  (วิกฤต {summary.criticalCount + summary.extremeCount})
                </span>
              </div>
              <p className="text-[10px] text-[#A7A4B8] truncate">
                เกณฑ์ Warning {thresholds.warning}% / Critical {thresholds.critical}%
              </p>
            </div>

            {/* 4. Portfolio Risk Status */}
            <div className="p-3.5 rounded-xl border border-white/[0.07] bg-[#141725] space-y-1">
              <span className="text-[11px] font-mono uppercase text-[#A7A4B8] flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-[#7EE0B5]" />
                ระดับความเสี่ยงพอร์ต
              </span>
              <div className="pt-0.5">{getStatusBadge(summary.portfolioStatus)}</div>
              <p className="text-[10px] text-[#A7A4B8] truncate">ประเมินแบบเรียลไทม์ 100%</p>
            </div>
          </div>

          {/* Actionable Strategy Advice Banner */}
          <div className="p-3.5 rounded-xl bg-gradient-to-r from-[#141725] to-[#141725] border border-white/[0.07] flex items-start gap-3">
            <div className="p-1.5 rounded-lg bg-[#7C6CFF]/20 text-[#A89FFF] shrink-0 mt-0.5">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="flex-1 text-xs leading-relaxed">
              <span className="font-bold text-white mr-1.5">คำแนะนำการบริหารความเสี่ยง:</span>
              <span className="text-[#ECEAF4]">{summary.recommendedActionTh}</span>
            </div>
          </div>

          {/* Controls: Search, Filters & Stress Test Simulator */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5 pt-1">
            {/* Category Filter Buttons */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1 md:pb-0 [&::-webkit-scrollbar]:hidden text-xs font-mono">
              {[
                { id: 'ALL', label: 'ทั้งหมด' },
                { id: 'BREACHED', label: `⚠️ หลุดเกณฑ์ (${summary.warningCount + summary.criticalCount + summary.extremeCount})` },
                { id: 'CRYPTO', label: 'คริปโต' },
                { id: 'THAI_STOCK', label: 'หุ้นไทย' },
                { id: 'FOREIGN_STOCK', label: 'หุ้นนอก' },
                { id: 'FOREX', label: 'Forex' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSelectedCategory(tab.id)}
                  className={`px-3 py-1.5 rounded-lg transition-colors shrink-0 cursor-pointer ${
                    selectedCategory === tab.id
                      ? 'bg-[#FFB86B]/20 border border-[#FFB86B]/50 text-[#FFB86B] font-bold'
                      : 'bg-[#141725] border border-white/[0.07] text-[#A7A4B8] hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Stress Test & Search */}
            <div className="flex items-center gap-2">
              {/* Stress Test Dropdown */}
              <div className="flex items-center gap-1.5 bg-[#141725] border border-white/[0.07] rounded-xl px-2.5 py-1 text-xs">
                <span className="text-[#A7A4B8] text-[10px] font-mono shrink-0 hidden sm:inline">
                  Stress Test:
                </span>
                <select
                  value={stressTestDropPct}
                  onChange={(e) => setStressTestDropPct(Number(e.target.value))}
                  className="bg-transparent text-white font-mono text-xs outline-none cursor-pointer"
                >
                  <option value={0} className="bg-[#141725]">
                    ปัจจุบัน (0%)
                  </option>
                  <option value={-5} className="bg-[#141725]">
                    ตลาดร่วงอีก -5%
                  </option>
                  <option value={-10} className="bg-[#141725]">
                    ตลาดร่วงอีก -10%
                  </option>
                  <option value={-20} className="bg-[#141725]">
                    Flash Crash -20%
                  </option>
                  <option value={-30} className="bg-[#141725]">
                    Black Swan -30%
                  </option>
                </select>
                {stressTestDropPct !== 0 && (
                  <button
                    type="button"
                    onClick={() => setStressTestDropPct(0)}
                    title="รีเซ็ตสภาวะตลาด"
                    className="text-[#FFB86B] hover:text-white"
                  >
                    <RotateCcw className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Search */}
              <div className="relative flex-1 sm:w-44">
                <Search className="w-3.5 h-3.5 text-[#A7A4B8] absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="ค้นหาสินทรัพย์..."
                  className="w-full bg-[#141725] border border-white/[0.07] rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-[#8B88A0] outline-none focus:border-[#FFB86B]"
                />
              </div>
            </div>
          </div>

          {/* Asset List Grid */}
          <div className="space-y-2.5">
            {filteredAssets.length === 0 ? (
              <div className="p-8 text-center text-[#A7A4B8] border border-white/[0.07] rounded-xl bg-[#141725]">
                ไม่พบสินทรัพย์ที่ตรงตามเงื่อนไขที่เลือก
              </div>
            ) : (
              filteredAssets.map((asset) => {
                const isBreached = asset.status !== 'NORMAL';
                const isEditing = editingSymbol === asset.symbol;

                return (
                  <div
                    key={asset.id}
                    className={`p-3.5 sm:p-4 rounded-xl border transition-all ${
                      asset.status === 'EXTREME'
                        ? 'bg-[#FFB86B]/20 border-[#FFB86B]/60 shadow-[0_0_15px_rgba(239,68,68,0.12)]'
                        : asset.status === 'CRITICAL'
                        ? 'bg-rose-950/15 border-rose-500/40 shadow-[0_0_10px_rgba(244,63,94,0.08)]'
                        : asset.status === 'WARNING'
                        ? 'bg-[#141725]/10 border-amber-500/35'
                        : 'bg-[#141725] border-white/[0.07] hover:border-white/[0.07]'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2.5 border-b border-white/[0.07]/60">
                      {/* Left: Symbol & Status */}
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center font-mono font-bold text-xs shrink-0 ${
                            isBreached
                              ? 'bg-[#FFB86B]/20 text-[#FFB86B] border border-[#FFB86B]/40'
                              : 'bg-[#7EE0B5]/15 text-[#7EE0B5] border border-emerald-500/30'
                          }`}
                        >
                          {asset.symbol.slice(0, 3)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-sm sm:text-base font-mono tracking-tight text-white">
                              {asset.symbol}
                            </h3>
                            <span className="text-[10px] text-[#A7A4B8] font-mono">
                              ({asset.category})
                            </span>
                            {getStatusBadge(asset.status)}
                          </div>
                          <p className="text-xs text-[#A7A4B8] truncate max-w-xs">{asset.name}</p>
                        </div>
                      </div>

                      {/* Right: Key Price Metrics */}
                      <div className="flex items-center gap-4 text-right justify-between sm:justify-end">
                        <div>
                          <p className="text-[10px] text-[#A7A4B8] font-mono uppercase">ราคาปัจจุบัน</p>
                          <p className="font-mono font-bold text-sm text-white">
                            ${asset.currentPrice.toLocaleString()}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-[#A7A4B8] font-mono uppercase">จุดสูงสุด (Peak)</p>
                          {isEditing ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                value={customPeakInput}
                                onChange={(e) => setCustomPeakInput(e.target.value)}
                                className="w-20 bg-[#0F1117] border border-[#FFB86B] rounded px-1 py-0.5 text-xs font-mono text-white"
                                placeholder={String(asset.peakPrice)}
                                autoFocus
                              />
                              <button
                                type="button"
                                onClick={() => handleSavePeak(asset.symbol)}
                                className="p-1 bg-[#FFB86B] text-black rounded text-[10px]"
                              >
                                ✓
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-end gap-1 group">
                              <p className="font-mono font-bold text-sm text-[#ECEAF4]">
                                ${asset.peakPrice.toLocaleString()}
                              </p>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingSymbol(asset.symbol);
                                  setCustomPeakInput(String(asset.peakPrice));
                                }}
                                className="text-[#8B88A0] hover:text-white transition-colors"
                                title="แก้ไขจุดพีคเปรียบเทียบ"
                              >
                                <Edit2 className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </div>
                        <div>
                          <p className="text-[10px] text-[#A7A4B8] font-mono uppercase">Drawdown</p>
                          <p
                            className={`font-mono font-black text-sm sm:text-base ${
                              asset.currentDrawdownPct <= thresholds.critical
                                ? 'text-[#FFB86B]'
                                : asset.currentDrawdownPct <= thresholds.warning
                                ? 'text-[#FFB86B]'
                                : 'text-[#7EE0B5]'
                            }`}
                          >
                            {asset.currentDrawdownPct}%
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Bottom: Progress Bar, Underwater Sparkline & Recovery */}
                    <div className="pt-2.5 grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                      {/* Drawdown Progress Bar with Threshold Markers (Col 1-5) */}
                      <div className="md:col-span-5 space-y-1">
                        <div className="flex justify-between text-[10px] font-mono text-[#A7A4B8]">
                          <span>ระยะย่อตัวจากจุดพีค</span>
                          <span>ลดลง -${asset.declineAmount.toLocaleString()}</span>
                        </div>
                        <div className="h-2 w-full bg-[#141725] rounded-full overflow-hidden relative border border-white/[0.07]">
                          {/* Fill Bar */}
                          <div
                            className={`h-full transition-all duration-500 rounded-full ${
                              asset.status === 'EXTREME'
                                ? 'bg-[#FFB86B]'
                                : asset.status === 'CRITICAL'
                                ? 'bg-[#F4A6A6]'
                                : asset.status === 'WARNING'
                                ? 'bg-[#FFB86B]'
                                : 'bg-[#7EE0B5]'
                            }`}
                            style={{ width: `${Math.min(100, Math.abs(asset.currentDrawdownPct) * 2)}%` }}
                          />
                        </div>
                      </div>

                      {/* Mini Underwater Curve SVG (Col 6-8) */}
                      <div className="md:col-span-4 flex items-center gap-2">
                        <div className="w-full h-8 bg-[#0F1117] rounded-lg border border-white/[0.07]/70 px-1 py-0.5 flex items-center">
                          <svg className="w-full h-full overflow-visible" viewBox="0 0 140 30" preserveAspectRatio="none">
                            {/* 0% baseline */}
                            <line x1="0" y1="2" x2="140" y2="2" stroke="#475569" strokeWidth="0.8" strokeDasharray="2,2" />
                            {/* Area fill */}
                            <polygon
                              points={`0,2 ${asset.underwaterCurve
                                .map((val, idx) => {
                                  const x = (idx / (asset.underwaterCurve.length - 1)) * 140;
                                  const y = Math.min(28, 2 + Math.abs(val) * 0.7);
                                  return `${x},${y}`;
                                })
                                .join(' ')} 140,2`}
                              fill={isBreached ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.15)'}
                            />
                            {/* Line */}
                            <polyline
                              fill="none"
                              stroke={isBreached ? '#FFB86B' : '#7EE0B5'}
                              strokeWidth="1.5"
                              points={asset.underwaterCurve
                                .map((val, idx) => {
                                  const x = (idx / (asset.underwaterCurve.length - 1)) * 140;
                                  const y = Math.min(28, 2 + Math.abs(val) * 0.7);
                                  return `${x},${y}`;
                                })
                                .join(' ')}
                            />
                          </svg>
                        </div>
                      </div>

                      {/* Required Rebound Recovery (Col 9-12) */}
                      <div className="md:col-span-3 text-right flex items-center justify-between md:justify-end gap-1.5 text-xs font-mono">
                        <span className="text-[10px] text-[#A7A4B8]">คืนทุนต้องขึ้น:</span>
                        <span className="font-bold text-[#FFB86B] flex items-center gap-0.5">
                          <ArrowUpRight className="w-3.5 h-3.5" />
                          +{asset.recoveryNeededPct}%
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Modal Footer with Actions */}
        <div className="px-4 sm:px-6 py-3 border-t border-white/[0.07]/70 flex items-center justify-between bg-[#141725] flex-wrap gap-2">
          <div className="text-xs text-[#A7A4B8] font-mono flex items-center gap-1.5">
            <span>เกณฑ์เตือนปัจจุบัน:</span>
            <span className="text-[#FFB86B] font-bold">Warning {thresholds.warning}%</span>
            <span>·</span>
            <span className="text-[#F4A6A6] font-bold">Critical {thresholds.critical}%</span>
            <span>·</span>
            <span className="text-[#FFB86B] font-bold">Extreme {thresholds.extreme}%</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyReport}
              className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/20 text-xs font-mono text-[#ECEAF4] flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-[#7EE0B5]" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'คัดลอกแล้ว!' : 'คัดลอกรายงาน'}</span>
            </button>

            {onSendReportToChat && (
              <button
                type="button"
                onClick={handleSendToChat}
                className="px-3 py-1.5 rounded-xl bg-[#7EE0B5]/20 hover:bg-[#7EE0B5]/30 border border-[#7EE0B5]/50 text-xs font-mono font-bold text-[#7EE0B5] flex items-center gap-1.5 transition-colors cursor-pointer"
                title="ส่งรายงาน Drawdown เข้าห้อง AI Deep Analyze เพื่อขอแผนแก้พอร์ต"
              >
                {sentToChat ? <Check className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />}
                <span>{sentToChat ? 'ส่งสำเร็จ!' : 'ปรึกษา AI Deep Analyze'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-xl bg-[#FFB86B] hover:bg-[#FFB86B] text-black font-bold text-xs font-mono transition-colors cursor-pointer shadow-xs"
            >
              ปิด
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
