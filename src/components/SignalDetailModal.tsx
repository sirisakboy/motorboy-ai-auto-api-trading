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
import { useMascotStore } from '../services/mascotService';
import {
  TradingSignal,
  CryptoCoin,
  AiAnalysisResult,
  TradingHistoryEntry,
  MarketSentimentScore,
} from '../types';
import {
  analyzeMarketWithGemini,
  fetchMarketSentimentScore,
} from '../services/geminiService';
import { t } from '../i18n';
import { useModalA11y } from '../hooks/useModalA11y';

interface SignalDetailModalProps {
  signal: TradingSignal | null;
  coin?: CryptoCoin;
  useThb: boolean;
  usdThbRate?: number;
  geminiApiKey: string;
  onSaveToHistory?: (
    entry: Omit<TradingHistoryEntry, 'id' | 'userId' | 'timestamp'>
  ) => Promise<void>;
  onDismiss: () => void;
}

export const SignalDetailModal: React.FC<SignalDetailModalProps> = ({
  signal,
  coin,
  useThb,
  usdThbRate = 36.45,
  geminiApiKey,
  onSaveToHistory,
  onDismiss,
}) => {
  const [activeTab, setActiveTab] = useState<'gemini' | 'tech' | 'risk' | 'ai'>('gemini');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiResult, setAiResult] = useState<AiAnalysisResult | null>(null);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Market Sentiment Score state
  const [sentiment, setSentiment] = useState<MarketSentimentScore | null>(null);
  const [isFetchingSentiment, setIsFetchingSentiment] = useState(false);

  const dialogRef = useModalA11y({ onClose: onDismiss, enabled: !!signal });

  // Mascot Trigger: Scanning on modal open
  React.useEffect(() => {
    if (signal) {
      useMascotStore.getState().setMascotState('SCANNING', `กำลังวิเคราะห์เทคนิคอล ${signal.symbol} ให้ครับ...`);
    }
    return () => useMascotStore.getState().resetToIdle();
  }, [signal?.id]);

  if (!signal) return null;

  const isForex = signal.category === 'FOREX' || signal.symbol.includes('/');
  const isLong = signal.type === 'LONG';
    const decimals = isForex && signal.price < 10 ? 4 : 2;
  const multiplier = useThb && !isForex ? usdThbRate : 1;
  const currency = useThb && !isForex ? '฿' : isForex ? '' : '$';
  const quoteSuffix = isForex ? ` ${signal.quote}` : '';

  const targetCoin: CryptoCoin = coin || {
    id: signal.symbol.toLowerCase(),
    symbol: signal.symbol,
    name: signal.base,
    binanceSymbol: signal.symbol,
    price: signal.price,
    change: signal.change,
  };

  const formatPrice = (val?: number) => {
    if (val === undefined || val === null) return '-';
    const v = val * multiplier;
    return `${currency}${v.toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })}${quoteSuffix}`;
  };

  const handleFetchSentiment = async () => {
    if (!signal) return;
    setIsFetchingSentiment(true);
    try {
      const scoreData = await fetchMarketSentimentScore(geminiApiKey, targetCoin, signal);
      setSentiment(scoreData);
    } catch (err) {
      console.warn('Sentiment fetch warning:', err);
    } finally {
      setIsFetchingSentiment(false);
    }
  };

  const displayPrice = formatPrice(signal.price);
  const displaySl = formatPrice(signal.sl);
  const displayTp = formatPrice(signal.tp);

  // Support & Resistance levels from signal or calculation
  const supportVal = signal.support || (isLong ? signal.price * 0.95 : signal.price * 0.91);
  const resistanceVal = signal.resistance || (isLong ? signal.price * 1.12 : signal.price * 1.05);
  const displaySupport = formatPrice(supportVal);
  const displayResistance = formatPrice(resistanceVal);

  const supDistancePercent = Math.abs((1.0 - supportVal / signal.price) * 100).toFixed(1);
  const resDistancePercent = Math.abs((resistanceVal / signal.price - 1.0) * 100).toFixed(1);

  const slPercent = Math.abs((1.0 - signal.sl / signal.price) * 100).toFixed(1);
  const tpPercent = Math.abs((signal.tp / signal.price - 1.0) * 100).toFixed(1);

  const handleRunAiAnalysis = async () => {
    setIsAnalyzing(true);
    setSavedSuccess(false);
    try {
      const result = await analyzeMarketWithGemini(geminiApiKey, targetCoin, signal);
      setAiResult(result);
      if ((result as any).sentiment) {
        setSentiment((result as any).sentiment);
      }

      // Automatically sync to user's history in Firestore
      if (onSaveToHistory) {
        await onSaveToHistory({
          type: 'AI_ANALYSIS',
          symbol: signal.symbol,
          action: result.action,
          price: targetCoin.price,
          aiSummary:
            result.summary +
            (result.strategyAdvice ? `\n\n${t('signal_detail.ai_analysis.strategy')}${result.strategyAdvice}` : ''),
          confidence: result.confidence,
          sl: result.supportLevel,
          tp: result.resistanceLevel,
        });
        if (result.confidence > 85) {
           useMascotStore.getState().setMascotState('TP_CELEBRATE', `ว้าว! ความมั่นใจสูงมาก (${result.confidence}%) น่าสนใจมากครับไม้แนะนำนี้`);
        }
        setSavedSuccess(true);
      }
    } catch (err) {
      console.warn('AI Analysis failed:', err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleManualSave = async () => {
    if (onSaveToHistory) {
      await onSaveToHistory({
        type: 'SIGNAL_SAVED',
        symbol: signal.symbol,
        action: signal.type,
        price: targetCoin.price,
        aiSummary: `สัญญาณ ${signal.type} ที่ระดับราคา ${displayPrice} (ความน่าจะเป็น ${signal.probability}%) - ${signal.reason}`,
        confidence: signal.probability,
        sl: signal.sl,
        tp: signal.tp,
      });
      useMascotStore.getState().setMascotState('READY_TO_EXECUTE', `บันทึกสัญญาณ ${signal.symbol} แล้วครับ เตรียมตัวบิดให้เต็มเหนี่ยว!`);
      setSavedSuccess(true);
    }
  };

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="รายละเอียดสัญญาณเทรด"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-xs p-0 sm:p-4 overflow-y-auto"
      onClick={onDismiss}
      data-testid="signal_detail_sheet"
    >
      <div
        className="w-full sm:max-w-xl bg-[#1A1D29] border-t sm:border border-[#2A2E45] rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag Handle on mobile */}
        <div className="w-10 h-1 bg-[#2A2E45] rounded-full mx-auto mb-3 sm:hidden" />

        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#2A2E45] pb-4">
          <div className="flex items-center space-x-3">
            <div className="w-11 h-11 rounded-2xl bg-[#0F1117] border border-[#2A2E45] flex items-center justify-center text-sm font-bold text-[#A5B4FC]">
              {signal.base.slice(0, 3)}
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-1.5">
                <h2 className="text-white font-extrabold text-lg leading-tight">
                  {signal.base}/{signal.quote}
                </h2>
                <span
                  className={`px-2 py-0.5 rounded-lg text-xs font-bold border ${
                    isLong
                      ? 'bg-[#22C55E]/15 border-[#22C55E]/40 text-[#4ADE80]'
                      : 'bg-[#f9df7b]/15 border-[#f9df7b]/40 text-[#f9df7b]'
                  }`}
                >
                  {signal.type}
                </span>
                <span className="bg-[#7C6CFF]/20 border border-[#7C6CFF]/40 text-[#A5B4FC] text-xs font-semibold px-2 py-0.5 rounded-lg">
                  {signal.probability}{t('signal_detail.general.confidence')}
                </span>
                {isForex && (
                  <span className="bg-[#6366F1]/20 border border-[#6366F1]/40 text-[#A5B4FC] text-[10px] font-bold px-1.5 py-0.5 rounded">
                    FOREX
                  </span>
                )}
              </div>
              <p className="text-[#9CA3AF] text-xs mt-0.5">
                {displayPrice} • {signal.change >= 0 ? '+' : ''}
                {signal.change.toFixed(2)}% • {signal.timeframe}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onDismiss}
            className="w-8 h-8 rounded-full bg-[#2A2E45] hover:bg-[#343B52] flex items-center justify-center text-white transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Support & Resistance (แนวรับ / แนวต้าน) Highlight Card */}
        <div className="mt-4 rounded-2xl bg-[#0F1117] border border-[#2A2E45] p-3.5 sm:p-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <TrendingUp className="w-4 h-4 text-[#7C6CFF]" />
              <span className="text-white text-xs font-bold">
                {t('signal_detail.general.sr_grid_header')}
              </span>
            </div>
            <span className="text-[10px] text-[#9CA3AF] font-mono">
              90D Swing & Pivot Levels
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {/* Support Box */}
            <div className="bg-[#10B981]/10 border border-[#10B981]/30 rounded-xl p-3">
              <div className="flex items-center justify-between">
                <span className="text-[#34D399] text-xs font-bold flex items-center space-x-1">
                  <span className="w-2 h-2 rounded-full bg-[#10B981]" />
                  <span>{t('signal_detail.general.support_label')}</span>
                </span>
                <span className="text-[10px] text-[#9CA3AF]">-{supDistancePercent}%</span>
              </div>
              <div className="mt-1 text-white font-mono font-black text-base sm:text-lg">
                {displaySupport}
              </div>
              <p className="text-[10px] text-[#9CA3AF] mt-0.5">
                {t('signal_detail.general.support_tip')}
              </p>
            </div>

            {/* Resistance Box */}
            <div className="bg-[#f9df7b]/10 border border-[#f9df7b]/30 rounded-xl p-3">
              <div className="flex items-center justify-between">
                <span className="text-[#f9df7b] text-xs font-bold flex items-center space-x-1">
                  <span className="w-2 h-2 rounded-full bg-[#f9df7b]" />
                  <span>{t('signal_detail.general.resistance_label')}</span>
                </span>
                <span className="text-[10px] text-[#9CA3AF]">+{resDistancePercent}%</span>
              </div>
              <div className="mt-1 text-white font-mono font-black text-base sm:text-lg">
                {displayResistance}
              </div>
              <p className="text-[10px] text-[#9CA3AF] mt-0.5">
                {t('signal_detail.general.resistance_tip')}
              </p>
            </div>
          </div>
        </div>

        {/* Market Sentiment Score Card (Gemini AI Powered) */}
        <div className="mt-4 rounded-2xl bg-[#0F1117] border border-[#2A2E45] p-3.5 sm:p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-6 h-6 rounded-lg bg-[#7C6CFF]/20 border border-[#7C6CFF]/40 flex items-center justify-center text-[#A5B4FC]">
                <Gauge className="w-3.5 h-3.5" />
              </div>
              <div>
                <div className="flex items-center space-x-1.5">
                  <span className="text-white text-xs font-bold">
                    {t('signal_detail.sentiment.header')}
                  </span>
                  <span className="text-[9px] bg-[#7C6CFF]/20 text-[#A5B4FC] border border-[#7C6CFF]/30 px-1.5 py-0.2 rounded-md font-mono">
                    {sentiment?.source === 'GEMINI_AI' ? 'GEMINI AI' : 'LIVE TICK'}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              {sentiment && (
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border ${
                    sentiment.score >= 76
                      ? 'bg-[#22C55E]/15 border-[#22C55E]/40 text-[#4ADE80]'
                      : sentiment.score >= 56
                      ? 'bg-[#10B981]/15 border-[#10B981]/40 text-[#34D399]'
                      : sentiment.score >= 45
                      ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                      : sentiment.score >= 25
                      ? 'bg-orange-500/15 border-orange-500/40 text-orange-400'
                      : 'bg-[#f9df7b]/15 border-[#f9df7b]/40 text-[#f9df7b]'
                  }`}
                >
                  {sentiment.sentimentTextTh}
                </span>
              )}

              <button
                type="button"
                onClick={handleFetchSentiment}
                disabled={isFetchingSentiment}
                className="p-1.5 rounded-lg bg-[#1A1D29] hover:bg-[#2A2E45] text-[#9CA3AF] hover:text-white transition-colors cursor-pointer disabled:opacity-50"
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
            <div className="py-4 flex items-center justify-center space-x-2 text-xs text-[#9CA3AF]">
              <Loader2 className="w-4 h-4 animate-spin text-[#7C6CFF]" />
              <span>{t('signal_detail.sentiment.loading')}</span>
            </div>
          ) : sentiment ? (
            <div className="space-y-2.5">
              <div className="flex items-baseline justify-between">
                <div className="flex items-baseline space-x-1.5">
                  <span className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                    {sentiment.score}
                  </span>
                  <span className="text-xs text-[#909AAB]">/ 100</span>
                  <span className="text-[11px] text-[#A5B4FC] font-semibold ml-1">
                    [{sentiment.sentimentLabel.replace('_', ' ')}]
                  </span>
                </div>

                <div className="flex items-center space-x-2.5 text-[10px] text-[#9CA3AF]">
                  <span className="flex items-center space-x-1">
                    <span>วาฬ/กองทุน:</span>
                    <strong
                      className={`font-semibold ${
                        sentiment.whaleActivity === 'ACCUMULATION'
                          ? 'text-[#4ADE80]'
                          : sentiment.whaleActivity === 'DISTRIBUTION'
                          ? 'text-[#f9df7b]'
                          : 'text-white'
                      }`}
                    >
                      {sentiment.whaleActivity === 'ACCUMULATION'
                        ? t('signal_detail.sentiment.whale_acc')
                        : sentiment.whaleActivity === 'DISTRIBUTION'
                        ? t('signal_detail.sentiment.whale_dist')
                        : t('signal_detail.sentiment.whale_neutral')}
                    </strong>
                  </span>
                  <span>•</span>
                  <span className="flex items-center space-x-1">
                    <span>โซเชียล:</span>
                    <strong className="text-white font-semibold">
                      {sentiment.socialMomentum === 'HIGH'
                        ? t('signal_detail.sentiment.social_high')
                        : sentiment.socialMomentum === 'LOW'
                        ? t('signal_detail.sentiment.social_low')
                        : t('signal_detail.sentiment.social_mid')}
                    </strong>
                  </span>
                </div>
              </div>

              {/* Progress gradient bar with needle */}
              <div className="relative w-full h-2.5 bg-[#1A1D29] rounded-full overflow-hidden shadow-inner">
                <div className="absolute inset-0 bg-linear-to-r from-[#f9df7b] via-amber-400 via-emerald-400 to-[#22C55E]" />
                <div
                  className="absolute top-0 bottom-0 w-2 bg-white shadow-lg rounded-full -ml-1 transition-all duration-500 border border-black/20"
                  style={{
                    left: `${Math.min(98, Math.max(2, sentiment.score))}%`,
                  }}
                />
              </div>

              {/* Scale Labels */}
              <div className="flex justify-between text-[9px] text-[#909AAB] font-mono">
                <span>0 (Extreme Fear)</span>
                <span>50 (Neutral)</span>
                <span>100 (Extreme Greed)</span>
              </div>

              {/* Summary Reason & Safety Margin */}
              <div className="pt-2 border-t border-[#2A2E45]/70 text-[11px] text-[#9CA3AF] leading-relaxed space-y-2">
                {sentiment.summaryReason && (
                  <div className="flex items-start space-x-1.5">
                    <span className="text-[#A5B4FC] shrink-0">💡</span>
                    <span className="text-[#D1D5DB]">{sentiment.summaryReason}</span>
                  </div>
                )}
                <div className="flex items-center space-x-1.5 font-mono text-[10px] text-[#f9df7b]">
                  <ShieldAlert className="w-3 h-3" />
                  <span>Safety Margin (3-7 Days): {(sentiment.safetyMargin ?? 12).toFixed(1)}%</span>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* 4 Tabs */}
        <div className="mt-4 flex overflow-x-auto gap-1 bg-[#0F1117] rounded-2xl p-1 border border-[#2A2E45] [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          <button
            type="button"
            onClick={() => setActiveTab('gemini')}
            className={`flex-1 px-3 py-2 text-xs font-semibold rounded-xl transition-colors whitespace-nowrap min-w-fit flex items-center justify-center space-x-1 ${
              activeTab === 'gemini'
                ? 'bg-[#7C6CFF] text-white font-bold shadow-xs'
                : 'text-[#9CA3AF] hover:text-white'
            }`}
          >
            <Bot className="w-3.5 h-3.5" />
            <span>{t('signal_detail.tabs.ai')}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('tech')}
            className={`flex-1 px-3 py-2 text-xs font-semibold rounded-xl transition-colors whitespace-nowrap min-w-fit ${
              activeTab === 'tech'
                ? 'bg-white text-black font-bold'
                : 'text-[#9CA3AF] hover:text-white'
            }`}
          >
            {t('signal_detail.tabs.tech')}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('risk')}
            className={`flex-1 px-3 py-2 text-xs font-semibold rounded-xl transition-colors whitespace-nowrap min-w-fit ${
              activeTab === 'risk'
                ? 'bg-white text-black font-bold'
                : 'text-[#9CA3AF] hover:text-white'
            }`}
          >
            {t('signal_detail.tabs.risk')}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('ai')}
            className={`flex-1 px-3 py-2 text-xs font-semibold rounded-xl transition-colors whitespace-nowrap min-w-fit ${
              activeTab === 'ai'
                ? 'bg-white text-black font-bold'
                : 'text-[#9CA3AF] hover:text-white'
            }`}
          >
            {t('signal_detail.tabs.similarity')}
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
                    <Sparkles className="w-4 h-4 text-[#A5B4FC]" />
                    <span className="text-white font-bold text-xs">
                      {isForex ? t('signal_detail.ai_analysis.forex_header') : t('signal_detail.ai_analysis.crypto_header')}
                    </span>
                  </div>
                  <span className="text-[10px] bg-[#22C55E]/15 border border-[#22C55E]/30 text-[#4ADE80] px-2 py-0.5 rounded-full font-bold">
                    LIVE SYNC
                  </span>
                </div>

                <p className="text-xs text-[#9CA3AF] leading-relaxed">
                  {isForex
                    ? t('signal_detail.ai_analysis.forex_desc')
                    : t('signal_detail.ai_analysis.crypto_desc')}
                </p>

                {/* Run Button */}
                <button
                  type="button"
                  onClick={handleRunAiAnalysis}
                  disabled={isAnalyzing}
                  className="w-full bg-[#7C6CFF] hover:bg-[#6a5ad7] text-white font-bold text-xs py-2.5 rounded-xl transition-colors flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50"
                >
                  {isAnalyzing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{t('signal_detail.ai_analysis.analyze_loading')}</span>
                    </>
                  ) : (
                    <>
                      <Bot className="w-4 h-4" />
                      <span>{t('signal_detail.ai_analysis.analyze_btn')}</span>
                    </>
                  )}
                </button>
              </div>

              {/* Analysis Result Box */}
              {aiResult && (
                <div className="rounded-2xl bg-[#0F1117] border border-[#2A2E45] p-4 space-y-3 animate-fade-in">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span
                        className={`text-xs font-bold px-2.5 py-0.5 rounded-md ${
                          aiResult.action === 'LONG'
                            ? 'bg-[#22C55E]/20 text-[#4ADE80]'
                            : aiResult.action === 'SHORT'
                            ? 'bg-[#f9df7b]/20 text-[#f9df7b]'
                            : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        {aiResult.action === 'LONG' ? (
                          <ArrowUpRight className="w-3.5 h-3.5 inline mr-1" />
                        ) : (
                          <ArrowDownRight className="w-3.5 h-3.5 inline mr-1" />
                        )}
                        สัญญาณแนะนำ: {aiResult.action}
                      </span>
                      <span className="text-xs text-[#A5B4FC] font-semibold">
                        ความมั่นใจ {aiResult.confidence}%
                      </span>
                    </div>

                    <span className="text-[10px] text-[#909AAB]">
                      {aiResult.source === 'GEMINI_AI' ? 'Gemini AI' : 'Technical Engine'}
                    </span>
                  </div>

                  {/* Summary */}
                  <div className="text-xs text-[#D1D5DB] leading-relaxed whitespace-pre-line bg-[#1A1D29] p-3 rounded-xl border border-[#2A2E45]">
                    {aiResult.summary}
                  </div>

                  {/* Support & Resistance AI Derived */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-[#1A1D29] p-2.5 rounded-xl border border-[#2A2E45]">
                      <span className="text-[#909AAB] text-[10px] block">
                        {t('signal_detail.ai_analysis.ai_support')}
                      </span>
                      <span className="text-[#4ADE80] font-bold font-mono">
                        {formatPrice(aiResult.supportLevel)}
                      </span>
                    </div>
                    <div className="bg-[#1A1D29] p-2.5 rounded-xl border border-[#2A2E45]">
                      <span className="text-[#909AAB] text-[10px] block">
                        {t('signal_detail.ai_analysis.ai_resistance')}
                      </span>
                      <span className="text-[#f9df7b] font-bold font-mono">
                        {formatPrice(aiResult.resistanceLevel)}
                      </span>
                    </div>
                  </div>

                  {aiResult.strategyAdvice && (
                    <div className="text-[11px] text-[#9CA3AF] bg-[#1A1D29] p-2.5 rounded-xl border border-[#2A2E45]">
                      <span className="text-white font-semibold block mb-0.5">
                        {t('signal_detail.ai_analysis.strategy')}
                      </span>
                      {aiResult.strategyAdvice}
                    </div>
                  )}

                  {savedSuccess && (
                    <div className="p-2 rounded-xl bg-[#22C55E]/15 border border-[#22C55E]/30 text-[#4ADE80] text-xs flex items-center justify-center space-x-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{t('signal_detail.ai_analysis.saved_success')}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'tech' && (
            <div className="space-y-2.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="bg-[#0F1117] border border-[#2A2E45] rounded-xl p-3">
                  <span className="text-[#909AAB] text-[10px] block">สถานะสัญญาณ</span>
                  <p className="text-white text-xs font-bold mt-0.5">{signal.statusText}</p>
                  <p className="text-[#9CA3AF] text-[10px] mt-0.5 leading-snug">
                    {signal.reason}
                  </p>
                </div>

                <div className="bg-[#0F1117] border border-[#2A2E45] rounded-xl p-3">
                  <span className="text-[#909AAB] text-[10px] block">EMA & Momentum</span>
                  <p
                    className={`text-xs font-bold mt-0.5 ${
                      signal.change >= 0 ? 'text-[#4ADE80]' : 'text-[#f9df7b]'
                    }`}
                  >
                    {signal.change >= 0 ? 'โมเมนตัมบวก (Bullish)' : 'โมเมนตัมชะลอ (Bearish)'}
                  </p>
                  <p className="text-[#9CA3AF] text-[10px] mt-0.5 leading-snug">
                    EMA20 / EMA50 Dynamic Bands
                  </p>
                </div>
              </div>

              {/* Support & Resistance Technical Details */}
              <div className="bg-[#0F1117] border border-[#2A2E45] rounded-xl p-3 space-y-2">
                <span className="text-white text-xs font-bold block">
                  ระดับราคาทางเทคนิคที่สำคัญ (Key Levels)
                </span>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-[#1A1D29] p-2 rounded-lg">
                    <span className="text-[#34D399] text-[10px] font-bold block">
                      แนวรับหลัก (Major Support):
                    </span>
                    <span className="text-white font-mono font-bold">
                      {displaySupport}
                    </span>
                    <span className="text-[#909AAB] text-[9px] block">
                      กรอบราคาต่ำสุด 90 วัน / Swing Low
                    </span>
                  </div>
                  <div className="bg-[#1A1D29] p-2 rounded-lg">
                    <span className="text-[#f9df7b] text-[10px] font-bold block">
                      แนวต้านหลัก (Major Resistance):
                    </span>
                    <span className="text-white font-mono font-bold">
                      {displayResistance}
                    </span>
                    <span className="text-[#909AAB] text-[9px] block">
                      กรอบราคาสูงสุด 90 วัน / Swing High
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-[#0F1117] border border-[#2A2E45] rounded-xl p-3">
                <span className="text-[#909AAB] text-[10px] block">
                  สภาพคล่องและโฟลว์การซื้อขาย ({isForex ? 'Forex Liquidity' : 'Crypto ETF Flow'})
                </span>
                <p className="text-white text-xs font-bold mt-0.5">
                  {signal.symbol} Flow: {signal.etfFlow}
                </p>
                <p className="text-[#9CA3AF] text-[10px] mt-0.5">
                  {isForex
                    ? 'ประมาณการปริมาณธุรกรรมจากสถานะราคาและทิศทางของคู่เงิน (ตัวเลขโดยประมาณ)'
                    : 'ประเมินทิศทางกระแสเงินทุนจากแรงซื้อขายและโมเมนตัม 24 ชม. (ตัวเลขโดยประมาณ ไม่ใช่คำสั่ง Orderbook จริง)'}
                </p>
              </div>
            </div>
          )}

          {activeTab === 'risk' && (
            <div className="bg-[#0F1117] border border-[#2A2E45] rounded-2xl p-4 space-y-3">
              <h4 className="text-white text-xs font-bold flex items-center space-x-1.5">
                <ShieldAlert className="w-4 h-4 text-amber-400" />
                <span>การบริหารความเสี่ยง • SL/TP & แนวรับ-แนวต้าน</span>
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="bg-[#f9df7b]/15 border border-[#f9df7b]/40 rounded-xl p-3">
                  <span className="text-[#f9df7b] text-[11px] block font-medium">
                    Stop Loss (SL)
                  </span>
                  <span className="text-white font-mono font-bold text-sm block mt-0.5">
                    {displaySl}
                  </span>
                  <span className="text-[#909AAB] text-[10px] block mt-0.5">
                    -{slPercent}% จากจุดเข้า (ใต้แนวรับ {displaySupport})
                  </span>
                </div>

                <div className="bg-[#22C55E]/15 border border-[#22C55E]/40 rounded-xl p-3">
                  <span className="text-[#4ADE80] text-[11px] block font-medium">
                    Take Profit (TP)
                  </span>
                  <span className="text-white font-mono font-bold text-sm block mt-0.5">
                    {displayTp}
                  </span>
                  <span className="text-[#909AAB] text-[10px] block mt-0.5">
                    +{tpPercent}% เป้ากำไร (ใกล้แนวต้าน {displayResistance})
                  </span>
                </div>
              </div>

              <div className="space-y-1.5 text-xs text-[#9CA3AF] pt-1">
                <p>• ควบคุมความเสี่ยงต่อไม้ ไม่เกิน 1-2% ของพอร์ตการลงทุนทั้งหมด</p>
                <p>
                  • {isForex
                    ? 'ติดตามข่าวเศรษฐกิจ Non-Farm, CPI, ดอกเบี้ย Fed/ECB/BoJ ระวัง Spread กว้าง'
                    : 'ข่าวเศรษฐกิจมหภาค FOMC / CPI อาจผันผวนแรง ระวัง Gap ราคา'}
                </p>
                <p>• หากราคาหลุดตัดผ่านแนวรับหลักและชนจุด SL ให้ตัดขาดทุนทันทีตามวินัย</p>
              </div>
            </div>
          )}

          {activeTab === 'ai' && (
            <div className="bg-[#0F1117] border border-[#2A2E45] rounded-2xl p-4 space-y-3">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 rounded-full bg-[#7C6CFF]/20 border border-[#7C6CFF] flex items-center justify-center text-sm font-bold text-[#A5B4FC]">
                  {signal.similarity}%
                </div>
                <div>
                  <h4 className="text-white text-xs font-bold">
                    Momentum Score (โมเมนตัมเทคนิคัล)
                  </h4>
                  <p className="text-[#909AAB] text-[11px] mt-0.5">
                    {isForex
                      ? 'ประเมินจากขนาดการเปลี่ยนแปลงราคา 24 ชม. และแนวโน้มทิศทางของคู่เงิน (โดยประมาณ ไม่ใช่ผลลัพธ์ AI)'
                      : 'ประเมินจากขนาดการเปลี่ยนแปลงราคา 24 ชม. และแรงซื้อขายแต่ละเหรียญ (โดยประมาณ ไม่ใช่ผลลัพธ์ AI)'}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {signal.sources.map((src) => (
                  <div
                    key={src}
                    className="bg-[#1A1D29] border border-[#2A2E45] rounded-lg py-1.5 px-3 text-xs text-[#9CA3AF]"
                  >
                    {src}
                  </div>
                ))}
              </div>

              <p className="text-[#909AAB] text-[10px]">
                Tags: {signal.tags.join(' • ')} • วิเคราะห์อิงระดับแนวรับ {displaySupport} / แนวต้าน {displayResistance}
              </p>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="mt-5 pt-3 border-t border-[#2A2E45] flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleManualSave}
            className="flex items-center space-x-1.5 text-xs text-[#A5B4FC] hover:text-white bg-[#0F1117] border border-[#2A2E45] px-3.5 py-2 rounded-xl transition-colors cursor-pointer"
          >
            <BookmarkCheck className="w-4 h-4" />
            <span>บันทึกสัญญาณนี้ลงประวัติ</span>
          </button>

          <button
            type="button"
            onClick={onDismiss}
            className="text-xs bg-[#2A2E45] hover:bg-[#32384D] text-white px-4 py-2 rounded-xl font-semibold transition-colors cursor-pointer"
          >
            ปิด
          </button>
        </div>
      </div>
    </div>
  );
};
