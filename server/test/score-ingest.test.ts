import { describe, expect, it } from 'vitest';
import { poolContributionForAmount } from '../src/modules/ingest/score-ingest.service';
import { POOL_CONTRIBUTION_RATE } from '../src/lib/redis-keys';

describe('poolContributionForAmount', () => {
  it('applies 2% pool rate from shared constant', () => {
    expect(POOL_CONTRIBUTION_RATE).toBe(0.02);
    expect(poolContributionForAmount(1000)).toBe(20);
    expect(poolContributionForAmount(33.33)).toBe(0.67);
  });
});
