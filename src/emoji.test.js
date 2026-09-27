import { describe, it, expect } from 'vitest';
import { extractEmoji } from './emoji.js';

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
