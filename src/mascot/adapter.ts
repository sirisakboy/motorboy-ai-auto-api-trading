import { FACE_ID, canMountFace, type FaceQueryRoot } from './core';
import { getSkin, type TradingSkinId } from './skins';
import type { MascotAssetSet, ProjectId } from './types';
import mascotHero from '../assets/images/nong_motorboy_hero_1794000288918.jpg';

/**
 * L2 ADAPTER — “Kernel”.
 *
 * Four jobs, exactly as specified:
 *  1. Namespace isolation — each project resolves its own assets/skin and never
 *     pulls another project's art.
 *  2. Asset manager — assets are resolved per `projectId`, lazily, so a Trading
 *     screen never loads Garment/Racing/Temple art.
 *  3. Conflict guard — refuses to mount a second face.
 *  4. Version bridge — V3.1 states (the old snippet) are translated into V4.1
 *     poses/states instead of being rendered by old code.
 */

export const PROJECTS: ProjectId[] = [
  'MOTORBOY.PROJECT.TRADING',
  'MOTORBOY.PROJECT.GARMENT',
  'MOTORBOY.PROJECT.RACING',
  'MOTORBOY.PROJECT.TEMPLE',
];

/**
 * Asset manager. Only TRADING art ships with this repo today; the others are
 * declared as empty sets so a wrong project id resolves to "no art" instead of
 * silently borrowing the Trading mascot.
 */
const ASSETS: Record<ProjectId, MascotAssetSet> = {
  'MOTORBOY.PROJECT.TRADING': { hero: mascotHero },
  'MOTORBOY.PROJECT.GARMENT': { hero: '' },
  'MOTORBOY.PROJECT.RACING': { hero: '' },
  'MOTORBOY.PROJECT.TEMPLE': { hero: '' },
};

export function getProjectAssets(projectId: ProjectId): MascotAssetSet {
  return ASSETS[projectId];
}

export interface ResolvedMascot {
  projectId: ProjectId;
  skinId: TradingSkinId;
  assets: MascotAssetSet;
  faceId: string;
}

export function resolveMascot(projectId: ProjectId = 'MOTORBOY.PROJECT.TRADING'): ResolvedMascot {
  return {
    projectId,
    skinId: 'TRADING',
    assets: getProjectAssets(projectId),
    faceId: FACE_ID,
  };
}

/* --------------------------------------------------------- conflict guard */

export interface MountDecision {
  allowed: boolean;
  reason: 'OK' | 'ALREADY_MOUNTED';
}

/**
 * Called before the overlay renders its root node. Guards the “หน้าเบิ้ล”
 * regression: hot-reload, double StrictMode mounts and legacy `zenitsu-ui.js`
 * injections all collapse to a single face.
 */
export function decideMount(root: FaceQueryRoot | null | undefined): MountDecision {
  return canMountFace(root) ? { allowed: true, reason: 'OK' } : { allowed: false, reason: 'ALREADY_MOUNTED' };
}

/* ----------------------------------------------------------- version bridge */

export type LegacyV31State = 'NORMAL' | 'SCAN' | 'GOD' | 'MINI' | 'HIDDEN';

export type BridgedPose = 'IDLE' | 'WORK_ANALYZE' | 'CLIMB_CANDLE' | 'SLEEP_WAIT' | 'IDLE';

/**
 * V3.1 → V4.1 bridge. The old drop-in snippet exposed `zenitsuUI.showGod()` and
 * friends; any leftover call is mapped onto the new pose vocabulary instead of
 * being dropped (or worse, painting a second mascot).
 */
export function bridgeLegacyState(legacy: LegacyV31State | string | null | undefined): BridgedPose {
  switch ((legacy ?? '').toString().toUpperCase()) {
    case 'NORMAL':
      return 'IDLE';
    case 'SCAN':
      return 'WORK_ANALYZE';
    case 'GOD':
      return 'CLIMB_CANDLE';
    case 'MINI':
    case 'HIDDEN':
      return 'SLEEP_WAIT';
    default:
      return 'IDLE';
  }
}

/** Convenience for the overlay: the skin for the resolved project. */
export function resolveSkin(projectId: ProjectId = 'MOTORBOY.PROJECT.TRADING') {
  const resolved = resolveMascot(projectId);
  return getSkin(resolved.skinId);
}
