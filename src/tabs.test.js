import { describe, it, expect } from 'vitest';
import { loadTabOrder, normalizeOrder, saveTabOrder, TAB_KEYS } from './tabs.js';

describe('tab order', () => {
  it('defaults to Baby, House, Me, Lists', () => {
    expect(TAB_KEYS).toEqual(['baby', 'house', 'mine', 'lists']);
    expect(normalizeOrder(null)).toEqual(TAB_KEYS);
  });
  it('repairs saved orders and round-trips', () => {
    expect(normalizeOrder(['lists', 'baby', 'bogus', 'baby'])).toEqual(['lists', 'baby', 'house', 'mine']);
    const m = new Map();
    const storage = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
    saveTabOrder(['mine', 'baby', 'house', 'lists'], storage);
    expect(loadTabOrder(storage)).toEqual(['mine', 'baby', 'house', 'lists']);
    expect(loadTabOrder({ getItem: () => '{bad json' })).toEqual(TAB_KEYS);
  });
});
