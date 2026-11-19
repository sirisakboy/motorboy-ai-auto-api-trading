import React, { useState } from 'react';
import {
  X,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
  Gauge,
  ShieldAlert,
  Globe,
  Building2,
} from 'lucide-react';
import {
  AiAnalysisResult,
  TradingHistoryEntry,
  MarketSentimentScore,
} from '../types';
import {
  analyzeMarketWithGemini,
  fetchMarketSentimentScore,
} from '../services/geminiService';
import { useModalA11y } from '../hooks/useModalA11y';
import { formatAsOfLabel } from '../utils';

interface StockDetailModalProps {
  symbol: string;
  name: string;
  nameEn?: string;
  price: number;
  change: number;
  volume?: number;
  sector?: string;
  pe?: number;
  dividendYield?: number;
  marketCap?: string;
  isThaiStock?: boolean;
  /** false = ข้อมูลตั้งต้น/ตลาดปิด ไม่ใช่ราคาสด */
  isLive?: boolean;
  /** เวลาอ้างอิงของราคาที่แสดง (ISO) */
  updatedAt?: string;
  useThb?: boolean;
  usdThbRate?: number;
  geminiApiKey: string;
  onSaveToHistory?: (entry: Omit<TradingHistoryEntry, 'id' | 'userId' | 'timestamp'>) => Promise<void>;
  onDismiss: () => void;
}

export const StockDetailModal: React.FC<StockDetailModalProps> = ({
  symbol, name, nameEn, price, change, volume, sector, pe, dividendYield, marketCap,
  isThaiStock = false, isLive, updatedAt, useThb = false, usdThbRate = 36.45, geminiApiKey, onSaveToHistory, onDismiss,
}) => {
  const [activeTab, setActiveTab] = useState<'gemini' | 'fundamentals' | 'risk'>('gemini');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiResult, setAiResult] = useState<AiAnalysisResult | null>(null);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [sentiment, setSentiment] = useState<MarketSentimentScore | null>(null);
  const asOfLabel = isLive === false ? formatAsOfLabel(updatedAt) : '';
  const multiplier = !isThaiStock && useThb ? usdThbRate : 1;
  const currency = isThaiStock || useThb ? '\u0e3f' : '$';

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    try {
      const coinLike = { id: symbol, symbol, name: nameEn || name, binanceSymbol: '', price, change, high: price * (isThaiStock ? 1.03 : 1.05), low: price * (isThaiStock ? 0.97 : 0.95), volume: volume || 0 };
      const [result, sentResult] = await Promise.allSettled([
        analyzeMarketWithGemini(geminiApiKey, coinLike),
        fetchMarketSentimentScore(geminiApiKey, coinLike),
      ]);
      if (result.status === 'fulfilled') setAiResult(result.value);
      if (sentResult.status === 'fulfilled') setSentiment(sentResult.value);
    } catch (err) { console.warn('Stock analysis error:', err); }
    finally { setIsAnalyzing(false); }
  };

  const handleSave = async () => {
    if (!onSaveToHistory || savedSuccess || !aiResult) return;
    try {
      await onSaveToHistory({
        type: 'AI_ANALYSIS',
        symbol: `${symbol} (${isThaiStock ? 'TH' : 'US'})`,
        action: aiResult.action === 'LONG' ? 'BUY' : aiResult.action === 'SHORT' ? 'SELL' : 'HOLD',
        price,
        aiSummary: `[AI วิเคราะห์ ${symbol}] ${aiResult.summary}\nกลยุทธ์: ${aiResult.strategyAdvice}`,
        confidence: aiResult.confidence,
      });
      setSavedSuccess(true);
    } catch (err) { console.warn('Failed to save:', err); }
  };

  const dialogRef = useModalA11y({ onClose: onDismiss });

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={`รายละเอียดหุ้น ${symbol}`}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-sm overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onDismiss();
      }}
    >
      <div className="w-full sm:max-w-2xl bg-[#141725] border-t sm:border border-[#222640] rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] sm:my-8 flex flex-col">
        <div className="p-5 border-b border-[#222640] flex items-start justify-between bg-gradient-to-r from-[#1C1F2E] to-[#141725]">
          <div className="flex-1 pr-4">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full ${isThaiStock ? 'bg-[#FFB86B]/20 border border-[#FFB86B]/40 text-[#FFB86B]' : 'bg-[#A89FFF]/20 border border-[#A89FFF]/40 text-[#A89FFF]'}`}>
                {isThaiStock ? <Building2 className="w-3.5 h-3.5" /> : <Globe className="w-3.5 h-3.5" />}
                {isThaiStock ? 'หุ้นไทย SET50' : 'หุ้นต่างประเทศ'}
              </span>
              {sector && <span className="text-[10px] text-[#A7A4B8] bg-[#222640] px-2 py-0.5 rounded-full">{sector}</span>}
            </div>
            <h2 className="text-white text-base sm:text-lg font-bold leading-snug">{symbol} &bull; {name}</h2>
            <div className="flex items-center gap-3 mt-1">
              <span className={`text-xl font-black ${change >= 0 ? 'text-[#7EE0B5]' : 'text-[#FFB86B]'}`}>{currency}{(price * multiplier).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              <span className={`text-sm font-bold ${change >= 0 ? 'text-[#7EE0B5]' : 'text-[#FFB86B]'}`}>{change >= 0 ? '+' : ''}{change.toFixed(2)}%</span>
            </div>
            {asOfLabel && (
              <p
                className="text-[10px] text-[#8E8BA3] mt-1 tabular-nums"
                data-testid="stock-detail-as-of"
              >
                {asOfLabel} • ราคาอ้างอิง ไม่ใช่ราคาสด
              </p>
            )}
          </div>
          <button type="button" onClick={onDismiss} aria-label="ปิดหน้าต่างรายละเอียดหุ้น" className="text-[#A7A4B8] hover:text-white p-1.5 rounded-lg hover:bg-[#222640] transition-colors shrink-0"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex border-b border-[#222640] bg-[#171B26] px-5 pt-2 gap-2 text-xs">
          {[{ key: 'gemini', label: 'AI วิเคราะห์', icon: <Sparkles className="w-3.5 h-3.5" /> }, { key: 'fundamentals', label: 'ปัจจัยพื้นฐาน', icon: <Gauge className="w-3.5 h-3.5" /> }, { key: 'risk', label: 'ความเสี่ยง', icon: <ShieldAlert className="w-3.5 h-3.5" /> }].map(tab => (
            <button key={tab.key} onClick={() => { setActiveTab(tab.key as any); if (tab.key === 'gemini' && !aiResult) handleAnalyze(); }} className={`pb-2.5 px-3 font-semibold transition-all border-b-2 flex items-center gap-1.5 ${activeTab === tab.key ? 'text-[#7C6CFF] border-[#7C6CFF]' : 'text-[#A7A4B8] border-transparent hover:text-white'}`}>
              {tab.icon}<span>{tab.label}</span>
            </button>
          ))}
        </div>

        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-[#1C1F2E] border border-[#222640] text-center"><span className="text-[10px] text-[#A7A4B8] block">P/E</span><span className="text-white font-bold text-sm">{pe || 'N/A'}</span></div>
            <div className="p-3 rounded-xl bg-[#1C1F2E] border border-[#222640] text-center"><span className="text-[10px] text-[#A7A4B8] block">มูลค่าตลาด</span><span className="text-white font-bold text-sm">{marketCap || 'N/A'}</span></div>
            <div className="p-3 rounded-xl bg-[#1C1F2E] border border-[#222640] text-center"><span className="text-[10px] text-[#A7A4B8] block">ปริมาณซื้อขาย</span><span className="text-white font-bold text-sm">{volume ? `${(volume / 1000000).toFixed(1)}M` : 'N/A'}</span></div>
            <div className="p-3 rounded-xl bg-[#1C1F2E] border border-[#222640] text-center"><span className="text-[10px] text-[#A7A4B8] block">{isThaiStock ? 'เงินปันผล' : 'อุตสาหกรรม'}</span><span className="text-white font-bold text-sm">{isThaiStock ? `${dividendYield || 0}%` : (sector || 'N/A')}</span></div>
          </div>

          {sentiment && (
            <div className="p-4 rounded-xl bg-[#1C1F2E] border border-[#222640]">
              <div className="flex items-center justify-between mb-2"><span className="text-xs text-[#A7A4B8]">คะแนน Sentiment</span><span className={`text-lg font-black ${sentiment.score >= 60 ? 'text-[#7EE0B5]' : sentiment.score <= 40 ? 'text-[#FFB86B]' : 'text-[#FFB86B]'}`}>{sentiment.score}/100</span></div>
              <div className="w-full h-2 bg-[#0F1117] rounded-full overflow-hidden mb-2"><div className={`h-full rounded-full ${sentiment.score >= 60 ? 'bg-[#7EE0B5]' : sentiment.score <= 40 ? 'bg-[#FFB86B]' : 'bg-[#FFB86B]'}`} style={{ width: `${sentiment.score}%` }} /></div>
              <p className="text-[11px] text-[#ECEAF4]">{sentiment.summaryReason}</p>
            </div>
          )}

          {isAnalyzing && <div className="py-8 flex flex-col items-center space-y-3"><Loader2 className="w-8 h-8 text-[#7C6CFF] animate-spin" /><p className="text-sm text-[#ECEAF4]">AI กำลังวิเคราะห์ {symbol}...</p></div>}

          {!isAnalyzing && aiResult && activeTab === 'gemini' && (
            <div className="space-y-3">
              <div className={`p-3 rounded-xl border ${aiResult.action === 'LONG' ? 'bg-[#7EE0B5]/10 border-[#7EE0B5]/30' : 'bg-[#FFB86B]/10 border-[#FFB86B]/30'}`}>
                <div className="flex items-center gap-2 mb-1">
                  {aiResult.action === 'LONG' ? <ArrowUpRight className="w-5 h-5 text-[#7EE0B5]" /> : <ArrowDownRight className="w-5 h-5 text-[#FFB86B]" />}
                  <span className={`font-bold ${aiResult.action === 'LONG' ? 'text-[#7EE0B5]' : 'text-[#FFB86B]'}`}>{aiResult.action} &bull; {aiResult.confidence}%</span>
                </div>
                <p className="text-sm text-[#ECEAF4]">{aiResult.summary}</p>
              </div>
              <div className="p-3 rounded-xl bg-[#1C1F2E] border border-[#222640]"><span className="text-xs text-[#A7A4B8] block mb-1">กลยุทธ์แนะนำ</span><p className="text-sm text-white">{aiResult.strategyAdvice}</p></div>
              {aiResult.keyDrivers && aiResult.keyDrivers.length > 0 && (
                <div className="p-3 rounded-xl bg-[#1C1F2E] border border-[#222640]"><span className="text-xs text-[#7EE0B5] font-semibold block mb-1">ปัจจัยหนุน</span>{aiResult.keyDrivers.map((d, i) => <p key={i} className="text-[11px] text-[#ECEAF4] flex items-start gap-1.5"><span className="text-[#7EE0B5]">&#10003;</span> {d}</p>)}</div>
              )}
              {aiResult.risks && aiResult.risks.length > 0 && (
                <div className="p-3 rounded-xl bg-[#1C1F2E] border border-[#222640]"><span className="text-xs text-[#FFB86B] font-semibold block mb-1">ความเสี่ยง</span>{aiResult.risks.map((r, i) => <p key={i} className="text-[11px] text-[#ECEAF4] flex items-start gap-1.5"><span className="text-[#FFB86B]">&bull;</span> {r}</p>)}</div>
              )}
            </div>
          )}

          {!isAnalyzing && !aiResult && activeTab === 'gemini' && (
            <div className="py-8 text-center"><button onClick={handleAnalyze} className="px-6 py-3 rounded-xl bg-[#7C6CFF] hover:bg-[#6D5DFF] text-[#0F1117] font-bold text-sm flex items-center gap-2 mx-auto"><Sparkles className="w-4 h-4" /> วิเคราะห์ด้วย AI</button></div>
          )}

          {activeTab === 'fundamentals' && (
            <div className="p-4 rounded-xl bg-[#1C1F2E] border border-[#222640] space-y-3">
              <h4 className="text-xs font-semibold text-[#FFB86B]">ข้อมูลบริษัท</h4>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-[#A7A4B8]">ชื่อ:</span> <span className="text-white">{name}</span></div>
                <div><span className="text-[#A7A4B8]">สัญลักษณ์:</span> <span className="text-white">{symbol}</span></div>
                <div><span className="text-[#A7A4B8]">อุตสาหกรรม:</span> <span className="text-white">{sector || 'N/A'}</span></div>
                <div><span className="text-[#A7A4B8]">P/E:</span> <span className="text-white">{pe || 'N/A'}</span></div>
                <div><span className="text-[#A7A4B8]">มูลค่าตลาด:</span> <span className="text-white">{marketCap || 'N/A'}</span></div>
                {isThaiStock && <div><span className="text-[#A7A4B8]">เงินปันผล:</span> <span className="text-white">{dividendYield || 0}%</span></div>}
              </div>
              <div className="pt-2 border-t border-[#222640] flex justify-end">
                <a
                  href={`https://finance.yahoo.com/quote/${symbol}${isThaiStock ? '.BK' : ''}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-lg bg-[#222640] hover:bg-[#383E4E] text-[#A89FFF] text-xs font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>ดูข้อมูลเชิงลึกบน Yahoo Finance</span>
                </a>
              </div>
            </div>
          )}

          {activeTab === 'risk' && (
            <div className="p-4 rounded-xl bg-[#1C1F2E] border border-[#222640]">
              <h4 className="text-xs font-semibold text-[#FFB86B] mb-2">ปัจจัยความเสี่ยง</h4>
              <ul className="space-y-1.5 text-xs text-[#ECEAF4]">
                <li className="flex items-start gap-2"><span className="text-[#FFB86B]">&bull;</span> ความผันผวนของตลาด</li>
                <li className="flex items-start gap-2"><span className="text-[#FFB86B]">&bull;</span> การเปลี่ยนแปลงนโยบายธนาคารกลาง</li>
                <li className="flex items-start gap-2"><span className="text-[#FFB86B]">&bull;</span> ความเสี่ยงอัตราแลกเปลี่ยน (หุ้นนอก)</li>
                <li className="flex items-start gap-2"><span className="text-[#FFB86B]">&bull;</span> ผลประกอบการต่ำกว่าคาด</li>
              </ul>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-[#222640] bg-[#1C1F2E] flex items-center justify-between flex-wrap gap-2">
          <button onClick={() => { setAiResult(null); setSentiment(null); handleAnalyze(); }} disabled={isAnalyzing} className="px-3 py-2 rounded-xl text-xs font-medium text-[#ECEAF4] hover:text-white hover:bg-[#222640] border border-[#222640] flex items-center gap-1.5 transition-colors disabled:opacity-50">
            <Loader2 className={`w-3.5 h-3.5 ${isAnalyzing ? 'animate-spin' : ''}`} /><span>วิเคราะห์ใหม่</span>
          </button>
          {onSaveToHistory && (
            <button onClick={handleSave} disabled={isAnalyzing || savedSuccess || !aiResult} className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#7C6CFF] hover:bg-[#6D5DFF] text-[#0F1117] flex items-center gap-1.5 transition-colors disabled:opacity-50">
              {savedSuccess ? 'บันทึกแล้ว' : 'บันทึกลงประวัติ'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
