import React, { useState, useEffect, useMemo } from 'react';
import {
  X, Calendar as CalendarIcon, RefreshCw, Plus, ShieldCheck,
  MapPin, Video, ExternalLink, LogOut, BookOpen, ChevronDown,
} from 'lucide-react';
import {
  fetchCalendarEvents, createCalendarEvent, upcomingWindow, CalendarEventItem,
} from '../services/calendarService';
import { clearCachedAccessToken } from '../services/gmailService';
import { useModalA11y } from '../hooks/useModalA11y';

interface CalendarModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDark?: boolean;
  userEmail?: string | null;
}

type Tab = 'events' | 'create' | 'guide';
type RangeDays = 7 | 14 | 30;

function fmtDay(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return iso;
  }
}

function fmtTime(iso?: string): string {
  if (!iso) return 'ทั้งวัน';
  try {
    return new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

function dayKey(e: CalendarEventItem): string {
  const raw = e.start?.dateTime || e.start?.date || '';
  return raw.slice(0, 10);
}

function defaultFormValues(): { summary: string; startLocal: string; endLocal: string; location: string; description: string } {
  const pad = (n: number) => String(n).padStart(2, '0');
  const toLocal = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const start = new Date();
  start.setHours(start.getHours() + 1, 0, 0, 0);
  const end = new Date(start);
  end.setHours(end.getHours() + 1);
  return { summary: '', startLocal: toLocal(start), endLocal: toLocal(end), location: '', description: '' };
}

export const CalendarModal: React.FC<CalendarModalProps> = ({ isOpen, onClose, isDark = true, userEmail = null }) => {
  const [tab, setTab] = useState<Tab>('events');
  const [events, setEvents] = useState<CalendarEventItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rangeDays, setRangeDays] = useState<RangeDays>(14);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [form, setForm] = useState(defaultFormValues);
  const [isCreating, setIsCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const loadEvents = async (days: RangeDays = rangeDays) => {
    setIsLoading(true);
    setError(null);
    try {
      const { timeMin, timeMax } = upcomingWindow(days);
      const data = await fetchCalendarEvents(50, timeMin, timeMax);
      setEvents(data.items || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'ไม่สามารถโหลดกิจกรรมได้');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setTab('events');
      setCreateMsg(null);
      loadEvents();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const grouped = useMemo(() => {
    const map = new Map<string, CalendarEventItem[]>();
    for (const e of events) {
      const k = dayKey(e);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(e);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [events]);

  const handleRangeChange = (days: RangeDays) => {
    setRangeDays(days);
    loadEvents(days);
  };

  const handleDisconnect = () => {
    clearCachedAccessToken();
    setEvents([]);
    setError('ตัดการเชื่อมต่อโทเค็นแล้ว — กดรีเฟรชเพื่อเชื่อมต่อใหม่ผ่าน Google');
  };

  const handleCreate = async () => {
    setIsCreating(true);
    setCreateMsg(null);
    try {
      const created = await createCalendarEvent(form);
      setCreateMsg({ ok: true, text: `สร้าง “${created.summary || form.summary}” สำเร็จ` });
      setForm(defaultFormValues());
      setTab('events');
      loadEvents();
    } catch (err: unknown) {
      setCreateMsg({ ok: false, text: err instanceof Error ? err.message : 'สร้างกิจกรรมไม่สำเร็จ' });
    } finally {
      setIsCreating(false);
    }
  };

  const dialogRef = useModalA11y({ onClose, enabled: isOpen });
  if (!isOpen) return null;

  const tabBtn = (id: Tab, label: string, icon: React.ReactNode) => (
    <button
      key={id}
      onClick={() => setTab(id)}
      className={`flex-1 min-w-0 py-2 px-2 text-[11px] sm:text-xs font-semibold rounded-xl transition-all inline-flex items-center justify-center gap-1 ${
        tab === id ? 'bg-[#7C6CFF] text-[#0F1117] shadow' : 'text-[#A7A4B8] hover:text-white'
      }`}
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  );

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="ปฏิทินกิจกรรม Google Calendar"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6 bg-black/75 backdrop-blur-xs overflow-y-auto"
    >
      <div className={`w-full sm:max-w-2xl rounded-t-2xl sm:rounded-2xl flex flex-col overflow-hidden border-t sm:border max-h-[92vh] sm:my-8 ${isDark ? 'bg-[#0F1117] text-white border-white/[0.07]' : 'bg-white text-[#0F1117] border-white/[0.07]'}`}>
        {/* Header + connection status */}
        <div className="flex justify-between items-center px-5 py-4 border-b border-white/[0.07]/60">
          <h2 className="font-bold flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-[#4CC9F0]" />
            Google Calendar
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-[#7EE0B5]/15 border border-[#7EE0B5]/40 text-[#7EE0B5]">● เชื่อมผ่าน SSO</span>
          </h2>
          <button onClick={onClose} className="text-[#A7A4B8] hover:text-white p-1" aria-label="ปิดปฏิทิน">
            <X className="w-5 h-5" />
          </button>
        </div>
        {userEmail && (
          <p className="px-5 pt-2 text-[11px] text-[#A7A4B8]">บัญชี: <strong className="text-white">{userEmail}</strong></p>
        )}

        {/* Tabs */}
        <div className="flex items-center gap-1.5 bg-[#0F1117] p-1.5 mx-4 mt-3 rounded-xl border border-white/[0.07]">
          {tabBtn('events', 'กิจกรรม', <CalendarIcon className="w-3.5 h-3.5 shrink-0" />)}
          {tabBtn('create', 'สร้างใหม่', <Plus className="w-3.5 h-3.5 shrink-0" />)}
          {tabBtn('guide', 'คู่มือ & ปลอดภัย', <BookOpen className="w-3.5 h-3.5 shrink-0" />)}
        </div>

        <div className="p-4 sm:p-5 overflow-y-auto max-h-[60vh]">
          {error && (
            <div className="flex flex-col gap-2 mb-3">
              <div className="text-[#FFB86B] bg-[#FFB86B]/10 border border-[#FFB86B]/30 rounded-lg px-3 py-2 text-sm">
                {error}
              </div>
              {error.includes('กรุณาลองใหม่อีกครั้ง') && (
                <button
                  onClick={() => loadEvents()}
                  className="px-3 py-1.5 bg-[#7C6CFF] text-[#0F1117] rounded-lg text-xs font-semibold w-max"
                >
                  ลองเชื่อมต่อใหม่
                </button>
              )}
            </div>
          )}

          {/* ===== Tab: events ===== */}
          {tab === 'events' && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  {([7, 14, 30] as RangeDays[]).map((d) => (
                    <button
                      key={d}
                      onClick={() => handleRangeChange(d)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                        rangeDays === d ? 'bg-[#4CC9F0]/20 border-[#4CC9F0]/50 text-[#4CC9F0]' : 'border-white/[0.07] text-[#A7A4B8] hover:text-white'
                      }`}
                    >
                      {d} วัน
                    </button>
                  ))}
                </div>
                <button onClick={() => loadEvents()} disabled={isLoading} className="px-3 py-1.5 bg-[#7C6CFF] hover:bg-[#7C6CFF]/90 disabled:opacity-50 rounded-lg text-[#0F1117] text-xs font-semibold inline-flex items-center gap-1.5">
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                  <span>{isLoading ? 'กำลังโหลด...' : 'รีเฟรช'}</span>
                </button>
              </div>

              {!isLoading && events.length === 0 && !error && (
                <div className="text-center py-10 space-y-2">
                  <p className="text-sm text-[#A7A4B8]">ไม่มีกิจกรรมในช่วง {rangeDays} วัน — ปฏิทินว่าง</p>
                  <button onClick={() => setTab('create')} className="text-xs text-[#4CC9F0] hover:underline inline-flex items-center gap-1">
                    <Plus className="w-3.5 h-3.5" /> สร้างกิจกรรมแรก
                  </button>
                </div>
              )}

              {grouped.map(([day, list]) => (
                <div key={day} className="space-y-2">
                  <p className="text-xs font-bold text-[#4CC9F0] pt-1">{fmtDay(list[0]?.start?.dateTime || list[0]?.start?.date || day)}</p>
                  {list.map((e) => {
                    const expanded = expandedId === e.id;
                    return (
                      <div key={e.id} className="p-3 bg-[#141725] rounded-xl border border-white/[0.07] hover:border-[#4CC9F0]/50 transition-colors">
                        <button onClick={() => setExpandedId(expanded ? null : e.id ?? null)} className="w-full text-left flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-bold text-sm truncate">{e.summary || '(ไม่มีชื่อ)'}</p>
                            <p className="text-xs text-[#A7A4B8] mt-0.5">
                              {fmtTime(e.start?.dateTime || e.start?.date)} → {fmtTime(e.end?.dateTime || e.end?.date)}
                            </p>
                          </div>
                          <ChevronDown className={`w-4 h-4 shrink-0 text-[#A7A4B8] transition-transform ${expanded ? 'rotate-180' : ''}`} />
                        </button>
                        {expanded && (
                          <div className="mt-2 pt-2 border-t border-white/[0.07]/60 space-y-1.5 text-xs text-[#ECEAF4]">
                            {e.location && (
                              <p className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-[#FFB86B]" />{e.location}</p>
                            )}
                            {e.description && <p className="leading-relaxed whitespace-pre-wrap">{e.description.slice(0, 500)}</p>}
                            <div className="flex flex-wrap gap-2 pt-1">
                              {e.hangoutLink && (
                                <a href={e.hangoutLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[#7EE0B5] hover:underline">
                                  <Video className="w-3.5 h-3.5" /> เข้าร่วม Meet
                                </a>
                              )}
                              {e.htmlLink && (
                                <a href={e.htmlLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[#4CC9F0] hover:underline">
                                  <ExternalLink className="w-3.5 h-3.5" /> เปิดใน Google Calendar
                                </a>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}

          {/* ===== Tab: create ===== */}
          {tab === 'create' && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-[#A7A4B8] mb-1">ชื่องาน *</label>
                <input value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} placeholder="เช่น ประชุมกลยุทธ์เทรด BTC" maxLength={120}
                  className="w-full bg-[#141725] border border-white/[0.07] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#7C6CFF]" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[#A7A4B8] mb-1">เริ่ม *</label>
                  <input type="datetime-local" value={form.startLocal} onChange={(e) => setForm({ ...form, startLocal: e.target.value })}
                    className="w-full bg-[#141725] border border-white/[0.07] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#7C6CFF]" />
                </div>
                <div>
                  <label className="block text-xs text-[#A7A4B8] mb-1">สิ้นสุด *</label>
                  <input type="datetime-local" value={form.endLocal} onChange={(e) => setForm({ ...form, endLocal: e.target.value })}
                    className="w-full bg-[#141725] border border-white/[0.07] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#7C6CFF]" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-[#A7A4B8] mb-1">สถานที่ (ถ้ามี)</label>
                <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="ห้องประชุม / ลิงก์ Meet" maxLength={200}
                  className="w-full bg-[#141725] border border-white/[0.07] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#7C6CFF]" />
              </div>
              <div>
                <label className="block text-xs text-[#A7A4B8] mb-1">รายละเอียด</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} maxLength={1000} placeholder="วาระ เตรียมกราฟ/สัญญาณที่ต้องดู..."
                  className="w-full bg-[#141725] border border-white/[0.07] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#7C6CFF] resize-none" />
              </div>
              {createMsg && (
                <div className={`rounded-lg px-3 py-2 text-xs border ${createMsg.ok ? 'text-[#7EE0B5] bg-[#7EE0B5]/10 border-[#7EE0B5]/30' : 'text-[#FFB86B] bg-[#FFB86B]/10 border-[#FFB86B]/30'}`}>
                  {createMsg.text}
                </div>
              )}
              <button onClick={handleCreate} disabled={isCreating || !form.summary.trim()} className="w-full py-2.5 bg-[#7C6CFF] hover:bg-[#7C6CFF]/90 disabled:opacity-50 rounded-xl text-[#0F1117] text-sm font-bold inline-flex items-center justify-center gap-2">
                <Plus className="w-4 h-4" />
                <span>{isCreating ? 'กำลังสร้าง...' : 'สร้างกิจกรรมในปฏิทินหลัก'}</span>
              </button>
              <p className="text-[11px] text-[#A7A4B8]">สร้างลงปฏิทินหลัก (primary) ของบัญชีที่ล็อกอินเท่านั้น</p>
            </div>
          )}

          {/* ===== Tab: guide & security ===== */}
          {tab === 'guide' && (
            <div className="space-y-3 text-xs leading-relaxed">
              <div className="rounded-xl bg-[#7EE0B5]/10 border border-[#7EE0B5]/30 p-3 flex gap-2">
                <ShieldCheck className="w-4 h-4 text-[#7EE0B5] shrink-0 mt-0.5" />
                <div className="text-[#ECEAF4]">
                  <p className="font-bold text-[#7EE0B5] mb-1">ปลอดภัยโดยออกแบบ</p>
                  <ul className="list-disc list-inside space-y-0.5">
                    <li>ขอสิทธิ์แค่ 3 อย่าง: ดูปฏิทิน + ดูกิจกรรม + สร้างกิจกรรม (ไม่มีสิทธิ์ลบทั้งปฏิทิน/จัดการสิทธิ์แชร์)</li>
                    <li>โทเค็นเก็บในหน่วยความจำเท่านั้น ไม่ลง localStorage — ปิดแท็บคือหาย</li>
                    <li>แอปไม่เคยเห็นรหัสผ่าน Google ของคุณ (ยืนยันผ่านหน้าของ Google โดยตรง)</li>
                  </ul>
                </div>
              </div>

              <div className="rounded-xl bg-[#141725] border border-white/[0.07] p-3">
                <p className="font-bold text-white mb-1.5">วิธีเชื่อมต่อ (ครั้งแรก)</p>
                <ol className="list-decimal list-inside space-y-1 text-[#ECEAF4]">
                  <li>กดปุ่ม <strong>รีเฟรช</strong> ในแท็บกิจกรรม — ถ้าโทเค็นหมดอายุจะมีหน้าต่าง Google เด้งให้กดยินยอม</li>
                  <li>เลือกบัญชีเดียวกับที่ล็อกอินแอป แล้วติ๊กยินยอมสิทธิ์ Calendar</li>
                  <li>กลับมาหน้านี้ กิจกรรม 14 วันข้างหน้าจะโหลดอัตโนมัติ</li>
                </ol>
              </div>

              <div className="rounded-xl bg-[#141725] border border-white/[0.07] p-3">
                <p className="font-bold text-white mb-1.5">ถอนสิทธิ์เมื่อไหร่ก็ได้</p>
                <ul className="list-disc list-inside space-y-1 text-[#ECEAF4]">
                  <li>ในแอป: กด <strong>ตัดการเชื่อมต่อ</strong> ด้านล่าง — โทเค็นในหน่วยความจำถูกลบทันที</li>
                  <li>ใน Google: เปิด <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer" className="text-[#4CC9F0] hover:underline">myaccount.google.com/permissions</a> → เลือกแอป → Remove Access</li>
                </ul>
              </div>

              <div className="rounded-xl bg-[#141725] border border-white/[0.07] p-3">
                <p className="font-bold text-white mb-1.5">แก้ปัญหาเบื้องต้น</p>
                <ul className="list-disc list-inside space-y-1 text-[#ECEAF4]">
                  <li><strong>401 / ให้เชื่อมต่อใหม่:</strong> โทเค็นหมดอายุ — กดรีเฟรชแล้วยินยอมใหม่</li>
                  <li><strong>403 สิทธิ์ไม่พอ:</strong> เคยกดยินยอมแบบไม่ครบ scope — ตัดการเชื่อมต่อแล้วเชื่อมใหม่แบบติ๊กครบ</li>
                  <li><strong>ไม่เจอกิจกรรม:</strong> ลองขยายช่วงเป็น 30 วัน หรือเช็คว่างานอยู่ในปฏิทินหลัก (primary)</li>
                </ul>
              </div>

              <button onClick={handleDisconnect} className="w-full py-2 rounded-xl border border-[#FFB86B]/40 text-[#FFB86B] hover:bg-[#FFB86B]/10 text-xs font-bold inline-flex items-center justify-center gap-2">
                <LogOut className="w-4 h-4" />
                <span>ตัดการเชื่อมต่อโทเค็น Google ในแอปนี้</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
