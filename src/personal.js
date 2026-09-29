// Every person in the family has one official personal list: their own to-dos
// and habits, which anyone can look at. It's a normal list marked
// `personal: true` with an `owner` name. It has its own tab on the owner's
// phone and is left off their Lists tab (everyone else sees it there).
import { iconToken } from './icons.js';
import { sameName } from './members.js';

export const personalListName = (name) => `${(name || '').trim()}’s todos`;

/** The owner's official list. If two phones ever made one each, the earliest wins. */
export function personalListFor(lists, name) {
  if (!name) return null;
  const mine = lists.filter((l) => !l.deleted && l.personal && sameName(l.owner, name));
  if (!mine.length) return null;
  return mine.reduce((a, b) => ((a.createdAt || 0) <= (b.createdAt || 0) ? a : b));
}

/** True for anyone's official personal list (these can't be deleted, only emptied). */
export function isOfficialPersonal(list, lists) {
  return !!(list && list.personal && personalListFor(lists, list.owner)?.id === list.id);
}

/**
 * Make sure `name` has an official list: adopt the "<name>’s todos" list new
 * families start with, or make one. Returns the list.
 */
export function ensurePersonalList(store, name) {
  const n = (name || '').trim();
  if (!n) return null;
  const lists = store.lists();
  const existing = personalListFor(lists, n);
  if (existing) return existing;
  const legacy = lists.find((l) => !l.personal && l.name === personalListName(n));
  if (legacy) return store.updateList(legacy.id, { personal: true, owner: n });
  return store.createList({ name: personalListName(n), emoji: iconToken('seedling'), createdBy: n, personal: true, owner: n });
}

/** Someone renamed themselves: their list follows, and so does its default name. */
export function renamePersonalList(store, oldName, newName) {
  const list = personalListFor(store.lists(), oldName);
  if (!list || sameName(oldName, newName)) return null;
  const changes = { owner: newName.trim() };
  if (list.name === personalListName(oldName)) changes.name = personalListName(newName);
  return store.updateList(list.id, changes);
}
