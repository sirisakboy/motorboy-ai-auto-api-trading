import React from 'react';

/**
 * Trading-themed sticker pack for the unified chat room.
 * Pure inline SVG — no image assets, no network, scales cleanly.
 * Stored in Firestore as plain text `[sticker:<id>]` (fits existing rules).
 */

export interface StickerDef {
  id: string;
  name: string;
  Art: React.FC<{ size?: number }>;
}

const S = ({ size = 48, children }: { size?: number; children: React.ReactNode }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
    {children}
  </svg>
);

const Rocket: React.FC<{ size?: number }> = ({ size }) => (
  <S size={size}>
    <circle cx="24" cy="24" r="22" fill="#141725" />
    <path d="M24 6c5 3.5 7 9 6.5 15l-3.5 6.5L24 30l-3-2.5L17.5 21C17 15 19 9.5 24 6Z" fill="#ECEAF4" />
    <circle cx="24" cy="16" r="3.2" fill="#7C6CFF" />
    <path d="M17.5 21l-4 7 6-1.5M30.5 21l4 7-6-1.5" stroke="#FFB86B" strokeWidth="2.5" strokeLinecap="round" />
    <path d="M22 32c0 3 1 5 2 7 1-2 2-4 2-7" stroke="#FFB86B" strokeWidth="2.5" strokeLinecap="round" />
    <path d="M10 38c4-1 7-3 9-6M38 38c-4-1-7-3-9-6" stroke="#FFB86B" strokeWidth="2" strokeLinecap="round" strokeDasharray="1 3" />
  </S>
);

const Bull: React.FC<{ size?: number }> = ({ size }) => (
  <S size={size}>
    <circle cx="24" cy="24" r="22" fill="#141725" />
    <path d="M10 14c-2 5-1 10 2 13M38 14c2 5 1 10-2 13" stroke="#FFB86B" strokeWidth="3" strokeLinecap="round" />
    <ellipse cx="24" cy="27" rx="11" ry="12" fill="#7EE0B5" />
    <ellipse cx="24" cy="32" rx="6" ry="5" fill="#86efac" />
    <circle cx="21.5" cy="31" r="1" fill="#141725" />
    <circle cx="26.5" cy="31" r="1" fill="#141725" />
    <circle cx="19" cy="23" r="2" fill="#141725" />
    <circle cx="29" cy="23" r="2" fill="#141725" />
    <path d="M15 38l3-2M33 38l-3-2" stroke="#FFB86B" strokeWidth="2.5" strokeLinecap="round" />
  </S>
);

const Bear: React.FC<{ size?: number }> = ({ size }) => (
  <S size={size}>
    <circle cx="24" cy="24" r="22" fill="#141725" />
    <circle cx="13" cy="16" r="4.5" fill="#FFB86B" />
    <circle cx="35" cy="16" r="4.5" fill="#FFB86B" />
    <circle cx="13" cy="16" r="2" fill="#fca5a5" />
    <circle cx="35" cy="16" r="2" fill="#fca5a5" />
    <ellipse cx="24" cy="27" rx="11" ry="12" fill="#FFB86B" />
    <ellipse cx="24" cy="32" rx="6" ry="5" fill="#fecaca" />
    <ellipse cx="24" cy="30.5" rx="2.2" ry="1.6" fill="#141725" />
    <circle cx="19" cy="23" r="2" fill="#141725" />
    <circle cx="29" cy="23" r="2" fill="#141725" />
  </S>
);

const Moon: React.FC<{ size?: number }> = ({ size }) => (
  <S size={size}>
    <circle cx="24" cy="24" r="22" fill="#141a33" />
    <path d="M30 8a14 14 0 1 0 10 24A16 16 0 0 1 30 8Z" fill="#FDE68A" />
    <circle cx="30" cy="16" r="1.6" fill="#FFB86B" />
    <circle cx="35" cy="24" r="1.2" fill="#FFB86B" />
    <path d="M12 34l2-4 2 4 4 2-4 2-2 4-2-4-4-2 4-2Z" fill="#A89FFF" />
  </S>
);

const Diamond: React.FC<{ size?: number }> = ({ size }) => (
  <S size={size}>
    <circle cx="24" cy="24" r="22" fill="#101b3c" />
    <path d="M14 18h20l-3 5 3 2-10 11L14 25l3-2-3-5Z" fill="#7DD3FC" />
    <path d="M14 18l4 5 6-5 6 5 4-5" stroke="#E0F2FE" strokeWidth="1.6" />
    <path d="M24 13l10 23L24 13Z" fill="#BAE6FD" opacity="0.5" />
    <path d="M14 18h20" stroke="#fff" strokeWidth="2" />
  </S>
);

const ChartUp: React.FC<{ size?: number }> = ({ size }) => (
  <S size={size}>
    <circle cx="24" cy="24" r="22" fill="#141725" />
    <path d="M10 32l7-8 5 4 9-11" stroke="#7EE0B5" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M25 17h6v6" stroke="#7EE0B5" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M10 38h28" stroke="#1f2937" strokeWidth="2" strokeLinecap="round" />
  </S>
);

const ChartDown: React.FC<{ size?: number }> = ({ size }) => (
  <S size={size}>
    <circle cx="24" cy="24" r="22" fill="#141725" />
    <path d="M10 16l7 8 5-4 9 11" stroke="#FFB86B" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M25 31h6v-6" stroke="#FFB86B" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M10 38h28" stroke="#1f2937" strokeWidth="2" strokeLinecap="round" />
  </S>
);

const Fire: React.FC<{ size?: number }> = ({ size }) => (
  <S size={size}>
    <circle cx="24" cy="24" r="22" fill="#141725" />
    <path d="M24 7c2 5 8 8 8 16a8 8 0 0 1-16 0c0-3 1.5-5 3-7 .5 2 1.5 3 3 3.5C21.5 15 22.5 10 24 7Z" fill="#F97316" />
    <path d="M24 22c1 2.5 4 4 4 8a4 4 0 0 1-8 0c0-1.5.8-2.5 1.5-3.5.3 1 .8 1.5 1.5 1.8-.3-2.5 0-4.5 1-6.3Z" fill="#FDE68A" />
  </S>
);

const MoneyBag: React.FC<{ size?: number }> = ({ size }) => (
  <S size={size}>
    <circle cx="24" cy="24" r="22" fill="#1c2410" />
    <path d="M20 6h8l-1.5 4h-5L20 6Z" fill="#A3E635" />
    <path d="M19 10h10c3 5 6 8 6 14a11 11 0 0 1-22 0c0-6 3-9 6-14Z" fill="#65A30D" />
    <text x="24" y="31" textAnchor="middle" fontSize="13" fontWeight="900" fill="#ECFCCB">$</text>
  </S>
);

const Shield: React.FC<{ size?: number }> = ({ size }) => (
  <S size={size}>
    <circle cx="24" cy="24" r="22" fill="#1e1b12" />
    <path d="M24 8l10 4v8c0 7-4.5 11.5-10 14C18.5 31.5 14 27 14 20v-8l10-4Z" fill="#FFB86B" />
    <path d="M24 12l7 2.8V20c0 5-3 8.5-7 10.5-4-2-7-5.5-7-10.5v-5.2L24 12Z" fill="#1e1b12" />
    <text x="24" y="27" textAnchor="middle" fontSize="10" fontWeight="900" fill="#FFB86B">DYOR</text>
  </S>
);

const ThumbsUp: React.FC<{ size?: number }> = ({ size }) => (
  <S size={size}>
    <circle cx="24" cy="24" r="22" fill="#101b3c" />
    <path d="M18 22v12H13V22h5Zm5 12h7c2.5 0 4-2 3.5-4.5L32 23c-.3-1.5-1.5-2.5-3-2.5h-4l1-6c.2-1.5-.5-3-2-3.5L19 22v12Z" fill="#4CC9F0" />
    <path d="M18 22h5v12h-5" fill="#4CC9F0" opacity="0.6" />
  </S>
);

const Party: React.FC<{ size?: number }> = ({ size }) => (
  <S size={size}>
    <circle cx="24" cy="24" r="22" fill="#23123a" />
    <path d="M18 34L12 20l14-6-2 14-6 6Z" fill="#C084FC" />
    <path d="M12 20l14-6" stroke="#F0ABFC" strokeWidth="2" />
    <circle cx="32" cy="14" r="1.5" fill="#FDE68A" />
    <circle cx="36" cy="22" r="1.5" fill="#7EE0B5" />
    <circle cx="14" cy="36" r="1.5" fill="#4CC9F0" />
    <circle cx="34" cy="34" r="1.5" fill="#FFB86B" />
    <path d="M28 30l4-1M20 36l1-4M36 28l-3-2" stroke="#E9D5FF" strokeWidth="1.5" strokeLinecap="round" />
  </S>
);

export const STICKERS: StickerDef[] = [
  { id: 'rocket', name: 'Rocket', Art: Rocket },
  { id: 'bull', name: 'Bull', Art: Bull },
  { id: 'bear', name: 'Bear', Art: Bear },
  { id: 'moon', name: 'To the moon', Art: Moon },
  { id: 'diamond', name: 'Diamond hands', Art: Diamond },
  { id: 'chart-up', name: 'Chart up', Art: ChartUp },
  { id: 'chart-down', name: 'Chart down', Art: ChartDown },
  { id: 'fire', name: 'Fire', Art: Fire },
  { id: 'money', name: 'Money', Art: MoneyBag },
  { id: 'dyor', name: 'DYOR', Art: Shield },
  { id: 'like', name: 'Like', Art: ThumbsUp },
  { id: 'party', name: 'Party', Art: Party },
];

export const STICKER_MAP: Record<string, StickerDef> = Object.fromEntries(
  STICKERS.map((s) => [s.id, s])
);

/** `[sticker:rocket]` → `rocket`, else null. */
export function parseStickerCode(text: string): string | null {
  const m = /^\[sticker:([a-z0-9-]+)\]$/.exec(text.trim());
  if (!m || !STICKER_MAP[m[1]]) return null;
  return m[1];
}

export function stickerCode(id: string): string {
  return `[sticker:${id}]`;
}
