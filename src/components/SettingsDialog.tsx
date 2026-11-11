import React, { useState, useEffect } from 'react';
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
  Mail,
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

  useEffect(() => {
    setKeyInput(geminiApiKey || '');
  }, [geminiApiKey]);

  const handleSaveKey = async () => {
    setIsSavingKey(true);
    setKeyFeedback(null);
    try {
      await onSaveApiKey(keyInput.trim());
      setKeyFeedback({
        type: 'SUCCESS',
        message: 'บันทึกและซิงค์ API Key ไปยังบัญชี Google สำเร็จเรียบร้อย ☁️',
      });
      setTimeout(() => setKeyFeedback(null), 4000);
    } catch (err) {
      console.error('Save key error:', err);
      setKeyFeedback({
        type: 'ERROR',
        message: 'ไม่สามารถบันทึกได้ โปรดตรวจสอบการเชื่อมต่ออินเทอร์เน็ต',
      });
    } finally {
      setIsSavingKey(false);
    }
  };

  const handleTestKey = async () => {
    if (!keyInput.trim()) {
      setTestResult({
        success: false,
        text: 'กรุณากรอก Google Gemini API Key ก่อนทำการทดสอบ',
      });
      return;
    }

    setIsTestingKey(true);
    setTestResult(null);

    try {
      const res = await testGeminiApiKeyWithSearch(keyInput.trim(), userEmail);
      setTestResult(res);
    } catch (error: unknown) {
      const err = error as { message?: string };
      setTestResult({
        success: false,
        text: `เชื่อมต่อไม่สำเร็จ: ${err.message || 'Invalid API Key'}`,
      });
    } finally {
      setIsTestingKey(false);
    }
  };

  const handleSaveAlert = (e: React.FormEvent) => {
    e.preventDefault();
    const p = parseFloat(priceInput);
    if (!isNaN(p) && symbolInput.trim()) {
      onSetAlert(symbolInput.toUpperCase(), p);
      setAlertSavedText(`บันทึกการเตือน ${symbolInput.toUpperCase()} ที่ ${p} สำเร็จ!`);
      setPriceInput('');
      setTimeout(() => setAlertSavedText(''), 4000);
    }
  };

  const dialogRef = useModalA11y({ onClose: onDismiss });

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
                <Mail className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center space-x-1.5">
                  <span className="text-[10px] text-[#A7A4B8] uppercase font-bold tracking-wider">บัญชี Google</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-[#7EE0B5]" />
                </div>
                <p className="text-xs text-white font-semibold">
                  {userEmail || 'sirisakkhacha@gmail.com'}
                </p>
              </div>
            </div>
            <div className="text-[10px] bg-[#7EE0B5]/15 border border-[#7EE0B5]/30 text-[#7EE0B5] font-bold px-2 py-0.5 rounded-full flex items-center space-x-1">
              <CheckCircle2 className="w-3 h-3" />
              <span>SYNCED</span>
            </div>
          </div>

          <div className="pt-2.5 border-t border-[#1F2433] flex items-center justify-between text-xs">
            <div className="flex items-center space-x-2 text-[#A7A4B8]">
              <Globe className="w-3.5 h-3.5 text-[#4CC9F0]" />
              <span className="text-[11px] text-[#ECEAF4]">
                Google Search เชื่อมโยงบัญชี Email: <span className="text-[#4CC9F0] font-medium">เปิดใช้งานค้นหาข้อมูลตลาดสด</span>
              </span>
            </div>
            <span className="text-[10px] bg-[#4CC9F0]/15 border border-[#4CC9F0]/30 text-[#4CC9F0] px-2 py-0.5 rounded-md font-semibold">
              Live Grounding (MotorBoy Pro)
            </span>
          </div>
        </div>

        {/* Google Gemini API Key Section - Collapsible */}
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
                    ส่วนจัดการ Google Gemini API Key
                  </span>
                  <span className="text-[10px] text-[#A7A4B8] bg-[#222640] px-1.5 py-0.5 rounded">
                    Google AI Studio
                  </span>
                </div>
                <p className="text-[11px] text-[#A7A4B8]">
                  {geminiApiKey
                    ? 'เชื่อมต่อและซิงค์คีย์ไว้แล้ว (คลิกเพื่อดูหรือแก้ไข)'
                    : 'ซ่อนอยู่ (คลิกเพื่อเปิดใส่หรือแก้ไข API Key)'}
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
                  <span>Google Gemini API Key</span>
                </label>
                <div className="flex items-center space-x-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsHelpModalOpen(true)}
                    className="text-[11px] text-[#4CC9F0] hover:text-[#7EE0B5] flex items-center space-x-1 font-medium transition-colors cursor-pointer group"
                    title="ดูวิธีรับ API Key จาก Google AI Studio"
                  >
                    <HelpCircle className="w-3.5 h-3.5 text-[#4CC9F0] group-hover:scale-110 transition-transform" />
                    <span className="underline decoration-[#4CC9F0]/50 underline-offset-2">วิธีรับ API Key</span>
                  </button>
                  <span className="text-[10px] text-[#A7A4B8] bg-[#222640] px-2 py-0.5 rounded-md font-medium">
                    Google AI Studio
                  </span>
                </div>
              </div>

              <p className="text-[11px] text-[#A7A4B8] leading-relaxed">
                ใส่ Google Gemini API Key เพื่อเปิดใช้งานระบบวิเคราะห์ตลาดแบบเรียลไทม์ พร้อม Google Search Grounding สด (รองรับทั้งคีย์แบบดั้งเดิม AIzaSy... และคีย์รุ่นใหม่ AQ...)
              </p>

              <div className="space-y-1.5">
                <div className="relative">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={keyInput}
                    onChange={(e) => setKeyInput(e.target.value)}
                    placeholder="AIzaSy... หรือ AQ..."
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
              </div>

              {/* Quick link to Google AI Studio */}
              <div className="flex items-center justify-between px-1">
                <span className="text-[10px] text-[#A7A4B8]">ต้องการ API Key เพิ่มเติม?</span>
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-[#7C6CFF] hover:text-[#7C6CFF]/80 flex items-center space-x-1 transition-colors"
                >
                  <span>รับ API Key ฟรีได้ที่ Google AI Studio</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              {/* Action buttons for key */}
              <div className="flex items-center space-x-2 pt-1">
                <button
                  type="button"
                  onClick={handleSaveKey}
                  disabled={isSavingKey}
                  className="flex-1 bg-[linear-gradient(135deg,#8E80FF,#4CC9F0)] hover:brightness-105 text-[#0F1117] font-bold text-xs py-2 rounded-xl transition-all flex items-center justify-center space-x-1.5 cursor-pointer disabled:opacity-50 shadow-[0_6px_18px_rgba(124,108,255,0.28)]"
                >
                  {isSavingKey ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>กำลังซิงค์...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>บันทึกและซิงค์คีย์</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleTestKey}
                  disabled={isTestingKey}
                  className="px-3.5 bg-[#141417] hover:bg-[#222640] border border-white/[0.07] text-[#4CC9F0] font-semibold text-xs py-2 rounded-xl transition-colors flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                  title="ทดสอบการเชื่อมต่อ Gemini AI และระบบค้นหาตลาดสด"
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
                onChange={(e) => onSavePsychologySettings({ ...psychologySettings, riskToleranceLevel: e.target.value as any })}
              >
                <option value="CONSERVATIVE">CONSERVATIVE</option>
                <option value="MODERATE">MODERATE</option>
                <option value="AGGRESSIVE">AGGRESSIVE</option>
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
          </div>
        </div>

        {/* Price Alert */}
        <div className="space-y-3">
          <h3 className="text-white text-xs font-bold">
            🔔 ตั้งเป้าเตือนราคา (Price Alert - ซิงค์คลาวด์)
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
                <label className="text-[10px] text-[#A7A4B8] block mb-1">ราคาเป้าหมาย ($ USD)</label>
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
            <span>ข้อมูลทั้งหมดซิงค์ด้วยบัญชี Google ของคุณ</span>
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
          role="dialog"
          aria-modal="true"
          aria-label="วิธีขอ Google Gemini API Key"
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
                    วิธีรับ Google Gemini API Key ฟรี
                  </h3>
                  <p className="text-[11px] text-[#A7A4B8]">
                    ขั้นตอนการขอคีย์จาก Google AI Studio ภายใน 1 นาที
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
                alt="คู่มือขั้นตอนการขอ Google Gemini API Key จาก Google AI Studio"
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
                  <p className="text-white font-semibold">เข้าสู่เว็บไซต์ Google AI Studio</p>
                  <p className="text-[11px] text-[#A7A4B8] mt-0.5">
                    ลงชื่อเข้าใช้ด้วยบัญชี Google ของคุณที่หน้าจัดการ API Keys
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
                    เลือกว่าจะผูกกับโปรเจกต์ Google Cloud เดิมหรือสร้างโปรเจกต์ใหม่ได้ฟรี
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
                <span>เปิดหน้า Google AI Studio</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>

              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText('https://aistudio.google.com/app/apikey');
                  setCopiedLink(true);
                  setTimeout(() => setCopiedLink(false), 2000);
                }}
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
