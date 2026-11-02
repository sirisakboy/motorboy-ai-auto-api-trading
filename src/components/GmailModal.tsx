import React, { useState, useEffect } from 'react';
import {
  X,
  Mail,
  Send,
  Trash2,
  RefreshCw,
  Search,
  CheckCircle,
  AlertCircle,
  ChevronLeft,
  ShieldCheck,
} from 'lucide-react';
import {
  GmailMessageSummary,
  GmailMessageDetail,
  GmailProfile,
  fetchGmailMessages,
  fetchGmailMessageDetail,
  sendGmailMessage,
  trashGmailMessage,
  getGmailProfile,
  requestGmailAccessToken,
  getCachedAccessToken,
  buildTradingReportEmailHtml,
} from '../services/gmailService';
import { TradingSignal } from '../types';
import { sanitizeEmailHtml } from '../services/sanitizeHtml';

interface GmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  userEmail?: string | null;
  signals: TradingSignal[];
  isDark?: boolean;
}

export const GmailModal: React.FC<GmailModalProps> = ({
  isOpen,
  onClose,
  userEmail,
  signals,
  isDark = true,
}) => {
  const [activeTab, setActiveTab] = useState<'inbox' | 'compose'>('inbox');
  const [hasToken, setHasToken] = useState<boolean>(false);
  const [isAuthorizing, setIsAuthorizing] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Profile
  const [profile, setProfile] = useState<GmailProfile | null>(null);

  // Messages
  const [messages, setMessages] = useState<GmailMessageSummary[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState<boolean>(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterType, setFilterType] = useState<'all' | 'trading' | 'unread'>('trading');

  // Selected message detail
  const [selectedMessage, setSelectedMessage] = useState<GmailMessageDetail | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState<boolean>(false);

  // Compose State
  const [recipient, setRecipient] = useState<string>(userEmail || '');
  const [subject, setSubject] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [includeSignalReport, setIncludeSignalReport] = useState<boolean>(true);
  const [customBody, setCustomBody] = useState<string>('');
  const [isSending, setIsSending] = useState<boolean>(false);
  const [sendSuccess, setSendSuccess] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  // Confirmation Modals (MANDATORY for mutating operations per Workspace Integration rules)
  const [confirmSendOpen, setConfirmSendOpen] = useState<boolean>(false);
  const [confirmTrashOpen, setConfirmTrashOpen] = useState<boolean>(false);
  const [messageToTrash, setMessageToTrash] = useState<string | null>(null);
  const [isTrashing, setIsTrashing] = useState<boolean>(false);

  // Check token on open
  useEffect(() => {
    if (isOpen) {
      const token = getCachedAccessToken();
      if (token) {
        setHasToken(true);
        loadProfileAndMessages();
      } else {
        setHasToken(false);
      }
    }
  }, [isOpen]);

  // Set recipient default to user's email if empty
  useEffect(() => {
    if (userEmail && !recipient) {
      setRecipient(userEmail);
    }
  }, [userEmail]);

  const handleAuthorize = async () => {
    setIsAuthorizing(true);
    setAuthError(null);
    try {
      await requestGmailAccessToken();
      setHasToken(true);
      await loadProfileAndMessages();
    } catch (err: any) {
      if (err?.message === 'หน้าต่างยืนยันตัวตนถูกปิด') {
        // User closed or cancelled the popup - do not log console.error
        setIsAuthorizing(false);
        return;
      }
      console.error('Failed to authorize Gmail:', err);
      setAuthError(err?.message || 'ไม่สามารถยืนยันตัวตนกับ Gmail ได้');
    } finally {
      setIsAuthorizing(false);
    }
  };

  const loadProfileAndMessages = async (searchOverride?: string, filterOverride?: 'all' | 'trading' | 'unread') => {
    setIsLoadingMessages(true);
    setMessagesError(null);
    try {
      const p = await getGmailProfile().catch(() => null);
      if (p) setProfile(p);

      const activeFilter = filterOverride || filterType;
      const term = searchOverride !== undefined ? searchOverride : searchQuery;

      let queryStr = term;
      if (activeFilter === 'trading') {
        const tradingTerms = 'subject:(trade OR trading OR alert OR binance OR stock OR crypto OR order OR signal OR dividend OR portfolio)';
        queryStr = queryStr ? `${queryStr} ${tradingTerms}` : tradingTerms;
      } else if (activeFilter === 'unread') {
        queryStr = queryStr ? `${queryStr} is:unread` : 'is:unread';
      }

      const msgs = await fetchGmailMessages(queryStr, 20);
      setMessages(msgs);
    } catch (err: any) {
      console.error('Failed to load Gmail messages:', err);
      setMessagesError(err?.message || 'ไม่สามารถโหลดข้อความจาก Gmail ได้');
    } finally {
      setIsLoadingMessages(false);
    }
  };

  const handleOpenMessage = async (msgSummary: GmailMessageSummary) => {
    setIsLoadingDetail(true);
    setSelectedMessage(null);
    try {
      const detail = await fetchGmailMessageDetail(msgSummary.id);
      setSelectedMessage(detail);
    } catch (err: any) {
      alert(err?.message || 'ไม่สามารถเปิดอ่านอีเมลได้');
    } finally {
      setIsLoadingDetail(false);
    }
  };

  // Preparation for sending email: opens confirmation dialog first
  const handleInitiateSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipient.trim()) {
      setSendError('กรุณาระบุอีเมลผู้รับ');
      return;
    }
    setSendError(null);
    setSendSuccess(null);
    setConfirmSendOpen(true);
  };

  // Explicit confirmation accepted: executes send operation
  const handleExecuteSend = async () => {
    setConfirmSendOpen(false);
    setIsSending(true);
    setSendError(null);
    setSendSuccess(null);

    try {
      let finalSubject = subject.trim();
      let finalHtml = '';
      let finalPlain = '';

      if (includeSignalReport) {
        const report = buildTradingReportEmailHtml(signals, recipient, notes);
        finalSubject = finalSubject || report.subject;
        finalHtml = report.html;
        finalPlain = notes ? `${notes}\n\n[Trading Signal Report Included]` : '[Trading Signal Report Included]';
      } else {
        finalSubject = finalSubject || 'การแจ้งเตือนจาก Trading Engine Pro';
        finalHtml = `<div style="font-family: sans-serif; padding: 16px; color: #111;">${customBody.replace(/\n/g, '<br/>')}</div>`;
        finalPlain = customBody;
      }

      await sendGmailMessage({
        to: recipient.trim(),
        subject: finalSubject,
        bodyHtml: finalHtml,
        bodyText: finalPlain,
      });

      setSendSuccess(`ส่งอีเมลไปยัง ${recipient} ผ่าน Gmail สำเร็จเรียบร้อยแล้ว!`);
      // Reset fields
      setSubject('');
      setNotes('');
      setCustomBody('');
      // Reload sent or inbox if needed
      setTimeout(() => {
        loadProfileAndMessages();
      }, 1000);
    } catch (err: any) {
      console.error('Failed to send email:', err);
      setSendError(err?.message || 'เกิดข้อผิดพลาดในการส่งอีเมล');
    } finally {
      setIsSending(false);
    }
  };

  // Preparation for trashing email: opens confirmation dialog first
  const handleInitiateTrash = (messageId: string) => {
    setMessageToTrash(messageId);
    setConfirmTrashOpen(true);
  };

  // Explicit confirmation accepted: executes trash operation
  const handleExecuteTrash = async () => {
    if (!messageToTrash) return;
    setIsTrashing(true);
    try {
      await trashGmailMessage(messageToTrash);
      setMessages((prev) => prev.filter((m) => m.id !== messageToTrash));
      if (selectedMessage?.id === messageToTrash) {
        setSelectedMessage(null);
      }
      setConfirmTrashOpen(false);
      setMessageToTrash(null);
    } catch (err: any) {
      alert(err?.message || 'เกิดข้อผิดพลาดในการย้ายอีเมลลงถังขยะ');
    } finally {
      setIsTrashing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/75 backdrop-blur-xs">
      <div
        className={`w-full max-w-4xl h-[90vh] max-h-[780px] rounded-2xl flex flex-col overflow-hidden shadow-2xl border ${
          isDark ? 'bg-[#0F1117] border-[#252A3A] text-white' : 'bg-white border-[#E2E8F0] text-slate-900'
        }`}
      >
        {/* Modal Header */}
        <div
          className={`px-4 sm:px-6 py-4 border-b flex items-center justify-between shrink-0 ${
            isDark ? 'border-[#252A3A] bg-[#161922]' : 'border-[#E2E8F0] bg-slate-50'
          }`}
        >
          <div className="flex items-center space-x-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#EA4335]/15 border border-[#EA4335]/30 flex items-center justify-center text-[#EA4335] shrink-0">
              <Mail className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center space-x-2">
                <h2 className="font-bold text-base sm:text-lg tracking-tight truncate">
                  Gmail Integration Hub
                </h2>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#EA4335]/20 text-[#EA4335] border border-[#EA4335]/30">
                  Google Workspace
                </span>
              </div>
              <p className="text-xs text-[#9CA3AF] truncate">
                {profile?.emailAddress || userEmail || 'อ่านและส่งอีเมลแจ้งเตือนการเทรดผ่าน Gmail'}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            {hasToken && (
              <button
                type="button"
                onClick={() => loadProfileAndMessages()}
                disabled={isLoadingMessages}
                className={`p-2 rounded-lg border transition-colors ${
                  isDark
                    ? 'border-[#252A3A] text-[#9CA3AF] hover:text-white hover:bg-[#1F2330]'
                    : 'border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                }`}
                title="รีเฟรชข้อความ"
              >
                <RefreshCw className={`w-4 h-4 ${isLoadingMessages ? 'animate-spin text-[#7C6CFF]' : ''}`} />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className={`p-2 rounded-lg border transition-colors ${
                isDark
                  ? 'border-[#252A3A] text-[#9CA3AF] hover:text-white hover:bg-[#1F2330]'
                  : 'border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-100'
              }`}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Area */}
        {!hasToken ? (
          /* Needs Authorization screen */
          <div className="flex-1 p-6 sm:p-10 flex flex-col items-center justify-center text-center overflow-y-auto">
            <div className="w-16 h-16 rounded-2xl bg-[#EA4335]/15 border border-[#EA4335]/30 flex items-center justify-center text-[#EA4335] mb-4">
              <Mail className="w-8 h-8" />
            </div>

            <h3 className="text-lg sm:text-xl font-bold mb-2">
              เชื่อมต่อ Gmail เพื่อรับและส่งการแจ้งเตือนการเทรด
            </h3>
            <p className="text-sm text-[#9CA3AF] max-w-md mb-6 leading-relaxed">
              อนุญาตให้ Trading Engine Pro เข้าถึง Gmail เพื่ออ่านอีเมลการแจ้งเตือนจากโบรเกอร์ และส่งรายงานสรุปสัญญาณซื้อขายไปยังอีเมลของคุณด้วยสิทธิ์ที่ปลอดภัย
            </p>

            {authError && (
              <div className="max-w-md w-full mb-6 flex flex-col gap-2">
                <div className="p-3 rounded-xl bg-[#f9df7b]/10 border border-[#f9df7b]/30 text-[#f9df7b] text-xs text-left flex items-start space-x-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{authError}</span>
                </div>
                {authError.includes('กรุณาลองใหม่อีกครั้ง') && (
                  <button
                    type="button"
                    onClick={handleAuthorize}
                    className="px-3 py-1.5 bg-[#EA4335] text-white rounded-lg text-xs font-semibold w-max"
                  >
                    ลองเชื่อมต่อใหม่
                  </button>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={handleAuthorize}
              disabled={isAuthorizing}
              className="px-6 py-3 rounded-xl bg-[#EA4335] hover:bg-[#D93025] text-white font-bold text-sm shadow-md hover:shadow-lg transition-all flex items-center space-x-2 cursor-pointer disabled:opacity-50"
            >
              {isAuthorizing ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>กำลังเชื่อมต่อกับ Google...</span>
                </>
              ) : (
                <>
                  <Mail className="w-4 h-4" />
                  <span>เชื่อมต่อกับ Gmail (Google Account)</span>
                </>
              )}
            </button>

            <div className="mt-8 flex items-center space-x-2 text-xs text-[#6B7280]">
              <ShieldCheck className="w-4 h-4 text-[#22C55E]" />
              <span>ความปลอดภัยตามมาตรฐาน Google Workspace API • จัดเก็บโทเค็นในหน่วยความจำเท่านั้น</span>
            </div>
          </div>
        ) : (
          /* Authorized Dashboard */
          <div className="flex-1 flex flex-col min-h-0">
            {/* Sub-nav Tabs */}
            <div
              className={`px-4 sm:px-6 py-2 border-b flex items-center justify-between gap-2 shrink-0 ${
                isDark ? 'border-[#252A3A] bg-[#12151D]' : 'border-slate-200 bg-slate-100/70'
              }`}
            >
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('inbox');
                    setSelectedMessage(null);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 ${
                    activeTab === 'inbox'
                      ? isDark
                        ? 'bg-[#1F2330] text-white border border-[#7C6CFF]/40 shadow-xs'
                        : 'bg-white text-slate-900 border border-slate-300 shadow-xs'
                      : 'text-[#9CA3AF] hover:text-white'
                  }`}
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>กล่องจดหมาย & แจ้งเตือน</span>
                  {messages.length > 0 && (
                    <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-[#7C6CFF]/20 text-[#A5B4FC]">
                      {messages.length}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('compose')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 ${
                    activeTab === 'compose'
                      ? isDark
                        ? 'bg-[#1F2330] text-white border border-[#7C6CFF]/40 shadow-xs'
                        : 'bg-white text-slate-900 border border-slate-300 shadow-xs'
                      : 'text-[#9CA3AF] hover:text-white'
                  }`}
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>ส่งรายงานสัญญาณ (Send Report)</span>
                </button>
              </div>

              {profile && (
                <div className="text-[11px] text-[#9CA3AF] hidden sm:block truncate">
                  รวม {profile.messagesTotal.toLocaleString()} ข้อความใน Gmail
                </div>
              )}
            </div>

            {/* Tab 1: Inbox */}
            {activeTab === 'inbox' && (
              <div className="flex-1 flex flex-col sm:flex-row min-h-0">
                {/* Left Panel: List */}
                <div
                  className={`w-full ${
                    selectedMessage ? 'hidden sm:flex sm:w-2/5' : 'flex'
                  } flex-col border-r shrink-0 min-h-0 ${isDark ? 'border-[#252A3A]' : 'border-slate-200'}`}
                >
                  {/* Search and Filters */}
                  <div className="p-3 border-b border-[#252A3A] space-y-2">
                    <div className="relative">
                      <Search className="w-4 h-4 absolute left-3 top-2.5 text-[#6B7280]" />
                      <input
                        type="text"
                        placeholder="ค้นหาอีเมลใน Gmail..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') loadProfileAndMessages(searchQuery);
                        }}
                        className={`w-full pl-9 pr-3 py-1.5 rounded-xl text-xs border focus:outline-hidden focus:border-[#7C6CFF] ${
                          isDark
                            ? 'bg-[#1A1D29] border-[#252A3A] text-white placeholder-[#6B7280]'
                            : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400'
                        }`}
                      />
                    </div>

                    <div className="flex items-center space-x-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setFilterType('trading');
                          loadProfileAndMessages(undefined, 'trading');
                        }}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all ${
                          filterType === 'trading'
                            ? 'bg-[#7C6CFF]/20 text-[#A5B4FC] border-[#7C6CFF]/40'
                            : isDark
                            ? 'border-[#252A3A] text-[#9CA3AF] hover:text-white'
                            : 'border-slate-200 text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Trading & Alerts
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setFilterType('unread');
                          loadProfileAndMessages(undefined, 'unread');
                        }}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all ${
                          filterType === 'unread'
                            ? 'bg-[#7C6CFF]/20 text-[#A5B4FC] border-[#7C6CFF]/40'
                            : isDark
                            ? 'border-[#252A3A] text-[#9CA3AF] hover:text-white'
                            : 'border-slate-200 text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        ยังไม่อ่าน
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setFilterType('all');
                          loadProfileAndMessages(undefined, 'all');
                        }}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all ${
                          filterType === 'all'
                            ? 'bg-[#7C6CFF]/20 text-[#A5B4FC] border-[#7C6CFF]/40'
                            : isDark
                            ? 'border-[#252A3A] text-[#9CA3AF] hover:text-white'
                            : 'border-slate-200 text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        ทั้งหมด
                      </button>
                    </div>
                  </div>

                  {/* Message List */}
                  <div className="flex-1 overflow-y-auto divide-y divide-[#252A3A]">
                    {isLoadingMessages ? (
                      <div className="p-8 text-center text-xs text-[#9CA3AF] space-y-2">
                        <div className="w-5 h-5 border-2 border-[#7C6CFF] border-t-transparent rounded-full animate-spin mx-auto" />
                        <p>กำลังโหลดอีเมลจาก Gmail...</p>
                      </div>
                    ) : messagesError ? (
                      <div className="p-6 text-center text-xs text-[#f9df7b] space-y-2">
                        <p>{messagesError}</p>
                        <button
                          type="button"
                          onClick={() => loadProfileAndMessages()}
                          className="px-3 py-1 bg-[#f9df7b]/20 text-[#f9df7b] rounded-lg text-xs"
                        >
                          ลองใหม่อีกครั้ง
                        </button>
                      </div>
                    ) : messages.length === 0 ? (
                      <div className="p-8 text-center text-xs text-[#9CA3AF] space-y-2">
                        <Mail className="w-8 h-8 mx-auto text-[#6B7280]" />
                        <p>ไม่พบข้อความตามเงื่อนไขที่เลือก</p>
                      </div>
                    ) : (
                      messages.map((m) => (
                        <div
                          key={m.id}
                          onClick={() => handleOpenMessage(m)}
                          className={`p-3 text-left transition-colors cursor-pointer group ${
                            selectedMessage?.id === m.id
                              ? isDark
                                ? 'bg-[#1E2230]'
                                : 'bg-slate-100'
                              : isDark
                              ? 'hover:bg-[#161922]'
                              : 'hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span
                              className={`text-xs font-semibold truncate ${
                                m.isUnread ? 'text-white font-bold' : 'text-[#9CA3AF]'
                              }`}
                            >
                              {m.from.split('<')[0].replace(/"/g, '') || m.from}
                            </span>
                            <span className="text-[10px] text-[#6B7280] shrink-0 ml-2">
                              {m.date ? new Date(m.date).toLocaleDateString('th-TH') : ''}
                            </span>
                          </div>
                          <p
                            className={`text-xs leading-snug line-clamp-1 mb-1 ${
                              m.isUnread ? 'text-[#A5B4FC] font-semibold' : 'text-slate-200'
                            }`}
                          >
                            {m.subject}
                          </p>
                          <p className="text-[11px] text-[#6B7280] line-clamp-1">{m.snippet}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Right Panel: Detail */}
                <div className={`flex-1 ${!selectedMessage ? 'hidden sm:flex' : 'flex'} flex-col min-h-0`}>
                  {isLoadingDetail ? (
                    <div className="flex-1 flex items-center justify-center">
                      <div className="text-center space-y-2 text-xs text-[#9CA3AF]">
                        <div className="w-6 h-6 border-2 border-[#7C6CFF] border-t-transparent rounded-full animate-spin mx-auto" />
                        <p>กำลังเปิดเนื้อหาอีเมล...</p>
                      </div>
                    </div>
                  ) : selectedMessage ? (
                    <div className="flex-1 flex flex-col min-h-0">
                      {/* Email Header Bar */}
                      <div className="p-4 border-b border-[#252A3A] flex items-center justify-between shrink-0">
                        <button
                          type="button"
                          onClick={() => setSelectedMessage(null)}
                          className="sm:hidden p-1.5 rounded-lg border border-[#252A3A] text-xs flex items-center space-x-1"
                        >
                          <ChevronLeft className="w-4 h-4" />
                          <span>ย้อนกลับ</span>
                        </button>

                        <div className="flex items-center space-x-2 ml-auto">
                          <button
                            type="button"
                            onClick={() => handleInitiateTrash(selectedMessage.id)}
                            className="px-2.5 py-1.5 rounded-lg border border-[#f9df7b]/40 text-[#f9df7b] hover:bg-[#f9df7b]/10 text-xs font-semibold flex items-center space-x-1.5 transition-colors"
                            title="ย้ายลงถังขยะ"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>ลบอีเมล</span>
                          </button>
                        </div>
                      </div>

                      {/* Email Meta */}
                      <div className="p-4 sm:p-6 border-b border-[#252A3A] shrink-0 space-y-2 bg-[#12151D]/50">
                        <h3 className="text-base sm:text-lg font-bold text-white leading-snug">
                          {selectedMessage.subject}
                        </h3>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs text-[#9CA3AF] gap-1">
                          <div>
                            <span className="text-[#6B7280]">จาก: </span>
                            <span className="text-white font-medium">{selectedMessage.from}</span>
                          </div>
                          <div>
                            <span className="text-[#6B7280]">ส่งเมื่อ: </span>
                            <span>{selectedMessage.date}</span>
                          </div>
                        </div>
                      </div>

                      {/* Email Body */}
                      <div className="flex-1 p-4 sm:p-6 overflow-y-auto text-sm leading-relaxed text-slate-200">
                        {selectedMessage.bodyHtml ? (
                          <div
                            className="gmail-body-preview max-w-none text-xs sm:text-sm prose prose-invert overflow-x-auto"
                            dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(selectedMessage.bodyHtml) }}
                          />
                        ) : (
                          <pre className="whitespace-pre-wrap font-sans text-xs sm:text-sm">
                            {selectedMessage.bodyText}
                          </pre>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-[#6B7280]">
                      <Mail className="w-12 h-12 mb-3 stroke-1 text-[#3E455B]" />
                      <p className="text-sm font-semibold text-[#9CA3AF]">เลือกอีเมลเพื่อดูรายละเอียด</p>
                      <p className="text-xs text-[#6B7280] mt-1 max-w-xs">
                        ตรวจสอบรายงานการส่งคำสั่งซื้อขายหรือข้อความเตือนจากโบรเกอร์และระบบของคุณ
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Tab 2: Compose / Send Trading Report */}
            {activeTab === 'compose' && (
              <div className="flex-1 p-4 sm:p-6 overflow-y-auto">
                <form onSubmit={handleInitiateSend} className="max-w-2xl mx-auto space-y-4">
                  <div>
                    <h3 className="text-base font-bold mb-1">ส่งรายงานสัญญาณการเทรดผ่าน Gmail</h3>
                    <p className="text-xs text-[#9CA3AF]">
                      ส่งสรุปสัญญาณแบบเรียลไทม์ (ราคา, SL/TP, โมเมนตัม) จากบัญชี Gmail ของคุณ
                    </p>
                  </div>

                  {sendSuccess && (
                    <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center space-x-2">
                      <CheckCircle className="w-4 h-4 shrink-0" />
                      <span>{sendSuccess}</span>
                    </div>
                  )}

                  {sendError && (
                    <div className="p-3.5 rounded-xl bg-[#f9df7b]/15 border border-[#f9df7b]/30 text-[#f9df7b] text-xs flex items-center space-x-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{sendError}</span>
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-[#9CA3AF]">ส่งถึง (Recipient Email)</label>
                    <input
                      type="email"
                      required
                      value={recipient}
                      onChange={(e) => setRecipient(e.target.value)}
                      placeholder="ตัวอย่างเช่น: yourname@gmail.com"
                      className={`w-full px-3 py-2 rounded-xl text-xs border focus:outline-hidden focus:border-[#7C6CFF] ${
                        isDark
                          ? 'bg-[#1A1D29] border-[#252A3A] text-white'
                          : 'bg-white border-slate-200 text-slate-900'
                      }`}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-[#9CA3AF]">หัวเรื่อง (Subject)</label>
                    <input
                      type="text"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="เช่น: [Trading Alert] รายงานสัญญาณประจำวัน"
                      className={`w-full px-3 py-2 rounded-xl text-xs border focus:outline-hidden focus:border-[#7C6CFF] ${
                        isDark
                          ? 'bg-[#1A1D29] border-[#252A3A] text-white'
                          : 'bg-white border-slate-200 text-slate-900'
                      }`}
                    />
                  </div>

                  {/* Toggle Include Report */}
                  <div className="p-3 rounded-xl bg-[#161922] border border-[#252A3A] flex items-center justify-between">
                    <div>
                      <span className="text-xs font-semibold text-white block">แนบรายงานสัญญาณอัตโนมัติ</span>
                      <span className="text-[11px] text-[#9CA3AF]">
                        แนบตาราง Top Signals พร้อมราคา, จุด Stop Loss, Take Profit และโมเมนตัม
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={includeSignalReport}
                      onChange={(e) => setIncludeSignalReport(e.target.checked)}
                      className="w-4 h-4 accent-[#7C6CFF]"
                    />
                  </div>

                  {includeSignalReport ? (
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-[#9CA3AF]">ข้อความ / โน้ตเพิ่มเติม (Optional)</label>
                      <textarea
                        rows={3}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="เช่น: ให้ระมัดระวังคู่เงิน EUR/USD วันนี้มีแถลงการณ์ตัวเลขเงินเฟ้อ..."
                        className={`w-full px-3 py-2 rounded-xl text-xs border focus:outline-hidden focus:border-[#7C6CFF] ${
                          isDark
                            ? 'bg-[#1A1D29] border-[#252A3A] text-white'
                            : 'bg-white border-slate-200 text-slate-900'
                        }`}
                      />
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-[#9CA3AF]">เนื้อหาอีเมล (Email Body)</label>
                      <textarea
                        rows={6}
                        required
                        value={customBody}
                        onChange={(e) => setCustomBody(e.target.value)}
                        placeholder="พิมพ์เนื้อหาที่ต้องการส่ง..."
                        className={`w-full px-3 py-2 rounded-xl text-xs border focus:outline-hidden focus:border-[#7C6CFF] ${
                          isDark
                            ? 'bg-[#1A1D29] border-[#252A3A] text-white'
                            : 'bg-white border-slate-200 text-slate-900'
                        }`}
                      />
                    </div>
                  )}

                  <div className="pt-2 flex items-center justify-end space-x-3">
                    <button
                      type="button"
                      onClick={() => setActiveTab('inbox')}
                      className="px-4 py-2 rounded-xl border border-[#252A3A] text-xs text-[#9CA3AF] hover:text-white"
                    >
                      ยกเลิก
                    </button>
                    <button
                      type="submit"
                      disabled={isSending}
                      className="px-5 py-2.5 rounded-xl bg-[#7C6CFF] hover:bg-[#6A5AE0] text-white font-bold text-xs flex items-center space-x-2 shadow-md cursor-pointer disabled:opacity-50"
                    >
                      <Send className="w-4 h-4" />
                      <span>ส่งอีเมลผ่าน Gmail</span>
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        )}

        {/* Confirmation Modal for Sending Email (MANDATORY per Workspace Integration rules) */}
        {confirmSendOpen && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80">
            <div className="w-full max-w-md rounded-2xl bg-[#1A1D29] border border-[#252A3A] p-5 shadow-2xl space-y-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-[#7C6CFF]/20 border border-[#7C6CFF]/40 flex items-center justify-center text-[#A5B4FC]">
                  <Send className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-white">ยืนยันการส่งอีเมลผ่าน Gmail</h4>
                  <p className="text-xs text-[#9CA3AF]">การส่งอีเมลจะดำเนินการในนามบัญชี Google ของคุณ</p>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-[#0F1117] border border-[#252A3A] text-xs space-y-1.5">
                <div>
                  <span className="text-[#6B7280]">ผู้รับ: </span>
                  <span className="text-white font-semibold">{recipient}</span>
                </div>
                <div>
                  <span className="text-[#6B7280]">หัวเรื่อง: </span>
                  <span className="text-white font-semibold">
                    {subject.trim() || '[Trading Engine Pro] รายงานสรุปสัญญาณการเทรด'}
                  </span>
                </div>
                <div>
                  <span className="text-[#6B7280]">ประเภทข้อมูล: </span>
                  <span className="text-[#A5B4FC]">
                    {includeSignalReport ? 'รายงานสัญญาณและระดับราคาอัตโนมัติ' : 'ข้อความกำหนดเอง'}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmSendOpen(false)}
                  className="px-4 py-2 rounded-xl border border-[#252A3A] text-xs text-[#9CA3AF] hover:text-white"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={handleExecuteSend}
                  disabled={isSending}
                  className="px-4 py-2 rounded-xl bg-[#7C6CFF] hover:bg-[#6A5AE0] text-white text-xs font-bold flex items-center space-x-1.5"
                >
                  {isSending ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>กำลังส่ง...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      <span>ยืนยันส่งอีเมล</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Confirmation Modal for Trashing Email (MANDATORY per Workspace Integration rules) */}
        {confirmTrashOpen && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80">
            <div className="w-full max-w-md rounded-2xl bg-[#1A1D29] border border-[#f9df7b]/30 p-5 shadow-2xl space-y-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-[#f9df7b]/20 border border-[#f9df7b]/40 flex items-center justify-center text-[#f9df7b]">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-white">ยืนยันการลบอีเมล</h4>
                  <p className="text-xs text-[#9CA3AF]">ย้ายข้อความนี้ลงในถังขยะของ Gmail (Trash)</p>
                </div>
              </div>

              <p className="text-xs text-[#9CA3AF] leading-relaxed">
                คุณแน่ใจหรือไม่ว่าต้องการย้ายอีเมลนี้ไปยังถังขยะ? ข้อความจะถูกนำออกจากกล่องจดหมายหลักของคุณ
              </p>

              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setConfirmTrashOpen(false);
                    setMessageToTrash(null);
                  }}
                  className="px-4 py-2 rounded-xl border border-[#252A3A] text-xs text-[#9CA3AF] hover:text-white"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={handleExecuteTrash}
                  disabled={isTrashing}
                  className="px-4 py-2 rounded-xl bg-[#f9df7b] hover:bg-[#f9df7b] text-black text-xs font-bold flex items-center space-x-1.5"
                >
                  {isTrashing ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>กำลังลบ...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>ยืนยันลบอีเมล</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
