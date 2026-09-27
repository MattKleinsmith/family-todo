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
