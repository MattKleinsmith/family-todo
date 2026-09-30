import { describe, it, expect } from 'vitest';
import { memberKey, peopleWithDevices } from './members.js';

const m = (id, name, device, joinedAt, leftAt = null) => ({ id, type: 'member', name, device, joinedAt, leftAt });

describe('peopleWithDevices', () => {
  it('one row per name, listing each kind of device once in join order', () => {
    const out = peopleWithDevices([
      m('a', 'Matthew', 'iPhone', 10),
      m('b', 'Huishi', 'iPhone', 20),
      m('c', 'Matthew', 'iPhone', 30),
      m('d', 'matthew ', 'Mac', 40),
      m('e', 'Huishi', 'Mac', 50, 60),
    ]);
    expect(out.map((p) => `${p.name}: ${p.devices.join(', ')}`)).toEqual(['Matthew: iPhone, Mac', 'Huishi: iPhone']);
    expect(out[0]).toMatchObject({ joinedAt: 10, leftAt: null });
  });
  it('is left only once every install has left, and keeps the devices they used', () => {
    expect(peopleWithDevices([m('a', 'H', 'iPhone', 1, 5), m('b', 'H', 'iPhone', 6)])[0].leftAt).toBeNull();
    expect(peopleWithDevices([m('a', 'H', 'iPhone', 1, 5), m('b', 'H', 'Mac', 6, 9)])[0]).toMatchObject({ leftAt: 9, devices: ['iPhone', 'Mac'] });
    expect(memberKey({ name: ' Hui ', device: 'iPhone' })).toBe(memberKey({ name: 'hui', device: 'iPhone' }));
  });
});

describe('familyNames', () => {
  it('lists each current person once, earliest first, however many phones they use', async () => {
    const { familyNames, sameName } = await import('./members.js');
    const ms = [
      m('a', 'Matthew', 'iPhone', 1),
      m('b', 'Huishi', 'iPhone', 2),
      m('c', 'matthew ', 'Mac', 3),
      m('d', 'Grandma', 'iPad', 4, 10), // left
      m('e', 'Huishi', 'iPad', 5, 9), // one of Huishi's installs left; she's still here
    ];
    expect(familyNames(ms)).toEqual(['Matthew', 'Huishi']);
    expect(familyNames(ms, ['Theo'])).toEqual(['Matthew', 'Huishi', 'Theo']);
    expect(familyNames(ms, ['HUISHI'])).toEqual(['Matthew', 'Huishi']);
    expect(familyNames([m('d', 'Grandma', 'iPad', 4, 10)], ['Grandma'])).toEqual(['Grandma']);
    expect(sameName(' Matthew', 'matthew')).toBe(true);
    expect(sameName(null, 'x')).toBe(false);
  });
});
