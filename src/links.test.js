import { describe, it, expect } from 'vitest';
import { linkLabel, normalizeLink, safeLink } from './links.js';
import { createStore } from './store.js';
import { describeChange } from './activity.js';

describe('links', () => {
  it('takes what people paste or type, and only web links', () => {
    expect(normalizeLink(' https://docs.google.com/forms/d/e/abc/viewform ')).toBe('https://docs.google.com/forms/d/e/abc/viewform');
    expect(normalizeLink('forms.gle/AbC123')).toBe('https://forms.gle/AbC123');
    expect(normalizeLink('http://example.com')).toBe('http://example.com/');
    expect(normalizeLink('')).toBeNull();
    expect(normalizeLink('not a link')).toBeNull();
    expect(normalizeLink('javascript:alert(1)')).toBeNull();
    expect(normalizeLink('data:text/html,hi')).toBeNull();
    expect(safeLink(42)).toBeNull();
    expect(linkLabel('https://www.example.com/x')).toBe('example.com');
  });

  it('a link travels with an item when it starts or stops repeating', () => {
    const store = createStore({});
    const L = store.createList({ name: 'Me' });
    const item = store.addItem({ listId: L.id, text: 'Daily form' });
    store.updateItem(item.id, { link: 'https://forms.gle/x' });
    const chore = store.repeatItem(item.id, { cadence: 'daily', days: [1, 2, 3, 4, 5] });
    expect(chore.link).toBe('https://forms.gle/x');
    const back = store.stopRepeating(chore.id);
    expect(back.link).toBe('https://forms.gle/x');
    expect(store.addChore({ name: 'Pay rent', cadence: 'monthly', link: 'bank.example.com' }).link).toBe('https://bank.example.com/');
    expect(store.addChore({ name: 'Nap', cadence: 'daily', link: 'javascript:x' }).link).toBeUndefined();
  });

  it('says so in the activity feed', () => {
    const item = { id: 'i', type: 'item', listId: 'l', text: 'Daily form', updatedAt: 1 };
    const chore = { id: 'c', type: 'chore', name: 'Daily form', cadence: 'daily', done: [], updatedAt: 1 };
    const ctx = { listName: () => 'Me' };
    expect(describeChange(item, { ...item, link: 'https://docs.google.com/forms/x', updatedAt: 2 }, ctx)).toBe('added a link to “Daily form” (docs.google.com) in Me');
    expect(describeChange(chore, { ...chore, link: 'https://forms.gle/x', updatedAt: 2 }, ctx)).toBe('added a link to “Daily form” (forms.gle)');
    expect(describeChange({ ...chore, link: 'https://forms.gle/x' }, { ...chore, link: 'https://forms.gle/y', updatedAt: 2 }, ctx)).toBe('changed the link on “Daily form” (forms.gle)');
    expect(describeChange({ ...chore, link: 'https://forms.gle/x' }, { ...chore, link: null, updatedAt: 2 }, ctx)).toBe('removed the link from “Daily form”');
  });
});
