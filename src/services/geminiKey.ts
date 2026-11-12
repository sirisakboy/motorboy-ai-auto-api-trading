/**
 * Gemini API-key helpers — shared by the browser (Settings dialog) and the
 * server (every /api/gemini/* route).
 *
 * Design decision (2026-11-04): **do not police the key format.**
 * Google keeps shipping new key shapes (AIza… → AQ.… → whatever comes next),
 * so a prefix check only ever rejects keys we have not seen yet. The only
 * checks that belong on the client are the ones that save a pointless network
 * round-trip and cannot be wrong:
 *
 *   • empty / whitespace-only  → nothing to send
 *   • surrounding whitespace   → trimmed (a copied key often carries a newline)
 *
 * Everything else is handed to Google, which is the only authority on whether
 * a key works. A wrong key fails there with a real, specific error.
 */

/** Trim only — never mutate the middle of a key (it is case- and symbol-sensitive). */
export function normalizeGeminiKey(key?: string | null): string {
  return typeof key === 'string' ? key.trim() : '';
}

export interface GeminiKeyCheck {
  valid: boolean;
  /** Thai hint suitable for inline form feedback. */
  hint: string;
  /**
   * Kept for callers that want to label the key; no longer used to gate input.
   * `UNKNOWN` is the normal value — any working key is accepted.
   */
  format: 'CLASSIC' | 'MODERN' | 'UNKNOWN' | 'EMPTY';
}

/**
 * Accept every non-empty key. Length, prefix and character set are **not**
 * validated on purpose — a malformed key simply fails when Google sees it.
 */
export function checkGeminiKey(key?: string | null): GeminiKeyCheck {
  const value = normalizeGeminiKey(key);

  if (!value) {
    return {
      valid: false,
      hint: 'ยังไม่ได้ใส่ API Key — ระบบ AI จะทำงานในโหมดคำนวณพื้นฐาน',
      format: 'EMPTY',
    };
  }

  // ใช้เป็น label เฉย ๆ ไม่ได้ใช้ตัดสินอะไร
  const format: GeminiKeyCheck['format'] = value.startsWith('AIza')
    ? 'CLASSIC'
    : value.startsWith('AQ.')
    ? 'MODERN'
    : 'UNKNOWN';

  return {
    valid: true,
    hint:
      format === 'CLASSIC'
        ? 'พร้อมบันทึก (คีย์รูปแบบ AIza…) — กด “ทดสอบ” เพื่อยืนยันกับ Google อีกครั้ง'
        : format === 'MODERN'
        ? 'พร้อมบันทึก (คีย์รูปแบบ AQ.…) — กด “ทดสอบ” เพื่อยืนยันกับ Google อีกครั้ง'
        : 'พร้อมบันทึก — รูปแบบคีย์จะถูกตรวจกับ Google ตอนกด “ทดสอบ” หรือเรียกใช้งาน',
    format,
  };
}

/** Convenience boolean wrapper (server-side guards, tests). */
export function isGeminiKeyFormat(key?: string | null): boolean {
  return checkGeminiKey(key).valid;
}

/**
 * Mask a key for display: `AIza••••1f2g (39 ตัวอักษร)`.
 * Never render the middle of the key, even in dev tools screenshots.
 */
export function maskGeminiKey(key?: string | null): string {
  const value = normalizeGeminiKey(key);
  if (!value) return '';
  if (value.length <= 8) return `${value.slice(0, 2)}••••`;
  return `${value.slice(0, 4)}••••${value.slice(-4)} (${value.length} ตัวอักษร)`;
}
