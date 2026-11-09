import React, { useState, useEffect } from 'react';
import {
  X,
  Sparkles,
  ExternalLink,
  TrendingUp,
  TrendingDown,
  Minus,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Bookmark,
  Copy,
  Check,
  RefreshCw,
  Globe,
  BarChart3,
  Flame,
  Building2,
  Clock,
  PiggyBank,
  Briefcase,
  Layers,
} from 'lucide-react';
import {
  NewsArticle,
  TradingHistoryEntry,
  LongTermProjectAnalysis,
} from '../types';
import {
  
  analyzeNewsWithGemini,
  analyzeLongTermProjectWithGemini,
} from '../services/geminiService';
import { useModalA11y } from '../hooks/useModalA11y';

interface NewsDetailModalProps {
  article: NewsArticle | null;
  geminiApiKey: string;
  onClose: () => void;
  onSaveToHistory?: (
    entry: Omit<TradingHistoryEntry, 'id' | 'userId' | 'timestamp'>
  ) => Promise<void>;
}

export const NewsDetailModal: React.FC<NewsDetailModalProps> = ({
  article,
  geminiApiKey,
  onClose,
  onSaveToHistory,
}) => {
  const isProjectArticle =
    article?.category === 'PROJECT_EXPANSION' || !!article?.projectDetails;
  const isMsn =
    article?.category === 'MSN_MONEY' ||
    article?.source?.toLowerCase().includes('msn');
  const isYahoo =
    article?.category === 'YAHOO_WORLD' ||
    article?.source?.toLowerCase().includes('yahoo');
  const isMitrade =
    article?.category === 'MITRADE' ||
    article?.source?.toLowerCase().includes('mitrade');

  const [activeTab, setActiveTab] = useState<'MARKET_SENTIMENT' | 'LONG_TERM_PROJECT'>(
    isProjectArticle ? 'LONG_TERM_PROJECT' : 'MARKET_SENTIMENT'
  );
  const [analysis, setAnalysis] = useState<any | null>(null);
  const [projectAnalysis, setProjectAnalysis] =
    useState<LongTermProjectAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!article) return;
    setAnalysis(null);
    setProjectAnalysis(null);
    setSaved(false);
    setActiveTab(isProjectArticle ? 'LONG_TERM_PROJECT' : 'MARKET_SENTIMENT');
    runAnalysis(article, isProjectArticle ? 'LONG_TERM_PROJECT' : 'MARKET_SENTIMENT');
  }, [article]);

  const runAnalysis = async (
    targetArticle: NewsArticle,
    tab: 'MARKET_SENTIMENT' | 'LONG_TERM_PROJECT'
  ) => {
    setLoading(true);
    try {
      if (tab === 'LONG_TERM_PROJECT') {
        const res = await analyzeLongTermProjectWithGemini(geminiApiKey, targetArticle);
        setProjectAnalysis(res);
      } else {
        const res = await analyzeNewsWithGemini(geminiApiKey, targetArticle);
        setAnalysis(res);
      }
    } catch (err) {
      console.warn('Failed to analyze news:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleTabChange = (tab: 'MARKET_SENTIMENT' | 'LONG_TERM_PROJECT') => {
    setActiveTab(tab);
    setSaved(false);
    if (tab === 'LONG_TERM_PROJECT' && !projectAnalysis && article) {
      runAnalysis(article, 'LONG_TERM_PROJECT');
    } else if (tab === 'MARKET_SENTIMENT' && !analysis && article) {
      runAnalysis(article, 'MARKET_SENTIMENT');
    }
  };

  const dialogRef = useModalA11y({ onClose, enabled: !!article });
  if (!article) return null;

  const handleCopySummary = () => {
    if (activeTab === 'LONG_TERM_PROJECT' && projectAnalysis) {
      const text = `[วิเคราะห์โครงการ & ขยายกิจการระยะยาว (1-5 ปี)]\nโครงการ: ${projectAnalysis.projectName}\nบริษัท: ${projectAnalysis.company}\nงบลงทุน (CAPEX): ${projectAnalysis.capexValue}\nระยะเวลาก่อสร้าง: ${projectAnalysis.constructionTimeline}\nคำแนะนำ: ${projectAnalysis.longTermVerdictTh} (ความมั่นใจ ${projectAnalysis.confidenceScore}%)\nผลตอบแทนคาดการณ์: ${projectAnalysis.roiProjection}\nระยะเวลาคืนทุน: ${projectAnalysis.paybackPeriod}\nความได้เปรียบ: ${projectAnalysis.economicMoat}\nกลยุทธ์: ${projectAnalysis.strategyAdvice}`;
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      return;
    }

    if (!analysis) return;
    const text = `[บทวิเคราะห์ข่าว AI แม่นยำสูง]\nหัวข้อ: ${analysis.title}\nแหล่งข่าว: ${analysis.source}\nทิศทาง: ${analysis.sentimentLabelTh} (ความแม่นยำ: ${analysis.accuracyScore}%)\nผลกระทบ: ${analysis.marketImpact}\nตลาดที่ได้รับผลกระทบ: ${analysis.affectedMarkets.join(', ')}\nสรุปสาระสำคัญ: ${analysis.coreTakeaway}\nกลยุทธ์แนะนำ: ${analysis.tradingStrategyAdvice}\nอ้างอิง: ${analysis.url}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = async () => {
    if (!onSaveToHistory || saved || isSaving) return;

    if (activeTab === 'LONG_TERM_PROJECT' && projectAnalysis) {
      setIsSaving(true);
      try {
        await onSaveToHistory({
          type: 'LONG_TERM_PROJECT',
          symbol: projectAnalysis.company.slice(0, 20),
          action:
            projectAnalysis.longTermVerdict === 'STRONG_ACCUMULATE' ||
            projectAnalysis.longTermVerdict === 'ACCUMULATE'
              ? 'BUY'
              : 'HOLD',
          price: 0,
          aiSummary: `[วิเคราะห์โครงการระยะยาว] ${projectAnalysis.projectName} (CAPEX ${projectAnalysis.capexValue}) | คำแนะนำ: ${projectAnalysis.longTermVerdictTh} (ความเชื่อมั่น ${projectAnalysis.confidenceScore}%)\n• คาดการณ์ ${projectAnalysis.roiProjection} | คืนทุน ${projectAnalysis.paybackPeriod}\n• กลยุทธ์: ${projectAnalysis.strategyAdvice}`,
          confidence: projectAnalysis.confidenceScore,
        });
        setSaved(true);
      } catch (err) {
        console.warn('Failed to save project analysis:', err);
      } finally {
        setIsSaving(false);
      }
      return;
    }

    if (!analysis) return;
    setIsSaving(true);
    try {
      await onSaveToHistory({
        type: 'NEWS_ANALYSIS',
        symbol: isMsn ? 'SET/THB (MSN Money)' : 'CRYPTO_NEWS',
        action:
          analysis.sentiment === 'BULLISH'
            ? 'LONG'
            : analysis.sentiment === 'BEARISH'
            ? 'SHORT'
            : 'NEUTRAL',
        price: 0,
        aiSummary: `[${analysis.source}] ${analysis.title} | ${analysis.sentimentLabelTh} (ความแม่นยำ ${analysis.accuracyScore}%): ${analysis.tradingStrategyAdvice}`,
        confidence: analysis.accuracyScore,
      });
      setSaved(true);
    } catch (err) {
      console.warn('Failed to save news analysis:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const sentimentIcon =
    analysis?.sentiment === 'BULLISH' ? (
      <TrendingUp className="w-5 h-5 text-[#22C55E]" />
    ) : analysis?.sentiment === 'BEARISH' ? (
      <TrendingDown className="w-5 h-5 text-[#f9df7b]" />
    ) : (
      <Minus className="w-5 h-5 text-[#94A3B8]" />
    );

  const sentimentBg =
    analysis?.sentiment === 'BULLISH'
      ? 'bg-[#22C55E]/10 border-[#22C55E]/30 text-[#22C55E]'
      : analysis?.sentiment === 'BEARISH'
      ? 'bg-[#f9df7b]/10 border-[#f9df7b]/30 text-[#f9df7b]'
      : 'bg-[#94A3B8]/10 border-[#94A3B8]/30 text-[#94A3B8]';

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="วิเคราะห์ข่าวและผลกระทบตลาด"
      id="news-analysis-modal-backdrop"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-sm overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        id="news-analysis-modal-container"
        className="w-full sm:max-w-2xl bg-[#131722] border-t sm:border border-[#2A2E39] rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] sm:my-8 flex flex-col"
      >
        {/* Header */}
        <div className="p-5 border-b border-[#2A2E39] flex items-start justify-between bg-gradient-to-r from-[#1E222D] to-[#131722]">
          <div className="flex-1 pr-4">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              {isProjectArticle ? (
                <span className="inline-flex items-center gap-1.5 bg-[#F59E0B]/20 border border-[#F59E0B]/40 text-[#FBBF24] text-xs font-semibold px-2.5 py-0.5 rounded-full">
                  <Building2 className="w-3.5 h-3.5" />
                  โครงการก่อสร้าง & ขยายกิจการ
                </span>
              ) : isMitrade ? (
                <span className="inline-flex items-center gap-1.5 bg-[#F59E0B]/20 border border-[#F59E0B]/40 text-[#FBBF24] text-xs font-semibold px-2.5 py-0.5 rounded-full">
                  <Globe className="w-3.5 h-3.5" />
                  Mitrade Insights
                </span>
              ) : isMsn ? (
                <span className="inline-flex items-center gap-1.5 bg-[#0284C7]/20 border border-[#0284C7]/40 text-[#38BDF8] text-xs font-semibold px-2.5 py-0.5 rounded-full">
                  <Globe className="w-3.5 h-3.5" />
                  MSN Money ประเทศไทย
                </span>
              ) : isYahoo ? (
                <span className="inline-flex items-center gap-1.5 bg-[#7C3AED]/20 border border-[#7C3AED]/40 text-[#C084FC] text-xs font-semibold px-2.5 py-0.5 rounded-full">
                  <Globe className="w-3.5 h-3.5" />
                  Yahoo ข่าวโลก (World News)
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 bg-[#7C6CFF]/20 border border-[#7C6CFF]/40 text-[#A5B4FC] text-xs font-semibold px-2.5 py-0.5 rounded-full">
                  <BarChart3 className="w-3.5 h-3.5" />
                  {article.source}
                </span>
              )}
              <span className="text-xs text-[#94A3B8]">• {article.time}</span>
              <span className="inline-flex items-center gap-1 bg-[#22C55E]/15 text-[#4ADE80] text-[11px] font-medium px-2 py-0.5 rounded-full">
                <Sparkles className="w-3 h-3" />
                AI วิเคราะห์ความแม่นยำสูง
              </span>
            </div>
            <h2 className="text-white text-base sm:text-lg font-bold leading-snug">
              {article.title}
            </h2>
          </div>
          <button
            id="close-news-modal-btn"
            type="button"
            aria-label="ปิดหน้าต่างวิเคราะห์ข่าว"
            onClick={onClose}
            className="text-[#94A3B8] hover:text-white p-1.5 rounded-lg hover:bg-[#2A2E39] transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher: Market Sentiment vs. Long-Term Capex & Project */}
        <div className="flex border-b border-[#2A2E39] bg-[#171B26] px-5 pt-2 gap-2 text-xs">
          <button
            type="button"
            onClick={() => handleTabChange('MARKET_SENTIMENT')}
            className={`pb-2.5 px-3 font-semibold transition-all border-b-2 flex items-center gap-1.5 ${
              activeTab === 'MARKET_SENTIMENT'
                ? 'text-[#7C6CFF] border-[#7C6CFF]'
                : 'text-[#94A3B8] border-transparent hover:text-white'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>ผลกระทบตลาด & สัญญาณราคา</span>
          </button>
          <button
            type="button"
            onClick={() => handleTabChange('LONG_TERM_PROJECT')}
            className={`pb-2.5 px-3 font-semibold transition-all border-b-2 flex items-center gap-1.5 ${
              activeTab === 'LONG_TERM_PROJECT'
                ? 'text-[#F59E0B] border-[#F59E0B]'
                : 'text-[#94A3B8] border-transparent hover:text-white'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>วิเคราะห์โครงการ & ขยายบริษัทระยะยาว (1-5 ปี)</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          {/* Quick External Link bar */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-[#1E222D] border border-[#2A2E39] text-xs">
            <div className="flex items-center gap-2 text-[#CBD5E1] truncate pr-2">
              <span className="text-[#94A3B8]">แหล่งที่มา:</span>
              <span className="font-semibold text-white truncate">
                {article.source}
              </span>
            </div>
            <a
              id="open-source-article-link"
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[#38BDF8] hover:text-[#7DD3FC] font-medium transition-colors shrink-0 bg-[#0284C7]/15 hover:bg-[#0284C7]/25 px-3 py-1.5 rounded-lg border border-[#0284C7]/30"
            >
              <span>{isMsn ? 'เปิดอ่านบน MSN Money' : 'อ่านข่าวต้นฉบับ'}</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>

          {/* Loading Indicator */}
          {loading && (
            <div className="py-12 flex flex-col items-center justify-center space-y-3">
              <RefreshCw className="w-8 h-8 text-[#7C6CFF] animate-spin" />
              <p className="text-sm text-[#CBD5E1] font-medium">
                {activeTab === 'LONG_TERM_PROJECT'
                  ? 'Gemini AI กำลังประเมินเศรษฐศาสตร์โครงการก่อสร้างและขยายกิจการระยะยาว...'
                  : 'Gemini AI กำลังประมวลผลและวิเคราะห์ข่าวอย่างแม่นยำที่สุด...'}
              </p>
              <span className="text-xs text-[#94A3B8]">
                {activeTab === 'LONG_TERM_PROJECT'
                  ? 'คำนวณระยะเวลาคืนทุน (Payback Period), คาดการณ์ผลตอบแทน IRR และความได้เปรียบทางธุรกิจ (Moat)'
                  : 'กำลังตรวจสอบผลกระทบต่อ SET Index, อัตราแลกเปลี่ยน และสภาพคล่อง'}
              </span>
            </div>
          )}

          {/* TAB 1: Long-Term Corporate & Project Analysis View */}
          {!loading && activeTab === 'LONG_TERM_PROJECT' && projectAnalysis && (
            <div className="space-y-4">
              {/* Project Capex & Verdict Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Capex & Timeline */}
                <div className="p-3.5 rounded-xl bg-[#1E222D] border border-[#2A2E39] flex flex-col justify-between">
                  <div className="flex items-center justify-between text-xs text-[#94A3B8]">
                    <span>งบลงทุน (CAPEX)</span>
                    <Briefcase className="w-4 h-4 text-[#FBBF24]" />
                  </div>
                  <div className="mt-2">
                    <span className="text-lg font-black text-white">
                      {projectAnalysis.capexValue}
                    </span>
                  </div>
                  <span className="text-[11px] text-[#94A3B8] mt-1 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {projectAnalysis.constructionTimeline}
                  </span>
                </div>

                {/* Long-Term Verdict */}
                <div className="p-3.5 rounded-xl bg-[#1E222D] border border-[#2A2E39] flex flex-col justify-between">
                  <div className="flex items-center justify-between text-xs text-[#94A3B8]">
                    <span>คำแนะนำระยะยาว (1-5 ปี)</span>
                    <TrendingUp className="w-4 h-4 text-[#22C55E]" />
                  </div>
                  <div className="mt-2">
                    <span
                      className={`inline-block px-2.5 py-1 rounded-lg text-xs font-bold border ${
                        projectAnalysis.longTermVerdict === 'STRONG_ACCUMULATE' ||
                        projectAnalysis.longTermVerdict === 'ACCUMULATE'
                          ? 'bg-[#22C55E]/15 border-[#22C55E]/40 text-[#4ADE80]'
                          : 'bg-[#F59E0B]/15 border-[#F59E0B]/40 text-[#FBBF24]'
                      }`}
                    >
                      {projectAnalysis.longTermVerdictTh}
                    </span>
                  </div>
                  <span className="text-[11px] text-[#94A3B8] mt-1">
                    ความเชื่อมั่น AI: {projectAnalysis.confidenceScore}%
                  </span>
                </div>

                {/* Payback & Projected ROI */}
                <div className="p-3.5 rounded-xl bg-[#1E222D] border border-[#2A2E39] flex flex-col justify-between">
                  <div className="flex items-center justify-between text-xs text-[#94A3B8]">
                    <span>ผลตอบแทน & จุดคุ้มทุน</span>
                    <PiggyBank className="w-4 h-4 text-[#38BDF8]" />
                  </div>
                  <div className="mt-2">
                    <span className="text-sm font-bold text-[#38BDF8]">
                      {projectAnalysis.roiProjection}
                    </span>
                  </div>
                  <span className="text-[11px] text-[#94A3B8] mt-1">
                    ระยะเวลาคืนทุน: {projectAnalysis.paybackPeriod}
                  </span>
                </div>
              </div>

              {/* Economic Moat & Competitive Advantage */}
              <div className="p-4 rounded-xl bg-[#1E222D] border border-[#2A2E39]">
                <h4 className="text-xs font-semibold text-[#A5B4FC] uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5" />
                  ความได้เปรียบเชิงการแข่งขันของบริษัทหลังขยายโครงการ (Economic Moat)
                </h4>
                <p className="text-sm text-[#E2E8F0] leading-relaxed">
                  {projectAnalysis.economicMoat}
                </p>
              </div>

              {/* Long-term Strategy Recommendation */}
              <div className="p-4 rounded-xl bg-gradient-to-br from-[#1E222D] to-[#171B26] border border-[#F59E0B]/40 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-[#F59E0B]/10 rounded-full blur-2xl pointer-events-none" />
                <h4 className="text-xs font-bold text-[#FBBF24] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-[#FBBF24]" />
                  กลยุทธ์การสะสมหุ้นและจังหวะลงทุนระยะยาว (Investment Strategy)
                </h4>
                <p className="text-sm font-medium text-white leading-relaxed">
                  {projectAnalysis.strategyAdvice}
                </p>
                <div className="mt-3 pt-3 border-t border-[#2A2E39] flex items-center justify-between text-xs text-[#94A3B8] flex-wrap gap-2">
                  <span>
                    กรอบเวลาการถือครอง:{' '}
                    <strong className="text-white">
                      {projectAnalysis.investmentHorizon}
                    </strong>
                  </span>
                  <span>
                    การประเมินหนี้สิน:{' '}
                    <strong className="text-white">
                      {projectAnalysis.debtRiskAssessment}
                    </strong>
                  </span>
                </div>
              </div>

              {/* Long-term Growth Drivers */}
              <div className="p-4 rounded-xl bg-[#1E222D] border border-[#2A2E39]">
                <h4 className="text-xs font-semibold text-[#22C55E] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5" />
                  ปัจจัยขับเคลื่อนมูลค่ากิจการระยะยาว (Long-Term Value Drivers)
                </h4>
                <ul className="space-y-1.5">
                  {projectAnalysis.coreDrivers.map((driver, idx) => (
                    <li
                      key={idx}
                      className="text-xs text-[#CBD5E1] flex items-start gap-2"
                    >
                      <span className="text-[#22C55E] font-bold">✓</span>
                      <span>{driver}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Strategic Risk */}
              <div className="p-4 rounded-xl bg-[#1E222D] border border-[#2A2E39]">
                <h4 className="text-xs font-semibold text-[#f9df7b] uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  ความเสี่ยงเชิงกลยุทธ์และการก่อสร้างที่ต้องติดตาม
                </h4>
                <p className="text-xs text-[#E2E8F0] leading-relaxed">
                  {projectAnalysis.strategicRisk}
                </p>
              </div>
            </div>
          )}

          {/* TAB 2: Standard Market Sentiment Analysis View */}
          {!loading && activeTab === 'MARKET_SENTIMENT' && analysis && (
            <div className="space-y-4">
              {/* Primary Score & Impact Matrix */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Accuracy Score */}
                <div className="p-3.5 rounded-xl bg-[#1E222D] border border-[#2A2E39] flex flex-col justify-between">
                  <div className="flex items-center justify-between text-xs text-[#94A3B8]">
                    <span>ระดับความแม่นยำ AI</span>
                    <ShieldCheck className="w-4 h-4 text-[#22C55E]" />
                  </div>
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="text-2xl font-black text-white">
                      {analysis.accuracyScore}%
                    </span>
                    <span className="text-xs text-[#22C55E] font-medium">
                      (High Confidence)
                    </span>
                  </div>
                  <div className="w-full bg-[#131722] h-1.5 rounded-full mt-2 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-[#22C55E] to-[#38BDF8] h-full rounded-full"
                      style={{ width: `${analysis.accuracyScore}%` }}
                    />
                  </div>
                </div>

                {/* Sentiment & Direction */}
                <div className="p-3.5 rounded-xl bg-[#1E222D] border border-[#2A2E39] flex flex-col justify-between">
                  <div className="flex items-center justify-between text-xs text-[#94A3B8]">
                    <span>ทิศทางผลกระทบ</span>
                    {sentimentIcon}
                  </div>
                  <div className="mt-2">
                    <span
                      className={`inline-block px-2.5 py-1 rounded-lg text-xs font-bold border ${sentimentBg}`}
                    >
                      {analysis.sentimentLabelTh}
                    </span>
                  </div>
                  <span className="text-[11px] text-[#94A3B8] mt-2">
                    กรอบเวลา:{' '}
                    {analysis.impactHorizon === 'SHORT_TERM'
                      ? 'ระยะสั้น (Intraday)'
                      : 'ระยะกลาง (Swing)'}
                  </span>
                </div>

                {/* Market Impact Level */}
                <div className="p-3.5 rounded-xl bg-[#1E222D] border border-[#2A2E39] flex flex-col justify-between">
                  <div className="flex items-center justify-between text-xs text-[#94A3B8]">
                    <span>ผลกระทบต่อตลาด</span>
                    <Flame className="w-4 h-4 text-[#F59E0B]" />
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <span
                      className={`px-2.5 py-1 rounded-lg text-xs font-black ${
                        analysis.marketImpact === 'HIGH'
                          ? 'bg-[#f9df7b]/20 text-[#f9df7b] border border-[#f9df7b]/40'
                          : analysis.marketImpact === 'MEDIUM'
                          ? 'bg-[#F59E0B]/20 text-[#FBBF24] border border-[#F59E0B]/40'
                          : 'bg-[#10B981]/20 text-[#34D399] border border-[#10B981]/40'
                      }`}
                    >
                      {analysis.marketImpact === 'HIGH'
                        ? 'แรงสูง (HIGH IMPACT)'
                        : analysis.marketImpact === 'MEDIUM'
                        ? 'ปานกลาง (MEDIUM)'
                        : 'จำกัด (LOW)'}
                    </span>
                  </div>
                  <span className="text-[11px] text-[#94A3B8] mt-2">
                    ความเสี่ยงมหภาค: {analysis.keyMetrics.macroRisk}
                  </span>
                </div>
              </div>

              {/* Affected Markets */}
              <div className="p-4 rounded-xl bg-[#1E222D] border border-[#2A2E39]">
                <h4 className="text-xs font-semibold text-[#94A3B8] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-[#38BDF8]" />
                  สินทรัพย์และตลาดที่ได้รับผลกระทบโดยตรง
                </h4>
                <div className="flex flex-wrap gap-2">
                  {analysis.affectedMarkets.map((market: any, idx: number) => (
                    <span
                      key={idx}
                      className="bg-[#131722] border border-[#2A2E39] text-white text-xs px-2.5 py-1 rounded-lg font-medium"
                    >
                      {market}
                    </span>
                  ))}
                </div>
              </div>

              {/* Core Takeaway */}
              <div className="p-4 rounded-xl bg-[#1E222D] border border-[#2A2E39]">
                <h4 className="text-xs font-semibold text-[#94A3B8] uppercase tracking-wider mb-1.5">
                  📌 สรุปใจความสำคัญของข่าว
                </h4>
                <p className="text-sm text-[#E2E8F0] leading-relaxed">
                  {analysis.coreTakeaway}
                </p>
              </div>

              {/* Deep Market Implication */}
              <div className="p-4 rounded-xl bg-[#1E222D] border border-[#2A2E39]">
                <h4 className="text-xs font-semibold text-[#94A3B8] uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <BarChart3 className="w-3.5 h-3.5 text-[#7C6CFF]" />
                  การวิเคราะห์ผลกระทบต่อโครงสร้างราคาและ Fund Flow
                </h4>
                <p className="text-sm text-[#CBD5E1] leading-relaxed">
                  {analysis.marketImplication}
                </p>
              </div>

              {/* Trading Strategy Recommendation */}
              <div className="p-4 rounded-xl bg-gradient-to-br from-[#1E222D] to-[#171B26] border border-[#7C6CFF]/40 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-[#7C6CFF]/10 rounded-full blur-2xl pointer-events-none" />
                <h4 className="text-xs font-bold text-[#A5B4FC] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-[#A5B4FC]" />
                  กลยุทธ์การเทรดที่แนะนำอย่างแม่นยำที่สุด (Actionable Strategy)
                </h4>
                <p className="text-sm font-medium text-white leading-relaxed">
                  {analysis.tradingStrategyAdvice}
                </p>
                <div className="mt-3 pt-3 border-t border-[#2A2E39] flex items-center justify-between text-xs text-[#94A3B8]">
                  <span>
                    คำแนะนำสถานะ:{' '}
                    <strong className="text-white">
                      {analysis.keyMetrics.recommendedPositioning}
                    </strong>
                  </span>
                  <span>
                    แนวโน้มความผันผวน:{' '}
                    <strong className="text-white">
                      {analysis.keyMetrics.volatilityForecast}
                    </strong>
                  </span>
                </div>
              </div>

              {/* Risk Factors */}
              {analysis.riskFactors && analysis.riskFactors.length > 0 && (
                <div className="p-4 rounded-xl bg-[#1E222D] border border-[#2A2E39]">
                  <h4 className="text-xs font-semibold text-[#f9df7b] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    ปัจจัยเสี่ยงที่ต้องจับตา (Risk Watchlist)
                  </h4>
                  <ul className="space-y-1.5">
                    {analysis.riskFactors.map((risk: any, idx: number) => (
                      <li
                        key={idx}
                        className="text-xs text-[#CBD5E1] flex items-start gap-2"
                      >
                        <span className="text-[#f9df7b] font-bold">•</span>
                        <span>{risk}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer Actions */}
        <div className="p-4 border-t border-[#2A2E39] bg-[#1E222D] flex items-center justify-between flex-wrap gap-2">
          <button
            id="re-analyze-news-btn"
            onClick={() => runAnalysis(article, activeTab)}
            disabled={loading}
            className="px-3 py-2 rounded-xl text-xs font-medium text-[#CBD5E1] hover:text-white hover:bg-[#2A2E39] border border-[#2A2E39] flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`}
            />
            <span>วิเคราะห์ใหม่</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              id="copy-news-analysis-btn"
              onClick={handleCopySummary}
              disabled={
                loading ||
                (activeTab === 'LONG_TERM_PROJECT' ? !projectAnalysis : !analysis)
              }
              className="px-3 py-2 rounded-xl text-xs font-medium text-[#CBD5E1] hover:text-white hover:bg-[#2A2E39] border border-[#2A2E39] flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-[#22C55E]" />
                  <span className="text-[#22C55E]">คัดลอกแล้ว</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>คัดลอกบทวิเคราะห์</span>
                </>
              )}
            </button>

            {onSaveToHistory && (
              <button
                id="save-news-analysis-btn"
                onClick={handleSave}
                disabled={
                  loading ||
                  saved ||
                  isSaving ||
                  (activeTab === 'LONG_TERM_PROJECT' ? !projectAnalysis : !analysis)
                }
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#7C6CFF] hover:bg-[#6D5DFF] text-[#0F1117] flex items-center gap-1.5 transition-colors shadow-md shadow-[#7C6CFF]/20 disabled:opacity-50"
              >
                {saved ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                    <span>บันทึกลง History แล้ว</span>
                  </>
                ) : (
                  <>
                    <Bookmark className="w-3.5 h-3.5" />
                    <span>{isSaving ? 'กำลังบันทึก...' : 'บันทึกลงประวัติ'}</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
