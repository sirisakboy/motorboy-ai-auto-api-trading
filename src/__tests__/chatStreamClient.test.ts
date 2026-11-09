import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/aiChatService', () => ({
  generateAiChatReply: vi.fn(async () => 'คำตอบสำรองจากเครื่อง\n- เหตุผลหนึ่ง\nดูจาก: ราคาคริปโต 2 ตัว'),
}));

import { generateAiChatReply } from '../services/aiChatService';
import { sourcesFromContext, streamChatReply } from '../services/chatStreamClient';

function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

const context = {
  cryptoList: [
    { symbol: 'BTC', price: 68000, change: 1.2 } as never,
    { symbol: 'ETH', price: 3200, change: -0.4 } as never,
  ],
  articles: [{ title: 'Fed holds rates' } as never],
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(generateAiChatReply).mockClear();
});

describe('sourcesFromContext', () => {
  it('summarises only the feeds that actually have data', () => {
    expect(sourcesFromContext(context)).toEqual(['ราคาคริปโต 2 ตัว', 'ข่าวล่าสุด 1 เรื่อง']);
  });
});

describe('streamChatReply', () => {
  it('streams deltas, keeps the meta sources and reports depth=llm', async () => {
    const frames = [
      'event: meta\ndata: {"tone":"coach","sources":["ราคาคริปโต 6 ตัว"]}\n\n',
      'event: delta\ndata: {"text":"วันนี้ "}\n\n',
      'event: delta\ndata: {"text":"BTC ทรงตัวครับ"}\n\n',
      'event: done\ndata: {"text":"วันนี้ BTC ทรงตัวครับ","finishReason":"STOP"}\n\n',
    ];

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => sseResponse(frames))
    );

    const deltas: string[] = [];
    const result = await streamChatReply({
      query: 'BTC เป็นยังไง',
      context,
      tone: 'coach',
      onDelta: (chunk) => deltas.push(chunk),
    });

    expect(deltas).toHaveLength(2);
    expect(deltas.join('')).toContain('BTC ทรงตัวครับ');
    expect(result.text).toBe('วันนี้ BTC ทรงตัวครับ');
    expect(result.sources).toEqual(['ราคาคริปโต 6 ตัว']);
    expect(result.streamed).toBe(true);
    expect(result.depth).toBe('llm');
    expect(result.tone).toBe('coach');
    expect(generateAiChatReply).not.toHaveBeenCalled();
  });

  it('re-assembles frames that arrive split across network chunks', async () => {
    const whole =
      'event: delta\ndata: {"text":"ครึ่งแรก "}\n\n' +
      'event: delta\ndata: {"text":"ครึ่งหลัง"}\n\n' +
      'event: done\ndata: {"text":"ครึ่งแรก ครึ่งหลัง"}\n\n';
    const chunks = [whole.slice(0, 12), whole.slice(12, 45), whole.slice(45)];

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => sseResponse(chunks))
    );

    const result = await streamChatReply({ query: 'ทดสอบ', context, tone: 'friend' });
    expect(result.text).toBe('ครึ่งแรก ครึ่งหลัง');
    expect(result.streamed).toBe(true);
  });

  it('sanitises forbidden words coming back from the model', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        sseResponse([
          'event: delta\ndata: {"text":"ด่วน! พลาดไม่ได้"}\n\n',
          'event: done\ndata: {"text":"ด่วน! พลาดไม่ได้"}\n\n',
        ])
      )
    );

    const result = await streamChatReply({ query: 'x', context, tone: 'friend' });
    expect(result.text).not.toContain('ด่วน');
    expect(result.text).not.toContain('พลาดไม่ได้');
  });

  it('falls back to the on-device engine when streaming is unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 503 }))
    );

    const result = await streamChatReply({ query: 'BTC', context, tone: 'friend' });
    expect(generateAiChatReply).toHaveBeenCalledTimes(1);
    expect(result.streamed).toBe(false);
    expect(result.depth).toBe('quant');
    expect(result.text).toContain('คำตอบสำรองจากเครื่อง');
  });

  it('propagates an abort instead of silently answering', async () => {
    const abortError = new DOMException('aborted', 'AbortError');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw abortError;
      })
    );

    const controller = new AbortController();
    controller.abort();

    await expect(
      streamChatReply({ query: 'x', context, tone: 'friend', signal: controller.signal })
    ).rejects.toBeTruthy();
  });
});
