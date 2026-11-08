import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  ExternalLink,
  Globe,
  Flame,
  ArrowUpRight,
  TrendingUp,
  TrendingDown,
  Minus,
  Building2,
  Zap,
  Clock,
  CheckCircle2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  NewsArticle,
  TradingHistoryEntry,
  TradingSignal,
  AutoMarketSynthesisResult,
} from '../types';
import { NewsDetailModal } from './NewsDetailModal';
import { MSN_MONEY_URL, MITRADE_NEWS_URL } from '../services/apiClient';
import { synthesizeNewsAndSignalsForHistory } from '../services/geminiService';

interface NewsCardProps {
  articles: NewsArticle[];
  signals?: TradingSignal[];
  geminiApiKey?: string;
  onSaveToHistory?: (
    entry: Omit<TradingHistoryEntry, 'id' | 'userId' | 'timestamp'>
  ) => Promise<void>;
  onNavigateToHistory?: () => void;
}

type NewsCategoryFilter = 'ALL' | 'MSN_MONEY' | 'MITRADE' | 'PROJECT_EXPANSION' | 'CRYPTO';

const ONE_HOUR_SECONDS = 3600;

export const NewsCard: React.FC<NewsCardProps> = ({
  articles,
  signals = [],
  geminiApiKey = '',
  onSaveToHistory,
  onNavigateToHistory,
}) => {
  const [selectedCategory, setSelectedCategory] =
    useState<NewsCategoryFilter>('ALL');
  const [selectedArticle, setSelectedArticle] = useState<NewsArticle | null>(
    null
  );

  // Auto-Analysis state (every 1 hour)
  const [isAutoEnabled, setIsAutoEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem('auto_news_analysis_enabled');
    return saved !== null ? saved === 'true' : true;
  });
  const [secondsRemaining, setSecondsRemaining] = useState<number>(() => {
    const lastRun = localStorage.getItem('last_auto_analysis_time');
    if (!lastRun) return ONE_HOUR_SECONDS;
    const elapsed = Math.floor((Date.now() - parseInt(lastRun, 10)) / 1000);
    const rem = ONE_HOUR_SECONDS - elapsed;
    return rem > 0 ? rem : ONE_HOUR_SECONDS;
  });
  const [isAnalyzingAuto, setIsAnalyzingAuto] = useState<boolean>(false);
  const [latestAutoResult, setLatestAutoResult] =
    useState<AutoMarketSynthesisResult | null>(null);
  const [showAutoDrawer, setShowAutoDrawer] = useState<boolean>(false);
  const [autoStatusMessage, setAutoStatusMessage] = useState<string>('');

  const isRunningRef = useRef<boolean>(false);

  // Toggle Auto-Analysis
  const handleToggleAuto = () => {
    const next = !isAutoEnabled;
    setIsAutoEnabled(next);
    localStorage.setItem('auto_news_analysis_enabled', String(next));
  };

  // Trigger synthesis function
  const runAutoAnalysis = async (_force = false) => {
    if (isRunningRef.current || articles.length === 0) return;
    isRunningRef.current = true;
    setIsAnalyzingAuto(true);
    setAutoStatusMessage('กำลังเปรียบเทียบข่าวและสัญญาณตลาดแบบเรียลไทม์...');

    try {
      const result = await synthesizeNewsAndSignalsForHistory(
        geminiApiKey,
        articles,
        signals
      );
      setLatestAutoResult(result);
      localStorage.setItem('last_auto_analysis_time', String(Date.now()));
      setSecondsRemaining(ONE_HOUR_SECONDS);

      // Save to History (Firestore Cloud Sync)
      if (onSaveToHistory) {
        await onSaveToHistory({
          type: 'AUTO_MARKET_IMPACT',
          symbol: 'HOURLY_MARKET_CATALYST',
          action:
            result.overallStance === 'BULLISH'
              ? 'BUY'
              : result.overallStance === 'BEARISH'
              ? 'SELL'
              : 'HOLD',
          price: 0,
          aiSummary: `[Auto-Analysis ทุก 1 ชม.] ${result.headline} | ${result.actionableSummary}\n• ปัจจัยขับเคลื่อนราคา: ${result.keyCatalysts.slice(0, 3).join('; ')}\n• สินทรัพย์ที่ได้รับผลกระทบ: ${result.mostImpactedAssets.map(a => a.symbol).join(', ')}`,
          confidence: result.confidence,
        });
      }

      setAutoStatusMessage('บันทึกสรุปปัจจัยลงหน้า History เรียบร้อยแล้ว');
      setTimeout(() => setAutoStatusMessage(''), 8000);
    } catch (err) {
      console.warn('Auto-analysis synthesis warning:', err);
      setAutoStatusMessage('ประมวลผลเสร็จสิ้น (ใช้ข้อมูลสังเคราะห์)');
      setTimeout(() => setAutoStatusMessage(''), 5000);
    } finally {
      setIsAnalyzingAuto(false);
      isRunningRef.current = false;
    }
  };

  // Countdown timer & hourly trigger
  useEffect(() => {
    if (!isAutoEnabled) return;

    const timer = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          // Trigger hourly auto-analysis
          runAutoAnalysis();
          return ONE_HOUR_SECONDS;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isAutoEnabled, articles, signals, geminiApiKey]);

  // Initial trigger if never run before
  useEffect(() => {
    const lastRun = localStorage.getItem('last_auto_analysis_time');
    if (!lastRun && articles.length > 0 && isAutoEnabled) {
      // Run once 3 seconds after mount
      const timeout = setTimeout(() => {
        runAutoAnalysis();
      }, 3000);
      return () => clearTimeout(timeout);
    }
  }, [articles.length, isAutoEnabled]);

  // Format countdown mm:ss
  const formatCountdown = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const filteredArticles = articles.filter((item) => {
    if (selectedCategory === 'ALL') return true;
    if (selectedCategory === 'MSN_MONEY') {
      return (
        item.category === 'MSN_MONEY' ||
        item.source.toLowerCase().includes('msn')
      );
    }
    if (selectedCategory === 'MITRADE') {
      return (
        item.category === 'MITRADE' ||
        item.source.toLowerCase().includes('mitrade')
      );
    }
    if (selectedCategory === 'PROJECT_EXPANSION') {
      return (
        item.category === 'PROJECT_EXPANSION' ||
        !!item.projectDetails ||
        item.source.includes('ก่อสร้าง') ||
        item.source.includes('ขยาย')
      );
    }
    if (selectedCategory === 'CRYPTO') {
      return (
        item.category === 'CRYPTO' ||
        (!item.source.toLowerCase().includes('msn') &&
          item.category !== 'PROJECT_EXPANSION')
      );
    }
    return true;
  });

  const msnCount = articles.filter(
    (a) =>
      a.category === 'MSN_MONEY' || a.source.toLowerCase().includes('msn')
  ).length;

  const mitradeCount = articles.filter(
    (a) =>
      a.category === 'MITRADE' || a.source.toLowerCase().includes('mitrade')
  ).length;

  const projectCount = articles.filter(
    (a) =>
      a.category === 'PROJECT_EXPANSION' ||
      !!a.projectDetails ||
      a.source.includes('ก่อสร้าง') ||
      a.source.includes('ขยาย')
  ).length;

  const highImpactCount = articles.filter((a) => a.impact === 'HIGH').length;
  const mediumImpactCount = articles.filter((a) => a.impact === 'MEDIUM').length;
  const lowImpactCount = articles.filter((a) => a.impact === 'LOW' || !a.impact).length;

  return (
    <div
      id="market-news-container"
      className="w-full rounded-[18px] bg-[#1A1D29] border border-[#252A3A] p-4 shadow-lg flex flex-col space-y-3.5"
    >
      {/* Header with MSN Money & Auto-Analysis Status */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-[#FF2D55] animate-pulse shadow-[0_0_8px_rgba(255,45,85,0.6)]" />
          <h3 className="text-white font-black text-sm tracking-tight">
            MotorBoy News & Analysis Hub
          </h3>
        </div>

        <div className="flex items-center gap-1.5">
          <a
            id="mitrade-portal-link"
            href={MITRADE_NEWS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-[#F59E0B]/20 hover:bg-[#F59E0B]/30 border border-[#F59E0B]/40 text-[#FBBF24] text-xs font-semibold transition-all hover:scale-[1.02]"
            title="เปิดเว็บไซต์ Mitrade Insights"
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Mitrade Insights</span>
            <ArrowUpRight className="w-3 h-3" />
          </a>
          <a
            id="msn-money-portal-link"
            href={MSN_MONEY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-[#0284C7]/20 hover:bg-[#0284C7]/30 border border-[#0284C7]/40 text-[#38BDF8] text-xs font-semibold transition-all hover:scale-[1.02]"
            title="เปิดเว็บไซต์ MSN Money ประเทศไทย"
          >
            <Globe className="w-3.5 h-3.5" />
            <span>MSN Money (th-th)</span>
            <ArrowUpRight className="w-3 h-3" />
          </a>
        </div>
      </div>

      {/* Market Impact Overview Bar (Glanceable & Calm for Busy Office Workers) */}
      <div className="flex items-center justify-between px-3.5 py-2 rounded-xl bg-[#0F1117] border border-[#252A3A] text-xs text-slate-300 gap-2 flex-wrap shadow-inner">
        <div className="flex items-center gap-1.5 font-semibold text-white">
          <Flame className="w-3.5 h-3.5 text-[#f9df7b]" />
          <span>ระดับผลกระทบต่อตลาด (Market Impact):</span>
        </div>
        <div className="flex items-center gap-3 text-[11px] font-medium">
          <span className="flex items-center gap-1 text-[#f9df7b]" title="ข่าวผลกระทบสูงต่อตลาด">
            <span className="w-2 h-2 rounded-full bg-[#f9df7b] inline-block animate-pulse" />
            High Impact: <strong className="font-bold text-white">{highImpactCount}</strong>
          </span>
          <span className="flex items-center gap-1 text-[#38BDF8]" title="ข่าวผลกระทบปานกลาง">
            <span className="w-2 h-2 rounded-full bg-[#38BDF8] inline-block" />
            Medium Impact: <strong className="font-bold text-white">{mediumImpactCount}</strong>
          </span>
          <span className="flex items-center gap-1 text-[#94A3B8]" title="ข่าวทั่วไป">
            <span className="w-2 h-2 rounded-full bg-[#94A3B8] inline-block" />
            Low Impact: <strong className="font-bold text-white">{lowImpactCount}</strong>
          </span>
        </div>
      </div>

      {/* Auto-Analysis Engine Banner (Every 1 Hour) */}
      <div
        id="auto-analysis-engine-card"
        className="rounded-xl bg-gradient-to-r from-[#0F1117] via-[#161B26] to-[#0F1117] border border-[#0284C7]/40 p-3 space-y-2.5"
      >
        <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#0284C7]/20 border border-[#0284C7]/40 flex items-center justify-center text-[#38BDF8]">
              <Zap className="w-4 h-4" />
            </div>
            <div>
        <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-bold text-white text-xs">
                  Auto-Analysis ทุก 1 ชม.
                </span>
                <span className="bg-[#22C55E]/20 text-[#4ADE80] text-[10px] font-bold px-1.5 py-0.2 rounded-md flex items-center gap-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E] animate-ping" />
                  Real-time
                </span>
              </div>
              <p className="text-[10px] text-[#94A3B8]">
                เทียบข่าวล่าสุดกับสัญญาณตลาด สรุปลง History อัตโนมัติ
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 mt-2 sm:mt-0">
            {isAutoEnabled && (
              <div className="flex items-center gap-1 text-[11px] font-mono text-[#38BDF8] bg-[#0284C7]/15 px-2 py-0.5 rounded-lg border border-[#0284C7]/30">
                <Clock className="w-3 h-3" />
                <span>รอบถัดไป: {formatCountdown(secondsRemaining)}</span>
              </div>
            )}

            <button
              id="btn-run-auto-analysis-now"
              onClick={() => runAutoAnalysis(true)}
              disabled={isAnalyzingAuto}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-[#7C6CFF] hover:bg-[#6D5DFF] text-white transition-all disabled:opacity-50 shadow-sm"
              title="รันการวิเคราะห์เปรียบเทียบแบบเรียลไทม์ทันที"
            >
              <RefreshCw
                className={`w-3 h-3 ${isAnalyzingAuto ? 'animate-spin' : ''}`}
              />
              <span>{isAnalyzingAuto ? 'กำลังวิเคราะห์...' : 'ซิงค์ทันที'}</span>
            </button>

            <button
              onClick={handleToggleAuto}
              className={`text-[10px] font-semibold px-2 py-1 rounded-lg border transition-colors ${
                isAutoEnabled
                  ? 'border-[#22C55E]/40 text-[#4ADE80] bg-[#22C55E]/10'
                  : 'border-[#6B7280]/40 text-[#94A3B8] bg-[#252A3A]/40'
              }`}
              title={isAutoEnabled ? 'หยุดชั่วคราว' : 'เปิดใช้งานอัตโนมัติ'}
            >
              {isAutoEnabled ? 'เปิดอยู่' : 'ปิด'}
            </button>
          </div>
        </div>

        {autoStatusMessage && (
          <div className="flex items-center gap-1.5 text-[11px] text-[#4ADE80] bg-[#22C55E]/10 border border-[#22C55E]/30 px-2.5 py-1 rounded-lg">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-[#22C55E]" />
            <span>{autoStatusMessage}</span>
          </div>
        )}

        {/* Expandable Latest Auto Synthesis Snapshot */}
        {latestAutoResult && (
          <div className="pt-1 border-t border-[#252A3A]/60">
            <button
              onClick={() => setShowAutoDrawer(!showAutoDrawer)}
              className="w-full flex items-center justify-between text-[11px] text-[#A5B4FC] hover:text-white py-1 transition-colors"
            >
              <span className="flex items-center gap-1.5 font-medium">
                <Sparkles className="w-3 h-3 text-[#7C6CFF]" />
                ดูสรุปปัจจัยล่าสุดที่ถูกบันทึกลง History ({latestAutoResult.overallStance})
              </span>
              {showAutoDrawer ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>

            {showAutoDrawer && (
              <div className="mt-2 p-3 rounded-lg bg-[#0F1117] border border-[#252A3A] space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white text-xs">
                    {latestAutoResult.headline}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      latestAutoResult.overallStance === 'BULLISH'
                        ? 'bg-[#22C55E]/20 text-[#4ADE80]'
                        : latestAutoResult.overallStance === 'BEARISH'
                        ? 'bg-[#f9df7b]/20 text-[#f9df7b]'
                        : 'bg-slate-700 text-slate-300'
                    }`}
                  >
                    {latestAutoResult.overallStance === 'BULLISH'
                      ? 'เชิงบวก (Bullish)'
                      : latestAutoResult.overallStance === 'BEARISH'
                      ? 'เชิงลบ (Bearish)'
                      : 'เป็นกลาง (Neutral)'}{' '}
                    {latestAutoResult.confidence}%
                  </span>
                </div>

                <p className="text-[11px] text-[#CBD5E1] leading-relaxed">
                  {latestAutoResult.actionableSummary}
                </p>

                <div className="space-y-1">
                  <span className="text-[10px] text-[#94A3B8] font-semibold uppercase">
                    ปัจจัยหลักที่มีผลต่อราคา (Catalysts):
                  </span>
                  <ul className="space-y-0.5">
                    {latestAutoResult.keyCatalysts.map((cat, idx) => (
                      <li
                        key={idx}
                        className="text-[11px] text-[#E2E8F0] flex items-start gap-1.5"
                      >
                        <span className="text-[#38BDF8] font-bold">•</span>
                        <span>{cat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-[#252A3A] text-[10px] text-[#94A3B8]">
                  <span>
                    สินทรัพย์เป้าหมาย:{' '}
                    <strong className="text-white">
                      {latestAutoResult.mostImpactedAssets.map(a => a.symbol).join(', ')}
                    </strong>
                  </span>
                  {onNavigateToHistory && (
                    <button
                      onClick={onNavigateToHistory}
                      className="text-[#38BDF8] hover:underline flex items-center gap-0.5"
                    >
                      <span>เปิดดูในหน้า History</span>
                      <ArrowUpRight className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Category Tabs: All / MSN / Project Expansion / Crypto */}
      <div className="flex items-center gap-1.5 bg-[#0F1117] p-1 rounded-xl border border-[#252A3A] overflow-x-auto text-xs">
        <button
          id="news-tab-all"
          onClick={() => setSelectedCategory('ALL')}
          className={`shrink-0 flex-1 py-1.5 px-3 text-xs font-medium rounded-lg transition-all whitespace-nowrap min-w-fit ${
            selectedCategory === 'ALL'
              ? 'bg-[#7C6CFF] text-white shadow-sm'
              : 'text-[#94A3B8] hover:text-white'
          }`}
        >
          ทั้งหมด ({articles.length})
        </button>

        <button
          id="news-tab-project"
          onClick={() => setSelectedCategory('PROJECT_EXPANSION')}
          className={`shrink-0 flex-1 py-1.5 px-3 text-xs font-medium rounded-lg transition-all flex items-center justify-center gap-1 whitespace-nowrap min-w-fit ${
            selectedCategory === 'PROJECT_EXPANSION'
              ? 'bg-[#F59E0B] text-black font-bold shadow-sm'
              : 'text-[#94A3B8] hover:text-[#FBBF24]'
          }`}
        >
          <Building2 className="w-3.5 h-3.5" />
          <span>โครงการ & ขยายบริษัท</span>
          {projectCount > 0 && (
            <span className="text-[10px] bg-black/20 px-1.5 py-0.2 rounded-full">
              {projectCount}
            </span>
          )}
        </button>

        <button
          id="news-tab-mitrade"
          onClick={() => setSelectedCategory('MITRADE')}
          className={`shrink-0 flex-1 py-1.5 px-3 text-xs font-medium rounded-lg transition-all flex items-center justify-center gap-1 whitespace-nowrap min-w-fit ${
            selectedCategory === 'MITRADE'
              ? 'bg-[#F59E0B] text-black font-bold shadow-sm'
              : 'text-[#94A3B8] hover:text-[#FBBF24]'
          }`}
        >
          <Globe className="w-3 h-3" />
          <span>Mitrade ข่าวสด</span>
          {mitradeCount > 0 && (
            <span className="text-[10px] bg-black/20 px-1.5 py-0.2 rounded-full">
              {mitradeCount}
            </span>
          )}
        </button>

        <button
          id="news-tab-msn"
          onClick={() => setSelectedCategory('MSN_MONEY')}
          className={`shrink-0 flex-1 py-1.5 px-3 text-xs font-medium rounded-lg transition-all flex items-center justify-center gap-1 whitespace-nowrap min-w-fit ${
            selectedCategory === 'MSN_MONEY'
              ? 'bg-[#0284C7] text-white shadow-sm'
              : 'text-[#94A3B8] hover:text-[#38BDF8]'
          }`}
        >
          <Globe className="w-3 h-3" />
          <span>MSN การเงินไทย</span>
          {msnCount > 0 && (
            <span className="text-[10px] bg-white/20 px-1.5 py-0.2 rounded-full">
              {msnCount}
            </span>
          )}
        </button>

        <button
          id="news-tab-crypto"
          onClick={() => setSelectedCategory('CRYPTO')}
          className={`shrink-0 flex-1 py-1.5 px-3 text-xs font-medium rounded-lg transition-all whitespace-nowrap min-w-fit ${
            selectedCategory === 'CRYPTO'
              ? 'bg-[#7C6CFF] text-white shadow-sm'
              : 'text-[#94A3B8] hover:text-white'
          }`}
        >
          คริปโต & โลก
        </button>
      </div>

      {/* Article List */}
      <div className="space-y-2.5 max-h-[440px] overflow-y-auto pr-0.5">
        {filteredArticles.length === 0 ? (
          <div className="py-8 text-center text-xs text-[#94A3B8]">
            ไม่มีข่าวในหมวดหมู่นี้
          </div>
        ) : (
          filteredArticles.map((item, idx) => {
            const isMsn =
              item.category === 'MSN_MONEY' ||
              item.source.toLowerCase().includes('msn');
            const isMitrade =
              item.category === 'MITRADE' ||
              item.source.toLowerCase().includes('mitrade');
            const isProject =
              item.category === 'PROJECT_EXPANSION' || !!item.projectDetails;

            const sentimentBadge =
              item.sentiment === 'BULLISH' ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#22C55E] bg-[#22C55E]/10 px-1.5 py-0.5 rounded">
                  <TrendingUp className="w-3 h-3" />
                  บวก
                </span>
              ) : item.sentiment === 'BEARISH' ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#f9df7b] bg-[#f9df7b]/10 px-1.5 py-0.5 rounded">
                  <TrendingDown className="w-3 h-3" />
                  ลบ
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#94A3B8] bg-[#94A3B8]/10 px-1.5 py-0.5 rounded">
                  <Minus className="w-3 h-3" />
                  เป็นกลาง
                </span>
              );

            return (
                <div
                  key={item.id ? `${item.id}-${idx}` : `news-${idx}`}
                  id={`news-item-${item.id || idx}`}
                  className={`w-full rounded-xl bg-[#0F1117] border p-3 flex flex-col space-y-2 transition-all hover:border-[#7C6CFF]/60 ${
                    isProject
                      ? 'border-[#F59E0B]/30 bg-[#F59E0B]/[0.02]'
                      : isMitrade
                      ? 'border-[#F59E0B]/30 bg-[#F59E0B]/[0.02]'
                      : isMsn
                      ? 'border-[#0284C7]/30 bg-[#0284C7]/[0.03]'
                      : 'border-[#252A3A]'
                  }`}
              >
                {/* Meta row */}
                <div className="flex items-center justify-between text-[11px] gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    {isProject ? (
                      <span className="font-bold text-[#FBBF24] bg-[#F59E0B]/20 px-2 py-0.5 rounded text-[10px] flex items-center gap-1">
                        <Building2 className="w-3 h-3" />
                        โครงการ & Capex
                      </span>
                    ) : isMitrade ? (
                      <span className="font-bold text-[#FBBF24] bg-[#F59E0B]/20 px-2 py-0.5 rounded text-[10px] flex items-center gap-1">
                        <Globe className="w-3 h-3" />
                        Mitrade Insights
                      </span>
                    ) : isMsn ? (
                      <span className="font-bold text-[#38BDF8] bg-[#0284C7]/20 px-2 py-0.5 rounded text-[10px] flex items-center gap-1">
                        <Globe className="w-3 h-3" />
                        MSN Money
                      </span>
                    ) : (
                      <span className="font-semibold text-[#A5B4FC]">
                        {item.source}
                      </span>
                    )}
                    <span className="text-[#6B7280]">• {item.time}</span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {item.isCurated && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-[#FBBF24] bg-[#F59E0B]/15 px-1.5 py-0.5 rounded border border-[#F59E0B]/30" title="ข่าวสำรองเมื่อดึง feed สดไม่สำเร็จ">
                        สำรอง
                      </span>
                    )}
                    {!item.isCurated && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-[#4ADE80] bg-[#22C55E]/15 px-1.5 py-0.5 rounded border border-[#22C55E]/30" title={item.fetchedAt ? `ดึงสด: ${item.fetchedAt}` : 'ข่าวสด'}>
                        สด
                      </span>
                    )}
                    {item.impact === 'HIGH' ? (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-[#f9df7b] bg-[#f9df7b]/15 px-1.5 py-0.5 rounded border border-[#f9df7b]/30">
                        <Flame className="w-3 h-3 text-[#f9df7b]" />
                        High Impact
                      </span>
                    ) : item.impact === 'MEDIUM' ? (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-[#38BDF8] bg-[#0284C7]/15 px-1.5 py-0.5 rounded border border-[#0284C7]/30">
                        Medium Impact
                      </span>
                    ) : item.impact === 'LOW' ? (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-[#94A3B8] bg-[#94A3B8]/10 px-1.5 py-0.5 rounded border border-[#94A3B8]/20">
                        Low Impact
                      </span>
                    ) : null}
                    {sentimentBadge}
                  </div>
                </div>

                {/* Title */}
                <h4
                  onClick={() => setSelectedArticle(item)}
                  className="text-white text-xs font-medium leading-snug cursor-pointer hover:text-[#A5B4FC] transition-colors line-clamp-2"
                >
                  {item.title}
                </h4>

                {/* Summary teaser or project details */}
                {item.summary && (
                  <p className="text-[11px] text-[#94A3B8] line-clamp-2 leading-relaxed">
                    {item.summary}
                  </p>
                )}

                {item.projectDetails && (
                  <div className="flex items-center gap-3 text-[10px] text-[#CBD5E1] bg-[#1A1D29] px-2 py-1 rounded-md border border-[#252A3A]">
                    <span>
                      งบลงทุน:{' '}
                      <strong className="text-[#FBBF24]">
                        {item.projectDetails.capexValue}
                      </strong>
                    </span>
                    <span>•</span>
                    <span>
                      กำหนดเสร็จ: <strong>{item.projectDetails.constructionTimeline}</strong>
                    </span>
                  </div>
                )}

                {/* Bottom Action buttons */}
                <div className="flex items-center justify-between pt-1 border-t border-[#252A3A]/60">
                  <button
                    id={`btn-ai-analyze-${item.id}`}
                    onClick={() => setSelectedArticle(item)}
                    className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors border ${
                      isProject
                        ? 'text-[#FBBF24] bg-[#F59E0B]/15 hover:bg-[#F59E0B]/30 border-[#F59E0B]/30'
                        : 'text-[#A5B4FC] hover:text-white bg-[#7C6CFF]/15 hover:bg-[#7C6CFF]/30 border-[#7C6CFF]/30'
                    }`}
                  >
                    {isProject ? (
                      <>
                        <Building2 className="w-3.5 h-3.5 text-[#FBBF24]" />
                        <span>วิเคราะห์โครงการระยะยาว</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5 text-[#7C6CFF]" />
                        <span>วิเคราะห์ด้วย AI แม่นยำ</span>
                      </>
                    )}
                  </button>

                  <a
                    id={`link-article-${item.id}`}
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#6B7280] hover:text-[#CBD5E1] text-xs flex items-center gap-1 transition-colors px-2 py-1"
                    title="เปิดลิงก์ข่าว"
                  >
                    <span>{isMsn ? 'ไปที่ MSN' : 'อ่านข่าว'}</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* News Analysis Modal */}
      {selectedArticle && (
        <NewsDetailModal
          article={selectedArticle}
          geminiApiKey={geminiApiKey}
          onClose={() => setSelectedArticle(null)}
          onSaveToHistory={onSaveToHistory}
        />
      )}
    </div>
  );
};
