/**
 * Re-export ของข้อมูลตั้งต้น (seed snapshot) สำหรับเทสต์
 * แยกไฟล์เพื่อไม่ให้เทสต์อื่น import จาก apiClient ตรง ๆ (มี side effect ของ fetch)
 */
export { SEED_SNAPSHOT_AT, THAI_STOCKS, FOREIGN_STOCKS } from '../../services/apiClient';

/** alias ให้อ่านง่ายในเทสต์: ค่าที่ใช้ติดป้ายทุกแถวข้อมูลตั้งต้น */
export { SEED_SNAPSHOT_AT as SEED_STAMP } from '../../services/apiClient';
