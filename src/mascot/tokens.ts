/**
 * MOTORBOY "RUST x MODERN" — CENTRAL v4.4 design tokens.
 *
 * Source: the MASCOT + UI DESIGN SYSTEM PDF (Book 3, v4.4 installed). It is a
 * studio-wide design system, so it is encoded here as data, not painted over the
 * app: `src/mascot/` can read these tokens, the trading UI keeps its own look
 * until the product owner says otherwise.
 *
 * Rules that must survive any refactor (from the spec):
 *   · หน้าเดิม ห้ามเปลี่ยน — Face ID MB-33-MASTER-001 never changes (see core.ts)
 *   · โลหะ 70% + สนิม 20% + นีออน 10%
 *   · 1 หน้าจอ ใช้ 1 สไตล์พอล์บ pencil ห้ามใช้ 2 สไตล์ปนกัน
 *   · ถ้าเป็นโปรเจคหาเงิน → Art Track 01–03 · โปรเจคใช้เงิน → Track 04–06
 */

import type { BookId, MoodId, PoseId } from './types';

/* ------------------------------------------------------------------ colours */

export const RUST_MODERN_COLORS = {
  /** แดงแบรนด์ — โลโก้ M, ปุ่มหลัก, เส้นขอบ */
  brandRed: '#FF0033',
  /** ม่วง — แอ็กเซนต์, AI, ไล่สี */
  violet: '#8A2BE2',
  /** ฟ้านีออน — ไอคอน ECU / AI / ลิงก์ (และเส้นขอบปุ่ม AI) */
  neonBlue: '#00E5FF',
  /** เขียวนีออน — สถานะดี, สำเร็จ, ชาร์จ */
  neonGreen: '#39FF14',
  /** สนิม — กรอบ, พื้นหลังอู่, คราบ */
  rust: '#8A4B2A',
  rustLight: '#C97B2A',
  /** โลหะเทา — พื้นผิวโลหะ, การ์ด, แถบ */
  metal: '#9AA0A8',
  metalDark: '#2A2E45',
  /** พื้น Paper (เล่ม 1 หาเงิน) */
  paper: '#F7F5F0',
  /** พื้น Midnight (เล่ม 2 ใช้เงิน) */
  midnight: '#0F1117',
  /** สีหลักของเล่ม 1 */
  lavender: '#7C6CFF',
} as const;

/* ------------------------------------------------------------------- shapes */

export const RUST_MODERN_LAYOUT = {
  topBarHeight: 64,
  grid: 8,
  radius: 12,
  primaryButton: 48,
  secondaryButton: 40,
  feedLimit: 12,
} as const;

export const RUST_MODERN_TYPE = {
  heading: 'Inter Bold / Noto Sans Thai Bold',
  body: 'Inter Regular / Noto Sans Thai Regular',
  numerals: 'tabular-nums',
  thaiLineHeight: 1.7,
  minWeight: 400,
} as const;

export const RUST_MODERN_LINES = {
  /** กรอบโลหะ 2px */
  card: '2px solid #2A2E45',
  /** ขอบสนิม 1px ที่มุมการ์ด */
  rustCorner: '1px solid #C97B2A',
  /** เส้นนีออน 1px สำหรับปุ่ม AI */
  aiNeon: '1px solid #00E5FF',
} as const;

export const RUST_MODERN_SHADOWS = {
  /** โลหะเงา — เงาสะท้อน 40% */
  glossySheen: 0.4,
  /** สนิม — เงาด้าน 0% + ความหยาบ */
  rustSheen: 0,
  card: '0 8px 8px rgba(0, 0, 0, 0.35)',
  /** ปุ่มหลัก — เงาแดง 12px */
  primaryButton: '0 0 12px #FF0033',
} as const;

/** อัตราส่วนพื้นผิวรวมทั้งระบบ: โลหะ 70% + สนิม 20% + นีออน 10% */
export const TEXTURE_RATIO = { metal: 70, rust: 20, neon: 10 } as const;

/* --------------------------------------------------------------- art tracks */

export interface ArtTrack {
  id: number;
  name: string;
  note: string;
  main?: boolean;
}

export const ART_TRACKS: ArtTrack[] = [
  { id: 1, name: 'ANIME', note: 'เส้นมั่งงะ ตาคม แสงนีออน' },
  { id: 2, name: '2D FLAT MODERN', note: 'สีเรียบแบบน สะอาด ใช้กับเว็บ/แอป' },
  { id: 3, name: '3D', note: 'ผิวมีมิติ ตาโตนุ่ม แบบ Pixar' },
  { id: 4, name: 'METAL REFLECTION', note: 'แสงสะท้อนโลหะ เงาวิ่ง นีออนแดง-ฟ้า' },
  { id: 5, name: 'GLOSSY METAL', note: 'พื้นผิวโค้งเงาเต็มแผ่น' },
  { id: 6, name: 'RUSTY METAL', note: 'สนิม + โลหะเงา = เก่า x ใหม่ ลงตัว', main: true },
];

/* --------------------------------------------------------------------- books */

export interface BookStyle {
  id: BookId;
  /** "หาเงิน" = calm, "ใช้เงิน" = fun */
  label: string;
  surface: string;
  accent: string;
  accentAlt: string;
  texture: string;
  motionMs: number;
  easing: string;
  /** ระดับเสียงเริ่มต้น (%) */
  sound: number;
  canShake: boolean;
  /** Art tracks ที่อนุญาตให้ใช้ */
  artTracks: number[];
  /** ท่าโปรไฟล์ประจำเล่ม */
  signaturePoses: string[];
}

export const BOOKS: Record<BookId, BookStyle> = {
  BOOK_1_HA_NGOEN: {
    id: 'BOOK_1_HA_NGOEN',
    label: 'เล่ม 1 หาเงิน (สงบ)',
    surface: RUST_MODERN_COLORS.paper,
    accent: RUST_MODERN_COLORS.lavender,
    accentAlt: RUST_MODERN_COLORS.brandRed,
    texture: 'โลหะด้าน + สนิม 10%',
    motionMs: 320,
    easing: 'ease-calm',
    sound: 0,
    canShake: false,
    artTracks: [1, 2, 3],
    signaturePoses: ['ยืนกอดอก มั่นใจ', 'ยกนิ้วโป้ง ยิ้ม สำเร็จ'],
  },
  BOOK_2_CHAI_NGOEN: {
    id: 'BOOK_2_CHAI_NGOEN',
    label: 'เล่ม 2 ใช้เงิน (สนุก)',
    surface: RUST_MODERN_COLORS.midnight,
    accent: RUST_MODERN_COLORS.brandRed,
    accentAlt: RUST_MODERN_COLORS.neonBlue,
    texture: 'โลหะเงา + สนิม 25% + นีออน',
    motionMs: 200,
    easing: 'ease-out',
    sound: 80,
    canShake: true,
    artTracks: [4, 5, 6],
    signaturePoses: ['ชูมือ เฮ', 'กอดอก ส่ายหัว'],
  },
};

/** Which art tracks a book may use (spec: หาเงิน 01–03, ใช้เงิน 04–06). */
export function artTracksFor(book: BookId): ArtTrack[] {
  return ART_TRACKS.filter((track) => BOOKS[book].artTracks.includes(track.id));
}

/** The main track of the set — Track 06 RUSTY METAL. */
export const MAIN_ART_TRACK = ART_TRACKS.find((track) => track.main) ?? ART_TRACKS[0];

/* ------------------------------------------------------------- mascot set */

/** Spec: 1 character · 4 poses · 4 moods · same face in every image. */
export const MASCOT_SET = { characters: 1, poses: 4, moods: 4, sameFace: true } as const;

/**
 * The 9 behavioural poses this app needs, folded into the spec's 4 moods.
 * (The mascot set is 4 poses; the app drives 9 behaviours, so behaviours map to
 * a mood and the mood picks the art.)
 */
export const POSE_MOOD: Record<PoseId, MoodId> = {
  IDLE: 'CALM',
  SLEEP_WAIT: 'CALM',
  WALK_CHART: 'FOCUS',
  WORK_ANALYZE: 'FOCUS',
  DRAG_FIBO: 'FOCUS',
  CLIMB_CANDLE: 'JOY',
  HAPPY_TP: 'JOY',
  FALL_BREAK: 'STRAIN',
  SAD_SL: 'STRAIN',
};

export const MOODS: Record<MoodId, { label: string; color: string }> = {
  CALM: { label: 'นิ่ง มั่นใจ', color: RUST_MODERN_COLORS.metal },
  FOCUS: { label: 'โฟกัส อ่านกราฟ', color: RUST_MODERN_COLORS.neonBlue },
  JOY: { label: 'สำเร็จ เฮ', color: RUST_MODERN_COLORS.neonGreen },
  STRAIN: { label: 'ตึง เครียด ระวัง', color: RUST_MODERN_COLORS.brandRed },
};

export function moodForPose(pose: PoseId): MoodId {
  return POSE_MOOD[pose] ?? 'CALM';
}

/* -------------------------------------------------------------- CSS export */

/**
 * The spec ships a copy-paste `:root` block. Exported as a plain string so a
 * project can opt in by injecting it — nothing is injected automatically.
 */
export const RUST_MODERN_CSS = `/* MOTORBOY MASCOT + UI - Rust x Modern - Central v4.4 */
:root {
  --mb-brand-red: ${RUST_MODERN_COLORS.brandRed};
  --mb-violet: ${RUST_MODERN_COLORS.violet};
  --mb-neon-blue: ${RUST_MODERN_COLORS.neonBlue};
  --mb-neon-green: ${RUST_MODERN_COLORS.neonGreen};
  --mb-rust: ${RUST_MODERN_COLORS.rustLight};
  --mb-rust-dark: ${RUST_MODERN_COLORS.rust};
  --mb-metal: ${RUST_MODERN_COLORS.metal};
  --mb-paper: ${RUST_MODERN_COLORS.paper};
  --mb-midnight: ${RUST_MODERN_COLORS.midnight};
  --mb-face-id: MB-33-MASTER-001; /* NEVER CHANGE */
  --mb-texture: metal-gloss ${TEXTURE_RATIO.metal}% + rust ${TEXTURE_RATIO.rust}% + neon ${TEXTURE_RATIO.neon}%;
  --mb-radius: ${RUST_MODERN_LAYOUT.radius}px;
  --mb-topbar: ${RUST_MODERN_LAYOUT.topBarHeight}px;
  --mb-grid: ${RUST_MODERN_LAYOUT.grid}px;
}`;
