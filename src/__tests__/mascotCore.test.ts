// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';

import {
  FACE_ID,
  REALISM_PCT,
  FACE_LOCK,
  MASCOT_FACE_ATTR,
  MASCOT_ROOT_ATTR,
  canMountFace,
  checksum,
  countMountedFaces,
  findFaceMismatches,
  verifyFaceLock,
  type FaceQueryRoot,
} from '../mascot/core';
import {
  PROJECTS,
  bridgeLegacyState,
  decideMount,
  getProjectAssets,
  resolveMascot,
  resolveSkin,
} from '../mascot/adapter';
import { DECLARED_PROJECT_SKINS, TRADING_SKIN, getSkin, poseVisual } from '../mascot/skins';
import {
  AUTO_HIDE_AFTER_SPEAK_MS,
  AVOID_DISTANCE_PX,
  MINIMIZE_AFTER_MS,
  NEVER_BLOCK_SELECTOR,
  distanceToRect,
  ghostOpacity,
  isNearProtected,
  onboardingTarget,
  resolvePose,
  shouldKnock,
  shouldMinimize,
} from '../mascot/guard';
import {
  JOURNAL_MAX_ENTRIES,
  clearJournal,
  loadJournal,
  loadMascotSettings,
  recordEnding,
  saveMascotSettings,
  summarizeJournal,
} from '../mascot/journal';
import type { EndingResult, PoseId } from '../mascot/types';

/**
 * MOTORBOY CENTRAL V4.1 — the contract tests.
 *
 * These are the tests that make the spec enforceable: L1 identity cannot drift,
 * L2 cannot mount a second face or leak one project's art into another, L3 can
 * change freely, and the guard's ten rules behave like rules (not vibes).
 */

const ending = (type: EndingResult['type'], prob = 74): EndingResult => ({
  type,
  prob,
  target: 100,
  support: 95,
  resistance: 105,
  oneLineTH: 'ประโยคเดียว',
  reasons: ['test'],
  at: new Date(0).toISOString(),
});

/** Duck-typed DOM stub so the one-face checker is testable without a browser. */
function fakeRoot(roots: number, faces: Array<string | null>): FaceQueryRoot {
  return {
    querySelectorAll(selector: string) {
      if (selector.includes(MASCOT_ROOT_ATTR)) {
        return Array.from({ length: roots }, () => ({ getAttribute: () => '' }));
      }
      if (selector.includes(MASCOT_FACE_ATTR)) {
        return faces.map((face) => ({
          getAttribute: (name: string) => (name === MASCOT_FACE_ATTR ? face : null),
        }));
      }
      return [];
    },
  };
}

describe('L1 CORE — identity lock (read-only by contract)', () => {
  it('exposes the frozen master identity at 60% realism', () => {
    expect(FACE_ID).toBe('MB-33-MASTER-001');
    expect(REALISM_PCT).toBe(60);
    expect(FACE_LOCK.realismPct).toBe(60);
    expect(FACE_LOCK.faceId).toBe(FACE_ID);
    expect(FACE_LOCK.hash).toMatch(/^MB[0-9A-F]{8}$/);
    expect(verifyFaceLock().ok).toBe(true);
  });

  it('locks the five facial features that define the character', () => {
    expect(FACE_LOCK.features).toHaveLength(5);
    const all = FACE_LOCK.features.join(' ');
    expect(all).toContain('egg-shaped head');
    expect(all).toContain('dark brown');
    expect(all).toContain('smoke-black hair');
    expect(all).toContain('three-part');
    expect(all).toContain('cool');
  });

  it('is immutable at runtime, so a stray edit fails loudly', () => {
    expect(Object.isFrozen(FACE_LOCK)).toBe(true);
    expect(Object.isFrozen(FACE_LOCK.features)).toBe(true);
    expect(() => {
      (FACE_LOCK as unknown as { realismPct: number }).realismPct = 100;
    }).toThrow();
    expect(FACE_LOCK.realismPct).toBe(60);
  });

  it('detects tampering with the features, the realism or the hash', () => {
    expect(verifyFaceLock({ ...FACE_LOCK, features: [...FACE_LOCK.features, 'หูแหลม'] }).ok).toBe(false);
    expect(verifyFaceLock({ ...FACE_LOCK, realismPct: 80 }).ok).toBe(false);
    expect(verifyFaceLock({ ...FACE_LOCK, hash: 'MBDEADBEEF' }).ok).toBe(false);
  });

  it('checksums are stable and change with the input', () => {
    expect(checksum('motorboy')).toBe(checksum('motorboy'));
    expect(checksum('motorboy')).not.toBe(checksum('Motorboy'));
  });
});

describe('L1 CORE — one-face checker ("หน้าเบิ้ล")', () => {
  it('counts mounted roots and only allows the first mount', () => {
    expect(countMountedFaces(fakeRoot(0, []))).toBe(0);
    expect(canMountFace(fakeRoot(0, []))).toBe(true);
    expect(countMountedFaces(fakeRoot(1, [FACE_ID]))).toBe(1);
    expect(canMountFace(fakeRoot(1, [FACE_ID]))).toBe(false);
    expect(countMountedFaces(fakeRoot(2, [FACE_ID, FACE_ID]))).toBe(2);
  });

  it('never throws when there is no DOM (SSR, tests, worker)', () => {
    expect(countMountedFaces(null)).toBe(0);
    expect(countMountedFaces(undefined)).toBe(0);
    expect(canMountFace(null)).toBe(true);
    expect(findFaceMismatches(null)).toBe(0);
  });

  it('flags a mounted face that is not the master identity', () => {
    expect(findFaceMismatches(fakeRoot(1, [FACE_ID]))).toBe(0);
    expect(findFaceMismatches(fakeRoot(2, [FACE_ID, 'MB-ZENITSU-002']))).toBe(1);
    expect(findFaceMismatches(fakeRoot(2, ['X', 'Y']))).toBe(2);
  });
});

describe('L2 ADAPTER — namespaces, assets, mount decision', () => {
  it('declares exactly the four project namespaces', () => {
    expect(PROJECTS).toHaveLength(4);
    expect(new Set(PROJECTS).size).toBe(4);
    PROJECTS.forEach((id) => expect(id.startsWith('MOTORBOY.PROJECT.')).toBe(true));
  });

  it('never lets a project borrow another project’s art', () => {
    const trading = getProjectAssets('MOTORBOY.PROJECT.TRADING');
    expect(trading.hero).toBeTruthy();
    for (const id of PROJECTS.filter((p) => p !== 'MOTORBOY.PROJECT.TRADING')) {
      expect(getProjectAssets(id).hero).toBe('');
    }
  });

  it('resolves the master face for every project', () => {
    PROJECTS.forEach((id) => {
      expect(resolveMascot(id).faceId).toBe(FACE_ID);
      expect(resolveMascot(id).projectId).toBe(id);
    });
    expect(resolveMascot().projectId).toBe('MOTORBOY.PROJECT.TRADING');
  });

  it('refuses a second mount instead of stacking faces', () => {
    expect(decideMount(fakeRoot(0, []))).toEqual({ allowed: true, reason: 'OK' });
    expect(decideMount(fakeRoot(1, [FACE_ID]))).toEqual({
      allowed: false,
      reason: 'ALREADY_MOUNTED',
    });
  });

  it('bridges every V3.1 state onto a V4.1 pose', () => {
    expect(bridgeLegacyState('NORMAL')).toBe('IDLE');
    expect(bridgeLegacyState('SCAN')).toBe('WORK_ANALYZE');
    expect(bridgeLegacyState('GOD')).toBe('CLIMB_CANDLE');
    expect(bridgeLegacyState('MINI')).toBe('SLEEP_WAIT');
    expect(bridgeLegacyState('HIDDEN')).toBe('SLEEP_WAIT');
    expect(bridgeLegacyState('scan')).toBe('WORK_ANALYZE'); // case-insensitive
    expect(bridgeLegacyState(undefined)).toBe('IDLE');
    expect(bridgeLegacyState('something-else')).toBe('IDLE');
  });

  it('only ships a Trading skin today and says so explicitly', () => {
    expect(resolveSkin().palette).toEqual(TRADING_SKIN.palette);
    expect(getSkin('TRADING')).toBe(TRADING_SKIN);
    expect(DECLARED_PROJECT_SKINS['MOTORBOY.PROJECT.TRADING']).toBe('TRADING');
    expect(DECLARED_PROJECT_SKINS['MOTORBOY.PROJECT.TEMPLE']).toBeNull();
  });
});

describe('L3 SKIN — editable, per project, never touches core', () => {
  it('uses the spec palette: master black/red + trading bull/bear/signal', () => {
    const { palette } = TRADING_SKIN;
    expect(palette.masterBlack).toBe('#000000');
    expect(palette.primary).toBe('#FF0033');
    expect(palette.bull).toBe('#00E676');
    expect(palette.bear).toBe('#FF5252');
    expect(palette.signal).toBe('#00E5FF');
  });

  it('defines all nine poses as visuals', () => {
    const poses: PoseId[] = [
      'IDLE',
      'WALK_CHART',
      'CLIMB_CANDLE',
      'FALL_BREAK',
      'WORK_ANALYZE',
      'HAPPY_TP',
      'SAD_SL',
      'DRAG_FIBO',
      'SLEEP_WAIT',
    ];
    expect(Object.keys(TRADING_SKIN.poses)).toHaveLength(poses.length);
    poses.forEach((pose) => {
      const visual = poseVisual(pose);
      expect(visual.emoji.length).toBeGreaterThan(0);
      expect(visual.caption.length).toBeGreaterThan(0);
      expect(typeof visual.ring).toBe('string');
    });
    expect(TRADING_SKIN.onboardingLine).toContain('จุดจบเทรน');
  });

  it('falls back to IDLE rather than crashing on an unknown pose', () => {
    expect(poseVisual('NOPE' as PoseId)).toBe(TRADING_SKIN.poses.IDLE);
  });
});

describe('GUARD — the ten anti-block rules', () => {
  it('rule 1: hard-codes the spec’s never-block list plus every real control', () => {
    ['.buy-btn', '.sell-btn', '.price-label', '.tp-input', 'button', 'canvas'].forEach((sel) => {
      expect(NEVER_BLOCK_SELECTOR).toContain(sel);
    });
  });

  it('rules 2–3: 100px smart avoidance with a 50% ghost, never a hard hide', () => {
    expect(AVOID_DISTANCE_PX).toBe(100);
    const rect = { left: 100, top: 100, right: 200, bottom: 150 };
    expect(distanceToRect({ x: 150, y: 120 }, rect)).toBe(0); // inside
    expect(distanceToRect({ x: 150, y: 250 }, rect)).toBe(100); // straight below
    expect(distanceToRect({ x: 0, y: 0 }, rect)).toBeCloseTo(Math.hypot(100, 100), 6);

    expect(isNearProtected({ x: 150, y: 240 }, rect)).toBe(true);
    expect(isNearProtected({ x: 150, y: 260 }, rect)).toBe(false);
    expect(isNearProtected(null, rect)).toBe(false);

    expect(ghostOpacity(true)).toBe(0.5);
    expect(ghostOpacity(false)).toBe(1);
  });

  it('rule 4: minimizes to the 32px head after two idle minutes', () => {
    expect(MINIMIZE_AFTER_MS).toBe(120_000);
    const t0 = 1_000_000;
    expect(shouldMinimize(t0, t0 + MINIMIZE_AFTER_MS - 1)).toBe(false);
    expect(shouldMinimize(t0, t0 + MINIMIZE_AFTER_MS)).toBe(true);
  });

  it('rule 5: hides itself shortly after speaking', () => {
    expect(AUTO_HIDE_AFTER_SPEAK_MS).toBeLessThanOrEqual(5_000);
  });

  it('rule 7: onboarding points at real controls, in order', () => {
    expect(onboardingTarget(0)).toContain('chart');
    expect(onboardingTarget(1)).toBe('button');
    expect(onboardingTarget(99)).toBe(onboardingTarget(2));
  });

  it('§4 poses follow behaviour: state first, then the ending, then idleness', () => {
    expect(resolvePose({ mascotState: 'TP_CELEBRATE', idleMs: 0 })).toBe('HAPPY_TP');
    expect(resolvePose({ mascotState: 'SL_RESPECTED', idleMs: 0 })).toBe('SAD_SL');
    expect(resolvePose({ mascotState: 'SCANNING', idleMs: 0 })).toBe('WORK_ANALYZE');
    expect(resolvePose({ mascotState: 'READY_TO_EXECUTE', idleMs: 0 })).toBe('DRAG_FIBO');

    expect(resolvePose({ mascotState: 'IDLE', ending: ending('BULL_END'), idleMs: 0 })).toBe(
      'CLIMB_CANDLE'
    );
    expect(resolvePose({ mascotState: 'IDLE', ending: ending('BEAR_END'), idleMs: 0 })).toBe(
      'FALL_BREAK'
    );
    expect(resolvePose({ mascotState: 'IDLE', ending: ending('BREAKOUT_END'), idleMs: 0 })).toBe(
      'WORK_ANALYZE'
    );
    expect(resolvePose({ mascotState: 'IDLE', ending: ending('SIDEWAY_END'), idleMs: 0 })).toBe('IDLE');
    expect(
      resolvePose({ mascotState: 'IDLE', ending: ending('SIDEWAY_END'), idleMs: MINIMIZE_AFTER_MS })
    ).toBe('SLEEP_WAIT');
    expect(resolvePose({ mascotState: 'IDLE', idleMs: MINIMIZE_AFTER_MS })).toBe('SLEEP_WAIT');
  });

  it('rule 10: knocks only for BEAR_END, only when away, only if enabled', () => {
    const settings = { knockAlert: true, quietMode: false };
    expect(shouldKnock(ending('BEAR_END'), settings, true)).toBe(true);
    expect(shouldKnock(ending('BEAR_END'), settings, false)).toBe(false);
    expect(shouldKnock(ending('BEAR_END'), { knockAlert: true, quietMode: true }, false)).toBe(true);
    expect(shouldKnock(ending('BEAR_END'), { knockAlert: false, quietMode: true }, true)).toBe(false);
    expect(shouldKnock(ending('BULL_END'), settings, true)).toBe(false);
    expect(shouldKnock(null, settings, true)).toBe(false);
  });
});

describe('JOURNAL — auto journal + quiet/knock settings (§6.6, §6.8)', () => {
  beforeEach(() => {
    localStorage.clear();
    clearJournal();
  });

  it('records the first ending and de-duplicates repeats inside the window', () => {
    const first = recordEnding(ending('BEAR_END'), { symbol: 'BTCUSDT', now: 0 });
    expect(first.recorded).toBe(true);
    expect(first.entries).toHaveLength(1);

    const repeat = recordEnding(ending('BEAR_END'), { symbol: 'BTCUSDT', now: 60_000 });
    expect(repeat.recorded).toBe(false);
    expect(repeat.entries).toHaveLength(1);

    const later = recordEnding(ending('BEAR_END'), { symbol: 'BTCUSDT', now: 10 * 60_000 });
    expect(later.recorded).toBe(true);
    expect(later.entries).toHaveLength(2);

    const otherSymbol = recordEnding(ending('BEAR_END'), { symbol: 'ETHUSDT', now: 10 * 60_000 });
    expect(otherSymbol.recorded).toBe(true);
  });

  it('keeps the journal bounded so a long session cannot grow forever', () => {
    for (let i = 0; i < JOURNAL_MAX_ENTRIES + 12; i += 1) {
      recordEnding(ending('BULL_END'), { symbol: `S${i}`, now: i, dedupeMs: 0 });
    }
    const entries = loadJournal();
    expect(entries).toHaveLength(JOURNAL_MAX_ENTRIES);
    expect(entries[0].symbol).toBe(`S${JOURNAL_MAX_ENTRIES + 11}`); // newest first
  });

  it('summarizes by type for the overlay tooltip', () => {
    recordEnding(ending('BULL_END'), { symbol: 'A', now: 0, dedupeMs: 0 });
    recordEnding(ending('BEAR_END'), { symbol: 'B', now: 1, dedupeMs: 0 });
    const summary = summarizeJournal();
    expect(summary.total).toBe(2);
    expect(summary.byType.BULL_END).toBe(1);
    expect(summary.byType.BEAR_END).toBe(1);
    expect(summary.latest.type).toBe('BEAR_END');
  });

  it('persists quiet mode and knock preferences', () => {
    expect(loadMascotSettings()).toEqual({ quietMode: false, knockAlert: true, hidden: false });
    saveMascotSettings({ quietMode: true });
    saveMascotSettings({ knockAlert: false });
    expect(loadMascotSettings()).toEqual({ quietMode: true, knockAlert: false, hidden: false });
  });
});
