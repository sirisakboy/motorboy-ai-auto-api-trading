import { getCachedAccessToken, requestGmailAccessToken, clearCachedAccessToken } from './gmailService';

export interface CalendarEventItem {
  id?: string;
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  hangoutLink?: string;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
}

export interface CreateEventInput {
  summary: string;
  description?: string;
  location?: string;
  /** Local datetime string from <input type="datetime-local"> */
  startLocal: string;
  endLocal: string;
}

async function ensureToken(): Promise<string> {
  const cached = getCachedAccessToken();
  if (cached) return cached;
  return requestGmailAccessToken();
}

export const requestCalendarAccessToken = async (): Promise<string> => {
  return ensureToken();
};

export const fetchCalendarEvents = async (
  maxResults = 20,
  timeMin?: string,
  timeMax?: string
): Promise<{ items: CalendarEventItem[] }> => {
  const token = await ensureToken();

  const params = new URLSearchParams({
    maxResults: String(maxResults),
    singleEvents: 'true',
    orderBy: 'startTime',
    timeMin: timeMin ?? new Date().toISOString(),
  });
  if (timeMax) params.set('timeMax', timeMax);

  const doFetch = async (t: string) =>
    fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`, {
      headers: { Authorization: `Bearer ${t}` },
    });

  let res = await doFetch(token);
  if (res.status === 401) {
    clearCachedAccessToken();
    const fresh = await requestGmailAccessToken();
    res = await doFetch(fresh);
  }
  if (!res.ok) throw new Error('โหลดกิจกรรม Calendar ไม่สำเร็จ');
  return res.json();
};

/** Build a day-range window (default next 14 days). */
export function upcomingWindow(days = 14): { timeMin: string; timeMax: string } {
  const start = new Date();
  const end = new Date();
  end.setDate(end.getDate() + days);
  return { timeMin: start.toISOString(), timeMax: end.toISOString() };
}

/**
 * Create an event on the primary calendar.
 * Requires the `calendar.events` scope (granted at Google SSO consent).
 */
export const createCalendarEvent = async (input: CreateEventInput): Promise<CalendarEventItem> => {
  const summary = input.summary.trim();
  if (!summary) throw new Error('กรุณากรอกชื่อกิจกรรม');
  const start = new Date(input.startLocal);
  const end = new Date(input.endLocal);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) throw new Error('วันเวลาไม่ถูกต้อง');
  if (end <= start) throw new Error('เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม');

  const body = {
    summary,
    description: input.description?.trim() || undefined,
    location: input.location?.trim() || undefined,
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
  };

  const doPost = async (t: string) =>
    fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  let res = await doPost(await ensureToken());
  if (res.status === 401) {
    clearCachedAccessToken();
    res = await doPost(await requestGmailAccessToken());
  }
  if (res.status === 403) throw new Error('สิทธิ์ไม่พอ (403) — กรุณากดเชื่อมต่อใหม่แล้วยอมรับสิทธิ์ Calendar');
  if (!res.ok) throw new Error('สร้างกิจกรรมไม่สำเร็จ');
  return res.json();
};
