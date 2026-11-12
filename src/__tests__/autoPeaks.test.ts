// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  AUTO_PEAK_STORAGE_KEY,
  autoPeakValues,
  loadAutoPeaks,
  observationsFromFeeds,
  saveAutoPeaks,
  trackPeaks,
  type AutoPeakBook,
} from '../services/peakTracker';
import { buildDrawdownAssets, DEFAULT_THRESHOLDS } from '../services/drawdownService';
import { formatAsOf, formatAsOfLabel } from '../utils';
import { SEED_SNAPSHOT_AT, SEED_STAMP, THAI_STOCKS, FOREIGN_STOCKS } from './fixtures/seedReexport';

const NOW = '2026-11-12T09:00:00.000Z';
const LATER = '2026-11-12T09:15:00.000Z';

describe('AI auto peaks — high-water mark tracker', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('sets a peak the first time it sees a price (no manual onboarding)', () => {
    const book = trackPeaks({}, [{ symbol: 'btc', price: 70000 }], NOW);
    expect(book.BTC).toEqual({ peak: 70000, at: NOW });
  });

  it('only moves the peak up, never down', () => {
    const up = trackPeaks({}, [{ symbol: 'BTC', price: 70000 }], NOW);
    const dip = trackPeaks(up, [{ symbol: 'BTC', price: 65000 }], LATER);
    expect(dip).toBe(up); // nothing changed → same reference, no re-render churn
    expect(dip.BTC.peak).toBe(70000);

    const high = trackPeaks(dip, [{ symbol: 'BTC', price: 74000 }], LATER);
    expect(high.BTC).toEqual({ peak: 74000, at: LATER });
  });

  it('ignores unusable prices instead of storing 0 or NaN', () => {
    const book = trackPeaks(
      {},
      [
        { symbol: 'ZERO', price: 0 },
        { symbol: 'NAN', price: Number.NaN },
        { symbol: 'NEG', price: -1 },
        { symbol: 'OK', price: 1.5 },
      ],
      NOW
    );
    expect(Object.keys(book)).toEqual(['OK']);
  });

  it('picks observations out of every live feed', () => {
    const observations = observationsFromFeeds({
      cryptoList: [{ id: 'btc', symbol: 'BTC', name: 'Bitcoin', binanceSymbol: 'BTCUSDT', price: 92000, change: 1 }],
      thaiStocks: [{ symbol: 'PTT', name: 'ปตท.', nameEn: 'PTT', price: 34.5, change: 0.5 } as never],
      foreignStocks: [{ symbol: 'AAPL', name: 'Apple', price: 200, change: 1 } as never],
      forexRates: [{ pair: 'USD/THB', price: 36.45, change: 0 } as never],
    });
    expect(observations.map((o) => o.symbol).sort()).toEqual(['AAPL', 'BTC', 'PTT', 'USD/THB']);
    expect(autoPeakValues(trackPeaks({}, observations, NOW))).toEqual({
      AAPL: 200,
      BTC: 92000,
      PTT: 34.5,
      'USD/THB': 36.45,
    });
  });

  it('never builds a peak out of stale/seed prices (isLive === false)', () => {
    const observations = observationsFromFeeds({
      thaiStocks: [
        { symbol: 'PTT', name: 'ปตท.', nameEn: 'PTT', price: 34.5, change: 0.5, isLive: false, updatedAt: SEED_SNAPSHOT_AT } as never,
      ],
      cryptoList: [{ id: 'btc', symbol: 'BTC', name: 'Bitcoin', binanceSymbol: 'BTCUSDT', price: 90000, change: 1 }],
    });
    expect(observations.map((o) => o.symbol)).toEqual(['BTC']);
  });

  it('persists and reloads the book, dropping corrupt entries', () => {
    const book: AutoPeakBook = { BTC: { peak: 70000, at: NOW } };
    saveAutoPeaks(book);
    expect(JSON.parse(localStorage.getItem(AUTO_PEAK_STORAGE_KEY) as string)).toEqual(book);

    localStorage.setItem(
      AUTO_PEAK_STORAGE_KEY,
      JSON.stringify({ BTC: { peak: 70000, at: NOW }, BAD: { peak: 0 }, JUNK: 'nope' })
    );
    expect(Object.keys(loadAutoPeaks())).toEqual(['BTC']);
  });

  it('survives corrupt JSON without throwing', () => {
    localStorage.setItem(AUTO_PEAK_STORAGE_KEY, '{not json');
    expect(loadAutoPeaks()).toEqual({});
  });
});

describe('drawdown — AI-filled reference points', () => {
  const crypto = [{ id: 'btc', symbol: 'BTC', name: 'Bitcoin', binanceSymbol: 'BTCUSDT', price: 70000, change: 1 }];

  it('falls back to the AI peak so the asset is monitored without user input', () => {
    const [asset] = buildDrawdownAssets({
      cryptoList: crypto,
      thresholds: DEFAULT_THRESHOLDS,
      autoPeaks: { BTC: 77777.78 },
    });
    expect(asset.referenceSource).toBe('AI_AUTO');
    expect(asset.currentDrawdownPct).toBe(-10);
    expect(asset.status).toBe('WARNING');
  });

  it('lets a user-set peak win over the AI peak', () => {
    const [asset] = buildDrawdownAssets({
      cryptoList: crypto,
      thresholds: DEFAULT_THRESHOLDS,
      customPeaks: { BTC: 80000 },
      autoPeaks: { BTC: 100000 },
    });
    expect(asset.referenceSource).toBe('CUSTOM');
    expect(asset.peakPrice).toBe(80000);
  });

  it('prefers the higher of AI peak and provider 52w high', () => {
    const [lower] = buildDrawdownAssets({
      foreignStocks: [{ symbol: 'AAPL', name: 'Apple', price: 100, change: 0, high52w: 200 } as never],
      thresholds: DEFAULT_THRESHOLDS,
      autoPeaks: { AAPL: 150 },
    });
    expect(lower.referenceSource).toBe('API_52W');
    expect(lower.peakPrice).toBe(200);

    const [higher] = buildDrawdownAssets({
      foreignStocks: [{ symbol: 'AAPL', name: 'Apple', price: 100, change: 0, high52w: 200 } as never],
      thresholds: DEFAULT_THRESHOLDS,
      autoPeaks: { AAPL: 250 },
    });
    expect(higher.referenceSource).toBe('AI_AUTO');
    expect(higher.peakPrice).toBe(250);
  });

  it('rejects an AI peak that is below the current price (not a peak)', () => {
    const [asset] = buildDrawdownAssets({
      cryptoList: crypto,
      thresholds: DEFAULT_THRESHOLDS,
      autoPeaks: { BTC: 60000 },
    });
    expect(asset.referenceSource).toBe('NONE');
    expect(asset.currentDrawdownPct).toBe(0);
  });
});

describe('seed snapshots carry an as-of timestamp', () => {
  it('stamps every static stock/index row as not-live with a time', () => {
    expect(SEED_STAMP).toBe(SEED_SNAPSHOT_AT);
    [...THAI_STOCKS, ...FOREIGN_STOCKS].forEach((stock) => {
      expect(stock.isLive).toBe(false);
      expect(stock.updatedAt).toBe(SEED_SNAPSHOT_AT);
    });
  });

  it('formats the stamp in ICT with a Thai prefix', () => {
    // Thai locale → พ.ศ. (2569) พร้อมเวลา 24 ชม. ในเขต ICT
    expect(formatAsOf(SEED_SNAPSHOT_AT)).toMatch(/^\d{1,2} .+ \d{4} \d{2}:\d{2}$/);
    expect(formatAsOfLabel(SEED_SNAPSHOT_AT).startsWith('ณ ')).toBe(true);
    expect(formatAsOf(undefined)).toBe('');
    expect(formatAsOf('not-a-date')).toBe('');
  });
});
