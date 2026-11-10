import React, { useState, useMemo, useEffect } from 'react';
import {
  X, Calculator, ArrowUpRight, ArrowDownRight, CheckCircle2, BookmarkPlus,
  Sparkles, ShieldCheck, Loader2, Bot, Scale, Plus, Trash2, RotateCcw,
  Sliders, AlertTriangle, Copy, Check
} from 'lucide-react';
import {
  TradingSignal, TradingHistoryEntry, AiAnalysisResult, CryptoCoin,
  PortfolioRebalanceAsset, PortfolioRebalancePlan
} from '../types';
import { analyzeMarketWithGemini } from '../services/geminiService';
import { t } from '../i18n';
import { useModalA11y } from '../hooks/useModalA11y';
import { useMascotStore } from '../services/mascotService';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  useThb?: boolean;
  usdThbRate?: number;
  signals?: TradingSignal[];
  cryptoList?: CryptoCoin[];
  geminiApiKey?: string;
  onSaveToHistory?: (
    entry: Omit<TradingHistoryEntry, 'id' | 'userId' | 'timestamp'>
  ) => Promise<void>;
}

const RR_OPTIONS = [1, 1.5, 2, 3];

const PRESETS: { name: string; desc: string; assets: Array<{ symbol: string; name: string; targetPct: number; category: 'CRYPTO' | 'STOCK' | 'FOREX' | 'CASH' }> }[] = [
  {
    name: 'Crypto Core (50/30/10/10)',
    desc: 'เน้น BTC & ETH คุมความเสี่ยงด้วย USDT สำรอง',
    assets: [
      { symbol: 'BTC', name: 'Bitcoin', targetPct: 50, category: 'CRYPTO' },
      { symbol: 'ETH', name: 'Ethereum', targetPct: 30, category: 'CRYPTO' },
      { symbol: 'SOL', name: 'Solana', targetPct: 10, category: 'CRYPTO' },
      { symbol: 'USDT', name: 'Tether USD', targetPct: 10, category: 'CASH' },
    ],
  },
  {
    name: 'All-Weather (40/30/20/10)',
    desc: 'กระจายความเสี่ยงข้ามสินทรัพย์ Digital + Cash',
    assets: [
      { symbol: 'BTC', name: 'Bitcoin', targetPct: 40, category: 'CRYPTO' },
      { symbol: 'ETH', name: 'Ethereum', targetPct: 30, category: 'CRYPTO' },
      { symbol: 'BNB', name: 'BNB Chain', targetPct: 20, category: 'CRYPTO' },
      { symbol: 'USDT', name: 'Tether USD', targetPct: 10, category: 'CASH' },
    ],
  },
  {
    name: 'High Beta / L1 (35/25/25/15)',
    desc: 'โฟกัส High Performance L1 Ecosystem',
    assets: [
      { symbol: 'BTC', name: 'Bitcoin', targetPct: 35, category: 'CRYPTO' },
      { symbol: 'SOL', name: 'Solana', targetPct: 25, category: 'CRYPTO' },
      { symbol: 'ETH', name: 'Ethereum', targetPct: 25, category: 'CRYPTO' },
      { symbol: 'DOGE', name: 'Dogecoin', targetPct: 15, category: 'CRYPTO' },
    ],
  },
];

export const RiskCalculatorModal: React.FC<Props> = ({
  isOpen, onClose, useThb = false, usdThbRate = 36.45, signals = [], cryptoList = [], geminiApiKey = '', onSaveToHistory,
}) => {
  // Accessibility: role/aria-modal/Escape/focus-trap/scroll-lock. Must run before
  // the `if (!isOpen) return null` guard further down.
  const dialogRef = useModalA11y({ onClose, enabled: isOpen });

  // Modal Top Tab: Position Sizing vs Portfolio Rebalance
  const [activeTab, setActiveTab] = useState<'POSITION' | 'REBALANCE'>('POSITION') ;

  // --- TAB 1: Position Sizing State ---
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

  // --- TAB 2: Rebalance Portfolio State ---
  // Helper to find initial price for common symbols
  const getSymbolPrice = (sym: string): number => {
    const fromCrypto = cryptoList.find((c) => c.symbol.toUpperCase() === sym.toUpperCase());
    if (fromCrypto && fromCrypto.price > 0) return fromCrypto.price;
    const fromSignal = signals.find((s) => s.symbol.toUpperCase().includes(sym.toUpperCase()));
    if (fromSignal && fromSignal.price > 0) return fromSignal.price;
    if (sym === 'BTC') return 95000;
    if (sym === 'ETH') return 3400;
    if (sym === 'SOL') return 210;
    if (sym === 'BNB') return 650;
    if (sym === 'DOGE') return 0.28;
    if (sym === 'USDT' || sym === 'USD' || sym === 'CASH') return 1;
    return 100;
  };

  const [rebalanceAssets, setRebalanceAssets] = useState<PortfolioRebalanceAsset[]>([
    { id: 'ast_1', symbol: 'BTC', name: 'Bitcoin', currentUnits: 0.15, currentPrice: 95000, targetPct: 50, category: 'CRYPTO' },
    { id: 'ast_2', symbol: 'ETH', name: 'Ethereum', currentUnits: 2.5, currentPrice: 3400, targetPct: 30, category: 'CRYPTO' },
    { id: 'ast_3', symbol: 'SOL', name: 'Solana', currentUnits: 15, currentPrice: 210, targetPct: 10, category: 'CRYPTO' },
    { id: 'ast_4', symbol: 'USDT', name: 'Tether USD', currentUnits: 2000, currentPrice: 1, targetPct: 10, category: 'CASH' },
  ]);
  const [cashAdjustmentInput, setCashAdjustmentInput] = useState<string>('0');
  const [driftTolerance, setDriftTolerance] = useState<number>(1); // 1% drift threshold
  const [rebalanceSavedSuccess, setRebalanceSavedSuccess] = useState(false);
  const [rebalanceSaveError, setRebalanceSaveError] = useState<string | null>(null);
  const [copiedOrders, setCopiedOrders] = useState(false);

  // Synchronize live prices from cryptoList when available
  useEffect(() => {
    if (cryptoList.length === 0) return;
    setRebalanceAssets((prev) =>
      prev.map((item) => {
        const live = cryptoList.find((c) => c.symbol.toUpperCase() === item.symbol.toUpperCase());
        if (live && live.price > 0 && Math.abs(live.price - item.currentPrice) / item.currentPrice > 0.001) {
          return { ...item, currentPrice: live.price };
        }
        return item;
      })
    );
  }, [cryptoList]);

  // Currency helpers
  const moneyRate = useThb ? usdThbRate : 1;
  const moneyCur = useThb ? '฿' : '$';
  const fmtMoney = (v: number) =>
    `${moneyCur}${(v * moneyRate).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  const fmtPrice = (v: number) =>
    `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: v < 10 ? 4 : 2 })}`;

  // TAB 1: Position Calculation
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

  // Mascot trigger for Risk Guard
  useEffect(() => {
    if (calc && calc.risk > 2) {
      useMascotStore.getState().setMascotState('RISK_REJECT');
    }
  }, [calc?.risk]);

  // Protection checklist
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
        ok: rr >= 1.5,
        title: `RR Ratio 1:${rr}`,
        tip: rr >= 1.5 ? t('risk_calc.checklist.rr_ok') : t('risk_calc.checklist.rr_fail'),
      },
      {
        ok: calc.lev === 1,
        title: calc.lev === 1 ? t('risk_calc.checklist.lev_spot_title') : t('risk_calc.checklist.lev_margin_title', { lev: String(calc.lev) }),
        tip: calc.lev === 1 ? t('risk_calc.checklist.lev_spot_tip') : t('risk_calc.checklist.lev_margin_tip', { margin: fmtMoney(calc.margin) }),
      },
    ];
  }, [calc, direction, rr, fmtMoney]);

  // TAB 2: Portfolio Rebalance Calculation
  const rebalancePlan: PortfolioRebalancePlan = useMemo(() => {
    const cashAdj = parseFloat(cashAdjustmentInput) || 0;
    const totalCurrentVal = rebalanceAssets.reduce((sum, item) => sum + (item.currentUnits * item.currentPrice), 0);
    const effectiveTotal = Math.max(0, totalCurrentVal + cashAdj);
    const totalTargetPct = rebalanceAssets.reduce((sum, item) => sum + (Number(item.targetPct) || 0), 0);

    const items = rebalanceAssets.map((asset) => {
      const curVal = Math.max(0, asset.currentUnits * asset.currentPrice);
      const curPct = totalCurrentVal > 0 ? (curVal / totalCurrentVal) * 100 : 0;
      const targetVal = (effectiveTotal * (Number(asset.targetPct) || 0)) / 100;
      const targetUnits = asset.currentPrice > 0 ? targetVal / asset.currentPrice : 0;
      const deltaVal = targetVal - curVal;
      const deltaUnits = asset.currentPrice > 0 ? deltaVal / asset.currentPrice : 0;
      const driftPct = curPct - (Number(asset.targetPct) || 0);

      // Action determination based on drift tolerance
      let action: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
      if (Math.abs(driftPct) >= driftTolerance) {
        if (deltaVal > 0) action = 'BUY';
        else if (deltaVal < 0) action = 'SELL';
      }

      return {
        asset,
        currentValue: curVal,
        currentPct: curPct,
        targetValue: targetVal,
        targetUnits,
        driftPct,
        deltaValue: deltaVal,
        deltaUnits,
        action,
      };
    });

    const isBalanced = items.every((i) => i.action === 'HOLD');

    const ordersToExecute = items
      .filter((i) => i.action !== 'HOLD')
      .map((i) => ({
        symbol: i.asset.symbol,
        action: i.action as 'BUY' | 'SELL',
        amountValue: Math.abs(i.deltaValue),
        amountUnits: Math.abs(i.deltaUnits),
        targetPct: i.asset.targetPct,
      }));

    return {
      totalCurrentValue: totalCurrentVal,
      effectiveTotalValue: effectiveTotal,
      cashAdjustment: cashAdj,
      totalTargetPct,
      isBalanced,
      items,
      ordersToExecute,
    };
  }, [rebalanceAssets, cashAdjustmentInput, driftTolerance]);

  // Mascot trigger for Portfolio Rebalance: if severely unbalanced
  useEffect(() => {
    if (activeTab === 'REBALANCE' && rebalancePlan.items.some((i) => Math.abs(i.driftPct) > 10)) {
      useMascotStore.getState().setMascotState('KILL_SWITCH_ACTIVE', 'พอร์ตเบี่ยงเบนเกิน 10% แล้วครับ รีบกด Rebalance เพื่อคืนสมดุลกันเถอะ');
    }
  }, [activeTab, rebalancePlan.items]);

  // Rebalance Asset Handlers
  const handleUpdateAsset = (id: string, field: keyof PortfolioRebalanceAsset, value: any) => {
    setRebalanceAssets((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
    setRebalanceSavedSuccess(false);
  };

  const handleAddAsset = () => {
    const newId = `ast_${Date.now()}`;
    setRebalanceAssets((prev) => [
      ...prev,
      {
        id: newId,
        symbol: 'CUSTOM',
        name: 'Custom Asset',
        currentUnits: 0,
        currentPrice: 100,
        targetPct: 0,
        category: 'CRYPTO',
      },
    ]);
  };

  const handleRemoveAsset = (id: string) => {
    if (rebalanceAssets.length <= 1) return;
    setRebalanceAssets((prev) => prev.filter((a) => a.id !== id));
  };

  const handleApplyPreset = (presetIndex: number) => {
    const preset = PRESETS[presetIndex];
    if (!preset) return;
    const newAssets: PortfolioRebalanceAsset[] = preset.assets.map((p, idx) => {
      const existing = rebalanceAssets.find((a) => a.symbol.toUpperCase() === p.symbol.toUpperCase());
      const price = existing ? existing.currentPrice : getSymbolPrice(p.symbol);
      const units = existing ? existing.currentUnits : (idx === 0 ? 0.1 : idx === 1 ? 1 : 10);
      return {
        id: `ast_${idx}_${Date.now()}`,
        symbol: p.symbol,
        name: p.name,
        currentUnits: units,
        currentPrice: price,
        targetPct: p.targetPct,
        category: p.category,
      };
    });
    setRebalanceAssets(newAssets);
    setRebalanceSavedSuccess(false);
  };

  const handleNormalizeTargets = () => {
    const total = rebalanceAssets.reduce((sum, item) => sum + (Number(item.targetPct) || 0), 0);
    if (total <= 0) {
      // Split equally
      const equalShare = parseFloat((100 / rebalanceAssets.length).toFixed(1));
      setRebalanceAssets((prev) => prev.map((a) => ({ ...a, targetPct: equalShare })));
      return;
    }
    setRebalanceAssets((prev) =>
      prev.map((item) => ({
        ...item,
        targetPct: parseFloat(((item.targetPct / total) * 100).toFixed(1)),
      }))
    );
  };

  const handleCopyOrders = () => {
    if (rebalancePlan.ordersToExecute.length === 0) return;
    const text = rebalancePlan.ordersToExecute
      .map(
        (o) =>
          `[${o.action}] ${o.symbol} -> ${fmtMoney(o.amountValue)} (${o.amountUnits.toLocaleString(undefined, { maximumFractionDigits: 4 })} units) [Target ${o.targetPct}%]`
      )
      .join('\n');
    navigator.clipboard.writeText(
      `MotorBoy AI-TH — Portfolio Rebalance Orders:\n${text}\nTotal Portfolio: ${fmtMoney(rebalancePlan.effectiveTotalValue)}`
    );
    setCopiedOrders(true);
    setTimeout(() => setCopiedOrders(false), 2500);
  };

  const handleSaveRebalancePlan = async () => {
    if (!onSaveToHistory) return;
    setRebalanceSaveError(null);
    try {
      const summaryText = rebalancePlan.ordersToExecute
        .map(
          (o) =>
            `${o.action} ${o.symbol} ${fmtMoney(o.amountValue)} (${o.amountUnits.toFixed(4)} u)`
        )
        .join(' | ');

      await onSaveToHistory({
        type: 'PORTFOLIO_REBALANCE',
        symbol: 'PORTFOLIO',
        action: rebalancePlan.ordersToExecute[0]?.action || 'HOLD',
        price: rebalancePlan.effectiveTotalValue,
        aiSummary:
          `[MotorBoy Rebalance Plan] มูลค่าพอร์ต ${fmtMoney(rebalancePlan.effectiveTotalValue)} | เป้าหมายสมดุล ${rebalancePlan.totalTargetPct}% | ` +
          `คำสั่งปรับพอร์ต (${rebalancePlan.ordersToExecute.length} รายการ): ${summaryText || 'พอร์ตอยู่ในสมดุลแล้ว (Balanced)'}`,
      });
      setRebalanceSavedSuccess(true);
    } catch {
      setRebalanceSaveError(t('risk_calc.save.error'));
    }
  };

  // Position Sizing Handlers
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

  const handleSavePosition = async () => {
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

  const handleAiAnalyze = async () => {
    if (!calc || isAnalyzing) return;
    setIsAnalyzing(true);
    setAiError(null);
    try {
      const activeSig = signals.find((x) => x.id === signalId);
      const coinLike: CryptoCoin = {
        id: (activeSig?.symbol ?? 'manual').toLowerCase(),
        symbol: activeSig?.symbol ?? 'MANUAL',
        name: activeSig?.base ?? 'Manual Plan',
        binanceSymbol: activeSig?.symbol ?? 'MANUAL',
        price: calc.entry,
        change: activeSig?.change ?? 0,
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
        probability: activeSig?.probability ?? 70,
        timeframe: 'สั้น 1-7วัน',
        price: calc.entry,
        change: coinLike.change,
        statusText: `แผน ${direction} Entry ${calc.entry} SL ${calc.sl} TP ${calc.tp.toFixed(2)}`,
        reason: `Risk ${calc.risk}% R:R 1:${rr} SL ห่าง ${calc.slDistPct.toFixed(2)}%`,
        sources: ['Risk Calculator'],
        tags: ['RiskPlan'],
        sl: calc.sl,
        tp: calc.tp,
        similarity: activeSig?.similarity ?? 75,
        etfFlow: activeSig?.etfFlow ?? '—',
        category: activeSig?.category ?? 'CRYPTO',
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

  const inputCls =
    'w-full bg-[#0F1117] border border-white/[0.07] rounded-xl p-2.5 text-white text-sm focus:border-[#7C6CFF] outline-none';
  const labelCls = 'block text-[11px] text-[#A7A4B8] mb-1';

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="เครื่องคำนวณความเสี่ยงและขนาดโพซิชัน"
      className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto"
    >
      <div className="bg-[#141725] border-t sm:border border-white/[0.07] rounded-t-3xl sm:rounded-3xl w-full sm:max-w-2xl p-5 sm:p-6 shadow-2xl max-h-[92vh] overflow-y-auto sm:my-8">
        
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center space-x-2 text-white">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#7C6CFF]/20 to-[#8E80FF]/20 border border-[#7C6CFF]/40 flex items-center justify-center">
              {activeTab === 'POSITION' ? (
                <Calculator className="w-5 h-5 text-[#7C6CFF]" />
              ) : (
                <Scale className="w-5 h-5 text-[#4CC9F0]" />
              )}
            </div>
            <div>
              <h2 className="font-black text-lg tracking-tight flex items-center gap-2">
                MotorBoy Risk Guard
                <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-[#7C6CFF]/15 border border-[#7C6CFF]/40 text-[#7C6CFF]">
                  {activeTab === 'POSITION' ? 'Position Sizing' : 'Portfolio Rebalance'}
                </span>
              </h2>
              <p className="text-[11px] text-[#A7A4B8]">ระบบคำนวณและบริหารความเสี่ยงอัจฉริยะ ควบคุมเงินทุนอย่างมีวินัย</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[#A7A4B8] hover:text-white p-1.5 rounded-xl hover:bg-white/5 cursor-pointer transition-colors"
            aria-label="ปิด"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Feature Tabs */}
        <div className="grid grid-cols-2 gap-2 p-1 bg-[#0F1117] border border-white/[0.07] rounded-2xl mb-4">
          <button
            onClick={() => setActiveTab('POSITION')}
            className={`py-2 px-3 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all ${
              activeTab === 'POSITION'
                ? 'bg-[#7C6CFF] text-[#0F1117] shadow-[0_6px_18px_rgba(124,108,255,0.28)]'
                : 'text-[#A7A4B8] hover:text-white'
            }`}
          >
            <Calculator className="w-4 h-4" />
            <span>คำนวณไม้ & SL/TP</span>
          </button>
          <button
            onClick={() => setActiveTab('REBALANCE')}
            className={`py-2 px-3 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all ${
              activeTab === 'REBALANCE'
                ? 'bg-gradient-to-r from-[#4CC9F0] to-[#4CC9F0] text-white shadow-[0_0_12px_rgba(56,189,248,0.4)]'
                : 'text-[#A7A4B8] hover:text-white'
            }`}
          >
            <Scale className="w-4 h-4" />
            <span>ปรับสมดุลพอร์ต (Rebalance)</span>
          </button>
        </div>

        {/* TAB 1: POSITION SIZING */}
        {activeTab === 'POSITION' && (
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
                          ? 'bg-[#7EE0B5]/20 border-[#7EE0B5]/60 text-[#7EE0B5]'
                          : 'bg-[#7C6CFF]/20 border-[#7C6CFF]/60 text-[#7C6CFF]'
                        : 'bg-[#0F1117] border-white/[0.07] text-[#A7A4B8] hover:text-white'
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
                        rr === v ? 'bg-[#7C6CFF]/25 border-[#7C6CFF]/60 text-[#F7F5F0]' : 'bg-[#0F1117] border-white/[0.07] text-[#A7A4B8] hover:text-white'
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

            {/* Protection checklist */}
            {checklist.length > 0 && (
              <div className="rounded-2xl bg-[#0F1117] border border-white/[0.07] p-3 space-y-2 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-16 h-16 bg-[#7C6CFF]/5 blur-2xl rounded-full" />
                <p className="text-xs font-bold text-white flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-[#7C6CFF]" />
                  {t('risk_calc.checklist.header')}
                </p>
                {checklist.map((c) => (
                  <div key={c.title} className="flex items-start gap-2 text-[11px]">
                    <span className={`mt-0.5 w-4 h-4 rounded-full flex items-center justify-center shrink-0 text-[10px] font-black ${
                      c.ok ? 'bg-[#7EE0B5]/20 text-[#7EE0B5]' : 'bg-[#FFB86B]/20 text-[#FFB86B]'
                    }`}>
                      {c.ok ? '✓' : '!'}
                    </span>
                    <span>
                      <strong className={c.ok ? 'text-[#ECEAF4]' : 'text-[#FFB86B]'}>{c.title}</strong>
                      <span className="text-[#A7A4B8]"> — {c.tip}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Results */}
            <div className="rounded-2xl bg-gradient-to-br from-[#7C6CFF]/10 to-[#8E80FF]/10 border border-[#7C6CFF]/20 p-4 space-y-2">
              {calc ? (
                <>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#A89FFF]">{t('risk_calc.results.notional')}</span>
                    <strong className="text-white text-base">{fmtMoney(calc.notional)}</strong>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#A89FFF]">{t('risk_calc.results.units')}</span>
                    <strong className="text-white font-mono">{calc.units.toLocaleString(undefined, { maximumFractionDigits: 4 })}</strong>
                  </div>
                  <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                    <div className="rounded-xl bg-[#0F1117] border border-white/[0.07] py-2">
                      <p className="text-[10px] text-[#A7A4B8]">{t('risk_calc.results.risk')}</p>
                      <p className="text-[#FFB86B] text-xs font-bold">{fmtMoney(calc.riskAmount)}</p>
                    </div>
                    <div className="rounded-xl bg-[#0F1117] border border-white/[0.07] py-2">
                      <p className="text-[10px] text-[#A7A4B8]">{t('risk_calc.results.reward')}</p>
                      <p className="text-[#7EE0B5] text-xs font-bold">{fmtMoney(calc.reward)}</p>
                    </div>
                    <div className="rounded-xl bg-[#0F1117] border border-white/[0.07] py-2">
                      <p className="text-[10px] text-[#A7A4B8]">{t('risk_calc.results.margin')}</p>
                      <p className="text-white text-xs font-bold">{fmtMoney(calc.margin)}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs pt-1 border-t border-[#7C6CFF]/20">
                    <span className="text-[#A7A4B8]">SL {calc.slDistPct.toFixed(2)}% • TP {fmtPrice(calc.tp)}</span>
                    <span className="text-[#8B88A0]">SL {fmtPrice(calc.sl)}</span>
                  </div>
                  <p className="text-[11px] text-[#ECEAF4] leading-relaxed bg-[#0F1117]/60 rounded-xl px-3 py-2">
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
                <p className="text-[#FFB86B] text-[11px] text-center">
                  {t('risk_calc.results.invalid_input')}
                </p>
              )}
            </div>

            {/* AI Review */}
            <div className="rounded-2xl bg-gradient-to-br from-[#7C6CFF]/15 to-[#8E80FF]/10 border border-[#7C6CFF]/30 p-4 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-[#7C6CFF]" />
                  {t('risk_calc.ai.header')}
                </p>
                {aiResult && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md border ${
                    aiResult.source === 'GEMINI_AI'
                      ? 'bg-[#7EE0B5]/15 border-[#7EE0B5]/40 text-[#7EE0B5]'
                      : 'bg-[#FFB86B]/15 border-[#FFB86B]/40 text-[#FFB86B]'
                  }`}>
                    {aiResult.source === 'GEMINI_AI' ? 'Gemini AI' : 'Technical model'}
                  </span>
                )}
              </div>
              {!aiResult && !aiError && (
                <p className="text-[11px] text-[#A7A4B8] leading-relaxed">
                  {t('risk_calc.ai.desc')}
                </p>
              )}
              {aiError && <p className="text-[#FFB86B] text-xs">{t('risk_calc.ai.error')}</p>}
              {aiResult && (
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center gap-2">
                    <span className={`font-bold px-2 py-0.5 rounded-lg ${
                      aiResult.action === 'LONG' ? 'bg-[#7EE0B5]/20 text-[#7EE0B5]' : aiResult.action === 'SHORT' ? 'bg-[#FFB86B]/20 text-[#FFB86B]' : 'bg-[#222640] text-[#A7A4B8]'
                    }`}>
                      {aiResult.action}
                    </span>
                    <span className="text-[#A7A4B8]">มั่นใจ {aiResult.confidence}%</span>
                  </div>
                  <p className="text-[#ECEAF4] leading-relaxed">{aiResult.summary}</p>
                  {aiResult.strategyAdvice && (
                    <p className="text-[#A89FFF] leading-relaxed italic">น้องมอเตอร์บอยแนะนำ: {aiResult.strategyAdvice}</p>
                  )}
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] text-[#8B88A0]">
                      แนวรับ {fmtPrice(aiResult.supportLevel)} • แนวต้าน {fmtPrice(aiResult.resistanceLevel)}
                    </p>
                    <span className="text-[10px] text-[#7C6CFF] font-bold">นี่คือการวิเคราะห์ ไม่ใช่คำแนะนำการลงทุน</span>
                  </div>
                </div>
              )}
              <button
                onClick={handleAiAnalyze}
                disabled={!calc || isAnalyzing}
                className="w-full py-2.5 rounded-xl bg-[linear-gradient(135deg,#8E80FF,#4CC9F0)] hover:brightness-105 disabled:opacity-40 text-[#0F1117] text-sm font-black shadow-[0_6px_18px_rgba(124,108,255,0.28)] inline-flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}
                <span>{isAnalyzing ? t('risk_calc.ai.analyze_loading') : aiResult ? t('risk_calc.ai.reanalyze_btn') : t('risk_calc.ai.analyze_btn')}</span>
              </button>
            </div>

            {/* Save Position Plan */}
            {saveError && <p className="text-[#F4A6A6] text-xs text-center">{t('risk_calc.save.error')}</p>}
            {savedSuccess ? (
              <p className="text-[#7EE0B5] text-xs text-center font-bold flex items-center justify-center gap-1.5 animate-in zoom-in duration-300">
                <CheckCircle2 className="w-4 h-4" /> {t('risk_calc.save.success')}
              </p>
            ) : (
              <button
                onClick={handleSavePosition}
                disabled={!calc || !onSaveToHistory}
                title={!onSaveToHistory ? 'ต้องเข้าสู่ระบบก่อนบันทึก' : t('risk_calc.save.btn')}
                className="w-full py-2.5 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-40 border border-white/10 text-white text-sm font-bold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <BookmarkPlus className="w-4 h-4" />
                {t('risk_calc.save.btn')}
              </button>
            )}
          </div>
        )}

        {/* TAB 2: PORTFOLIO REBALANCE */}
        {activeTab === 'REBALANCE' && (
          <div className="space-y-4">
            {/* Quick Model Portfolio Presets */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-bold text-[#ECEAF4] flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-[#4CC9F0]" />
                  พอร์ตจำลองสำเร็จรูป (Model Presets)
                </span>
                <span className="text-[10px] text-[#8B88A0]">คลิกเพื่อโหลดสูตร</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {PRESETS.map((p, idx) => (
                  <button
                    key={p.name}
                    onClick={() => handleApplyPreset(idx)}
                    className="p-2.5 rounded-xl bg-[#0F1117] border border-white/[0.07] hover:border-[#4CC9F0]/60 text-left transition-all group cursor-pointer"
                  >
                    <div className="text-xs font-bold text-white group-hover:text-[#4CC9F0] truncate">{p.name}</div>
                    <div className="text-[10px] text-[#A7A4B8] line-clamp-1 mt-0.5">{p.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Cash Flow Adjustment & Rebalance Threshold */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-2xl bg-[#0F1117] border border-white/[0.07]">
              <div>
                <label className={labelCls}>
                  เงินสดฝาก/ถอนเพิ่ม (Cash Flow Adjustment - {moneyCur})
                </label>
                <input
                  type="number"
                  value={cashAdjustmentInput}
                  onChange={(e) => setCashAdjustmentInput(e.target.value)}
                  placeholder="เช่น +5000 หรือ -2000"
                  className={inputCls}
                />
                <span className="text-[10px] text-[#8B88A0] block mt-1">
                  กรอกบวก (+) เมื่อฝากเงินใหม่ หรือลบ (-) เมื่อต้องการถอนทุน
                </span>
              </div>
              <div>
                <label className={labelCls}>
                  เกณฑ์ความคลาดเคลื่อนที่เริ่มปรับ (Drift Threshold %): <strong className="text-white">{driftTolerance}%</strong>
                </label>
                <div className="flex items-center gap-2 mt-2">
                  {[0.5, 1, 2, 5].map((val) => (
                    <button
                      key={val}
                      onClick={() => setDriftTolerance(val)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                        driftTolerance === val
                          ? 'bg-[#4CC9F0]/20 border-[#4CC9F0] text-[#4CC9F0]'
                          : 'bg-[#141725] border-white/[0.07] text-[#A7A4B8] hover:text-white'
                      }`}
                    >
                      ±{val}%
                    </button>
                  ))}
                </div>
                <span className="text-[10px] text-[#8B88A0] block mt-1">
                  สินทรัพย์ที่เบี่ยงเบนเกินเกณฑ์จะถูกสั่งซื้อ/ขาย
                </span>
              </div>
            </div>

            {/* Asset Allocation Table & Inputs */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Scale className="w-4 h-4 text-[#4CC9F0]" />
                  สินทรัพย์ในพอร์ตและสัดส่วนเป้าหมาย (Assets & Target Allocation)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleNormalizeTargets}
                    title="ปรับให้รวมกันเป็น 100%"
                    className="text-[10px] font-bold px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-[#4CC9F0] border border-[#4CC9F0]/30 flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <RotateCcw className="w-3 h-3" /> Auto 100%
                  </button>
                  <button
                    onClick={handleAddAsset}
                    className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-[#4CC9F0] hover:bg-[#4CC9F0] text-[#0F1117] flex items-center gap-1 cursor-pointer transition-colors shadow-sm"
                  >
                    <Plus className="w-3 h-3" /> เพิ่มเหรียญ
                  </button>
                </div>
              </div>

              {/* Asset Cards / Rows */}
              <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                {rebalancePlan.items.map((item) => (
                  <div
                    key={item.asset.id}
                    className="p-3 rounded-2xl bg-[#0F1117] border border-white/[0.07] hover:border-[#4CC9F0]/40 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={item.asset.symbol}
                          onChange={(e) => handleUpdateAsset(item.asset.id, 'symbol', e.target.value.toUpperCase())}
                          className="w-20 bg-[#141725] border border-white/[0.07] rounded-lg px-2 py-1 text-xs font-black text-white uppercase outline-none focus:border-[#4CC9F0]"
                          placeholder="BTC"
                        />
                        <span className="text-[11px] text-[#A7A4B8] truncate max-w-[100px] hidden sm:inline">
                          {item.asset.name}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Status Badge */}
                        <span
                          className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
                            item.action === 'BUY'
                              ? 'bg-[#7EE0B5]/15 border-[#7EE0B5]/50 text-[#7EE0B5]'
                              : item.action === 'SELL'
                              ? 'bg-[#7C6CFF]/15 border-[#7C6CFF]/50 text-[#7C6CFF]'
                              : 'bg-white/5 border-white/10 text-[#A7A4B8]'
                          }`}
                        >
                          {item.action === 'BUY'
                            ? `BUY +${fmtMoney(Math.abs(item.deltaValue))}`
                            : item.action === 'SELL'
                            ? `SELL -${fmtMoney(Math.abs(item.deltaValue))}`
                            : 'HOLD (สมดุล)'}
                        </span>

                        <button
                          onClick={() => handleRemoveAsset(item.asset.id)}
                          disabled={rebalanceAssets.length <= 1}
                          className="text-[#8B88A0] hover:text-[#F4A6A6] disabled:opacity-20 p-1 cursor-pointer transition-colors"
                          title="ลบสินทรัพย์นี้"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <label className="text-[10px] text-[#A7A4B8] block">จำนวนที่ถือ (Units)</label>
                        <input
                          type="number"
                          step="any"
                          value={item.asset.currentUnits}
                          onChange={(e) => handleUpdateAsset(item.asset.id, 'currentUnits', parseFloat(e.target.value) || 0)}
                          className="w-full bg-[#141725] border border-white/[0.07] rounded-lg px-2 py-1.5 text-white font-mono text-xs outline-none focus:border-[#4CC9F0]"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-[#A7A4B8] block">ราคาตลาด ($)</label>
                        <input
                          type="number"
                          step="any"
                          value={item.asset.currentPrice}
                          onChange={(e) => handleUpdateAsset(item.asset.id, 'currentPrice', parseFloat(e.target.value) || 0)}
                          className="w-full bg-[#141725] border border-white/[0.07] rounded-lg px-2 py-1.5 text-white font-mono text-xs outline-none focus:border-[#4CC9F0]"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-[#A7A4B8] block">เป้าหมาย Target (%)</label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.5"
                          value={item.asset.targetPct}
                          onChange={(e) => handleUpdateAsset(item.asset.id, 'targetPct', parseFloat(e.target.value) || 0)}
                          className="w-full bg-[#141725] border border-white/[0.07] rounded-lg px-2 py-1.5 text-white font-bold text-xs outline-none focus:border-[#4CC9F0]"
                        />
                      </div>
                    </div>

                    {/* Weight & Drift Visual Indicator */}
                    <div className="mt-2 pt-2 border-t border-white/[0.07]/60 flex items-center justify-between text-[11px]">
                      <div className="text-[#A7A4B8]">
                        มูลค่าปัจจุบัน: <strong className="text-white">{fmtMoney(item.currentValue)}</strong> ({item.currentPct.toFixed(1)}%)
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[#A7A4B8]">Drift:</span>
                        <span
                          className={`font-bold ${
                            item.driftPct > 0 ? 'text-[#7C6CFF]' : item.driftPct < 0 ? 'text-[#7EE0B5]' : 'text-[#A7A4B8]'
                          }`}
                        >
                          {item.driftPct > 0 ? `+${item.driftPct.toFixed(1)}% (Over)` : `${item.driftPct.toFixed(1)}% (Under)`}
                        </span>
                        <span className="text-[#8B88A0]">
                          ➜ เป้า {fmtMoney(item.targetValue)} ({item.targetUnits.toFixed(4)} u)
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Total Target Allocation Bar & Warning */}
            <div className="p-3 rounded-2xl bg-[#0F1117] border border-white/[0.07]">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="text-[#A7A4B8]">ผลรวมสัดส่วนเป้าหมาย (Total Target Allocation):</span>
                <span
                  className={`font-black ${
                    Math.abs(rebalancePlan.totalTargetPct - 100) < 0.01
                      ? 'text-[#7EE0B5]'
                      : 'text-[#FFB86B]'
                  }`}
                >
                  {rebalancePlan.totalTargetPct.toFixed(1)}% / 100%
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-[#141725] overflow-hidden flex">
                <div
                  className={`h-full transition-all duration-300 ${
                    Math.abs(rebalancePlan.totalTargetPct - 100) < 0.01
                      ? 'bg-gradient-to-r from-[#7EE0B5] to-[#7EE0B5]'
                      : rebalancePlan.totalTargetPct > 100
                      ? 'bg-gradient-to-r from-[#FFB86B] to-[#F4A6A6]'
                      : 'bg-gradient-to-r from-[#FFB86B] to-[#FFB86B]'
                  }`}
                  style={{ width: `${Math.min(100, rebalancePlan.totalTargetPct)}%` }}
                />
              </div>
              {Math.abs(rebalancePlan.totalTargetPct - 100) >= 0.01 && (
                <div className="mt-2 flex items-center justify-between text-[11px] text-[#FFB86B]">
                  <span className="flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    สัดส่วนเป้าหมายยังไม่ครบ 100% (ผลลัพธ์อาจคำนวณเบี่ยงเบน)
                  </span>
                  <button
                    onClick={handleNormalizeTargets}
                    className="underline hover:text-white font-bold cursor-pointer"
                  >
                    กดปรับให้เป็น 100% พอดี
                  </button>
                </div>
              )}
            </div>

            {/* Rebalance Execution Summary / Orders */}
            <div className="rounded-2xl bg-gradient-to-br from-[#4CC9F0]/15 to-[#4CC9F0]/10 border border-[#4CC9F0]/30 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-black text-white flex items-center gap-1.5 uppercase tracking-wide">
                    <CheckCircle2 className="w-4 h-4 text-[#4CC9F0]" />
                    คำสั่งปรับพอร์ตเพื่อคืนสมดุล (Rebalance Action Plan)
                  </h3>
                  <p className="text-[11px] text-[#A7A4B8]">
                    มูลค่าพอร์ตสุทธิ: <strong className="text-white text-sm">{fmtMoney(rebalancePlan.effectiveTotalValue)}</strong>
                    {rebalancePlan.cashAdjustment !== 0 && (
                      <span className="text-[#4CC9F0] ml-1">
                        ({rebalancePlan.cashAdjustment > 0 ? '+' : ''}{fmtMoney(rebalancePlan.cashAdjustment)} cash flow)
                      </span>
                    )}
                  </p>
                </div>

                {rebalancePlan.ordersToExecute.length > 0 && (
                  <button
                    onClick={handleCopyOrders}
                    className="text-xs font-bold px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/20 flex items-center gap-1.5 cursor-pointer transition-all"
                  >
                    {copiedOrders ? <Check className="w-3.5 h-3.5 text-[#7EE0B5]" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedOrders ? 'คัดลอกแล้ว!' : 'คัดลอกคำสั่ง'}</span>
                  </button>
                )}
              </div>

              {rebalancePlan.ordersToExecute.length === 0 ? (
                <div className="p-3 rounded-xl bg-[#0F1117]/70 border border-[#7EE0B5]/30 text-center">
                  <p className="text-xs font-bold text-[#7EE0B5]">✓ พอร์ตอยู่ในสมดุลแล้ว (Well-Balanced)</p>
                  <p className="text-[10px] text-[#A7A4B8] mt-0.5">
                    ทุกสินทรัพย์มีความคลาดเคลื่อนต่ำกว่าเกณฑ์ ±{driftTolerance}% ไม่จำเป็นต้องส่งคำสั่งซื้อขาย
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {rebalancePlan.ordersToExecute.map((order) => (
                    <div
                      key={order.symbol}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-[#0F1117] border border-white/[0.07] text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-black px-2 py-0.5 rounded-md text-[11px] ${
                            order.action === 'BUY'
                              ? 'bg-[#7EE0B5]/20 text-[#7EE0B5] border border-[#7EE0B5]/40'
                              : 'bg-[#7C6CFF]/20 text-[#7C6CFF] border border-[#7C6CFF]/40'
                          }`}
                        >
                          {order.action}
                        </span>
                        <strong className="text-white text-sm">{order.symbol}</strong>
                        <span className="text-[#A7A4B8] text-[11px]">
                          เป้า {order.targetPct}%
                        </span>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-white">
                          {fmtMoney(order.amountValue)}
                        </div>
                        <div className="text-[10px] font-mono text-[#A7A4B8]">
                          {order.amountUnits.toLocaleString(undefined, { maximumFractionDigits: 4 })} หน่วย
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <p className="text-[10px] text-[#A7A4B8] leading-relaxed bg-[#0F1117]/50 rounded-xl p-2.5">
                💡 <strong>เคล็ดลับการ Rebalance:</strong> ดำเนินการขายสินทรัพย์ที่มีสัดส่วนเกินก่อน (SELL) เพื่อระดมสภาพคล่องเงินสด แล้วจึงนำเงินที่ได้ไปเข้าซื้อสินทรัพย์ที่ต่ำกว่าเป้า (BUY) เพื่อลด Slippage และไม่ต้องเติมเงินทุนใหม่
              </p>
            </div>

            {/* Save Rebalance Plan to History */}
            {rebalanceSaveError && (
              <p className="text-[#F4A6A6] text-xs text-center">{rebalanceSaveError}</p>
            )}
            {rebalanceSavedSuccess ? (
              <p className="text-[#7EE0B5] text-xs text-center font-bold flex items-center justify-center gap-1.5 animate-in zoom-in duration-300">
                <CheckCircle2 className="w-4 h-4" /> บันทึกแผนปรับสมดุลพอร์ตเข้าประวัติสำเร็จเรียบร้อย!
              </p>
            ) : (
              <button
                onClick={handleSaveRebalancePlan}
                disabled={!onSaveToHistory}
                title={!onSaveToHistory ? 'ต้องเข้าสู่ระบบก่อนบันทึก' : 'บันทึกแผน Rebalance เข้าประวัติ'}
                className="w-full py-2.5 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-40 border border-white/10 text-white text-sm font-bold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <BookmarkPlus className="w-4 h-4" />
                บันทึกแผน Rebalance เข้าประวัติ (Save to History)
              </button>
            )}
          </div>
        )}

        {/* Footer */}
        <p className="text-[9px] text-center text-[#A7A4B8] opacity-50 uppercase tracking-widest pt-3 border-t border-white/[0.07] mt-4">
          MotorBoy Studio AI-TH • Tactical Portfolio & Risk Guard Engine
        </p>
      </div>
    </div>
  );
};
