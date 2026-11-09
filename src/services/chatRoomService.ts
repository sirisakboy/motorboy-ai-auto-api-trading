import { ChatMessage, ChatMessageMeta } from '../types';

export const GLOBAL_ROOM_ID = 'global';

const CHAT_STORAGE_KEY_PREFIX = 'trading_engine_chat_';
const listeners = new Map<string, Set<(messages: ChatMessage[]) => void>>();

function getLocalMessages(roomId: string): ChatMessage[] {
  try {
    const raw = localStorage.getItem(`${CHAT_STORAGE_KEY_PREFIX}${roomId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalMessages(roomId: string, messages: ChatMessage[]): void {
  try {
    // เก็บ 120 ข้อความล่าสุด: พอสำหรับเซสชันทำงาน แต่ยังเบาพอให้ localStorage ไม่เต็ม
    localStorage.setItem(`${CHAT_STORAGE_KEY_PREFIX}${roomId}`, JSON.stringify(messages.slice(-120)));
  } catch (e) {
    console.warn('Failed to save local chat messages:', e);
  }
}

/**
 * Local realtime chat room (zero Firestore dependency).
 * Subscribes to local storage and in-memory events.
 */
export function subscribeRoomMessages(
  roomId: string,
  onUpdate: (messages: ChatMessage[]) => void
): () => void {
  if (!listeners.has(roomId)) {
    listeners.set(roomId, new Set());
  }
  const roomSet = listeners.get(roomId)!;
  roomSet.add(onUpdate);

  // Initial trigger with existing messages
  onUpdate(getLocalMessages(roomId));

  const handleStorage = (e: StorageEvent) => {
    if (e.key === `${CHAT_STORAGE_KEY_PREFIX}${roomId}`) {
      onUpdate(getLocalMessages(roomId));
    }
  };

  window.addEventListener('storage', handleStorage);

  return () => {
    roomSet.delete(onUpdate);
    window.removeEventListener('storage', handleStorage);
  };
}

export async function sendRoomMessage(
  roomId: string,
  input: {
    uid: string;
    name: string;
    photoURL?: string | null;
    text: string;
    meta?: ChatMessageMeta;
  }
): Promise<string> {
  const text = input.text.trim().slice(0, 4000);
  if (!text) throw new Error('ข้อความว่างเปล่า');

  const id = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const newMsg: ChatMessage = {
    id,
    uid: input.uid || 'guest-trader',
    name: input.name || 'Trader',
    photoURL: input.photoURL ?? null,
    text,
    createdAt: new Date().toISOString(),
    ...(input.meta ? { meta: input.meta } : {}),
  };

  const list = getLocalMessages(roomId);
  list.push(newMsg);
  saveLocalMessages(roomId, list);

  // Notify all active listeners in this window
  const roomSet = listeners.get(roomId);
  if (roomSet) {
    roomSet.forEach((cb) => cb([...list]));
  }

  return id;
}
