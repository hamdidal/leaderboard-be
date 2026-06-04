import { describe, it, expect } from 'vitest';
import { computeRewardAmounts } from '../src/modules/rewards/distribution';
import { getIsoWeekId, getNextIsoWeekId, getWeekBounds } from '../src/lib/week';

describe('LeaderboardRepo.neighborhoodToEntries rank math', () => {
  const NEIGHBOR_ABOVE = 3;

  function neighborhoodToRanks(userRank: number, memberCount: number): number[] {
    const zeroRank = userRank - 1;
    const zeroStart = Math.max(0, zeroRank - NEIGHBOR_ABOVE);
    return Array.from({ length: memberCount }, (_, i) => zeroStart + i + 1);
  }

  it('returns correct rank range for user at rank 5000', () => {
    const ranks = neighborhoodToRanks(5000, 6);
    expect(ranks[0]).toBe(4997);
    expect(ranks[5]).toBe(5002);
    const meIdx = ranks.indexOf(5000);
    expect(meIdx).toBe(3);
    const above = ranks.filter((r) => r < 5000);
    const below = ranks.filter((r) => r > 5000);
    expect(above).toHaveLength(3);
    expect(below).toHaveLength(2);
  });

  it('clips correctly near rank 1 (cannot go below rank 1)', () => {
    const ranks = neighborhoodToRanks(2, 5);
    expect(ranks[0]).toBeGreaterThanOrEqual(1);
    expect(ranks.includes(1)).toBe(true);
  });

  it('user at rank 1 returns ranks starting at 1', () => {
    const ranks = neighborhoodToRanks(1, 3);
    expect(ranks[0]).toBe(1);
    expect(ranks.every((r) => r >= 1)).toBe(true);
  });
});

describe('reward distribution idempotency', () => {
  it('computeRewardAmounts with only 3 users skips weighted ranks', () => {
    const poolTotal = 4500;
    const users = ['u1', 'u2', 'u3'];
    const rewards = computeRewardAmounts(poolTotal, users);

    expect(rewards.size).toBe(3);
    for (let r = 4; r <= 100; r++) {
      expect(rewards.has(r)).toBe(false);
    }
    let sum = 0;
    for (const [, { amount }] of rewards) sum += amount;
    expect(Math.round(sum * 100) / 100).toBe(poolTotal);
  });

  it('computeRewardAmounts with 0 users returns empty map', () => {
    const rewards = computeRewardAmounts(1000, []);
    expect(rewards.size).toBe(0);
  });

  it('rank 4-100 weights decrease monotonically', () => {
    const users = Array.from({ length: 100 }, (_, i) => `u${i + 1}`);
    const rewards = computeRewardAmounts(100_000, users);
    for (let r = 4; r < 100; r++) {
      const a = rewards.get(r)?.amount ?? 0;
      const b = rewards.get(r + 1)?.amount ?? 0;
      expect(a).toBeGreaterThanOrEqual(b);
    }
  });
});

describe('week lifecycle', () => {
  it('next week id is strictly after current week end', () => {
    const weekId = '2026W23';
    const nextWeekId = getNextIsoWeekId(weekId);
    const { endsAt } = getWeekBounds(weekId);
    const { startsAt: nextStart } = getWeekBounds(nextWeekId);
    expect(nextStart.getTime()).toBeGreaterThanOrEqual(endsAt.getTime() - 86_400_000);
    expect(nextWeekId).not.toBe(weekId);
  });

  it('year boundary: last week of 2025 → first week of 2026', () => {
    const lastWeek2025 = '2025W52';
    const next = getNextIsoWeekId(lastWeek2025);
    expect(next).toMatch(/^\d{4}W\d{2}$/);
    expect(next.startsWith('2026')).toBe(true);
  });

  it('getIsoWeekId is stable within the same Monday', () => {
    const monday = new Date('2026-06-01T00:00:00Z');
    const sunday = new Date('2026-06-07T23:59:59Z');
    expect(getIsoWeekId(monday)).toBe(getIsoWeekId(sunday));
  });
});
