import type { MascotSkin, Palette, PoseId, PoseVisual, ProjectId } from './types';
import { RUST_MODERN_COLORS } from './tokens';

/**
 * L3 SKIN — “App layer”. Freely editable per project, must not touch L1/L2.
 *
 * Colour psychology from the spec (one palette per project so the eye never has
 * to re-learn what “green” means):
 *   · MASTER   Black #000000 + Red #7C6CFF      (brand)
 *   · TRADING  Bull #00E676, Bear #FF5252, Signal #00E5FF
 *   · GARMENT  Black/Red PPE, clear glasses (not the old blue mask)
 *   · RACING   black/red racing suit + yellow caution
 *   · TEMPLE   Pearl #FFFFFF + Gold #FFD700 + Saffron #FF8C00 (white shirt with
 *              gold trim — explicitly NOT robes, per the spec's Vinaya note)
 */

export type TradingSkinId = 'TRADING';

/**
 * V4.1 master brand. Exported for the projects that will inherit it
 * (GARMENT / RACING / TEMPLE) — the TRADING skin deliberately uses *this app's*
 * accent instead, so the mascot looks like it belongs here rather than dragging
 * a second red into the product.
 */
export const MASTER_BRAND = { black: '#000000', red: RUST_MODERN_COLORS.dangerRed } as const;

const TRADING_PALETTE: Palette = {
  masterBlack: MASTER_BRAND.black,
  primary: '#7C6CFF', // ← the app's existing brand accent (App.tsx / index.css)
  bull: '#00E676',
  bear: '#FF5252',
  signal: '#00E5FF',
  surface: '#0F1117',
  border: '#2A2E45',
  label: 'Nong MotorBoy · Trader',
};

const POSE_BASE: Record<PoseId, { emoji: string; caption: string }> = {
  IDLE: { emoji: '🏍️', caption: 'จอดรออยู่ข้างจอ' },
  WALK_CHART: { emoji: '🚶', caption: 'เดินสำรวจเส้นกราฟ' },
  CLIMB_CANDLE: { emoji: '🧗', caption: 'ปีนแท่งเทียนเขียว' },
  FALL_BREAK: { emoji: '🪂', caption: 'แท่งแดงหลุดแนวรับ' },
  WORK_ANALYZE: { emoji: '🔍', caption: 'ส่องแว่นขยาย + ฟิโบ' },
  HAPPY_TP: { emoji: '🥳', caption: 'ถึงเป้า TP แล้ว' },
  SAD_SL: { emoji: '☂️', caption: 'กางร่มตอนโดน SL' },
  DRAG_FIBO: { emoji: '📐', caption: 'ลากเส้นฟิโบตามเมาส์' },
  SLEEP_WAIT: { emoji: '😴', caption: 'ตลาดนิ่ง ขอเผลอหลับ' },
};

function buildPoses(ring: (pose: PoseId) => string): Record<PoseId, PoseVisual> {
  const entries = (Object.keys(POSE_BASE) as PoseId[]).map((pose) => [
    pose,
    { ...POSE_BASE[pose], ring: ring(pose) },
  ]);
  return Object.fromEntries(entries) as Record<PoseId, PoseVisual>;
}

/** Trading skin: trader suit, rings speak the bull/bear/signal language. */
export const TRADING_SKIN: MascotSkin = {
  projectId: 'MOTORBOY.PROJECT.TRADING',
  name: 'Trader suit',
  palette: TRADING_PALETTE,
  poses: buildPoses((pose) => {
    switch (pose) {
      case 'CLIMB_CANDLE':
      case 'HAPPY_TP':
        return 'border-[#00E676]/70 shadow-[0_0_18px_rgba(0,230,118,0.35)]';
      case 'FALL_BREAK':
      case 'SAD_SL':
        return 'border-[#FF5252]/70 shadow-[0_0_18px_rgba(255,82,82,0.35)]';
      case 'WORK_ANALYZE':
      case 'DRAG_FIBO':
        return 'border-[#00E5FF]/70 shadow-[0_0_18px_rgba(0,229,255,0.3)]';
      default:
        return 'border-[#2A2E45]';
    }
  }),
  onboardingLine: 'ยินดีต้อนรับครับ! ผมจะคอยบอก “จุดจบเทรน” ให้ฟังประโยคเดียว ไม่รกจอครับ',
};

const REGISTRY: Record<string, MascotSkin> = {
  TRADING: TRADING_SKIN,
};

/**
 * Skins the repo knows about. Non-trading projects are declared (so the adapter
 * can resolve them) but intentionally not styled here — this repo only ships the
 * Trading surface.
 */
export const DECLARED_PROJECT_SKINS: Record<ProjectId, string | null> = {
  'MOTORBOY.PROJECT.TRADING': 'TRADING',
  'MOTORBOY.PROJECT.GARMENT': null,
  'MOTORBOY.PROJECT.RACING': null,
  'MOTORBOY.PROJECT.TEMPLE': null,
};

export function getSkin(id: TradingSkinId = 'TRADING'): MascotSkin {
  return REGISTRY[id] ?? TRADING_SKIN;
}

/** Palette helper used by the overlay so colours never get hardcoded twice. */
export function poseVisual(pose: PoseId, skin: MascotSkin = TRADING_SKIN): PoseVisual {
  return skin.poses[pose] ?? skin.poses.IDLE;
}
