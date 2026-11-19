import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Settings,
  Key,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Trash2,
  ShieldCheck,
  Search,
  Globe,
  ExternalLink,
  HardDrive,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  BookOpen,
  Copy,
  Check,
} from 'lucide-react';
import guideImg from '../assets/images/gemini_api_guide_1794356820031.jpg';
import { TradingPsychologySettings } from '../types';
import { testGeminiApiKeyWithSearch } from '../services/geminiService';
import { checkGeminiKey, maskGeminiKey, normalizeGeminiKey } from '../services/geminiKey';
import { RISK_PROFILE_LABEL_TH, parseRiskToleranceLevel } from '../services/riskProfile';
import { useModalA11y } from '../hooks/useModalA11y';

interface SettingsDialogProps {
  useThb: boolean;
  onToggleCurrency: (useThb: boolean) => void;
  notificationsEnabled: boolean;
  onToggleNotifications: () => void;
  onSetAlert: (symbol: string, targetPrice: number) => void;
  geminiApiKey: string;
  onSaveApiKey: (key: string) => Promise<void>;
  userEmail?: string | null;
  priceAlerts?: Array<{ symbol: string; targetPrice: number }>;
  onRemoveAlert?: (symbol: string, targetPrice: number) => void;
  psychologySettings: TradingPsychologySettings;
  onSavePsychologySettings: (settings: TradingPsychologySettings) => void;
  onDismiss: () => void;
}

export const SettingsDialog: React.FC<SettingsDialogProps> = ({
  useThb,
  onToggleCurrency,
  notificationsEnabled,
  onToggleNotifications,
  onSetAlert,
  geminiApiKey,
  onSaveApiKey,
  userEmail,
  priceAlerts = [],
  onRemoveAlert,
  psychologySettings,
  onSavePsychologySettings,
  onDismiss,
}) => {
  // Local state
  const [keyInput, setKeyInput] = useState(geminiApiKey || '');
  const [showKey, setShowKey] = useState(false);
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [keyFeedback, setKeyFeedback] = useState<{ type: 'SUCCESS' | 'ERROR'; message: string } | null>(null);

  const [isApiKeySectionOpen, setIsApiKeySectionOpen] = useState(false);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const [isTestingKey, setIsTestingKey] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; text: string } | null>(null);

  const [symbolInput, setSymbolInput] = useState('BTC');
  const [priceInput, setPriceInput] = useState('');
  const [alertSavedText, setAlertSavedText] = useState('');
  const [alertError, setAlertError] = useState('');

  // โมเดล/คีย์ฝั่งเซิร์ฟเวอร์ — แสดงค่าจริงแทนการเดาจากฝั่ง client
  const [geminiConfig, setGeminiConfig] = useState<{
    model: string;
    fallbackModels: string[];
    serverKeyConfigured: boolean;
  } | null>(null);

  useEffect(() => {
    setKeyInput(normalizeGeminiKey(geminiApiKey));
  }, [geminiApiKey]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/gemini/config')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.model) setGeminiConfig(data);
      })
      .catch(() => {
        /* config probe is best-effort; UI falls back to “ไม่ทราบรุ่น” */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ตรวจรูปแบบคีย์แบบสด ๆ ระหว่างพิมพ์ (ไม่ยิงเน็ต)
  const keyCheck = useMemo(() => checkGeminiKey(keyInput), [keyInput]);
  const savedKeyMasked = useMemo(() => maskGeminiKey(geminiApiKey), [geminiApiKey]);
  const storedKeyIsValid = useMemo(() => checkGeminiKey(geminiApiKey).valid, [geminiApiKey]);

  const handleSaveKey = async () => {
    const normalized = normalizeGeminiKey(keyInput);

    // ไม่บันทึกคีย์ที่ผิดรูป — ปล่อยไปจะทำให้ทุก route AI ล้มเงียบ ๆ
    if (!keyCheck.valid) {
      setKeyFeedback({ type: 'ERROR', message: keyCheck.hint });
      return;
    }

    setIsSavingKey(true);
    setKeyFeedback(null);
    try {
      await onSaveApiKey(normalized);
      setKeyFeedback({
        type: 'SUCCESS',
        message: 'บันทึก API Key ไว้ในเครื่องนี้แล้ว (localStorage) — ไม่ได้ส่งขึ้นคลาวด์',
      });
      setTimeout(() => setKeyFeedback(null), 4000);
    } catch (err) {
      console.error('Save key error:', err);
      setKeyFeedback({
        type: 'ERROR',
        message: 'บันทึกไม่สำเร็จ — พื้นที่เก็บข้อมูลของเบราว์เซอร์อาจถูกปิดกั้น',
      });
    } finally {
      setIsSavingKey(false);
    }
  };

  const handleRemoveKey = async () => {
    setIsSavingKey(true);
    try {
      await onSaveApiKey('');
      setKeyInput('');
      setTestResult(null);
      setKeyFeedback({
        type: 'SUCCESS',
        message: 'ลบคีย์ออกจากเครื่องนี้แล้ว — ระบบ AI จะกลับไปใช้โหมดคำนวณพื้นฐาน',
      });
      setTimeout(() => setKeyFeedback(null), 4000);
    } catch (err) {
      console.error('Remove key error:', err);
      setKeyFeedback({ type: 'ERROR', message: 'ลบคีย์ไม่สำเร็จ — โปรดลองอีกครั้ง' });
    } finally {
      setIsSavingKey(false);
    }
  };

  const handleTestKey = async () => {
    if (!keyCheck.valid) {
      setTestResult({ success: false, text: keyCheck.hint });
      return;
    }

    setIsTestingKey(true);
    setTestResult(null);

    try {
      const res = await testGeminiApiKeyWithSearch(normalizeGeminiKey(keyInput), userEmail);
      setTestResult(res);
    } catch {
      // ห้ามโชว์ข้อความภายใน (เช่น "fetch failed") ให้ผู้ใช้เห็น
      setTestResult({
        success: false,
        text: 'ทดสอบไม่สำเร็จ — เชื่อมต่อเซิร์ฟเวอร์ของแอปไม่ได้ ลองใหม่อีกครั้ง',
      });
    } finally {
      setIsTestingKey(false);
    }
  };

  const handleSaveAlert = (e: React.FormEvent) => {
    e.preventDefault();
    const price = Number.parseFloat(priceInput);
    const symbol = symbolInput.trim().toUpperCase();

    if (!symbol) {
      setAlertError('กรุณาระบุชื่อสินทรัพย์ เช่น BTC หรือ XAU/USD');
      return;
    }
    if (!Number.isFinite(price) || price <= 0) {
      setAlertError('ราคาเป้าหมายต้องเป็นตัวเลขมากกว่า 0');
      return;
    }

    setAlertError('');
    onSetAlert(symbol, price);
    setAlertSavedText(`บันทึกการเตือน ${symbol} ที่ $${price.toLocaleString()} สำเร็จ!`);
    setPriceInput('');
    setTimeout(() => setAlertSavedText(''), 4000);
  };

  const dialogRef = useModalA11y({ onClose: onDismiss });
  const helpDialogRef = useModalA11y({
    onClose: () => setIsHelpModalOpen(false),
    enabled: isHelpModalOpen,
  });

  const copyGuideLink = async () => {
    try {
      await navigator.clipboard.writeText('https://aistudio.google.com/app/apikey');
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      setCopiedLink(false);
    }
  };

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="ตั้งค่าและคีย์ API"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-xs p-0 sm:p-4 overflow-y-auto"
      onClick={onDismiss}
      data-testid="settings_dialog"
    >
      <div
        className="w-full sm:max-w-lg bg-[#141725] border-t sm:border border-white/[0.07] rounded-t-[24px] sm:rounded-[24px] p-5 sm:p-6 space-y-5 shadow-2xl sm:my-8 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag Handle on mobile */}
        <div className="w-10 h-1 bg-[#222640] rounded-full mx-auto mb-2 sm:hidden" />
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.07] pb-3">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-[#7C6CFF]/10 border border-[#7C6CFF]/30 flex items-center justify-center">
              <Settings className="w-4 h-4 text-[#7C6CFF]" />
            </div>
            <h2 className="text-white font-extrabold text-base tracking-tight">
              MotorBoy AI-TH Settings
            </h2>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="ปิดหน้าต่างตั้งค่า"
            className="text-[#A7A4B8] hover:text-white p-1 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="rounded-2xl bg-[#0F1117] border border-white/[0.07] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-xl bg-[#4CC9F0]/10 border border-[#4CC9F0]/30 flex items-center justify-center text-[#4CC9F0]">
                <HardDrive className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center space-x-1.5">
                  <span className="text-[10px] text-[#A7A4B8] uppercase font-bold tracking-wider">โหมดจัดเก็บข้อมูล</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-[#7EE0B5]" />
                </div>
                <p className="text-xs text-white font-semibold">
                  โหมดในเครื่อง (localStorage)
                </p>
              </div>
            </div>
            <div
              className="text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center space-x-1 bg-[#A89FFF]/15 border border-[#A89FFF]/30 text-[#A89FFF]"
              data-testid="settings-account-mode"
            >
              <CheckCircle2 className="w-3 h-3" />
              <span>เก็บในเครื่อง</span>
            </div>
          </div>

          <div className="pt-2.5 border-t border-[#1F2433] flex items-center justify-between text-xs">
            <div className="flex items-center space-x-2 text-[#A7A4B8]">
              <Globe className="w-3.5 h-3.5 text-[#4CC9F0]" />
              <span className="text-[11px] text-[#ECEAF4]">
                Search Grounding:{' '}
                <span className="text-[#4CC9F0] font-medium">
                  {storedKeyIsValid ? 'พร้อมใช้เมื่อคีย์รองรับ' : 'ต้องมี API Key ที่ใช้งานได้ก่อน'}
                </span>
              </span>
            </div>
            <span className="text-[10px] bg-[#4CC9F0]/15 border border-[#4CC9F0]/30 text-[#4CC9F0] px-2 py-0.5 rounded-md font-semibold">
              {geminiConfig?.model ?? 'Gemini'}
            </span>
          </div>
        </div>

        {/* Gemini API Key Section - Collapsible */}
        <div className="rounded-2xl bg-[#0F1117]/60 border border-white/[0.07] overflow-hidden transition-all">
          <button
            type="button"
            onClick={() => setIsApiKeySectionOpen(!isApiKeySectionOpen)}
            className="w-full p-3.5 flex items-center justify-between text-left hover:bg-[#141417] transition-colors cursor-pointer"
          >
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-xl bg-[#A89FFF]/10 border border-[#A89FFF]/30 flex items-center justify-center text-[#A89FFF]">
                <Key className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-bold text-white">
                    ส่วนจัดการ Gemini API Key
                  </span>
                  <span className="text-[10px] text-[#A7A4B8] bg-[#222640] px-1.5 py-0.5 rounded">
                    AI Studio
                  </span>
                </div>
                <p className="text-[11px] text-[#A7A4B8]">
                  {geminiApiKey
                    ? `บันทึกคีย์ไว้ในเครื่อง: ${savedKeyMasked}`
                    : 'ยังไม่มีคีย์ (คลิกเพื่อเปิดใส่หรือแก้ไข API Key)'}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <span className="text-[10px] text-[#7C6CFF] font-medium hidden sm:inline">
                {isApiKeySectionOpen ? 'ซ่อน' : 'แสดง'}
              </span>
              {isApiKeySectionOpen ? (
                <ChevronUp className="w-4 h-4 text-[#A7A4B8]" />
              ) : (
                <ChevronDown className="w-4 h-4 text-[#A7A4B8]" />
              )}
            </div>
          </button>

          {isApiKeySectionOpen && (
            <div className="p-4 pt-2 border-t border-[#1F2433] space-y-3 bg-[#0F1117]">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-2">
                <label className="text-xs font-bold text-white flex items-center space-x-1.5 shrink-0">
                  <Key className="w-4 h-4 text-[#A89FFF]" />
                  <span>Gemini API Key</span>
                </label>
                <div className="flex items-center space-x-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsHelpModalOpen(true)}
                    className="text-[11px] text-[#4CC9F0] hover:text-[#7EE0B5] flex items-center space-x-1 font-medium transition-colors cursor-pointer group"
                    title="ดูวิธีรับ Gemini API Key"
                  >
                    <HelpCircle className="w-3.5 h-3.5 text-[#4CC9F0] group-hover:scale-110 transition-transform" />
                    <span className="underline decoration-[#4CC9F0]/50 underline-offset-2">วิธีรับ API Key</span>
                  </button>
                  <span className="text-[10px] text-[#A7A4B8] bg-[#222640] px-2 py-0.5 rounded-md font-medium">
                    AI Studio
                  </span>
                </div>
              </div>

              <p className="text-[11px] text-[#A7A4B8] leading-relaxed">
                คีย์นี้ใช้เรียกโมเดล Gemini ผ่านเซิร์ฟเวอร์ของแอป (ไม่ฝังในบันเดิล)
                และถูกเก็บไว้ใน <span className="text-[#ECEAF4]">localStorage ของเครื่องนี้เท่านั้น</span> —
                รองรับคีย์<span className="text-[#ECEAF4]">ทุกประเภท</span>
                (ไม่กำหนดรูปแบบหรือคำขึ้นต้น) หากคีย์ไม่ถูกต้อง ระบบจะรายงานผลให้ทราบตอนกด “ทดสอบ”
              </p>

              <div className="space-y-1.5">
                <div className="relative">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={keyInput}
                    onChange={(e) => setKeyInput(e.target.value)}
                    placeholder="วาง API Key ที่นี่ (รูปแบบใดก็ได้)"
                    aria-describedby="gemini-key-hint"
                    autoComplete="off"
                    spellCheck={false}
                    className="w-full bg-[#0F1117] border border-white/[0.07] focus:border-[#7C6CFF] rounded-xl pl-3.5 pr-20 py-2.5 text-xs text-white outline-none font-mono placeholder-[#8B88A0]"
                  />
                  <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center space-x-1">
                    <button
                      type="button"
                      onClick={() => setIsHelpModalOpen(true)}
                      className="text-[#4CC9F0] hover:text-white p-1 rounded transition-colors cursor-pointer"
                      title="วิธีขอ API Key ฟรี"
                      aria-label="คู่มือวิธีขอ API Key"
                    >
                      <HelpCircle className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowKey(!showKey)}
                      className="text-[#A7A4B8] hover:text-white p-1 rounded transition-colors cursor-pointer"
                      title={showKey ? 'ซ่อนรหัส' : 'แสดงรหัส'}
                    >
                      {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <p
                  id="gemini-key-hint"
                  data-testid="gemini-key-hint"
                  className={`text-[10px] leading-snug ${
                    keyInput.trim().length === 0
                      ? 'text-[#A7A4B8]'
                      : keyCheck.valid
                      ? 'text-[#7EE0B5]'
                      : 'text-[#FFB86B]'
                  }`}
                >
                  {keyCheck.hint}
                </p>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-[10px] text-[#A7A4B8]">
                  <span>
                    โมเดล:{' '}
                    <span className="font-mono text-[#ECEAF4]">
                      {geminiConfig?.model ?? 'กำลังตรวจสอบ…'}
                    </span>
                  </span>
                  {geminiConfig?.fallbackModels?.length ? (
                    <span>
                      สำรอง:{' '}
                      <span className="font-mono text-[#A7A4B8]">
                        {geminiConfig.fallbackModels.join(' → ')}
                      </span>
                    </span>
                  ) : null}
                  <span>
                    คีย์ฝั่งเซิร์ฟเวอร์:{' '}
                    <span
                      className={
                        geminiConfig?.serverKeyConfigured ? 'text-[#7EE0B5]' : 'text-[#A7A4B8]'
                      }
                    >
                      {geminiConfig
                        ? geminiConfig.serverKeyConfigured
                          ? 'มี (ใช้แทนได้เมื่อไม่ได้ใส่คีย์)'
                          : 'ไม่มี'
                        : '—'}
                    </span>
                  </span>
                </div>
              </div>

              {/* Quick link to AI Studio */}
              <div className="flex items-center justify-between px-1">
                <span className="text-[10px] text-[#A7A4B8]">ต้องการ API Key เพิ่มเติม?</span>
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-[#7C6CFF] hover:text-[#7C6CFF]/80 flex items-center space-x-1 transition-colors"
                >
                  <span>รับ API Key ได้ที่ AI Studio</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              {/* Action buttons for key */}
              <div className="flex items-center space-x-2 pt-1">
                <button
                  type="button"
                  onClick={handleSaveKey}
                  disabled={isSavingKey || !keyCheck.valid}
                  title={!keyCheck.valid ? keyCheck.hint : 'บันทึกคีย์ไว้ในเครื่องนี้'}
                  className="flex-1 bg-[linear-gradient(135deg,#8E80FF,#4CC9F0)] hover:brightness-105 text-[#0F1117] font-bold text-xs py-2 rounded-xl transition-all flex items-center justify-center space-x-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_6px_18px_rgba(124,108,255,0.28)]"
                >
                  {isSavingKey ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>กำลังบันทึก...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>บันทึกคีย์ในเครื่อง</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleTestKey}
                  disabled={isTestingKey || !keyCheck.valid}
                  className="px-3.5 bg-[#141417] hover:bg-[#222640] border border-white/[0.07] text-[#4CC9F0] font-semibold text-xs py-2 rounded-xl transition-colors flex items-center space-x-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  title="ทดสอบการเชื่อมต่อ Gemini ด้วยคีย์ในช่องนี้"
                >
                  {isTestingKey ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>กำลังทดสอบ...</span>
                    </>
                  ) : (
                    <>
                      <Search className="w-3.5 h-3.5" />
                      <span>ทดสอบ Gemini AI</span>
                    </>
                  )}
                </button>

                {geminiApiKey && (
                  <button
                    type="button"
                    onClick={handleRemoveKey}
                    disabled={isSavingKey}
                    className="px-3 bg-[#141417] hover:bg-[#FFB86B]/15 border border-white/[0.07] text-[#FFB86B] font-semibold text-xs py-2 rounded-xl transition-colors flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                    title="ลบคีย์ออกจากเครื่องนี้"
                    data-testid="remove-gemini-key"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>ลบคีย์</span>
                  </button>
                )}
              </div>

              {/* Feedback message */}
              {keyFeedback && (
                <div
                  className={`p-2.5 rounded-xl text-xs flex items-center space-x-2 ${
                    keyFeedback.type === 'SUCCESS'
                      ? 'bg-[#7EE0B5]/15 border border-[#7EE0B5]/30 text-[#7EE0B5]'
                      : 'bg-[#FFB86B]/15 border border-[#FFB86B]/30 text-[#FFB86B]'
                  }`}
                >
                  {keyFeedback.type === 'SUCCESS' ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0" />
                  )}
                  <span>{keyFeedback.message}</span>
                </div>
              )}

              {testResult && (
                <div
                  className={`p-2.5 rounded-xl text-xs flex items-center space-x-2 ${
                    testResult.success
                      ? 'bg-[#7EE0B5]/15 border border-[#7EE0B5]/30 text-[#7EE0B5]'
                      : 'bg-[#FFB86B]/15 border border-[#FFB86B]/30 text-[#FFB86B]'
                  }`}
                >
                  {testResult.success ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0" />
                  )}
                  <span>{testResult.text}</span>
                </div>
              )}
            </div>
          )}
        </div>

        <hr className="border-white/[0.07]" />

        {/* Currency Switch */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-white text-xs font-semibold">สกุลเงินแสดงผล</h3>
            <p className="text-[#A7A4B8] text-[11px]">
              {useThb ? 'บาทไทย (฿ THB)' : 'ดอลลาร์สหรัฐ ($ USD)'}
            </p>
          </div>

          <button
            type="button"
            onClick={() => onToggleCurrency(!useThb)}
            className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors duration-200 cursor-pointer ${
              useThb ? 'bg-[#7C6CFF]' : 'bg-[#0F1117] border border-white/[0.07]'
            }`}
          >
            <div
              className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                useThb ? 'translate-x-6' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        <hr className="border-white/[0.07]" />

        {/* Notifications */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-white text-xs font-semibold">การแจ้งเตือนสัญญาณ</h3>
            <p className="text-[#A7A4B8] text-[11px]">
              {notificationsEnabled ? 'เปิดใช้งานและส่งเตือน' : 'ปิดการแจ้งเตือนอยู่'}
            </p>
          </div>

          <button
            type="button"
            onClick={onToggleNotifications}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
              notificationsEnabled
                ? 'bg-[#7EE0B5]/20 text-[#7EE0B5] border border-[#7EE0B5]/40'
                : 'bg-[#7C6CFF] text-[#0F1117] hover:bg-[#7C6CFF]/90'
            }`}
          >
            {notificationsEnabled ? 'เปิดอยู่ ✓' : 'เปิดแจ้งเตือน'}
          </button>
        </div>

        <hr className="border-white/[0.07]" />

        {/* Trading Psychology & Risk Settings */}
        <div className="space-y-3">
          <h3 className="text-white text-xs font-bold">
            🧠 จิตวิทยาการเทรด & การควบคุมอารมณ์
          </h3>
          <div className="bg-[#0F1117] border border-white/[0.07] rounded-xl p-3 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-[#A7A4B8]">ระดับความเสี่ยงที่รับได้</span>
              <select
                className="bg-[#141725] text-white rounded-lg p-1"
                value={psychologySettings.riskToleranceLevel}
                onChange={(e) =>
                  onSavePsychologySettings({
                    ...psychologySettings,
                    riskToleranceLevel: parseRiskToleranceLevel(e.target.value),
                  })
                }
              >
                <option value="CONSERVATIVE">{RISK_PROFILE_LABEL_TH.CONSERVATIVE}</option>
                <option value="MODERATE">{RISK_PROFILE_LABEL_TH.MODERATE}</option>
                <option value="AGGRESSIVE">{RISK_PROFILE_LABEL_TH.AGGRESSIVE}</option>
              </select>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#A7A4B8]">เตือนให้เช็คอารมณ์</span>
              <input
                type="checkbox"
                checked={psychologySettings.enableEmotionalCheckIn}
                onChange={(e) => onSavePsychologySettings({ ...psychologySettings, enableEmotionalCheckIn: e.target.checked })}
              />
            </div>
            <p className="text-[10px] text-[#A7A4B8] leading-snug pt-1 border-t border-white/[0.07]">
              ระดับนี้เป็นค่าเริ่มต้นของช่อง Risk % ในเครื่องคำนวณพอร์ต (แนะนำ ไม่บังคับ) —
              ระบบไม่ส่งคำสั่งซื้อขายอัตโนมัติใด ๆ
            </p>
          </div>
        </div>

        {/* Price Alert */}
        <div className="space-y-3">
          <h3 className="text-white text-xs font-bold">
            🔔 ตั้งเป้าเตือนราคา (Price Alert - ในเครื่อง)
          </h3>

          <form onSubmit={handleSaveAlert} className="space-y-2.5">
            <div className="grid grid-cols-5 gap-2">
              <div className="col-span-2">
                <label className="text-[10px] text-[#A7A4B8] block mb-1">เหรียญ</label>
                <input
                  type="text"
                  value={symbolInput}
                  onChange={(e) => setSymbolInput(e.target.value.toUpperCase())}
                  className="w-full bg-[#0F1117] border border-white/[0.07] focus:border-[#7C6CFF] rounded-xl px-3 py-2 text-xs text-white outline-none"
                  placeholder="BTC"
                />
              </div>
              <div className="col-span-3">
                <label className="text-[10px] text-[#A7A4B8] block mb-1">
                  ราคาเป้าหมาย (USD — แปลงเป็น ฿ อัตโนมัติเมื่อสลับสกุลเงิน)
                </label>
                <input
                  type="number"
                  step="any"
                  value={priceInput}
                  onChange={(e) => setPriceInput(e.target.value)}
                  className="w-full bg-[#0F1117] border border-white/[0.07] focus:border-[#7C6CFF] rounded-xl px-3 py-2 text-xs text-white outline-none"
                  placeholder="95000"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full bg-[#7C6CFF] hover:bg-[#7C6CFF]/90 text-[#0F1117] font-bold text-xs py-2 rounded-xl transition-colors cursor-pointer"
            >
              บันทึกการแจ้งเตือนราคา
            </button>
          </form>

          {alertError && (
            <p className="text-[#FFB86B] text-xs text-center" role="alert" data-testid="alert-error">
              {alertError}
            </p>
          )}

          {alertSavedText && (
            <p className="text-[#7EE0B5] text-xs text-center animate-fade-in">
              {alertSavedText}
            </p>
          )}

          {/* Existing alerts */}
          {priceAlerts.length > 0 && (
            <div className="space-y-1.5 pt-2">
              <p className="text-[11px] text-[#A7A4B8] font-semibold">
                รายการแจ้งเตือนที่ตั้งไว้:
              </p>
              <div className="max-h-32 overflow-y-auto space-y-1.5 pr-1">
                {priceAlerts.map((a, idx) => (
                  <div
                    key={`${a.symbol}-${a.targetPrice}-${idx}`}
                    className="flex items-center justify-between bg-[#0F1117] border border-white/[0.07] px-3 py-1.5 rounded-xl text-xs"
                  >
                    <span className="font-bold text-white">{a.symbol}</span>
                    <span className="text-[#A89FFF]">
                      เป้าหมาย: ${a.targetPrice.toLocaleString()}
                    </span>
                    {onRemoveAlert && (
                      <button
                        type="button"
                        onClick={() => onRemoveAlert(a.symbol, a.targetPrice)}
                        className="text-[#A7A4B8] hover:text-[#FFB86B] p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pt-2 border-t border-white/[0.07] flex items-center justify-between">
          <div className="flex items-center space-x-1 text-[11px] text-[#A7A4B8]">
            <ShieldCheck className="w-3.5 h-3.5 text-[#7EE0B5]" />
            <span data-testid="settings-storage-note">
              ตั้งค่าและคีย์ถูกเก็บในเครื่องนี้ (localStorage) — ไม่ส่งขึ้นคลาวด์
            </span>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="text-xs bg-[#222640] hover:bg-[#32384D] text-white px-4 py-2 rounded-xl font-semibold transition-colors cursor-pointer"
          >
            ปิดหน้าต่าง
          </button>
        </div>
      </div>

      {/* Guide Modal: How to obtain a new API Key from Google AI Studio */}
      {isHelpModalOpen && (
        <div
          ref={helpDialogRef}
          role="dialog"
          aria-modal="true"
          aria-label="วิธีขอ Gemini API Key"
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 overflow-y-auto"
          onClick={() => setIsHelpModalOpen(false)}
        >
          <div
            className="w-full max-w-lg bg-[#141725] border border-white/10 rounded-3xl p-5 sm:p-6 space-y-4 shadow-2xl relative my-auto animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-white/[0.07] pb-3">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#4CC9F0]/15 border border-[#4CC9F0]/30 flex items-center justify-center text-[#4CC9F0]">
                  <BookOpen className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-white font-extrabold text-sm sm:text-base tracking-tight">
                    วิธีรับ Gemini API Key
                  </h3>
                  <p className="text-[11px] text-[#A7A4B8]">
                    ขั้นตอนการขอคีย์จาก AI Studio ภายใน 1 นาที
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsHelpModalOpen(false)}
                className="text-[#A7A4B8] hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
                aria-label="ปิดคู่มือ"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Visual Guide Infographic / Screenshot Image */}
            <div className="rounded-2xl overflow-hidden border border-white/10 bg-[#0F1117] shadow-lg group">
              <img
                src={guideImg}
                alt="คู่มือขั้นตอนการขอ Gemini API Key"
                className="w-full h-auto object-cover transform group-hover:scale-[1.01] transition-transform duration-300"
              />
            </div>

            {/* Step-by-Step Instructions */}
            <div className="space-y-2.5 bg-[#0F1117] border border-white/[0.07] rounded-2xl p-4">
              <div className="flex items-start space-x-3 text-xs">
                <span className="w-5 h-5 rounded-full bg-[#4CC9F0]/20 text-[#4CC9F0] border border-[#4CC9F0]/40 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                  1
                </span>
                <div>
                  <p className="text-white font-semibold">เข้าสู่เว็บไซต์ AI Studio</p>
                  <p className="text-[11px] text-[#A7A4B8] mt-0.5">
                    เปิดหน้าจัดการ API Keys เพื่อสร้างคีย์สำหรับ Gemini
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-3 text-xs">
                <span className="w-5 h-5 rounded-full bg-[#8E80FF]/20 text-[#8E80FF] border border-[#8E80FF]/40 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                  2
                </span>
                <div>
                  <p className="text-white font-semibold">กดปุ่ม &quot;Get API key&quot; หรือ &quot;Create API Key&quot;</p>
                  <p className="text-[11px] text-[#A7A4B8] mt-0.5">
                    สร้างคีย์ใหม่เพื่อใช้กับตัวช่วยวิเคราะห์ของแอป
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-3 text-xs">
                <span className="w-5 h-5 rounded-full bg-[#7EE0B5]/20 text-[#7EE0B5] border border-[#7EE0B5]/40 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                  3
                </span>
                <div>
                  <p className="text-white font-semibold">คัดลอกรหัส (Copy API Key)</p>
                  <p className="text-[11px] text-[#A7A4B8] mt-0.5">
                    คีย์อาจขึ้นต้นด้วย <span className="font-mono text-[#7EE0B5]">AIzaSy...</span> หรือ <span className="font-mono text-[#4CC9F0]">AQ...</span> จากนั้นนำมาวางในช่องและกดบันทึก
                  </p>
                </div>
              </div>
            </div>

            {/* Direct Link & Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center gap-2 pt-1">
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:flex-1 bg-[linear-gradient(135deg,#8E80FF,#4CC9F0)] hover:brightness-105 text-[#0F1117] font-bold text-xs py-2.5 rounded-xl transition-all flex items-center justify-center space-x-1.5 shadow-[0_6px_18px_rgba(124,108,255,0.28)] cursor-pointer"
              >
                <span>เปิดหน้า AI Studio</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>

              <button
                type="button"
                onClick={copyGuideLink}
                className="w-full sm:w-auto px-4 bg-[#141417] hover:bg-[#222640] border border-white/[0.07] text-[#ECEAF4] font-semibold text-xs py-2.5 rounded-xl transition-colors flex items-center justify-center space-x-1.5 cursor-pointer"
              >
                {copiedLink ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-[#7EE0B5]" />
                    <span className="text-[#7EE0B5]">คัดลอกลิงก์แล้ว</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-[#A7A4B8]" />
                    <span>คัดลอกลิงก์</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
