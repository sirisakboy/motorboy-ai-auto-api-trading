/**
 * MOTORBOY design tokens — Calm System v2.0 (colour/type/motion) + the
 * "Rust x Modern" art tracks (v4.4) that still describe the mascot artwork.
 *
 * Source of truth for colour: Brand Book v2.0, sections 04 + 16.
 * Source of truth for the mascot art system: the v4.4 MASCOT + UI PDF.
 *
 * Rules that must survive any refactor:
 *   · หน้าเดิม ห้ามเปลี่ยน — Face ID MB-33-MASTER-001 never changes (see core.ts)
 *   · โลหะ 70% + สนิม 20% + นีออน 10%
 *   · 1 หน้าจอ ใช้ 1 สไตล์พอล์บ pencil ห้ามใช้ 2 สไตล์ปนกัน
 *   · ถ้าเป็นโปรเจคหาเงิน → Art Track 01–03 · โปรเจคใช้เงิน → Track 04–06
 */

import { FACE_ID } from './core';
import type { BookId, MoodId, PoseId } from './types';

/* ------------------------------------------------------- CALM SYSTEM v2.0 */

/**
 * MOTORBOY CALM SYSTEM v2.0 — Brand Book (8 Nov 2026), section 04 + 16.
 *
 * The studio's promise: "เทคโนโลยีที่เข้าใจใจคน … ทำให้เขาสงบ ชัด และไม่โดนเร่งให้ใจร้อน".
 * The three lines that must never break: สงบ (calm) · ชัด (clear) · อบอุ่น (warm),
 * and one hard rule for this project — **ไม่ใช้สีแดงแสบตาเป็นสีแบรนด์**
 * (red stays for danger/loss only), with ink on lavender fixed to #0F1117.
 *
 * This object is the single source of truth for the mascot palette: every other
 * colour export below reads from it, so a hex is typed once per project.
 */
export const CALM_BRAND = {
  /** ลาเวนเดอร์ — สีหลักของแบรนด์ */
  primary: '#7C6CFF',
  /** ตัวหนังสือ/ไอคอนบนพื้นลาเวนเดอร์ */
  inkOnAccent: '#0F1117',
  /** พื้น Midnight (dark) */
  surface: '#0F1117',
  /** พื้น Paper (light) */
  paperSurface: '#F7F5F0',
  /** พื้นการ์ด */
  surfaceCard: '#1C1F2E',
  /** พื้นการ์ดยกขึ้น */
  surfaceRaised: '#222640',
  /** ลาเวนเดอร์อ่อน — ตัวหนังสือเน้น ลิงก์ */
  lavenderSoft: '#A89FFF',
  /** เขียว/เหลือง/พีช — ใช้เชิงความหมายเท่านั้น (LONG / WAIT / SHORT) */
  success: '#7EE0B5',
  warning: '#FFB86B',
  danger: '#F4A6A6',
  neutral: '#A7A4B8',
  /** ฟ้าใส — ข้อมูล ปฏิทิน */
  info: '#4CC9F0',
} as const;

/* ------------------------------------------------------------------ colours */

/**
 * ชื่อเดิมของ v4.4 ("Rust x Modern") ที่โค้ดอื่นยังอ้างถึง
 * — ค่าทั้งหมดชี้ไปที่ CALM_BRAND ไม่มีการประกาศ hex ซ้ำ
 */
export const RUST_MODERN_COLORS = {
  /** สีแบรนด์ของโปรเจกต์นี้ = ลาเวนเดอร์ (Brand Book v2.0) */
  brandAccent: CALM_BRAND.primary,
  /** พีช — SHORT/ระวัง (ห้ามใช้แดงสด #FF0000) */
  dangerRed: CALM_BRAND.danger,
  /** ม่วงอ่อน — แอ็กเซนต์, AI, ลิงก์ */
  violet: CALM_BRAND.lavenderSoft,
  /** ฟ้าใส — ไอคอน ECU / AI / ลิงก์ */
  neonBlue: CALM_BRAND.info,
  /** มินต์ — สถานะดี, สำเร็จ */
  neonGreen: CALM_BRAND.success,
  /** สนิม — ใช้เฉพาะงานอาร์ตของมาสคอต (ไม่ใช่สี UI) */
  rust: '#8A4B2A',
  rustLight: '#C97B2A',
  /** เทากลาง — คำอธิบาย/ข้อความรอง */
  metal: CALM_BRAND.neutral,
  metalDark: CALM_BRAND.surfaceRaised,
  /** พื้น Paper (โหมดสว่าง) */
  paper: CALM_BRAND.paperSurface,
  /** พื้น Midnight (โหมดมืด) */
  midnight: CALM_BRAND.surface,
  /** สีหลักของแบรนด์ */
  lavender: CALM_BRAND.primary,
} as const;


/** Calm motion: ไม่กระพริบ ไม่เด้ง — hover 180ms, เปลี่ยนหน้า 320ms, หน่วงค่า 600ms */
export const CALM_MOTION = {
  hoverMs: 180,
  pageMs: 320,
  slowMs: 600,
  reducedMotionMs: 120,
  blinking: false,
} as const;

/* ------------------------------------------------------------------- shapes */

export const RUST_MODERN_LAYOUT = {
  topBarHeight: 64,
  grid: 8,
  radius: 20,
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
  card: '1px solid rgba(255,255,255,0.07)',
  /** ขอบสนิม 1px ที่มุมการ์ด */
  rustCorner: '1px solid #C97B2A',
  /** ปุ่ม AI ใช้ขอบลาเวนเดอร์ 1px (Book: ตัด Glow/นีออน) */
  aiNeon: '1px solid #7C6CFF',
} as const;

export const RUST_MODERN_SHADOWS = {
  /** โลหะเงา — เงาสะท้อน 40% */
  glossySheen: 0.4,
  /** สนิม — เงาด้าน 0% + ความหยาบ */
  rustSheen: 0,
  card: '0 8px 8px rgba(0, 0, 0, 0.35)',
  /** ปุ่มหลัก — เงานุ่มของลาเวนเดอร์ (ไม่ใช่เงาแดงกระพริบ) */
  primaryButton: '0 8px 30px rgba(124, 108, 255, 0.25)',
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
    accentAlt: RUST_MODERN_COLORS.dangerRed,
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
    accent: RUST_MODERN_COLORS.brandAccent,
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
  STRAIN: { label: 'ตึง เครียด ระวัง', color: RUST_MODERN_COLORS.dangerRed },
};

export function moodForPose(pose: PoseId): MoodId {
  return POSE_MOOD[pose] ?? 'CALM';
}

/* -------------------------------------------------------------- CSS export */

/**
 * The spec ships a copy-paste `:root` block. Exported as a plain string so a
 * project can opt in by injecting it — nothing is injected automatically.
 */
export const RUST_MODERN_CSS = `/* MOTORBOY — Calm System v2.0 tokens (Brand Book 16 · Tokens as Code) */
:root {
  /* Background */
  --mb-bg-top: ${CALM_BRAND.surface};
  --mb-bg-bottom: #171A26;
  --mb-bg-paper: ${CALM_BRAND.paperSurface};
  --mb-surface: ${CALM_BRAND.surfaceCard};
  --mb-surface-raised: #222640;
  --mb-surface-sunken: #141725;
  --mb-line: rgba(255,255,255,0.07);
  /* Text */
  --mb-text: #ECEAF4;
  --mb-text-muted: ${CALM_BRAND.neutral};
  --mb-text-faint: #8B88A0;
  --mb-text-light: ${CALM_BRAND.surfaceCard};
  /* Brand */
  --mb-lavender: ${CALM_BRAND.primary};
  --mb-lavender-soft: ${CALM_BRAND.lavenderSoft};
  --mb-sky: ${CALM_BRAND.info};
  --mb-amber: ${CALM_BRAND.warning};
  --mb-mint: ${CALM_BRAND.success};
  --mb-peach: ${CALM_BRAND.danger};
  /* Motion */
  --mb-ease-calm: cubic-bezier(.22,.8,.3,1);
  --mb-t-quick: ${CALM_MOTION.hoverMs}ms;
  --mb-t-base: ${CALM_MOTION.pageMs}ms;
  --mb-t-slow: ${CALM_MOTION.slowMs}ms;
  --mb-t-ambient: 20s;
  /* Radius + shadow */
  --mb-radius-card: ${RUST_MODERN_LAYOUT.radius}px;
  --mb-radius-button: 14px;
  --mb-radius-chip: 999px;
  --mb-shadow-card: 0 8px 30px rgba(0,0,0,.25);
  /* Gradients */
  --mb-grad-primary: linear-gradient(135deg,#8E80FF,#4CC9F0);
  --mb-grad-hero: linear-gradient(160deg,rgba(124,108,255,.22),rgba(76,201,240,.10) 60%,transparent);
  /* Layout + identity */
  --mb-topbar: ${RUST_MODERN_LAYOUT.topBarHeight}px;
  --mb-grid: ${RUST_MODERN_LAYOUT.grid}px;
  --mb-face-id: ${FACE_ID}; /* NEVER CHANGE */
}`;
