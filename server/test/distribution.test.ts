import { describe, it, expect } from 'vitest';
import { computeRewardAmounts } from '../src/modules/rewards/distribution';

describe('computeRewardAmounts', () => {
  it('distributes full pool with remainder on rank 1', () => {
    const poolTotal = 10000;
    const users = Array.from({ length: 100 }, (_, i) => `user-${i + 1}`);
    const rewards = computeRewardAmounts(poolTotal, users);

    let sum = 0;
    for (const [, { amount }] of rewards) {
      sum += amount;
    }

    expect(rewards.size).toBe(100);
    expect(Math.round(sum * 100) / 100).toBe(poolTotal);
    expect(rewards.get(1)?.amount).toBeGreaterThan(rewards.get(2)?.amount ?? 0);
    expect(rewards.get(2)?.amount).toBeGreaterThan(rewards.get(3)?.amount ?? 0);
  });

  it('assigns fixed shares for top 3 when full top 100 exists', () => {
    const poolTotal = 10000;
    const users = Array.from({ length: 100 }, (_, i) => `user-${i + 1}`);
    const rewards = computeRewardAmounts(poolTotal, users);

    expect(rewards.get(1)?.amount).toBeGreaterThanOrEqual(2000);
    expect(rewards.get(1)?.amount).toBeLessThanOrEqual(2000.02);
    expect(rewards.get(2)?.amount).toBe(1500);
    expect(rewards.get(3)?.amount).toBe(1000);
  });
});
