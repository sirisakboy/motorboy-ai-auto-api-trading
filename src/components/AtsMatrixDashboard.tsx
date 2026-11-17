import React, { useState, useEffect } from 'react';
import {
  Zap,
  Activity,
  TrendingUp,
  TrendingDown,
  Clock,
  ShieldAlert,
  Copy,
  Check,
  Send,
  RefreshCw,
  Gauge,
  Layers,
  CircleDot,
  Radio,
  BarChart2,
  X,
  Sparkles,
  Cpu,
} from 'lucide-react';
import { CryptoCoin } from '../types';
import { BacktestingDashboard } from './BacktestingDashboard';
import { publishMascotFeed, requestAtsDashboardTab, useMascotFeed } from '../mascot/feed';
import {
  computeAtsMatrixAnalysis,
  getBtcFromCryptoList,
  fetchLiveBtcTicker,
  AtsNiulai4Analysis,
} from '../services/atsMatrixService';

interface AtsMatrixDashboardProps {
  cryptoList?: CryptoCoin[];
  isDark?: boolean;
  onClose?: () => void;
  onSendToChat?: (text: string) => void;
  isModal?: boolean;
}

export const AtsMatrixDashboard: React.FC<AtsMatrixDashboardProps> = ({
  cryptoList = [],
  isDark = true,
  onClose,
  onSendToChat,
  isModal = false,
}) => {
  const initialBtc = getBtcFromCryptoList(cryptoList);
  const [btcData, setBtcData] = useState<{ price: number; change: number; latencyMs: number }>({
    price: initialBtc.price,
    change: initialBtc.change,
    latencyMs: 18,
  });
  const [analysis, setAnalysis] = useState<AtsNiulai4Analysis>(() =>
    computeAtsMatrixAnalysis(initialBtc.price, initialBtc.change, 18)
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sentToChat, setSentToChat] = useState(false);
  const [torusRotation, setTorusRotation] = useState(0);
  const requestedTab = useMascotFeed((s) => s.atsRequestedTab);
  const [activeTab, setActiveTab] = useState<'LIVE_MATRIX' | 'BACKTEST'>(
    () => requestedTab ?? 'LIVE_MATRIX'
  );

  useEffect(() => {
    if (requestedTab) {
      setActiveTab(requestedTab);
      requestAtsDashboardTab(null);
    }
  }, [requestedTab]);

  useEffect(() => {
    publishMascotFeed({ atsActiveTab: activeTab });
  }, [activeTab]);

  // Sync when cryptoList updates
  useEffect(() => {
    const btc = getBtcFromCryptoList(cryptoList);
    if (btc.price > 0 && Math.abs(btc.price - btcData.price) > 0.5) {
      setBtcData((prev) => ({ ...prev, price: btc.price, change: btc.change }));
      setAnalysis(computeAtsMatrixAnalysis(btc.price, btc.change, btcData.latencyMs));
    }
  }, [cryptoList]);

  // Periodic simulated micro-tick & live check
  useEffect(() => {
    let isMounted = true;
    const interval = setInterval(async () => {
      // Don't poll a paid data feed for a tab nobody is looking at
      if (!isMounted || document.hidden) return;
      setTorusRotation((prev) => (prev + 3) % 360);
      try {
        const live = await fetchLiveBtcTicker();
        if (isMounted) {
          setBtcData({ price: live.price, change: live.change24h, latencyMs: live.latencyMs });
          setAnalysis(computeAtsMatrixAnalysis(live.price, live.change24h, live.latencyMs));
        }
      } catch {
        // keep current
      }
    }, 4000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      const live = await fetchLiveBtcTicker();
      setBtcData({ price: live.price, change: live.change24h, latencyMs: live.latencyMs });
      setAnalysis(computeAtsMatrixAnalysis(live.price, live.change24h, live.latencyMs));
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleCopyTraderText = () => {
    navigator.clipboard.writeText(analysis.rawTraderTextTh);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendReportToChat = () => {
    if (onSendToChat) {
      onSendToChat(analysis.rawTraderTextTh);
      setSentToChat(true);
      setTimeout(() => setSentToChat(false), 2500);
    }
  };

  const isUp = analysis.dashboard.btcChange24h >= 0;

  return (
    <div
      className={`rounded-2xl border transition-all duration-300 font-sans ${
        isDark
          ? 'bg-[#0F1117] border-[#7C6CFF]/30 text-[#ECEAF4] shadow-[0_0_40px_rgba(124,108,255,0.1)]'
          : 'bg-[#141725] border-[#7C6CFF]/40 text-[#ECEAF4] shadow-2xl'
      } ${isModal ? 'max-h-[92vh] flex flex-col overflow-hidden' : 'p-4 sm:p-6 my-4'}`}
    >
      {/* Top Banner / MotorBoy Cockpit Bar */}
      <div className="p-4 sm:p-5 border-b border-[#7C6CFF]/20 bg-gradient-to-r from-[#7C6CFF]/10 to-[#8E80FF]/10 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#7C6CFF] to-[#8E80FF] p-[1.5px] shadow-[0_0_15px_rgba(124,108,255,0.4)]">
            <div className="w-full h-full bg-[#0F1117] rounded-[9.5px] flex items-center justify-center text-sm">
              <Radio className="w-5 h-5 text-white animate-pulse" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm sm:text-base font-black tracking-widest bg-gradient-to-r from-[#7C6CFF] to-[#8E80FF] text-transparent bg-clip-text uppercase">
                MOTORBOY ATS COCKPIT
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#7C6CFF]/20 border border-[#7C6CFF]/40 text-[#7C6CFF] font-bold">
                ● LIVE FEED
              </span>
              <span className="hidden sm:inline-block text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#7C6CFF]/15 border border-[#7C6CFF]/30 text-[#7C6CFF] font-semibold">
                HYBRID PRO ENGINE
              </span>
            </div>
            <p className="text-xs text-[#A7A4B8] font-mono mt-0.5 flex items-center gap-2">
              <span>NIULAI4 QUANT ALGO</span>
              <span>•</span>
              <span>TORUS ORDER BOOK</span>
              <span>•</span>
              <span className="text-[#7C6CFF]">MotorBoy Studio AI-TH</span>
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className="px-3 py-1.5 rounded-xl bg-[#222640]/80 hover:bg-[#222640]/80 border border-white/[0.07] text-xs font-mono font-semibold text-[#ECEAF4] hover:text-white flex items-center gap-1.5 transition-all cursor-pointer"
            title="รีเฟรชข้อมูลคำนวณสด"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-[#7EE0B5]' : ''}`} />
            <span className="hidden sm:inline">รีเฟรช</span>
          </button>

          <button
            type="button"
            onClick={handleCopyTraderText}
            className="px-3 py-1.5 rounded-xl bg-[#7EE0B5]/20 hover:bg-[#7EE0B5]/30 border border-[#7EE0B5]/50 text-xs font-mono font-bold text-[#7EE0B5] flex items-center gap-1.5 transition-all cursor-pointer shadow-[0_0_12px_rgba(0,255,102,0.2)]"
            title="คัดลอกบทวิเคราะห์สไตล์เทรดเดอร์ (สั้น คม มีตัวเลข)"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-white" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'คัดลอกแล้ว!' : 'คัดลอกสรุป'}</span>
          </button>

          {onSendToChat && (
            <button
              type="button"
              onClick={handleSendReportToChat}
              className="px-3 py-1.5 rounded-xl bg-[#7C6CFF]/20 hover:bg-[#7C6CFF]/30 border border-[#7C6CFF]/50 text-xs font-mono font-bold text-[#7C6CFF] flex items-center gap-1.5 transition-all cursor-pointer"
              title="ส่งรายงาน ATS เข้าห้อง AI Deep Analyze"
            >
              {sentToChat ? <Check className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{sentToChat ? 'ส่งสำเร็จ!' : 'ส่งเข้าแชท'}</span>
            </button>
          )}

          {isModal && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl bg-[#222640] hover:bg-[#222640] text-[#A7A4B8] hover:text-white border border-white/[0.07] transition-colors ml-1 cursor-pointer"
              aria-label="ปิดหน้าต่าง ATS Matrix"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* View Switcher: Live Matrix vs Backtesting Strategy Lab */}
      <div className="px-4 sm:px-6 pt-3 pb-0 flex items-center gap-2 border-b border-white/[0.07]/80 bg-[#0F141F]">
        <button
          type="button"
          onClick={() => setActiveTab('LIVE_MATRIX')}
          className={`pb-2.5 px-3 font-mono text-xs font-bold border-b-2 flex items-center gap-1.5 transition-all cursor-pointer ${
            activeTab === 'LIVE_MATRIX'
              ? 'border-[#7EE0B5] text-[#7EE0B5]'
              : 'border-transparent text-[#A7A4B8] hover:text-white'
          }`}
        >
          <Zap className="w-3.5 h-3.5" />
          <span>ATS Matrix &amp; Niulai4 (Live Feed)</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('BACKTEST')}
          className={`pb-2.5 px-3 font-mono text-xs font-bold border-b-2 flex items-center gap-1.5 transition-all cursor-pointer ${
            activeTab === 'BACKTEST'
              ? 'border-[#7C6CFF] text-[#7C6CFF]'
              : 'border-transparent text-[#A7A4B8] hover:text-white'
          }`}
        >
          <Cpu className="w-3.5 h-3.5" />
          <span>Backtesting Dashboard (Strategy Lab &amp; Live Ticker)</span>
          <span className="text-[9px] px-1.5 py-0.2 rounded-sm bg-[#7C6CFF]/20 text-[#7C6CFF] border border-[#7C6CFF]/40 font-black">
            LIVE TICKER
          </span>
        </button>
      </div>

      {/* Main Content Body */}
      <div className={`space-y-6 ${isModal ? 'p-4 sm:p-6 overflow-y-auto flex-1' : ''}`}>
        {activeTab === 'BACKTEST' ? (
          <BacktestingDashboard
            cryptoList={cryptoList}
            isDark={isDark}
            onSendToChat={onSendToChat}
          />
        ) : (
          <>
            {/* SECTION 1: ATS DASHBOARD 4 KEY METRICS */}
            <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-mono font-black text-[#ECEAF4] uppercase tracking-wider flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-[#7EE0B5]" />
              ATS DASHBOARD CORE METRICS
            </h3>
            <span className="text-[11px] font-mono text-[#8B88A0]">
              Sync: {analysis.dashboard.timestamp}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Metric 1: BTC SPOT */}
            <div className="p-4 rounded-xl bg-[#141725] border border-white/[0.07] hover:border-[#7EE0B5]/50 transition-all shadow-xs relative overflow-hidden group">
              <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-[#7EE0B5] to-transparent opacity-60" />
              <div className="flex items-center justify-between text-[#A7A4B8] text-xs font-mono mb-1">
                <span className="flex items-center gap-1">
                  <Activity className="w-3.5 h-3.5 text-[#FFB86B]" />
                  BTC SPOT
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-[#FFB86B]/10 border border-amber-500/30 text-[#FFB86B] font-bold">
                  BINANCE FEED
                </span>
              </div>
              <div className="text-2xl font-black font-mono tracking-tight text-white mt-1">
                ${analysis.dashboard.btcSpot.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="flex items-center justify-between text-xs font-mono mt-2 pt-2 border-t border-white/[0.07]/80">
                <span
                  className={`flex items-center gap-1 font-bold ${
                    isUp ? 'text-[#7EE0B5]' : 'text-[#F4A6A6]'
                  }`}
                >
                  {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {isUp ? '+' : ''}
                  {analysis.dashboard.btcChange24h.toFixed(2)}%
                </span>
                <span className="text-[#A7A4B8] text-[11px]">
                  H: ${analysis.dashboard.btcHigh24h.toLocaleString()}
                </span>
              </div>
            </div>

            {/* Metric 2: MODEL EDGE */}
            <div className="p-4 rounded-xl bg-[#141725] border border-white/[0.07] hover:border-[#4CC9F0]/50 transition-all shadow-xs relative overflow-hidden group">
              <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-[#4CC9F0] to-transparent opacity-60" />
              <div className="flex items-center justify-between text-[#A7A4B8] text-xs font-mono mb-1">
                <span className="flex items-center gap-1">
                  <Gauge className="w-3.5 h-3.5 text-[#4CC9F0]" />
                  MODEL EDGE
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-[#7C6CFF]/15 border border-[#7C6CFF]/30 text-[#7C6CFF] font-bold">
                  +EV ARBITRAGE
                </span>
              </div>
              <div className="text-2xl font-black font-mono tracking-tight text-[#4CC9F0] mt-1">
                +{analysis.dashboard.modelEdgePct}%
              </div>
              <div className="flex items-center justify-between text-xs font-mono mt-2 pt-2 border-t border-white/[0.07]/80 text-[#A7A4B8]">
                <span className="text-[#ECEAF4]">Skew Inefficiency</span>
                <span className="text-[#4CC9F0] font-bold">Polymarket Delta</span>
              </div>
            </div>

            {/* Metric 3: FEED LATENCY */}
            <div className="p-4 rounded-xl bg-[#141725] border border-white/[0.07] hover:border-emerald-500/50 transition-all shadow-xs relative overflow-hidden group">
              <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent opacity-60" />
              <div className="flex items-center justify-between text-[#A7A4B8] text-xs font-mono mb-1">
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-[#7EE0B5]" />
                  FEED LATENCY
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-[#7EE0B5]/10 border border-emerald-500/30 text-[#7EE0B5] font-bold">
                  WS CLOB
                </span>
              </div>
              <div className="text-2xl font-black font-mono tracking-tight text-[#7EE0B5] mt-1 flex items-baseline gap-2">
                <span>{analysis.dashboard.feedLatencyMs}ms</span>
                <span className="text-xs text-[#A7A4B8] font-normal">
                  (CLOB {analysis.dashboard.polymarketLatencyMs}ms)
                </span>
              </div>
              <div className="flex items-center justify-between text-xs font-mono mt-2 pt-2 border-t border-white/[0.07]/80 text-[#A7A4B8]">
                <span>Clock Drift</span>
                <span className="text-[#7EE0B5] font-bold">
                  {analysis.dashboard.polymarketLatencyMs - analysis.dashboard.feedLatencyMs}ms Δ
                </span>
              </div>
            </div>

            {/* Metric 4: WIN RATE */}
            <div className="p-4 rounded-xl bg-[#141725] border border-white/[0.07] hover:border-purple-500/50 transition-all shadow-xs relative overflow-hidden group">
              <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-purple-400 to-transparent opacity-60" />
              <div className="flex items-center justify-between text-[#A7A4B8] text-xs font-mono mb-1">
                <span className="flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-[#A89FFF]" />
                  WIN RATE
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-[#A89FFF]/10 border border-purple-500/30 text-[#A89FFF] font-bold">
                  742 ROUNDS
                </span>
              </div>
              <div className="text-2xl font-black font-mono tracking-tight text-[#A89FFF] mt-1">
                {analysis.dashboard.winRatePct}%
              </div>
              <div className="flex items-center justify-between text-xs font-mono mt-2 pt-2 border-t border-white/[0.07]/80 text-[#A7A4B8]">
                <span>{analysis.dashboard.winRounds}/{analysis.dashboard.totalRounds} W/L</span>
                <span className="text-[#A89FFF] font-bold">Sharpe {analysis.dashboard.sharpeRatio}</span>
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 2: NIULAI4 ANALYSIS ENGINE (TORUS MODEL + CEX vs POLYMARKET) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* 1. Torus Order Book Visualizer & Density */}
          <div className="lg:col-span-6 p-4 sm:p-5 rounded-xl bg-[#141725] border border-white/[0.07] flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-[#7EE0B5]" />
                  <h4 className="text-sm font-mono font-bold text-white">
                    1. Torus Model Order Book Density
                  </h4>
                </div>
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded-sm font-bold ${
                    analysis.torusOrderBook.dominantSide === 'BID'
                      ? 'bg-[#7EE0B5]/20 text-[#7EE0B5] border border-emerald-500/40'
                      : 'bg-[#F4A6A6]/20 text-[#F4A6A6] border border-rose-500/40'
                  }`}
                >
                  {analysis.torusOrderBook.dominantSide} DOMINANCE
                </span>
              </div>

              {/* Torus Interactive Visualizer */}
              <div className="relative py-4 flex items-center justify-center bg-[#141725]/60 rounded-xl border border-white/[0.07]/70 overflow-hidden my-3">
                <svg viewBox="0 0 320 180" className="w-full max-w-[280px] h-auto drop-shadow-lg">
                  {/* Outer glow ring */}
                  <ellipse
                    cx="160"
                    cy="90"
                    rx="120"
                    ry="55"
                    fill="none"
                    stroke={analysis.torusOrderBook.dominantSide === 'BID' ? '#7EE0B5' : '#FFB86B'}
                    strokeWidth="1.5"
                    strokeDasharray="6 4"
                    opacity="0.3"
                  />
                  {/* Dynamic Torus Body */}
                  <g transform={`rotate(${torusRotation} 160 90)`}>
                    <ellipse
                      cx="160"
                      cy="90"
                      rx="95"
                      ry="44"
                      fill="none"
                      stroke="url(#torusGradient)"
                      strokeWidth="18"
                      opacity="0.75"
                    />
                    {/* Flowing particles on Torus */}
                    <circle cx="255" cy="90" r="4" fill="#7EE0B5" opacity="0.9" />
                    <circle cx="65" cy="90" r="4" fill="#4CC9F0" opacity="0.9" />
                    <circle cx="160" cy="46" r="3" fill="#FFB86B" opacity="0.8" />
                    <circle cx="160" cy="134" r="3" fill="#A89FFF" opacity="0.8" />
                  </g>
                  {/* Inner Torus Hole / Liquidity Singularity */}
                  <ellipse cx="160" cy="90" rx="45" ry="20" fill="#141725" stroke="#222640" strokeWidth="2" />
                  <text
                    x="160"
                    y="88"
                    textAnchor="middle"
                    fill="#FFFFFF"
                    fontSize="11"
                    fontFamily="monospace"
                    fontWeight="bold"
                  >
                    TORUS CORE
                  </text>
                  <text
                    x="160"
                    y="102"
                    textAnchor="middle"
                    fill="#7EE0B5"
                    fontSize="9"
                    fontFamily="monospace"
                  >
                    ${analysis.torusOrderBook.supportZone.toLocaleString()}
                  </text>
                  <defs>
                    <linearGradient id="torusGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#7EE0B5" />
                      <stop offset="50%" stopColor="#4CC9F0" />
                      <stop offset="100%" stopColor="#FFB86B" />
                    </linearGradient>
                  </defs>
                </svg>

                <div className="absolute bottom-2 left-3 text-[10px] font-mono text-[#7EE0B5] flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-[#7EE0B5] inline-block" />
                  Bid: {analysis.torusOrderBook.bidDensityPct}% ({analysis.torusOrderBook.bidWallSizeBtc} BTC)
                </div>
                <div className="absolute bottom-2 right-3 text-[10px] font-mono text-[#F4A6A6] flex items-center gap-1">
                  Ask: {analysis.torusOrderBook.askDensityPct}% ({analysis.torusOrderBook.askWallSizeBtc} BTC)
                </div>
              </div>

              {/* Density Bar */}
              <div className="space-y-1.5 mt-2">
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-[#7EE0B5] font-bold">
                    BID หนาแน่น {analysis.torusOrderBook.bidDensityPct}%
                  </span>
                  <span className="text-[#F4A6A6] font-bold">
                    ASK บางเบา {analysis.torusOrderBook.askDensityPct}%
                  </span>
                </div>
                <div className="w-full h-2.5 rounded-full bg-[#222640] overflow-hidden flex">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500"
                    style={{ width: `${analysis.torusOrderBook.bidDensityPct}%` }}
                  />
                  <div
                    className="h-full bg-gradient-to-r from-rose-500 to-amber-500 transition-all duration-500"
                    style={{ width: `${analysis.torusOrderBook.askDensityPct}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-[#141725]/80 border border-white/[0.07] text-xs font-mono text-[#ECEAF4] mt-3 leading-relaxed">
              <span className="text-[#7EE0B5] font-bold">▶ วิเคราะห์ Torus: </span>
              {analysis.torusOrderBook.summaryTh}
            </div>
          </div>

          {/* 2. CEX vs Polymarket Inefficiency */}
          <div className="lg:col-span-6 p-4 sm:p-5 rounded-xl bg-[#141725] border border-white/[0.07] flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-[#4CC9F0]" />
                  <h4 className="text-sm font-mono font-bold text-white">
                    2. CEX vs Polymarket Inefficiency
                  </h4>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-sm bg-[#4CC9F0]/15 border border-[#4CC9F0]/30 text-[#4CC9F0] font-bold">
                  ARBITRAGE SPREAD
                </span>
              </div>

              {/* Comparison Matrix */}
              <div className="space-y-3 my-2">
                <div className="p-3 rounded-xl bg-[#141725] border border-white/[0.07] flex items-center justify-between">
                  <div>
                    <div className="text-[11px] font-mono text-[#A7A4B8]">CEX SPOT / PERP (Binance)</div>
                    <div className="text-lg font-bold font-mono text-white mt-0.5">
                      ${analysis.inefficiency.cexPrice.toLocaleString()}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] font-mono text-[#A7A4B8]">Implied Probability</div>
                    <div className="text-base font-bold font-mono text-[#7EE0B5]">
                      {analysis.inefficiency.cexImpliedProbPct}%
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-[#141725] border border-white/[0.07] flex items-center justify-between">
                  <div>
                    <div className="text-[11px] font-mono text-[#A7A4B8] truncate max-w-[220px]">
                      {analysis.inefficiency.polymarketContractName}
                    </div>
                    <div className="text-lg font-bold font-mono text-[#4CC9F0] mt-0.5">
                      {analysis.inefficiency.polymarketOddsPct}¢ ({analysis.inefficiency.polymarketOddsPct}%)
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] font-mono text-[#A7A4B8]">Feed Lag Delay</div>
                    <div className="text-base font-bold font-mono text-[#FFB86B]">
                      {(analysis.inefficiency.lagSeconds / 60).toFixed(1)} นาที
                    </div>
                  </div>
                </div>

                {/* Inefficiency Gauge Result */}
                <div className="p-3 rounded-xl bg-[#4CC9F0]/10 border border-[#4CC9F0]/30 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CircleDot className="w-4 h-4 text-[#4CC9F0] animate-pulse" />
                    <div>
                      <div className="text-xs font-mono font-bold text-white">
                        ความได้เปรียบส่วนต่าง (Inefficiency Spread)
                      </div>
                      <div className="text-[11px] font-mono text-[#A7A4B8]">
                        โอกาสทำกำไรระหว่างราคาจริงกับตลาดทำนาย
                      </div>
                    </div>
                  </div>
                  <div className="text-xl font-mono font-black text-[#7C6CFF]">
                    +{analysis.inefficiency.spreadInefficiencyPct}%
                  </div>
                </div>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-[#141725]/80 border border-white/[0.07] text-xs font-mono text-[#ECEAF4] mt-3 leading-relaxed">
              <span className="text-[#4CC9F0] font-bold">▶ สรุปโอกาส Arb: </span>
              {analysis.inefficiency.arbOpportunity}
            </div>
          </div>
        </div>

        {/* SECTION 3: 3-HORIZON DIRECTION PREDICTIONS (1M / 15M / 1H) */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-mono font-bold text-white flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[#7EE0B5]" />
              3. ทำนายทิศทางราคา (1 นาที / 15 นาที / 1 ชั่วโมง)
            </h4>
            <span className="text-xs font-mono text-[#A7A4B8]">
              โมเดลทำนายเชิงปริมาณความน่าจะเป็นสูง
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* 1 Minute */}
            <div className="p-4 rounded-xl bg-[#141725] border border-white/[0.07] hover:border-emerald-500/50 transition-all">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-mono font-bold text-[#ECEAF4]">
                  {analysis.forecasts.oneMin.timeframeLabelTh}
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-sm bg-[#7EE0B5]/20 text-[#7EE0B5] font-bold border border-emerald-500/40">
                  {analysis.forecasts.oneMin.actionLabelTh}
                </span>
              </div>
              <div className="text-xl font-mono font-black text-white mt-1">
                ${analysis.forecasts.oneMin.targetPrice.toLocaleString()}
              </div>
              <div className="text-xs font-mono text-[#A7A4B8] mt-2 space-y-1 pt-2 border-t border-white/[0.07]">
                <div className="flex justify-between">
                  <span>Stop Loss:</span>
                  <span className="text-[#F4A6A6] font-bold">${analysis.forecasts.oneMin.stopLossPrice.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>ความมั่นใจ:</span>
                  <span className="text-[#7EE0B5] font-bold">{analysis.forecasts.oneMin.confidencePct}%</span>
                </div>
                <p className="text-[11px] text-[#A7A4B8] mt-2 pt-1 border-t border-white/[0.07]/60 leading-tight">
                  {analysis.forecasts.oneMin.reasoningTh}
                </p>
              </div>
            </div>

            {/* 15 Minutes */}
            <div className="p-4 rounded-xl bg-[#141725] border border-white/[0.07] hover:border-teal-500/50 transition-all">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-mono font-bold text-[#ECEAF4]">
                  {analysis.forecasts.fifteenMin.timeframeLabelTh}
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-sm bg-teal-500/20 text-teal-300 font-bold border border-teal-500/40">
                  {analysis.forecasts.fifteenMin.actionLabelTh}
                </span>
              </div>
              <div className="text-xl font-mono font-black text-white mt-1">
                ${analysis.forecasts.fifteenMin.targetPrice.toLocaleString()}
              </div>
              <div className="text-xs font-mono text-[#A7A4B8] mt-2 space-y-1 pt-2 border-t border-white/[0.07]">
                <div className="flex justify-between">
                  <span>Stop Loss:</span>
                  <span className="text-[#F4A6A6] font-bold">${analysis.forecasts.fifteenMin.stopLossPrice.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>ความมั่นใจ:</span>
                  <span className="text-teal-400 font-bold">{analysis.forecasts.fifteenMin.confidencePct}%</span>
                </div>
                <p className="text-[11px] text-[#A7A4B8] mt-2 pt-1 border-t border-white/[0.07]/60 leading-tight">
                  {analysis.forecasts.fifteenMin.reasoningTh}
                </p>
              </div>
            </div>

            {/* 1 Hour */}
            <div className="p-4 rounded-xl bg-[#141725] border border-white/[0.07] hover:border-purple-500/50 transition-all">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-mono font-bold text-[#ECEAF4]">
                  {analysis.forecasts.oneHour.timeframeLabelTh}
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-sm bg-[#A89FFF]/20 text-[#A89FFF] font-bold border border-purple-500/40">
                  {analysis.forecasts.oneHour.actionLabelTh}
                </span>
              </div>
              <div className="text-xl font-mono font-black text-white mt-1">
                ${analysis.forecasts.oneHour.targetPrice.toLocaleString()}
              </div>
              <div className="text-xs font-mono text-[#A7A4B8] mt-2 space-y-1 pt-2 border-t border-white/[0.07]">
                <div className="flex justify-between">
                  <span>แนวรับสำคัญ:</span>
                  <span className="text-[#A89FFF] font-bold">${analysis.forecasts.oneHour.stopLossPrice.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>ความมั่นใจ:</span>
                  <span className="text-[#A89FFF] font-bold">{analysis.forecasts.oneHour.confidencePct}%</span>
                </div>
                <p className="text-[11px] text-[#A7A4B8] mt-2 pt-1 border-t border-white/[0.07]/60 leading-tight">
                  {analysis.forecasts.oneHour.reasoningTh}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 4: TRADER TONE COPY BOX */}
        <div className="p-4 rounded-xl bg-[#141725] border border-white/[0.07]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono font-bold text-[#A7A4B8] flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-[#FFB86B]" />
              สรุปสไตล์เทรดเดอร์ (สั้น คม มีตัวเลข ไม่เวิ่นเว้อ)
            </span>
            <button
              type="button"
              onClick={handleCopyTraderText}
              className="text-xs font-mono text-[#7EE0B5] hover:underline flex items-center gap-1 cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'คัดลอกแล้ว' : 'คัดลอกข้อความ'}</span>
            </button>
          </div>
          <pre className="text-xs font-mono text-[#ECEAF4] whitespace-pre-wrap bg-[#141725] p-3 rounded-lg border border-white/[0.07]/80 leading-relaxed overflow-x-auto">
            {analysis.rawTraderTextTh}
          </pre>
        </div>

        {/* SECTION 5: CRITICAL RISK WARNING */}
        <div className="p-3.5 rounded-xl bg-[#F4A6A6]/10 border border-rose-500/30 flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-[#F4A6A6] shrink-0 mt-0.5" />
          <div className="text-xs font-mono">
            <span className="text-[#F4A6A6] font-black">คำเตือนความเสี่ยงสำคัญ: </span>
            <span className="text-rose-200">
              การเทรดมีความเสี่ยง — ห้ามแนะนำหรือเปิดสัญญาเทรดเกินตัว (ห้าม Overtrade) จำกัดความเสี่ยงไม่เกิน 2% ของพอร์ต ข้อมูลและการคำนวณทั้งหมดเป็นแบบจำลองเชิงสถิติและความน่าจะเป็นเท่านั้น
            </span>
          </div>
        </div>
      </>
    )}
  </div>
</div>
);
};
