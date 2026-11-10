import React from 'react';
import { parseInline, parseMarkdown } from './markdownLite';

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  return parseInline(text).map((token, index) => {
    const key = `${keyPrefix}-${index}`;
    switch (token.type) {
      case 'bold':
        return (
          <strong key={key} className="font-semibold text-[#ECEAF4]">
            {token.value}
          </strong>
        );
      case 'code':
        return (
          <code
            key={key}
            className="px-1 py-0.5 rounded-md bg-[#141725] border border-white/[0.07] font-mono text-[0.85em] text-[#A89FFF]"
          >
            {token.value}
          </code>
        );
      case 'link':
        return (
          <a
            key={key}
            href={token.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#4CC9F0] underline decoration-[#4CC9F0]/40 underline-offset-2 hover:decoration-[#4CC9F0]"
          >
            {token.value}
          </a>
        );
      default:
        return <React.Fragment key={key}>{token.value}</React.Fragment>;
    }
  });
}

/**
 * Renders the AI's answer as React elements (never raw HTML).
 * Calm System typography: Thai 1.7 line-height, body 14–15px, bullets with a
 * lavender dot, numbers with tabular figures.
 */
export const MarkdownLite: React.FC<{ text: string; className?: string }> = ({
  text,
  className = '',
}) => {
  const blocks = parseMarkdown(text);

  return (
    <div className={`space-y-2 text-[13px] sm:text-sm leading-[1.7] text-[#ECEAF4] ${className}`}>
      {blocks.map((block, index) => {
        const key = `b-${index}`;
        switch (block.type) {
          case 'heading':
            return (
              <h4
                key={key}
                className={
                  block.level === 2
                    ? 'text-sm font-semibold text-[#ECEAF4] pt-1'
                    : 'text-[13px] font-semibold text-[#A89FFF] pt-0.5'
                }
              >
                {renderInline(block.text, key)}
              </h4>
            );
          case 'bullets':
            return (
              <ul key={key} className="space-y-1.5">
                {block.items.map((item, i) => (
                  <li key={`${key}-${i}`} className="flex gap-2">
                    <span
                      aria-hidden="true"
                      className="mt-[0.55em] h-1.5 w-1.5 shrink-0 rounded-full bg-[#7C6CFF]"
                    />
                    <span className="min-w-0 flex-1">{renderInline(item, `${key}-${i}`)}</span>
                  </li>
                ))}
              </ul>
            );
          case 'numbers':
            return (
              <ol key={key} className="space-y-1.5">
                {block.items.map((item, i) => (
                  <li key={`${key}-${i}`} className="flex gap-2">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#7C6CFF]/15 text-[11px] font-semibold tabular-nums text-[#A89FFF]">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1">{renderInline(item, `${key}-${i}`)}</span>
                  </li>
                ))}
              </ol>
            );
          case 'code':
            return (
              <pre
                key={key}
                className="overflow-x-auto rounded-xl border border-white/[0.07] bg-[#141725] p-3 font-mono text-[12px] leading-relaxed text-[#ECEAF4]"
              >
                <code>{block.text}</code>
              </pre>
            );
          default:
            return (
              <p key={key} className="whitespace-pre-wrap break-words">
                {renderInline(block.text, key)}
              </p>
            );
        }
      })}
    </div>
  );
};
