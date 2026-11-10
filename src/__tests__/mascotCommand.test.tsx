// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

import { MascotOverlay } from '../components/MascotOverlay';
import { useMascotStore } from '../services/mascotService';
import { resetMascotAiCooldown } from '../services/mascotAiService';
import { resetMascotFeed } from '../mascot/feed';
import { resetMascotActionHandlers } from '../mascot/actions';

const DEFAULT_MESSAGE = 'สวัสดีครับ ผมมอเตอร์บอย พร้อมเป็น Co-Pilot ให้คุณแล้ว!';

/** Stub the network: `command` answers only the mascot-action route. */
function stubCommandRoute(payload: unknown, ok = true) {
  const spy = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = typeof input === 'string' ? input : String(input);
    if (url.includes('/api/gemini/mascot-action')) {
      return { ok, json: async () => payload } as unknown as Response;
    }
    throw new Error('offline');
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

function openBubble() {
  fireEvent.click(screen.getByRole('button', { name: /น้องมอเตอร์บอย/ }));
  return screen.getByLabelText('สั่งงานน้องมอเตอร์บอย') as HTMLInputElement;
}

function typeAndSend(text: string) {
  const input = openBubble();
  fireEvent.change(input, { target: { value: text } });
  fireEvent.submit(input.closest('form') as HTMLFormElement);
}

beforeEach(() => {
  resetMascotAiCooldown();
  resetMascotFeed();
  resetMascotActionHandlers();
  localStorage.clear();
  useMascotStore.setState({ state: 'IDLE', message: DEFAULT_MESSAGE });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  resetMascotActionHandlers();
});

const overlay = () => <MascotOverlay disableEndingsFeed disableAutoPilot />;

describe('MascotOverlay — typed commands', () => {
  it('does not render a command box until the bubble is open', () => {
    render(overlay());
    expect(screen.queryByLabelText('สั่งงานน้องมอเตอร์บอย')).toBeNull();
    openBubble();
    expect(screen.getByLabelText('สั่งงานน้องมอเตอร์บอย')).toBeTruthy();
  });

  it('sends the sentence, shows the reply and dispatches the verb', async () => {
    const spy = stubCommandRoute({
      reply: 'จัดให้แล้วครับ',
      action: { name: 'change_asset', args: { symbol: 'btc', market: 'crypto' } },
    });
    const handler = vi.fn();
    const { registerMascotActionHandlers } = await import('../mascot/actions');
    registerMascotActionHandlers({ change_asset: handler });

    render(overlay());
    typeAndSend('ขอดูบิทคอยน์หน่อย');

    await waitFor(() => expect(screen.getByText('จัดให้แล้วครับ')).toBeTruthy());
    expect(handler).toHaveBeenCalledWith({
      name: 'change_asset',
      symbol: 'BTC',
      market: 'crypto',
    });

    const commandCall = spy.mock.calls.find(([input]) =>
      String(input).includes('/api/gemini/mascot-action')
    );
    expect(commandCall).toBeTruthy();
    const body = JSON.parse((commandCall![1] as RequestInit).body as string);
    expect(body.text).toBe('ขอดูบิทคอยน์หน่อย');
    expect(typeof body.marketBrief).toBe('string');
  });

  it('shows the reply even when no verb is returned (plain conversation)', async () => {
    stubCommandRoute({ reply: 'ตลาดวันนี้เงียบครับ' });
    render(overlay());
    typeAndSend('วันนี้เป็นไงบ้าง');
    await waitFor(() => expect(screen.getByText('ตลาดวันนี้เงียบครับ')).toBeTruthy());
  });

  it('still shows the reply when the verb has no handler registered', async () => {
    stubCommandRoute({
      reply: 'เปิดหน้าข่าวให้นะ',
      action: { name: 'open_news', args: { topic: 'fed' } },
    });
    render(overlay());
    typeAndSend('ข่าวเฟด');
    await waitFor(() => expect(screen.getByText('เปิดหน้าข่าวให้นะ')).toBeTruthy());
  });

  it('apologises in Thai when the server is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('offline');
    }));
    render(overlay());
    typeAndSend('เปิด BTC');
    await waitFor(() =>
      expect(screen.getByText(/ต่อเซิร์ฟเวอร์ไม่ได้/)).toBeTruthy()
    );
  });

  it('drops a hallucinated verb instead of dispatching it', async () => {
    stubCommandRoute({
      reply: 'ทำได้แค่นavigate ครับ',
      action: { name: 'place_order', args: { symbol: 'BTC', side: 'buy' } },
    });
    const handler = vi.fn();
    const { registerMascotActionHandlers } = await import('../mascot/actions');
    registerMascotActionHandlers({
      change_asset: handler,
      filter_stocks: handler,
      open_news: handler,
      open_chat: handler,
    });

    render(overlay());
    typeAndSend('ซื้อ BTC');
    await waitFor(() => expect(screen.getByText('ทำได้แค่นavigate ครับ')).toBeTruthy());
    expect(handler).not.toHaveBeenCalled();
  });
});
