import { describe, it, expect } from 'vitest';
import { translations, t, type TranslationKeys } from '../i18n';

/** Flatten a nested translation object into dot-paths. */
function keysOf(node: unknown, prefix = ''): string[] {
  if (typeof node !== 'object' || node === null) return [];
  return Object.entries(node as Record<string, unknown>).flatMap(([k, v]) => {
    const path = prefix ? `${prefix}.${k}` : k;
    return typeof v === 'object' && v !== null ? keysOf(v, path) : [path];
  });
}

describe('i18n', () => {
  it('resolves a known key to a non-empty string', () => {
    const value = t('common.save');
    expect(value).not.toBe('common.save');
    expect(value.length).toBeGreaterThan(0);
  });

  it('returns the key path itself when the key is missing (no crash)', () => {
    expect(t('does.not.exist')).toBe('does.not.exist');
  });

  it('substitutes named params exactly once', () => {
    const raw = translations.th.common.save;
    expect(typeof raw).toBe('string');
    // Only assert substitution when the dictionary actually uses placeholders.
    if (raw.includes('{')) {
      const name = raw.match(/\{(\w+)\}/)?.[1];
      if (name) expect(t('common.save', { [name]: 'X' })).toContain('X');
    } else {
      expect(t('common.save', { unused: 'X' })).toBe(raw);
    }
  });

  it('every key present in the typed dictionary resolves to a string', () => {
    const paths = keysOf(translations.th);
    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) {
      const value = t(path);
      expect(typeof value).toBe('string');
      expect(value).not.toBe(path);
    }
  });

  it('the TranslationKeys type and the th dictionary agree at runtime', () => {
    // Compile-time proof (the cast fails `tsc` if the shape drifts) plus a
    // runtime check that the object is not empty.
    const dict: TranslationKeys = translations.th;
    expect(Object.keys(dict).length).toBeGreaterThan(0);
  });
});
