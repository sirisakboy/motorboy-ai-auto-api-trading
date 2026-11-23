/**
 * Cloudflare Workers AI Free-Tier Service + Main AI Double-Check Orchestrator.
 *
 * Flow:
 *  1) RSS item -> Cloudflare Workers AI (`@cf/meta/llama-3-8b-instruct` free tier) in background Worker.
 *  2) Cloudflare AI summary + RSS article -> sent to MAIN AI (`geminiService.ts` / `mascotAiService.ts`)
 *     for second verification WITHOUT modifying `geminiService.ts` or `mascotAiService.ts`.
 *  3) If Cloudflare AI free quota fails / is exceeded, gracefully falls back to MAIN AI only — never crashes UI.
 */

import type {
  CloudflareAiStatus,
  DoubleCheckAnalysisRecord,
  NewsArticle,
} from '../types';
import { analyzeNewsWithGemini } from './geminiService';
import { fetchMascotLine } from './mascotAiService';

export const CF_LLAMA3_MODEL = '@cf/meta/llama-3-8b-instruct';
export const CF_FALLBACK_MODEL = '@cf/mistral/mistral-7b-instruct-v0.1';

export interface WorkersAiRunner {
  run(
    model: string,
    inputs: {
      messages?: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
      prompt?: string;
      max_tokens?: number;
      temperature?: number;
    }
  ): Promise<{ response?: string; result?: { response?: string } } | string>;
}

export interface CloudflareWorkersAiEnv {
  AI?: WorkersAiRunner;
  CF_AI_MODEL?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_API_TOKEN?: string;
  CF_ACCOUNT_ID?: string;
  CF_API_TOKEN?: string;
}

export interface WorkersAiStageOutput {
  model: string;
  summaryTh: string;
  status: CloudflareAiStatus;
}

export function isCloudflareAiQuotaError(err: unknown): boolean {
  const msg =
    err instanceof Error
      ? err.message
      : typeof err === 'string'
      ? err
      : JSON.stringify(err || '');
  const status = (err as { status?: number })?.status;
  if (status === 429) return true;
  return /quota|rate.?limit|exceeded|neurons|daily.?limit|free.?tier|capacity|too many requests|3036|3040|429/i.test(
    msg
  );
}

function unwrapWorkersAiText(raw: unknown): string {
  if (typeof raw === 'string') return raw.trim();
  if (raw && typeof raw === 'object') {
    const obj = raw as { response?: unknown; result?: { response?: unknown } };
    if (typeof obj.response === 'string') return obj.response.trim();
    if (typeof obj.result?.response === 'string') return obj.result.response.trim();
  }
  return '';
}

/**
 * Step 1 (Background Worker): Analyze RSS item using Cloudflare Workers AI Free Tier
 * (`@cf/meta/llama-3-8b-instruct`). Never throws; returns status `'QUOTA_EXCEEDED'`
 * or `'FALLBACK_MAIN_ONLY'` so Main AI always completes verification safely.
 */
export async function analyzeRssWithWorkersAi(
  env: CloudflareWorkersAiEnv,
  item: { rssSource: string; headline: string; summary?: string; category?: string }
): Promise<WorkersAiStageOutput> {
  const models = [env.CF_AI_MODEL || CF_LLAMA3_MODEL, CF_FALLBACK_MODEL];

  const systemPrompt =
    'คุณคือผู้ช่วยวิเคราะห์ข่าวการเงินขั้นต้นบน Cloudflare Workers AI สรุปใจความสำคัญของข่าว RSS ทิศทางตลาดเบื้องต้น (บวก/ลบ/กลาง) และสินทรัพย์ที่เกี่ยวข้องเป็นภาษาไทยสั้นกระชับ 2 ประโยค ห้ามแต่งตัวเลขราคาเอง';
  const userPrompt = `แหล่งข่าว RSS: ${item.rssSource} (${item.category || 'MACRO'})
พาดหัวข่าว: ${item.headline}
เนื้อหาย่อ: ${item.summary || '-'}
สรุปผลวิเคราะห์เบื้องต้นเป็นภาษาไทย (ไม่เกิน 220 ตัวอักษร):`;

  // 1) Native Cloudflare Workers AI binding (`env.AI`)
  if (env.AI && typeof env.AI.run === 'function') {
    let hitQuota = false;
    for (const model of models) {
      try {
        const res = await env.AI.run(model, {
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          max_tokens: 240,
          temperature: 0.25,
        });
        const text = unwrapWorkersAiText(res);
        if (text) {
          return { model, summaryTh: text.slice(0, 500), status: 'OK' };
        }
      } catch (err) {
        if (isCloudflareAiQuotaError(err)) {
          hitQuota = true;
          break;
        }
      }
    }

    if (hitQuota) {
      return {
        model: models[0],
        summaryTh:
          'เกินโควตาฟรีของ Cloudflare Workers AI ชั่วคราว — ระบบข้ามไปใช้ Main AI ตรวจสอบและสรุปผลโดยตรงอัตโนมัติ',
        status: 'QUOTA_EXCEEDED',
      };
    }

    return {
      model: models[0],
      summaryTh:
        'Cloudflare Workers AI ไม่ตอบสนองในรอบนี้ — สลับให้ Main AI ประมวลผลโดยตรงอัตโนมัติ',
      status: 'FALLBACK_MAIN_ONLY',
    };
  }

  // 2) Optional Cloudflare REST Workers AI fallback for local dev (.dev.vars / .env)
  const accountId = env.CLOUDFLARE_ACCOUNT_ID || env.CF_ACCOUNT_ID;
  const apiToken = env.CLOUDFLARE_API_TOKEN || env.CF_API_TOKEN;
  if (accountId && apiToken) {
    for (const model of models) {
      try {
        const res = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(
            accountId
          )}/ai/run/${model}`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${apiToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
              ],
              max_tokens: 240,
              temperature: 0.25,
            }),
          }
        );
        if (res.status === 429) {
          return {
            model,
            summaryTh:
              'เกินโควตาฟรีของ Cloudflare Workers AI ชั่วคราว — สลับไปใช้ Main AI โดยตรงอัตโนมัติ',
            status: 'QUOTA_EXCEEDED',
          };
        }
        if (res.ok) {
          const json = await res.json();
          const text = unwrapWorkersAiText(json);
          if (text) {
            return { model, summaryTh: text.slice(0, 500), status: 'OK' };
          }
        }
      } catch {
        // continue
      }
    }
  }

  return {
    model: models[0],
    summaryTh:
      'โหมดประมวลผลผ่าน Main AI โดยตรง (รอเชื่อมต่อ Cloudflare Workers AI Binding บน Edge)',
    status: 'FALLBACK_MAIN_ONLY',
  };
}

/**
 * Fetch saved double-check analyses from Worker D1 (`GET /api/analysis`).
 */
export async function fetchDoubleCheckAnalyses(
  limit = 6
): Promise<DoubleCheckAnalysisRecord[]> {
  try {
    const res = await fetch(`/api/analysis?limit=${encodeURIComponent(String(limit))}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { items?: DoubleCheckAnalysisRecord[] };
    return Array.isArray(data?.items) ? data.items : [];
  } catch {
    return [];
  }
}

/**
 * Full 2-Stage Pipeline from UI (non-blocking background):
 *  1) Calls Worker `POST /api/analysis` so Cloudflare Workers AI (`@cf/meta/llama-3-8b-instruct`)
 *     analyzes the RSS item in the background Worker.
 *  2) Sends Cloudflare AI's result + RSS article to MAIN AI (`analyzeNewsWithGemini` in `geminiService.ts`,
 *     plus optional mascot brief via `fetchMascotLine` in `mascotAiService.ts`) for second verification.
 *  3) Never crashes UI even if Cloudflare AI quota fails or network is offline.
 */
export async function runCloudflareAndMainAiDoubleCheck(params: {
  article?: Partial<NewsArticle>;
  apiKey?: string;
}): Promise<DoubleCheckAnalysisRecord | null> {
  const { article, apiKey = '' } = params;

  try {
    // Stage 1: Trigger Worker analysis (Cloudflare Workers AI + D1 record)
    const workerRes = await fetch('/api/analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        article,
        apiKey: apiKey || undefined,
      }),
      signal: AbortSignal.timeout(15000),
    });

    let baseRecord: DoubleCheckAnalysisRecord | null = null;
    if (workerRes.ok) {
      const data = (await workerRes.json()) as { analysis?: DoubleCheckAnalysisRecord };
      baseRecord = data?.analysis ?? null;
    }

    // Stage 2: When user/server Main AI (`geminiService.ts`) is invoked for client-side verification
    const targetTitle = baseRecord?.headline || article?.title || '';
    const targetSource = baseRecord?.rssSource || article?.source || 'RSS Feed';

    if (targetTitle && apiKey.trim()) {
      const articleForMainAi: NewsArticle = {
        id: String(baseRecord?.id || article?.id || `rss-${Date.now()}`),
        title: targetTitle,
        source: targetSource,
        time: article?.time || 'เมื่อสักครู่',
        url: baseRecord?.rssUrl || article?.url || 'https://finance.yahoo.com',
        sentiment: baseRecord?.sentiment || article?.sentiment || 'NEUTRAL',
        category: article?.category || 'MACRO',
        summary: baseRecord?.cfAiResult
          ? `[ผลขั้นต้นจาก Cloudflare AI: ${baseRecord.cfAiResult}] ${article?.summary || ''}`.trim()
          : article?.summary,
      };

      const verified = await analyzeNewsWithGemini(apiKey, articleForMainAi);

      // Optional non-blocking Mascot Co-Pilot awareness ping (`mascotAiService.ts`)
      void fetchMascotLine({
        state: 'SCANNING',
        apiKey,
      }).catch(() => null);

      const finalRecord: DoubleCheckAnalysisRecord = {
        id: baseRecord?.id ?? `verified-${Date.now()}`,
        rssItemId: baseRecord?.rssItemId,
        rssSource: targetSource,
        rssUrl: articleForMainAi.url,
        headline: targetTitle,
        cfAiModel: baseRecord?.cfAiModel || CF_LLAMA3_MODEL,
        cfAiResult:
          baseRecord?.cfAiResult ||
          'ข้ามขั้น Cloudflare AI — ตรวจสอบโดยตรงผ่าน Main AI (geminiService)',
        cfAiStatus: baseRecord?.cfAiStatus || 'FALLBACK_MAIN_ONLY',
        mainAiModel: 'MotorBoy Main AI (geminiService Verified)',
        mainAiVerdict: `${verified.sentimentLabelTh} • ${verified.keyMetrics.recommendedPositioning}`,
        mainAiSummary: `${verified.coreTakeaway} — กลยุทธ์: ${verified.tradingStrategyAdvice}`,
        sentiment: verified.sentiment,
        confidenceScore: verified.accuracyScore,
        timestamp: verified.timestamp || new Date().toISOString(),
      };

      // Persist verified verdict back to D1 asynchronously without blocking UI
      void fetch('/api/analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_verified',
          record: finalRecord,
        }),
      }).catch(() => undefined);

      return finalRecord;
    }

    return baseRecord;
  } catch {
    // Ultimate safety net: fallback directly to Main AI (`geminiService.ts`) so UI never crashes
    if (article?.title) {
      try {
        const fallbackArticle: NewsArticle = {
          id: String(article.id || `fallback-${Date.now()}`),
          title: article.title,
          source: article.source || 'RSS Feed',
          time: article.time || 'เมื่อสักครู่',
          url: article.url || 'https://finance.yahoo.com',
          sentiment: article.sentiment || 'NEUTRAL',
          category: article.category || 'MACRO',
          summary: article.summary,
        };
        const mainOnly = await analyzeNewsWithGemini(apiKey, fallbackArticle);
        return {
          id: `main-only-${Date.now()}`,
          rssSource: fallbackArticle.source,
          rssUrl: fallbackArticle.url,
          headline: fallbackArticle.title,
          cfAiModel: CF_LLAMA3_MODEL,
          cfAiResult: 'สลับใช้ Main AI โดยตรง (Cloudflare Worker ออฟไลน์หรือโควตาเต็ม)',
          cfAiStatus: 'FALLBACK_MAIN_ONLY',
          mainAiModel: 'MotorBoy Main AI (geminiService)',
          mainAiVerdict: mainOnly.sentimentLabelTh,
          mainAiSummary: `${mainOnly.coreTakeaway} • ${mainOnly.tradingStrategyAdvice}`,
          sentiment: mainOnly.sentiment,
          confidenceScore: mainOnly.accuracyScore,
          timestamp: mainOnly.timestamp,
        };
      } catch {
        return null;
      }
    }
    return null;
  }
}
