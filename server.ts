import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type, type FunctionDeclaration, type Schema } from '@google/genai';
import { buildChatPrompt, isChatTone } from './src/services/chatStreamCore';
import { createRateLimiter } from './src/server/rateLimit';
import {
  MASCOT_ACTION_CATALOG,
  MASCOT_SANDBOX_CAPABILITIES,
  describeMascotAction,
  parseMascotAction,
  type MascotAction,
  type MascotCapabilitySpec,
} from './src/mascot/actions';
import {
  buildModelChain,
  classifyGeminiError,
  resolveGeminiKey,
  resolveGeminiModel,
  withModelFallback,
} from './src/server/geminiConfig';
import type { ChatTone } from './src/services/chatStreamCore';
import {
  extractBearerToken,
  rememberRuntimeDriveToken,
  syncPendingToGoogleDrive,
} from './src/server/googleDriveArchive';
import {
  getArchiveOverviewStatus,
  listBacktestArchives,
  readSensitivityMatrix,
  recordBacktestArchive,
  runDailyArchive,
  startDailyArchiveScheduler,
} from './src/server/marketArchiveEngine';
import {
  getHistoricalCandlesInternalFirst,
  listCachedAssetSummaries,
  readCachedAssetHistory,
  readHistoricalRotationState,
  rotateOneAsset1000DayHistory,
} from './src/server/historicalCandleCache';
import {
  type DailyCsvDataset,
  type DailyDriveExportScope,
  buildCsvFileFromSnapshots,
  exportDailyCsvToGoogleDrive,
  listAvailableDailySnapshots,
  loadDailySnapshots,
} from './src/server/dailyCsvExporter';

import { handleYahooProxyRequest } from './src/server/yahooProxy';
import {
  getCachedAiResponse,
  hashPromptSignature,
  isGroundingGloballyEnabled,
  markGroundingBlocked,
  setCachedAiResponse,
  shouldAttemptGrounding,
  shouldCooldownGroundingOnError,
} from './src/server/geminiQuotaShield';
import { categorizeHeadlinesHeuristic } from './src/services/headlineCategorizationService';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Behind Cloud Run / a tunnel the client IP arrives in X-Forwarded-For.
app.set('trust proxy', 1);

// Cloud Run / Google AI Studio health check (bypass rate limiter so probes never fail)
app.get('/api/health', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    status: 'ok',
    service: 'motorboy-ai-th',
    mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
    uptimeSec: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

/**
 * JSON bodies are small in this app (market snapshots, article batches).
 * 10 MB was an invitation to memory pressure and cost amplification on routes
 * that proxy a paid model, so the ceiling is now 1 MB.
 */
app.use(express.json({ limit: '1mb' }));

// จำกัดจำนวนคำขอต่อ IP สำหรับ route ที่ไปเรียกโมเดลคิดเงิน
// (ตัว implement + เทสต์อยู่ที่ src/server/rateLimit.ts)
const apiRateLimiter = createRateLimiter({ windowMs: 60_000, max: 60 });
app.use('/api', apiRateLimiter);

// Production & fallback reverse proxy for Yahoo Finance quotes/candles
app.use('/api/yahoo', (req, res) => {
  void handleYahooProxyRequest(req, res);
});

/**
 * โมเดลตั้งต้นอ่านจาก env `GEMINI_MODEL` (ดีฟอลต์ DEFAULT_GEMINI_MODEL)
 * ถ้าโมเดลถูกเปลี่ยนชื่อ/ปลดระวาง mid-flight ระบบจะไล่ fallback chain ให้เอง
 * แทนที่จะล้มทั้งหน้า AI
 */
const GEMINI_MODEL = resolveGeminiModel(process.env);
const GEMINI_MODEL_CHAIN = buildModelChain(GEMINI_MODEL);

function createGeminiClient(apiKey: string): GoogleGenAI {
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

/** Helper to instantiate GoogleGenAI client on the server (strict key shape check) */
function getGeminiClient(userApiKey?: string) {
  // ลำดับความสำคัญ: คีย์ของผู้ใช้ → คีย์ฝั่งเซิร์ฟเวอร์ (env) → ไม่มีคีย์
  const resolved = resolveGeminiKey(userApiKey, process.env);
  if (resolved.source === 'none') return null;

  return createGeminiClient(resolved.key);
}

/** สร้าง client พร้อมบอกที่มาของคีย์ (ใช้ใน route test-key เพื่อรายงานผลให้ตรง) */
function getGeminiClientWithSource(userApiKey?: string) {
  const resolved = resolveGeminiKey(userApiKey, process.env);
  if (resolved.source === 'none') return { client: null as GoogleGenAI | null, source: 'none' as const, key: '' };
  return {
    client: createGeminiClient(resolved.key),
    source: resolved.source,
    key: resolved.key,
  };
}

/** Strip sampling params that gemini-4-* models reject with 400 BAD_REQUEST */
function sanitizeConfigForModel(
  model: string,
  config?: Record<string, any>
): Record<string, any> | undefined {
  if (!config || !model.startsWith('gemini-4-')) return config;
  const { temperature: _t, topP: _p, topK: _k, candidateCount: _c, ...rest } = config;
  return rest;
}

/**
 * เรียก generateContent โดยไล่ fallback chain เมื่อเจอ MODEL_NOT_FOUND เท่านั้น
 * (คีย์ผิด/โควตาหมด/เน็ตล่ม → โยนต่อทันที ไม่เผา request เพิ่ม)
 */
async function generateGeminiContent(
  ai: GoogleGenAI,
  params: { contents: any; config?: Record<string, any> }
) {
  return withModelFallback(
    (model) =>
      ai.models.generateContent({
        model,
        contents: params.contents,
        config: sanitizeConfigForModel(model, params.config),
      }),
    {
      chain: GEMINI_MODEL_CHAIN,
      onFallback: (failed, next, info) =>
        console.warn(`Gemini model "${failed}" unavailable (${info.kind}), retrying with "${next}"`),
    }
  );
}

/** เวอร์ชันสตรีมของ generateGeminiContent */
async function generateGeminiStream(
  ai: GoogleGenAI,
  params: { contents: any; config?: Record<string, any> }
) {
  return withModelFallback(
    (model) =>
      ai.models.generateContentStream({
        model,
        contents: params.contents,
        config: sanitizeConfigForModel(model, params.config),
      }),
    {
      chain: GEMINI_MODEL_CHAIN,
      onFallback: (failed, next, info) =>
        console.warn(`Gemini stream model "${failed}" unavailable (${info.kind}), retrying with "${next}"`),
    }
  );
}

const rejectedServerKeys = new Set<string>();

/**
 * Execute an operational Gemini task with automatic fallback from an expired/invalid
 * user key to the configured server key (never used by /api/gemini/test-key).
 */
async function runWithUserOrServerKey<T>(
  userApiKey: string | undefined,
  task: (ai: GoogleGenAI, activeKey: string) => Promise<T>
): Promise<T> {
  const primary = resolveGeminiKey(userApiKey, process.env);
  if (primary.source === 'none') {
    throw new Error('MISSING_KEY');
  }
  try {
    const result = await task(createGeminiClient(primary.key), primary.key);
    if (primary.source === 'server') rejectedServerKeys.delete(primary.key);
    return result;
  } catch (err) {
    const info = classifyGeminiError(err);
    if (info.kind === 'INVALID_KEY' || info.kind === 'PERMISSION_DENIED') {
      if (primary.source === 'server') {
        rejectedServerKeys.add(primary.key);
      } else if (primary.source === 'user') {
        const serverFallback = resolveGeminiKey(undefined, process.env);
        if (
          serverFallback.source === 'server' &&
          serverFallback.key !== primary.key &&
          !rejectedServerKeys.has(serverFallback.key)
        ) {
          try {
            return await task(createGeminiClient(serverFallback.key), serverFallback.key);
          } catch (fallbackErr) {
            const fbInfo = classifyGeminiError(fallbackErr);
            if (fbInfo.kind === 'INVALID_KEY' || fbInfo.kind === 'PERMISSION_DENIED') {
              rejectedServerKeys.add(serverFallback.key);
            }
            throw fallbackErr;
          }
        }
      }
    }
    throw err;
  }
}

/**
 * คีย์หาย vs คีย์ผิดรูป ต้องได้คนละข้อความ — เดิมทุกกรณีตอบว่า
 * "Missing Gemini API Key" ทำให้ผู้ใช้ที่วางคีย์ผิดไม่รู้ว่าผิดตรงไหน
 */
function sendKeyProblem(res: express.Response, userKey?: string) {
  const resolved = resolveGeminiKey(userKey, process.env);
  const empty = !userKey || !String(userKey).trim();
  return res.status(400).json({
    error: empty ? 'missing_gemini_key' : 'invalid_key_format',
    kind: empty ? 'MISSING_KEY' : 'INVALID_KEY',
    retryable: false,
    message: empty
      ? 'ยังไม่ได้ตั้งค่า Gemini API Key — ไปที่ การตั้งค่า (⚙️) เพื่อใส่คีย์'
      : resolved.check.hint,
  });
}

/**
 * แปลง error จาก Gemini เป็น response ที่ปลอดภัย: โค้ดคงที่ + ข้อความไทย
 * ไม่ส่งข้อความภายใน (เช่น "fetch failed") ออกไปให้ client เห็น
 */
function logUnexpectedGeminiError(info: ReturnType<typeof classifyGeminiError>, context: string) {
  if (info.kind === 'SERVER_ERROR' || info.kind === 'MODEL_NOT_FOUND' || info.kind === 'UNKNOWN') {
    console.warn(`[gemini:${context}] ${info.kind} (${info.code})`);
  }
}

function sendGeminiError(res: express.Response, error: unknown, context: string) {
  const info = classifyGeminiError(error);
  logUnexpectedGeminiError(info, context);
  return res.status(info.httpStatus).json({
    error: info.code,
    message: info.messageTh,
    kind: info.kind,
    retryable: info.retryable,
  });
}

/** Extract JSON from response text safely */
function extractJsonFromText<T = Record<string, unknown>>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    // try stripping code fences
  }

  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch && codeBlockMatch[1]) {
    try {
      return JSON.parse(codeBlockMatch[1].trim()) as T;
    } catch {
      // continue
    }
  }

  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const jsonCandidate = text.substring(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(jsonCandidate) as T;
    } catch {
      // ignore
    }
  }

  const firstBracket = text.indexOf('[');
  const lastBracket = text.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    const jsonCandidate = text.substring(firstBracket, lastBracket + 1);
    try {
      return JSON.parse(jsonCandidate) as T;
    } catch {
      // ignore
    }
  }

  return null;
}

/** Helper to call generateContent with search grounding and automatic cooldown + plain generation fallback */
async function generateWithGroundingFallback(
  ai: GoogleGenAI,
  contents: any,
  baseConfig: Record<string, any> = {},
  activeKey?: string
) {
  if (!shouldAttemptGrounding(activeKey, process.env)) {
    return await generateGeminiContent(ai, { contents, config: baseConfig });
  }

  try {
    return await generateGeminiContent(ai, {
      contents,
      config: { ...baseConfig, tools: [{ googleSearch: {} }] },
    });
  } catch (searchError: unknown) {
    const info = classifyGeminiError(searchError);
    if (shouldCooldownGroundingOnError(info)) {
      markGroundingBlocked(activeKey);
    }
    // Fallback แบบไม่ค้นหาเฉพาะเมื่อ "เครื่องมือค้นหา" ถูกจำกัด ไม่ใช่เมื่อคีย์ผิด:
    // • QUOTA / BAD_REQUEST (free tier ไม่รองรับ googleSearch) → ลองใหม่แบบไม่มี tool + ติด cooldown 15 นาที
    // • INVALID_KEY / PERMISSION / NETWORK → โยนต่อทันที (ยิงซ้ำก็ไม่ช่วย)
    if (info.kind === 'QUOTA' || info.kind === 'BAD_REQUEST') {
      return await generateGeminiContent(ai, { contents, config: baseConfig });
    }
    throw searchError;
  }
}

// ============================================================================
// SERVER-SIDE GEMINI API ROUTES
// ============================================================================

/** 0. Config probe — ให้ UI แสดงโมเดลจริงและสถานะคีย์ฝั่งเซิร์ฟเวอร์ได้ */
app.get('/api/gemini/config', (_req, res) => {
  const serverKey = resolveGeminiKey(undefined, process.env);
  const configured =
    serverKey.source === 'server' && !rejectedServerKeys.has(serverKey.key);
  return res.json({
    model: GEMINI_MODEL,
    fallbackModels: GEMINI_MODEL_CHAIN.slice(1),
    serverKeyConfigured: configured,
    groundingEnabled: isGroundingGloballyEnabled(process.env),
  });
});

/** 1. Test Gemini API Key */
app.post('/api/gemini/test-key', async (req, res) => {
  const { apiKey, userEmail } = req.body || {};

  // ตรวจ "รูปแบบ" ก่อน ไม่ต้องยิงเน็ตถ้าคีย์ผิดรูปอยู่แล้ว
  const { client: ai, source, key } = getGeminiClientWithSource(apiKey);
  if (!ai) {
    const check = resolveGeminiKey(apiKey, process.env);
    const empty = !apiKey || !String(apiKey).trim();
    return res.status(400).json({
      success: false,
      error: empty ? 'missing_gemini_key' : 'invalid_key_format',
      text: empty
        ? 'กรุณากรอก Gemini API Key ก่อนทำการทดสอบ'
        : check.check.hint || 'รูปแบบ API Key ไม่ถูกต้อง',
    });
  }

  const runTestGeneration = (withSearch: boolean) =>
    generateGeminiContent(ai, {
      contents: 'ตอบสั้นๆ 1 บรรทัดภาษาไทย: ยืนยันสถานะการเชื่อมต่อ AI สำหรับระบบวิเคราะห์ตลาด',
      config: withSearch ? { tools: [{ googleSearch: {} }], temperature: 0.2 } : { temperature: 0.2 },
    });

  try {
    let response: any;
    let searchGrounded = shouldAttemptGrounding(key, process.env);

    if (searchGrounded) {
      try {
        response = await runTestGeneration(true);
      } catch (groundingErr: unknown) {
        const info = classifyGeminiError(groundingErr);
        if (shouldCooldownGroundingOnError(info)) {
          markGroundingBlocked(key);
        }
        // ลองใหม่แบบไม่มี tool เฉพาะเมื่อปัญหาคือ "เครื่องมือค้นหา" ไม่ใช่คีย์ผิด
        if (info.kind !== 'QUOTA' && info.kind !== 'BAD_REQUEST') throw groundingErr;
        searchGrounded = false;
        response = await runTestGeneration(false);
      }
    } else {
      response = await runTestGeneration(false);
    }

    if (!response?.text) {
      return res.status(502).json({
        success: false,
        error: 'empty_gemini_response',
        text: 'เชื่อมต่อได้แต่โมเดลไม่ตอบกลับ — ลองใหม่อีกครั้ง',
      });
    }

    const emailNotice = userEmail ? ` (เชื่อมโยงกับบัญชี ${userEmail})` : '';
    const keyNotice =
      source === 'server' ? 'ใช้คีย์ฝั่งเซิร์ฟเวอร์ (ENV)' : 'ใช้คีย์ที่กรอกในฟอร์ม';

    return res.json({
      success: true,
      model: GEMINI_MODEL,
      keySource: source,
      keyMasked: key ? `${key.slice(0, 4)}••••${key.slice(-4)}` : '',
      searchGrounded,
      text: searchGrounded
        ? `เชื่อมต่อ Gemini (${GEMINI_MODEL}) สำเร็จ!${emailNotice} ${keyNotice} • รองรับ Google Search Grounding ✓`
        : `เชื่อมต่อ Gemini (${GEMINI_MODEL}) สำเร็จ!${emailNotice} ${keyNotice} • โหมดประหยัดโควตา ✓`,
    });
  } catch (error: unknown) {
    return sendGeminiError(res, error, 'test-key');
  }
});

/** 2. Fetch Market Sentiment Score */
app.post('/api/gemini/sentiment', async (req, res) => {
  const { apiKey, coin, signal } = req.body || {};
  const ai = getGeminiClient(apiKey);
  if (!ai) return sendKeyProblem(res, apiKey);
  if (!coin) return res.status(400).json({ error: 'missing_coin_data' });

  try {
    const prompt = `คุณคือผู้เชี่ยวชาญด้าน Crypto Market Sentiment และ On-chain Analytics
โปรดประเมินคะแนน Market Sentiment Score (0 ถึง 100) สำหรับเหรียญต่อไปนี้:
- เหรียญ: ${coin.name} (${coin.symbol})
- ราคาปัจจุบัน: $${coin.price}
- การเปลี่ยนแปลง 24 ชั่วโมง: ${coin.change}%
- ราคาสูงสุด 24 ชม.: $${coin.high || 'N/A'}
- ราคาต่ำสุด 24 ชม.: $${coin.low || 'N/A'}
- ปริมาณการซื้อขาย 24 ชม.: $${coin.volume ? coin.volume.toLocaleString() : 'N/A'}
${signal ? `- สัญญาณเทคนิค: ${signal.type} (ความน่าจะเป็น ${signal.probability}%)` : ''}

เกณฑ์คะแนน (0-100):
- 0-24: EXTREME_FEAR (ความกลัวขั้นสุด)
- 25-44: BEARISH (เชิงลบ / วิตกกังวล)
- 45-55: NEUTRAL (เป็นกลาง / พักตัวรอดูทิศทาง)
- 56-75: BULLISH (เชิงบวก / ความโลภปานกลาง)
- 76-100: EXTREME_GREED (ความโลภสูงสุด)

ตอบเป็นภาษาไทย ในรูปแบบ JSON ที่มี key ดังต่อไปนี้เท่านั้น:
{
  "score": ตัวเลขจำนวนเต็ม 0 ถึง 100,
  "sentimentLabel": "EXTREME_GREED" หรือ "BULLISH" หรือ "NEUTRAL" หรือ "BEARISH" หรือ "EXTREME_FEAR",
  "sentimentTextTh": "คำนิยามสั้นๆ ภาษาไทย เช่น 'กระทิงคึกคัก (Bullish)' หรือ 'พักฐานระมัดระวัง'",
  "summaryReason": "สรุปสั้น 1-2 ประโยค อธิบายสิ่งที่ขับเคลื่อน sentiment ของเหรียญนี้ในปัจจุบัน",
  "socialMomentum": "HIGH" หรือ "MODERATE" หรือ "LOW",
  "whaleActivity": "ACCUMULATION" หรือ "DISTRIBUTION" หรือ "NEUTRAL"
}`;

    const response = await runWithUserOrServerKey(apiKey, (client, activeKey) =>
      generateWithGroundingFallback(client, prompt, {}, activeKey)
    );

    const parsed = extractJsonFromText<any>(response.text || '{}');
    if (!parsed) throw new Error('Unparseable sentiment JSON');

    const score = Math.min(100, Math.max(0, Number(parsed.score) || 50));
    const safetyMargin = Math.max(5, Math.min(50, Number(parsed.safetyMargin) || Math.round((100 - score) * 0.35 + 8)));

    return res.json({
      score,
      sentimentLabel: parsed.sentimentLabel || 'NEUTRAL',
      sentimentTextTh: parsed.sentimentTextTh || 'เป็นกลาง',
      summaryReason: parsed.summaryReason || 'ประเมินจากราคาและสภาพคล่องตลาด',
      socialMomentum: parsed.socialMomentum || 'MODERATE',
      whaleActivity: parsed.whaleActivity || 'NEUTRAL',
      source: 'GEMINI_AI',
      safetyMargin,
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    return sendGeminiError(res, error, 'sentiment');
  }
});

/** 3. Analyze Market with Gemini */
app.post('/api/gemini/analyze-market', async (req, res) => {
  const { apiKey, coin, signal } = req.body || {};
  const ai = getGeminiClient(apiKey);
  if (!ai) return sendKeyProblem(res, apiKey);
  if (!coin) return res.status(400).json({ error: 'missing_coin_data' });

  const isUp = coin.change >= 0;
  const isForex = coin.symbol.includes('/') || signal?.category === 'FOREX';
  const defaultSup = isForex ? (isUp ? coin.price * 0.994 : coin.price * 0.988) : (coin.low || coin.price * 0.955);
  const defaultRes = isForex ? (isUp ? coin.price * 1.012 : coin.price * 1.006) : (coin.high || coin.price * 1.045);

  try {
    const marketType = isForex ? 'Forex และเศรษฐศาสตร์มหภาคระดับสถาบันการเงินโลก' : 'Technical Analysis และกลยุทธ์การเทรดคริปโตเคอร์เรนซีระดับสถาบัน';
    const prompt = `คุณคือผู้เชี่ยวชาญด้าน ${marketType}
โปรดวิเคราะห์สินทรัพย์ต่อไปนี้ตามข้อมูลราคาตลาดแบบ Real-time:

- สินทรัพย์: ${coin.name} (${coin.symbol}) ${isForex ? '[Forex Pair]' : '[Crypto]'}
- ราคาปัจจุบัน: ${coin.price}
- เปลี่ยนแปลง 24 ชั่วโมง: ${coin.change}%
- ราคาสูงสุด 24 ชม.: ${coin.high || 'N/A'}
- ราคาต่ำสุด 24 ชม.: ${coin.low || 'N/A'}
- ปริมาณการซื้อขาย (Volume): ${coin.volume ? coin.volume.toLocaleString() : 'N/A'}
${signal ? `- สัญญาณเทคนิคระบบ: ${signal.type} (ความน่าจะเป็น ${signal.probability}%, SL: ${signal.sl}, TP: ${signal.tp})` : ''}

ตอบเป็นภาษาไทย โดยให้ผลลัพธ์ในรูปแบบ JSON ที่มี key ดังนี้เท่านั้น:
{
  "action": "LONG" หรือ "SHORT" หรือ "NEUTRAL",
  "confidence": ตัวเลข 50-98,
  "summary": "สรุปสภาวะตลาดและทิศทาง 2-3 ประโยค สั้นกระชับ ชัดเจน",
  "supportLevel": ตัวเลขราคาแนวรับ,
  "resistanceLevel": ตัวเลขราคาแนวต้าน,
  "strategyAdvice": "คำแนะนำการวางกลยุทธ์ การตั้ง SL/TP และการบริหารความเสี่ยง",
  "sentimentScore": ตัวเลขคะแนน Sentiment 0 ถึง 100,
  "sentimentLabel": "EXTREME_GREED" หรือ "BULLISH" หรือ "NEUTRAL" หรือ "BEARISH" หรือ "EXTREME_FEAR",
  "sentimentTextTh": "คำนิยามอารมณ์ตลาดภาษาไทย เช่น 'กระทิงคึกคัก'",
  "socialMomentum": "HIGH" หรือ "MODERATE" หรือ "LOW",
  "whaleActivity": "ACCUMULATION" หรือ "DISTRIBUTION" หรือ "NEUTRAL"
}`;

    const response = await runWithUserOrServerKey(apiKey, (client, activeKey) =>
      generateWithGroundingFallback(client, prompt, {}, activeKey)
    );

    const parsed = extractJsonFromText<any>(response.text || '{}');
    if (!parsed) throw new Error('Unparseable market analysis response');

    const sScore = Math.min(100, Math.max(0, Number(parsed.sentimentScore) || (coin.change >= 0 ? 68 : 38)));

    return res.json({
      symbol: coin.symbol,
      action: parsed.action || (coin.change >= 0 ? 'LONG' : 'SHORT'),
      confidence: Number(parsed.confidence) || 75,
      summary: parsed.summary || 'วิเคราะห์ตลาดเรียบร้อยแล้ว',
      supportLevel: Number(parsed.supportLevel) || defaultSup,
      resistanceLevel: Number(parsed.resistanceLevel) || defaultRes,
      strategyAdvice: parsed.strategyAdvice || 'ติดตามแนวโน้มอย่างใกล้ชิดและตั้ง SL เสมอ',
      sentiment: {
        score: sScore,
        sentimentLabel: parsed.sentimentLabel || (sScore >= 56 ? 'BULLISH' : 'BEARISH'),
        sentimentTextTh: parsed.sentimentTextTh || (sScore >= 56 ? 'เชิงบวก' : 'เชิงลบ'),
        summaryReason: parsed.summary || 'ประเมินจากราคาและสัญญาณเทคนิค',
        socialMomentum: parsed.socialMomentum || 'MODERATE',
        whaleActivity: parsed.whaleActivity || 'NEUTRAL',
        source: 'GEMINI_AI',
        safetyMargin: Math.max(5, Math.min(50, Number(parsed.safetyMargin) || Math.round((100 - sScore) * 0.35 + 8))),
        timestamp: new Date().toISOString(),
      },
      source: 'GEMINI_AI',
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    return sendGeminiError(res, error, 'analyze-market');
  }
});

/** 4. Analyze News with Gemini */
app.post('/api/gemini/analyze-news', async (req, res) => {
  const { apiKey, article } = req.body || {};
  const ai = getGeminiClient(apiKey);
  if (!ai) return sendKeyProblem(res, apiKey);
  if (!article) return res.status(400).json({ error: 'missing_article' });

  try {
    const prompt = `คุณคือนักกลยุทธ์การเงินและนักวิเคราะห์มหภาคระดับสถาบัน (Institutional Macro & Quantitative Market Strategist)
มีภารกิจวิเคราะห์ข่าวสารการเงินและการลงทุนจากแหล่งข่าว "${article.source}" เพื่อให้คำแนะนำที่ "แม่นยำที่สุด" สำหรับเทรดเดอร์และนักลงทุน

ข้อมูลข่าว:
- หัวข้อข่าว: "${article.title}"
- แหล่งข่าว: "${article.source}"
- เวลาที่เผยแพร่: "${article.time}"
- หมวดหมู่: "${article.category || 'General Financial News'}"
- ลิงก์อ้างอิง: "${article.url}"

กรุณาวิเคราะห์ผลกระทบต่อตลาดอย่างละเอียด รอบคอบ และแม่นยำที่สุด โดยตอบเป็นภาษาไทยในรูปแบบ JSON มีโครงสร้างดังนี้เท่านั้น:
{
  "sentiment": "BULLISH" หรือ "BEARISH" หรือ "NEUTRAL",
  "sentimentLabelTh": "ระบุผลกระทบ เช่น 'เชิงบวกอย่างมีนัยสำคัญ (Strong Bullish)' หรือ 'ระมัดระวังแรงขาย (Cautious)'",
  "accuracyScore": ตัวเลขอัตราความแม่นยำ/ความมั่นใจในการประเมินระหว่าง 85 ถึง 98,
  "marketImpact": "HIGH" หรือ "MEDIUM" หรือ "LOW",
  "affectedMarkets": ["ระบุสินทรัพย์/ตลาดที่กระทบ เช่น 'SET Index (ตลาดหุ้นไทย)', 'USD/THB (ค่าเงินบาท)', 'Bitcoin / คริปโต', 'ทองคำ (Gold)'"],
  "impactHorizon": "SHORT_TERM" หรือ "MEDIUM_TERM" หรือ "LONG_TERM",
  "coreTakeaway": "สรุปสาระสำคัญของข่าว 1-2 ประโยค ชัดเจนและตรงประเด็นที่สุด",
  "marketImplication": "การวิเคราะห์ผลกระทบเชิงลึกต่อสภาพคล่อง, โครงสร้างราคา, และพฤติกรรมเงินทุนสถาบัน (Fund Flow)",
  "tradingStrategyAdvice": "กลยุทธ์การเทรดที่แนะนำอย่างแม่นยำ (จุดสังเกต, การเข้าสถานะ, การคุมความเสี่ยงและ Stop Loss)",
  "macroRisk": "LOW" หรือ "MODERATE" หรือ "ELEVATED" หรือ "HIGH",
  "volatilityForecast": "EXPANDING" หรือ "STABLE" หรือ "COMPRESSING",
  "recommendedPositioning": "ACCUMULATE" หรือ "HOLD" หรือ "REDUCE_RISK" หรือ "HEDGE",
  "riskFactors": ["ปัจจัยเสี่ยงข้อที่ 1 ที่ต้องจับตา", "ปัจจัยเสี่ยงข้อที่ 2 ที่ต้องจับตา"]
}`;

    const response = await runWithUserOrServerKey(apiKey, (client, activeKey) =>
      generateWithGroundingFallback(client, prompt, {}, activeKey)
    );

    const parsed = extractJsonFromText<any>(response.text || '{}');
    if (!parsed) throw new Error('Unparseable news analysis JSON');

    return res.json({
      newsId: article.id,
      title: article.title,
      source: article.source,
      url: article.url,
      sentiment: parsed.sentiment || article.sentiment || 'NEUTRAL',
      sentimentLabelTh: parsed.sentimentLabelTh || 'ประเมินเป็นกลางต่อตลาด',
      accuracyScore: Math.min(99, Math.max(80, Number(parsed.accuracyScore) || 92)),
      marketImpact: parsed.marketImpact || (article.impact || 'MEDIUM'),
      affectedMarkets: Array.isArray(parsed.affectedMarkets) && parsed.affectedMarkets.length > 0
        ? parsed.affectedMarkets
        : ['SET Index (ตลาดหุ้นไทย)', 'USD/THB (ค่าเงินบาท)'],
      impactHorizon: parsed.impactHorizon || 'SHORT_TERM',
      coreTakeaway: parsed.coreTakeaway || (article.summary || article.title),
      marketImplication: parsed.marketImplication || 'ข่าวนี้ส่งผลกระทบต่อความผันผวนระยะสั้นและกระแสเงินทุน',
      tradingStrategyAdvice: parsed.tradingStrategyAdvice || 'แนะนำรอจังหวะ Breakout ยืนยันแนวรับ-แนวต้าน',
      keyMetrics: {
        macroRisk: parsed.macroRisk || 'MODERATE',
        volatilityForecast: parsed.volatilityForecast || 'EXPANDING',
        recommendedPositioning: parsed.recommendedPositioning || 'HOLD',
      },
      riskFactors: Array.isArray(parsed.riskFactors) && parsed.riskFactors.length > 0
        ? parsed.riskFactors
        : ['ความผันผวนของอัตราแลกเปลี่ยนและค่าเงินดอลลาร์'],
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    return sendGeminiError(res, error, 'analyze-news');
  }
});

/** 5. Holistic Market Stance */
app.post('/api/gemini/holistic-stance', async (req, res) => {
  const { apiKey, signals = [], newsList = [] } = req.body || {};
  const ai = getGeminiClient(apiKey);
  if (!ai) return sendKeyProblem(res, apiKey);

  try {
    const topSignalsSummary = signals.slice(0, 8).map(
      (s: any) => `- ${s.symbol}: ${s.type} (ความน่าจะเป็น ${s.probability}%, ราคา $${s.price})`
    ).join('\n');

    const topNewsSummary = newsList.slice(0, 6).map(
      (n: any) => `- [${n.source}] ${n.title} (Sentiment: ${n.sentiment})`
    ).join('\n');

    const prompt = `คุณคือหัวหน้านักวิเคราะห์กลยุทธ์การลงทุนตลาดการเงินและสินทรัพย์ดิจิทัล (Chief Investment Officer & Quantitative Strategist)
มีภารกิจสรุปสภาวะตลาดแบบองค์รวม (Holistic Market Synthesis) โดยประมวลผลจากข้อมูลสด:

ชุดข้อมูลสัญญาณเทรด (${signals.length} สินทรัพย์):
${topSignalsSummary}

ชุดข้อมูลข่าวสารและดัชนีเศรษฐกิจ (${newsList.length} ข่าว):
${topNewsSummary}

โปรดประเมินสภาวะตลาดองค์รวม และให้คำแนะนำเด็ดขาดสั้นๆ ว่าตลาดควร 'Buy', 'Sell' หรือ 'Hold' โดยตอบเป็นภาษาไทยในรูปแบบ JSON โครงสร้างนี้เท่านั้น:
{
  "recommendation": "BUY" หรือ "SELL" หรือ "HOLD",
  "recommendationLabelTh": "คำภาษาไทยสั้นๆ เช่น 'เข้าซื้อสะสม (Buy)' หรือ 'ชะลอขายลดพอร์ต (Sell)' หรือ 'ถือเงินสดรอดูจังหวะ (Hold)'",
  "confidence": ตัวเลขเปอร์เซ็นต์ความมั่นใจ 70 ถึง 98,
  "marketStance": "สภาวะตลาดสรุปสั้น 1 ประโยค",
  "summaryReason": "เหตุผลประกอบคำแนะนำที่ชัดเจนและกระชับ 1-2 ประโยค",
  "keyDrivers": ["ปัจจัยขับเคลื่อนที่ 1", "ปัจจัยขับเคลื่อนที่ 2", "ปัจจัยขับเคลื่อนที่ 3"],
  "riskFactor": "ปัจจัยเสี่ยงสำคัญที่สุด 1 ข้อที่ต้องจับตาอย่างใกล้ชิด"
}`;

    const stanceCacheKey = `stance:${hashPromptSignature({
      signals: topSignalsSummary,
      news: topNewsSummary,
    })}`;
    const cachedStance = getCachedAiResponse<Record<string, unknown>>(stanceCacheKey);
    if (cachedStance) {
      return res.json(cachedStance);
    }

    const response = await runWithUserOrServerKey(apiKey, (client, activeKey) =>
      generateWithGroundingFallback(client, prompt, {}, activeKey)
    );

    const parsed = extractJsonFromText<any>(response.text || '{}');
    if (!parsed) throw new Error('Unparseable holistic stance response');

    const rec = (parsed.recommendation as string)?.toUpperCase();
    const validRec = rec === 'BUY' ? 'BUY' : rec === 'SELL' ? 'SELL' : 'HOLD';

    const payload = {
      recommendation: validRec,
      recommendationLabelTh: parsed.recommendationLabelTh || (validRec === 'BUY' ? 'เข้าซื้อสะสม (Buy)' : validRec === 'SELL' ? 'ชะลอขาย (Sell)' : 'ถือรอดูจังหวะ (Hold)'),
      confidence: Math.min(98, Math.max(65, Number(parsed.confidence) || 80)),
      marketStance: parsed.marketStance || 'ตลาดเคลื่อนไหวในกรอบสะสมกำลัง',
      summaryReason: parsed.summaryReason || 'ประเมินจากสัญญาณเทคนิคัลและกระแสข่าว',
      keyDrivers: Array.isArray(parsed.keyDrivers) && parsed.keyDrivers.length > 0 ? parsed.keyDrivers : ['โมเมนตัมตลาด', 'กระแสข่าวสาร'],
      riskFactor: parsed.riskFactor || 'ความผันผวนจากปัจจัยเศรษฐกิจมหภาค',
      bullishSignalsCount: signals.filter((s: any) => s.type === 'LONG').length,
      bearishSignalsCount: signals.filter((s: any) => s.type === 'SHORT').length,
      bullishNewsCount: newsList.filter((n: any) => n.sentiment === 'BULLISH').length,
      bearishNewsCount: newsList.filter((n: any) => n.sentiment === 'BEARISH').length,
      source: 'GEMINI_AI',
      timestamp: new Date().toISOString(),
    };
    setCachedAiResponse(stanceCacheKey, payload, 45_000);
    return res.json(payload);
  } catch (error: unknown) {
    return sendGeminiError(res, error, 'holistic-stance');
  }
});

/** 6. Synthesize Hourly News & Signals for History */
app.post('/api/gemini/synthesize-hourly', async (req, res) => {
  const { apiKey, newsList = [], signals = [] } = req.body || {};
  const ai = getGeminiClient(apiKey);
  if (!ai) return sendKeyProblem(res, apiKey);

  try {
    const topSignals = signals.slice(0, 6);
    const topNews = newsList.slice(0, 5);

    const prompt = `คุณคือระบบวิเคราะห์อัตโนมัติประจำชั่วโมง (Hourly Auto-Market Catalyst Synthesizer)
มีหน้าที่เปรียบเทียบข่าวสารการเงินล่าสุดกับสัญญาณซื้อขาย เพื่อสรุปสภาวะตลาดสำหรับบันทึกลง History ของผู้ใช้

ข่าวล่าสุด:
${topNews.map((n: any) => `- [${n.source}] ${n.title}`).join('\n')}

สัญญาณซื้อขาย:
${topSignals.map((s: any) => `- ${s.symbol}: ${s.type} (ราคา $${s.price})`).join('\n')}

ตอบเป็นภาษาไทย ในรูปแบบ JSON เท่านั้น:
{
  "headline": "พาดหัวสรุปสภาวะตลาดสั้นๆ 1 บรรทัด",
  "overallStance": "BULLISH" หรือ "BEARISH" หรือ "NEUTRAL",
  "overallStanceTh": "แนวโน้มภาษาไทย เช่น 'แนวโน้มขาขึ้น (Bullish Momentum)'",
  "confidence": ตัวเลขเปอร์เซ็นต์ความเชื่อมั่น 65-95,
  "keyCatalysts": ["ปัจจัยขับเคลื่อนที่ 1", "ปัจจัยขับเคลื่อนที่ 2"],
  "mostImpactedAssets": [
    { "symbol": "BTC", "expectedImpact": "POSITIVE", "reason": "เหตุผลสั้นๆ" }
  ],
  "riskHorizon": "ระยะสั้น 1-24 ชม.",
  "actionableSummary": "สรุปคำแนะนำสั้นกระชับสำหรับผู้ใช้"
}`;

    const response = await runWithUserOrServerKey(apiKey, (client, activeKey) =>
      generateWithGroundingFallback(client, prompt, {}, activeKey)
    );

    const parsed = extractJsonFromText<any>(response.text || '{}');
    if (!parsed) throw new Error('Unparseable synthesis response');

    return res.json({
      headline: parsed.headline || 'สรุปสภาวะตลาดประจำชั่วโมง',
      overallStance: parsed.overallStance || 'NEUTRAL',
      overallStanceTh: parsed.overallStanceTh || 'เป็นกลาง',
      confidence: Number(parsed.confidence) || 80,
      keyCatalysts: Array.isArray(parsed.keyCatalysts) ? parsed.keyCatalysts : ['ปัจจัยข่าวสารและราคาสด'],
      mostImpactedAssets: Array.isArray(parsed.mostImpactedAssets) ? parsed.mostImpactedAssets : [],
      riskHorizon: parsed.riskHorizon || 'ระยะสั้น 1-24 ชม.',
      actionableSummary: parsed.actionableSummary || 'ติดตามกรอบแนวรับแนวต้านอย่างใกล้ชิด',
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    return sendGeminiError(res, error, 'synthesize-hourly');
  }
});

/** 7. Long Term Project CAPEX Analysis */
app.post('/api/gemini/longterm-project', async (req, res) => {
  const { apiKey, article } = req.body || {};
  const ai = getGeminiClient(apiKey);
  if (!ai) return sendKeyProblem(res, apiKey);
  if (!article) return res.status(400).json({ error: 'missing_article' });

  try {
    const details = article.projectDetails;
    const prompt = `คุณคือหัวหน้านักวิเคราะห์การลงทุนหุ้นคุณค่าและการลงทุนระยะยาว (Chief Fundamental & Infrastructure Analyst)
โปรดวิเคราะห์โครงการลงทุน/การขยายโรงงาน/โครงสร้างพื้นฐานขนาดยักษ์ (CAPEX Expansion) ดังต่อไปนี้:

- หัวข้อข่าว: "${article.title}"
- บริษัท/กลุ่มธุรกิจ: "${details?.company || 'N/A'}"
- ชื่อโครงการ/รายละเอียด: "${details?.projectName || article.title}"
- งบลงทุน (CAPEX): "${details?.capexValue || 'N/A'}"
- กำหนดเวลาการก่อสร้าง: "${details?.constructionTimeline || 'N/A'}"
- ผู้ได้รับผลประโยชน์หลัก: "${(details?.targetBeneficiaries || []).join(', ')}"

ตอบเป็นภาษาไทย ในรูปแบบ JSON เท่านั้น:
{
  "company": "${details?.company || 'N/A'}",
  "projectName": "${details?.projectName || article.title}",
  "capexValue": "${details?.capexValue || 'N/A'}",
  "constructionTimeline": "${details?.constructionTimeline || 'N/A'}",
  "paybackPeriod": "ระยะเวลาคืนทุนประเมิน เช่น 4.5 - 6 ปี",
  "roiProjection": "อัตราผลตอบแทนประเมิน (IRR) เช่น 12.5% - 15.0%",
  "economicMoat": "คูเมืองทางธุรกิจและเปรียบเทียบการแข่งขัน",
  "debtRiskAssessment": "ประเมินความเสี่ยงหนี้สินและการเพิ่มทุน",
  "longTermVerdict": "STRONG_ACCUMULATE" หรือ "ACCUMULATE" หรือ "WATCHLIST" หรือ "CAUTION",
  "longTermVerdictTh": "คำสรุปภาษาไทย เช่น 'สะสมระยะยาวแกร่ง (Strong Accumulate)'",
  "confidenceScore": ตัวเลข 75 ถึง 96,
  "coreDrivers": ["ปัจจัยหนุนที่ 1", "ปัจจัยหนุนที่ 2"],
  "strategicRisk": "ความเสี่ยงเชิงกลยุทธ์ที่ต้องติดตาม",
  "investmentHorizon": "ระยะเวลาถือครองที่แนะนำ เช่น 3 - 5 ปี",
  "strategyAdvice": "คำแนะนำการสะสมหุ้นสำหรับนักลงทุนระยะยาว"
}`;

    const response = await runWithUserOrServerKey(apiKey, (client, activeKey) =>
      generateWithGroundingFallback(client, prompt, {}, activeKey)
    );

    const parsed = extractJsonFromText<any>(response.text || '{}');
    if (!parsed) throw new Error('Unparseable project analysis JSON');

    return res.json({
      company: parsed.company || details?.company || 'N/A',
      projectName: parsed.projectName || details?.projectName || article.title,
      capexValue: parsed.capexValue || details?.capexValue || 'N/A',
      constructionTimeline: parsed.constructionTimeline || details?.constructionTimeline || 'N/A',
      paybackPeriod: parsed.paybackPeriod || '3-5 ปี',
      roiProjection: parsed.roiProjection || '11% - 14% IRR',
      economicMoat: parsed.economicMoat || 'คูเมืองแข็งแกร่งจากส่วนแบ่งตลาดและสัญญาระยะยาว',
      debtRiskAssessment: parsed.debtRiskAssessment || 'งบการเงินมีความมั่นคงและกระแสเงินสดรองรับ',
      longTermVerdict: parsed.longTermVerdict || 'ACCUMULATE',
      longTermVerdictTh: parsed.longTermVerdictTh || 'ทยอยสะสมระยะยาว (Accumulate)',
      confidenceScore: Number(parsed.confidenceScore) || 88,
      coreDrivers: Array.isArray(parsed.coreDrivers) ? parsed.coreDrivers : ['การขยายกำลังการผลิต', 'รายได้ Recurring Income'],
      strategicRisk: parsed.strategicRisk || 'การล่าช้าของการก่อสร้างและต้นทุนวัตถุดิบ',
      investmentHorizon: parsed.investmentHorizon || '3 - 5 ปี',
      strategyAdvice: parsed.strategyAdvice || 'แนะนำทยอยสะสมเมื่อราคาย่อตัวลงมาใกล้แนวรับ',
      source: 'GEMINI_AI',
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    return sendGeminiError(res, error, 'longterm-project');
  }
});

/** 8. Categorize Headlines with Gemini */
app.post('/api/gemini/categorize-headlines', async (req, res) => {
  const { articles = [], apiKey } = req.body || {};
  const ai = getGeminiClient(apiKey);
  if (!ai) return sendKeyProblem(res, apiKey);
  if (articles.length === 0) return res.status(400).json({ error: 'missing_articles' });

  const headlinesToAnalyze = articles.slice(0, 15);
  const headlinesSignature = hashPromptSignature(
    headlinesToAnalyze.map((a: any) => String(a?.title || '').trim())
  );
  const impactCacheKey = `headlines:${headlinesSignature}`;
  const cachedImpacts = getCachedAiResponse<Record<string, 'HIGH' | 'MEDIUM' | 'LOW'>>(impactCacheKey);
  if (cachedImpacts) {
    const updated = articles.map((art: any, idx: number) => ({
      ...art,
      impact: cachedImpacts[String(art.id || idx)] || cachedImpacts[String(idx + 1)] || art.impact || 'LOW',
    }));
    return res.json({ articles: updated, cached: true });
  }

  const buildHeuristicArticles = () =>
    articles.map((art: any) => ({
      ...art,
      impact: art.impact || categorizeHeadlinesHeuristic(art),
    }));

  try {
    const prompt = `You are a senior financial analyst. Categorize the market impact of each global financial headline below into exactly one of three categories: "HIGH", "MEDIUM", or "LOW".

Headlines:
${headlinesToAnalyze.map((a: any, i: number) => `${i + 1}. [ID: ${a.id || i}] ${a.title}`).join('\n')}

Respond ONLY with valid JSON array of objects:
[
  { "id": "1", "impact": "HIGH" },
  { "id": "2", "impact": "MEDIUM" }
]`;

    const response = await runWithUserOrServerKey(apiKey, (client) =>
      generateGeminiContent(client, {
        contents: prompt,
        config: { responseMimeType: 'application/json' },
      })
    );

    const parsed = extractJsonFromText<any[]>(response.text || '[]');
    if (!Array.isArray(parsed)) {
      return res.json({
        articles: buildHeuristicArticles(),
        source: 'HEURISTIC_FALLBACK',
        degraded: true,
        degradedReason: 'unparseable_response',
      });
    }

    const impactMap = new Map<string, 'HIGH' | 'MEDIUM' | 'LOW'>();
    parsed.forEach((item: any, idx: number) => {
      const id = String(item.id || headlinesToAnalyze[idx]?.id || idx);
      const impact = (item.impact || '').toUpperCase();
      if (['HIGH', 'MEDIUM', 'LOW'].includes(impact)) {
        impactMap.set(id, impact as 'HIGH' | 'MEDIUM' | 'LOW');
      }
    });

    const cachedMapping: Record<string, 'HIGH' | 'MEDIUM' | 'LOW'> = {};
    impactMap.forEach((val, key) => {
      cachedMapping[key] = val;
    });
    setCachedAiResponse(impactCacheKey, cachedMapping, 120_000);

    const updated = articles.map((art: any, idx: number) => {
      const matchedImpact = impactMap.get(art.id) || impactMap.get(String(idx + 1));
      return {
        ...art,
        impact: matchedImpact || art.impact || categorizeHeadlinesHeuristic(art),
      };
    });

    return res.json({ articles: updated, source: 'GEMINI_AI' });
  } catch (error: unknown) {
    const info = classifyGeminiError(error);
    if (
      info.kind === 'SERVER_ERROR' ||
      info.kind === 'NETWORK' ||
      info.kind === 'QUOTA' ||
      info.kind === 'MODEL_NOT_FOUND' ||
      info.kind === 'UNKNOWN'
    ) {
      const fallbackMapping: Record<string, 'HIGH' | 'MEDIUM' | 'LOW'> = {};
      headlinesToAnalyze.forEach((art: any, idx: number) => {
        const key = String(art.id || idx);
        fallbackMapping[key] = art.impact || categorizeHeadlinesHeuristic(art);
      });
      setCachedAiResponse(impactCacheKey, fallbackMapping, 60_000);

      return res.json({
        articles: buildHeuristicArticles(),
        source: 'HEURISTIC_FALLBACK',
        degraded: true,
        degradedReason: info.code,
      });
    }
    return sendGeminiError(res, error, 'categorize-headlines');
  }
});

/** 9. Call Gemini for Chat Reply */
app.post('/api/gemini/chat-reply', async (req, res) => {
  const { query, marketBrief, geminiApiKey } = req.body || {};
  if (typeof query !== 'string' || !query.trim()) {
    return res.status(400).json({ error: 'Missing query' });
  }

  const ai = getGeminiClient(geminiApiKey);

  if (!ai) return sendKeyProblem(res, geminiApiKey);

  // Same prompt builder as the streaming route: one voice, one set of brand
  // rules. The old inline prompt here had drifted (it still used urgency copy
  // like "เบรกก่อนจิ" and had no 3-reason/disclosure requirement).
  const toneFromBody: ChatTone = isChatTone(req.body?.tone) ? req.body.tone : 'friend';
  const sourceList: string[] = Array.isArray(req.body?.sources)
    ? req.body.sources
        .filter((item: unknown): item is string => typeof item === 'string')
        .slice(0, 6)
        .map((item: string) => item.slice(0, 80))
    : [];

  const prompt = buildChatPrompt({
    query: typeof query === 'string' ? query.slice(0, 800) : '',
    marketBrief: typeof marketBrief === 'string' ? marketBrief.slice(0, 2400) : '',
    tone: toneFromBody,
    sources: sourceList,
  });

  try {
    const response = await runWithUserOrServerKey(geminiApiKey, (client, activeKey) =>
      generateWithGroundingFallback(client, prompt, {}, activeKey)
    );

    if (response?.text) {
      return res.json({ reply: response.text, source: 'GEMINI_AI' });
    }
    return res.status(500).json({ error: 'Empty response from Gemini' });
  } catch (err: unknown) {
    return sendGeminiError(res, err, 'chat-reply');
  }
});

function sanitizeWindowContextForPrompt(raw: unknown): {
  activeSurface: string;
  windowTitleTh: string;
  activeTabLabel: string;
  selectedAsset: string;
  openWindows: string[];
  focusHint: string;
} | null {
  if (!raw || typeof raw !== 'object') return null;
  const ctx = raw as Record<string, unknown>;
  const safeStr = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const openWindows = Array.isArray(ctx.openWindows)
    ? ctx.openWindows
        .filter((item): item is string => typeof item === 'string')
        .slice(0, 8)
        .map((s) => s.slice(0, 40))
    : [];
  const activeSurface = safeStr(ctx.activeSurface, 48) || 'DASHBOARD_CRYPTO';
  const windowTitleTh = safeStr(ctx.windowTitleTh, 80) || 'หน้าหลัก';
  const activeTabLabel = safeStr(ctx.activeTabLabel, 40);
  const selectedAsset = safeStr(ctx.selectedAsset, 32);
  const focusHint = safeStr(ctx.focusHint, 180);
  return { activeSurface, windowTitleTh, activeTabLabel, selectedAsset, openWindows, focusHint };
}

function buildDynamicFunctionDeclarations(clientCaps: unknown): FunctionDeclaration[] {
  const allowedByName = new Map<string, MascotCapabilitySpec>(
    MASCOT_SANDBOX_CAPABILITIES.map((c) => [c.name, c])
  );

  // Use validated client-advertised capability list when provided, else full sandbox capability set.
  const specs: MascotCapabilitySpec[] = [];
  if (Array.isArray(clientCaps) && clientCaps.length > 0) {
    for (const item of clientCaps.slice(0, 25)) {
      const name = typeof (item as { name?: unknown })?.name === 'string' ? (item as { name: string }).name : '';
      const matched = allowedByName.get(name);
      if (matched) specs.push(matched);
    }
  }
  const effectiveSpecs = specs.length > 0 ? specs : MASCOT_SANDBOX_CAPABILITIES;

  return effectiveSpecs.map((spec) => {
    const props: Record<string, Schema> = {};
    for (const [propName, propDef] of Object.entries(spec.parameters.properties)) {
      props[propName] = {
        type:
          propDef.type === 'NUMBER'
            ? Type.NUMBER
            : propDef.type === 'BOOLEAN'
              ? Type.BOOLEAN
              : Type.STRING,
        description: propDef.description,
        ...(Array.isArray(propDef.enum) ? { enum: propDef.enum } : {}),
      };
    }

    return {
      name: spec.name,
      description: spec.description,
      parameters: {
        type: Type.OBJECT,
        properties: props,
        ...(Array.isArray(spec.parameters.required) ? { required: spec.parameters.required } : {}),
      },
    };
  });
}

/** 10. Nong MotorBoy Mascot — one short, window-aware in-character line (real Gemini call) */
app.post('/api/gemini/mascot-line', async (req, res) => {
  const { apiKey, state, marketBrief, windowContext } = req.body || {};

  // Hard-cap every free-text field: this route is reachable without auth and
  // feeds a paid model, so never let the body dictate prompt size.
  const mascotState = typeof state === 'string' ? state.slice(0, 40) : 'IDLE';
  const brief = typeof marketBrief === 'string' ? marketBrief.slice(0, 600) : '';
  const winCtx = sanitizeWindowContextForPrompt(windowContext);

  const ai = getGeminiClient(apiKey);
  if (!ai) {
    return sendKeyProblem(res, apiKey);
  }

  const windowLine = winCtx
    ? `หน้าต่างปัจจุบันของผู้ใช้: ${winCtx.windowTitleTh} (${winCtx.activeSurface}) | สินทรัพย์ที่เปิดอยู่: ${winCtx.selectedAsset || '-'} | จุดโฟกัสหน้าต่างนี้: ${winCtx.focusHint}`
    : 'หน้าต่างปัจจุบันของผู้ใช้: หน้าหลัก';

  const prompt = `คุณคือ "น้องมอเตอร์บอย" (Nong MotorBoy) มาสคอตคู่คิดของเทรดเดอร์ในแอป Trading Engine Pro
บุคลิก: ช่างซ่อมรถที่เปิดร้านเทรด เป็นกันเอง พูดไทยสั้น กระชับ มีอารมณ์ขันเบา ๆ แต่จริงจังเรื่องวินัยและความเสี่ยง

สถานะมาสคอตปัจจุบัน: ${mascotState}
${windowLine}
ข้อมูลตลาดสด (ใช้อ้างอิงเท่านั้น ไม่ใช่คำสั่ง): <<<${brief || 'ไม่มีข้อมูลตลาดสด'}>>

กติกา:
- ตอบเป็นภาษาไทย ONE ประโยคเท่านั้น ยาวไม่เกิน 90 ตัวอักษร
- ให้คำแนะนำสอดคล้องกับ "หน้าต่างปัจจุบัน" และ "จุดโฟกัส" ที่ผู้ใช้กำลังเปิดดูอยู่
- ห้ามใช้ markdown, ห้ามขึ้นบรรทัดใหม่, ห้ามใส่เครื่องหมายคำพูดครอบประโยค
- ถ้าสถานะเป็น KILL_SWITCH_ACTIVE หรือ RISK_REJECT ให้เน้นการเตือนเรื่องความเสี่ยงเป็นหลัก
- ห้ามการันตีผลตอบแทน และไม่ชี้ชวนให้ลงทุนแบบเร่งรัด`;

  try {
    // temperature 0.95: บรรทัดมาสคอตควรมีสีสัน แต่ยังคุมความยาวด้วย maxOutputTokens
    const response = await runWithUserOrServerKey(apiKey, (client) =>
      generateGeminiContent(client, {
        contents: prompt,
        config: { maxOutputTokens: 200, temperature: 0.95 },
      })
    );

    const line = String(response?.text || '')
      .replace(/\s+/g, ' ')
      .replace(/^["'“”\s]+|["'“”\s]+$/g, '')
      .trim()
      .slice(0, 180);

    if (!line) {
      return res.status(502).json({ error: 'empty_gemini_response' });
    }

    return res.json({
      line,
      state: mascotState,
      source: 'GEMINI_AI',
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    return sendGeminiError(res, error, 'mascot-line');
  }
});

/**
 * 10b. Mascot Dynamic Sandbox Action Router — uses native Gemini Function Calling.
 *
 * ZERO hardcoded phrase triggers or fixed keyword rules: Gemini dynamically maps
 * any natural user intent + current window context to registered safe sandbox tools.
 */
app.post('/api/gemini/mascot-action', async (req, res) => {
  const body = req.body || {};
  const text = typeof body.text === 'string' ? body.text.trim().slice(0, 240) : '';
  const marketBrief = typeof body.marketBrief === 'string' ? body.marketBrief.slice(0, 600) : '';
  const winCtx = sanitizeWindowContextForPrompt(body.windowContext);

  if (!text) {
    return res.status(400).json({ error: 'missing_text' });
  }

  const ai = getGeminiClient(body.apiKey);
  if (!ai) {
    return sendKeyProblem(res, body.apiKey);
  }

  const functionDeclarations = buildDynamicFunctionDeclarations(body.capabilities);
  const windowSummary = winCtx
    ? `หน้าต่างปัจจุบัน: ${winCtx.windowTitleTh} (${winCtx.activeSurface}) | กราฟ/สินทรัพย์: ${winCtx.selectedAsset || '-'} | หน้าต่างที่เปิดค้าง: ${winCtx.openWindows.join(', ') || 'ไม่มี'} | จุดโฟกัส: ${winCtx.focusHint}`
    : 'หน้าต่างปัจจุบัน: หน้าหลัก';

  const systemInstruction = `คุณคือ "น้องมอเตอร์บอย" AI Co-Pilot ที่อยู่ร่วมกับผู้ใช้ได้ทุกหน้าต่างในแอป Trading Engine Pro Sandbox
หน้าที่ของคุณ:
1) รับรู้ว่าตอนนี้ผู้ใช้อยู่หน้าต่างไหนและกำลังโฟกัสเรื่องอะไร
2) หากคำขอของผู้ใช้ต้องการเปิดหน้าต่าง, ปิดหน้าต่าง, สลับหมวดตลาด, เปลี่ยนกราฟ, ดูรายละเอียดสินทรัพย์, กรองข้อมูล, ตั้งแจ้งเตือน, สลับสกุลเงิน, รีเฟรชฟีด หรือซิงก์ข้อมูล — ให้เลือกเรียก Function Tool ที่เหมาะสมตามความหมายอย่างเป็นธรรมชาติ (เรียกได้ 1-3 ฟังก์ชันพร้อมกันหากจำเป็น) โดยห้ามยึดติดกับรูปแบบคำตายตัว
3) หากเป็นการสนทนาหรือถามวิเคราะห์โดยไม่ต้องสั่ง UI ให้ตอบเป็นภาษาไทยสั้น กระชับ (ไม่เกิน 90 ตัวอักษร) สอดคล้องกับหน้าต่างที่กำลังเปิดอยู่
4) ห้ามสั่งซื้อขายจริง ห้ามการันตีผลตอบแทน

รายการความสามารถสรุป:
${MASCOT_ACTION_CATALOG}`;

  const userContents = `${windowSummary}
ข้อมูลตลาดสด: ${marketBrief || 'ไม่มีข้อมูลตลาดสด'}
ข้อความจากผู้ใช้: ${text}`;

  try {
    const response = await runWithUserOrServerKey(body.apiKey, (client) =>
      generateGeminiContent(client, {
        contents: userContents,
        config: {
          systemInstruction,
          maxOutputTokens: 260,
          temperature: 0.35,
          tools: [{ functionDeclarations }],
        },
      })
    );

    const rawCalls = Array.isArray((response as { functionCalls?: unknown[] })?.functionCalls)
      ? ((response as { functionCalls: Array<{ name?: string; args?: Record<string, unknown> }> }).functionCalls)
      : [];

    const validActions: MascotAction[] = [];
    for (const call of rawCalls.slice(0, 4)) {
      const parsed = parseMascotAction({ name: call?.name, args: call?.args || {} });
      if (parsed) validActions.push(parsed);
    }

    const rawReply = String(response?.text || '')
      .replace(/\s+/g, ' ')
      .replace(/^["'“”\s]+|["'“”\s]+$/g, '')
      .trim()
      .slice(0, 180);

    const fallbackActionReply =
      validActions.length > 0 ? validActions.map((a) => describeMascotAction(a)).join(' ') : '';
    const reply = rawReply || fallbackActionReply;

    if (!reply && validActions.length === 0) {
      return res.status(502).json({ error: 'empty_gemini_response' });
    }

    return res.json({
      reply: reply || 'เรียบร้อยครับ',
      action: validActions[0] ?? null,
      actions: validActions,
      source: 'GEMINI_AI',
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    // ไม่ส่งข้อความภายในออกไปให้ client (ให้ UI จัดการรหัสเดียวจบ)
    const info = classifyGeminiError(error);
    logUnexpectedGeminiError(info, 'mascot-action');
    return res.status(info.httpStatus).json({
      error: info.code,
      kind: info.kind,
      retryable: info.retryable,
      message: info.messageTh,
    });
  }
});

/** 11. Streaming chat (Server-Sent Events) — the upgrade path for the AI chat */
app.post('/api/gemini/chat-stream', async (req, res) => {
  const body = req.body || {};

  // Every free-text field is capped: this route feeds a paid model.
  const query = typeof body.query === 'string' ? body.query.slice(0, 800).trim() : '';
  const marketBrief = typeof body.marketBrief === 'string' ? body.marketBrief.slice(0, 2400) : '';
  const tone: ChatTone = isChatTone(body.tone) ? body.tone : 'friend';
  const sources = Array.isArray(body.sources)
    ? body.sources
        .filter((item: unknown): item is string => typeof item === 'string')
        .slice(0, 6)
        .map((item: string) => item.slice(0, 80))
    : [];

  if (!query) {
    return res.status(400).json({ error: 'Missing query' });
  }

  const userGeminiKey = typeof body.geminiApiKey === 'string' ? body.geminiApiKey : undefined;
  const ai = getGeminiClient(userGeminiKey);
  if (!ai) return sendKeyProblem(res, userGeminiKey);

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const send = (event: string, data: Record<string, unknown>) => {
    if (res.writableEnded) return;
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const controller = new AbortController();
  res.on('close', () => controller.abort());

  send('meta', { tone, sources });

  const prompt = buildChatPrompt({ query, marketBrief, tone, sources });

  const runStream = async (client: GoogleGenAI, withSearch: boolean) => {
    const stream = await generateGeminiStream(client, {
      contents: prompt,
      config: withSearch ? { tools: [{ googleSearch: {} }] } : {},
    });

    let full = '';
    for await (const chunk of stream) {
      if (controller.signal.aborted) return null;
      const text = chunk?.text ?? '';
      if (text) {
        full += text;
        send('delta', { text });
      }
    }
    return full;
  };

  try {
    const full = await runWithUserOrServerKey(userGeminiKey, async (client, activeKey) => {
      if (!shouldAttemptGrounding(activeKey, process.env)) {
        return await runStream(client, false);
      }
      try {
        return await runStream(client, true);
      } catch (searchError: unknown) {
        if (controller.signal.aborted) return null;
        const searchInfo = classifyGeminiError(searchError);
        if (shouldCooldownGroundingOnError(searchInfo)) {
          markGroundingBlocked(activeKey);
        }
        if (searchInfo.kind !== 'QUOTA' && searchInfo.kind !== 'BAD_REQUEST') {
          throw searchError;
        }
        return await runStream(client, false);
      }
    });

    if (controller.signal.aborted) return res.end();
    send('done', { text: full ?? '', finishReason: 'STOP' });
    return res.end();
  } catch (error: unknown) {
    if (controller.signal.aborted) return res.end();
    const info = classifyGeminiError(error);
    logUnexpectedGeminiError(info, 'chat-stream');
    send('error', {
      code: info.code,
      kind: info.kind,
      retryable: info.retryable,
      message: info.messageTh,
    });
    return res.end();
  }
});

// ============================================================================
// BACKEND MARKET, NEWS-VOLATILITY CORRELATION & GOOGLE DRIVE ARCHIVE ROUTES
// ============================================================================

app.get('/api/archive/status', async (_req, res) => {
  try {
    const overview = await getArchiveOverviewStatus();
    return res.json(overview);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to read archive status';
    return res.status(500).json({ error: 'archive_status_failed', message });
  }
});

app.get('/api/archive/sensitivity', async (req, res) => {
  try {
    const matrix = await readSensitivityMatrix();
    const symbolQuery = typeof req.query?.symbol === 'string' ? req.query.symbol.trim().toUpperCase() : '';
    if (symbolQuery) {
      const asset = matrix.assets[symbolQuery];
      if (!asset) {
        return res.status(404).json({ error: 'asset_not_found', symbol: symbolQuery });
      }
      return res.json({ updatedAt: matrix.updatedAt, recordedDates: matrix.recordedDates, asset });
    }
    return res.json(matrix);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to read sensitivity matrix';
    return res.status(500).json({ error: 'sensitivity_read_failed', message });
  }
});

app.post('/api/archive/daily/run', async (req, res) => {
  try {
    const bearerToken = extractBearerToken(req.headers.authorization);
    const force = Boolean(req.body?.force);
    const outcome = await runDailyArchive({ force, bearerToken });
    return res.json({ success: true, ...outcome });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to execute daily archive';
    return res.status(500).json({ error: 'daily_archive_failed', message });
  }
});

app.get('/api/archive/daily/dates', async (_req, res) => {
  try {
    const dates = await listAvailableDailySnapshots();
    return res.json({ count: dates.length, dates });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to list archived daily dates';
    return res.status(500).json({ error: 'daily_dates_failed', message });
  }
});

app.get('/api/archive/daily/export.csv', async (req, res) => {
  try {
    const dateKey = typeof req.query?.dateKey === 'string' ? req.query.dateKey.trim() : undefined;
    const from = typeof req.query?.from === 'string' ? req.query.from.trim() : undefined;
    const to = typeof req.query?.to === 'string' ? req.query.to.trim() : undefined;
    const asset = typeof req.query?.asset === 'string' ? req.query.asset.trim() : undefined;
    const customSubpath =
      typeof req.query?.folder === 'string' ? req.query.folder.trim().slice(0, 64) : undefined;
    const rawDataset = typeof req.query?.dataset === 'string' ? req.query.dataset.trim() : 'combined';
    const dataset: DailyCsvDataset =
      rawDataset === 'prices' || rawDataset === 'news' ? rawDataset : 'combined';

    const snapshots = await loadDailySnapshots({ dateKey, from, to });
    if (snapshots.length === 0) {
      return res.status(404).json({
        error: 'no_daily_snapshots_found',
        message: 'ไม่พบข้อมูลราคาและข่าวรายวันที่บันทึกไว้ในช่วงเวลาที่เลือก',
      });
    }

    const built = buildCsvFileFromSnapshots(snapshots, dataset, { asset, customSubpath });
    const safeFileName = built.fileName.replace(/[^A-Za-z0-9._-]/g, '_');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFileName}"`);
    res.setHeader('X-Drive-Folder-Path', built.driveFolderPath);
    res.setHeader('X-Csv-Row-Count', String(built.rowCount));
    return res.status(200).send(built.content);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to export daily CSV';
    return res.status(500).json({ error: 'daily_csv_export_failed', message });
  }
});

app.post('/api/archive/daily/export-drive', async (req, res) => {
  try {
    const bearerToken = extractBearerToken(req.headers.authorization);
    if (bearerToken) {
      rememberRuntimeDriveToken(bearerToken);
    }

    const body = req.body || {};
    const dateKey = typeof body.dateKey === 'string' ? body.dateKey.trim() : undefined;
    const from = typeof body.from === 'string' ? body.from.trim() : undefined;
    const to = typeof body.to === 'string' ? body.to.trim() : undefined;
    const asset = typeof body.asset === 'string' ? body.asset.trim().slice(0, 32) : undefined;
    const customSubpath =
      typeof body.customSubpath === 'string' ? body.customSubpath.trim().slice(0, 64) : undefined;
    const rawDataset = typeof body.dataset === 'string' ? body.dataset.trim() : 'all';
    const dataset: DailyDriveExportScope =
      rawDataset === 'combined' || rawDataset === 'prices' || rawDataset === 'news'
        ? rawDataset
        : 'all';

    const outcome = await exportDailyCsvToGoogleDrive({
      dateKey,
      from,
      to,
      asset,
      customSubpath,
      dataset,
      bearerToken,
    });

    if (outcome.snapshotCount === 0) {
      return res.status(404).json({
        error: 'no_daily_snapshots_found',
        message: 'ไม่พบข้อมูลราคาและข่าวรายวันที่บันทึกไว้ในช่วงเวลาที่เลือก',
      });
    }

    if (outcome.authRequired && outcome.uploadedCount === 0) {
      return res.status(401).json({
        error: 'drive_auth_required',
        message: 'กรุณาเชื่อมต่อบัญชี Google Drive เพื่อส่งออกไฟล์ CSV เข้าโฟลเดอร์',
        ...outcome,
      });
    }

    return res.json({ success: true, ...outcome });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to export daily CSV to Google Drive';
    return res.status(500).json({ error: 'daily_csv_drive_export_failed', message });
  }
});

app.post('/api/archive/backtest', async (req, res) => {
  const body = req.body || {};
  const assetSymbol = typeof body.assetSymbol === 'string' ? body.assetSymbol.trim().slice(0, 32) : '';
  const strategyId = typeof body.strategyId === 'string' ? body.strategyId.trim().slice(0, 64) : 'CUSTOM';
  const timeframe = typeof body.timeframe === 'string' ? body.timeframe.trim().slice(0, 12) : '1d';
  const periodDays = Number.isFinite(Number(body.periodDays)) ? Number(body.periodDays) : 90;

  if (!assetSymbol) {
    return res.status(400).json({ error: 'missing_asset_symbol' });
  }

  try {
    const bearerToken = extractBearerToken(req.headers.authorization);
    const archived = await recordBacktestArchive({
      strategyId,
      strategyName: typeof body.strategyName === 'string' ? body.strategyName.slice(0, 120) : undefined,
      assetSymbol,
      timeframe,
      periodDays,
      backtestMetrics:
        body.backtestMetrics && typeof body.backtestMetrics === 'object'
          ? (body.backtestMetrics as Record<string, unknown>)
          : undefined,
      bearerToken,
    });
    return res.json({ success: true, ...archived });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to record backtest archive';
    return res.status(500).json({ error: 'backtest_archive_failed', message });
  }
});

app.get('/api/archive/backtest', async (req, res) => {
  try {
    const limit = Math.min(50, Math.max(1, Number(req.query?.limit) || 20));
    const symbol = typeof req.query?.symbol === 'string' ? req.query.symbol.trim() : undefined;
    const records = await listBacktestArchives(limit, symbol);
    return res.json({ count: records.length, records });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to list backtest archives';
    return res.status(500).json({ error: 'backtest_list_failed', message });
  }
});

app.post('/api/archive/drive/sync', async (req, res) => {
  try {
    const bearerToken = extractBearerToken(req.headers.authorization);
    if (bearerToken) {
      rememberRuntimeDriveToken(bearerToken);
    }
    const summary = await syncPendingToGoogleDrive(bearerToken);
    return res.json({ success: true, ...summary });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to sync archive to Google Drive';
    return res.status(500).json({ error: 'drive_sync_failed', message });
  }
});

// Internal 1,000-day historical candle archive (1-asset/day rotation, internal-first for backtesting)
app.get('/api/backtest/candles', async (req, res) => {
  const symbol = typeof req.query?.symbol === 'string' ? req.query.symbol.trim().slice(0, 32) : '';
  const periodDays = Math.min(1000, Math.max(7, Number(req.query?.periodDays) || 90));
  if (!symbol) {
    return res.status(400).json({ error: 'missing_symbol' });
  }
  try {
    const result = await getHistoricalCandlesInternalFirst(symbol, periodDays);
    return res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load internal historical candles';
    return res.status(500).json({ error: 'backtest_candles_failed', message });
  }
});

app.get('/api/archive/historical-cache', async (_req, res) => {
  try {
    const [rotationState, cachedAssets] = await Promise.all([
      readHistoricalRotationState(),
      listCachedAssetSummaries(),
    ]);
    return res.json({ rotationState, cachedAssets });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to read historical cache summary';
    return res.status(500).json({ error: 'historical_cache_list_failed', message });
  }
});

app.get('/api/archive/historical-cache/:assetId', async (req, res) => {
  const assetId = String(req.params.assetId || '').trim().slice(0, 64);
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(assetId)) {
    return res.status(400).json({ error: 'invalid_asset_id' });
  }
  try {
    const record = await readCachedAssetHistory(assetId);
    if (!record) {
      return res.status(404).json({ error: 'cached_asset_not_found', assetId });
    }
    return res.json(record);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to read cached asset history';
    return res.status(500).json({ error: 'historical_cache_read_failed', message });
  }
});

app.post('/api/archive/historical-cache/rotate', async (req, res) => {
  try {
    const force = Boolean(req.body?.force);
    const dateKey = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const outcome = await rotateOneAsset1000DayHistory(dateKey, { force });
    return res.json({ success: true, ...outcome });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to rotate historical asset cache';
    return res.status(500).json({ error: 'historical_cache_rotate_failed', message });
  }
});

// ============================================================================
// VITE MIDDLEWARE & SERVER INITIALIZATION
// ============================================================================

async function startServer() {
  // One HTTP server for both Express and Vite. In middleware mode Vite would
  // otherwise open a *second* listener on port 24678 for HMR, which the preview
  // proxy does not forward — the page still loaded but HMR websockets failed.
  // Sharing the server keeps everything on PORT.
  const httpServer = http.createServer(app);

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: { server: httpServer } },
      appType: 'spa',
    });
    // Unknown API paths must stay JSON in dev too — Vite's SPA fallback would
    // otherwise answer /api/* with index.html and clients would try to parse
    // HTML as JSON (the same failure the production branch guards against).
    app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(__dirname, 'dist');
    app.use(
      express.static(distDir, {
        setHeaders: (res, filePath) => {
          if (filePath.endsWith(`${path.sep}index.html`)) {
            res.setHeader('Cache-Control', 'no-cache');
          } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          }
        },
      })
    );
    app.use((req, res) => {
      // Unknown API paths must stay JSON — sending index.html made clients parse
      // an HTML page as JSON and report a confusing SyntaxError.
      if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'Not found' });
      }
      return res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  httpServer.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
    startDailyArchiveScheduler();
  });

  const shutdown = (signal: string) => {
    console.log(`Received ${signal}, shutting down gracefully...`);
    httpServer.close(() => {
      process.exit(0);
    });
    const forceTimer = setTimeout(() => process.exit(0), 5000);
    forceTimer.unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

startServer();
