/**
 * MotorBoy AI Chat — shared core (pure functions, no browser or Node APIs).
 *
 * Used by BOTH sides of the streaming chat:
 *   · `server.ts`            → buildChatPrompt() / buildSourceList()
 *   · `services/chatStreamClient.ts` → SSE parsing + client-side safety net
 *
 * Everything here is deterministic and unit-tested, so the brand rules live in
 * one place instead of being copy-pasted into prompts and components.
 *
 * Brand Book v2.0 constraints encoded below (section 08 voice, 09 AI, 12 AI):
 *   · 1 คำตอบ = 1 เรื่อง อ่านจบใน 5 นาที
 *   · ห้ามคำต้องห้าม: ด่วน! / พลาดไม่ได้ / ตอนนี้เลย / รีบเลย / เหลือที่เดียว
 *   · ทุกคำแนะนำต้องบอก "ดูจากอะไร" + เหตุผล 3 ข้อ
 *   · ห้ามใช้สี/คำขู่เป็นตัวเร่งการตัดสินใจ และห้ามการันตีกำไร
 */

/* ------------------------------------------------------------------- tones */

export type ChatTone = 'friend' | 'coach' | 'expert';

export const CHAT_TONE_ORDER: ChatTone[] = ['friend', 'coach', 'expert'];

export const CHAT_TONES: Record<
  ChatTone,
  { labelTh: string; labelEn: string; hintTh: string; instruction: string }
> = {
  friend: {
    labelTh: 'เพื่อน',
    labelEn: 'Friend',
    hintTh: 'สั้น อบอุ่น ไม่ตัดสิน',
    instruction:
      'โทนเพื่อน: พูดสั้น อบอุ่น ใช้ครับ/ค่ะ ไม่สั่ง ไม่ตัดสิน ไม่ใช้ศัพท์เทคนิคโดด ๆ ' +
      'ถ้าจำเป็นให้วางศัพท์เทคนิคไว้ในวงเล็บท้ายประโยค เช่น แรงขายเริ่มลด (RSI)',
  },
  coach: {
    labelTh: 'โค้ช',
    labelEn: 'Coach',
    hintTh: 'อธิบายเหตุผล 3 ข้อ',
    instruction:
      'โทนโค้ช: อธิบายเหตุผล 3 ข้อว่าเห็นอะไรจากข้อมูล แล้วเสนอทางเลือก 2 ทาง ' +
      'พร้อมบอกว่าแต่ละทางเสี่ยงตรงไหน ใช้ภาษาคนคุยกัน ไม่ใช่ตำรา',
  },
  expert: {
    labelTh: 'ผู้เชี่ยวชาญ',
    labelEn: 'Expert',
    hintTh: 'ตัวเลข เงื่อนไข ระดับความเสี่ยง',
    instruction:
      'โทนผู้เชี่ยวชาญ: ให้ตัวเลขจริงจากข้อมูลที่ให้ (ราคา, %, P/E, RSI, funding, drawdown) ' +
      'ระบุเงื่อนไขเข้า/ออกเป็นตัวเลข และระดับความเสี่ยงเป็นคำ (ต่ำ/กลาง/สูง)',
  },
};

export function isChatTone(value: unknown): value is ChatTone {
  return value === 'friend' || value === 'coach' || value === 'expert';
}

/* -------------------------------------------------------------- brand guard */

/** คำต้องห้ามตาม Brand Book v2.0 — ใช้แทนด้วยถ้อยคำที่ให้เวลาเลือก */
export const FORBIDDEN_WORDS: Array<[RegExp, string]> = [
  [/ด่วน!+/g, 'น่าสนใจ'],
  [/ด่วน/g, 'น่าสนใจ'],
  [/พลาดไม่ได้/g, 'ลองดูได้'],
  [/ตอนนี้เลย/g, 'คืนนี้'],
  [/รีบเลย/g, 'ลองดูได้'],
  [/เหลือที่เดียว/g, 'มีอยู่ตอนนี้'],
  [/การันตีกำไร/g, 'ไม่ได้ยืนยันผลลัพธ์'],
  [/รับประกันกำไร/g, 'ไม่ได้ยืนยันผลลัพธ์'],
];

/**
 * Safety net ฝั่งหน้าเว็บ: ถ้าโมเดลเผลอใช้คำต้องห้าม ให้แทนก่อนขึ้นจอ
 * (server สั่งห้ามไปแล้วใน prompt แต่ของจริงต้องกันสองชั้น)
 */
export function sanitizeVoice(text: string): string {
  let out = text;
  for (const [pattern, replacement] of FORBIDDEN_WORDS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

export function hasForbiddenWord(text: string): boolean {
  return FORBIDDEN_WORDS.some(([pattern]) => {
    // ต้องรีเซ็ต lastIndex เพราะบาง regex ถูกใช้ซ้ำ
    pattern.lastIndex = 0;
    return pattern.test(text);
  });
}

/* ------------------------------------------------------------------ sources */

/** ข้อมูลที่ AI ใช้ตอบ — ต้องโชว์ให้ผู้ใช้เห็นทุกครั้ง (Brand Book 09) */
export function buildSourceList(input: {
  crypto?: number;
  forex?: number;
  thaiStocks?: number;
  foreignStocks?: number;
  indices?: number;
  news?: number;
}): string[] {
  const sources: string[] = [];
  if (input.crypto) sources.push(`ราคาคริปโต ${input.crypto} ตัว`);
  if (input.forex) sources.push(`อัตราแลกเปลี่ยน ${input.forex} คู่`);
  if (input.thaiStocks) sources.push(`หุ้นไทย ${input.thaiStocks} ตัว`);
  if (input.foreignStocks) sources.push(`หุ้นต่างประเทศ ${input.foreignStocks} ตัว`);
  if (input.indices) sources.push(`ดัชนีโลก ${input.indices} ดัชนี`);
  if (input.news) sources.push(`ข่าวล่าสุด ${input.news} เรื่อง`);
  return sources;
}

/* ------------------------------------------------------------------- prompt */

export interface ChatPromptInput {
  query: string;
  marketBrief: string;
  tone: ChatTone;
  sources: string[];
  personaLine?: string;
}

/**
 * สร้าง prompt เดียวที่ใช้ทั้งหน้าแชทและหน้า server
 * เป้าหมาย: คำตอบสั้น อ่านจบไว มีเหตุผล 3 ข้อ และไม่เร่งให้ตัดสินใจ
 */
export function buildChatPrompt(input: ChatPromptInput): string {
  const tone = CHAT_TONES[input.tone] ?? CHAT_TONES.friend;
  const sources = input.sources.length > 0 ? input.sources.join(' · ') : 'ข้อมูลตลาดสดในแอป';

  return `คุณคือ "น้องมอเตอร์บอย" AI Co-Pilot ประจำแอป MotorBoy Trading
บุคลิก: เด็กหนุ่มบนมอเตอร์ไซค์คันเล็กที่ขี่ช้า ๆ ใจดี ช่างสังเกต ไม่เสียงดัง ไม่ตัดสิน

${tone.instruction}

ข้อมูลที่คุณใช้ตอบครั้งนี้ (ห้ามอ้างข้อมูลอื่นนอกจากนี้): ${sources}
${input.marketBrief || '(ไม่มีข้อมูลตลาดเพิ่มเติม)'}

กติกาบังคับ (Brand Book v2.0):
1. ภาษาไทยนำ ศัพท์เทคนิคภาษาอังกฤษสั้น ๆ ตามหลัง เช่น แรงขายเริ่มลด (RSI)
2. ตอบไม่เกิน 180 คำ ถ้ายาวให้แบ่งเป็นหัวข้อย่อยด้วย "- "
3. ต้องมีเหตุผล 3 ข้อที่อ้างจาก "ข้อมูลที่คุณใช้ตอบ" ข้างบน ขึ้นต้นบรรทัดด้วย "- "
4. ห้ามใช้คำเหล่านี้เด็ดขาด: ด่วน!, ด่วน, พลาดไม่ได้, ตอนนี้เลย, รีบเลย, เหลือที่เดียว
5. ห้ามการันตีกำไร ห้ามขู่ ห้ามเร่งให้ตัดสินใจ และไม่ใช้สี/ตัวพิมพ์ใหญ่เป็นตัวเร่ง
6. สองบรรทัดสุดท้ายต้องเป็น:
   นี่คือการวิเคราะห์ ไม่ใช่คำแนะนำการลงทุน
   ดูจาก: ${sources}
7. ไม่ต้องเกริ่นนำ ไม่ต้องทวนคำถาม ตอบเนื้อหาเลย

คำถามผู้ใช้: "${input.query}"`.trim();
}

/* ---------------------------------------------------------------------- SSE */

export interface SseFrame {
  event: string;
  data: string;
}

/**
 * แยก SSE buffer เป็น frame — รองรับ chunk ที่ถูกตัดกลางเฟรม
 * คืนค่า `rest` ที่ยังไม่ครบเฟรม ให้ผู้เรียกเก็บไว้ต่อ
 */
export function parseSseBuffer(buffer: string): { frames: SseFrame[]; rest: string } {
  const frames: SseFrame[] = [];
  const normalized = buffer.replace(/\r\n/g, '\n');
  const parts = normalized.split('\n\n');
  const rest = parts.pop() ?? '';

  for (const part of parts) {
    if (!part.trim()) continue;
    let event = 'message';
    const dataLines: string[] = [];
    for (const line of part.split('\n')) {
      if (line.startsWith('event:')) {
        event = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).replace(/^ /, ''));
      }
    }
    if (dataLines.length > 0) {
      frames.push({ event, data: dataLines.join('\n') });
    }
  }

  return { frames, rest };
}

/** อ่าน payload ของ frame แบบปลอดภัย (ไม่ throw ทั้ง stream ถ้า JSON เพี้ยน) */
export function readSsePayload<T = Record<string, unknown>>(frame: SseFrame): T | null {
  try {
    return JSON.parse(frame.data) as T;
  } catch {
    return null;
  }
}

/* --------------------------------------------------------------- reasoning */

const DISCLAIMER_PATTERNS = [
  /นี่คือการวิเคราะห์/,
  /ไม่ใช่คำแนะนำการลงทุน/,
  /^ดูจาก:/,
];

/**
 * ดึง "เหตุผล 3 ข้อ" จากคำตอบ เพื่อโชว์เป็นแผงพับได้
 * ถ้าโมเดลไม่ได้ทำ bullet มา ให้ตัดประโยคสั้น ๆ แทน (สูงสุด 3 ข้อ)
 */
export function extractReasons(text: string, max = 3): string[] {
  const reasons: string[] = [];
  const bullets = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^[-•*]\s+/.test(line))
    .map((line) => line.replace(/^[-•*]\s+/, '').trim())
    .filter((line) => line.length > 8 && !DISCLAIMER_PATTERNS.some((p) => p.test(line)));

  for (const bullet of bullets) {
    if (reasons.length >= max) break;
    if (!reasons.some((r) => r === bullet)) reasons.push(bullet);
  }

  if (reasons.length === 0) {
    const sentences = text
      .replace(/\s+/g, ' ')
      .split(/(?<=[.!?。])\s+|(?<=ครับ)\s+|(?<=ค่ะ)\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 12 && !DISCLAIMER_PATTERNS.some((p) => p.test(s)));
    for (const sentence of sentences) {
      if (reasons.length >= max) break;
      reasons.push(sentence);
    }
  }

  return reasons.slice(0, max);
}

/** บรรทัด "ดูจาก: …" ที่โมเดลแนบมา ใช้ขึ้นป้าย disclosesource */
export function extractDisclosureLine(text: string): string | null {
  const line = text
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.startsWith('ดูจาก:'));
  return line ?? null;
}
