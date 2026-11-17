import {
  MASCOT_SANDBOX_CAPABILITIES,
  parseMascotAction,
  parseMascotActions,
  type MascotAction,
} from '../mascot/actions';
import { buildMascotMarketBrief, canReachServer, timeoutSignal, type MascotAiContext } from './mascotAiService';

/**
 * "น้องมอเตอร์บอย สั่งงานได้" — natural language intent in, dynamically resolved
 * sandbox actions out (zero fixed command triggers; Gemini chooses tools dynamically).
 */

const REQUEST_TIMEOUT_MS = 12_000;
const MAX_COMMAND = 240;

export interface MascotCommandResult {
  reply: string;
  action: MascotAction | null;
  actions: MascotAction[];
}

export interface SendMascotCommandOptions extends MascotAiContext {
  text: string;
  apiKey?: string;
  signal?: AbortSignal;
}

export async function sendMascotCommand(
  options: SendMascotCommandOptions
): Promise<MascotCommandResult | null> {
  const text = options.text.trim().slice(0, MAX_COMMAND);
  if (!text || !canReachServer()) return null;

  try {
    const res = await fetch('/api/gemini/mascot-action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        marketBrief: buildMascotMarketBrief(options),
        windowContext: options.windowContext,
        capabilities: MASCOT_SANDBOX_CAPABILITIES,
        apiKey: options.apiKey?.trim() || undefined,
      }),
      signal: options.signal ?? timeoutSignal(REQUEST_TIMEOUT_MS),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const reply = typeof data?.reply === 'string' ? data.reply.trim().slice(0, 200) : '';
    const parsedList = parseMascotActions(data?.actions ?? data?.action);
    const singleAction = parsedList[0] ?? parseMascotAction(data?.action) ?? null;
    if (!reply && parsedList.length === 0) return null;
    return {
      reply,
      action: singleAction,
      actions: parsedList.length > 0 ? parsedList : singleAction ? [singleAction] : [],
    };
  } catch {
    return null;
  }
}
