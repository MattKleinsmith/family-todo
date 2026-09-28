// Family members as people see them. Every install of the app is its own
// member record (iOS gives each home-screen app fresh storage, so deleting and
// re-adding it looks like a new phone), and a browser can't tell two installs
// on the same phone apart. So records with the same name and device type are
// shown as one member.

export function memberKey(m) {
  return `${(m.name || '').trim().toLowerCase()}|${m.device || ''}`;
}

/** One entry per name + device type: earliest join, and still in the family if any install is. */
export function dedupeMembers(members) {
  const groups = new Map();
  for (const m of members) {
    const key = memberKey(m);
    const g = groups.get(key);
    if (!g) {
      groups.set(key, { ...m, installs: 1 });
      continue;
    }
    g.installs++;
    if ((m.joinedAt || Infinity) < (g.joinedAt || Infinity)) g.joinedAt = m.joinedAt;
    if (!m.leftAt) g.leftAt = null;
    else if (g.leftAt) g.leftAt = Math.max(g.leftAt, m.leftAt);
  }
  return [...groups.values()].sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
}

/**
 * The people in the family, by name, for things like choosing who owns a
 * chore: one entry per name (however many phones they use), earliest to
 * join first, leaving out anyone whose every install has left. `always`
 * names (like your own) are included even before a member record exists.
 */
export function familyNames(members, always = []) {
  const byKey = new Map();
  for (const m of [...members].sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0))) {
    const name = (m.name || '').trim();
    if (!name) continue;
    const key = name.toLowerCase();
    const cur = byKey.get(key);
    if (!cur) byKey.set(key, { name, active: !m.leftAt });
    else if (!m.leftAt) cur.active = true;
  }
  for (const n of always) {
    const name = (n || '').trim();
    if (name && !byKey.has(name.toLowerCase())) byKey.set(name.toLowerCase(), { name, active: true });
    else if (name) byKey.get(name.toLowerCase()).active = true;
  }
  return [...byKey.values()].filter((p) => p.active).map((p) => p.name);
}

/** Same person? Names are compared ignoring case and surrounding spaces. */
export function sameName(a, b) {
  return !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
}
