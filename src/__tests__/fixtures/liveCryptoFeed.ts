import type { CryptoCoin } from '../../types';
import { CRYPTO_INITIAL } from '../../services/apiClient';

/**
 * ฟีดตัวอย่าง "เหมือนข้อมูลสด" สำหรับเทสต์เท่านั้น
 *
 * `CRYPTO_INITIAL` ในโปรดักชันถูกทำให้ price = 0 โดยเจตนา (ห้ามมีราคาปลอม —
 * ดูสาเหตุใน docs/DEEP-REVIEW-2026-11-04-live.md) เทสต์ที่ต้องตรวจ "พฤติกรรม
 * เมื่อมีราคาจริง" จึงต้องเติมราคาเองผ่าน fixture นี้ ไม่ใช่พึ่งค่าตั้งต้นของแอป
 */
const SAMPLE_PRICES = [92450, 3420.5, 212.4, 645.2, 2.48, 0.0000245];
const SAMPLE_CHANGES = [2.35, 1.82, 4.15, 0.95, -1.2, 3.12];

export const LIVE_CRYPTO_FEED: CryptoCoin[] = CRYPTO_INITIAL.map((coin, index) => ({
  ...coin,
  price: SAMPLE_PRICES[index] ?? 100,
  change: SAMPLE_CHANGES[index] ?? 0,
  high: (SAMPLE_PRICES[index] ?? 100) * 1.02,
  low: (SAMPLE_PRICES[index] ?? 100) * 0.98,
  volume: 1_000_000,
}));
