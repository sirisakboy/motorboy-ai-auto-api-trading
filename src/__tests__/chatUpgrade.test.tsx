// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { ChatMessageItem } from '../components/chat/ChatMessageItem';
import { MarkdownLite } from '../components/chat/MarkdownLite';
import { ChatModal } from '../components/ChatModal';
import type { ChatMessage } from '../types';

vi.mock('../services/chatStreamClient', () => ({
  streamChatReply: vi.fn(async ({ onDelta }: { onDelta?: (c: string) => void }) => {
    onDelta?.('ทดสอบการสตรีมครับ');
    return {
      text: 'ทดสอบการสตรีมครับ\n- เหตุผลหนึ่ง\n- เหตุผลสอง\n- เหตุผลสาม\nดูจาก: ราคาคริปโต 2 ตัว',
      sources: ['ราคาคริปโต 2 ตัว'],
      tone: 'friend' as const,
      depth: 'llm' as const,
      streamed: true,
      latencyMs: 420,
    };
  }),
  sourcesFromContext: () => ['ราคาคริปโต 2 ตัว'],
}));

const aiMessage: ChatMessage = {
  id: 'ai-1',
  uid: 'ai-deep-analyze',
  name: '🏍️ น้องมอเตอร์บอย',
  text: 'วันนี้ BTC ทรงตัวครับ\n- แนวรับ 62,400 ยังรับได้\n- วอลุ่มบางลง\n- ข่าวยังไม่มีผลบวกใหม่',
  createdAt: new Date().toISOString(),
  meta: {
    tone: 'coach',
    sources: ['ราคาคริปโต 5 ตัว', 'ข่าวล่าสุด 3 เรื่อง'],
    reasons: ['แนวรับเดิมยังรับได้', 'ปริมาณซื้อบางลงชัดเจน', 'ยังไม่มีข่าวบวกใหม่'],
    depth: 'llm',
    latencyMs: 1200,
  },
};

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('MarkdownLite', () => {
  it('renders bold text without injecting HTML', () => {
    render(<MarkdownLite text={'ราคา **สำคัญ** <script>alert(1)</script>'} />);
    expect(screen.getByText('สำคัญ').tagName).toBe('STRONG');
    expect(document.querySelector('script')).toBeNull();
  });

  it('renders bullets as a list', () => {
    render(<MarkdownLite text={'- ข้อหนึ่ง\n- ข้อสอง'} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });
});

describe('ChatMessageItem (AI disclosure)', () => {
  it('shows the tone, the sources and the latency', () => {
    render(<ChatMessageItem message={aiMessage} isMine={false} onCopy={() => {}} />);
    expect(screen.getByText(/โทนโค้ช/)).toBeTruthy();
    expect(screen.getByText(/ดูจาก: ราคาคริปโต 5 ตัว/)).toBeTruthy();
    expect(screen.getByText('1.2 วิ')).toBeTruthy();
  });

  it('reveals three reasons only after asking "ทำไมถึงตอบแบบนี้"', () => {
    render(<ChatMessageItem message={aiMessage} isMine={false} onCopy={() => {}} />);
    expect(screen.queryByText('ปริมาณซื้อบางลงชัดเจน')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /ทำไมถึงตอบแบบนี้/ }));

    const panel = screen.getByText('แนวรับเดิมยังรับได้').closest('ol');
    expect(panel).not.toBeNull();
    expect(within(panel as HTMLElement).getAllByRole('listitem')).toHaveLength(3);
  });

  it('hides copy/regenerate while the answer is still streaming', () => {
    render(<ChatMessageItem message={aiMessage} isMine={false} streaming onCopy={() => {}} />);
    expect(screen.queryByRole('button', { name: 'คัดลอกคำตอบ' })).toBeNull();
  });
});

describe('ChatModal upgrade', () => {
  const baseProps = {
    isOpen: true,
    onClose: () => {},
    cryptoList: [{ symbol: 'BTC', price: 68000, change: 1.2 } as never],
    articles: [{ title: 'Fed holds rates' } as never],
  };

  it('greets with a calm empty state and the tone selector', () => {
    render(<ChatModal {...baseProps} />);
    expect(screen.getByText('สวัสดีครับ ผมช่วยดูให้ได้')).toBeTruthy();
    expect(screen.getByRole('radiogroup', { name: 'เลือกโทนการตอบของ AI' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'เพื่อน' }).getAttribute('aria-checked')).toBe('true');
  });

  it('switches tone and remembers the choice', () => {
    render(<ChatModal {...baseProps} />);
    fireEvent.click(screen.getByRole('radio', { name: 'ผู้เชี่ยวชาญ' }));
    expect(screen.getByRole('radio', { name: 'ผู้เชี่ยวชาญ' }).getAttribute('aria-checked')).toBe(
      'true'
    );
    expect(localStorage.getItem('motorboy_chat_tone')).toBe('expert');
  });

  it('sends a suggestion, streams the answer and stores it with metadata', async () => {
    render(<ChatModal {...baseProps} />);

    fireEvent.click(screen.getByRole('button', { name: /BTC น่าสนใจไหม/ }));

    const answer = await screen.findByText(/ทดสอบการสตรีมครับ/);
    expect(answer).toBeTruthy();

    expect((await screen.findAllByText(/ดูจาก: ราคาคริปโต 2 ตัว/)).length).toBeGreaterThan(0);

    const stored = JSON.parse(localStorage.getItem('trading_engine_chat_global') || '[]');
    const ai = stored.find((m: ChatMessage) => m.uid === 'ai-deep-analyze');
    expect(ai).toBeTruthy();
    expect(ai.meta.sources).toEqual(['ราคาคริปโต 2 ตัว']);
    expect(ai.meta.reasons.length).toBeGreaterThan(0);
    expect(ai.meta.streamed).toBe(true);
  });

  it('keeps forbidden urgency words out of the initial screen', () => {
    const { container } = render(<ChatModal {...baseProps} />);
    const text = container.textContent || '';
    expect(text).not.toContain('ด่วน');
    expect(text).not.toContain('พลาดไม่ได้');
    expect(text).not.toContain('ตอนนี้เลย');
  });
});
