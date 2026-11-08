import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { auth, workspaceGoogleProvider, GMAIL_SCOPES } from '../firebase';
import { TradingSignal } from '../types';

export { GMAIL_SCOPES };

export interface GmailProfile {
  emailAddress: string;
  messagesTotal: number;
  threadsTotal: number;
  historyId: string;
}

export interface GmailMessageHeader {
  name: string;
  value: string;
}

export interface GmailMessageSummary {
  id: string;
  threadId: string;
  snippet: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  internalDate: string;
  isUnread: boolean;
  isStarred: boolean;
  labelIds: string[];
}

export interface GmailMessageDetail extends GmailMessageSummary {
  bodyText: string;
  bodyHtml: string;
}

export interface SendEmailParams {
  to: string;
  subject: string;
  bodyHtml: string;
  bodyText?: string;
}

/**
 * In-memory storage for Google OAuth Access Token.
 * Per Workspace security requirements, NEVER store access tokens in localStorage or sessionStorage.
 */
let cachedAccessToken: string | null = null;

export function setCachedAccessToken(token: string | null) {
  cachedAccessToken = token;
}

export function getCachedAccessToken(): string | null {
  return cachedAccessToken;
}

export function clearCachedAccessToken() {
  cachedAccessToken = null;
}

/**
 * Prompt user with Google popup to obtain a fresh access token with Gmail scopes
 */
let isPopupOpen = false;
export async function requestGmailAccessToken(): Promise<string> {
  if (isPopupOpen) {
    throw new Error('หน้าต่างเข้าสู่ระบบกำลังเปิดอยู่ กรุณารอสักครู่');
  }
  isPopupOpen = true;
  try {
    const result = await signInWithPopup(auth, workspaceGoogleProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('ไม่สามารถรับ Access Token จากการเข้าสู่ระบบ Google ได้');
    }
    cachedAccessToken = credential.accessToken;
    return credential.accessToken;
  } catch (error: any) {
    if (error?.code === 'auth/popup-closed-by-user' || error?.code === 'auth/cancelled-popup-request') {
      console.info('User cancelled the Google popup.');
      throw new Error('หน้าต่างยืนยันตัวตนถูกปิด');
    } else if (error?.code === 'auth/popup-blocked') {
      console.warn('Popup blocked by browser.');
      throw new Error('เบราว์เซอร์บล็อกหน้าต่างป๊อปอัป กรุณาอนุญาตให้ป๊อปอัปทำงานสำหรับเว็บไซต์นี้');
    }
    console.error('Failed to obtain Gmail access token:', error);
    throw error;
  } finally {
    isPopupOpen = false;
  }
}

/**
 * Helper to ensure a valid access token is available.
 */
async function ensureToken(): Promise<string> {
  if (cachedAccessToken) {
    return cachedAccessToken;
  }
  // Try to re-request token via popup
  return await requestGmailAccessToken();
}

/**
 * Fetch Gmail user profile
 */
export async function getGmailProfile(): Promise<GmailProfile> {
  const token = await ensureToken();
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    if (res.status === 401) {
      clearCachedAccessToken();
      throw new Error('โทเค็นหมดอายุ กรุณาเชื่อมต่อ Gmail ใหม่อีกครั้ง');
    }
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Gmail API error: ${res.statusText}`);
  }

  return await res.json();
}

/**
 * Fetch messages list from Gmail
 */
export async function fetchGmailMessages(
  query: string = '',
  maxResults: number = 20
): Promise<GmailMessageSummary[]> {
  const token = await ensureToken();
  const params = new URLSearchParams({
    maxResults: String(maxResults),
  });
  if (query.trim()) {
    params.set('q', query.trim());
  }

  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    }
  );

  if (!listRes.ok) {
    if (listRes.status === 401) {
      clearCachedAccessToken();
      throw new Error('โทเค็นหมดอายุ กรุณาเชื่อมต่อ Gmail ใหม่อีกครั้ง');
    }
    const err = await listRes.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to fetch messages: ${listRes.statusText}`);
  }

  const listData = await listRes.json();
  const rawList: Array<{ id: string; threadId: string }> = listData.messages || [];

  if (rawList.length === 0) {
    return [];
  }

  // Fetch summaries in parallel (batched limit 15 for responsiveness)
  const summaries = await Promise.all(
    rawList.slice(0, 15).map(async (item) => {
      try {
        const itemRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${item.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Date`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/json',
            },
          }
        );
        if (!itemRes.ok) return null;
        const msg = await itemRes.json();
        const headers: GmailMessageHeader[] = msg.payload?.headers || [];
        const subject = headers.find((h) => h.name.toLowerCase() === 'subject')?.value || '(ไม่มีหัวเรื่อง)';
        const from = headers.find((h) => h.name.toLowerCase() === 'from')?.value || 'ไม่ทราบผู้ส่ง';
        const to = headers.find((h) => h.name.toLowerCase() === 'to')?.value || '';
        const date = headers.find((h) => h.name.toLowerCase() === 'date')?.value || '';
        const labels: string[] = msg.labelIds || [];

        return {
          id: msg.id,
          threadId: msg.threadId,
          snippet: msg.snippet || '',
          subject,
          from,
          to,
          date,
          internalDate: msg.internalDate || '',
          isUnread: labels.includes('UNREAD'),
          isStarred: labels.includes('STARRED'),
          labelIds: labels,
        };
      } catch {
        return null;
      }
    })
  );

  return summaries.filter((s): s is GmailMessageSummary => s !== null);
}

/**
 * Base64 URL decoding with full UTF-8 Unicode support
 */
function base64UrlToUtf8(str: string): string {
  const sanitized = str.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (sanitized.length % 4)) % 4;
  const padded = sanitized + '='.repeat(padLen);
  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    try {
      return atob(padded);
    } catch {
      return '';
    }
  }
}

/**
 * Base64 URL encoding with full UTF-8 Unicode support for RFC 2822
 */
function utf8ToBase64Url(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Recursively extract body text/html from message parts
 */
function extractBodyParts(payload: any): { text: string; html: string } {
  let text = '';
  let html = '';

  if (!payload) return { text, html };

  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    text += base64UrlToUtf8(payload.body.data);
  } else if (payload.mimeType === 'text/html' && payload.body?.data) {
    html += base64UrlToUtf8(payload.body.data);
  }

  if (Array.isArray(payload.parts)) {
    for (const part of payload.parts) {
      const extracted = extractBodyParts(part);
      if (extracted.text) text += extracted.text + '\n';
      if (extracted.html) html += extracted.html;
    }
  }

  return { text, html };
}

/**
 * Fetch detailed message content
 */
export async function fetchGmailMessageDetail(messageId: string): Promise<GmailMessageDetail> {
  const token = await ensureToken();
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to fetch message details: ${res.statusText}`);
  }

  const msg = await res.json();
  const headers: GmailMessageHeader[] = msg.payload?.headers || [];
  const subject = headers.find((h) => h.name.toLowerCase() === 'subject')?.value || '(ไม่มีหัวเรื่อง)';
  const from = headers.find((h) => h.name.toLowerCase() === 'from')?.value || 'ไม่ทราบผู้ส่ง';
  const to = headers.find((h) => h.name.toLowerCase() === 'to')?.value || '';
  const date = headers.find((h) => h.name.toLowerCase() === 'date')?.value || '';
  const labels: string[] = msg.labelIds || [];

  const { text, html } = extractBodyParts(msg.payload);

  return {
    id: msg.id,
    threadId: msg.threadId,
    snippet: msg.snippet || '',
    subject,
    from,
    to,
    date,
    internalDate: msg.internalDate || '',
    isUnread: labels.includes('UNREAD'),
    isStarred: labels.includes('STARRED'),
    labelIds: labels,
    bodyText: text || msg.snippet || '',
    bodyHtml: html || `<p>${msg.snippet || ''}</p>`,
  };
}

/**
 * Send an email via Gmail API
 * NOTE: User confirmation dialog MUST be presented before this method is called!
 */
export async function sendGmailMessage(params: SendEmailParams): Promise<{ id: string; threadId: string }> {
  const token = await ensureToken();

  // Construct RFC 2822 email
  const utf8Subject = `=?utf-8?B?${btoa(unescape(encodeURIComponent(params.subject)))}?=`;
  const plainFallback = params.bodyText || params.bodyHtml.replace(/<[^>]+>/g, ' ');

  const boundary = `trading_engine_boundary_${Date.now()}`;
  const rawMessage = [
    `To: ${params.to}`,
    `Subject: ${utf8Subject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    plainFallback,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    params.bodyHtml,
    '',
    `--${boundary}--`,
  ].join('\r\n');

  const encodedRaw = utf8ToBase64Url(rawMessage);

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw: encodedRaw }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to send email: ${res.statusText}`);
  }

  return await res.json();
}

/**
 * Move message to Trash
 * NOTE: User confirmation dialog MUST be presented before this method is called!
 */
export async function trashGmailMessage(messageId: string): Promise<void> {
  const token = await ensureToken();
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/trash`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to trash email: ${res.statusText}`);
  }
}

/**
 * Helper to build a clean HTML template for a Trading Signal Report to send via Gmail
 */
export function buildTradingReportEmailHtml(
  signals: TradingSignal[],
  userEmail: string,
  extraNotes?: string
): { subject: string; html: string } {
  const now = new Date().toLocaleString('th-TH', {
    timeZone: 'Asia/Bangkok',
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const topSignals = signals.slice(0, 6);
  const rowsHtml = topSignals
    .map((s) => {
      const isLong = s.type === 'LONG';
      const color = isLong ? '#10B981' : '#f9df7b';
      const typeBg = isLong ? '#ECFDF5' : '#FEF2F2';
      const changeStr = s.change >= 0 ? `+${s.change.toFixed(2)}%` : `${s.change.toFixed(2)}%`;
      return `
        <tr style="border-bottom: 1px solid #E5E7EB;">
          <td style="padding: 10px 12px; font-weight: bold; font-size: 14px;">${s.symbol}</td>
          <td style="padding: 10px 12px;">
            <span style="display: inline-block; padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: bold; color: ${color}; background-color: ${typeBg};">
              ${s.type}
            </span>
          </td>
          <td style="padding: 10px 12px; font-weight: 600;">$${s.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</td>
          <td style="padding: 10px 12px; color: ${color}; font-weight: 600;">${changeStr}</td>
          <td style="padding: 10px 12px; font-size: 12px; color: #4B5563;">SL: $${s.sl.toFixed(2)} | TP: $${s.tp.toFixed(2)}</td>
          <td style="padding: 10px 12px; font-size: 12px; color: #6B7280;">${s.similarity}%</td>
        </tr>
      `;
    })
    .join('');

  const subject = `[MotorBoy AI-TH] รายงานสรุปสัญญาณการเทรด • ${now}`;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>${subject}</title>
      </head>
      <body style="margin: 0; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F9FAFB; color: #111827;">
        <div style="max-width: 640px; margin: 0 auto; background: #FFFFFF; border: 1px solid #E5E7EB; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          <!-- Header -->
          <div style="background: #0F1117; padding: 24px; color: #FFFFFF; border-bottom: 3px solid #7C6CFF;">
            <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #A5B4FC; font-weight: 700;">
              AI MotorBoy AI-TH • Gmail Alert Hub
            </div>
            <h1 style="margin: 8px 0 4px 0; font-size: 20px; font-weight: 800; color: #FFFFFF;">
              รายงานสรุปสัญญาณซื้อขาย Multi-Asset
            </h1>
            <p style="margin: 0; font-size: 12px; color: #9CA3AF;">
              ส่งไปยัง ${userEmail} • อัปเดตเมื่อ ${now}
            </p>
          </div>

          <!-- Content Body -->
          <div style="padding: 24px;">
            ${
              extraNotes
                ? `
              <div style="margin-bottom: 20px; padding: 14px; background: #F3F4F6; border-left: 4px solid #7C6CFF; border-radius: 8px; font-size: 13px; color: #374151;">
                <strong>บันทึกเพิ่มเติม:</strong> ${extraNotes}
              </div>
            `
                : ''
            }

            <h2 style="font-size: 15px; font-weight: 700; margin: 0 0 12px 0; color: #1F2937;">
              สัญญาณเด่นล่าสุด (${topSignals.length} รายการ)
            </h2>

            <div style="overflow-x: auto; border: 1px solid #E5E7EB; border-radius: 10px;">
              <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 13px;">
                <thead>
                  <tr style="background: #F9FAFB; border-bottom: 1px solid #E5E7EB; color: #6B7280; font-size: 11px; text-transform: uppercase;">
                    <th style="padding: 10px 12px;">สินทรัพย์</th>
                    <th style="padding: 10px 12px;">ทิศทาง</th>
                    <th style="padding: 10px 12px;">ราคา</th>
                    <th style="padding: 10px 12px;">24ชม.</th>
                    <th style="padding: 10px 12px;">Stop Loss / Take Profit</th>
                    <th style="padding: 10px 12px;">โมเมนตัม</th>
                  </tr>
                </thead>
                <tbody>
                  ${rowsHtml}
                </tbody>
              </table>
            </div>

            <!-- Footer note -->
            <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #E5E7EB; font-size: 11px; color: #9CA3AF; line-height: 1.5;">
              <p style="margin: 0 0 4px 0;">
                * การลงทุนมีความเสี่ยง ข้อมูลในอีเมลนี้เป็นการคำนวณโมเมนตัมและระดับ Stop Loss / Take Profit ทางเทคนิคเพื่อการศึกษาและติดตามเท่านั้น
              </p>
              <p style="margin: 0;">
                ส่งอัตโนมัติผ่าน Google Gmail API โดย MotorBoy AI-TH
              </p>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;

  return { subject, html };
}
