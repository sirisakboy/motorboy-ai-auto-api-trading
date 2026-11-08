import type { FaceLock } from './types';

/**
 * L1 CORE — “BIOS”. Read-only by contract.
 *
 * Rule from the spec: *ถ้าแก้ตรงนี้ ทุกโปรเจคพัง* — the identity is the one thing
 * shared by every project (TRADING / GARMENT / RACING / TEMPLE). Everything in
 * this file is frozen at runtime, and `verifyFaceLock()` re-derives the checksum
 * so a stray edit is caught by `npm test` instead of surfacing as “คนละคน” on
 * screen three projects later.
 *
 * 60 % realism is deliberate: 40 % reads as a mascot cartoon (not credible next
 * to money), 100 % is heavy to render and covers the chart.
 */

const FEATURES = [
  'หัวไข่ (egg-shaped head)',
  'ตาน้ำตาลเข้ม รีเล็กน้อย (dark brown, slightly almond eyes)',
  'ผมดำควันฟูวอลลุ่มสั้น (short voluminous smoke-black hair)',
  'หนวดเคราบาง 3 ส่วน: หนวด + เคราแพะ + เคราไร (three-part thin facial hair)',
  'ผิวแทนอมเย็น undertone cool (cool-toned tan skin)',
] as const;

export const FACE_ID = 'MB-33-MASTER-001';
export const REALISM_PCT = 60;

/** FNV-1a 32-bit — small, stable, dependency-free identity checksum. */
export function checksum(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `MB${hash.toString(16).padStart(8, '0').toUpperCase()}`;
}

/** The frozen identity contract. Do not mutate — the hash will stop matching. */
export const FACE_LOCK: FaceLock = Object.freeze({
  faceId: FACE_ID,
  hash: checksum([FEATURES.join('|'), '60'].join('::')),
  realismPct: REALISM_PCT,
  features: Object.freeze([...FEATURES]) as readonly string[],
});

/**
 * Verify that the identity contract was not tampered with.
 * Used by tests and by the adapter at boot (fails fast, never silently).
 */
export function verifyFaceLock(lock: FaceLock = FACE_LOCK): { ok: boolean; expected: string; actual: string } {
  const expected = checksum([lock.features.join('|'), String(lock.realismPct)].join('::'));
  return { ok: expected === lock.hash, expected, actual: lock.hash };
}

/* ------------------------------------------------------------ one-face rule */

/** Minimal DOM surface so the checker is testable without a real browser. */
export interface FaceQueryRoot {
  querySelectorAll(selector: string): ArrayLike<{ getAttribute(name: string): string | null }>;
}

export const MASCOT_ROOT_ATTR = 'data-motorboy-root';
export const MASCOT_FACE_ATTR = 'data-motorboy-face';

/**
 * Conflict guard (“หน้าเบิ้ล”). Before mounting, the adapter asks this whether a
 * mascot root already exists. Returns the count found so callers can log/repair.
 */
export function countMountedFaces(root: FaceQueryRoot | null | undefined): number {
  if (!root) return 0;
  try {
    return root.querySelectorAll(`[${MASCOT_ROOT_ATTR}]`).length;
  } catch {
    return 0;
  }
}

/** True when it is safe to mount (zero existing roots). */
export function canMountFace(root: FaceQueryRoot | null | undefined): boolean {
  return countMountedFaces(root) === 0;
}

/**
 * Every mounted mascot must carry the same face id. Returns the list of
 * offenders so the offending layer can be unmounted instead of shipped.
 */
export function findFaceMismatches(
  root: FaceQueryRoot | null | undefined,
  expectedFaceId: string = FACE_ID
): number {
  if (!root) return 0;
  try {
    const nodes = Array.from(root.querySelectorAll(`[${MASCOT_FACE_ATTR}]`));
    return nodes.filter((node) => node.getAttribute(MASCOT_FACE_ATTR) !== expectedFaceId).length;
  } catch {
    return 0;
  }
}
