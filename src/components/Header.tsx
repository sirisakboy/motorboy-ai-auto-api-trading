import React, { useState, useRef, useEffect } from 'react';
import { Moon, Sun, Bell, Settings, Zap, LogOut, User as UserIcon, Mail, Calendar as CalendarIcon, MessageSquare, Calculator, LayoutGrid, X, Radio, TrendingDown } from 'lucide-react';
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
  onToggleCurrency: () => void;
  onToggleTheme: () => void;
  onToggleNotifications: () => void;
  onOpenSettings: () => void;
  onOpenGmail?: () => void;
  onOpenCalendar?: () => void;
  onOpenChat?: () => void;
  onOpenRiskCalc?: () => void;
  onOpenDrawdown?: () => void;
  onOpenAtsMatrix?: () => void;
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
  onToggleCurrency,
  onToggleTheme,
  onToggleNotifications,
  onOpenSettings,
  onOpenGmail,
  onOpenCalendar,
  onOpenChat,
  onOpenRiskCalc,
  onOpenDrawdown,
  onOpenAtsMatrix,
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
      icon: <Radio className="w-4 h-4 text-[#00FF66]" />,
      accent: 'hover:border-[#00FF66]/60',
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
      icon: <TrendingDown className="w-4 h-4 text-[#EF4444]" />,
      accent: 'hover:border-[#EF4444]/60',
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
    `w-8 h-8 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl border flex items-center justify-center transition-colors ${isDark ? darkCls : lightCls}`;

  return (
    <header className={`sticky top-0 z-30 border-b ${isDark ? 'bg-[#0F1117] border-[#252A3A]' : 'bg-white border-[#E2E8F0]'}`}>
      <div className="max-w-7xl mx-auto px-2 sm:px-4 h-16 flex items-center justify-between gap-1">
        {/* Logo & Brand */}
        <div className="flex items-center space-x-1.5 sm:space-x-2.5 min-w-0">
          <div className="w-7 h-7 sm:w-9 sm:h-9 shrink-0 rounded-lg sm:rounded-xl bg-[#1A1D29] border border-[#252A3A] flex items-center justify-center text-lg shadow-xs">
            <Zap className="w-4 h-4 sm:w-5 sm:h-5 text-[#7C6CFF] fill-[#7C6CFF]" />
          </div>

          <div className="min-w-0">
            <div className="flex items-center space-x-1 flex-wrap sm:flex-nowrap">
              <span className={`font-black text-xs sm:text-base tracking-tight ${isDark ? 'text-white' : 'text-[#0F172A]'}`}>
                TRADING
              </span>
              <span className="font-black text-xs sm:text-base tracking-tight text-[#7C6CFF]">
                ENGINE
              </span>
              <span className="bg-[#7C6CFF]/20 border border-[#7C6CFF]/40 text-[#A5B4FC] text-[8px] sm:text-[9px] font-extrabold px-1 py-0.5 rounded-md">
                PRO
              </span>
            </div>
            <p className="text-[#6B7280] text-[9px] sm:text-[10px] leading-tight mt-0.5 truncate hidden min-[380px]:block">
              Real-time Multi-Asset • Live
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1 sm:gap-2.5 shrink-0 ml-1">
          {/* Currency Switch */}
          <button
            type="button"
            onClick={onToggleCurrency}
            title={useThb ? `เรท USD/THB ${usdThbRate.toFixed(2)}${usdThbLive ? ' (live)' : ' (สำรอง)'}` : 'แสดงราคาเป็นบาท'}
            className={`px-1.5 sm:px-3 py-1 sm:py-1.5 rounded-lg sm:rounded-xl border text-[10px] sm:text-xs font-bold transition-colors ${
              isDark
                ? 'bg-[#1A1D29] border-[#252A3A] text-[#7C6CFF] hover:border-[#7C6CFF]'
                : 'bg-white border-[#E2E8F0] text-[#7C6CFF] hover:border-[#7C6CFF]'
            }`}
          >
            <span className="sm:hidden">{useThb ? '฿' : '$'}</span>
            <span className="hidden sm:inline">{useThb ? '฿ THB' : '$ USD'}</span>
          </button>

          {/* Theme Toggle */}
          <button
            type="button"
            onClick={onToggleTheme}
            className={iconBtn(
              'bg-[#1A1D29] border-[#252A3A] text-white hover:border-[#7C6CFF]',
              'bg-white border-[#E2E8F0] text-[#0F172A] hover:border-[#7C6CFF]'
            )}
            aria-label="Toggle Theme"
          >
            {isDark ? <Sun className="w-4 h-4 text-amber-300" /> : <Moon className="w-4 h-4 text-slate-700" />}
          </button>

          {/* Notifications */}
          <div className="relative">
            <button
              type="button"
              onClick={onToggleNotifications}
              className={`${iconBtn(
                'bg-[#1A1D29] border-[#252A3A] hover:border-[#7C6CFF]',
                'bg-white border-[#E2E8F0] hover:border-[#7C6CFF]'
              )} ${notifEnabled ? 'text-[#7C6CFF]' : 'text-[#6B7280]'}`}
              aria-label="Notifications"
            >
              <Bell className="w-4 h-4" />
            </button>
            {alertCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#EF4444] text-white text-[9px] font-bold flex items-center justify-center">
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
                  'bg-[#1A1D29] border-[#252A3A] text-white hover:border-[#7C6CFF]',
                  'bg-white border-[#E2E8F0] text-[#0F172A] hover:border-[#7C6CFF]'
                )}`}
                aria-label="เครื่องมือ"
                aria-expanded={toolsOpen}
                title="เครื่องมือ (Gmail / ปฏิทิน / แชท / คำนวณเสี่ยง)"
              >
                {toolsOpen ? <X className="w-4 h-4" /> : <LayoutGrid className="w-4 h-4" />}
                {drawdownBreachCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#EF4444] text-white text-[9px] font-bold flex items-center justify-center animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)]">
                    !
                  </span>
                )}
              </button>
              {toolsOpen && (
                <div className={`absolute right-0 top-full mt-2 w-64 rounded-2xl border shadow-2xl overflow-hidden z-50 ${
                  isDark ? 'bg-[#1A1D29] border-[#252A3A]' : 'bg-white border-slate-200'
                }`}>
                  <p className={`px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-[#6B7280]' : 'text-slate-400'}`}>
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
                        <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isDark ? 'bg-[#0F1117] border border-[#252A3A]' : 'bg-slate-100 border border-slate-200'}`}>
                          {t.icon}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={`flex items-center gap-1.5 text-xs font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                            {t.label}
                            {t.badge && (
                              <span className="text-[9px] font-bold px-1 py-0.2 rounded bg-[#22C55E]/15 border border-[#22C55E]/40 text-[#4ADE80]">
                                {t.badge}
                              </span>
                            )}
                          </span>
                          <span className={`block text-[11px] truncate ${isDark ? 'text-[#9CA3AF]' : 'text-slate-500'}`}>{t.desc}</span>
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
              'bg-[#1A1D29] border-[#252A3A] text-white hover:border-[#7C6CFF]',
              'bg-white border-[#E2E8F0] text-[#0F172A] hover:border-[#7C6CFF]'
            )}
            aria-label="Settings"
            data-testid="settings_btn"
          >
            <Settings className="w-4 h-4" />
          </button>

          {/* User Profile & Sign Out */}
          {user && (
            <div className="flex items-center gap-1 sm:gap-2 pl-1.5 ml-0.5 sm:pl-2.5 sm:ml-1 border-l border-[#252A3A]">
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName || 'User'}
                  className="w-7 h-7 sm:w-8 sm:h-8 rounded-full border border-[#7C6CFF]/50 object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-[#7C6CFF]/20 border border-[#7C6CFF]/40 flex items-center justify-center text-[#A5B4FC]">
                  <UserIcon className="w-4 h-4" />
                </div>
              )}
              {onSignOut && (
                <button
                  type="button"
                  onClick={onSignOut}
                  className={`flex items-center w-8 h-8 sm:w-auto sm:h-9 justify-center sm:space-x-1.5 sm:px-2.5 rounded-lg sm:rounded-xl border text-xs font-semibold transition-colors ${
                    isDark
                      ? 'bg-[#1A1D29] border-[#252A3A] text-[#9CA3AF] hover:text-white hover:border-red-500/50 hover:bg-red-500/10'
                      : 'bg-white border-[#E2E8F0] text-slate-600 hover:text-red-600 hover:border-red-300 hover:bg-red-50'
                  }`}
                  title="Sign Out"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">ออก</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Ticker Bar */}
      <TickerBar coins={cryptoList} useThb={useThb} usdThbRate={usdThbRate} />
    </header>
  );
};
