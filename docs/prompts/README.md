# Mascot UI Prompts (English)

Copy-paste prompts for building an **AI mascot overlay** in another project.
These are distilled from this repository's `src/components/MascotOverlay.tsx`
and deliberately cover **presentation only** — no analysis, no decision logic,
no API calls.

| File | Use it for |
| --- | --- |
| [`mascot-ui-prompt-A.txt`](./mascot-ui-prompt-A.txt) | Full build spec for an AI coding assistant (component structure, sizes, states, a11y, motion, tokens) |
| [`mascot-art-prompt-B.txt`](./mascot-art-prompt-B.txt) | Image models: one hero render, a consistent 6-pose set, expression headshots, negative prompt |
| [`mascot-ui-prompt-C-short.txt`](./mascot-ui-prompt-C-short.txt) | One-paragraph version for quick chats |

Thai version: [`../MASCOT-UI-PROMPT.md`](../MASCOT-UI-PROMPT.md)

## How to use

1. Replace `{{PROJECT_NAME}}`, `{{MASCOT_NAME}}` and `{{BRAND}}` (hex token).
2. Paste Prompt A into the assistant that will write the code.
3. Generate the character with Prompt B, drop the transparent PNG into `public/`,
   and point the component at it.
4. Review every state on the demo page before wiring real data.

## Reference values (taken from the shipped component)

| Item | Value |
| --- | --- |
| Default anchor | `right: 12px + safe-area` · `bottom: 12px + safe-area` |
| Character height | idle 190px · active 220px · minimized 88px |
| Bubble | 232px (sm: 264px) · radius 20px · padding 12px · backdrop-blur |
| Bubble tail | 10px square rotated 45° |
| Status dot | 16px circle, bottom-right of the character, 9px emoji, `animate-pulse` when critical |
| Float animation | `translateY(0 → -5px)`, 7s infinite, `cubic-bezier(0.22, 0.8, 0.3, 1)` |
| Type scale | header 10px uppercase · message 11px · stat numbers 10px mono · buttons 10px |
| Grid | 8px (8 / 12 / 16 / 24 / 32) |
| Accent | normal `#7C6CFF` · warning `#FFB86B` · critical `#F4A6A6` |
| Quiet pill | `bg-black/70` + blur · 10px mono · radius 999px |

## Acceptance checklist

- [ ] Only one mascot on screen; it never covers primary content (draggable + hideable)
- [ ] Every state is reachable from the demo page without a backend
- [ ] Full keyboard support (focus, open, move) and a descriptive `aria-label`
- [ ] Colour never the only carrier of meaning — text or icon always accompanies it
- [ ] All motion disabled under `prefers-reduced-motion`
- [ ] Bubble never overflows the viewport on mobile
- [ ] No business logic or network calls inside the UI components
