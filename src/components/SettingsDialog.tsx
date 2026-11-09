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
} from 'lucide-react';
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
        className="w-full sm:max-w-lg bg-[#1A1D29] border-t sm:border border-[#2A2E45] rounded-t-[24px] sm:rounded-[24px] p-5 sm:p-6 space-y-5 shadow-2xl sm:my-8 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag Handle on mobile */}
        <div className="w-10 h-1 bg-[#2A2E45] rounded-full mx-auto mb-2 sm:hidden" />
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#2A2E45] pb-3">
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
            className="text-[#909AAB] hover:text-white p-1 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="rounded-2xl bg-[#0F1117] border border-[#2A2E45] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-xl bg-[#00E5FF]/10 border border-[#00E5FF]/30 flex items-center justify-center text-[#00E5FF]">
                <Mail className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center space-x-1.5">
                  <span className="text-[10px] text-[#9CA3AF] uppercase font-bold tracking-wider">บัญชี Google</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E]" />
                </div>
                <p className="text-xs text-white font-semibold">
                  {userEmail || 'sirisakkhacha@gmail.com'}
                </p>
              </div>
            </div>
            <div className="text-[10px] bg-[#22C55E]/15 border border-[#22C55E]/30 text-[#4ADE80] font-bold px-2 py-0.5 rounded-full flex items-center space-x-1">
              <CheckCircle2 className="w-3 h-3" />
              <span>SYNCED</span>
            </div>
          </div>

          <div className="pt-2.5 border-t border-[#1F2433] flex items-center justify-between text-xs">
            <div className="flex items-center space-x-2 text-[#9CA3AF]">
              <Globe className="w-3.5 h-3.5 text-[#38BDF8]" />
              <span className="text-[11px] text-[#D1D5DB]">
                Google Search เชื่อมโยงบัญชี Email: <span className="text-[#38BDF8] font-medium">เปิดใช้งานค้นหาข้อมูลตลาดสด</span>
              </span>
            </div>
            <span className="text-[10px] bg-[#38BDF8]/15 border border-[#38BDF8]/30 text-[#38BDF8] px-2 py-0.5 rounded-md font-semibold">
              Live Grounding (MotorBoy Pro)
            </span>
          </div>
        </div>

        {/* Google Gemini API Key Section - Collapsible */}
        <div className="rounded-2xl bg-[#0F1117]/60 border border-[#2A2E45] overflow-hidden transition-all">
          <button
            type="button"
            onClick={() => setIsApiKeySectionOpen(!isApiKeySectionOpen)}
            className="w-full p-3.5 flex items-center justify-between text-left hover:bg-[#141417] transition-colors cursor-pointer"
          >
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-xl bg-[#8A2BE2]/10 border border-[#8A2BE2]/30 flex items-center justify-center text-[#8A2BE2]">
                <Key className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-bold text-white">
                    ส่วนจัดการ Google Gemini API Key
                  </span>
                  <span className="text-[10px] text-[#9CA3AF] bg-[#2A2E45] px-1.5 py-0.5 rounded">
                    Google AI Studio
                  </span>
                </div>
                <p className="text-[11px] text-[#9CA3AF]">
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
                <ChevronUp className="w-4 h-4 text-[#9CA3AF]" />
              ) : (
                <ChevronDown className="w-4 h-4 text-[#9CA3AF]" />
              )}
            </div>
          </button>

          {isApiKeySectionOpen && (
            <div className="p-4 pt-2 border-t border-[#1F2433] space-y-3 bg-[#0F1117]">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-white flex items-center space-x-1.5">
                  <Key className="w-4 h-4 text-[#8A2BE2]" />
                  <span>Google Gemini API Key (ซิงค์กับบัญชี Google)</span>
                </label>
                <span className="text-[10px] text-[#9CA3AF] bg-[#2A2E45] px-2 py-0.5 rounded-md font-medium">
                  Google AI Studio
                </span>
              </div>

              <p className="text-[11px] text-[#9CA3AF] leading-relaxed">
                ใส่ Google Gemini API Key เพื่อเปิดใช้งานระบบวิเคราะห์ตลาดแบบเรียลไทม์ พร้อม Google Search Grounding สด (คีย์จะถูกเข้ารหัสและซิงค์เก็บไว้ในบัญชีของคุณเท่านั้น)
              </p>

              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  placeholder="AIzaSy..."
                  className="w-full bg-[#0F1117] border border-[#2A2E45] focus:border-[#7C6CFF] rounded-xl pl-3.5 pr-10 py-2.5 text-xs text-white outline-none font-mono placeholder-[#4B5563]"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#909AAB] hover:text-white p-1 cursor-pointer"
                >
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {/* Quick link to Google AI Studio */}
              <div className="flex items-center justify-between px-1">
                <span className="text-[10px] text-[#909AAB]">ต้องการ API Key เพิ่มเติม?</span>
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
                  className="flex-1 bg-[#7C6CFF] hover:bg-[#6A58F0] text-[#0F1117] font-bold text-xs py-2 rounded-xl transition-all flex items-center justify-center space-x-1.5 cursor-pointer disabled:opacity-50 shadow-[0_6px_18px_rgba(124,108,255,0.28)]"
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
                  className="px-3.5 bg-[#141417] hover:bg-[#2A2E45] border border-[#2A2E45] text-[#00E5FF] font-semibold text-xs py-2 rounded-xl transition-colors flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
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
                      ? 'bg-[#22C55E]/15 border border-[#22C55E]/30 text-[#4ADE80]'
                      : 'bg-[#f9df7b]/15 border border-[#f9df7b]/30 text-[#f9df7b]'
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
                      ? 'bg-[#22C55E]/15 border border-[#22C55E]/30 text-[#4ADE80]'
                      : 'bg-[#f9df7b]/15 border border-[#f9df7b]/30 text-[#f9df7b]'
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

        <hr className="border-[#2A2E45]" />

        {/* Currency Switch */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-white text-xs font-semibold">สกุลเงินแสดงผล</h3>
            <p className="text-[#909AAB] text-[11px]">
              {useThb ? 'บาทไทย (฿ THB)' : 'ดอลลาร์สหรัฐ ($ USD)'}
            </p>
          </div>

          <button
            type="button"
            onClick={() => onToggleCurrency(!useThb)}
            className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors duration-200 cursor-pointer ${
              useThb ? 'bg-[#7C6CFF]' : 'bg-[#0F1117] border border-[#2A2E45]'
            }`}
          >
            <div
              className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                useThb ? 'translate-x-6' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        <hr className="border-[#2A2E45]" />

        {/* Notifications */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-white text-xs font-semibold">การแจ้งเตือนสัญญาณ</h3>
            <p className="text-[#909AAB] text-[11px]">
              {notificationsEnabled ? 'เปิดใช้งานและส่งเตือน' : 'ปิดการแจ้งเตือนอยู่'}
            </p>
          </div>

          <button
            type="button"
            onClick={onToggleNotifications}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
              notificationsEnabled
                ? 'bg-[#22C55E]/20 text-[#4ADE80] border border-[#22C55E]/40'
                : 'bg-[#7C6CFF] text-[#0F1117] hover:bg-[#7C6CFF]/90'
            }`}
          >
            {notificationsEnabled ? 'เปิดอยู่ ✓' : 'เปิดแจ้งเตือน'}
          </button>
        </div>

        <hr className="border-[#2A2E45]" />

        {/* Trading Psychology & Risk Settings */}
        <div className="space-y-3">
          <h3 className="text-white text-xs font-bold">
            🧠 จิตวิทยาการเทรด & การควบคุมอารมณ์
          </h3>
          <div className="bg-[#0F1117] border border-[#2A2E45] rounded-xl p-3 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-[#9CA3AF]">ระดับความเสี่ยงที่รับได้</span>
              <select
                className="bg-[#1A1D29] text-white rounded-lg p-1"
                value={psychologySettings.riskToleranceLevel}
                onChange={(e) => onSavePsychologySettings({ ...psychologySettings, riskToleranceLevel: e.target.value as any })}
              >
                <option value="CONSERVATIVE">CONSERVATIVE</option>
                <option value="MODERATE">MODERATE</option>
                <option value="AGGRESSIVE">AGGRESSIVE</option>
              </select>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#9CA3AF]">เตือนให้เช็คอารมณ์</span>
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
                <label className="text-[10px] text-[#909AAB] block mb-1">เหรียญ</label>
                <input
                  type="text"
                  value={symbolInput}
                  onChange={(e) => setSymbolInput(e.target.value.toUpperCase())}
                  className="w-full bg-[#0F1117] border border-[#2A2E45] focus:border-[#7C6CFF] rounded-xl px-3 py-2 text-xs text-white outline-none"
                  placeholder="BTC"
                />
              </div>
              <div className="col-span-3">
                <label className="text-[10px] text-[#909AAB] block mb-1">ราคาเป้าหมาย ($ USD)</label>
                <input
                  type="number"
                  step="any"
                  value={priceInput}
                  onChange={(e) => setPriceInput(e.target.value)}
                  className="w-full bg-[#0F1117] border border-[#2A2E45] focus:border-[#7C6CFF] rounded-xl px-3 py-2 text-xs text-white outline-none"
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
            <p className="text-[#4ADE80] text-xs text-center animate-fade-in">
              {alertSavedText}
            </p>
          )}

          {/* Existing alerts */}
          {priceAlerts.length > 0 && (
            <div className="space-y-1.5 pt-2">
              <p className="text-[11px] text-[#9CA3AF] font-semibold">
                รายการแจ้งเตือนที่ตั้งไว้:
              </p>
              <div className="max-h-32 overflow-y-auto space-y-1.5 pr-1">
                {priceAlerts.map((a, idx) => (
                  <div
                    key={`${a.symbol}-${a.targetPrice}-${idx}`}
                    className="flex items-center justify-between bg-[#0F1117] border border-[#2A2E45] px-3 py-1.5 rounded-xl text-xs"
                  >
                    <span className="font-bold text-white">{a.symbol}</span>
                    <span className="text-[#A5B4FC]">
                      เป้าหมาย: ${a.targetPrice.toLocaleString()}
                    </span>
                    {onRemoveAlert && (
                      <button
                        type="button"
                        onClick={() => onRemoveAlert(a.symbol, a.targetPrice)}
                        className="text-[#909AAB] hover:text-[#f9df7b] p-1"
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
        <div className="pt-2 border-t border-[#2A2E45] flex items-center justify-between">
          <div className="flex items-center space-x-1 text-[11px] text-[#909AAB]">
            <ShieldCheck className="w-3.5 h-3.5 text-[#22C55E]" />
            <span>ข้อมูลทั้งหมดซิงค์ด้วยบัญชี Google ของคุณ</span>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="text-xs bg-[#2A2E45] hover:bg-[#32384D] text-white px-4 py-2 rounded-xl font-semibold transition-colors cursor-pointer"
          >
            ปิดหน้าต่าง
          </button>
        </div>
      </div>
    </div>
  );
};
