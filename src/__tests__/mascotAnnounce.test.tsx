// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';

import { MascotOverlay } from '../components/MascotOverlay';
import {
  announceMascot,
  resetMascotAnnouncements,
  useMascotAnnouncements,
  MASCOT_ANNOUNCE_MIN_INTERVAL_MS,
} from '../mascot/announce';
import { useMascotStore } from '../services/mascotService';
import { resetMascotAiCooldown } from '../services/mascotAiService';
import { resetMascotFeed } from '../mascot/feed';
import { saveMascotSettings, loadMascotSettings } from '../mascot/journal';

beforeEach(() => {
  resetMascotAnnouncements();
  resetMascotAiCooldown();
  resetMascotFeed();
  localStorage.clear();
  useMascotStore.setState({ state: 'IDLE', message: 'สวัสดีครับ' });
  vi.stubGlobal('fetch', vi.fn(async () => {
    throw new Error('offline');
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  resetMascotAnnouncements();
});

describe('announceMascot — one line, one time', () => {
  it('publishes a trimmed, capped line and returns true', () => {
    expect(announceMascot('  เพิ่ม BTC เข้า watchlist แล้ว  ', { now: 1_000 })).toBe(true);
    expect(useMascotAnnouncements.getState().current?.text).toBe('เพิ่ม BTC เข้า watchlist แล้ว');
  });

  it('drops empty input', () => {
    expect(announceMascot('   ', { now: 1_000 })).toBe(false);
    expect(useMascotAnnouncements.getState().current).toBeNull();
  });

  it('caps runaway text at 140 characters', () => {
    announceMascot('ก'.repeat(400), { now: 1_000 });
    expect(useMascotAnnouncements.getState().current?.text).toHaveLength(140);
  });

  it('throttles so a burst of events does not machine-gun the bubble', () => {
    expect(announceMascot('หนึ่ง', { now: 1_000 })).toBe(true);
    expect(announceMascot('สอง', { now: 1_000 + MASCOT_ANNOUNCE_MIN_INTERVAL_MS - 1 })).toBe(false);
    expect(announceMascot('สาม', { now: 1_000 + MASCOT_ANNOUNCE_MIN_INTERVAL_MS })).toBe(true);
  });

  it('drops an immediate repeat but allows it later', () => {
    expect(announceMascot('เพิ่ม BTC แล้ว', { now: 1_000 })).toBe(true);
    expect(announceMascot('เพิ่ม BTC แล้ว', { now: 1_000 + MASCOT_ANNOUNCE_MIN_INTERVAL_MS })).toBe(
      false
    );
    expect(announceMascot('เพิ่ม BTC แล้ว', { now: 1_000 + 31_000 })).toBe(true);
  });

  it('force bypasses the throttle (explicit user-triggered lines)', () => {
    announceMascot('หนึ่ง', { now: 1_000 });
    expect(announceMascot('สอง', { now: 1_100, force: true })).toBe(true);
  });

  it('bumps the id every accepted line so the overlay can react', () => {
    announceMascot('หนึ่ง', { now: 1_000 });
    const first = useMascotAnnouncements.getState().current!.id;
    announceMascot('สอง', { now: 1_000 + MASCOT_ANNOUNCE_MIN_INTERVAL_MS });
    expect(useMascotAnnouncements.getState().current!.id).toBeGreaterThan(first);
  });
});

describe('MascotOverlay — speaks context events', () => {
  it('opens the bubble and says the line, without touching the market state', async () => {
    render(<MascotOverlay disableEndingsFeed disableAutoPilot />);
    expect(screen.queryByText('เพิ่ม BTC เข้า watchlist ให้แล้วครับ')).toBeNull();

    announceMascot('เพิ่ม BTC เข้า watchlist ให้แล้วครับ');

    await waitFor(() =>
      expect(screen.getByText('เพิ่ม BTC เข้า watchlist ให้แล้วครับ')).toBeTruthy()
    );
    expect(useMascotStore.getState().state).toBe('IDLE'); // announcement ≠ risk state
  });

  it('stays shut in quiet mode', async () => {
    saveMascotSettings({ ...loadMascotSettings(), quietMode: true });
    render(<MascotOverlay disableEndingsFeed disableAutoPilot />);
    announceMascot('อ่านครบแล้วครับ');
    await waitFor(() => expect(useMascotAnnouncements.getState().current).not.toBeNull());
    expect(screen.queryByText('อ่านครบแล้วครับ')).toBeNull();
  });
});
