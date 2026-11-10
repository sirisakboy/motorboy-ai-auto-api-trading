import { generateAiChatReply, AiChatContext } from './aiChatService';
import {
  ChatTone,
  buildMarketBrief,
  buildSourceList,
  isChatTone,
  parseSseBuffer,
  readSsePayload,
  sanitizeVoice,
} from './chatStreamCore';

export interface StreamChatRequest {
  query: string;
  context: AiChatContext;
  tone: ChatTone;
  /** ผู้ใช้ใส่คีย์เองในหน้าตั้งค่า (ไม่บังคับ — server มีคีย์ของตัวเองได้) */
  geminiApiKey?: string;
  signal?: AbortSignal;
  /** เรียกทุกครั้งที่ได้ข้อความใหม่ (ผู้เรียกควร throttle ก่อน setState) */
  onDelta?: (chunk: string, fullText: string) => void;
  /** เรียกเมื่อได้ข้อมูล meta จาก server (แหล่งข้อมูล/โทน) */
  onMeta?: (meta: { tone?: ChatTone; sources?: string[] }) => void;
}

export interface StreamChatResult {
  text: string;
  sources: string[];
  tone: ChatTone;
  depth: 'llm' | 'quant';
  streamed: boolean;
  latencyMs: number;
}


export function sourcesFromContext(context: AiChatContext): string[] {
  return buildSourceList({
    crypto: context.cryptoList?.length ?? 0,
    forex: context.forexRates?.length ?? 0,
    thaiStocks: context.thaiStocks?.length ?? 0,
    foreignStocks: context.foreignStocks?.length ?? 0,
    indices: context.stockIndices?.length ?? 0,
    news: context.articles?.length ?? 0,
  });
}

/**
 * Streaming chat reply with a graceful ladder:
 *   1. SSE from our own server  (token by token, cancellable)
 *   2. Non-streaming server call (if the browser/proxy can't stream)
 *   3. On-device quant engine    (works offline, no key needed)
 */
export async function streamChatReply(request: StreamChatRequest): Promise<StreamChatResult> {
  const startedAt = Date.now();
  const sources = sourcesFromContext(request.context);
  const tone: ChatTone = isChatTone(request.tone) ? request.tone : 'friend';

  try {
    const streamed = await streamFromServer(request, sources, tone);
    if (streamed && streamed.text.trim()) {
      return {
        text: sanitizeVoice(streamed.text),
        sources: streamed.sources.length > 0 ? streamed.sources : sources,
        tone,
        depth: 'llm',
        streamed: true,
        latencyMs: Date.now() - startedAt,
      };
    }
  } catch (error) {
    if (request.signal?.aborted) throw error;
    console.warn('Streaming chat unavailable, falling back:', error);
  }

  // Tier 2/3: existing non-streaming pipeline (Gemini via server, or quant)
  const text = sanitizeVoice(await generateAiChatReply(request.query, request.context));
  return {
    text,
    sources,
    tone,
    depth: request.geminiApiKey ? 'llm' : 'quant',
    streamed: false,
    latencyMs: Date.now() - startedAt,
  };
}

async function streamFromServer(
  request: StreamChatRequest,
  sources: string[],
  tone: ChatTone
): Promise<{ text: string; sources: string[] } | null> {
  const response = await fetch('/api/gemini/chat-stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({
      query: request.query,
      marketBrief: buildMarketBrief(request.context),
      sources,
      tone,
      geminiApiKey: request.geminiApiKey,
    }),
    signal: request.signal,
  });

  if (!response.ok || !response.body) {
    throw new Error(`stream failed: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';
  let serverSources = sources;
  let receivedDone = false;

  while (!receivedDone) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const { frames, rest } = parseSseBuffer(buffer);
    buffer = rest;

    for (const frame of frames) {
      if (frame.event === 'meta') {
        const payload = readSsePayload<{ tone?: string; sources?: string[] }>(frame);
        if (payload?.sources && Array.isArray(payload.sources)) {
          serverSources = payload.sources.filter((s): s is string => typeof s === 'string');
        }
        request.onMeta?.({
          tone: isChatTone(payload?.tone) ? payload.tone : tone,
          sources: serverSources,
        });
      } else if (frame.event === 'delta') {
        const payload = readSsePayload<{ text?: string }>(frame);
        if (payload?.text) {
          full += payload.text;
          request.onDelta?.(payload.text, full);
        }
      } else if (frame.event === 'done') {
        const payload = readSsePayload<{ text?: string }>(frame);
        if (payload?.text && payload.text.length > full.length) {
          full = payload.text;
          request.onDelta?.('', full);
        }
        receivedDone = true;
        break;
      } else if (frame.event === 'error') {
        const payload = readSsePayload<{ message?: string }>(frame);
        throw new Error(payload?.message || 'stream error');
      }
    }
  }

  try {
    await reader.cancel();
  } catch {
    /* stream already closed */
  }

  return { text: full, sources: serverSources };
}
