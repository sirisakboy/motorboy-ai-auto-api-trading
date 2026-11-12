/**
 * FUSION CORE — จุดเข้าเดียวของฝั่ง TypeScript
 *
 * ใช้ในแอป:
 *   import { analyzeWhaleFromApp, quoteFromCryptoCoin } from './fusion';
 *
 * ใช้ข้อมูลโฟลว์จริง (เมื่อมี API):
 *   import { analyzeWhale } from './fusion';
 *   analyzeWhale({ symbol: 'BTCUSDT', assetType: 'crypto', data: { exchange_netflow_usd: -1.8e7 } });
 */

export * from './types';
export * from './whale';
export * from './adapters';
