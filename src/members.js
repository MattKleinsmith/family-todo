// Family members as people see them. Every install of the app is its own
// member record (iOS gives each home-screen app fresh storage, so deleting and
// re-adding it looks like a new phone), and the same person may use a phone
// and a laptop. People are told apart by name: the same name is the same
// person, whatever device.

export function memberKey(m) {
  return `${(m.name || '').trim().toLowerCase()}|${m.device || ''}`;
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

/**
 * One entry per person (same name = same person), with the kinds of device
 * they use in the order they joined on them: "iPhone, Mac". Devices that have
 * left are dropped; someone whose every install has left is kept, marked
 * `leftAt`, with the devices they used.
 */
export function peopleWithDevices(members) {
  const people = new Map();
  for (const m of [...members].sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0))) {
    const name = (m.name || '').trim();
    const key = name.toLowerCase();
    let p = people.get(key);
    if (!p) people.set(key, (p = { key, name: name || 'Unnamed', joinedAt: m.joinedAt || null, leftAt: null, active: [], all: [] }));
    const device = m.device || 'device';
    if (!p.all.includes(device)) p.all.push(device);
    if (!m.leftAt && !p.active.includes(device)) p.active.push(device);
    if (m.leftAt) p.leftAt = Math.max(p.leftAt || 0, m.leftAt);
  }
  return [...people.values()].map(({ active, all, ...p }) => ({ ...p, leftAt: active.length ? null : p.leftAt, devices: active.length ? active : all }));
}
