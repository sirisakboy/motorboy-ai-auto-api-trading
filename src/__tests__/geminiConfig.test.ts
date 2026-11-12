import { describe, it, expect, vi } from 'vitest';

import {
  checkGeminiKey,
  isGeminiKeyFormat,
  maskGeminiKey,
  normalizeGeminiKey,
} from '../services/geminiKey';
import {
  buildModelChain,
  classifyGeminiError,
  DEFAULT_GEMINI_MODEL,
  GEMINI_MODEL_FALLBACKS,
  resolveGeminiKey,
  resolveGeminiModel,
  shouldTryFallbackModel,
  withModelFallback,
} from '../server/geminiConfig';

/** Classic 39-char key shape (AIza + 35) with realistic-looking entropy. */
const CLASSIC_KEY = `AIza${'0123456789abcdefghij_klmnopqrstuvwxy'.slice(0, 35)}`;

describe('geminiKey — validation (no format policing)', () => {
  it('accepts the classic AIza shape without requiring it', () => {
    expect(checkGeminiKey(CLASSIC_KEY)).toMatchObject({ valid: true, format: 'CLASSIC' });
  });

  it('accepts any other key shape — prefix/length are not enforced', () => {
    const keys = [
      'AIzaSyD-very-short',
      'x',
      'aaaaaaaaaaaaaaaaaaa', // the string the old validator rejected
      'sk-proj-some-other-vendor-style-key',
      'AQ.Ab8RN6Jxyz0123456789abcdef',
      'คีย์ทดสอบภาษาไทย',
    ];
    for (const value of keys) {
      expect(checkGeminiKey(value).valid).toBe(true);
    }
    expect(checkGeminiKey('aaaaaaaaaaaaaaaaaaa').format).toBe('UNKNOWN');
  });

  it('still refuses empty input, because there is nothing to send', () => {
    expect(isGeminiKeyFormat('')).toBe(false);
    expect(isGeminiKeyFormat('   ')).toBe(false);
    expect(isGeminiKeyFormat(null)).toBe(false);
    expect(checkGeminiKey('').hint).toMatch(/ยังไม่ได้ใส่ API Key/);
  });

  it('trims surrounding whitespace without touching the body of the key', () => {
    expect(normalizeGeminiKey(`  ${CLASSIC_KEY}  `)).toBe(CLASSIC_KEY);
    expect(isGeminiKeyFormat(`${CLASSIC_KEY}\n`)).toBe(true);
    expect(normalizeGeminiKey(null)).toBe('');
  });

  it('masks keys for display', () => {
    const masked = maskGeminiKey(CLASSIC_KEY);
    expect(masked.startsWith('AIza')).toBe(true);
    expect(masked).toContain('••••');
    expect(masked).not.toContain(CLASSIC_KEY.slice(6, 30));
    expect(maskGeminiKey('abc')).toBe('ab••••');
    expect(maskGeminiKey('')).toBe('');
  });
});

describe('geminiConfig — model resolution', () => {
  it('defaults to the documented model', () => {
    expect(resolveGeminiModel({})).toBe(DEFAULT_GEMINI_MODEL);
    expect(resolveGeminiModel({ GEMINI_MODEL: '   ' })).toBe(DEFAULT_GEMINI_MODEL);
  });

  it('honours GEMINI_MODEL from the environment', () => {
    expect(resolveGeminiModel({ GEMINI_MODEL: ' gemini-3.6-flash ' })).toBe('gemini-3.6-flash');
  });

  it('builds a de-duplicated chain', () => {
    expect(buildModelChain('gemini-3.8-flash')).toEqual([
      'gemini-3.8-flash',
      ...GEMINI_MODEL_FALLBACKS,
    ]);
    // primary ที่ซ้ำกับ fallback ต้องไม่ถูกเรียกซ้ำ
    expect(buildModelChain('gemini-2.5-flash')).toEqual(['gemini-2.5-flash', 'gemini-3.6-flash']);
    // primary ว่าง → เหลือแต่ fallback (ยังมีโมเดลให้ทำงาน)
    expect(buildModelChain('  ')).toEqual([...GEMINI_MODEL_FALLBACKS]);
  });
});

describe('geminiConfig — error classification', () => {
  it('maps an invalid key before the generic 400 branch', () => {
    const info = classifyGeminiError({
      status: 400,
      message: '{"error":{"code":400,"status":"INVALID_ARGUMENT","message":"API key not valid. Please pass a valid API key."}}',
    });
    expect(info.kind).toBe('INVALID_KEY');
    expect(info.httpStatus).toBe(400);
    expect(info.code).toBe('invalid_api_key');
  });

  it('does not mistake a number containing "400" for HTTP 400', () => {
    const info = classifyGeminiError({ message: 'request took 1400ms then stalled' });
    expect(info.kind).toBe('UNKNOWN');
  });

  it('detects quota, model-not-found, permission and network errors', () => {
    expect(classifyGeminiError({ status: 429 }).kind).toBe('QUOTA');
    expect(classifyGeminiError({ message: 'RESOURCE_EXHAUSTED: quota exceeded' }).kind).toBe('QUOTA');
    expect(
      classifyGeminiError({ status: 404, message: 'models/gemini-3.8-flash is not found for API version v1beta' }).kind
    ).toBe('MODEL_NOT_FOUND');
    expect(classifyGeminiError({ status: 403 }).kind).toBe('PERMISSION_DENIED');
    expect(classifyGeminiError({ message: 'fetch failed' }).kind).toBe('NETWORK');
    expect(classifyGeminiError({ status: 503 }).kind).toBe('SERVER_ERROR');
  });

  it('never leaks the upstream detail into the user-facing message', () => {
    const info = classifyGeminiError({ message: 'fetch failed at https://internal-host:8443' });
    expect(info.messageTh).not.toContain('internal-host');
    expect(info.detail).toContain('internal-host'); // kept for logs only
  });

  it('only retries a different model for model-not-found', () => {
    expect(shouldTryFallbackModel(classifyGeminiError({ status: 404 }))).toBe(true);
    expect(shouldTryFallbackModel(classifyGeminiError({ status: 400 }))).toBe(false);
    expect(shouldTryFallbackModel(classifyGeminiError({ status: 429 }))).toBe(false);
  });
});

describe('geminiConfig — model fallback', () => {
  it('falls through to the next model on NOT_FOUND', async () => {
    const attempt = vi
      .fn()
      .mockRejectedValueOnce({ status: 404, message: 'model is not found for API version' })
      .mockResolvedValueOnce('ok');
    const onFallback = vi.fn();

    const result = await withModelFallback(attempt, {
      chain: ['primary-model', 'backup-model'],
      onFallback,
    });

    expect(result).toBe('ok');
    expect(attempt).toHaveBeenNthCalledWith(1, 'primary-model');
    expect(attempt).toHaveBeenNthCalledWith(2, 'backup-model');
    expect(onFallback).toHaveBeenCalledWith(
      'primary-model',
      'backup-model',
      expect.objectContaining({ kind: 'MODEL_NOT_FOUND' })
    );
  });

  it('does not burn extra requests on a bad key or quota error', async () => {
    const attempt = vi.fn().mockRejectedValue({ status: 429 });
    await expect(
      withModelFallback(attempt, { chain: ['a', 'b', 'c'] })
    ).rejects.toMatchObject({ status: 429 });
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it('throws the last error when every model is missing', async () => {
    const attempt = vi.fn().mockRejectedValue({ status: 404, message: 'NOT_FOUND' });
    await expect(withModelFallback(attempt, { chain: ['a', 'b'] })).rejects.toMatchObject({
      status: 404,
    });
    expect(attempt).toHaveBeenCalledTimes(2);
  });
});

describe('geminiConfig — key resolution order', () => {
  it('prefers the user key', () => {
    const resolved = resolveGeminiKey(CLASSIC_KEY, { GEMINI_API_KEY: 'server-key-ignored' });
    expect(resolved.source).toBe('user');
    expect(resolved.key).toBe(CLASSIC_KEY);
  });

  it('falls back to the server key only when the user key is empty', () => {
    const env = { GEMINI_API_KEY: CLASSIC_KEY };
    expect(resolveGeminiKey('', env).source).toBe('server');
    expect(resolveGeminiKey('   ', env).source).toBe('server');
    expect(resolveGeminiKey('', { VITE_GEMINI_API_KEY: CLASSIC_KEY }).source).toBe('server');
    // คีย์ที่ไม่รู้จักรูปแบบถือว่าใช้ได้ — ปล่อยให้ Google ตัดสิน
    expect(resolveGeminiKey('nope', env).source).toBe('user');
  });

  it('reports "none" only when nothing was provided at all', () => {
    const resolved = resolveGeminiKey('', {});
    expect(resolved.source).toBe('none');
    expect(resolved.check.valid).toBe(false);
    expect(resolved.check.hint).toMatch(/ยังไม่ได้ใส่ API Key/);
  });
});
