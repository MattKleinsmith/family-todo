import { describe, it, expect } from 'vitest';
import { viewKey } from './viewstate.js';

describe('viewKey', () => {
  it('names a screen by its route, without one-off extras', () => {
    expect(viewKey('')).toBe('/');
    expect(viewKey('#')).toBe('/');
    expect(viewKey('#/')).toBe('/');
    expect(viewKey('#/list/abc')).toBe('/list/abc');
    expect(viewKey('#/house?focus=starter-mow')).toBe('/house');
  });
});
