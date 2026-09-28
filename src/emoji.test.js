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
  it('accepts keycaps, with or without the emoji variation selector', () => {
    expect(extractEmoji('1️⃣')).toBe('1️⃣');
    expect(extractEmoji('#️⃣')).toBe('#️⃣');
    expect(extractEmoji('*️⃣')).toBe('*️⃣');
    expect(extractEmoji('0\u20E3')).toBe('0️⃣');
    expect(extractEmoji('🔟')).toBe('🔟');
    expect(extractEmoji('day 2️⃣')).toBe('2️⃣');
  });
  it('ignores plain text', () => {
    expect(extractEmoji('milk')).toBeNull();
    expect(extractEmoji('1')).toBeNull();
    expect(extractEmoji('12 eggs #1')).toBeNull();
    expect(extractEmoji('')).toBeNull();
  });
});
