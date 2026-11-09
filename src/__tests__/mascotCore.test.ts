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
import {
  DECLARED_PROJECT_SKINS,
  MASTER_BRAND,
  TRADING_SKIN,
  getSkin,
  poseVisual,
} from '../mascot/skins';
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
import {
  ART_TRACKS,
  BOOKS,
  MAIN_ART_TRACK,
  CALM_BRAND,
  MASCOT_SET,
  MOODS,
  POSE_MOOD,
  RUST_MODERN_COLORS,
  RUST_MODERN_CSS,
  RUST_MODERN_LAYOUT,
  RUST_MODERN_LINES,
  RUST_MODERN_SHADOWS,
  RUST_MODERN_TYPE,
  TEXTURE_RATIO,
  artTracksFor,
  moodForPose,
} from '../mascot/tokens';
import type { BookId, EndingResult, MoodId, PoseId } from '../mascot/types';

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

describe('v4.4 RUST x MODERN — design tokens (encoded, not imposed)', () => {
  it('carries the exact spec palette', () => {
    expect(RUST_MODERN_COLORS.brandAccent).toBe('#7C6CFF');
    expect(RUST_MODERN_COLORS.dangerRed).toBe('#FF0033');
    expect(RUST_MODERN_COLORS.violet).toBe('#8A2BE2');
    expect(RUST_MODERN_COLORS.neonBlue).toBe('#00E5FF');
    expect(RUST_MODERN_COLORS.neonGreen).toBe('#39FF14');
    expect(RUST_MODERN_COLORS.rust).toBe('#8A4B2A');
    expect(RUST_MODERN_COLORS.rustLight).toBe('#C97B2A');
    expect(RUST_MODERN_COLORS.metal).toBe('#9AA0A8');
    expect(RUST_MODERN_COLORS.metalDark).toBe('#2A2E45');
    expect(RUST_MODERN_COLORS.paper).toBe('#F7F5F0');
    expect(RUST_MODERN_COLORS.midnight).toBe('#0F1117');
    expect(RUST_MODERN_COLORS.lavender).toBe('#7C6CFF');
  });

  it('keeps the texture ratio at metal 70 / rust 20 / neon 10', () => {
    expect(TEXTURE_RATIO).toEqual({ metal: 70, rust: 20, neon: 10 });
    expect(TEXTURE_RATIO.metal + TEXTURE_RATIO.rust + TEXTURE_RATIO.neon).toBe(100);
  });

  it('keeps the layout contract (TopBar 64, grid 8, card 12, buttons 48/40, feed 12)', () => {
    expect(RUST_MODERN_LAYOUT).toMatchObject({
      topBarHeight: 64,
      grid: 8,
      radius: 12,
      primaryButton: 48,
      secondaryButton: 40,
      feedLimit: 12,
    });
    expect(RUST_MODERN_LINES.card).toContain('#2A2E45');
    expect(RUST_MODERN_LINES.aiNeon).toContain('#00E5FF');
    expect(RUST_MODERN_LINES.rustCorner).toContain('#C97B2A');
    expect(RUST_MODERN_SHADOWS.glossySheen).toBe(0.4);
    expect(RUST_MODERN_SHADOWS.rustSheen).toBe(0);
    expect(RUST_MODERN_SHADOWS.primaryButton).toContain('rgba(124, 108, 255');
    expect(RUST_MODERN_TYPE.thaiLineHeight).toBe(1.7);
    expect(RUST_MODERN_TYPE.minWeight).toBe(400);
  });

  it('declares the six art tracks with Track 06 as the main style', () => {
    expect(ART_TRACKS).toHaveLength(6);
    expect(ART_TRACKS.map((t) => t.id)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(MAIN_ART_TRACK.name).toBe('RUSTY METAL');
    expect(MAIN_ART_TRACK.id).toBe(6);
  });

  it('splits the books correctly: หาเงิน = calm paper, ใช้เงิน = fun midnight', () => {
    expect(BOOKS.BOOK_1_HA_NGOEN.surface).toBe('#F7F5F0');
    expect(BOOKS.BOOK_1_HA_NGOEN.accent).toBe('#7C6CFF');
    expect(BOOKS.BOOK_1_HA_NGOEN.motionMs).toBe(320);
    expect(BOOKS.BOOK_1_HA_NGOEN.sound).toBe(0); // เงียบเป็นค่าเริ่มต้น
    expect(BOOKS.BOOK_1_HA_NGOEN.canShake).toBe(false);

    expect(BOOKS.BOOK_2_CHAI_NGOEN.surface).toBe('#0F1117');
    expect(BOOKS.BOOK_2_CHAI_NGOEN.accent).toBe('#7C6CFF');
    expect(BOOKS.BOOK_2_CHAI_NGOEN.sound).toBe(80);
    expect(BOOKS.BOOK_2_CHAI_NGOEN.canShake).toBe(true);
  });

  it('gives each book its own art tracks, no overlap (one style per screen)', () => {
    const books: BookId[] = ['BOOK_1_HA_NGOEN', 'BOOK_2_CHAI_NGOEN'];
    const [book1, book2] = books.map(artTracksFor);
    expect(book1).toHaveLength(3);
    expect(book2).toHaveLength(3);
    expect(book1.map((t) => t.id)).toEqual([1, 2, 3]);
    expect(book2.map((t) => t.id)).toEqual([4, 5, 6]);
    expect(book1.filter((t) => book2.some((o) => o.id === t.id))).toHaveLength(0);
  });

  it('folds all nine behavioural poses into the 4-mood mascot set', () => {
    expect(MASCOT_SET).toEqual({ characters: 1, poses: 4, moods: 4, sameFace: true });
    const poses = Object.keys(TRADING_SKIN.poses) as PoseId[];
    expect(poses).toHaveLength(9);
    poses.forEach((pose) => expect(Object.keys(MOODS)).toContain(POSE_MOOD[pose]));
    expect(new Set(Object.values(POSE_MOOD)).size).toBe(4);
    expect(moodForPose('HAPPY_TP')).toBe('JOY');
    expect(moodForPose('FALL_BREAK')).toBe('STRAIN');
    expect(moodForPose('SLEEP_WAIT')).toBe('CALM');
    (['CALM', 'FOCUS', 'JOY', 'STRAIN'] as MoodId[]).forEach((mood) =>
      expect(MOODS[mood].label.length).toBeGreaterThan(0)
    );
  });

  it('exposes the copy-paste CSS block but injects nothing', () => {
    expect(RUST_MODERN_CSS).toContain('--mb-brand: #7C6CFF');
    expect(RUST_MODERN_CSS).toContain(`--mb-face-id: ${FACE_ID}`); // never changes
    expect(RUST_MODERN_CSS).toContain('--mb-radius: 12px');
    expect(typeof document).toBe('object');
    expect(document.documentElement.getAttribute('style')).toBeFalsy();
  });
});

describe('L3 SKIN — editable, per project, never touches core', () => {
  it('speaks the calm palette: lavender accent, dark ink on lavender', () => {
    const { palette } = TRADING_SKIN;
    expect(palette.masterBlack).toBe('#000000');
    // The mascot adapts to this product: same accent as App.tsx / index.css,
    // not a second red borrowed from the master brand.
    expect(palette.primary).toBe('#7C6CFF');
    expect(palette.bull).toBe('#00E676');
    expect(palette.bear).toBe('#FF5252');
    expect(palette.signal).toBe('#00E5FF');
  });

  it('keeps the V4.1 master brand available for the other projects', () => {
    // Rust x Modern master brand is archived as data; the Calm System v2.0
    // lavender now drives the UI (see CALM_BRAND in tokens.ts).
    expect(MASTER_BRAND).toEqual({ black: '#000000', red: '#FF0033' });
    expect(CALM_BRAND.primary).toBe('#7C6CFF');
    expect(CALM_BRAND.inkOnAccent).toBe('#0F1117');
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
