import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  RotateCcw,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Activity,
  Clock,
  ShieldCheck,
  Check,
  Copy,
  Send,
  Layers,
  BarChart2,
  Cpu,
  Terminal,
  Zap,
  DollarSign,
  Percent,
} from 'lucide-react';
import {
  StrategyId,
  STRATEGY_DEFINITIONS,
  BacktestConfig,
  BacktestResult,
  BacktestProgressTicker,
  runBacktestWithProgress,
} from '../services/backtestService';
import { CryptoCoin } from '../types';

interface BacktestingDashboardProps {
  cryptoList?: CryptoCoin[];
  isDark?: boolean;
  onSendToChat?: (text: string) => void;
}

const AVAILABLE_ASSETS = [
  { symbol: 'BTC/USDT', name: 'Bitcoin', category: 'CRYPTO', defaultPrice: 80080 },
  { symbol: 'ETH/USDT', name: 'Ethereum', category: 'CRYPTO', defaultPrice: 3420 },
  { symbol: 'SOL/USDT', name: 'Solana', category: 'CRYPTO', defaultPrice: 212 },
  { symbol: 'NVDA', name: 'Nvidia Corporation', category: 'US_STOCK', defaultPrice: 142.3 },
  { symbol: 'AAPL', name: 'Apple Inc.', category: 'US_STOCK', defaultPrice: 232.5 },
  { symbol: 'TSLA', name: 'Tesla Inc.', category: 'US_STOCK', defaultPrice: 218.4 },
  { symbol: 'AOT', name: 'Airports of Thailand', category: 'THAI_STOCK', defaultPrice: 58.25 },
  { symbol: 'DELTA', name: 'Delta Electronics', category: 'THAI_STOCK', defaultPrice: 154.5 },
  { symbol: 'USD/THB', name: 'US Dollar / Thai Baht', category: 'FOREX', defaultPrice: 33.45 },
  { symbol: 'EUR/USD', name: 'Euro / US Dollar', category: 'FOREX', defaultPrice: 1.085 },
];

export const BacktestingDashboard: React.FC<BacktestingDashboardProps> = ({
  cryptoList = [],
  onSendToChat,
}) => {
  // Strategy Configuration State
  const [selectedStrategyId, setSelectedStrategyId] = useState<StrategyId>('RSI_CROSSOVER');
  const [selectedAssetSymbol, setSelectedAssetSymbol] = useState<string>('BTC/USDT');
  const [selectedTimeframe, setSelectedTimeframe] = useState<'1m' | '15m' | '1h' | '1d'>('15m');
  const [selectedPeriodDays, setSelectedPeriodDays] = useState<number>(90);
  const [initialCapital, setInitialCapital] = useState<number>(10000);
  const [riskPerTradePct, setRiskPerTradePct] = useState<number>(2);

  // Execution & Live Status Ticker State
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [progressTicker, setProgressTicker] = useState<BacktestProgressTicker | null>(null);
  const [tickerLogs, setTickerLogs] = useState<string[]>([]);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [sentToChat, setSentToChat] = useState(false);

  const logEndRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll ticker logs
  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [tickerLogs]);

  // Current selected strategy definition
  const strategyDef =
    STRATEGY_DEFINITIONS.find((s) => s.id === selectedStrategyId) || STRATEGY_DEFINITIONS[0];

  // Resolve current price from live cryptoList or default fallback
  const getCurrentPrice = (symbol: string): number => {
    if (symbol.startsWith('BTC')) {
      const btc = cryptoList.find((c) => c.symbol === 'BTC');
      if (btc && btc.price > 0) return btc.price;
    }
    if (symbol.startsWith('ETH')) {
      const eth = cryptoList.find((c) => c.symbol === 'ETH');
      if (eth && eth.price > 0) return eth.price;
    }
    if (symbol.startsWith('SOL')) {
      const sol = cryptoList.find((c) => c.symbol === 'SOL');
      if (sol && sol.price > 0) return sol.price;
    }
    const found = AVAILABLE_ASSETS.find((a) => a.symbol === symbol);
    return found ? found.defaultPrice : 80000;
  };

  // Run backtest handler with progressive status updates
  const handleExecuteBacktest = async () => {
    if (isRunning) return;
    setIsRunning(true);
    setTickerLogs([]);

    const config: BacktestConfig = {
      strategyId: selectedStrategyId,
      assetSymbol: selectedAssetSymbol,
      timeframe: selectedTimeframe,
      periodDays: selectedPeriodDays,
      initialCapital,
      riskPerTradePct,
    };

    const currentPrice = getCurrentPrice(selectedAssetSymbol);

    try {
      const res = await runBacktestWithProgress(config, currentPrice, (ticker) => {
        setProgressTicker(ticker);
        setTickerLogs((prev) => [
          ...prev,
          `[${new Date().toLocaleTimeString('th-TH')}] ${ticker.activeLogMessage}`,
        ]);
      });
      setResult(res);
    } catch (err) {
      console.error('Backtest error:', err);
    } finally {
      setIsRunning(false);
    }
  };

  // Run initial backtest once on mount so dashboard leads with data
  useEffect(() => {
    handleExecuteBacktest();
  }, []);

  const handleCopyResults = () => {
    if (!result) return;
    navigator.clipboard.writeText(result.summaryTh);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendToAiChat = () => {
    if (!result || !onSendToChat) return;
    onSendToChat(
      `🧪 [ATS BACKTESTING AUDIT // ${result.strategyName}]\n` +
      `สินทรัพย์: ${result.assetSymbol} (${result.timeframe} • ${result.periodDays} วัน)\n` +
      `• Win Rate: ${result.winRatePct}% (${result.winningTrades}/${result.totalTrades} ชนะ)\n` +
      `• Sharpe Ratio: ${result.sharpeRatio}\n` +
      `• ผลตอบแทนสุทธิ: +${result.totalReturnPct}% ($${result.netProfitUsd.toLocaleString()})\n` +
      `• เทียบกับ Buy & Hold: ${result.benchmarkReturnPct}%\n` +
      `• Max Drawdown (MDD): ${result.maxDrawdownPct}%\n` +
      `• Profit Factor: ${result.profitFactor}x | Win/Loss Ratio: ${result.winLossRatio}\n\n` +
      `ขอคำแนะนำ AI Deep Analyze: กลยุทธ์นี้ควรปรับจูนพารามิเตอร์หรือเพิ่มการกรองสัญญาณอย่างไรในสภาวะตลาดปัจจุบัน?`
    );
    setSentToChat(true);
    setTimeout(() => setSentToChat(false), 2500);
  };

  return (
    <div className="space-y-5">
      {/* SECTION HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#00FF66]/15 border border-[#00FF66]/40 flex items-center justify-center text-[#00FF66] shadow-[0_0_15px_rgba(0,255,102,0.2)]">
            <Cpu className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-mono font-bold text-sm sm:text-base text-white tracking-tight">
                ATS Backtesting Engine &amp; Strategy Lab
              </h3>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-sm bg-[#7C6CFF]/15 border border-[#7C6CFF]/40 text-[#7C6CFF] font-bold">
                HISTORICAL SIMULATION
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono">
              จำลองกลยุทธ์ย้อนหลัง คำนวณ Win Rate, Sharpe Ratio, และ Max Drawdown พร้อม Live Status Ticker
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {result && (
            <button
              type="button"
              onClick={handleCopyResults}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-mono text-slate-300 hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer"
              title="คัดลอกผลการทดสอบ"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-[#00FF66]" /> : <Copy className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{copied ? 'คัดลอกแล้ว' : 'คัดลอกผล'}</span>
            </button>
          )}

          {onSendToChat && result && (
            <button
              type="button"
              onClick={handleSendToAiChat}
              className="px-3 py-1.5 rounded-xl bg-[#7C6CFF]/20 hover:bg-[#7C6CFF]/30 border border-[#7C6CFF]/50 text-xs font-mono font-bold text-[#7C6CFF] flex items-center gap-1.5 transition-all cursor-pointer shadow-[0_0_12px_rgba(124,108,255,0.2)]"
              title="ส่งผลทดสอบเข้าห้อง AI Deep Analyze เพื่อขอคำแนะนำปรับพอร์ต"
            >
              {sentToChat ? <Check className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />}
              <span>{sentToChat ? 'ส่งสำเร็จ!' : 'ปรึกษา AI'}</span>
            </button>
          )}
        </div>
      </div>

      {/* STRATEGY & ASSET CONFIGURATION BAR */}
      <div className="p-4 rounded-xl bg-[#10141E] border border-slate-800 space-y-3.5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 text-xs font-mono">
          {/* 1. Strategy Selector */}
          <div className="space-y-1 sm:col-span-2">
            <label className="text-slate-400 text-[11px] font-bold uppercase flex items-center gap-1">
              <Zap className="w-3.5 h-3.5 text-[#00FF66]" />
              เลือกกลยุทธ์ (Strategy)
            </label>
            <select
              value={selectedStrategyId}
              onChange={(e) => setSelectedStrategyId(e.target.value as StrategyId)}
              disabled={isRunning}
              className="w-full bg-[#0A0D14] border border-slate-700 rounded-lg px-3 py-2 text-white font-mono text-xs outline-none focus:border-[#00FF66] transition-colors cursor-pointer"
            >
              {STRATEGY_DEFINITIONS.map((def) => (
                <option key={def.id} value={def.id} className="bg-[#10141E]">
                  {def.nameTh}
                </option>
              ))}
            </select>
          </div>

          {/* 2. Asset Selector */}
          <div className="space-y-1">
            <label className="text-slate-400 text-[11px] font-bold uppercase flex items-center gap-1">
              <Activity className="w-3.5 h-3.5 text-[#00F0FF]" />
              สินทรัพย์ (Asset)
            </label>
            <select
              value={selectedAssetSymbol}
              onChange={(e) => setSelectedAssetSymbol(e.target.value)}
              disabled={isRunning}
              className="w-full bg-[#0A0D14] border border-slate-700 rounded-lg px-3 py-2 text-white font-mono text-xs outline-none focus:border-[#7C6CFF] transition-colors cursor-pointer"
            >
              {AVAILABLE_ASSETS.map((a) => (
                <option key={a.symbol} value={a.symbol} className="bg-[#10141E]">
                  {a.symbol} ({a.category})
                </option>
              ))}
            </select>
          </div>

          {/* 3. Timeframe */}
          <div className="space-y-1">
            <label className="text-slate-400 text-[11px] font-bold uppercase flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              กรอบเวลา (TF)
            </label>
            <select
              value={selectedTimeframe}
              onChange={(e) => setSelectedTimeframe(e.target.value as '1m' | '15m' | '1h' | '1d')}
              disabled={isRunning}
              className="w-full bg-[#0A0D14] border border-slate-700 rounded-lg px-3 py-2 text-white font-mono text-xs outline-none focus:border-amber-400 transition-colors cursor-pointer"
            >
              <option value="1m" className="bg-[#10141E]">1 นาที (Scalping)</option>
              <option value="15m" className="bg-[#10141E]">15 นาที (Intraday)</option>
              <option value="1h" className="bg-[#10141E]">1 ชั่วโมง (Swing)</option>
              <option value="1d" className="bg-[#10141E]">1 วัน (Position)</option>
            </select>
          </div>

          {/* 4. Lookback Period */}
          <div className="space-y-1">
            <label className="text-slate-400 text-[11px] font-bold uppercase flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-purple-400" />
              ย้อนหลัง (Period)
            </label>
            <select
              value={selectedPeriodDays}
              onChange={(e) => setSelectedPeriodDays(Number(e.target.value))}
              disabled={isRunning}
              className="w-full bg-[#0A0D14] border border-slate-700 rounded-lg px-3 py-2 text-white font-mono text-xs outline-none focus:border-purple-400 transition-colors cursor-pointer"
            >
              <option value={30} className="bg-[#10141E]">30 วัน</option>
              <option value={90} className="bg-[#10141E]">90 วัน (แนะนำ)</option>
              <option value={180} className="bg-[#10141E]">180 วัน (ครึ่งปี)</option>
              <option value={365} className="bg-[#10141E]">1 ปี (เต็มรอบ)</option>
            </select>
          </div>

          {/* 5. Initial Capital & Risk */}
          <div className="space-y-1">
            <label className="text-slate-400 text-[11px] font-bold uppercase flex items-center gap-1">
              <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
              เงินต้น ($)
            </label>
            <select
              value={initialCapital}
              onChange={(e) => setInitialCapital(Number(e.target.value))}
              disabled={isRunning}
              className="w-full bg-[#0A0D14] border border-slate-700 rounded-lg px-3 py-2 text-white font-mono text-xs outline-none focus:border-emerald-400 transition-colors cursor-pointer"
            >
              <option value={5000} className="bg-[#10141E]">$5,000</option>
              <option value={10000} className="bg-[#10141E]">$10,000</option>
              <option value={25000} className="bg-[#10141E]">$25,000</option>
              <option value={50000} className="bg-[#10141E]">$50,000</option>
            </select>
          </div>

          {/* 6. Risk per Trade */}
          <div className="space-y-1">
            <label className="text-slate-400 text-[11px] font-bold uppercase flex items-center gap-1">
              <Percent className="w-3.5 h-3.5 text-rose-400" />
              ความเสี่ยง/ไม้
            </label>
            <select
              value={riskPerTradePct}
              onChange={(e) => setRiskPerTradePct(Number(e.target.value))}
              disabled={isRunning}
              className="w-full bg-[#0A0D14] border border-slate-700 rounded-lg px-3 py-2 text-white font-mono text-xs outline-none focus:border-rose-400 transition-colors cursor-pointer"
            >
              <option value={1} className="bg-[#10141E]">1% (Safe)</option>
              <option value={2} className="bg-[#10141E]">2% (แนะนำ)</option>
              <option value={3} className="bg-[#10141E]">3% (Moderate)</option>
              <option value={5} className="bg-[#10141E]">5% (Aggressive)</option>
            </select>
          </div>
        </div>

        {/* Strategy Description & Run Button */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-800/80">
          <p className="text-xs font-mono text-slate-300 leading-relaxed flex items-center gap-1.5">
            <span className="text-[#00FF66] font-bold shrink-0">▶ กลยุทธ์:</span>
            <span>{strategyDef.descriptionTh}</span>
          </p>

          <button
            type="button"
            onClick={handleExecuteBacktest}
            disabled={isRunning}
            className={`px-5 py-2 rounded-xl text-xs font-mono font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shrink-0 shadow-lg ${
              isRunning
                ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                : 'bg-[#7C6CFF] hover:bg-[#6A58F0] text-[#0F1117] font-extrabold shadow-[0_6px_18px_rgba(124,108,255,0.28)]'
            }`}
          >
            {isRunning ? (
              <>
                <RotateCcw className="w-4 h-4 animate-spin text-[#00FF66]" />
                <span>กำลังประมวลผล Backtest...</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-black" />
                <span>รันการทดสอบ (RUN BACKTEST)</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* LIVE STATUS TICKER (Real-Time Progress, Currently Tested Asset, Projected Completion Time) */}
      {(isRunning || progressTicker) && (
        <div className="rounded-xl border border-[#7C6CFF]/40 bg-[#0A0E18] p-4 space-y-3 relative overflow-hidden shadow-[0_0_20px_rgba(124,108,255,0.1)]">
          {/* Top Ticker Status Row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-mono">
            <div className="flex items-center gap-2">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  isRunning ? 'bg-[#00F0FF]' : 'bg-[#00FF66]'
                }`}
              />
              <span className="font-bold text-white uppercase tracking-wider">
                {isRunning ? '⚡ LIVE STATUS TICKER: IN PROGRESS' : '✓ BACKTEST COMPLETED'}
              </span>
              <span className="text-slate-500">|</span>
              <span className="text-[#00F0FF] font-bold">
                สินทรัพย์: {progressTicker?.currentAsset || selectedAssetSymbol}
              </span>
            </div>

            <div className="flex items-center gap-3 text-slate-400 text-[11px]">
              <span>
                ความเร็ว:{' '}
                <strong className="text-white">
                  {progressTicker?.candlesPerSec || 840} แท่ง/วินาที
                </strong>
              </span>
              <span>·</span>
              <span className="text-amber-300 font-bold flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                {isRunning
                  ? `เวลาที่คาดการณ์: ~${progressTicker?.estimatedRemainingSec || 1.2}s`
                  : `ใช้เวลาทั้งหมด: ${result?.executionTimeMs || 420}ms`}
              </span>
            </div>
          </div>

          {/* Animated Progress Bar */}
          <div className="space-y-1">
            <div className="flex justify-between text-[11px] font-mono">
              <span className="text-slate-300 flex items-center gap-1">
                <span className="text-[#00FF66] font-bold">
                  {progressTicker?.stageLabelTh || 'ประมวลผลโมเดล'}
                </span>
                <span className="text-slate-500">
                  ({progressTicker?.processedCandles || 0} / {progressTicker?.totalCandles || 1000} แท่งเทียน)
                </span>
              </span>
              <span className="font-bold text-[#00F0FF]">
                {progressTicker?.percent || 0}%
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-slate-900 overflow-hidden border border-slate-800">
              <div
                className="h-full bg-gradient-to-r from-[#00FF66] via-[#00F0FF] to-[#38BDF8] transition-all duration-150 rounded-full shadow-[0_0_10px_rgba(0,255,102,0.5)]"
                style={{ width: `${progressTicker?.percent || 0}%` }}
              />
            </div>
          </div>

          {/* Live Streaming Terminal Logs (Collapsible or compact) */}
          <div className="bg-[#05070B] rounded-lg border border-slate-800/90 p-2.5 max-h-24 overflow-y-auto font-mono text-[11px] text-slate-400 space-y-1">
            <div className="flex items-center justify-between text-[10px] text-slate-500 pb-1 border-b border-slate-800/60 uppercase">
              <span className="flex items-center gap-1">
                <Terminal className="w-3 h-3 text-[#00FF66]" />
                Live Execution Stream
              </span>
              <span>Worker Node #1</span>
            </div>
            {tickerLogs.map((log, idx) => (
              <div key={idx} className="flex items-start gap-1.5 leading-snug">
                <span className="text-[#00FF66]">›</span>
                <span className={idx === tickerLogs.length - 1 ? 'text-[#00F0FF] font-bold' : ''}>
                  {log}
                </span>
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </div>
      )}

      {/* PERFORMANCE METRICS CARDS (Win Rate, Sharpe Ratio, Profit Factor, Drawdown) */}
      {result && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Metric 1: WIN RATE */}
            <div className="p-4 rounded-xl bg-[#10141E] border border-slate-800 relative overflow-hidden group hover:border-[#00FF66]/50 transition-all">
              <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-[#00FF66] to-transparent opacity-80" />
              <div className="flex items-center justify-between text-slate-400 text-xs font-mono mb-1">
                <span className="flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#00FF66]" />
                  WIN RATE
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-[#00FF66]/10 border border-[#00FF66]/30 text-[#00FF66] font-bold">
                  {result.winningTrades}/{result.totalTrades} ชนะ
                </span>
              </div>
              <div className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-[#00FF66] mt-1">
                {result.winRatePct}%
              </div>
              <div className="flex items-center justify-between text-xs font-mono mt-2 pt-2 border-t border-slate-800/80 text-slate-400">
                <span>Losses: {result.losingTrades}</span>
                <span className="text-[#00FF66] font-bold">W/L: {result.winLossRatio}x</span>
              </div>
            </div>

            {/* Metric 2: SHARPE RATIO */}
            <div className="p-4 rounded-xl bg-[#10141E] border border-slate-800 relative overflow-hidden group hover:border-[#7C6CFF]/50 transition-all">
              <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-[#7C6CFF] to-transparent opacity-80" />
              <div className="flex items-center justify-between text-slate-400 text-xs font-mono mb-1">
                <span className="flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-[#7C6CFF]" />
                  SHARPE RATIO
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-[#7C6CFF]/10 border border-[#7C6CFF]/30 text-[#7C6CFF] font-bold">
                  RISK-ADJUSTED
                </span>
              </div>
              <div className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-[#00F0FF] mt-1">
                {result.sharpeRatio}
              </div>
              <div className="flex items-center justify-between text-xs font-mono mt-2 pt-2 border-t border-slate-800/80 text-slate-400">
                <span>เกณฑ์มาตรฐาน: &gt;1.5</span>
                <span className="text-[#00F0FF] font-bold">ระดับสถาบัน</span>
              </div>
            </div>

            {/* Metric 3: TOTAL RETURN & NET PROFIT */}
            <div className="p-4 rounded-xl bg-[#10141E] border border-slate-800 relative overflow-hidden group hover:border-emerald-500/50 transition-all">
              <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent opacity-80" />
              <div className="flex items-center justify-between text-slate-400 text-xs font-mono mb-1">
                <span className="flex items-center gap-1">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                  TOTAL NET RETURN
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 font-bold">
                  PROFIT FACTOR {result.profitFactor}x
                </span>
              </div>
              <div className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-emerald-400 mt-1 flex items-baseline gap-1.5">
                <span>+{result.totalReturnPct}%</span>
                <span className="text-xs text-slate-400 font-normal">
                  (+${result.netProfitUsd.toLocaleString()})
                </span>
              </div>
              <div className="flex items-center justify-between text-xs font-mono mt-2 pt-2 border-t border-slate-800/80 text-slate-400">
                <span>เงินต้น $10,000</span>
                <span className="text-emerald-300 font-bold">${result.finalEquity.toLocaleString()}</span>
              </div>
            </div>

            {/* Metric 4: MAX DRAWDOWN (MDD) */}
            <div className="p-4 rounded-xl bg-[#10141E] border border-slate-800 relative overflow-hidden group hover:border-[#f9df7b]/50 transition-all">
              <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-[#f9df7b] to-transparent opacity-80" />
              <div className="flex items-center justify-between text-slate-400 text-xs font-mono mb-1">
                <span className="flex items-center gap-1">
                  <TrendingDown className="w-3.5 h-3.5 text-[#f9df7b]" />
                  MAX DRAWDOWN
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-[#f9df7b]/10 border border-[#f9df7b]/30 text-[#f9df7b] font-bold">
                  PEAK-TO-TROUGH
                </span>
              </div>
              <div className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-[#f9df7b] mt-1">
                {result.maxDrawdownPct}%
              </div>
              <div className="flex items-center justify-between text-xs font-mono mt-2 pt-2 border-t border-slate-800/80 text-slate-400">
                <span>B&amp;H Return: {result.benchmarkReturnPct}%</span>
                <span className="text-amber-400 font-bold">Alpha: +{(result.totalReturnPct - result.benchmarkReturnPct).toFixed(1)}%</span>
              </div>
            </div>
          </div>

          {/* VISUAL EQUITY CURVE & BENCHMARK COMPARISON */}
          <div className="p-4 sm:p-5 rounded-xl bg-[#10141E] border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-[#00FF66]" />
                <h4 className="text-xs sm:text-sm font-mono font-bold text-white">
                  Cumulative Equity Curve ({result.strategyName} vs Buy &amp; Hold)
                </h4>
              </div>
              <div className="flex items-center gap-3 text-xs font-mono">
                <span className="flex items-center gap-1.5 text-[#00FF66]">
                  <span className="w-3 h-0.5 bg-[#00FF66] inline-block" />
                  Strategy Equity (${result.finalEquity.toLocaleString()})
                </span>
                <span className="flex items-center gap-1.5 text-slate-500 hidden sm:flex">
                  <span className="w-3 h-0.5 bg-slate-500 inline-block border-dashed" />
                  Benchmark Buy &amp; Hold
                </span>
              </div>
            </div>

            {/* SVG Visual Equity Curve */}
            <div className="w-full h-44 bg-[#0A0D14] rounded-lg border border-slate-800 p-2 relative flex items-center">
              {result.equityCurve.length > 1 && (
                <svg className="w-full h-full overflow-visible" viewBox="0 0 500 120" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#00FF66" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="#00FF66" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>

                  {/* Horizontal grid lines */}
                  <line x1="0" y1="30" x2="500" y2="30" stroke="#1E293B" strokeWidth="0.8" strokeDasharray="3 3" />
                  <line x1="0" y1="60" x2="500" y2="60" stroke="#1E293B" strokeWidth="0.8" strokeDasharray="3 3" />
                  <line x1="0" y1="90" x2="500" y2="90" stroke="#1E293B" strokeWidth="0.8" strokeDasharray="3 3" />

                  {/* Benchmark Line (Gray) */}
                  <polyline
                    fill="none"
                    stroke="#475569"
                    strokeWidth="1.2"
                    strokeDasharray="4 4"
                    points={result.equityCurve
                      .map((pt, i) => {
                        const x = (i / (result.equityCurve.length - 1)) * 500;
                        const min = Math.min(...result.equityCurve.map((p) => p.benchmarkEquity));
                        const max = Math.max(...result.equityCurve.map((p) => p.benchmarkEquity), result.finalEquity);
                        const range = Math.max(1, max - min);
                        const y = 110 - ((pt.benchmarkEquity - min) / range) * 95;
                        return `${x},${y}`;
                      })
                      .join(' ')}
                  />

                  {/* Strategy Area Fill */}
                  <polygon
                    points={`0,118 ${result.equityCurve
                      .map((pt, i) => {
                        const x = (i / (result.equityCurve.length - 1)) * 500;
                        const min = Math.min(...result.equityCurve.map((p) => p.equity), result.initialCapital * 0.9);
                        const max = Math.max(...result.equityCurve.map((p) => p.equity));
                        const range = Math.max(1, max - min);
                        const y = 110 - ((pt.equity - min) / range) * 95;
                        return `${x},${y}`;
                      })
                      .join(' ')} 500,118`}
                    fill="url(#equityGrad)"
                  />

                  {/* Strategy Line (Bright Neon Green) */}
                  <polyline
                    fill="none"
                    stroke="#00FF66"
                    strokeWidth="2.5"
                    points={result.equityCurve
                      .map((pt, i) => {
                        const x = (i / (result.equityCurve.length - 1)) * 500;
                        const min = Math.min(...result.equityCurve.map((p) => p.equity), result.initialCapital * 0.9);
                        const max = Math.max(...result.equityCurve.map((p) => p.equity));
                        const range = Math.max(1, max - min);
                        const y = 110 - ((pt.equity - min) / range) * 95;
                        return `${x},${y}`;
                      })
                      .join(' ')}
                  />
                </svg>
              )}

              <div className="absolute top-2 left-3 text-[10px] font-mono text-slate-500">
                Peak Equity: ${result.finalEquity.toLocaleString()}
              </div>
              <div className="absolute bottom-2 right-3 text-[10px] font-mono text-[#00FF66] font-bold">
                Alpha: +{(result.totalReturnPct - result.benchmarkReturnPct).toFixed(1)}% vs B&amp;H
              </div>
            </div>
          </div>

          {/* TRADE LOG AUDIT TABLE */}
          <div className="p-4 sm:p-5 rounded-xl bg-[#10141E] border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs sm:text-sm font-mono font-bold text-white flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-[#00F0FF]" />
                Recent Simulated Trade Logs ({result.tradeLogs.length} รายการล่าสุด)
              </h4>
              <span className="text-[11px] font-mono text-slate-400">
                กำไรเฉลี่ย: +{result.avgWinPct}% | ขาดทุนเฉลี่ย: -{result.avgLossPct}%
              </span>
            </div>

            <div className="overflow-x-auto [&::-webkit-scrollbar]:hidden">
              <table className="w-full text-left font-mono text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-[10px] text-slate-400 uppercase">
                    <th className="py-2 px-2">เวลาออก</th>
                    <th className="py-2 px-2">ประเภท</th>
                    <th className="py-2 px-2">ราคาเข้า</th>
                    <th className="py-2 px-2">ราคาออก</th>
                    <th className="py-2 px-2">ผลลัพธ์ PnL</th>
                    <th className="py-2 px-2 text-right">ยอดคงเหลือ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {result.tradeLogs.slice(0, 8).map((trade) => (
                    <tr key={trade.id} className="hover:bg-slate-900/50 transition-colors">
                      <td className="py-2 px-2 text-slate-300">{trade.exitTime}</td>
                      <td className="py-2 px-2">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            trade.type === 'LONG'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          }`}
                        >
                          {trade.type}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-slate-300">${trade.entryPrice.toLocaleString()}</td>
                      <td className="py-2 px-2 text-slate-300">${trade.exitPrice.toLocaleString()}</td>
                      <td className="py-2 px-2">
                        <span
                          className={`font-bold ${
                            trade.isWin ? 'text-[#00FF66]' : 'text-rose-400'
                          }`}
                        >
                          {trade.isWin ? '+' : ''}
                          {trade.pnlPct}% ({trade.pnlUsd >= 0 ? '+' : ''}${trade.pnlUsd})
                        </span>
                      </td>
                      <td className="py-2 px-2 text-right font-bold text-white">
                        ${trade.cumulativeEquity.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
