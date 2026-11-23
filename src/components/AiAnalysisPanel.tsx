import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Cloud,
  ExternalLink,
  RefreshCw,
  Rss,
  ShieldAlert,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Minus,
} from 'lucide-react';
import type { DoubleCheckAnalysisRecord, NewsArticle, Sentiment } from '../types';
import {
  fetchDoubleCheckAnalyses,
  runCloudflareAndMainAiDoubleCheck,
} from '../services/cloudflareAiService';

interface AiAnalysisPanelProps {
  articles: NewsArticle[];
  geminiApiKey?: string;
}

function formatThaiTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return (
      d.toLocaleString('th-TH', {
        timeZone: 'Asia/Bangkok',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }) + ' ICT'
    );
  } catch {
    return iso;
  }
}

function renderSentimentBadge(sentiment: Sentiment) {
  if (sentiment === 'BULLISH') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#7EE0B5]/15 border border-[#7EE0B5]/40 text-[#7EE0B5]">
        <TrendingUp className="w-3 h-3" aria-hidden="true" />
        <span>▲ เชิงบวก</span>
      </span>
    );
  }
  if (sentiment === 'BEARISH') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#F4A6A6]/15 border border-[#F4A6A6]/40 text-[#F4A6A6]">
        <TrendingDown className="w-3 h-3" aria-hidden="true" />
        <span>▼ ระมัดระวัง</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FFB86B]/15 border border-[#FFB86B]/40 text-[#FFB86B]">
      <Minus className="w-3 h-3" aria-hidden="true" />
      <span>◆ เป็นกลาง</span>
    </span>
  );
}

export const AiAnalysisPanel: React.FC<AiAnalysisPanelProps> = ({
  articles,
  geminiApiKey = '',
}) => {
  const [records, setRecords] = useState<DoubleCheckAnalysisRecord[]>([]);
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const articlesRef = useRef<NewsArticle[]>(articles);
  articlesRef.current = articles;
  const apiKeyRef = useRef<string>(geminiApiKey);
  apiKeyRef.current = geminiApiKey;
  const bootedRef = useRef<boolean>(false);

  const runBackgroundAnalysis = useCallback(async (targetArticle?: NewsArticle) => {
    setIsRefreshing(true);
    try {
      const candidate =
        targetArticle ||
        articlesRef.current.find((a) => !a.isCurated) ||
        articlesRef.current[0];

      const created = await runCloudflareAndMainAiDoubleCheck({
        article: candidate,
        apiKey: apiKeyRef.current,
      });

      if (created) {
        setRecords((prev) => {
          const filtered = prev.filter((item) => item.headline !== created.headline);
          return [created, ...filtered].slice(0, 6);
        });
        setActiveIndex(0);
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // Non-blocking deferred load: UI paints immediately, AI Worker loads in background
  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    let cancelled = false;

    const timer = window.setTimeout(async () => {
      const existing = await fetchDoubleCheckAnalyses(6);
      if (cancelled) return;
      if (existing.length > 0) {
        setRecords(existing);
        setIsLoading(false);
        return;
      }
      await runBackgroundAnalysis();
    }, 120);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [runBackgroundAnalysis]);

  const activeRecord = records[activeIndex] ?? records[0] ?? null;

  return (
    <section
      aria-label="AI Analysis"
      data-testid="ai-analysis-panel"
      className="rounded-[20px] bg-[#141725] border border-white/[0.07] p-4 shadow-lg space-y-3.5"
    >
      {/* Panel Header */}
      <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-white/[0.07]">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-[#7C6CFF]/20 border border-[#7C6CFF]/40 flex items-center justify-center text-[#A89FFF] shrink-0">
              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
            </span>
            <h2 className="text-white font-bold text-sm tracking-tight truncate">
              AI Analysis
            </h2>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#4CC9F0]/15 border border-[#4CC9F0]/35 text-[#4CC9F0]">
              2-Stage Verify
            </span>
          </div>
          <p className="text-[11px] text-[#A7A4B8] mt-1">
            วิเคราะห์ข่าว RSS สองชั้นบน Background Worker ไม่บล็อกหน้าจอหลัก
          </p>
        </div>

        <button
          type="button"
          onClick={() => void runBackgroundAnalysis()}
          disabled={isRefreshing}
          aria-label="วิเคราะห์ข่าว RSS ใหม่"
          className="px-2.5 py-1.5 rounded-xl bg-[#222640] hover:bg-[#2A2F4F] border border-white/[0.07] text-[#ECEAF4] text-[11px] font-semibold inline-flex items-center gap-1.5 shrink-0 disabled:opacity-50"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 text-[#A89FFF] ${isRefreshing ? 'animate-spin' : ''}`}
            aria-hidden="true"
          />
          <span>{isRefreshing ? 'กำลังตรวจ…' : 'วิเคราะห์ใหม่'}</span>
        </button>
      </div>

      {/* Loading Skeleton while Background Worker analyzes */}
      {isLoading && !activeRecord ? (
        <div
          data-testid="ai-analysis-skeleton"
          role="status"
          aria-live="polite"
          className="space-y-3 py-1 animate-calm-pulse"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="h-4 w-32 rounded-lg bg-[#222640]" />
            <div className="h-4 w-20 rounded-full bg-[#222640]" />
          </div>
          <div className="h-3.5 w-full rounded bg-[#1C1F2E]" />
          <div className="rounded-2xl bg-[#1C1F2E] border border-white/[0.05] p-3 space-y-2">
            <div className="h-3.5 w-40 rounded bg-[#222640]" />
            <div className="h-3 w-full rounded bg-[#222640]/80" />
            <div className="h-3 w-4/5 rounded bg-[#222640]/80" />
          </div>
          <div className="rounded-2xl bg-[#1C1F2E] border border-[#7C6CFF]/20 p-3 space-y-2">
            <div className="h-3.5 w-44 rounded bg-[#7C6CFF]/25" />
            <div className="h-3 w-full rounded bg-[#222640]" />
            <div className="h-3 w-5/6 rounded bg-[#222640]" />
          </div>
          <p className="text-[11px] text-[#8B88A0] text-center">
            กำลังประมวลผลผ่าน Cloudflare AI และตรวจสอบซ้ำด้วย Main AI ในพื้นหลัง…
          </p>
        </div>
      ) : activeRecord ? (
        <div className="space-y-3">
          {/* RSS Source + Headline */}
          <div className="rounded-2xl bg-[#1C1F2E] border border-white/[0.07] p-3 space-y-1.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#4CC9F0]">
                <Rss className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span data-testid="ai-analysis-rss-source">{activeRecord.rssSource}</span>
              </span>
              {renderSentimentBadge(activeRecord.sentiment)}
            </div>

            <div className="text-xs font-semibold text-[#ECEAF4] leading-relaxed">
              {activeRecord.rssUrl ? (
                <a
                  href={activeRecord.rssUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-[#A89FFF] inline-flex items-start gap-1"
                >
                  <span>{activeRecord.headline}</span>
                  <ExternalLink className="w-3 h-3 shrink-0 mt-1 text-[#8B88A0]" aria-hidden="true" />
                </a>
              ) : (
                <span>{activeRecord.headline}</span>
              )}
            </div>
          </div>

          {/* Stage 1: [Cloudflare AI Result] */}
          <div
            data-testid="cloudflare-ai-result"
            className="rounded-2xl bg-[#1C1F2E]/80 border border-[#4CC9F0]/25 p-3 space-y-1.5"
          >
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#4CC9F0]">
                <Cloud className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>[Cloudflare AI Result]</span>
              </span>
              {activeRecord.cfAiStatus === 'QUOTA_EXCEEDED' ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#FFB86B]/15 border border-[#FFB86B]/40 text-[#FFB86B]">
                  <ShieldAlert className="w-3 h-3" aria-hidden="true" />
                  <span>สลับใช้ Main AI (โควตาฟรีเต็ม)</span>
                </span>
              ) : (
                <span className="text-[10px] font-mono text-[#8B88A0] truncate max-w-[170px]">
                  {activeRecord.cfAiModel}
                </span>
              )}
            </div>
            <p className="text-xs text-[#ECEAF4]/90 leading-relaxed">
              {activeRecord.cfAiResult}
            </p>
          </div>

          {/* Stage 2: [Final Verified by Main AI] */}
          <div
            data-testid="main-ai-verified-result"
            className="rounded-2xl bg-gradient-to-br from-[#7C6CFF]/12 via-[#1C1F2E] to-[#4CC9F0]/8 border border-[#7C6CFF]/40 p-3 space-y-2"
          >
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#A89FFF]">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#7EE0B5] shrink-0" aria-hidden="true" />
                <span>[Final Verified by Main AI]</span>
              </span>
              <span className="text-[10px] font-mono text-[#A7A4B8] truncate max-w-[180px]">
                {activeRecord.mainAiModel}
              </span>
            </div>

            <div className="text-xs font-bold text-white bg-[#0F1117]/70 border border-white/[0.06] rounded-xl px-2.5 py-2">
              คำตัดสินสุดท้าย: {activeRecord.mainAiVerdict}
            </div>

            <p className="text-xs text-[#ECEAF4] leading-relaxed">
              {activeRecord.mainAiSummary}
            </p>
          </div>

          {/* Confidence Score & Timestamp Footer */}
          <div className="pt-1 space-y-2">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-[#A7A4B8] font-medium">ความเชื่อมั่น (Confidence Score)</span>
              <span
                data-testid="ai-analysis-confidence"
                className="font-bold text-[#7EE0B5] tabular-nums"
              >
                {Math.round(activeRecord.confidenceScore)}%
              </span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-[#0F1117] overflow-hidden border border-white/[0.05]">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(100, Math.max(0, activeRecord.confidenceScore))}%`,
                  background: 'linear-gradient(90deg, #7C6CFF 0%, #4CC9F0 60%, #7EE0B5 100%)',
                }}
              />
            </div>

            <div className="flex items-center justify-between gap-2 text-[10px] text-[#8B88A0] pt-0.5">
              <span className="inline-flex items-center gap-1">
                <Clock className="w-3 h-3" aria-hidden="true" />
                <span data-testid="ai-analysis-timestamp">
                  {formatThaiTimestamp(activeRecord.timestamp)}
                </span>
              </span>
              {records.length > 1 && (
                <div className="flex items-center gap-1">
                  {records.slice(0, 4).map((rec, idx) => (
                    <button
                      key={String(rec.id)}
                      type="button"
                      onClick={() => setActiveIndex(idx)}
                      aria-label={`ดูผลวิเคราะห์ข่าวที่ ${idx + 1}`}
                      className={`w-5 h-5 rounded-full text-[10px] font-bold tabular-nums ${
                        idx === activeIndex
                          ? 'bg-[#7C6CFF] text-[#0F1117]'
                          : 'bg-[#222640] text-[#A7A4B8] hover:text-white'
                      }`}
                    >
                      {idx + 1}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Quick Analyze another live RSS headline */}
          {articles.length > 1 && (
            <div className="pt-2 border-t border-white/[0.06]">
              <p className="text-[10px] text-[#8B88A0] mb-1.5">
                เลือกหัวข้อข่าว RSS อื่นเพื่อตรวจสอบซ้ำ:
              </p>
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden">
                {articles.slice(0, 4).map((art) => (
                  <button
                    key={art.id}
                    type="button"
                    disabled={isRefreshing}
                    onClick={() => void runBackgroundAnalysis(art)}
                    className="px-2.5 py-1 rounded-full bg-[#1C1F2E] hover:bg-[#222640] border border-white/[0.07] text-[10px] text-[#A7A4B8] hover:text-[#ECEAF4] whitespace-nowrap shrink-0 max-w-[180px] truncate disabled:opacity-50"
                    title={art.title}
                  >
                    {art.source}: {art.title}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-2xl bg-[#1C1F2E] border border-white/[0.07] p-4 text-center space-y-2">
          <p className="text-xs text-[#A7A4B8]">
            พร้อมวิเคราะห์ข่าว RSS สองชั้น (Cloudflare AI + Main AI)
          </p>
          <button
            type="button"
            onClick={() => void runBackgroundAnalysis()}
            className="px-3 py-1.5 rounded-xl bg-[#7C6CFF] text-[#0F1117] text-xs font-bold"
          >
            เริ่มวิเคราะห์ทันที
          </button>
        </div>
      )}
    </section>
  );
};
