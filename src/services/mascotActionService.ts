import { parseMascotAction, type MascotAction } from '../mascot/actions';
import { buildMascotMarketBrief, canReachServer, timeoutSignal, type MascotAiContext } from './mascotAiService';

/**
 * "น้องมอเตอร์บอย สั่งงานได้" — one typed sentence in, one whitelisted verb out.
 *
 * The server owns the model and the prompt; this module owns nothing except the
 * round trip. `parseMascotAction` runs again on the response so a compromised or
 * confused server response still cannot reach the dashboard.
 */

const REQUEST_TIMEOUT_MS = 12_000;
const MAX_COMMAND = 200;

export interface MascotCommandResult {
  reply: string;
  action: MascotAction | null;
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
        apiKey: options.apiKey?.trim() || undefined,
      }),
      signal: options.signal ?? timeoutSignal(REQUEST_TIMEOUT_MS),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const reply = typeof data?.reply === 'string' ? data.reply.trim().slice(0, 200) : '';
    const action = parseMascotAction(data?.action);
    if (!reply && !action) return null;
    return { reply, action };
  } catch {
    return null;
  }
}
