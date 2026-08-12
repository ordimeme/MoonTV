/** @jest-environment node */

import { buildMediaIdentityQuery, parseMediaIdentity } from '../media-identity';

describe('media identity transport', () => {
  it('uses separate query fields instead of an ambiguous plus key', () => {
    const query = buildMediaIdentityQuery('zy360', '71197');
    expect(query).toBe('source=zy360&id=71197');
    expect(
      parseMediaIdentity(Object.fromEntries(new URLSearchParams(query)))
    ).toEqual({ source: 'zy360', id: '71197' });
  });

  it('accepts legacy keys even after URLSearchParams decodes plus as space', () => {
    expect(parseMediaIdentity({ key: 'zy360+71197' })).toEqual({
      source: 'zy360',
      id: '71197',
    });
    expect(parseMediaIdentity({ key: 'zy360 71197' })).toEqual({
      source: 'zy360',
      id: '71197',
    });
  });

  it('rejects malformed or injected identities', () => {
    expect(parseMediaIdentity({ source: '../admin', id: '1' })).toBeNull();
    expect(parseMediaIdentity({ key: 'source+1+extra' })).toBeNull();
  });
});
