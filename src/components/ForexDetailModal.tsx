import React, { useState } from 'react';
import {
  X,
  Sparkles,
  Bot,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
  CheckCircle2,
  BookmarkCheck,
  Gauge,
  RefreshCw,
  TrendingUp,
  ShieldAlert,
} from 'lucide-react';
import {
  ForexPair,
  TradingSignal,
  AiAnalysisResult,
  TradingHistoryEntry,
  MarketSentimentScore,
} from '../types';
import {
  analyzeMarketWithGemini,
  fetchMarketSentimentScore,
} from '../services/geminiService';
import { useModalA11y } from '../hooks/useModalA11y';
import {
  formatNumber,
  momentumLabel,
  validateTradingSignal,
  INCONSISTENT_SIGNAL_LABEL,
} from '../utils';

interface ForexDetailModalProps {
  forex: ForexPair | null;
  signal?: TradingSignal;
  geminiApiKey: string;
  onSaveToHistory?: (
    entry: Omit<TradingHistoryEntry, 'id' | 'userId' | 'timestamp'>
  ) => Promise<void>;
  onDismiss: () => void;
}

export const ForexDetailModal: React.FC<ForexDetailModalProps> = ({
  forex,
  signal: initialSignal,
  geminiApiKey,
  onSaveToHistory,
  onDismiss,
}) => {
  const [activeTab, setActiveTab] = useState<'gemini' | 'tech' | 'risk' | 'ai'>('gemini');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiResult, setAiResult] = useState<AiAnalysisResult | null>(null);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Market Sentiment
  const [sentiment, setSentiment] = useState<MarketSentimentScore | null>(null);
  const [isFetchingSentiment, setIsFetchingSentiment] = useState(false);

  const dialogRef = useModalA11y({ onClose: onDismiss, enabled: !!forex });
  if (!forex) return null;

  const [base, quote] = forex.pair.includes('/')
    ? forex.pair.split('/')
    : [forex.pair.slice(0, 3), forex.pair.slice(3)];

  const isLong = forex.change >= 0;
  const decimals = forex.price < 10 ? 4 : 2;

  // Fallback or matched signal
  const activeSignal: TradingSignal = initialSignal || forex.signal || {
    id: `fx-${forex.pair.toLowerCase().replace('/', '')}`,
    symbol: forex.pair,
    base,
    quote,
    type: isLong ? 'LONG' : 'SHORT',
    price: forex.price,
    change: forex.change,
    probability: Math.min(94, Math.max(65, Math.round(72 + Math.abs(forex.change) * 4))),
    statusText: isLong ? 'ขาขึ้น (Bullish Trend)' : 'ขาลง (Bearish Trend)',
    timeframe: '4H / 1D',
    reason: isLong
      ? 'ส่วนต่างดอกเบี้ยและโมเมนตัมหนุนการแข็งค่า'
      : 'แรงกดดันจากดอลลาร์สหรัฐและการชะลอตัวของเศรษฐกิจ',
    etfFlow: 'Interbank Flow',
    tags: ['Forex', 'Macro', 'Central Bank', 'Interest Rate'],
    sl: isLong ? forex.price * 0.985 : forex.price * 1.015,
    tp: isLong ? forex.price * 1.025 : forex.price * 0.975,
    similarity: Math.min(95, Math.max(70, Math.round(75 + Math.abs(forex.change) * 3))),
    sources: ['Central Bank Rate', 'Macro CPI Index', 'Interbank Depth'],
    category: 'FOREX',
    support: isLong ? forex.price * 0.988 : forex.price * 0.975,
    resistance: isLong ? forex.price * 1.022 : forex.price * 1.012,
  };

  const formatPrice = (val?: number) =>
    val === undefined || val === null ? '-' : `${formatNumber(val, decimals)} ${quote}`;

  const supportVal = activeSignal.support || (isLong ? forex.price * 0.988 : forex.price * 0.975);
  const resistanceVal = activeSignal.resistance || (isLong ? forex.price * 1.022 : forex.price * 1.012);

  const displayPrice = formatPrice(forex.price);
  const displaySupport = formatPrice(supportVal);
  const displayResistance = formatPrice(resistanceVal);
  const displaySl = formatPrice(activeSignal.sl);
  const displayTp = formatPrice(activeSignal.tp);

  const supDistancePercent = Math.abs((1.0 - supportVal / forex.price) * 100).toFixed(2);
  const resDistancePercent = Math.abs((resistanceVal / forex.price - 1.0) * 100).toFixed(2);
  const slPercent = Math.abs((1.0 - activeSignal.sl / forex.price) * 100).toFixed(2);
  const tpPercent = Math.abs((activeSignal.tp / forex.price - 1.0) * 100).toFixed(2);

  // ตรวจ SL/TP เทียบกับราคาตลาดจริง (forex.price) ไม่ใช่ราคาในสัญญาณ
  const signalValidation = validateTradingSignal({
    type: activeSignal.type,
    price: forex.price,
    sl: activeSignal.sl,
    tp: activeSignal.tp,
  });

  const handleFetchSentiment = async () => {
    setIsFetchingSentiment(true);
    try {
      const forexCoin = {
        id: forex.pair.toLowerCase().replace('/', ''),
        symbol: forex.pair,
        name: `${base}/${quote}`,
        binanceSymbol: forex.pair,
        price: forex.price,
        change: forex.change,
      };
      const scoreData = await fetchMarketSentimentScore(geminiApiKey, forexCoin, activeSignal);
      setSentiment(scoreData);
    } catch (err) {
      console.warn('Sentiment fetch warning:', err);
    } finally {
      setIsFetchingSentiment(false);
    }
  };

  const handleRunAiAnalysis = async () => {
    setIsAnalyzing(true);
    setSavedSuccess(false);
    try {
      const forexCoin = {
        id: forex.pair.toLowerCase().replace('/', ''),
        symbol: forex.pair,
        name: `${base}/${quote}`,
        binanceSymbol: forex.pair,
        price: forex.price,
        change: forex.change,
      };

      const result = await analyzeMarketWithGemini(geminiApiKey, forexCoin, activeSignal);
      setAiResult(result);
      if ((result as any).sentiment) {
        setSentiment((result as any).sentiment);
      }

      if (onSaveToHistory) {
        await onSaveToHistory({
          type: 'AI_ANALYSIS',
          symbol: forex.pair,
          action: result.action,
          price: forex.price,
          aiSummary:
            result.summary +
            (result.strategyAdvice ? `\n\nกลยุทธ์: ${result.strategyAdvice}` : ''),
          confidence: result.confidence,
          sl: result.supportLevel,
          tp: result.resistanceLevel,
        });
        setSavedSuccess(true);
      }
    } catch (err) {
      console.warn('Forex AI Analysis Error:', err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleManualSave = async () => {
    if (onSaveToHistory) {
      await onSaveToHistory({
        type: 'SIGNAL_SAVED',
        symbol: forex.pair,
        action: activeSignal.type,
        price: forex.price,
        aiSummary: `สัญญาณ Forex ${activeSignal.type} ที่ระดับราคา ${displayPrice} (ความมั่นใจ ${activeSignal.probability}%) - ${activeSignal.reason}`,
        confidence: activeSignal.probability,
        sl: activeSignal.sl,
        tp: activeSignal.tp,
      });
      setSavedSuccess(true);
    }
  };

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="รายละเอียดคู่เงิน"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-xs p-0 sm:p-4 overflow-y-auto"
      onClick={onDismiss}
      data-testid="forex_detail_sheet"
    >
      <div
        className="w-full sm:max-w-xl bg-[#141725] border-t sm:border border-white/[0.07] rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile drag handle */}
        <div className="w-10 h-1 bg-[#222640] rounded-full mx-auto mb-3 sm:hidden" />

        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.07] pb-4">
          <div className="flex items-center space-x-3">
            <div className="w-11 h-11 rounded-2xl bg-[#0F1117] border border-white/[0.07] flex items-center justify-center text-sm font-bold text-[#A89FFF]">
              {base}
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-1.5">
                <h2 className="text-white font-extrabold text-lg leading-tight">
                  {forex.pair}
                </h2>
                <span
                  className={`px-2 py-0.5 rounded-lg text-xs font-bold border ${
                    isLong
                      ? 'bg-[#7EE0B5]/15 border-[#7EE0B5]/40 text-[#7EE0B5]'
                      : 'bg-[#FFB86B]/15 border-[#FFB86B]/40 text-[#FFB86B]'
                  }`}
                >
                  {activeSignal.type}
                </span>
                <span className="bg-[#7C6CFF]/20 border border-[#7C6CFF]/40 text-[#A89FFF] text-xs font-semibold px-2 py-0.5 rounded-lg">
                  {activeSignal.probability}% มั่นใจ
                </span>
                <span className="bg-[#7EE0B5]/20 border border-[#7EE0B5]/40 text-[#7EE0B5] text-[10px] font-bold px-1.5 py-0.5 rounded">
                  FOREX
                </span>
              </div>
              <p className="text-[#A7A4B8] text-xs mt-0.5">
                {displayPrice} • {forex.change >= 0 ? '+' : ''}
                {forex.change.toFixed(2)}% • 4H / 1D Timeframe
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onDismiss}
            className="w-8 h-8 rounded-full bg-[#222640] hover:bg-[#343B52] flex items-center justify-center text-white transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Support & Resistance (แนวรับ / แนวต้าน) Highlight Card */}
        <div className="mt-4 rounded-2xl bg-[#0F1117] border border-white/[0.07] p-3.5 sm:p-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <TrendingUp className="w-4 h-4 text-[#7C6CFF]" />
              <span className="text-white text-xs font-bold">
                กรอบราคาแนวรับ - แนวต้าน (Support & Resistance)
              </span>
            </div>
            <span className="text-[10px] text-[#A7A4B8] font-mono">
              Interbank Pivot & Swings
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {/* Support Box */}
            <div className="bg-[#7EE0B5]/10 border border-[#7EE0B5]/30 rounded-xl p-3">
              <div className="flex items-center justify-between">
                <span className="text-[#7EE0B5] text-xs font-bold flex items-center space-x-1">
                  <span className="w-2 h-2 rounded-full bg-[#7EE0B5]" />
                  <span>แนวรับ (Support)</span>
                </span>
                <span className="text-[10px] text-[#A7A4B8]">-{supDistancePercent}%</span>
              </div>
              <div className="mt-1 text-white font-mono font-black text-base sm:text-lg">
                {displaySupport}
              </div>
              <p className="text-[10px] text-[#A7A4B8] mt-0.5">
                จุดพิจารณาตั้ง SL / รองรับแรงซื้อ
              </p>
            </div>

            {/* Resistance Box */}
            <div className="bg-[#FFB86B]/10 border border-[#FFB86B]/30 rounded-xl p-3">
              <div className="flex items-center justify-between">
                <span className="text-[#FFB86B] text-xs font-bold flex items-center space-x-1">
                  <span className="w-2 h-2 rounded-full bg-[#FFB86B]" />
                  <span>แนวต้าน (Resistance)</span>
                </span>
                <span className="text-[10px] text-[#A7A4B8]">+{resDistancePercent}%</span>
              </div>
              <div className="mt-1 text-white font-mono font-black text-base sm:text-lg">
                {displayResistance}
              </div>
              <p className="text-[10px] text-[#A7A4B8] mt-0.5">
                จุดพิจารณาแบ่งทำกำไร (TP)
              </p>
            </div>
          </div>
        </div>

        {/* Market Sentiment Score Card */}
        <div className="mt-4 rounded-2xl bg-[#0F1117] border border-white/[0.07] p-3.5 sm:p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-6 h-6 rounded-lg bg-[#7C6CFF]/20 border border-[#7C6CFF]/40 flex items-center justify-center text-[#A89FFF]">
                <Gauge className="w-3.5 h-3.5" />
              </div>
              <div>
                <div className="flex items-center space-x-1.5">
                  <span className="text-white text-xs font-bold">
                    Forex Sentiment Score
                  </span>
                  <span className="text-[9px] bg-[#7C6CFF]/20 text-[#A89FFF] border border-[#7C6CFF]/30 px-1.5 py-0.2 rounded-md font-mono">
                    {sentiment?.source === 'GEMINI_AI' ? 'GEMINI AI' : 'INTERBANK'}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              {sentiment && (
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border ${
                    sentiment.score >= 76
                      ? 'bg-[#7EE0B5]/15 border-[#7EE0B5]/40 text-[#7EE0B5]'
                      : sentiment.score >= 56
                      ? 'bg-[#7EE0B5]/15 border-[#7EE0B5]/40 text-[#7EE0B5]'
                      : sentiment.score >= 45
                      ? 'bg-[#FFB86B]/15 border-amber-500/40 text-[#FFB86B]'
                      : sentiment.score >= 25
                      ? 'bg-orange-500/15 border-orange-500/40 text-orange-400'
                      : 'bg-[#FFB86B]/15 border-[#FFB86B]/40 text-[#FFB86B]'
                  }`}
                >
                  {sentiment.sentimentTextTh}
                </span>
              )}

              <button
                type="button"
                onClick={handleFetchSentiment}
                disabled={isFetchingSentiment}
                className="p-1.5 rounded-lg bg-[#141725] hover:bg-[#222640] text-[#A7A4B8] hover:text-white transition-colors cursor-pointer disabled:opacity-50"
                title="รีเฟรช Sentiment ด้วย Gemini API"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${
                    isFetchingSentiment ? 'animate-spin text-[#7C6CFF]' : ''
                  }`}
                />
              </button>
            </div>
          </div>

          {isFetchingSentiment && !sentiment ? (
            <div className="py-4 flex items-center justify-center space-x-2 text-xs text-[#A7A4B8]">
              <Loader2 className="w-4 h-4 animate-spin text-[#7C6CFF]" />
              <span>กำลังดึงคะแนน Forex Sentiment จาก Gemini API...</span>
            </div>
          ) : sentiment ? (
            <div className="space-y-2.5">
              <div className="flex items-baseline justify-between">
                <div className="flex items-baseline space-x-1.5">
                  <span className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                    {sentiment.score}
                  </span>
                  <span className="text-xs text-[#A7A4B8]">/ 100</span>
                  <span className="text-[11px] text-[#A89FFF] font-semibold ml-1">
                    [{sentiment.sentimentLabel.replace('_', ' ')}]
                  </span>
                </div>

                <div className="flex items-center space-x-2.5 text-[10px] text-[#A7A4B8]">
                  <span className="flex items-center space-x-1">
                    <span>สถาบันการเงิน:</span>
                    <strong
                      className={`font-semibold ${
                        sentiment.whaleActivity === 'ACCUMULATION'
                          ? 'text-[#7EE0B5]'
                          : sentiment.whaleActivity === 'DISTRIBUTION'
                          ? 'text-[#FFB86B]'
                          : 'text-white'
                      }`}
                    >
                      {sentiment.whaleActivity === 'ACCUMULATION'
                        ? 'เข้าซื้อสุทธิ'
                        : sentiment.whaleActivity === 'DISTRIBUTION'
                        ? 'ขายสุทธิ'
                        : 'สมดุล'}
                    </strong>
                  </span>
                  <span>•</span>
                  <span className="flex items-center space-x-1">
                    <span>โฟลว์ข่าว:</span>
                    <strong className="text-white font-semibold">
                      {sentiment.socialMomentum === 'HIGH'
                        ? 'ผันผวนสูง'
                        : sentiment.socialMomentum === 'LOW'
                        ? 'เงียบสงบ'
                        : 'ปานกลาง'}
                    </strong>
                  </span>
                </div>
              </div>

              {/* Progress bar */}
              <div className="relative w-full h-2.5 bg-[#141725] rounded-full overflow-hidden shadow-inner">
                <div className="absolute inset-0 bg-linear-to-r from-[#FFB86B] via-amber-400 via-emerald-400 to-[#7EE0B5]" />
                <div
                  className="absolute top-0 bottom-0 w-2 bg-white shadow-lg rounded-full -ml-1 transition-all duration-500 border border-black/20"
                  style={{
                    left: `${Math.min(98, Math.max(2, sentiment.score))}%`,
                  }}
                />
              </div>

              {/* Scale Labels */}
              <div className="flex justify-between text-[9px] text-[#A7A4B8] font-mono">
                <span>0 (Strong Sell)</span>
                <span>50 (Neutral)</span>
                <span>100 (Strong Buy)</span>
              </div>

              {/* Summary Reason */}
              {sentiment.summaryReason && (
                <div className="pt-2 border-t border-white/[0.07]/70 text-[11px] text-[#A7A4B8] leading-relaxed flex items-start space-x-1.5">
                  <span className="text-[#A89FFF] shrink-0">💡</span>
                  <span className="text-[#ECEAF4]">{sentiment.summaryReason}</span>
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* 4 Tabs */}
        <div className="mt-4 flex overflow-x-auto gap-1 bg-[#0F1117] rounded-2xl p-1 border border-white/[0.07] [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          <button
            type="button"
            onClick={() => setActiveTab('gemini')}
            className={`flex-1 px-3 py-2 text-xs font-semibold rounded-xl transition-colors whitespace-nowrap min-w-fit flex items-center justify-center space-x-1 ${
              activeTab === 'gemini'
                ? 'bg-[#7C6CFF] text-[#0F1117] font-bold shadow-xs'
                : 'text-[#A7A4B8] hover:text-white'
            }`}
          >
            <Bot className="w-3.5 h-3.5" />
            <span>AI Analysis</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('tech')}
            className={`flex-1 px-3 py-2 text-xs font-semibold rounded-xl transition-colors whitespace-nowrap min-w-fit ${
              activeTab === 'tech'
                ? 'bg-white text-black font-bold'
                : 'text-[#A7A4B8] hover:text-white'
            }`}
          >
            เทคนิคอล
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('risk')}
            className={`flex-1 px-3 py-2 text-xs font-semibold rounded-xl transition-colors whitespace-nowrap min-w-fit ${
              activeTab === 'risk'
                ? 'bg-white text-black font-bold'
                : 'text-[#A7A4B8] hover:text-white'
            }`}
          >
            SL / TP
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('ai')}
            className={`flex-1 px-3 py-2 text-xs font-semibold rounded-xl transition-colors whitespace-nowrap min-w-fit ${
              activeTab === 'ai'
                ? 'bg-white text-black font-bold'
                : 'text-[#A7A4B8] hover:text-white'
            }`}
          >
            Similarity
          </button>
        </div>

        {/* Tab Contents */}
        <div className="mt-4">
          {/* Gemini AI Tab */}
          {activeTab === 'gemini' && (
            <div className="space-y-4">
              <div className="rounded-2xl bg-linear-to-r from-[#1E2235] to-[#141622] border border-[#7C6CFF]/30 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Sparkles className="w-4 h-4 text-[#A89FFF]" />
                    <span className="text-white font-bold text-xs">
                      Forex Macro & Live AI Intelligence
                    </span>
                  </div>
                  <span className="text-[10px] bg-[#7EE0B5]/15 border border-[#7EE0B5]/30 text-[#7EE0B5] px-2 py-0.5 rounded-full font-bold">
                    LIVE SYNC
                  </span>
                </div>

                <p className="text-xs text-[#A7A4B8] leading-relaxed">
                  ประมวลผลข้อมูลคู่เงิน {forex.pair} อัตราดอกเบี้ยธนาคารกลาง ดัชนีเงินเฟ้อ CPI/GDP และระดับแนวรับแนวต้านด้วย AI Engine พร้อมบันทึกประวัติซิงค์กับบัญชี Google อัตโนมัติ
                </p>

                {/* Run Button */}
                <button
                  type="button"
                  onClick={handleRunAiAnalysis}
                  disabled={isAnalyzing}
                  className="w-full bg-[#7C6CFF] hover:bg-[#6a5ad7] text-[#0F1117] font-bold text-xs py-2.5 rounded-xl transition-colors flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50"
                >
                  {isAnalyzing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>กำลังประมวลผลด้วย AI Engine...</span>
                    </>
                  ) : (
                    <>
                      <Bot className="w-4 h-4" />
                      <span>กดเพื่อวิเคราะห์คู่เงินด้วย AI & ซิงค์ลงประวัติ</span>
                    </>
                  )}
                </button>
              </div>

              {/* Analysis Result Box */}
              {aiResult && (
                <div className="rounded-2xl bg-[#0F1117] border border-white/[0.07] p-4 space-y-3 animate-fade-in">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span
                        className={`text-xs font-bold px-2.5 py-0.5 rounded-md ${
                          aiResult.action === 'LONG'
                            ? 'bg-[#7EE0B5]/20 text-[#7EE0B5]'
                            : aiResult.action === 'SHORT'
                            ? 'bg-[#FFB86B]/20 text-[#FFB86B]'
                            : 'bg-[#222640] text-[#ECEAF4]'
                        }`}
                      >
                        {aiResult.action === 'LONG' ? (
                          <ArrowUpRight className="w-3.5 h-3.5 inline mr-1" />
                        ) : (
                          <ArrowDownRight className="w-3.5 h-3.5 inline mr-1" />
                        )}
                        สัญญาณแนะนำ: {aiResult.action}
                      </span>
                      <span className="text-xs text-[#A89FFF] font-semibold">
                        ความมั่นใจ {aiResult.confidence}%
                      </span>
                    </div>

                    <span className="text-[10px] text-[#A7A4B8]">
                      {aiResult.source === 'GEMINI_AI' ? 'Gemini AI' : 'Technical Engine'}
                    </span>
                  </div>

                  {/* Summary */}
                  <div className="text-xs text-[#ECEAF4] leading-relaxed whitespace-pre-line bg-[#141725] p-3 rounded-xl border border-white/[0.07]">
                    {aiResult.summary}
                  </div>

                  {/* Support & Resistance AI Derived */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-[#141725] p-2.5 rounded-xl border border-white/[0.07]">
                      <span className="text-[#A7A4B8] text-[10px] block">
                        แนวรับ AI (Support)
                      </span>
                      <span className="text-[#7EE0B5] font-bold font-mono">
                        {formatPrice(aiResult.supportLevel)}
                      </span>
                    </div>
                    <div className="bg-[#141725] p-2.5 rounded-xl border border-white/[0.07]">
                      <span className="text-[#A7A4B8] text-[10px] block">
                        แนวต้าน AI (Resistance)
                      </span>
                      <span className="text-[#FFB86B] font-bold font-mono">
                        {formatPrice(aiResult.resistanceLevel)}
                      </span>
                    </div>
                  </div>

                  {/* Drivers & Risks */}
                  {((aiResult.keyDrivers && aiResult.keyDrivers.length > 0) ||
                    (aiResult.risks && aiResult.risks.length > 0)) && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      {aiResult.keyDrivers && aiResult.keyDrivers.length > 0 && (
                        <div className="bg-[#141725] p-2.5 rounded-xl border border-white/[0.07]">
                          <span className="text-[#7EE0B5] font-bold text-[10px] block mb-1">
                            🎯 ปัจจัยขับเคลื่อน:
                          </span>
                          <ul className="list-disc list-inside text-[#ECEAF4] text-[11px] space-y-0.5">
                            {aiResult.keyDrivers.map((d, i) => (
                              <li key={i}>{d}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {aiResult.risks && aiResult.risks.length > 0 && (
                        <div className="bg-[#141725] p-2.5 rounded-xl border border-white/[0.07]">
                          <span className="text-[#FFB86B] font-bold text-[10px] block mb-1">
                            ⚠️ ปัจจัยเสี่ยงที่ต้องระวัง:
                          </span>
                          <ul className="list-disc list-inside text-[#ECEAF4] text-[11px] space-y-0.5">
                            {aiResult.risks.map((r, i) => (
                              <li key={i}>{r}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  {aiResult.strategyAdvice && (
                    <div className="text-[11px] text-[#A7A4B8] bg-[#141725] p-2.5 rounded-xl border border-white/[0.07]">
                      <span className="text-white font-semibold block mb-0.5">
                        กลยุทธ์ที่แนะนำ:
                      </span>
                      {aiResult.strategyAdvice}
                    </div>
                  )}

                  {savedSuccess && (
                    <div className="p-2 rounded-xl bg-[#7EE0B5]/15 border border-[#7EE0B5]/30 text-[#7EE0B5] text-xs flex items-center justify-center space-x-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>ซิงค์และบันทึกลงในประวัติบัญชี Google สำเร็จเรียบร้อย!</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'tech' && (
            <div className="space-y-2.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="bg-[#0F1117] border border-white/[0.07] rounded-xl p-3">
                  <span className="text-[#A7A4B8] text-[10px] block">สถานะสัญญาณ</span>
                  <p className="text-white text-xs font-bold mt-0.5">{activeSignal.statusText}</p>
                  <p className="text-[#A7A4B8] text-[10px] mt-0.5 leading-snug">
                    {activeSignal.reason}
                  </p>
                </div>

                <div className="bg-[#0F1117] border border-white/[0.07] rounded-xl p-3">
                  <span className="text-[#A7A4B8] text-[10px] block">
                    EMA & Momentum ({activeSignal?.timeframe ?? '24H'})
                  </span>
                  <p
                    className="text-xs font-bold mt-0.5 text-[#A89FFF]"
                    data-testid="momentum-label-forex"
                  >
                    {momentumLabel({
                      changePct: forex.change,
                      timeframe: activeSignal?.timeframe ?? '24H',
                      direction: activeSignal?.type,
                    })}
                  </p>
                  <p className="text-[#A7A4B8] text-[10px] mt-0.5 leading-snug">
                    EMA20 / EMA50 Dynamic Bands • เทียบกับแนวโน้มหลักของสัญญาณ
                  </p>
                </div>
              </div>

              {/* Support & Resistance Technical Details */}
              <div className="bg-[#0F1117] border border-white/[0.07] rounded-xl p-3 space-y-2">
                <span className="text-white text-xs font-bold block">
                  ระดับราคาทางเทคนิคที่สำคัญ (Key Forex Levels)
                </span>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-[#141725] p-2 rounded-lg">
                    <span className="text-[#7EE0B5] text-[10px] font-bold block">
                      แนวรับหลัก (Major Support):
                    </span>
                    <span className="text-white font-mono font-bold">
                      {displaySupport}
                    </span>
                    <span className="text-[#A7A4B8] text-[9px] block">
                      กรอบราคาต่ำสุด 90 วัน / Swing Low
                    </span>
                  </div>
                  <div className="bg-[#141725] p-2 rounded-lg">
                    <span className="text-[#FFB86B] text-[10px] font-bold block">
                      แนวต้านหลัก (Major Resistance):
                    </span>
                    <span className="text-white font-mono font-bold">
                      {displayResistance}
                    </span>
                    <span className="text-[#A7A4B8] text-[9px] block">
                      กรอบราคาสูงสุด 90 วัน / Swing High
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-[#0F1117] border border-white/[0.07] rounded-xl p-3">
                <span className="text-[#A7A4B8] text-[10px] block">
                  สภาพคล่องและโฟลว์การซื้อขาย (Interbank FX Liquidity)
                </span>
                <p className="text-white text-xs font-bold mt-0.5">
                  {forex.pair} Liquidity Flow: {activeSignal.etfFlow}
                </p>
                <p className="text-[#A7A4B8] text-[10px] mt-0.5">
                  ประมาณการปริมาณธุรกรรมจากสถานะราคาและทิศทางของคู่เงิน (ตัวเลขโดยประมาณ ไม่ใช่ข้อมูล Interbank จริง)
                </p>
              </div>
            </div>
          )}

          {activeTab === 'risk' && (
            <div className="bg-[#0F1117] border border-white/[0.07] rounded-2xl p-4 space-y-3">
              <h4 className="text-white text-xs font-bold flex items-center space-x-1.5">
                <ShieldAlert className="w-4 h-4 text-[#FFB86B]" />
                <span>การบริหารความเสี่ยง • SL/TP & แนวรับ-แนวต้าน Forex</span>
              </h4>

              {signalValidation.valid ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="bg-[#FFB86B]/15 border border-[#FFB86B]/40 rounded-xl p-3">
                    <span className="text-[#FFB86B] text-[11px] block font-medium">
                      Stop Loss (SL)
                    </span>
                    <span className="text-white font-mono font-bold text-sm block mt-0.5">
                      {displaySl}
                    </span>
                    <span className="text-[#A7A4B8] text-[10px] block mt-0.5">
                      -{slPercent}% จากจุดเข้า (ใต้แนวรับ {displaySupport})
                    </span>
                  </div>

                  <div className="bg-[#7EE0B5]/15 border border-[#7EE0B5]/40 rounded-xl p-3">
                    <span className="text-[#7EE0B5] text-[11px] block font-medium">
                      Take Profit (TP)
                    </span>
                    <span className="text-white font-mono font-bold text-sm block mt-0.5">
                      {displayTp}
                    </span>
                    <span className="text-[#A7A4B8] text-[10px] block mt-0.5">
                      +{tpPercent}% เป้ากำไร (ใกล้แนวต้าน {displayResistance})
                    </span>
                  </div>
                </div>
              ) : (
                <div
                  className="bg-[#FFB86B]/15 border border-[#FFB86B]/40 rounded-xl p-3 space-y-1"
                  role="alert"
                  data-testid="forex-signal-inconsistent-warning"
                >
                  <p className="text-[#FFB86B] text-xs font-bold">
                    {INCONSISTENT_SIGNAL_LABEL}
                  </p>
                  <p className="text-[#A7A4B8] text-[10px] leading-snug">
                    {signalValidation.detail} — ซ่อนตัวเลข SL/TP ไว้จนกว่าข้อมูลจะถูกแก้ไข
                  </p>
                  <p className="text-[#A7A4B8] text-[10px] leading-snug">
                    ราคาตลาดปัจจุบัน {displayPrice} • {activeSignal.type}
                  </p>
                </div>
              )}

              <div className="space-y-1.5 text-xs text-[#A7A4B8] pt-1">
                <p>• คำนวณ Lot Size และ Pip Value ให้เหมาะสม ไม่เสี่ยงเกิน 1-2% ของพอร์ต</p>
                <p>• ติดตามข่าวเศรษฐกิจ Non-Farm, CPI, ดอกเบี้ย Fed/ECB/BoJ ระวัง Spread ขยายตัว</p>
                <p>• หากราคาหลุดตัดผ่านแนวรับหลักและชนจุด SL ให้ตัดขาดทุนทันทีตามวินัย</p>
              </div>
            </div>
          )}

          {activeTab === 'ai' && (
            <div className="bg-[#0F1117] border border-white/[0.07] rounded-2xl p-4 space-y-3">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 rounded-full bg-[#7C6CFF]/20 border border-[#7C6CFF] flex items-center justify-center text-sm font-bold text-[#A89FFF]">
                  {activeSignal.similarity}%
                </div>
                <div>
                  <h4 className="text-white text-xs font-bold">
                    Momentum Score (โมเมนตัมเทคนิคัล)
                  </h4>
                  <p className="text-[#A7A4B8] text-[11px] mt-0.5">
                    ประเมินจากขนาดการเปลี่ยนแปลงราคา 24 ชม. และแนวโน้มทิศทางของคู่เงิน (โดยประมาณ ไม่ใช่ผลลัพธ์ AI)
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {activeSignal.sources.map((src) => (
                  <div
                    key={src}
                    className="bg-[#141725] border border-white/[0.07] rounded-lg py-1.5 px-3 text-xs text-[#A7A4B8]"
                  >
                    {src}
                  </div>
                ))}
              </div>

              <p className="text-[#A7A4B8] text-[10px]">
                Tags: {activeSignal.tags.join(' • ')} • วิเคราะห์อิงระดับแนวรับ {displaySupport} / แนวต้าน {displayResistance}
              </p>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="mt-5 pt-3 border-t border-white/[0.07] flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleManualSave}
            className="flex items-center space-x-1.5 text-xs text-[#A89FFF] hover:text-white bg-[#0F1117] border border-white/[0.07] px-3.5 py-2 rounded-xl transition-colors cursor-pointer"
          >
            <BookmarkCheck className="w-4 h-4" />
            <span>บันทึกสัญญาณนี้ลงประวัติ</span>
          </button>

          <button
            type="button"
            onClick={onDismiss}
            className="text-xs bg-[#222640] hover:bg-[#32384D] text-white px-4 py-2 rounded-xl font-semibold transition-colors cursor-pointer"
          >
            ปิด
          </button>
        </div>
      </div>
    </div>
  );
};
