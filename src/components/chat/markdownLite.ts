/**
 * Tiny markdown parser for AI chat bubbles.
 *
 * We deliberately do NOT ship a full markdown engine and never use
 * `dangerouslySetInnerHTML`: the model output is untrusted text, so every token
 * is rendered as a React element instead of raw HTML. Supported syntax is the
 * small subset the chat prompt actually asks for:
 *   - "- " bullets, "1. " numbered steps
 *   - **bold**, `inline code`
 *   - ```fenced code```
 *   - "## " / "### " headings
 *   - bare https:// links (rendered with rel="noopener noreferrer")
 */

export type InlineToken =
  | { type: 'text'; value: string }
  | { type: 'bold'; value: string }
  | { type: 'code'; value: string }
  | { type: 'link'; value: string; href: string };

export type MdBlock =
  | { type: 'heading'; level: 2 | 3; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'bullets'; items: string[] }
  | { type: 'numbers'; items: string[] }
  | { type: 'code'; text: string };

const SAFE_HREF = /^(https?:\/\/|mailto:)/i;

export function parseInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  // **bold** | `code` | https://...  (code first so backticks win over bold)
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|https?:\/\/[^\s)<>"']+)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    }
    const raw = match[0];
    if (raw.startsWith('**')) {
      tokens.push({ type: 'bold', value: raw.slice(2, -2) });
    } else if (raw.startsWith('`')) {
      tokens.push({ type: 'code', value: raw.slice(1, -1) });
    } else if (SAFE_HREF.test(raw)) {
      tokens.push({ type: 'link', value: raw, href: raw });
    } else {
      tokens.push({ type: 'text', value: raw });
    }
    lastIndex = match.index + raw.length;
  }

  if (lastIndex < text.length) {
    tokens.push({ type: 'text', value: text.slice(lastIndex) });
  }

  return tokens.length > 0 ? tokens : [{ type: 'text', value: text }];
}

export function parseMarkdown(input: string): MdBlock[] {
  const lines = (input ?? '').replace(/\r\n/g, '\n').split('\n');
  const blocks: MdBlock[] = [];

  let paragraph: string[] = [];
  let bullets: string[] = [];
  let numbers: string[] = [];
  let code: string[] | null = null;

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ type: 'paragraph', text: paragraph.join(' ').trim() });
      paragraph = [];
    }
  };
  const flushBullets = () => {
    if (bullets.length > 0) {
      blocks.push({ type: 'bullets', items: [...bullets] });
      bullets = [];
    }
  };
  const flushNumbers = () => {
    if (numbers.length > 0) {
      blocks.push({ type: 'numbers', items: [...numbers] });
      numbers = [];
    }
  };
  const flushAll = () => {
    flushParagraph();
    flushBullets();
    flushNumbers();
  };

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (code !== null) {
      if (line.trim().startsWith('```')) {
        blocks.push({ type: 'code', text: code.join('\n') });
        code = null;
      } else {
        code.push(raw);
      }
      continue;
    }

    if (line.trim().startsWith('```')) {
      flushAll();
      code = [];
      continue;
    }

    if (!line.trim()) {
      flushAll();
      continue;
    }

    const heading = /^(#{2,3})\s+(.*)$/.exec(line.trim());
    if (heading) {
      flushAll();
      blocks.push({
        type: 'heading',
        level: heading[1].length === 2 ? 2 : 3,
        text: heading[2].trim(),
      });
      continue;
    }

    const bullet = /^[-•*]\s+(.*)$/.exec(line.trim());
    if (bullet) {
      flushParagraph();
      flushNumbers();
      bullets.push(bullet[1].trim());
      continue;
    }

    const numbered = /^(\d{1,2})[.)]\s+(.*)$/.exec(line.trim());
    if (numbered) {
      flushParagraph();
      flushBullets();
      numbers.push(numbered[2].trim());
      continue;
    }

    flushBullets();
    flushNumbers();
    paragraph.push(line.trim());
  }

  if (code !== null) blocks.push({ type: 'code', text: code.join('\n') });
  flushAll();

  return blocks;
}
