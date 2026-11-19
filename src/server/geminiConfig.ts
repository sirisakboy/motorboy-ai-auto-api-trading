/**
 * Server-side Gemini configuration: model selection + error classification.
 *
 * Two problems this fixes:
 *  1. The model id was hardcoded in eight places (`gemini-3.8-flash`). When
 *     Google retires or renames a model the whole AI stack dies with a 404 and
 *     there is nothing to switch without editing code and redeploying.
 *  2. Error handling matched on substrings (`rawMsg.includes('400')`), so a
 *     message containing "1400ms" could be reported as an invalid key, and the
 *     same rule was copy-pasted into three routes.
 *
 * Everything here is pure and testable — no @google/genai import.
 */

import { checkGeminiKey } from '../services/geminiKey';

/** Model used when nothing else is configured. */
export const DEFAULT_GEMINI_MODEL = 'gemini-3.1-flash-lite';

/**
 * Tried in order when the primary model is unavailable (404 / NOT_FOUND).
 * Keep this list short and free-tier friendly; each entry costs one retry.
 */
export const GEMINI_MODEL_FALLBACKS = ['gemini-4-hydrogen'];

/** Return the active default Gemini model without custom env overrides. */
export function resolveGeminiModel(): string {
  return DEFAULT_GEMINI_MODEL;
}

/** Ordered, de-duplicated chain: primary first, then the fallbacks. */
export function buildModelChain(
  primary: string,
  fallbacks: readonly string[] = GEMINI_MODEL_FALLBACKS
): string[] {
  const chain = [primary, ...fallbacks]
    .map((model) => (typeof model === 'string' ? model.trim() : ''))
    .filter((model) => model.length > 0);
  return Array.from(new Set(chain));
}

export type GeminiErrorKind =
  | 'MISSING_KEY'
  | 'INVALID_KEY'
  | 'PERMISSION_DENIED'
  | 'QUOTA'
  | 'MODEL_NOT_FOUND'
  | 'BAD_REQUEST'
  | 'NETWORK'
  | 'SERVER_ERROR'
  | 'UNKNOWN';

export interface GeminiErrorInfo {
  kind: GeminiErrorKind;
  /** HTTP status we should answer with (400 for input problems, 502/429 upstream). */
  httpStatus: number;
  /** Stable machine-readable code for the client (never contains upstream text). */
  code: string;
  /** Thai message that is safe to show to the user. */
  messageTh: string;
  /** True when retrying later has a chance of succeeding. */
  retryable: boolean;
  /** Upstream detail — log only, never send to the browser. */
  detail: string;
}

const STATUS_TOKENS: Record<number, GeminiErrorKind | null> = {
  400: null, // ambiguous: could be an invalid key or a malformed request
  401: 'INVALID_KEY',
  403: 'PERMISSION_DENIED',
  404: 'MODEL_NOT_FOUND',
  429: 'QUOTA',
  500: 'SERVER_ERROR',
  502: 'SERVER_ERROR',
  503: 'SERVER_ERROR',
  504: 'SERVER_ERROR',
};

/**
 * Turn any upstream failure into a stable code + a Thai message.
 *
 * Order matters: Google reports an invalid key as HTTP 400 with
 * `API_KEY_INVALID` in the payload, so the key patterns must be tested before
 * the generic 400 branch.
 */
export function classifyGeminiError(error: unknown): GeminiErrorInfo {
  const err = error as
    | { status?: number; code?: number | string; message?: string; error?: { message?: string } }
    | undefined;

  const numericStatus =
    typeof err?.status === 'number'
      ? err.status
      : typeof err?.code === 'number'
      ? err.code
      : undefined;

  const detail = [err?.message, err?.error?.message]
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join(' | ');

  // Only accept a status token when it stands alone ("400", "status 429"),
  // never as a substring of a number such as "1400ms".
  const statusFromText = (() => {
    const match = detail.match(/(?:^|[^\d])(\d{3})(?![\d])/);
    if (!match) return undefined;
    const parsed = Number(match[1]);
    return parsed >= 400 && parsed <= 599 ? parsed : undefined;
  })();

  const status = numericStatus ?? statusFromText;

  const make = (
    kind: GeminiErrorKind,
    httpStatus: number,
    code: string,
    messageTh: string,
    retryable = false
  ): GeminiErrorInfo => ({ kind, httpStatus, code, messageTh, retryable, detail });

  if (detail.includes('MISSING_KEY')) {
    return make(
      'MISSING_KEY',
      400,
      'missing_gemini_key',
      'ยังไม่ได้ตั้งค่า Gemini API Key — ไปที่ การตั้งค่า (⚙️) เพื่อใส่คีย์'
    );
  }

  if (/API_KEY_INVALID|API key not valid|invalid api key|API key expired|api_key_invalid/i.test(detail)) {
    return make(
      'INVALID_KEY',
      400,
      'invalid_api_key',
      'API Key ไม่ถูกต้องหรือหมดอายุ — คัดลอกคีย์ใหม่จาก Google AI Studio'
    );
  }

  if (status === 401) {
    return make(
      'INVALID_KEY',
      400,
      'invalid_api_key',
      'API Key ไม่ถูกต้องหรือหมดอายุ — คัดลอกคีย์ใหม่จาก Google AI Studio'
    );
  }

  if (/PERMISSION_DENIED|permission denied|not authorized/i.test(detail) || status === 403) {
    return make(
      'PERMISSION_DENIED',
      400,
      'permission_denied',
      'คีย์นี้ไม่มีสิทธิ์ใช้โมเดล/โปรเจกต์ที่ระบุ — ตรวจสอบสิทธิ์ใน Google AI Studio'
    );
  }

  if (
    /NOT_FOUND|is not found for API version|not supported for|does not support/i.test(detail) ||
    status === 404
  ) {
    return make(
      'MODEL_NOT_FOUND',
      502,
      'model_not_found',
      'โมเดล Gemini ที่ระบบเรียกใช้ไม่พร้อมใช้งานแล้ว — ระบบจะลองโมเดลสำรองให้อัตโนมัติ'
    );
  }

  if (/RESOURCE_EXHAUSTED|quota|rate limit|too many requests/i.test(detail) || status === 429) {
    return make(
      'QUOTA',
      429,
      'quota_exceeded',
      'คีย์นี้ใช้งานเกินโควตาหรือถูกจำกัดอัตราชั่วคราว — รอสักครู่แล้วลองใหม่ หรือเปิด Billing',
      true
    );
  }

  if (/fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|network|socket hang up/i.test(detail)) {
    return make(
      'NETWORK',
      502,
      'gemini_unreachable',
      'เชื่อมต่อบริการ Google ไม่ได้ในขณะนี้ (เครือข่าย/ไฟร์วอลล์) — ลองใหม่อีกครั้ง',
      true
    );
  }

  if (status === 400) {
    return make(
      'BAD_REQUEST',
      400,
      'bad_request',
      'คำขอถูกปฏิเสธจาก Gemini — ลองใหม่อีกครั้ง หรือตรวจสอบคีย์/โมเดล'
    );
  }

  if (typeof status === 'number' && STATUS_TOKENS[status] === 'SERVER_ERROR') {
    return make(
      'SERVER_ERROR',
      502,
      'gemini_unavailable',
      'บริการ Gemini ขัดข้องชั่วคราว — ลองใหม่อีกครั้งในอีกสักครู่',
      true
    );
  }

  return make(
    'UNKNOWN',
    500,
    'gemini_failed',
    'เรียกใช้ Gemini ไม่สำเร็จ — ลองใหม่อีกครั้ง'
  );
}

/** True when the caller should silently move to the next model in the chain. */
export function shouldTryFallbackModel(info: GeminiErrorInfo): boolean {
  return info.kind === 'MODEL_NOT_FOUND' || info.kind === 'SERVER_ERROR';
}

export interface ModelFallbackOptions {
  chain?: readonly string[];
  /** Called before retrying with the next model (for logging). */
  onFallback?: (failedModel: string, nextModel: string, info: GeminiErrorInfo) => void;
}

/**
 * Try each model in the chain until one answers.
 * Non-model errors (bad key, quota, network) are re-thrown immediately — retrying
 * a different model for those would just burn another request.
 */
export async function withModelFallback<T>(
  attempt: (model: string) => Promise<T>,
  options: ModelFallbackOptions = {}
): Promise<T> {
  const chain =
    options.chain && options.chain.length > 0 ? Array.from(options.chain) : [DEFAULT_GEMINI_MODEL];

  let lastError: unknown;

  for (let index = 0; index < chain.length; index += 1) {
    const model = chain[index];
    try {
      return await attempt(model);
    } catch (error) {
      lastError = error;
      const info = classifyGeminiError(error);
      const nextModel = chain[index + 1];
      if (!shouldTryFallbackModel(info) || !nextModel) {
        throw error;
      }
      options.onFallback?.(model, nextModel, info);
    }
  }

  throw lastError;
}

/** Key resolution shared by every route: user key wins, env key is the fallback. */
export interface ResolvedGeminiKey {
  key: string;
  source: 'user' | 'server' | 'none';
  check: ReturnType<typeof checkGeminiKey>;
}

export function resolveGeminiKey(
  userKey?: string | null,
  env: Record<string, string | undefined> = {}
): ResolvedGeminiKey {
  const fromUser = checkGeminiKey(userKey);
  if (fromUser.valid) {
    return { key: (userKey as string).trim(), source: 'user', check: fromUser };
  }

  const envKey = env.GEMINI_API_KEY;
  const fromEnv = checkGeminiKey(envKey);
  if (fromEnv.valid) {
    return { key: (envKey as string).trim(), source: 'server', check: fromEnv };
  }

  return { key: '', source: 'none', check: fromUser };
}
