/**
 * Web-Standard Cloudflare Edge API Handler (shared by Workers & Pages Functions).
 *
 * Uses only standard Web APIs (`fetch`, `Request`, `Response`, `ReadableStream`)
 * so the edge bundle stays tiny (<40 KB) and runs on Cloudflare Free Tier
 * without Node.js server dependencies (`express`, `fs`, `@google/genai` SDK).
 */

import { buildChatPrompt, isChatTone, type ChatTone } from '../services/chatStreamCore';
import {
  buildModelChain,
  classifyGeminiError,
  resolveGeminiKey,
  resolveGeminiModel,
  shouldTryFallbackModel,
} from '../server/geminiConfig';
import {
  MASCOT_ACTION_CATALOG,
  MASCOT_SANDBOX_CAPABILITIES,
  describeMascotAction,
  parseMascotAction,
  type MascotAction,
  type MascotCapabilitySpec,
} from '../mascot/actions';
import { categorizeHeadlinesHeuristic } from '../services/headlineCategorizationService';

export interface CloudflareEnv {
  GEMINI_API_KEY?: string;
  ASSETS?: {
    fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  };
  [key: string]: unknown;
}

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const YAHOO_HOSTS = [
  'https://query1.finance.yahoo.com',
  'https://query2.finance.yahoo.com',
] as const;

const GROUNDING_COOLDOWN_MS = 15 * 60 * 1000;
const groundingCooldownByKeyTag = new Map<string, number>();

function jsonResponse(data: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...extraHeaders,
    },
  });
}

function keyTag(key: string): string {
  const trimmed = key.trim();
  if (!trimmed) return 'anon';
  return `${trimmed.slice(0, 6)}:${trimmed.length}:${trimmed.slice(-4)}`;
}

function shouldAttemptGroundingEdge(key: string): boolean {
  const tag = keyTag(key);
  const blockedUntil = groundingCooldownByKeyTag.get(tag) || 0;
  if (blockedUntil > Date.now()) return false;
  if (blockedUntil > 0) groundingCooldownByKeyTag.delete(tag);
  return true;
}

function markGroundingBlockedEdge(key: string): void {
  groundingCooldownByKeyTag.set(keyTag(key), Date.now() + GROUNDING_COOLDOWN_MS);
}

function sanitizeYahooPath(pathnameAndSearch: string): string | null {
  const trimmed = pathnameAndSearch.trim();
  if (!trimmed.startsWith('/')) return null;
  if (trimmed.startsWith('//') || trimmed.includes('..') || trimmed.includes('@')) return null;
  const pathname = trimmed.split('?')[0];
  const allowed =
    /^\/v8\/finance\/chart\/[A-Za-z0-9._^=%-]+$/.test(pathname) ||
    pathname === '/v1/finance/search';
  return allowed ? trimmed : null;
}

function sanitizeGenerationConfig(model: string, rawConfig?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!rawConfig) return undefined;
  if (!model.startsWith('gemini-4-')) return rawConfig;
  const { temperature: _t, topP: _p, topK: _k, candidateCount: _c, ...rest } = rawConfig;
  return rest;
}

function extractGeminiRestError(status: number, bodyText: string): Error & { status: number } {
  let msg = bodyText;
  try {
    const parsed = JSON.parse(bodyText) as { error?: { message?: string; status?: string } };
    if (parsed?.error?.message) {
      msg = parsed.error.status ? `${parsed.error.status}: ${parsed.error.message}` : parsed.error.message;
    }
  } catch {
    // keep raw text
  }
  const err = new Error(msg || `HTTP ${status}`) as Error & { status: number };
  err.status = status;
  return err;
}

interface GeminiRestResult {
  text: string;
  functionCalls: Array<{ name?: string; args?: Record<string, unknown> }>;
}

function parseGeminiRestPayload(payload: any): GeminiRestResult {
  const parts = Array.isArray(payload?.candidates?.[0]?.content?.parts)
    ? payload.candidates[0].content.parts
    : [];
  const textParts: string[] = [];
  const functionCalls: Array<{ name?: string; args?: Record<string, unknown> }> = [];
  for (const part of parts) {
    if (typeof part?.text === 'string') textParts.push(part.text);
    if (part?.functionCall && typeof part.functionCall === 'object') {
      functionCalls.push({
        name: typeof part.functionCall.name === 'string' ? part.functionCall.name : undefined,
        args:
          part.functionCall.args && typeof part.functionCall.args === 'object'
            ? (part.functionCall.args as Record<string, unknown>)
            : {},
      });
    }
  }
  return { text: textParts.join(''), functionCalls };
}

async function callGeminiGenerateContent(
  apiKey: string,
  chain: readonly string[],
  options: {
    contents: string;
    systemInstruction?: string;
    generationConfig?: Record<string, unknown>;
    tools?: unknown[];
  }
): Promise<GeminiRestResult> {
  let lastErr: unknown;
  for (let i = 0; i < chain.length; i += 1) {
    const model = chain[i];
    const body: Record<string, unknown> = {
      contents: [{ role: 'user', parts: [{ text: options.contents }] }],
    };
    if (options.systemInstruction) {
      body.systemInstruction = { parts: [{ text: options.systemInstruction }] };
    }
    const cleanGenCfg = sanitizeGenerationConfig(model, options.generationConfig);
    if (cleanGenCfg && Object.keys(cleanGenCfg).length > 0) {
      body.generationConfig = cleanGenCfg;
    }
    if (options.tools && options.tools.length > 0) {
      body.tools = options.tools;
    }

    try {
      const res = await fetch(`${GEMINI_API_BASE}/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw extractGeminiRestError(res.status, errText);
      }
      const json = await res.json();
      return parseGeminiRestPayload(json);
    } catch (err) {
      lastErr = err;
      const info = classifyGeminiError(err);
      const hasNext = i + 1 < chain.length;
      if (!shouldTryFallbackModel(info) || !hasNext) {
        throw err;
      }
    }
  }
  throw lastErr;
}

async function runWithUserOrServerKeyEdge<T>(
  userKey: string | undefined,
  env: CloudflareEnv,
  task: (activeKey: string) => Promise<T>
): Promise<T> {
  const envMap: Record<string, string | undefined> = {
    GEMINI_API_KEY: env.GEMINI_API_KEY,
  };
  const primary = resolveGeminiKey(userKey, envMap);
  if (primary.source === 'none') {
    throw new Error('MISSING_KEY');
  }

  try {
    return await task(primary.key);
  } catch (err) {
    const info = classifyGeminiError(err);
    if (
      primary.source === 'user' &&
      (info.kind === 'INVALID_KEY' || info.kind === 'PERMISSION_DENIED')
    ) {
      const serverFallback = resolveGeminiKey(undefined, envMap);
      if (serverFallback.source === 'server' && serverFallback.key !== primary.key) {
        return await task(serverFallback.key);
      }
    }
    throw err;
  }
}

async function generateWithGroundingFallbackEdge(
  apiKey: string,
  chain: readonly string[],
  contents: string,
  generationConfig?: Record<string, unknown>
): Promise<GeminiRestResult> {
  if (!shouldAttemptGroundingEdge(apiKey)) {
    return await callGeminiGenerateContent(apiKey, chain, { contents, generationConfig });
  }

  try {
    return await callGeminiGenerateContent(apiKey, chain, {
      contents,
      generationConfig,
      tools: [{ googleSearch: {} }],
    });
  } catch (searchError) {
    const info = classifyGeminiError(searchError);
    if (info.kind === 'QUOTA' || info.kind === 'BAD_REQUEST' || info.kind === 'PERMISSION_DENIED') {
      markGroundingBlockedEdge(apiKey);
    }
    if (info.kind === 'QUOTA' || info.kind === 'BAD_REQUEST') {
      return await callGeminiGenerateContent(apiKey, chain, { contents, generationConfig });
    }
    throw searchError;
  }
}

function extractJsonFromText<T = Record<string, unknown>>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    // continue
  }
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch?.[1]) {
    try {
      return JSON.parse(codeBlockMatch[1].trim()) as T;
    } catch {
      // continue
    }
  }
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(text.slice(firstBrace, lastBrace + 1)) as T;
    } catch {
      // continue
    }
  }
  const firstBracket = text.indexOf('[');
  const lastBracket = text.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    try {
      return JSON.parse(text.slice(firstBracket, lastBracket + 1)) as T;
    } catch {
      // continue
    }
  }
  return null;
}

function sendKeyProblemEdge(userKey?: string, env: CloudflareEnv = {}): Response {
  const resolved = resolveGeminiKey(userKey, {
    GEMINI_API_KEY: env.GEMINI_API_KEY,
  });
  const empty = !userKey || !String(userKey).trim();
  return jsonResponse(
    {
      error: empty ? 'missing_gemini_key' : 'invalid_key_format',
      kind: empty ? 'MISSING_KEY' : 'INVALID_KEY',
      retryable: false,
      message: empty
        ? 'ยังไม่ได้ตั้งค่า Gemini API Key — ไปที่ การตั้งค่า (⚙️) เพื่อใส่คีย์'
        : resolved.check.hint,
    },
    400
  );
}

function sendGeminiErrorEdge(error: unknown): Response {
  const info = classifyGeminiError(error);
  return jsonResponse(
    {
      error: info.code,
      message: info.messageTh,
      kind: info.kind,
      retryable: info.retryable,
    },
    info.httpStatus
  );
}

async function readJsonBody(request: Request): Promise<Record<string, any>> {
  try {
    const raw = await request.text();
    if (!raw || raw.length > 1_048_576) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, any>) : {};
  } catch {
    return {};
  }
}

function buildRestFunctionDeclarations(clientCaps: unknown): unknown[] {
  const allowedByName = new Map<string, MascotCapabilitySpec>(
    MASCOT_SANDBOX_CAPABILITIES.map((c) => [c.name, c])
  );
  const specs: MascotCapabilitySpec[] = [];
  if (Array.isArray(clientCaps)) {
    for (const item of clientCaps.slice(0, 25)) {
      const name = typeof (item as { name?: unknown })?.name === 'string' ? (item as { name: string }).name : '';
      const matched = allowedByName.get(name);
      if (matched) specs.push(matched);
    }
  }
  const effectiveSpecs = specs.length > 0 ? specs : MASCOT_SANDBOX_CAPABILITIES;
  return effectiveSpecs.map((spec) => {
    const properties: Record<string, unknown> = {};
    for (const [propName, propDef] of Object.entries(spec.parameters.properties)) {
      properties[propName] = {
        type: propDef.type,
        description: propDef.description,
        ...(Array.isArray(propDef.enum) ? { enum: propDef.enum } : {}),
      };
    }
    return {
      name: spec.name,
      description: spec.description,
      parameters: {
        type: 'OBJECT',
        properties,
        ...(Array.isArray(spec.parameters.required) ? { required: spec.parameters.required } : {}),
      },
    };
  });
}

async function handleYahooEdge(pathnameAndSearch: string): Promise<Response> {
  const safePath = sanitizeYahooPath(pathnameAndSearch);
  if (!safePath) {
    return jsonResponse({ error: 'invalid_yahoo_path' }, 400);
  }

  let lastStatus = 502;
  for (const host of YAHOO_HOSTS) {
    try {
      const upstream = await fetch(`${host}${safePath}`, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          Accept: 'application/json, text/plain, */*',
        },
        cf: { cacheTtl: 30, cacheEverything: true } as any,
      } as RequestInit);
      lastStatus = upstream.status;
      if (!upstream.ok) continue;
      const body = await upstream.text();
      return new Response(body, {
        status: upstream.status,
        headers: {
          'Content-Type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
          'Cache-Control': 'public, max-age=30',
        },
      });
    } catch {
      // failover
    }
  }

  return jsonResponse(
    {
      error: 'yahoo_upstream_unavailable',
      message: 'ไม่สามารถดึงข้อมูลราคาจาก Yahoo Finance ได้ในขณะนี้',
    },
    lastStatus >= 500 ? lastStatus : 502
  );
}

async function fetchEdgeBacktestCandles(symbolRaw: string, periodDays: number) {
  const sym = symbolRaw.trim().toUpperCase().replace(/\/USDT$/, '');
  const limit = Math.min(1000, Math.max(20, periodDays + 20));
  const cryptoBases = new Set(['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'SHIB', 'ADA', 'DOGE', 'AVAX', 'DOT', 'LINK', 'MATIC', 'ARB', 'OP']);

  if (cryptoBases.has(sym) || symbolRaw.toUpperCase().includes('USDT')) {
    const pair = `${sym.replace(/[^A-Z0-9]/g, '')}USDT`;
    for (const baseUrl of ['https://api.binance.com', 'https://data-api.binance.vision']) {
      try {
        const res = await fetch(`${baseUrl}/api/v3/klines?symbol=${pair}&interval=1d&limit=${limit}`);
        if (!res.ok) continue;
        const rows = (await res.json()) as unknown[][];
        if (!Array.isArray(rows) || rows.length === 0) continue;
        const candles = rows.map((r) => {
          const ts = Number(r[0]);
          return {
            date: new Date(ts).toISOString().slice(0, 10),
            timestamp: ts,
            open: Number(r[1]),
            high: Number(r[2]),
            low: Number(r[3]),
            close: Number(r[4]),
            volume: Number(r[5]),
          };
        });
        return {
          candles,
          source: 'BINANCE_SPOT_DAILY',
          usedInternalCache: false,
          externalFetchPerformed: true,
          totalCachedCandles: candles.length,
        };
      } catch {
        // try mirror
      }
    }
  }

  const yahooMap: Record<string, string> = {
    'EUR/USD': 'EURUSD=X',
    'USD/JPY': 'JPY=X',
    'GBP/USD': 'GBPUSD=X',
    'USD/THB': 'THB=X',
    'AUD/USD': 'AUDUSD=X',
    'USD/CHF': 'CHF=X',
    GOLD: 'GC=F',
    SET: '^SET.BK',
    NASDAQ: '^IXIC',
    'S&P500': '^GSPC',
    DJI: '^DJI',
    AOT: 'AOT.BK',
    CPALL: 'CPALL.BK',
    PTT: 'PTT.BK',
    DELTA: 'DELTA.BK',
    KBANK: 'KBANK.BK',
    GULF: 'GULF.BK',
    SCC: 'SCC.BK',
  };
  const ySym = yahooMap[sym] || sym;
  const range = periodDays > 365 ? '5y' : periodDays > 180 ? '2y' : '1y';
  for (const host of YAHOO_HOSTS) {
    try {
      const res = await fetch(`${host}/v8/finance/chart/${encodeURIComponent(ySym)}?interval=1d&range=${range}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      if (!res.ok) continue;
      const json = (await res.json()) as any;
      const r0 = json?.chart?.result?.[0];
      const ts: number[] = Array.isArray(r0?.timestamp) ? r0.timestamp : [];
      const q = r0?.indicators?.quote?.[0];
      if (!q || ts.length === 0) continue;
      const candles = [];
      for (let i = 0; i < ts.length; i += 1) {
        const c = Number(q.close?.[i]);
        if (!Number.isFinite(c) || c <= 0) continue;
        const tMs = ts[i] * 1000;
        candles.push({
          date: new Date(tMs).toISOString().slice(0, 10),
          timestamp: tMs,
          open: Number(q.open?.[i]) || c,
          high: Number(q.high?.[i]) || c,
          low: Number(q.low?.[i]) || c,
          close: c,
          volume: Number(q.volume?.[i]) || 0,
        });
      }
      if (candles.length > 0) {
        return {
          candles: candles.slice(-limit),
          source: 'YAHOO_FINANCE_DAILY',
          usedInternalCache: false,
          externalFetchPerformed: true,
          totalCachedCandles: candles.length,
        };
      }
    } catch {
      // failover
    }
  }

  return {
    candles: [],
    source: 'SYNTHETIC_FALLBACK',
    usedInternalCache: false,
    externalFetchPerformed: false,
    totalCachedCandles: 0,
  };
}

export async function handleCloudflareApiRequest(
  request: Request,
  env: CloudflareEnv = {}
): Promise<Response> {
  const url = new URL(request.url);
  const { pathname, search } = url;

  if (pathname === '/api/health') {
    return jsonResponse(
      {
        status: 'ok',
        service: 'motorboy-ai-th',
        mode: 'production',
        runtime: 'cloudflare',
        timestamp: new Date().toISOString(),
      },
      200,
      { 'Cache-Control': 'no-store' }
    );
  }

  if (pathname.startsWith('/api/yahoo/')) {
    if (request.method !== 'GET') return jsonResponse({ error: 'method_not_allowed' }, 405);
    return handleYahooEdge(`${pathname.slice('/api/yahoo'.length)}${search}`);
  }

  const primaryModel = resolveGeminiModel();
  const modelChain = buildModelChain(primaryModel);
  const envKeys = {
    GEMINI_API_KEY: env.GEMINI_API_KEY,
  };

  if (pathname === '/api/gemini/config' && request.method === 'GET') {
    const serverKey = resolveGeminiKey(undefined, envKeys);
    return jsonResponse({
      model: primaryModel,
      fallbackModels: modelChain.slice(1),
      serverKeyConfigured: serverKey.source === 'server',
      groundingEnabled: true,
      runtime: 'cloudflare',
    });
  }

  if (pathname === '/api/gemini/test-key' && request.method === 'POST') {
    const body = await readJsonBody(request);
    const { apiKey, userEmail } = body;
    const resolved = resolveGeminiKey(apiKey, envKeys);
    if (resolved.source === 'none') {
      const empty = !apiKey || !String(apiKey).trim();
      return jsonResponse(
        {
          success: false,
          error: empty ? 'missing_gemini_key' : 'invalid_key_format',
          text: empty
            ? 'กรุณากรอก Gemini API Key ก่อนทำการทดสอบ'
            : resolved.check.hint || 'รูปแบบ API Key ไม่ถูกต้อง',
        },
        400
      );
    }

    const prompt = 'ตอบสั้นๆ 1 บรรทัดภาษาไทย: ยืนยันสถานะการเชื่อมต่อ AI สำหรับระบบวิเคราะห์ตลาด';
    try {
      let searchGrounded = shouldAttemptGroundingEdge(resolved.key);
      let result: GeminiRestResult;
      if (searchGrounded) {
        try {
          result = await callGeminiGenerateContent(resolved.key, modelChain, {
            contents: prompt,
            generationConfig: { temperature: 0.2 },
            tools: [{ googleSearch: {} }],
          });
        } catch (err) {
          const info = classifyGeminiError(err);
          if (info.kind === 'QUOTA' || info.kind === 'BAD_REQUEST' || info.kind === 'PERMISSION_DENIED') {
            markGroundingBlockedEdge(resolved.key);
          }
          if (info.kind !== 'QUOTA' && info.kind !== 'BAD_REQUEST') throw err;
          searchGrounded = false;
          result = await callGeminiGenerateContent(resolved.key, modelChain, {
            contents: prompt,
            generationConfig: { temperature: 0.2 },
          });
        }
      } else {
        result = await callGeminiGenerateContent(resolved.key, modelChain, {
          contents: prompt,
          generationConfig: { temperature: 0.2 },
        });
      }

      if (!result.text) {
        return jsonResponse(
          {
            success: false,
            error: 'empty_gemini_response',
            text: 'เชื่อมต่อได้แต่โมเดลไม่ตอบกลับ — ลองใหม่อีกครั้ง',
          },
          502
        );
      }

      const emailNotice = userEmail ? ` (เชื่อมโยงกับบัญชี ${userEmail})` : '';
      const keyNotice = resolved.source === 'server' ? 'ใช้คีย์ฝั่งเซิร์ฟเวอร์ (ENV)' : 'ใช้คีย์ที่กรอกในฟอร์ม';
      const k = resolved.key;
      return jsonResponse({
        success: true,
        model: primaryModel,
        keySource: resolved.source,
        keyMasked: k ? `${k.slice(0, 4)}••••${k.slice(-4)}` : '',
        searchGrounded,
        text: searchGrounded
          ? `เชื่อมต่อ Gemini (${primaryModel}) สำเร็จ!${emailNotice} ${keyNotice} • รองรับ Google Search Grounding ✓`
          : `เชื่อมต่อ Gemini (${primaryModel}) สำเร็จ!${emailNotice} ${keyNotice} • โหมดประหยัดโควตา ✓`,
      });
    } catch (err) {
      return sendGeminiErrorEdge(err);
    }
  }

  if (pathname === '/api/gemini/sentiment' && request.method === 'POST') {
    const body = await readJsonBody(request);
    const { apiKey, coin, signal } = body;
    if (resolveGeminiKey(apiKey, envKeys).source === 'none') return sendKeyProblemEdge(apiKey, env);
    if (!coin) return jsonResponse({ error: 'missing_coin_data' }, 400);

    const prompt = `คุณคือผู้เชี่ยวชาญด้าน Crypto Market Sentiment และ On-chain Analytics
โปรดประเมินคะแนน Market Sentiment Score (0 ถึง 100) สำหรับเหรียญต่อไปนี้:
- เหรียญ: ${coin.name} (${coin.symbol})
- ราคาปัจจุบัน: $${coin.price}
- การเปลี่ยนแปลง 24 ชั่วโมง: ${coin.change}%
${signal ? `- สัญญาณเทคนิค: ${signal.type} (ความน่าจะเป็น ${signal.probability}%)` : ''}

ตอบเป็นภาษาไทย ในรูปแบบ JSON เท่านั้น:
{
  "score": 50,
  "sentimentLabel": "NEUTRAL",
  "sentimentTextTh": "คำนิยามสั้นๆ ภาษาไทย",
  "summaryReason": "สรุปสั้น 1-2 ประโยค",
  "socialMomentum": "MODERATE",
  "whaleActivity": "NEUTRAL"
}`;

    try {
      const res = await runWithUserOrServerKeyEdge(apiKey, env, (k) =>
        generateWithGroundingFallbackEdge(k, modelChain, prompt, undefined)
      );
      const parsed = extractJsonFromText<any>(res.text || '{}') || {};
      const score = Math.min(100, Math.max(0, Number(parsed.score) || 50));
      const safetyMargin = Math.max(5, Math.min(50, Number(parsed.safetyMargin) || Math.round((100 - score) * 0.35 + 8)));
      return jsonResponse({
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
    } catch (err) {
      return sendGeminiErrorEdge(err);
    }
  }

  if (pathname === '/api/gemini/analyze-market' && request.method === 'POST') {
    const body = await readJsonBody(request);
    const { apiKey, coin, signal } = body;
    if (resolveGeminiKey(apiKey, envKeys).source === 'none') return sendKeyProblemEdge(apiKey, env);
    if (!coin) return jsonResponse({ error: 'missing_coin_data' }, 400);

    const isUp = coin.change >= 0;
    const isForex = String(coin.symbol || '').includes('/') || signal?.category === 'FOREX';
    const defaultSup = isForex ? (isUp ? coin.price * 0.994 : coin.price * 0.988) : (coin.low || coin.price * 0.955);
    const defaultRes = isForex ? (isUp ? coin.price * 1.012 : coin.price * 1.006) : (coin.high || coin.price * 1.045);

    const prompt = `วิเคราะห์สินทรัพย์ ${coin.name} (${coin.symbol}) ราคา ${coin.price} เปลี่ยนแปลง 24 ชม. ${coin.change}% ${signal ? `สัญญาณ ${signal.type} (${signal.probability}%)` : ''}
ตอบเป็นภาษาไทย JSON เท่านั้น:
{
  "action": "LONG" | "SHORT" | "NEUTRAL",
  "confidence": 75,
  "summary": "สรุปสั้น 2-3 ประโยค",
  "supportLevel": ${defaultSup},
  "resistanceLevel": ${defaultRes},
  "strategyAdvice": "คำแนะนำ SL/TP",
  "sentimentScore": 60,
  "sentimentLabel": "BULLISH",
  "sentimentTextTh": "เชิงบวก",
  "socialMomentum": "MODERATE",
  "whaleActivity": "NEUTRAL"
}`;

    try {
      const res = await runWithUserOrServerKeyEdge(apiKey, env, (k) =>
        generateWithGroundingFallbackEdge(k, modelChain, prompt, undefined)
      );
      const parsed = extractJsonFromText<any>(res.text || '{}') || {};
      const sScore = Math.min(100, Math.max(0, Number(parsed.sentimentScore) || (isUp ? 68 : 38)));
      return jsonResponse({
        symbol: coin.symbol,
        action: parsed.action || (isUp ? 'LONG' : 'SHORT'),
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
    } catch (err) {
      return sendGeminiErrorEdge(err);
    }
  }

  if (pathname === '/api/gemini/analyze-news' && request.method === 'POST') {
    const body = await readJsonBody(request);
    const { apiKey, article } = body;
    if (resolveGeminiKey(apiKey, envKeys).source === 'none') return sendKeyProblemEdge(apiKey, env);
    if (!article) return jsonResponse({ error: 'missing_article' }, 400);

    const prompt = `วิเคราะห์ข่าว "${article.title}" จาก ${article.source} (${article.time}) ตอบเป็นภาษาไทย JSON เท่านั้น:
{
  "sentiment": "BULLISH" | "BEARISH" | "NEUTRAL",
  "sentimentLabelTh": "ผลกระทบต่อตลาด",
  "accuracyScore": 90,
  "marketImpact": "HIGH" | "MEDIUM" | "LOW",
  "affectedMarkets": ["BTC", "SET Index", "USD/THB"],
  "impactHorizon": "SHORT_TERM",
  "coreTakeaway": "สรุปสั้น 1-2 ประโยค",
  "marketImplication": "ผลกระทบเชิงลึก",
  "tradingStrategyAdvice": "กลยุทธ์ที่แนะนำ",
  "macroRisk": "MODERATE",
  "volatilityForecast": "EXPANDING",
  "recommendedPositioning": "HOLD",
  "riskFactors": ["ความเสี่ยงที่ต้องจับตา"]
}`;

    try {
      const res = await runWithUserOrServerKeyEdge(apiKey, env, (k) =>
        generateWithGroundingFallbackEdge(k, modelChain, prompt, undefined)
      );
      const parsed = extractJsonFromText<any>(res.text || '{}') || {};
      return jsonResponse({
        newsId: article.id,
        title: article.title,
        source: article.source,
        url: article.url,
        sentiment: parsed.sentiment || article.sentiment || 'NEUTRAL',
        sentimentLabelTh: parsed.sentimentLabelTh || 'ประเมินเป็นกลางต่อตลาด',
        accuracyScore: Math.min(99, Math.max(80, Number(parsed.accuracyScore) || 92)),
        marketImpact: parsed.marketImpact || article.impact || 'MEDIUM',
        affectedMarkets:
          Array.isArray(parsed.affectedMarkets) && parsed.affectedMarkets.length > 0
            ? parsed.affectedMarkets
            : ['SET Index (ตลาดหุ้นไทย)', 'USD/THB (ค่าเงินบาท)'],
        impactHorizon: parsed.impactHorizon || 'SHORT_TERM',
        coreTakeaway: parsed.coreTakeaway || article.summary || article.title,
        marketImplication: parsed.marketImplication || 'ส่งผลต่อความผันผวนระยะสั้น',
        tradingStrategyAdvice: parsed.tradingStrategyAdvice || 'รอจังหวะยืนยันแนวรับ-แนวต้าน',
        keyMetrics: {
          macroRisk: parsed.macroRisk || 'MODERATE',
          volatilityForecast: parsed.volatilityForecast || 'EXPANDING',
          recommendedPositioning: parsed.recommendedPositioning || 'HOLD',
        },
        riskFactors:
          Array.isArray(parsed.riskFactors) && parsed.riskFactors.length > 0
            ? parsed.riskFactors
            : ['ความผันผวนของอัตราแลกเปลี่ยน'],
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      return sendGeminiErrorEdge(err);
    }
  }

  if (pathname === '/api/gemini/holistic-stance' && request.method === 'POST') {
    const body = await readJsonBody(request);
    const { apiKey, signals = [], newsList = [] } = body;
    if (resolveGeminiKey(apiKey, envKeys).source === 'none') return sendKeyProblemEdge(apiKey, env);

    const prompt = `สรุปสภาวะตลาดองค์รวมจาก ${signals.length} สัญญาณ และ ${newsList.length} ข่าว ตอบภาษาไทย JSON:
{"recommendation":"HOLD","recommendationLabelTh":"ถือรอดูจังหวะ (Hold)","confidence":80,"marketStance":"...","summaryReason":"...","keyDrivers":["..."],"riskFactor":"..."}`;

    try {
      const res = await runWithUserOrServerKeyEdge(apiKey, env, (k) =>
        generateWithGroundingFallbackEdge(k, modelChain, prompt, undefined)
      );
      const parsed = extractJsonFromText<any>(res.text || '{}') || {};
      const rec = String(parsed.recommendation || '').toUpperCase();
      const validRec = rec === 'BUY' ? 'BUY' : rec === 'SELL' ? 'SELL' : 'HOLD';
      return jsonResponse({
        recommendation: validRec,
        recommendationLabelTh:
          parsed.recommendationLabelTh ||
          (validRec === 'BUY' ? 'เข้าซื้อสะสม (Buy)' : validRec === 'SELL' ? 'ชะลอขาย (Sell)' : 'ถือรอดูจังหวะ (Hold)'),
        confidence: Math.min(98, Math.max(65, Number(parsed.confidence) || 80)),
        marketStance: parsed.marketStance || 'ตลาดเคลื่อนไหวในกรอบสะสมกำลัง',
        summaryReason: parsed.summaryReason || 'ประเมินจากสัญญาณเทคนิคัลและกระแสข่าว',
        keyDrivers:
          Array.isArray(parsed.keyDrivers) && parsed.keyDrivers.length > 0
            ? parsed.keyDrivers
            : ['โมเมนตัมตลาด', 'กระแสข่าวสาร'],
        riskFactor: parsed.riskFactor || 'ความผันผวนจากปัจจัยเศรษฐกิจมหภาค',
        bullishSignalsCount: signals.filter((s: any) => s.type === 'LONG').length,
        bearishSignalsCount: signals.filter((s: any) => s.type === 'SHORT').length,
        bullishNewsCount: newsList.filter((n: any) => n.sentiment === 'BULLISH').length,
        bearishNewsCount: newsList.filter((n: any) => n.sentiment === 'BEARISH').length,
        source: 'GEMINI_AI',
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      return sendGeminiErrorEdge(err);
    }
  }

  if (pathname === '/api/gemini/synthesize-hourly' && request.method === 'POST') {
    const body = await readJsonBody(request);
    const { apiKey, newsList = [], signals = [] } = body;
    if (resolveGeminiKey(apiKey, envKeys).source === 'none') return sendKeyProblemEdge(apiKey, env);

    const prompt = `สรุปสภาวะตลาดประจำชั่วโมง ข่าว ${newsList.length} หัวข้อ สัญญาณ ${signals.length} ตัว ตอบภาษาไทย JSON:
{"headline":"...","overallStance":"NEUTRAL","overallStanceTh":"เป็นกลาง","confidence":80,"keyCatalysts":["..."],"mostImpactedAssets":[],"riskHorizon":"1-24 ชม.","actionableSummary":"..."}`;

    try {
      const res = await runWithUserOrServerKeyEdge(apiKey, env, (k) =>
        generateWithGroundingFallbackEdge(k, modelChain, prompt, undefined)
      );
      const parsed = extractJsonFromText<any>(res.text || '{}') || {};
      return jsonResponse({
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
    } catch (err) {
      return sendGeminiErrorEdge(err);
    }
  }

  if (pathname === '/api/gemini/longterm-project' && request.method === 'POST') {
    const body = await readJsonBody(request);
    const { apiKey, article } = body;
    if (resolveGeminiKey(apiKey, envKeys).source === 'none') return sendKeyProblemEdge(apiKey, env);
    if (!article) return jsonResponse({ error: 'missing_article' }, 400);

    const details = article.projectDetails;
    const prompt = `วิเคราะห์โครงการ CAPEX: ${article.title} บริษัท ${details?.company || 'N/A'} ตอบภาษาไทย JSON`;
    try {
      const res = await runWithUserOrServerKeyEdge(apiKey, env, (k) =>
        generateWithGroundingFallbackEdge(k, modelChain, prompt, undefined)
      );
      const parsed = extractJsonFromText<any>(res.text || '{}') || {};
      return jsonResponse({
        company: parsed.company || details?.company || 'N/A',
        projectName: parsed.projectName || details?.projectName || article.title,
        capexValue: parsed.capexValue || details?.capexValue || 'N/A',
        constructionTimeline: parsed.constructionTimeline || details?.constructionTimeline || 'N/A',
        paybackPeriod: parsed.paybackPeriod || '3-5 ปี',
        roiProjection: parsed.roiProjection || '11% - 14% IRR',
        economicMoat: parsed.economicMoat || 'คูเมืองแข็งแกร่งจากส่วนแบ่งตลาด',
        debtRiskAssessment: parsed.debtRiskAssessment || 'งบการเงินมีความมั่นคง',
        longTermVerdict: parsed.longTermVerdict || 'ACCUMULATE',
        longTermVerdictTh: parsed.longTermVerdictTh || 'ทยอยสะสมระยะยาว (Accumulate)',
        confidenceScore: Number(parsed.confidenceScore) || 88,
        coreDrivers: Array.isArray(parsed.coreDrivers) ? parsed.coreDrivers : ['การขยายกำลังการผลิต'],
        strategicRisk: parsed.strategicRisk || 'ความล่าช้าของการก่อสร้างและต้นทุนวัตถุดิบ',
        investmentHorizon: parsed.investmentHorizon || '3 - 5 ปี',
        strategyAdvice: parsed.strategyAdvice || 'แนะนำทยอยสะสมเมื่อราคาย่อตัวใกล้แนวรับ',
        source: 'GEMINI_AI',
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      return sendGeminiErrorEdge(err);
    }
  }

  if (pathname === '/api/gemini/categorize-headlines' && request.method === 'POST') {
    const body = await readJsonBody(request);
    const { articles = [], apiKey } = body;
    if (resolveGeminiKey(apiKey, envKeys).source === 'none') return sendKeyProblemEdge(apiKey, env);
    if (!Array.isArray(articles) || articles.length === 0) return jsonResponse({ error: 'missing_articles' }, 400);

    const headlinesToAnalyze = articles.slice(0, 15);
    const heuristicFallback = () =>
      articles.map((art: any) => ({
        ...art,
        impact: art.impact || categorizeHeadlinesHeuristic(art),
      }));

    try {
      const prompt = `Categorize each headline market impact into "HIGH", "MEDIUM", or "LOW". Return ONLY JSON array [{"id":"1","impact":"HIGH"}]:\n${headlinesToAnalyze.map((a: any, i: number) => `${i + 1}. [ID: ${a.id || i}] ${a.title}`).join('\n')}`;
      const res = await runWithUserOrServerKeyEdge(apiKey, env, (k) =>
        callGeminiGenerateContent(k, modelChain, {
          contents: prompt,
          generationConfig: { responseMimeType: 'application/json' },
        })
      );
      const parsed = extractJsonFromText<any[]>(res.text || '[]');
      if (!Array.isArray(parsed)) {
        return jsonResponse({
          articles: heuristicFallback(),
          source: 'HEURISTIC_FALLBACK',
          degraded: true,
          degradedReason: 'unparseable_response',
        });
      }
      const impactMap = new Map<string, 'HIGH' | 'MEDIUM' | 'LOW'>();
      parsed.forEach((item: any, idx: number) => {
        const id = String(item.id || headlinesToAnalyze[idx]?.id || idx);
        const impact = String(item.impact || '').toUpperCase();
        if (impact === 'HIGH' || impact === 'MEDIUM' || impact === 'LOW') {
          impactMap.set(id, impact);
        }
      });
      const updated = articles.map((art: any, idx: number) => ({
        ...art,
        impact: impactMap.get(art.id) || impactMap.get(String(idx + 1)) || art.impact || categorizeHeadlinesHeuristic(art),
      }));
      return jsonResponse({ articles: updated, source: 'GEMINI_AI' });
    } catch (err) {
      const info = classifyGeminiError(err);
      if (
        info.kind === 'SERVER_ERROR' ||
        info.kind === 'NETWORK' ||
        info.kind === 'QUOTA' ||
        info.kind === 'MODEL_NOT_FOUND' ||
        info.kind === 'UNKNOWN'
      ) {
        return jsonResponse({
          articles: heuristicFallback(),
          source: 'HEURISTIC_FALLBACK',
          degraded: true,
          degradedReason: info.code,
        });
      }
      return sendGeminiErrorEdge(err);
    }
  }

  if (pathname === '/api/gemini/chat-reply' && request.method === 'POST') {
    const body = await readJsonBody(request);
    const { query, marketBrief, geminiApiKey } = body;
    if (typeof query !== 'string' || !query.trim()) return jsonResponse({ error: 'Missing query' }, 400);
    if (resolveGeminiKey(geminiApiKey, envKeys).source === 'none') return sendKeyProblemEdge(geminiApiKey, env);

    const tone: ChatTone = isChatTone(body.tone) ? body.tone : 'friend';
    const sources = Array.isArray(body.sources)
      ? body.sources.filter((x: unknown): x is string => typeof x === 'string').slice(0, 6)
      : [];
    const prompt = buildChatPrompt({
      query: query.slice(0, 800),
      marketBrief: typeof marketBrief === 'string' ? marketBrief.slice(0, 2400) : '',
      tone,
      sources,
    });

    try {
      const res = await runWithUserOrServerKeyEdge(geminiApiKey, env, (k) =>
        generateWithGroundingFallbackEdge(k, modelChain, prompt, undefined)
      );
      if (!res.text) return jsonResponse({ error: 'Empty response from Gemini' }, 500);
      return jsonResponse({ reply: res.text, source: 'GEMINI_AI' });
    } catch (err) {
      return sendGeminiErrorEdge(err);
    }
  }

  if (pathname === '/api/gemini/mascot-line' && request.method === 'POST') {
    const body = await readJsonBody(request);
    const { apiKey, state, marketBrief, windowContext } = body;
    if (resolveGeminiKey(apiKey, envKeys).source === 'none') return sendKeyProblemEdge(apiKey, env);

    const mascotState = typeof state === 'string' ? state.slice(0, 40) : 'IDLE';
    const brief = typeof marketBrief === 'string' ? marketBrief.slice(0, 600) : '';
    const winTitle = typeof windowContext?.windowTitleTh === 'string' ? windowContext.windowTitleTh.slice(0, 80) : 'หน้าหลัก';
    const focusHint = typeof windowContext?.focusHint === 'string' ? windowContext.focusHint.slice(0, 180) : '';

    const prompt = `คุณคือ "น้องมอเตอร์บอย" มาสคอตเทรดเดอร์ พูดไทยสั้น 1 ประโยคไม่เกิน 90 ตัวอักษร จริงจังเรื่องวินัยและความเสี่ยง
สถานะ: ${mascotState} | หน้าต่าง: ${winTitle} | โฟกัส: ${focusHint}
ข้อมูลตลาด: <<<${brief || 'ไม่มีข้อมูล'}>>`;

    try {
      const res = await runWithUserOrServerKeyEdge(apiKey, env, (k) =>
        callGeminiGenerateContent(k, modelChain, {
          contents: prompt,
          generationConfig: { maxOutputTokens: 200, temperature: 0.95 },
        })
      );
      const line = String(res.text || '')
        .replace(/\s+/g, ' ')
        .replace(/^["'“”\s]+|["'“”\s]+$/g, '')
        .trim()
        .slice(0, 180);
      if (!line) return jsonResponse({ error: 'empty_gemini_response' }, 502);
      return jsonResponse({
        line,
        state: mascotState,
        source: 'GEMINI_AI',
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      return sendGeminiErrorEdge(err);
    }
  }

  if (pathname === '/api/gemini/mascot-action' && request.method === 'POST') {
    const body = await readJsonBody(request);
    const text = typeof body.text === 'string' ? body.text.trim().slice(0, 240) : '';
    const marketBrief = typeof body.marketBrief === 'string' ? body.marketBrief.slice(0, 600) : '';
    if (!text) return jsonResponse({ error: 'missing_text' }, 400);
    if (resolveGeminiKey(body.apiKey, envKeys).source === 'none') return sendKeyProblemEdge(body.apiKey, env);

    const winTitle = typeof body.windowContext?.windowTitleTh === 'string' ? body.windowContext.windowTitleTh.slice(0, 80) : 'หน้าหลัก';
    const systemInstruction = `คุณคือ "น้องมอเตอร์บอย" AI Co-Pilot ใน Trading Engine Pro Sandbox เลือกเรียก Function Tool ให้ตรงความหมายผู้ใช้ ห้ามสั่งซื้อขายจริง\n${MASCOT_ACTION_CATALOG}`;
    const functionDeclarations = buildRestFunctionDeclarations(body.capabilities);

    try {
      const res = await runWithUserOrServerKeyEdge(body.apiKey, env, (k) =>
        callGeminiGenerateContent(k, modelChain, {
          contents: `หน้าต่างปัจจุบัน: ${winTitle}\nตลาด: ${marketBrief}\nคำขอ: ${text}`,
          systemInstruction,
          generationConfig: { maxOutputTokens: 260, temperature: 0.35 },
          tools: [{ functionDeclarations }],
        })
      );

      const validActions: MascotAction[] = [];
      for (const call of res.functionCalls.slice(0, 4)) {
        const parsed = parseMascotAction({ name: call?.name, args: call?.args || {} });
        if (parsed) validActions.push(parsed);
      }
      const rawReply = String(res.text || '').replace(/\s+/g, ' ').trim().slice(0, 180);
      const fallbackActionReply =
        validActions.length > 0 ? validActions.map((a) => describeMascotAction(a)).join(' ') : '';
      const reply = rawReply || fallbackActionReply;
      if (!reply && validActions.length === 0) {
        return jsonResponse({ error: 'empty_gemini_response' }, 502);
      }

      return jsonResponse({
        reply: reply || 'เรียบร้อยครับ',
        action: validActions[0] ?? null,
        actions: validActions,
        source: 'GEMINI_AI',
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      return sendGeminiErrorEdge(err);
    }
  }

  if (pathname === '/api/gemini/chat-stream' && request.method === 'POST') {
    const body = await readJsonBody(request);
    const query = typeof body.query === 'string' ? body.query.slice(0, 800).trim() : '';
    const marketBrief = typeof body.marketBrief === 'string' ? body.marketBrief.slice(0, 2400) : '';
    const tone: ChatTone = isChatTone(body.tone) ? body.tone : 'friend';
    const sources = Array.isArray(body.sources)
      ? body.sources.filter((x: unknown): x is string => typeof x === 'string').slice(0, 6)
      : [];
    if (!query) return jsonResponse({ error: 'Missing query' }, 400);

    const userKey = typeof body.geminiApiKey === 'string' ? body.geminiApiKey : undefined;
    if (resolveGeminiKey(userKey, envKeys).source === 'none') return sendKeyProblemEdge(userKey, env);

    const prompt = buildChatPrompt({ query, marketBrief, tone, sources });
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (event: string, data: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        };

        sendEvent('meta', { tone, sources });

        try {
          const openStream = async (apiKey: string, withSearch: boolean) => {
            for (let i = 0; i < modelChain.length; i += 1) {
              const model = modelChain[i];
              const payload: Record<string, unknown> = {
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
              };
              if (withSearch) payload.tools = [{ googleSearch: {} }];
              try {
                const upstream = await fetch(
                  `${GEMINI_API_BASE}/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`,
                  {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'x-goog-api-key': apiKey,
                    },
                    body: JSON.stringify(payload),
                  }
                );
                if (!upstream.ok || !upstream.body) {
                  const errText = await upstream.text().catch(() => '');
                  throw extractGeminiRestError(upstream.status, errText);
                }
                return upstream.body;
              } catch (err) {
                const info = classifyGeminiError(err);
                if (!shouldTryFallbackModel(info) || i + 1 >= modelChain.length) throw err;
              }
            }
            throw new Error('UNREACHABLE');
          };

          const bodyStream = await runWithUserOrServerKeyEdge(userKey, env, async (k) => {
            if (!shouldAttemptGroundingEdge(k)) {
              return openStream(k, false);
            }
            try {
              return await openStream(k, true);
            } catch (err) {
              const info = classifyGeminiError(err);
              if (info.kind === 'QUOTA' || info.kind === 'BAD_REQUEST' || info.kind === 'PERMISSION_DENIED') {
                markGroundingBlockedEdge(k);
              }
              if (info.kind !== 'QUOTA' && info.kind !== 'BAD_REQUEST') throw err;
              return openStream(k, false);
            }
          });

          const reader = bodyStream.getReader();
          let buffer = '';
          let full = '';
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const line of lines) {
              if (!line.startsWith('data:')) continue;
              const jsonStr = line.slice(5).trim();
              if (!jsonStr || jsonStr === '[DONE]') continue;
              try {
                const chunk = JSON.parse(jsonStr);
                const parsedChunk = parseGeminiRestPayload(chunk);
                if (parsedChunk.text) {
                  full += parsedChunk.text;
                  sendEvent('delta', { text: parsedChunk.text });
                }
              } catch {
                // ignore partial SSE JSON
              }
            }
          }

          sendEvent('done', { text: full, finishReason: 'STOP' });
        } catch (err) {
          const info = classifyGeminiError(err);
          sendEvent('error', {
            code: info.code,
            kind: info.kind,
            retryable: info.retryable,
            message: info.messageTh,
          });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  }

  // Stateless Cloudflare Edge handlers for backtest candles & archive overview
  if (pathname === '/api/backtest/candles' && request.method === 'GET') {
    const symbol = url.searchParams.get('symbol')?.trim().slice(0, 32) || '';
    const periodDays = Math.min(1000, Math.max(7, Number(url.searchParams.get('periodDays')) || 90));
    if (!symbol) return jsonResponse({ error: 'missing_symbol' }, 400);
    return jsonResponse(await fetchEdgeBacktestCandles(symbol, periodDays));
  }

  if (pathname === '/api/archive/status') {
    return jsonResponse({
      todayBangkokDateKey: new Date().toISOString().slice(0, 10),
      schedulerActive: false,
      runtime: 'cloudflare-edge',
      dailySnapshotCount: 0,
      backtestArchiveCount: 0,
      trackedAssetsInMatrix: 0,
      historicalCache: { cachedAssetCount: 0, cycleLength: 30 },
    });
  }

  if (pathname === '/api/archive/sensitivity') {
    return jsonResponse({ updatedAt: new Date().toISOString(), recordedDates: 0, assets: {} });
  }

  if (pathname === '/api/archive/daily/dates') {
    return jsonResponse({ count: 0, dates: [] });
  }

  if (pathname === '/api/archive/backtest' && request.method === 'GET') {
    return jsonResponse({ count: 0, records: [] });
  }

  if (pathname === '/api/archive/historical-cache') {
    return jsonResponse({
      rotationState: { lastRotationDateKey: null, nextAssetIndex: 0, cycleLength: 30 },
      cachedAssets: [],
    });
  }

  return jsonResponse({ error: 'Not found' }, 404);
}
