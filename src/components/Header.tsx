import React, { useState, useRef, useEffect } from 'react';
import { Bell, Settings, LogOut, User as UserIcon, Mail, Calendar as CalendarIcon, MessageSquare, Calculator, LayoutGrid, X, Radio, TrendingDown } from 'lucide-react';
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
      icon: <Radio className="w-4 h-4 text-[#7EE0B5]" />,
      accent: 'hover:border-[#7EE0B5]/60',
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
      icon: <CalendarIcon className="w-4 h-4 text-[#4CC9F0]" />,
      accent: 'hover:border-[#4CC9F0]/60',
      onOpen: onOpenCalendar,
    },
    {
      key: 'chat',
      label: 'AI Deep Analyze',
      desc: 'คุยวิเคราะห์ตลาด การเงิน & ข่าวกับ AI 100%',
      icon: <MessageSquare className="w-4 h-4 text-[#7EE0B5]" />,
      accent: 'hover:border-[#7EE0B5]/60',
      badge: 'AI 100%',
      onOpen: onOpenChat,
    },
    {
      key: 'drawdown',
      label: 'Drawdown Monitor',
      desc: 'ตรวจวัด Peak-to-Trough & คุมความเสี่ยง',
      icon: <TrendingDown className="w-4 h-4 text-[#FFB86B]" />,
      accent: 'hover:border-[#FFB86B]/60',
      badge: drawdownBreachCount > 0 ? `! ${drawdownBreachCount}` : undefined,
      onOpen: onOpenDrawdown,
    },
    {
      key: 'risk',
      label: 'คำนวณความเสี่ยง',
      desc: 'ขนาด position ตาม %risk + SL',
      icon: <Calculator className="w-4 h-4 text-[#FFB86B]" />,
      accent: 'hover:border-[#FFB86B]/60',
      onOpen: onOpenRiskCalc,
    },
  ].filter((t) => t.onOpen);

  const iconBtn = (darkCls: string, lightCls: string) =>
    `w-8 h-8 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl border flex items-center justify-center transition-all ${isDark ? darkCls : lightCls}`;

  return (
    <header className={`sticky top-0 z-30 border-b backdrop-blur-md ${isDark ? 'bg-[#0F1117]/95 border-white/[0.07]' : 'bg-white/95 border-[#ECEAF4]'}`}>
      <div className="max-w-7xl mx-auto px-2 sm:px-4 h-16 flex items-center justify-between gap-1">
        {/* MotorBoy AI-TH Logo & Brand */}
        <div className="flex items-center space-x-1.5 sm:space-x-2.5 min-w-0">
          {/* App mark: fixed 32/36px square, same footprint as the old emblem, so
              nothing in the row shifts. Vector, so it stays crisp on any DPI. */}
          <img
            src="/brand/motorboy-mark.svg"
            alt=""
            width={36}
            height={36}
            className="w-8 h-8 sm:w-9 sm:h-9 shrink-0 rounded-lg sm:rounded-xl shadow-[0_4px_16px_rgba(124,108,255,0.35)]"
          />

          <div className="min-w-0">
            <div className="flex items-baseline gap-1.5 min-w-0">
              <span
                className={`font-black text-xs sm:text-base tracking-tight leading-none ${
                  isDark ? 'text-[#ECEAF4]' : 'text-[#0F172A]'
                }`}
              >
                MOTORBOY
              </span>
              <span className="font-black text-xs sm:text-base tracking-tight leading-none text-[#8E80FF]">
                AI-TH
              </span>
              {/* the chip needs ~62px; below 640px it moved the row around, so it
                  only appears when there is room for it */}
              <span className="hidden sm:inline-flex items-center bg-[#7C6CFF]/15 border border-[#7C6CFF]/40 text-[#8E80FF] text-[9px] font-extrabold px-1.5 py-0.5 rounded-md shrink-0">
                HYBRID PRO
              </span>
            </div>
            <p className="text-[#A7A4B8] text-[9px] sm:text-[10px] leading-tight mt-0.5 truncate hidden min-[380px]:block">
              เร็ว แม่น ปลอดภัย แบบ MotorBoy • Auto API Co-Pilot
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0 ml-1">
          {/* Currency Switch */}
          <button
            type="button"
            onClick={onToggleCurrency}
            title={useThb ? `เรท USD/THB ${usdThbRate.toFixed(2)}${usdThbLive ? ' (live)' : ' (สำรอง)'}` : 'แสดงราคาเป็นบาท'}
            className={`px-1.5 sm:px-2.5 py-1 sm:py-1.5 rounded-lg sm:rounded-xl border text-[10px] sm:text-xs font-bold transition-all ${
              isDark
                ? 'bg-[#141725] border-white/[0.07] text-[#A89FFF] hover:border-[#A89FFF]'
                : 'bg-white border-[#ECEAF4] text-[#A89FFF] hover:border-[#A89FFF]'
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
                'bg-[#141725] border-white/[0.07] hover:border-[#A89FFF]',
                'bg-white border-[#ECEAF4] hover:border-[#A89FFF]'
              )} ${notifEnabled ? 'text-[#A89FFF]' : 'text-[#A7A4B8]'}`}
              aria-label="Notifications"
            >
              <Bell className="w-4 h-4" />
            </button>
            {alertCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#FFB86B] text-black text-[9px] font-bold flex items-center justify-center">
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
                  'bg-[#141725] border-white/[0.07] text-[#ECEAF4] hover:border-[#A89FFF]',
                  'bg-white border-[#ECEAF4] text-[#0F172A] hover:border-[#A89FFF]'
                )}`}
                aria-label="เครื่องมือ"
                aria-expanded={toolsOpen}
                title="เครื่องมือ (Gmail / ปฏิทิน / แชท / คำนวณเสี่ยง)"
              >
                {toolsOpen ? <X className="w-4 h-4" /> : <LayoutGrid className="w-4 h-4" />}
                {drawdownBreachCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#FFB86B] text-black text-[9px] font-bold flex items-center justify-center">
                    !
                  </span>
                )}
              </button>
              {toolsOpen && (
                <div className={`absolute right-0 top-full mt-2 w-64 rounded-2xl border shadow-2xl overflow-hidden z-50 ${
                  isDark ? 'bg-[#141725] border-white/[0.07]' : 'bg-white border-white/[0.07]'
                }`}>
                  <p className={`px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-[#A7A4B8]' : 'text-[#A7A4B8]'}`}>
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
                          isDark ? 'hover:bg-[#0F1117]' : 'hover:bg-[#F7F5F0]'
                        }`}
                      >
                        <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isDark ? 'bg-[#0F1117] border border-white/[0.07]' : 'bg-[#F7F5F0] border border-white/[0.07]'}`}>
                          {t.icon}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={`flex items-center gap-1.5 text-xs font-bold ${isDark ? 'text-[#ECEAF4]' : 'text-[#0F1117]'}`}>
                            {t.label}
                            {t.badge && (
                              <span className="text-[9px] font-bold px-1 py-0.2 rounded bg-[#7EE0B5]/15 border border-[#7EE0B5]/40 text-[#7EE0B5]">
                                {t.badge}
                              </span>
                            )}
                          </span>
                          <span className={`block text-[11px] truncate ${isDark ? 'text-[#A7A4B8]' : 'text-[#8B88A0]'}`}>{t.desc}</span>
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
              'bg-[#141725] border-white/[0.07] text-[#ECEAF4] hover:border-[#A89FFF]',
              'bg-white border-[#ECEAF4] text-[#0F172A] hover:border-[#A89FFF]'
            )}
            aria-label="Settings"
            data-testid="settings_btn"
          >
            <Settings className="w-4 h-4" />
          </button>

          {/* User Profile & Sign Out / Sign In */}
          {user && user.email ? (
            <div className="flex items-center gap-1 sm:gap-2 pl-1.5 ml-0.5 sm:pl-2.5 sm:ml-1 border-l border-white/[0.07]">
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName || 'User'}
                  className="w-7 h-7 sm:w-8 sm:h-8 rounded-full border border-[#A89FFF]/50 object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-[#A89FFF]/20 border border-[#A89FFF]/40 flex items-center justify-center text-[#A89FFF]">
                  <UserIcon className="w-4 h-4" />
                </div>
              )}
              {onSignOut && (
                <button
                  type="button"
                  onClick={onSignOut}
                  className={`flex items-center w-8 h-8 sm:w-auto sm:h-9 justify-center sm:space-x-1.5 sm:px-2.5 rounded-lg sm:rounded-xl border text-xs font-semibold transition-colors ${
                    isDark
                      ? 'bg-[#141725] border-white/[0.07] text-[#A7A4B8] hover:text-white hover:border-[#FFB86B]/50 hover:bg-[#FFB86B]/10'
                      : 'bg-white border-[#ECEAF4] text-[#8B88A0] hover:text-[#FFB86B] hover:border-[#FFB86B] hover:bg-[#FFB86B]'
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
              <div className="flex items-center pl-1.5 ml-0.5 sm:pl-2.5 sm:ml-1 border-l border-white/[0.07]">
                <button
                  type="button"
                  onClick={onSignIn}
                  className={`flex items-center h-8 sm:h-9 px-2 sm:px-3 rounded-lg sm:rounded-xl border text-xs font-semibold transition-colors gap-1.5 ${
                    isDark
                      ? 'bg-[#A89FFF]/15 border-[#A89FFF]/40 text-[#A89FFF] hover:bg-[#A89FFF]/25 hover:border-[#A89FFF]'
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
