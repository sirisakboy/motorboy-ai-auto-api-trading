import { describe, expect, it } from 'vitest';
import { parseInline, parseMarkdown } from '../components/chat/markdownLite';

describe('parseInline', () => {
  it('splits bold, code and plain text', () => {
    const tokens = parseInline('ราคา **สำคัญ** ที่ `62,400` ครับ');
    expect(tokens.map((t) => t.type)).toEqual(['text', 'bold', 'text', 'code', 'text']);
    expect(tokens[1]).toEqual({ type: 'bold', value: 'สำคัญ' });
    expect(tokens[3]).toEqual({ type: 'code', value: '62,400' });
  });

  it('only linkifies safe protocols', () => {
    const safe = parseInline('ดู https://motor-boy.ai/chart ครับ');
    expect(safe.some((t) => t.type === 'link')).toBe(true);

    const unsafe = parseInline('กด javascript:alert(1) ซิ');
    expect(unsafe.some((t) => t.type === 'link')).toBe(false);
  });

  it('always returns at least one token', () => {
    expect(parseInline('')).toEqual([{ type: 'text', value: '' }]);
  });
});

describe('parseMarkdown', () => {
  it('groups bullets and keeps paragraphs apart', () => {
    const blocks = parseMarkdown('สรุปให้ครับ\n- ข้อหนึ่ง\n- ข้อสอง\nบรรทัดปิดท้าย');
    expect(blocks.map((b) => b.type)).toEqual(['paragraph', 'bullets', 'paragraph']);
    const bullets = blocks[1];
    expect(bullets.type === 'bullets' && bullets.items).toEqual(['ข้อหนึ่ง', 'ข้อสอง']);
  });

  it('detects headings, numbered steps and fenced code', () => {
    const md = [
      '## สรุป',
      '1. ตั้ง SL',
      '2. รอแท่งปิด',
      '```ts',
      'const rr = 1.5;',
      '```',
    ].join('\n');

    const blocks = parseMarkdown(md);
    expect(blocks[0]).toEqual({ type: 'heading', level: 2, text: 'สรุป' });
    expect(blocks[1].type).toBe('numbers');
    expect(blocks[2]).toEqual({ type: 'code', text: 'const rr = 1.5;' });
  });

  it('closes an unterminated code fence instead of dropping the text', () => {
    const blocks = parseMarkdown('```\nราคา 62,400');
    expect(blocks).toEqual([{ type: 'code', text: 'ราคา 62,400' }]);
  });

  it('never returns raw HTML passthrough blocks', () => {
    const html = '<img src=x onerror=alert(1)>';
    const blocks = parseMarkdown(html);
    expect(blocks.every((b) => b.type === 'paragraph')).toBe(true);
  });
});
