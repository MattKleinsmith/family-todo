import { describe, it, expect } from 'vitest';
import table from './emoji-data.json';
import { searchEmoji, extractEmoji, SUGGESTED, pushRecent, loadRecent } from './emoji.js';

describe('emoji search', () => {
  it('finds by name and keyword, best matches first', () => {
    expect(searchEmoji(table, 'shopping').slice(0, 3)).toContain('🛒');
    expect(searchEmoji(table, 'cart')[0]).toBe('🛒');
    expect(searchEmoji(table, 'dog')).toContain('🐶');
    expect(searchEmoji(table, 'avocado')[0]).toBe('🥑');
    expect(searchEmoji(table, 'birthday cake')[0]).toBe('🎂');
  });
  it('returns nothing for an empty or unmatched query', () => {
    expect(searchEmoji(table, '')).toEqual([]);
    expect(searchEmoji(table, 'zzzzqqq')).toEqual([]);
  });
  it('respects the limit', () => {
    expect(searchEmoji(table, 'a', 10)).toHaveLength(10);
  });
  it('covers the full emoji set', () => {
    expect(table.length).toBeGreaterThan(1800);
    for (const e of SUGGESTED) expect(table.some(([x]) => x === e), e).toBe(true);
  });
});

describe('extractEmoji', () => {
  it('pulls the first emoji out of typed input', () => {
    expect(extractEmoji('🥑')).toBe('🥑');
    expect(extractEmoji('groceries 🛒 stuff')).toBe('🛒');
    expect(extractEmoji('👨‍👩‍👧‍👦')).toBe('👨‍👩‍👧‍👦');
    expect(extractEmoji('👍🏽')).toBe('👍🏽');
    expect(extractEmoji('🇺🇸')).toBe('🇺🇸');
  });
  it('ignores plain text', () => {
    expect(extractEmoji('milk')).toBeNull();
    expect(extractEmoji('')).toBeNull();
  });
});

describe('recent emoji', () => {
  it('keeps most recent first without duplicates', () => {
    const m = new Map();
    const storage = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
    pushRecent('🛒', storage);
    pushRecent('🐶', storage);
    pushRecent('🛒', storage);
    expect(loadRecent(storage)).toEqual(['🛒', '🐶']);
  });
});
