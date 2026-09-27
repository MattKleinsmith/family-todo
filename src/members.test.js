import { describe, it, expect } from 'vitest';
import { dedupeMembers, memberKey } from './members.js';

const m = (id, name, device, joinedAt, leftAt = null) => ({ id, type: 'member', name, device, joinedAt, leftAt });

describe('dedupeMembers', () => {
  it('merges the same name on the same kind of device, keeps different devices apart', () => {
    const out = dedupeMembers([
      m('a', 'Matthew', 'iPhone', 10),
      m('b', 'Huishi', 'iPhone', 20),
      m('c', 'Matthew', 'iPhone', 30),
      m('d', 'matthew ', 'iPhone', 40),
      m('e', 'Huishi', 'Mac', 50),
    ]);
    expect(out.map((x) => `${x.name} ${x.device}`)).toEqual(['Matthew iPhone', 'Huishi iPhone', 'Huishi Mac']);
    expect(out[0]).toMatchObject({ joinedAt: 10, installs: 3, leftAt: null });
  });
  it('is still in the family if any install is, and left only if all left', () => {
    expect(dedupeMembers([m('a', 'H', 'iPhone', 1, 5), m('b', 'H', 'iPhone', 6)])[0].leftAt).toBeNull();
    expect(dedupeMembers([m('a', 'H', 'iPhone', 1, 5), m('b', 'H', 'iPhone', 6, 9)])[0].leftAt).toBe(9);
    expect(memberKey({ name: ' Hui ', device: 'iPhone' })).toBe(memberKey({ name: 'hui', device: 'iPhone' }));
  });
});
