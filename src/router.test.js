import { describe, it, expect } from 'vitest';
import { parseRoute } from './router.js';

describe('parseRoute', () => {
  it('parses paths and the optional focus parameter', () => {
    expect(parseRoute('')).toEqual({ name: 'home' });
    expect(parseRoute('#/list/abc')).toEqual({ name: 'list', id: 'abc', focus: null });
    expect(parseRoute('#/list/abc?focus=i1')).toEqual({ name: 'list', id: 'abc', focus: 'i1' });
    expect(parseRoute('#/baby?focus=l1')).toEqual({ name: 'baby', focus: 'l1' });
    expect(parseRoute('#/settings')).toEqual({ name: 'settings' });
    expect(parseRoute('#/activity')).toEqual({ name: 'activity' });
    expect(parseRoute('#/join/some-code')).toEqual({ name: 'join', code: 'some-code' });
  });
});
