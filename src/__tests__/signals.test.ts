import { describe, it, expect } from 'vitest';
import { generateRealSignals, THAI_STOCKS, generateThaiStockSignals } from '../services/apiClient';
import { LIVE_CRYPTO_FEED } from './fixtures/liveCryptoFeed';
import type { CryptoCoin } from '../types';

const coin = (over: Partial<CryptoCoin>): CryptoCoin => ({
  id: 'bitcoin',
  symbol: 'BTC',
  name: 'Bitcoin',
  binanceSymbol: 'BTCUSDT',
  price: 90000,
  change: 0,
  high: 91000,
  low: 89000,
  volume: 30_000_000,
  flash: 'NONE',
  ...over,
});

describe('generateRealSignals', () => {
  it('emits one signal per coin', () => {
    expect(generateRealSignals(LIVE_CRYPTO_FEED)).toHaveLength(LIVE_CRYPTO_FEED.length);
  });

  it('maps positive change to LONG and negative change to SHORT', () => {
    const [up] = generateRealSignals([coin({ change: 2.5 })]);
    const [down] = generateRealSignals([coin({ change: -2.5 })]);
    expect(up.type).toBe('LONG');
    expect(down.type).toBe('SHORT');
  });

  it('keeps stop loss and take profit on the correct side of price', () => {
    for (const signal of generateRealSignals(LIVE_CRYPTO_FEED)) {
      if (signal.type === 'LONG') {
        expect(signal.sl).toBeLessThan(signal.price);
        expect(signal.tp).toBeGreaterThan(signal.price);
        expect(signal.support).toBeLessThanOrEqual(signal.price);
        expect(signal.resistance).toBeGreaterThanOrEqual(signal.price);
      } else {
        expect(signal.sl).toBeGreaterThan(signal.price);
        expect(signal.tp).toBeLessThan(signal.price);
      }
    }
  });

  it('clamps probability and similarity into their documented ranges', () => {
    // Extreme inputs must not escape the UI contract (55–94 / 70–97).
    const shocks = [
      coin({ change: 0 }),
      coin({ change: 99, volume: 1e12 }),
      coin({ change: -99, volume: 0 }),
      coin({ change: 5, volume: 1 }),
    ];
    for (const signal of generateRealSignals(shocks)) {
      expect(signal.probability).toBeGreaterThanOrEqual(55);
      expect(signal.probability).toBeLessThanOrEqual(94);
      expect(signal.similarity).toBeGreaterThanOrEqual(70);
      expect(signal.similarity).toBeLessThanOrEqual(97);
      expect(Number.isFinite(signal.sl)).toBe(true);
      expect(Number.isFinite(signal.tp)).toBe(true);
      expect(signal.price).toBeGreaterThan(0);
    }
  });

  it('emits no signal at all when the feed has no real price', () => {
    // เดิมเทสต์นี้ยืนยัน "fallback ไปราคาอ้างอิง" ซึ่งเป็นต้นเหตุของบั๊กจริง:
    // การ์ดโชว์ราคาสด $71,361 แต่ SL ออกมา $90,364 เพราะคำนวณจากราคาสมมติ 92,500
    // สัญญาณที่ไม่มีราคาจริง = ไม่มีสัญญาณ (ดีกว่าแผนเทรดที่ใช้ไม่ได้)
    expect(generateRealSignals([coin({ symbol: 'BTC', price: 0 })])).toEqual([]);
    expect(generateRealSignals([coin({ symbol: 'BTC', price: Number.NaN })])).toEqual([]);
    expect(generateRealSignals([coin({ symbol: 'BTC', price: 0 }), coin({ symbol: 'ETH', price: 3450 })])).toHaveLength(1);
  });

  it('keeps SL/TP on the correct side of the price for both directions', () => {
    const [long] = generateRealSignals([coin({ symbol: 'BTC', price: 71361, change: 2.4 })]);
    expect(long.type).toBe('LONG');
    expect(long.sl).toBeLessThan(long.price);
    expect(long.tp).toBeGreaterThan(long.price);

    const [short] = generateRealSignals([coin({ symbol: 'BTC', price: 71361, change: -2.4 })]);
    expect(short.type).toBe('SHORT');
    expect(short.sl).toBeGreaterThan(short.price);
    expect(short.tp).toBeLessThan(short.price);
  });

  it('marks the ETF-flow figure as an estimate, never as a live number', () => {
    // Guards the honesty contract from CODE_REVIEW.md P2-2: these strings are
    // hardcoded per direction and must keep the "(ประเมิน)" qualifier.
    for (const signal of generateRealSignals(LIVE_CRYPTO_FEED)) {
      expect(signal.etfFlow).toContain('ประเมิน');
    }
  });
});

describe('generateThaiStockSignals', () => {
  it('produces a signal for every SET symbol with a positive price', () => {
    const signals = generateThaiStockSignals(THAI_STOCKS);
    expect(signals).toHaveLength(THAI_STOCKS.length);
    for (const signal of signals) {
      expect(signal.price).toBeGreaterThan(0);
      expect(['LONG', 'SHORT']).toContain(signal.type);
    }
  });
});
