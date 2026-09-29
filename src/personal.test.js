import { describe, it, expect } from 'vitest';
import { createStore } from './store.js';
import { ensurePersonalList, isOfficialPersonal, personalListFor, renamePersonalList } from './personal.js';

describe('personal lists', () => {
  it('adopts the list a new family starts with, or makes one', () => {
    const store = createStore({ storage: null });
    store.createList({ name: 'Groceries' });
    const todos = store.createList({ name: 'Matthew’s todos' });
    const mine = ensurePersonalList(store, 'Matthew');
    expect(mine.id).toBe(todos.id);
    expect(mine).toMatchObject({ personal: true, owner: 'Matthew' });
    expect(ensurePersonalList(store, 'matthew').id).toBe(todos.id); // already there, any case
    const hers = ensurePersonalList(store, 'Huishi');
    expect(hers).toMatchObject({ name: 'Huishi’s todos', personal: true, owner: 'Huishi' });
    expect(store.lists()).toHaveLength(3);
  });
  it('the earliest wins if two were made, and only that one is official', () => {
    let t = 1000;
    const store = createStore({ storage: null, now: () => t++ });
    const a = store.createList({ name: 'Huishi’s todos', personal: true, owner: 'Huishi' });
    const b = store.createList({ name: 'Huishi’s list', personal: true, owner: 'Huishi' });
    expect(personalListFor(store.lists(), 'Huishi').id).toBe(a.id);
    expect(isOfficialPersonal(a, store.lists())).toBe(true);
    expect(isOfficialPersonal(b, store.lists())).toBe(false);
  });
  it('follows a rename', () => {
    const store = createStore({ storage: null });
    const l = ensurePersonalList(store, 'Huishi');
    renamePersonalList(store, 'Huishi', 'Hui');
    expect(store.getEntity('list', l.id)).toMatchObject({ owner: 'Hui', name: 'Hui’s todos' });
    store.updateList(l.id, { name: 'Reading & Chinese' });
    renamePersonalList(store, 'Hui', 'Huishi');
    expect(store.getEntity('list', l.id)).toMatchObject({ owner: 'Huishi', name: 'Reading & Chinese' }); // a chosen name stays
  });
});
