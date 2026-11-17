import { describe, it, expect, beforeEach } from 'vitest';
import {
  MASCOT_ACTION_CATALOG,
  describeMascotAction,
  dispatchMascotAction,
  parseMascotAction,
  registerMascotActionHandlers,
  resetMascotActionHandlers,
} from '../mascot/actions';

beforeEach(() => {
  resetMascotActionHandlers();
});

describe('parseMascotAction — accepts the whitelist', () => {
  it('accepts change_asset with a market', () => {
    expect(parseMascotAction({ name: 'change_asset', args: { symbol: 'BTC', market: 'crypto' } })).toEqual({
      name: 'change_asset',
      symbol: 'BTC',
      market: 'crypto',
    });
  });

  it('accepts change_asset without a market', () => {
    expect(parseMascotAction({ name: 'change_asset', args: { symbol: 'AAPL' } })).toEqual({
      name: 'change_asset',
      symbol: 'AAPL',
    });
  });

  it('accepts filter_stocks', () => {
    expect(parseMascotAction({ name: 'filter_stocks', args: { query: 'bank' } })).toEqual({
      name: 'filter_stocks',
      query: 'bank',
    });
  });

  it('accepts open_news and open_chat with no args at all', () => {
    expect(parseMascotAction({ name: 'open_news' })).toEqual({ name: 'open_news' });
    expect(parseMascotAction({ name: 'open_chat', args: {} })).toEqual({ name: 'open_chat' });
  });

  it('trims strings and drops empty topics instead of emitting junk', () => {
    expect(parseMascotAction({ name: 'filter_stocks', args: { query: '   ' } })).toBeNull();
    expect(parseMascotAction({ name: 'open_news', args: { topic: '   ' } })).toEqual({
      name: 'open_news',
    });
  });
});

describe('parseMascotAction — rejects anything else', () => {
  it('rejects an unknown verb', () => {
    expect(parseMascotAction({ name: 'place_order', args: { symbol: 'BTC' } })).toBeNull();
    expect(parseMascotAction({ name: 'click_button', args: {} })).toBeNull();
  });

  it('rejects a missing or malformed symbol', () => {
    expect(parseMascotAction({ name: 'change_asset', args: {} })).toBeNull();
    expect(parseMascotAction({ name: 'change_asset', args: { symbol: '<script>' } })).toBeNull();
    expect(
      parseMascotAction({ name: 'change_asset', args: { symbol: 'A'.repeat(16) } })
    ).toBeNull();
  });

  it('rejects an unknown market instead of forwarding it', () => {
    expect(
      parseMascotAction({ name: 'change_asset', args: { symbol: 'BTC', market: 'options' } })
    ).toEqual({ name: 'change_asset', symbol: 'BTC' });
  });

  it('rejects over-long queries and non-strings', () => {
    expect(parseMascotAction({ name: 'filter_stocks', args: { query: 'x'.repeat(41) } })).toEqual({
      name: 'filter_stocks',
      query: 'x'.repeat(40),
    });
    expect(parseMascotAction({ name: 'filter_stocks', args: { query: 42 } })).toBeNull();
  });

  it('ignores null, strings and arrays', () => {
    expect(parseMascotAction(null)).toBeNull();
    expect(parseMascotAction(undefined)).toBeNull();
    expect(parseMascotAction('change_asset')).toBeNull();
    expect(parseMascotAction([])).toBeNull();
    expect(parseMascotAction({ args: { symbol: 'BTC' } })).toBeNull();
  });

  it('never forwards hallucinated extra fields', () => {
    const parsed = parseMascotAction({
      name: 'change_asset',
      args: { symbol: 'BTC', amount: 10000, side: 'buy', leverage: 20 },
    });
    expect(parsed).toEqual({ name: 'change_asset', symbol: 'BTC' });
    expect(parsed).not.toHaveProperty('amount');
    expect(parsed).not.toHaveProperty('side');
  });
});

describe('dispatchMascotAction', () => {
  it('returns false when nobody is listening', () => {
    expect(dispatchMascotAction({ name: 'open_news' })).toBe(false);
    expect(dispatchMascotAction(null)).toBe(false);
  });

  it('returns false when that verb has no handler', () => {
    registerMascotActionHandlers({ open_news: () => {} });
    expect(dispatchMascotAction({ name: 'open_chat' })).toBe(false);
  });

  it('calls the registered handler and reports true', () => {
    const seen: string[] = [];
    registerMascotActionHandlers({ change_asset: (action) => seen.push(action.name) });
    expect(dispatchMascotAction({ name: 'change_asset', symbol: 'BTC' })).toBe(true);
    expect(seen).toEqual(['change_asset']);
  });

  it('swallows a throwing handler', () => {
    registerMascotActionHandlers({
      open_news: () => {
        throw new Error('boom');
      },
    });
    expect(() => dispatchMascotAction({ name: 'open_news' })).not.toThrow();
    expect(dispatchMascotAction({ name: 'open_news' })).toBe(false);
  });

  it('unregisters on teardown', () => {
    const unregister = registerMascotActionHandlers({ open_chat: () => {} });
    unregister();
    expect(dispatchMascotAction({ name: 'open_chat' })).toBe(false);
  });
});

describe('describeMascotAction', () => {
  it('gives a short Thai confirmation per verb', () => {
    expect(describeMascotAction({ name: 'change_asset', symbol: 'BTC' })).toBe(
      'เปิด BTC ให้แล้วครับ'
    );
    expect(describeMascotAction({ name: 'filter_stocks', query: 'bank' })).toContain('bank');
    expect(describeMascotAction({ name: 'open_news' })).toContain('ข่าว');
    expect(describeMascotAction({ name: 'open_chat' })).toContain('แชท');
  });
});

describe('MASCOT_ACTION_CATALOG', () => {
  it('documents every verb and nothing about order placement', () => {
    for (const verb of ['change_asset', 'filter_stocks', 'open_news', 'open_chat', 'open_window', 'inspect_asset', 'toggle_currency']) {
      expect(MASCOT_ACTION_CATALOG).toContain(verb);
    }
    expect(MASCOT_ACTION_CATALOG.toLowerCase()).not.toContain('order');
  });
});

describe('extended dynamic sandbox capabilities', () => {
  it('validates open_window, close_window, inspect_asset, set_price_alert, toggle_currency, and rejects invalid targets', async () => {
    const { MASCOT_SANDBOX_CAPABILITIES, parseMascotActions, dispatchMascotActions } = await import(
      '../mascot/actions'
    );
    expect(MASCOT_SANDBOX_CAPABILITIES.length).toBeGreaterThanOrEqual(15);

    expect(parseMascotAction({ name: 'open_window', args: { window: 'backtest' } })).toEqual({
      name: 'open_window',
      window: 'backtest',
    });
    expect(parseMascotAction({ name: 'open_window', args: { window: 'invalid_modal' } })).toBeNull();
    expect(parseMascotAction({ name: 'close_window', args: { window: 'all' } })).toEqual({
      name: 'close_window',
      window: 'all',
    });
    expect(parseMascotAction({ name: 'inspect_asset', args: { symbol: 'nvda', market: 'us' } })).toEqual({
      name: 'inspect_asset',
      symbol: 'NVDA',
      market: 'us',
    });
    expect(parseMascotAction({ name: 'set_price_alert', args: { symbol: 'btc', targetPrice: 95000 } })).toEqual({
      name: 'set_price_alert',
      symbol: 'BTC',
      targetPrice: 95000,
    });
    expect(parseMascotAction({ name: 'set_price_alert', args: { symbol: 'btc', targetPrice: -10 } })).toBeNull();
    expect(parseMascotAction({ name: 'toggle_currency', args: { currency: 'THB' } })).toEqual({
      name: 'toggle_currency',
      currency: 'THB',
    });

    const parsedMulti = parseMascotActions([
      { name: 'switch_market_tab', args: { market: 'th' } },
      { name: 'place_order', args: { symbol: 'PTT' } }, // dropped
      { name: 'inspect_asset', args: { symbol: 'PTT', market: 'th' } },
    ]);
    expect(parsedMulti).toHaveLength(2);

    const called: string[] = [];
    registerMascotActionHandlers({
      switch_market_tab: (a) => called.push(a.name),
      inspect_asset: (a) => called.push(a.name),
    });
    expect(dispatchMascotActions(parsedMulti)).toBe(2);
    expect(called).toEqual(['switch_market_tab', 'inspect_asset']);
  });
});
