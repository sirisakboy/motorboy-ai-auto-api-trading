import { useEffect, useRef } from 'react';

/**
 * Shared modal behaviour.
 *
 * Every dialog in this app used to be mouse-only: no `role="dialog"`, no
 * `aria-modal`, no Escape handler, no scroll lock, no focus management. This
 * hook adds the baseline that screen-reader and keyboard users expect, and is
 * applied by every modal root:
 *
 *  - Escape closes the dialog (unless the caller opts out)
 *  - background scroll is locked, reference-counted so nested dialogs
 *    (e.g. a nested confirm sheet on top of another modal) do not unlock
 *    the page when the inner one closes
 *  - focus moves into the dialog on open and is returned to the trigger on close
 *  - Tab / Shift+Tab cycle inside the dialog instead of escaping to the page
 *
 * Usage:
 *   const dialogRef = useModalA11y({ onClose });
 *   <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="…">
 */

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

let scrollLockCount = 0;
let savedBodyOverflow = '';
let savedBodyPaddingRight = '';

function lockBackgroundScroll(): void {
  if (typeof document === 'undefined') return;
  if (scrollLockCount === 0) {
    const { body } = document;
    savedBodyOverflow = body.style.overflow;
    savedBodyPaddingRight = body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`;
  }
  scrollLockCount += 1;
}

function unlockBackgroundScroll(): void {
  if (typeof document === 'undefined') return;
  scrollLockCount = Math.max(0, scrollLockCount - 1);
  if (scrollLockCount === 0) {
    document.body.style.overflow = savedBodyOverflow;
    document.body.style.paddingRight = savedBodyPaddingRight;
  }
}

function focusableIn(node: HTMLElement): HTMLElement[] {
  return Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement
  );
}

export interface UseModalA11yOptions {
  /** Called on Escape and, for convenience, by the caller's backdrop handler. */
  onClose?: () => void;
  /** Set false to keep the listener/scroll-lock detached (e.g. conditional rendering). */
  enabled?: boolean;
  /** Escape is the expected default; opt out for destructive confirm sheets. */
  closeOnEscape?: boolean;
}

export function useModalA11y<T extends HTMLElement = HTMLDivElement>({
  onClose,
  enabled = true,
  closeOnEscape = true,
}: UseModalA11yOptions = {}): React.RefObject<T> {
  // `useRef<T>(null)` yields RefObject<T> on React 18 types and RefObject<T |
  // null> on React 19 types; the cast keeps this hook usable with both.
  const ref = useRef<T>(null) as React.MutableRefObject<T | null>;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!enabled || typeof document === 'undefined') return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    lockBackgroundScroll();

    // Defer so the dialog has mounted (and any autofocused input has run).
    const focusTimer = window.setTimeout(() => {
      const node = ref.current;
      if (!node) return;
      const [first] = focusableIn(node);
      (first ?? node).focus({ preventScroll: true });
    }, 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && closeOnEscape) {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current?.();
        return;
      }

      if (event.key !== 'Tab') return;
      const node = ref.current;
      if (!node) return;

      const focusable = focusableIn(node);
      if (focusable.length === 0) {
        event.preventDefault();
        node.focus({ preventScroll: true });
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (!event.shiftKey && (active === last || !node.contains(active))) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      } else if (event.shiftKey && (active === first || !node.contains(active))) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown, true);
      unlockBackgroundScroll();
      previouslyFocused?.focus?.({ preventScroll: true });
    };
  }, [enabled, closeOnEscape]);

  return ref as unknown as React.RefObject<T>;
}
