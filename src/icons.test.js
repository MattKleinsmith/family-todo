import { describe, it, expect } from 'vitest';
import { ICONS, iconToken, isIconToken, iconId, iconToText, iconName } from './icons.js';

describe('themed icons', () => {
  it('has a curated set with unique ids', () => {
    expect(ICONS.length).toBeGreaterThan(50);
    expect(new Set(ICONS.map((i) => i.id)).size).toBe(ICONS.length);
  });
  it('round-trips tokens and falls back to the matching emoji as text', () => {
    const t = iconToken('seedling');
    expect(t).toBe('icon:seedling');
    expect(isIconToken(t)).toBe(true);
    expect(iconId(t)).toBe('seedling');
    expect(iconToText(t)).toBe('🌱');
    expect(iconName(t)).toBe('Sapling');
  });
  it('leaves plain emoji alone and rejects unknown tokens', () => {
    expect(isIconToken('🥑')).toBe(false);
    expect(isIconToken('icon:nope')).toBe(false);
    expect(iconToText('🥑')).toBe('🥑');
    expect(iconToText('')).toBe('');
  });
});
