import { describe, expect, it } from 'vitest';
import {
  CHAT_TONES,
  CHAT_TONE_ORDER,
  buildChatPrompt,
  buildSourceList,
  extractDisclosureLine,
  extractReasons,
  hasForbiddenWord,
  isChatTone,
  parseSseBuffer,
  readSsePayload,
  sanitizeVoice,
} from '../services/chatStreamCore';

describe('chat tones — users must be able to change the AI voice', () => {
  it('ships exactly the three voices from the Brand Book', () => {
    expect(CHAT_TONE_ORDER).toEqual(['friend', 'coach', 'expert']);
    for (const id of CHAT_TONE_ORDER) {
      expect(CHAT_TONES[id].labelTh.length).toBeGreaterThan(0);
      expect(CHAT_TONES[id].instruction.length).toBeGreaterThan(20);
    }
  });

  it('validates tone values coming from storage or the network', () => {
    expect(isChatTone('coach')).toBe(true);
    expect(isChatTone('expert')).toBe(true);
    expect(isChatTone('shouty')).toBe(false);
    expect(isChatTone(undefined)).toBe(false);
  });
});

describe('brand voice guard', () => {
  it('rewrites every forbidden word from section 08', () => {
    const text = 'ด่วน! พลาดไม่ได้ ตอนนี้เลย รีบเลย เหลือที่เดียว';
    const clean = sanitizeVoice(text);
    expect(hasForbiddenWord(text)).toBe(true);
    expect(hasForbiddenWord(clean)).toBe(false);
    expect(clean).not.toContain('ด่วน');
    expect(clean).not.toContain('พลาดไม่ได้');
  });

  it('keeps normal trading copy untouched', () => {
    const text = 'วันนี้ BTC ใกล้เคียงเดิม แนวรับ 62,400 ลองดูได้คืนนี้';
    expect(sanitizeVoice(text)).toBe(text);
    expect(hasForbiddenWord(text)).toBe(false);
  });

  it('blocks profit guarantees', () => {
    expect(hasForbiddenWord('การันตีกำไร 100%')).toBe(true);
    expect(hasForbiddenWord('รับประกันกำไร')).toBe(true);
  });
});

describe('sources — every AI answer must say what it looked at', () => {
  it('describes each feed in Thai with counts', () => {
    const sources = buildSourceList({
      crypto: 12,
      forex: 4,
      thaiStocks: 30,
      foreignStocks: 8,
      indices: 5,
      news: 3,
    });
    expect(sources).toEqual([
      'ราคาคริปโต 12 ตัว',
      'อัตราแลกเปลี่ยน 4 คู่',
      'หุ้นไทย 30 ตัว',
      'หุ้นต่างประเทศ 8 ตัว',
      'ดัชนีโลก 5 ดัชนี',
      'ข่าวล่าสุด 3 เรื่อง',
    ]);
  });

  it('omits empty feeds instead of printing zero', () => {
    expect(buildSourceList({ crypto: 0, news: 2 })).toEqual(['ข่าวล่าสุด 2 เรื่อง']);
    expect(buildSourceList({})).toEqual([]);
  });
});

describe('buildChatPrompt', () => {
  it('carries the chosen tone, the data it may use and the 3-reason rule', () => {
    const prompt = buildChatPrompt({
      query: 'BTC น่าสนใจไหม',
      marketBrief: '- คริปโต: BTC $68,000 (+1.2%)',
      tone: 'coach',
      sources: ['ราคาคริปโต 5 ตัว', 'ข่าวล่าสุด 3 เรื่อง'],
    });

    expect(prompt).toContain(CHAT_TONES.coach.instruction);
    expect(prompt).toContain('- คริปโต: BTC $68,000 (+1.2%)');
    expect(prompt).toContain('ราคาคริปโต 5 ตัว · ข่าวล่าสุด 3 เรื่อง');
    expect(prompt).toContain('เหตุผล 3 ข้อ');
    expect(prompt).toContain('ห้ามใช้คำเหล่านี้เด็ดขาด');
    expect(prompt).toContain('ไม่ใช่คำแนะนำการลงทุน');
    expect(prompt).toContain('"BTC น่าสนใจไหม"');
  });

  it('falls back to a neutral source line when no feed is available', () => {
    const prompt = buildChatPrompt({ query: 'hi', marketBrief: '', tone: 'friend', sources: [] });
    expect(prompt).toContain('ข้อมูลตลาดสดในแอป');
    expect(prompt).toContain('(ไม่มีข้อมูลตลาดเพิ่มเติม)');
  });
});

describe('SSE parsing', () => {
  it('reads complete frames and keeps the partial tail', () => {
    const raw =
      'event: meta\ndata: {"sources":["ราคาคริปโต 5 ตัว"]}\n\n' +
      'event: delta\ndata: {"text":"สวัสดี"}\n\n' +
      'event: delta\ndata: {"text":"ครึ่ง';

    const { frames, rest } = parseSseBuffer(raw);
    expect(frames).toHaveLength(2);
    expect(frames[0].event).toBe('meta');
    expect(frames[1].event).toBe('delta');
    expect(rest).toContain('"ครึ่ง');
  });

  it('joins multi-line data and tolerates CRLF', () => {
    const raw = 'event: delta\r\ndata: {"text":"a"}\r\ndata: \r\n\r\n';
    const { frames } = parseSseBuffer(raw);
    expect(frames).toHaveLength(1);
    expect(frames[0].data).toContain('"text":"a"');
  });

  it('never throws on malformed JSON', () => {
    const { frames } = parseSseBuffer('event: delta\ndata: {oops}\n\n');
    expect(readSsePayload(frames[0])).toBeNull();
  });

  it('ignores keep-alive comments without data', () => {
    const { frames } = parseSseBuffer(': ping\n\n');
    expect(frames).toHaveLength(0);
  });
});

describe('reasons — the "ทำไมถึงตอบแบบนี้" panel', () => {
  it('prefers bullets and caps at three', () => {
    const text = [
      'วันนี้ BTC ทรงตัวครับ',
      '- แนวรับเดิมยังรับได้ที่ 62,400',
      '- ปริมาณซื้อเริ่มบางลง',
      '- ข่าวยังไม่มีผลบวกใหม่',
      '- ข้อที่สี่ไม่ควรถูกดึงมา',
      'นี่คือการวิเคราะห์ ไม่ใช่คำแนะนำการลงทุน',
    ].join('\n');

    const reasons = extractReasons(text);
    expect(reasons).toHaveLength(3);
    expect(reasons[0]).toContain('แนวรับเดิม');
    expect(reasons).not.toContain('ข้อที่สี่ไม่ควรถูกดึงมา');
  });

  it('falls back to sentences when the model forgot bullets', () => {
    const text =
      'ราคาปิดเหนือเส้น 20 วันครับ ตัวเลขวอลุ่มเพิ่มขึ้นชัดเจน ช่วงนี้จึงน่าสนใจกว่าปกติ นี่คือการวิเคราะห์ ไม่ใช่คำแนะนำการลงทุน';
    const reasons = extractReasons(text);
    expect(reasons.length).toBeGreaterThan(0);
    expect(reasons.length).toBeLessThanOrEqual(3);
    expect(reasons.join(' ')).not.toContain('ไม่ใช่คำแนะนำการลงทุน');
  });

  it('returns an empty list for empty input', () => {
    expect(extractReasons('')).toEqual([]);
  });

  it('finds the disclosure line the model wrote', () => {
    const text = 'สรุปให้แล้วครับ\n- เหตุผลหนึ่ง\nดูจาก: ราคาคริปโต 5 ตัว';
    expect(extractDisclosureLine(text)).toBe('ดูจาก: ราคาคริปโต 5 ตัว');
    expect(extractDisclosureLine('ไม่มีบรรทัดนี้')).toBeNull();
  });
});
