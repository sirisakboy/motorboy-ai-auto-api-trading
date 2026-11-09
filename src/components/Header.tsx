import React, { useState, useRef, useEffect } from 'react';
import { Bell, Settings, LogOut, User as UserIcon, Mail, Calendar as CalendarIcon, MessageSquare, Calculator, LayoutGrid, X, Radio, TrendingDown, Volume2, VolumeX } from 'lucide-react';
import { CryptoCoin } from '../types';
import { TickerBar } from './TickerBar';

interface HeaderProps {
  cryptoList: CryptoCoin[];
  useThb: boolean;
  usdThbRate?: number;
  usdThbLive?: boolean;
  isDark: boolean;
  notifEnabled: boolean;
  alertCount: number;
  user?: { displayName?: string | null; photoURL?: string | null; email?: string | null } | null;
  isMusicPlaying?: boolean;
  onToggleMusic?: () => void;
  onToggleCurrency: () => void;
  onToggleNotifications: () => void;
  onOpenSettings: () => void;
  onOpenGmail?: () => void;
  onOpenCalendar?: () => void;
  onOpenChat?: () => void;
  onOpenRiskCalc?: () => void;
  onOpenDrawdown?: () => void;
  onOpenAtsMatrix?: () => void;
  onSignIn?: () => void;
  onSignOut?: () => void;
  drawdownBreachCount?: number;
}

export const Header: React.FC<HeaderProps> = ({
  cryptoList,
  useThb,
  usdThbRate = 36.45,
  usdThbLive = false,
  isDark,
  notifEnabled,
  alertCount,
  user,
  isMusicPlaying = true,
  onToggleMusic,
  onToggleCurrency,
  onToggleNotifications,
  onOpenSettings,
  onOpenGmail,
  onOpenCalendar,
  onOpenChat,
  onOpenRiskCalc,
  onOpenDrawdown,
  onOpenAtsMatrix,
  onSignIn,
  onSignOut,
  drawdownBreachCount = 0,
}) => {
  // Tools dropdown — groups Gmail/Calendar/Chat/Risk so the bar fits 360px screens
  const [toolsOpen, setToolsOpen] = useState(false);
  const toolsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!toolsOpen) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (toolsRef.current && !toolsRef.current.contains(e.target as Node)) setToolsOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setToolsOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [toolsOpen]);

  const tools: Array<{
    key: string;
    label: string;
    desc: string;
    icon: React.ReactNode;
    accent: string;
    badge?: string;
    onOpen?: () => void;
  }> = [
    {
      key: 'ats',
      label: '⚡ ATS Matrix Mode',
      desc: 'Polymarket & Crypto Inefficiency (NIULAI4)',
      icon: <Radio className="w-4 h-4 text-[#10B981]" />,
      accent: 'hover:border-[#10B981]/60',
      badge: 'PRO',
      onOpen: onOpenAtsMatrix,
    },
    {
      key: 'gmail',
      label: 'Gmail Trading Hub',
      desc: 'อ่าน/ส่งรายงานสัญญาณทางอีเมล',
      icon: <Mail className="w-4 h-4 text-[#EA4335]" />,
      accent: 'hover:border-[#EA4335]/60',
      onOpen: onOpenGmail,
    },
    {
      key: 'calendar',
      label: 'ปฏิทินเทรด',
      desc: 'กิจกรรม Google Calendar + สร้างนัด',
      icon: <CalendarIcon className="w-4 h-4 text-[#38BDF8]" />,
      accent: 'hover:border-[#38BDF8]/60',
      onOpen: onOpenCalendar,
    },
    {
      key: 'chat',
      label: 'AI Deep Analyze',
      desc: 'คุยวิเคราะห์ตลาด การเงิน & ข่าวกับ AI 100%',
      icon: <MessageSquare className="w-4 h-4 text-[#22C55E]" />,
      accent: 'hover:border-[#22C55E]/60',
      badge: 'AI 100%',
      onOpen: onOpenChat,
    },
    {
      key: 'drawdown',
      label: 'Drawdown Monitor',
      desc: 'ตรวจวัด Peak-to-Trough & คุมความเสี่ยง',
      icon: <TrendingDown className="w-4 h-4 text-[#f9df7b]" />,
      accent: 'hover:border-[#f9df7b]/60',
      badge: drawdownBreachCount > 0 ? `! ${drawdownBreachCount}` : undefined,
      onOpen: onOpenDrawdown,
    },
    {
      key: 'risk',
      label: 'คำนวณความเสี่ยง',
      desc: 'ขนาด position ตาม %risk + SL',
      icon: <Calculator className="w-4 h-4 text-[#F59E0B]" />,
      accent: 'hover:border-[#F59E0B]/60',
      onOpen: onOpenRiskCalc,
    },
  ].filter((t) => t.onOpen);

  const iconBtn = (darkCls: string, lightCls: string) =>
    `w-8 h-8 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl border flex items-center justify-center transition-all ${isDark ? darkCls : lightCls}`;

  return (
    <header className={`sticky top-0 z-30 border-b backdrop-blur-md ${isDark ? 'bg-[#0F1117]/95 border-[#2A2E45]' : 'bg-white/95 border-[#E2E8F0]'}`}>
      <div className="max-w-7xl mx-auto px-2 sm:px-4 h-16 flex items-center justify-between gap-1">
        {/* MotorBoy AI-TH Logo & Brand */}
        <div className="flex items-center space-x-1.5 sm:space-x-2.5 min-w-0">
          <div className="w-8 h-8 sm:w-9 sm:h-9 shrink-0 rounded-lg sm:rounded-xl bg-gradient-to-br from-[#FF0033] via-[#8A2BE2] to-[#00E5FF] p-[1.5px] shadow-[0_0_15px_rgba(255,0,51,0.45)]">
            <div className="w-full h-full bg-[#0F1117] rounded-[6.5px] sm:rounded-[10px] flex items-center justify-center text-sm sm:text-base">
              <span role="img" aria-label="motorcycle">🏍️</span>
            </div>
          </div>

          <div className="min-w-0">
            <div className="flex items-center space-x-1.5 flex-wrap sm:flex-nowrap">
              <span className="font-black text-xs sm:text-base tracking-tight bg-gradient-to-r from-[#FF0033] via-[#8A2BE2] to-[#00E5FF] text-transparent bg-clip-text">
                MOTORBOY
              </span>
              <span className={`font-black text-xs sm:text-base tracking-tight ${isDark ? 'text-white' : 'text-[#0F172A]'}`}>
                AI-TH
              </span>
              <span className="bg-gradient-to-r from-[#FF0033]/20 to-[#8A2BE2]/20 border border-[#FF0033]/40 text-[#FF0033] text-[8px] sm:text-[9px] font-extrabold px-1.5 py-0.5 rounded-md">
                HYBRID PRO
              </span>
            </div>
            <p className="text-[#9CA3AF] text-[9px] sm:text-[10px] leading-tight mt-0.5 truncate hidden min-[380px]:block">
              เร็ว แม่น ปลอดภัย แบบ MotorBoy • Auto API Co-Pilot
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0 ml-1">
          {/* Calming Nature Healing Audio Toggle Button */}
          {onToggleMusic && (
            <button
              type="button"
              onClick={onToggleMusic}
              title={isMusicPlaying ? 'ปิดเสียงธรรมชาติบำบัด (Nature Healing Audio)' : 'เปิดเสียงธรรมชาติบำบัด'}
              className={`px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-lg sm:rounded-xl border text-[10px] sm:text-xs font-semibold transition-all inline-flex items-center gap-1.5 ${
                isMusicPlaying
                  ? isDark
                    ? 'bg-[#10B981]/15 border-[#10B981]/40 text-[#34D399] hover:bg-[#10B981]/25'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                  : isDark
                  ? 'bg-[#131826] border-[#2A2E45] text-slate-400 hover:text-slate-200'
                  : 'bg-white border-slate-200 text-slate-500 hover:text-slate-700'
              }`}
            >
              {isMusicPlaying ? (
                <>
                  <Volume2 className="w-3.5 h-3.5 text-[#34D399] animate-pulse" />
                  <span className="hidden md:inline">ธรรมชาติบำบัด 🍃</span>
                </>
              ) : (
                <>
                  <VolumeX className="w-3.5 h-3.5 text-slate-400" />
                  <span className="hidden md:inline">ธรรมชาติบำบัด</span>
                </>
              )}
            </button>
          )}

          {/* Currency Switch */}
          <button
            type="button"
            onClick={onToggleCurrency}
            title={useThb ? `เรท USD/THB ${usdThbRate.toFixed(2)}${usdThbLive ? ' (live)' : ' (สำรอง)'}` : 'แสดงราคาเป็นบาท'}
            className={`px-1.5 sm:px-2.5 py-1 sm:py-1.5 rounded-lg sm:rounded-xl border text-[10px] sm:text-xs font-bold transition-all ${
              isDark
                ? 'bg-[#131826] border-[#2A2E45] text-[#818CF8] hover:border-[#818CF8]'
                : 'bg-white border-[#E2E8F0] text-[#6366F1] hover:border-[#6366F1]'
            }`}
          >
            <span className="sm:hidden">{useThb ? '฿' : '$'}</span>
            <span className="hidden sm:inline">{useThb ? '฿ THB' : '$ USD'}</span>
          </button>

          {/* Notifications */}
          <div className="relative">
            <button
              type="button"
              onClick={onToggleNotifications}
              className={`${iconBtn(
                'bg-[#131826] border-[#2A2E45] hover:border-[#818CF8]',
                'bg-white border-[#E2E8F0] hover:border-[#6366F1]'
              )} ${notifEnabled ? 'text-[#818CF8]' : 'text-[#94A3B8]'}`}
              aria-label="Notifications"
            >
              <Bell className="w-4 h-4" />
            </button>
            {alertCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#f9df7b] text-black text-[9px] font-bold flex items-center justify-center">
                {alertCount}
              </span>
            )}
          </div>

          {/* Tools dropdown (Gmail / Calendar / Chat / Risk) */}
          {tools.length > 0 && (
            <div ref={toolsRef} className="relative">
              <button
                type="button"
                onClick={() => setToolsOpen((v) => !v)}
                className={`${iconBtn(
                  'bg-[#131826] border-[#2A2E45] text-slate-100 hover:border-[#818CF8]',
                  'bg-white border-[#E2E8F0] text-[#0F172A] hover:border-[#6366F1]'
                )}`}
                aria-label="เครื่องมือ"
                aria-expanded={toolsOpen}
                title="เครื่องมือ (Gmail / ปฏิทิน / แชท / คำนวณเสี่ยง)"
              >
                {toolsOpen ? <X className="w-4 h-4" /> : <LayoutGrid className="w-4 h-4" />}
                {drawdownBreachCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#f9df7b] text-black text-[9px] font-bold flex items-center justify-center">
                    !
                  </span>
                )}
              </button>
              {toolsOpen && (
                <div className={`absolute right-0 top-full mt-2 w-64 rounded-2xl border shadow-2xl overflow-hidden z-50 ${
                  isDark ? 'bg-[#131826] border-[#2A2E45]' : 'bg-white border-slate-200'
                }`}>
                  <p className={`px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-[#94A3B8]' : 'text-slate-400'}`}>
                    เครื่องมือ
                  </p>
                  <div className="p-2 space-y-1">
                    {tools.map((t) => (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => {
                          setToolsOpen(false);
                          t.onOpen?.();
                        }}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-transparent text-left transition-colors ${t.accent} ${
                          isDark ? 'hover:bg-[#0F1117]' : 'hover:bg-slate-50'
                        }`}
                      >
                        <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isDark ? 'bg-[#0F1117] border border-[#2A2E45]' : 'bg-slate-100 border border-slate-200'}`}>
                          {t.icon}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={`flex items-center gap-1.5 text-xs font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                            {t.label}
                            {t.badge && (
                              <span className="text-[9px] font-bold px-1 py-0.2 rounded bg-[#10B981]/15 border border-[#10B981]/40 text-[#34D399]">
                                {t.badge}
                              </span>
                            )}
                          </span>
                          <span className={`block text-[11px] truncate ${isDark ? 'text-[#94A3B8]' : 'text-slate-500'}`}>{t.desc}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Settings */}
          <button
            type="button"
            onClick={onOpenSettings}
            className={iconBtn(
              'bg-[#131826] border-[#2A2E45] text-slate-100 hover:border-[#818CF8]',
              'bg-white border-[#E2E8F0] text-[#0F172A] hover:border-[#6366F1]'
            )}
            aria-label="Settings"
            data-testid="settings_btn"
          >
            <Settings className="w-4 h-4" />
          </button>

          {/* User Profile & Sign Out / Sign In */}
          {user && user.email ? (
            <div className="flex items-center gap-1 sm:gap-2 pl-1.5 ml-0.5 sm:pl-2.5 sm:ml-1 border-l border-[#2A2E45]">
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName || 'User'}
                  className="w-7 h-7 sm:w-8 sm:h-8 rounded-full border border-[#818CF8]/50 object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-[#818CF8]/20 border border-[#818CF8]/40 flex items-center justify-center text-[#A5B4FC]">
                  <UserIcon className="w-4 h-4" />
                </div>
              )}
              {onSignOut && (
                <button
                  type="button"
                  onClick={onSignOut}
                  className={`flex items-center w-8 h-8 sm:w-auto sm:h-9 justify-center sm:space-x-1.5 sm:px-2.5 rounded-lg sm:rounded-xl border text-xs font-semibold transition-colors ${
                    isDark
                      ? 'bg-[#131826] border-[#2A2E45] text-[#94A3B8] hover:text-white hover:border-[#f9df7b]/50 hover:bg-[#f9df7b]/10'
                      : 'bg-white border-[#E2E8F0] text-slate-600 hover:text-[#f9df7b] hover:border-[#f9df7b] hover:bg-[#f9df7b]'
                  }`}
                  title="Sign Out"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">ออก</span>
                </button>
              )}
            </div>
          ) : (
            onSignIn && (
              <div className="flex items-center pl-1.5 ml-0.5 sm:pl-2.5 sm:ml-1 border-l border-[#2A2E45]">
                <button
                  type="button"
                  onClick={onSignIn}
                  className={`flex items-center h-8 sm:h-9 px-2 sm:px-3 rounded-lg sm:rounded-xl border text-xs font-semibold transition-colors gap-1.5 ${
                    isDark
                      ? 'bg-[#818CF8]/15 border-[#818CF8]/40 text-[#A5B4FC] hover:bg-[#818CF8]/25 hover:border-[#818CF8]'
                      : 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100'
                  }`}
                  title="Sign In with Google"
                >
                  <UserIcon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">เข้าสู่ระบบ</span>
                </button>
              </div>
            )
          )}
        </div>
      </div>

      {/* Ticker Bar */}
      <TickerBar coins={cryptoList} useThb={useThb} usdThbRate={usdThbRate} />
    </header>
  );
};
