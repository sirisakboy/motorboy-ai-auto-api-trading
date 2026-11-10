import type { NextFunction, Request, Response } from 'express';

export interface RateLimitOptions {
  /** ขนาดหน้าต่างเวลา (ms) */
  windowMs?: number;
  /** จำนวนคำขอสูงสุดต่อ IP ในหนึ่งหน้าต่าง */
  max?: number;
}

export interface RateLimiter {
  (req: Request, res: Response, next: NextFunction): void;
  /** ล้าง bucket ทั้งหมด (ใช้ในเทสต์) */
  reset: () => void;
  /** จำนวน bucket ที่เก็บอยู่ (ใช้ตรวจการ prune) */
  size: () => number;
}

/**
 * Fixed-window rate limiter แบบ in-memory ไม่ต้องพึ่ง dependency ใหม่
 *
 * ทำไมต้องมี: ทุก route ใต้ /api ไปเรียกโมเดลที่คิดเงินตามโทเคน และเคยเปิดรับ
 * body ได้ถึง 10 MB โดยไม่มีใครจำกัดจำนวนครั้ง — ใครก็ยิงรัวได้ไม่จำกัด
 *
 * ข้อจำกัดที่รู้ตัว: หน่วยความจำอยู่ในโปรเซสเดียว จึงรีเซ็ตเมื่อรีสตาร์ต และไม่
 * แชร์ระหว่างอินสแตนซ์ (พอสำหรับโหมด single-container; ถ้าสเกลหลายเครื่องให้
 * ย้ายไป Redis)
 */
export function createRateLimiter(options: RateLimitOptions = {}): RateLimiter {
  const windowMs = options.windowMs ?? 60_000;
  const max = options.max ?? 60;
  const MAX_BUCKETS = 5_000;

  const buckets = new Map<string, { count: number; resetAt: number }>();

  const prune = (now: number) => {
    if (buckets.size <= MAX_BUCKETS) return;
    buckets.forEach((bucket, key) => {
      if (bucket.resetAt <= now) buckets.delete(key);
    });
  };

  const limiter = ((req: Request, res: Response, next: NextFunction) => {
    const key = req.ip || req.socket?.remoteAddress || 'unknown';
    const now = Date.now();
    prune(now);

    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    bucket.count += 1;
    if (bucket.count > max) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      res.status(429).json({
        error: 'Too many requests — please slow down',
        retryAfterSeconds: retryAfter,
      });
      return;
    }

    next();
  }) as RateLimiter;

  limiter.reset = () => buckets.clear();
  limiter.size = () => buckets.size;

  return limiter;
}
