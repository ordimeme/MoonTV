/** @jest-environment node */

import { mapWithConcurrency } from '../async-utils';

describe('bounded async work', () => {
  it('preserves result order and never exceeds the concurrency limit', async () => {
    let active = 0;
    let peak = 0;
    const results = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active -= 1;
      return n * 2;
    });

    expect(results).toEqual([2, 4, 6, 8, 10]);
    expect(peak).toBe(2);
  });

  it('rejects an invalid limit', async () => {
    await expect(mapWithConcurrency([1], 0, async (n) => n)).rejects.toThrow(
      'positive integer'
    );
  });
});
