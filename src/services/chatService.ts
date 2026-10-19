import { getCachedAccessToken, requestGmailAccessToken, clearCachedAccessToken } from './gmailService';

async function ensureToken(): Promise<string> {
  const cached = getCachedAccessToken();
  if (cached) return cached;
  return requestGmailAccessToken();
}

async function chatFetch(url: string, init?: RequestInit): Promise<Response> {
  let res = await fetch(url, {
    ...init,
    headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${await ensureToken()}` },
  });
  if (res.status === 401) {
    clearCachedAccessToken();
    const fresh = await requestGmailAccessToken();
    res = await fetch(url, {
      ...init,
      headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${fresh}` },
    });
  }
  return res;
}

export const fetchChatSpaces = async () => {
  const res = await chatFetch('https://chat.googleapis.com/v1/spaces');
  if (!res.ok) throw new Error('โหลดห้อง Chat ไม่สำเร็จ');
  return res.json();
};

export const fetchSpaceMessages = async (spaceName: string) => {
  const res = await chatFetch(`https://chat.googleapis.com/v1/${spaceName}/messages`);
  if (!res.ok) throw new Error('โหลดข้อความไม่สำเร็จ');
  return res.json();
};

export const sendChatMessage = async (spaceName: string, text: string) => {
  const res = await chatFetch(`https://chat.googleapis.com/v1/${spaceName}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error('ส่งข้อความไม่สำเร็จ');
  return res.json();
};
