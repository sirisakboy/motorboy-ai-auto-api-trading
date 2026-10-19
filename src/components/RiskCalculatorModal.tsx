import React, { useState, useMemo, useEffect } from 'react';
import {
  X, Calculator, ArrowUpRight, ArrowDownRight, CheckCircle2, BookmarkPlus,
  Sparkles, ShieldCheck, Loader2,
} from 'lucide-react';
import { TradingSignal, TradingHistoryEntry, AiAnalysisResult, CryptoCoin } from '../types';
import { analyzeMarketWithGemini } from '../services/geminiService';
import { t } from '../i18n';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  useThb?: boolean;
  usdThbRate?: number;
  signals?: TradingSignal[];
  geminiApiKey?: string;
  onSaveToHistory?: (
    entry: Omit<TradingHistoryEntry, 'id' | 'userId' | 'timestamp'>
  ) => Promise<void>;
}

const RR_OPTIONS = [1, 1.5, 2, 3];

export const RiskCalculatorModal: React.FC<Props> = ({
  isOpen, onClose, useThb = false, usdThbRate = 36.45, signals = [], geminiApiKey = '', onSaveToHistory,
}) => {
  const [direction, setDirection] = useState<'LONG' | 'SHORT'>('LONG');
  const [accountSize, setAccountSize] = useState('10000');
  const [riskPercent, setRiskPercent] = useState('1');
  const [entryPrice, setEntryPrice] = useState('');
  const [slPrice, setSlPrice] = useState('');
  const [rr, setRr] = useState(2);
  const [leverage, setLeverage] = useState('1');
  const [signalId, setSignalId] = useState('');
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<AiAnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // AI review goes stale as soon as the plan changes
  useEffect(() => {
    setAiResult(null);
  }, [direction, entryPrice, slPrice, rr]);

  const calc = useMemo(() => {
    const acct = parseFloat(accountSize);
    const risk = parseFloat(riskPercent);
    const entry = parseFloat(entryPrice);
    const sl = parseFloat(slPrice);
    const lev = parseFloat(leverage) || 1;
    const valid =
      isFinite(acct) && acct > 0 &&
      isFinite(risk) && risk > 0 && risk <= 100 &&
      isFinite(entry) && entry > 0 &&
      isFinite(sl) && sl > 0 && sl !== entry &&
      lev >= 1;
    if (!valid) return null;
    const consistent =
      direction === 'LONG' ? sl < entry : sl > entry;
    const riskAmount = (acct * risk) / 100;
    const slDistPct = (Math.abs(entry - sl) / entry) * 100;
    const notional = riskAmount / (slDistPct / 100);
    const units = notional / entry;
    const tp = direction === 'LONG'
      ? entry + Math.abs(entry - sl) * rr
      : entry - Math.abs(entry - sl) * rr;
    const reward = riskAmount * rr;
    const margin = notional / lev;
    return { acct, risk, entry, sl, lev, riskAmount, slDistPct, notional, units, tp, reward, margin, consistent };
  }, [accountSize, riskPercent, entryPrice, slPrice, leverage, direction, rr]);

  /** Protection checklist — each rule with a one-line technique tip. */
  const moneyRate = useThb ? usdThbRate : 1;
  const moneyCur = useThb ? '฿' : '$';
  const fmtMoney = (v: number) =>
    `${moneyCur}${(v * moneyRate).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  const checklist = useMemo(() => {
    if (!calc) return [];
    return [
      {
        ok: calc.risk <= 2,
        title: t('risk_calc.checklist.risk_limit_title'),
        tip: calc.risk <= 2 ? t('risk_calc.checklist.risk_limit_ok') : t('risk_calc.checklist.risk_limit_fail'),
      },
      {
        ok: calc.consistent,
        title: direction === 'LONG' ? t('risk_calc.checklist.consistent_long_title') : t('risk_calc.checklist.consistent_short_title'),
        tip: calc.consistent ? t('risk_calc.checklist.consistent_ok') : t('risk_calc.checklist.consistent_fail'),
      },
      {
        ok: calc.slDistPct >= 0.5,
        title: t('risk_calc.checklist.sl_dist_title', { dist: calc.slDistPct.toFixed(2) }),
        tip: calc.slDistPct >= 0.5 ? t('risk_calc.checklist.sl_dist_ok') : t('risk_calc.checklist.sl_dist_fail'),
      },
      {
        ok: rr >= 2,
        title: `R:R 1:${rr}`,
        tip: rr >= 2 ? t('risk_calc.checklist.rr_ok') : t('risk_calc.checklist.rr_fail'),
      },
      {
        ok: calc.lev === 1,
        title: calc.lev === 1 ? t('risk_calc.checklist.lev_spot_title') : t('risk_calc.checklist.lev_margin_title', { lev: String(calc.lev) }),
        tip: calc.lev === 1 ? t('risk_calc.checklist.lev_spot_tip') : t('risk_calc.checklist.lev_margin_tip', { margin: fmtMoney(calc.margin) }),
      },
    ];
  }, [calc, direction, rr, fmtMoney]);

  const handleAiAnalyze = async () => {
    if (!calc || isAnalyzing) return;
    setIsAnalyzing(true);
    setAiError(null);
    try {
      const activeSignal = signals.find((x) => x.id === signalId);
      const coinLike: CryptoCoin = {
        id: (activeSignal?.symbol ?? 'manual').toLowerCase(),
        symbol: activeSignal?.symbol ?? 'MANUAL',
        name: activeSignal?.base ?? 'Manual Plan',
        binanceSymbol: activeSignal?.symbol ?? 'MANUAL',
        price: calc.entry,
        change: activeSignal?.change ?? 0,
        high: calc.entry * 1.02,
        low: calc.entry * 0.98,
        volume: 0,
      };
      const planSignal: TradingSignal = {
        id: `riskplan_${Date.now()}`,
        symbol: coinLike.symbol,
        base: coinLike.symbol,
        quote: 'USDT',
        type: direction,
        probability: activeSignal?.probability ?? 70,
        timeframe: 'สั้น 1-7วัน',
        price: calc.entry,
        change: coinLike.change,
        statusText: `แผน ${direction} Entry ${calc.entry} SL ${calc.sl} TP ${calc.tp.toFixed(2)}`,
        reason: `Risk ${calc.risk}% R:R 1:${rr} SL ห่าง ${calc.slDistPct.toFixed(2)}%`,
        sources: ['Risk Calculator'],
        tags: ['RiskPlan'],
        sl: calc.sl,
        tp: calc.tp,
        similarity: activeSignal?.similarity ?? 75,
        etfFlow: activeSignal?.etfFlow ?? '—',
        category: activeSignal?.category ?? 'CRYPTO',
      };
      const result = await analyzeMarketWithGemini(geminiApiKey, coinLike, planSignal);
      setAiResult(result);
    } catch {
      setAiError('AI ประเมินไม่สำเร็จ กรุณาลองใหม่');
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (!isOpen) return null;

  const fmtPrice = (v: number) =>
    `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: v < 10 ? 4 : 2 })}`;

  const applySignal = (id: string) => {
    setSignalId(id);
    setSavedSuccess(false);
    const s = signals.find((x) => x.id === id);
    if (!s) return;
    setDirection(s.type);
    setEntryPrice(String(s.price));
    setSlPrice(String(s.sl));
  };

  const activeSignal = signals.find((x) => x.id === signalId);

  const handleSave = async () => {
    if (!calc || !onSaveToHistory) return;
    setSaveError(null);
    try {
      await onSaveToHistory({
        type: 'SIGNAL_SAVED',
        symbol: activeSignal?.symbol ?? 'MANUAL',
        action: direction,
        price: calc.entry,
        aiSummary:
          `[Risk Plan ${direction}] Entry ${fmtPrice(calc.entry)} | SL ${fmtPrice(calc.sl)} (${calc.slDistPct.toFixed(2)}%) | TP ${fmtPrice(calc.tp)} (R:R 1:${rr}) | ` +
          `Position ${fmtMoney(calc.notional)} (${calc.units.toLocaleString(undefined, { maximumFractionDigits: 4 })} หน่วย) | เสี่ยง ${fmtMoney(calc.riskAmount)} (${calc.risk}% ของพอร์ต) | มาร์จิ้น x${calc.lev} = ${fmtMoney(calc.margin)}`,
        sl: calc.sl,
        tp: calc.tp,
      });
      setSavedSuccess(true);
    } catch {
      setSaveError(t('risk_calc.save.error'));
    }
  };

  const inputCls =
    'w-full bg-[#0F1117] border border-[#252A3A] rounded-xl p-2.5 text-white text-sm focus:border-[#7C6CFF] outline-none';
  const labelCls = 'block text-[11px] text-[#9CA3AF] mb-1';

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto">
      <div className="bg-[#1A1D29] border-t sm:border border-[#252A3A] rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md p-5 sm:p-6 shadow-2xl max-h-[92vh] overflow-y-auto sm:my-8">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center space-x-2 text-white">
            <Calculator className="w-5 h-5 text-[#7C6CFF]" />
            <h2 className="font-bold text-lg">{t('risk_calc.title')}</h2>
          </div>
          <button onClick={onClose} className="text-[#6B7280] hover:text-white p-1" aria-label="ปิด">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3.5">
          {/* Signal picker */}
          {signals.length > 0 && (
            <div>
              <label className={labelCls}>{t('risk_calc.labels.signal_picker')}</label>
              <select
                value={signalId}
                onChange={(e) => applySignal(e.target.value)}
                className={`${inputCls} ${signalId ? 'border-[#7C6CFF]/60' : ''}`}
              >
                <option value="">{t('risk_calc.labels.manual_entry')}</option>
                {signals.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.symbol} {s.type} @ {s.price.toLocaleString(undefined, { maximumFractionDigits: s.price < 10 ? 4 : 2 })}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Direction */}
          <div>
            <label className={labelCls}>{t('risk_calc.labels.direction')}</label>
            <div className="grid grid-cols-2 gap-2">
              {(['LONG', 'SHORT'] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => { setDirection(d); setSavedSuccess(false); }}
                  className={`py-2 rounded-xl text-sm font-bold border flex items-center justify-center gap-1.5 transition-colors ${
                    direction === d
                      ? d === 'LONG'
                        ? 'bg-[#22C55E]/20 border-[#22C55E]/60 text-[#4ADE80]'
                        : 'bg-[#EF4444]/20 border-[#EF4444]/60 text-[#F87171]'
                      : 'bg-[#0F1117] border-[#252A3A] text-[#9CA3AF] hover:text-white'
                  }`}
                >
                  {d === 'LONG' ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                  {d}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>{t('risk_calc.labels.account_size', { currency: moneyCur })}</label>
              <input type="number" min="0" value={accountSize} onChange={(e) => setAccountSize(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{t('risk_calc.labels.risk_per_trade')}</label>
              <input type="number" min="0" max="100" step="0.1" value={riskPercent} onChange={(e) => setRiskPercent(e.target.value)} className={inputCls} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>{t('risk_calc.labels.entry_price')}</label>
              <input type="number" min="0" value={entryPrice} onChange={(e) => { setEntryPrice(e.target.value); setSavedSuccess(false); }} placeholder="เช่น 92450" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{t('risk_calc.labels.sl_price')}</label>
              <input type="number" min="0" value={slPrice} onChange={(e) => { setSlPrice(e.target.value); setSavedSuccess(false); }} placeholder="เช่น 90500" className={inputCls} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>{t('risk_calc.labels.rr_ratio')}</label>
              <div className="flex gap-1.5">
                {RR_OPTIONS.map((v) => (
                  <button
                    key={v}
                    onClick={() => { setRr(v); setSavedSuccess(false); }}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-colors ${
                      rr === v ? 'bg-[#7C6CFF]/25 border-[#7C6CFF]/60 text-white' : 'bg-[#0F1117] border-[#252A3A] text-[#9CA3AF] hover:text-white'
                    }`}
                  >
                    1:{v}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className={labelCls}>{t('risk_calc.labels.leverage')}</label>
              <input type="number" min="1" step="1" value={leverage} onChange={(e) => setLeverage(e.target.value)} className={inputCls} />
            </div>
          </div>

          {/* Protection checklist — เข้าใจง่ายทีละข้อ */}
          {checklist.length > 0 && (
            <div className="rounded-2xl bg-[#0F1117] border border-[#252A3A] p-3 space-y-2">
              <p className="text-xs font-bold text-white flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-[#4ADE80]" />
                {t('risk_calc.checklist.header')}</p>
              {checklist.map((c) => (
                <div key={c.title} className="flex items-start gap-2 text-[11px]">
                  <span className={`mt-0.5 w-4 h-4 rounded-full flex items-center justify-center shrink-0 text-[10px] font-black ${
                    c.ok ? 'bg-[#22C55E]/20 text-[#4ADE80]' : 'bg-[#F59E0B]/20 text-[#FBBF24]'
                  }`}>
                    {c.ok ? '✓' : '!'}
                  </span>
                  <span>
                    <strong className={c.ok ? 'text-[#CBD5E1]' : 'text-[#FBBF24]'}>{c.title}</strong>
                    <span className="text-[#9CA3AF]"> — {c.tip}</span>
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Results */}
          <div className="rounded-2xl bg-[#7C6CFF]/10 border border-[#7C6CFF]/20 p-4 space-y-2">
            {calc ? (
              <>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#A5B4FC]">{t('risk_calc.results.notional')}</span>
                  <strong className="text-white text-base">{fmtMoney(calc.notional)}</strong>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#A5B4FC]">{t('risk_calc.results.units')}</span>
                  <strong className="text-white font-mono">{calc.units.toLocaleString(undefined, { maximumFractionDigits: 4 })}</strong>
                </div>
                <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                  <div className="rounded-xl bg-[#0F1117] border border-[#252A3A] py-2">
                    <p className="text-[10px] text-[#9CA3AF]">{t('risk_calc.results.risk')}</p>
                    <p className="text-[#F87171] text-xs font-bold">{fmtMoney(calc.riskAmount)}</p>
                  </div>
                  <div className="rounded-xl bg-[#0F1117] border border-[#252A3A] py-2">
                    <p className="text-[10px] text-[#9CA3AF]">{t('risk_calc.results.reward')}</p>
                    <p className="text-[#4ADE80] text-xs font-bold">{fmtMoney(calc.reward)}</p>
                  </div>
                  <div className="rounded-xl bg-[#0F1117] border border-[#252A3A] py-2">
                    <p className="text-[10px] text-[#9CA3AF]">{t('risk_calc.results.margin')}</p>
                    <p className="text-white text-xs font-bold">{fmtMoney(calc.margin)}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs pt-1 border-t border-[#7C6CFF]/20">
                  <span className="text-[#A5B4FC]">SL {calc.slDistPct.toFixed(2)}% • TP {fmtPrice(calc.tp)}</span>
                  <span className="text-[#6B7280]">SL {fmtPrice(calc.sl)}</span>
                </div>
                <p className="text-[11px] text-[#CBD5E1] leading-relaxed bg-[#0F1117]/60 rounded-xl px-3 py-2">
                  {t('risk_calc.results.summary', {
                    notional: fmtMoney(calc.notional),
                    risk: fmtMoney(calc.riskAmount),
                    riskPct: String(calc.risk),
                    reward: fmtMoney(calc.reward),
                    rr: String(rr),
                  })}
                </p>
              </>
            ) : (
              <p className="text-[#FBBF24] text-[11px] text-center">
                {t('risk_calc.results.invalid_input')}
              </p>
            )}
          </div>

          {/* AI realtime plan review */}
          <div className="rounded-2xl bg-gradient-to-br from-[#7C6CFF]/15 to-[#0284C7]/10 border border-[#7C6CFF]/30 p-4 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-bold text-white flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-[#A5B4FC]" />
                {t('risk_calc.ai.header')}</p>
              <div className="flex items-center gap-2">
                {aiResult && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md border ${
                    aiResult.source === 'GEMINI_AI'
                      ? 'bg-[#22C55E]/15 border-[#22C55E]/40 text-[#4ADE80]'
                      : 'bg-[#F59E0B]/15 border-[#F59E0B]/40 text-[#FBBF24]'
                  }`}>
                    {aiResult.source === 'GEMINI_AI' ? 'Gemini AI' : 'Technical model'}
                  </span>
                )}
              </div>
            </div>
            {!aiResult && !aiError && (
              <p className="text-[11px] text-[#9CA3AF] leading-relaxed">
                {t('risk_calc.ai.desc')}</p>
            )}
            {aiError && <p className="text-red-400 text-xs">{t('risk_calc.ai.error')}</p>}
            {aiResult && (
              <div className="space-y-1.5 text-xs">
                <div className="flex items-center gap-2">
                  <span className={`font-bold px-2 py-0.5 rounded-lg ${
                    aiResult.action === 'LONG' ? 'bg-[#22C55E]/20 text-[#4ADE80]' : aiResult.action === 'SHORT' ? 'bg-[#EF4444]/20 text-[#F87171]' : 'bg-[#252A3A] text-[#9CA3AF]'
                  }`}>
                    {aiResult.action}
                  </span>
                  <span className="text-[#9CA3AF]">มั่นใจ {aiResult.confidence}%</span>
                </div>
                <p className="text-[#E2E8F0] leading-relaxed">{aiResult.summary}</p>
                {aiResult.strategyAdvice && (
                  <p className="text-[#A5B4FC] leading-relaxed">เทคนิก: {aiResult.strategyAdvice}</p>
                )}
                <p className="text-[11px] text-[#6B7280]">
                  แนวรับ {fmtPrice(aiResult.supportLevel)} • แนวต้าน {fmtPrice(aiResult.resistanceLevel)}
                </p>
              </div>
            )}
            <button
              onClick={handleAiAnalyze}
              disabled={!calc || isAnalyzing}
              className="w-full py-2.5 rounded-xl bg-[#7C6CFF] hover:bg-[#6D5DFF] disabled:opacity-40 text-white text-sm font-bold inline-flex items-center justify-center gap-2"
            >
              {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              <span>{isAnalyzing ? t('risk_calc.ai.analyze_loading') : aiResult ? t('risk_calc.ai.reanalyze_btn') : t('risk_calc.ai.analyze_btn')}</span>
            </button>
            {!geminiApiKey && (
              <p className="text-[10px] text-[#6B7280] text-center">
                {t('risk_calc.ai.api_missing')}
              </p>
            )}
          </div>

          {/* Save */}
          {saveError && <p className="text-red-400 text-xs text-center">{t('risk_calc.save.error')}</p>}
          {savedSuccess ? (
            <p className="text-[#4ADE80] text-xs text-center flex items-center justify-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" /> {t('risk_calc.save.success')}</p>
          ) : (
            <button
              onClick={handleSave}
              disabled={!calc || !onSaveToHistory}
              title={!onSaveToHistory ? 'ต้องเข้าสู่ระบบก่อนบันทึก' : t('risk_calc.save.btn')}
              className="w-full py-2.5 rounded-xl bg-[#22C55E]/20 hover:bg-[#22C55E]/30 disabled:opacity-40 border border-[#22C55E]/40 text-[#4ADE80] text-sm font-bold inline-flex items-center justify-center gap-2"
            >
              <BookmarkPlus className="w-4 h-4" />
              {t('risk_calc.save.btn')}</button>
          )}
        </div>
      </div>
    </div>
  );
};
