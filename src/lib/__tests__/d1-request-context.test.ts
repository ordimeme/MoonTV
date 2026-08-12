/** @jest-environment node */

import { getCloudflareBinding } from '../cloudflare-context';
import { D1Storage } from '../d1.db';

jest.mock('../cloudflare-context', () => ({
  getCloudflareBinding: jest.fn(),
}));

describe('D1 request context isolation', () => {
  it('resolves the D1 binding for every operation instead of caching one request', async () => {
    const makeDatabase = () => ({
      prepare: jest.fn(() => ({
        bind: jest.fn(() => ({
          all: jest.fn(async () => ({ results: [], success: true })),
        })),
      })),
    });
    const first = makeDatabase();
    const second = makeDatabase();
    const binding = getCloudflareBinding as jest.MockedFunction<
      typeof getCloudflareBinding
    >;
    binding.mockResolvedValueOnce(first).mockResolvedValueOnce(second);

    const storage = new D1Storage();
    await storage.getAllFavorites('henry');
    await storage.getAllFavorites('henry');

    expect(binding).toHaveBeenCalledTimes(2);
    expect(first.prepare).toHaveBeenCalledTimes(1);
    expect(second.prepare).toHaveBeenCalledTimes(1);
  });
});
