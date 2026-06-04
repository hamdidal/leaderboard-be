import { createHash } from 'node:crypto';

const FIXED_SHARES: Record<number, number> = {
  1: 0.2,
  2: 0.15,
  3: 0.1,
};

const RANKS_WEIGHTED_START = 4;
const RANKS_WEIGHTED_END = 100;
const WEIGHTED_POOL_SHARE = 0.55;

function sumWeights(): number {
  let total = 0;
  for (let r = RANKS_WEIGHTED_START; r <= RANKS_WEIGHTED_END; r++) {
    total += 101 - r;
  }
  return total;
}

const TOTAL_WEIGHT = sumWeights();

export function computeRewardAmounts(
  poolTotal: number,
  rankedUserIds: string[],
): Map<number, { userId: string; amount: number }> {
  const results = new Map<number, { userId: string; amount: number }>();
  const rawAmounts: { rank: number; userId: string; raw: number }[] = [];

  for (let rank = 1; rank <= Math.min(rankedUserIds.length, 100); rank++) {
    const userId = rankedUserIds[rank - 1];
    let raw: number;

    if (rank <= 3) {
      raw = poolTotal * (FIXED_SHARES[rank] ?? 0);
    } else {
      const w = 101 - rank;
      raw = poolTotal * WEIGHTED_POOL_SHARE * (w / TOTAL_WEIGHT);
    }

    rawAmounts.push({ rank, userId, raw });
  }

  let roundedSum = 0;
  const rounded: { rank: number; userId: string; amount: number }[] = [];

  for (const entry of rawAmounts) {
    const amount = Math.round(entry.raw * 100) / 100;
    rounded.push({ rank: entry.rank, userId: entry.userId, amount });
    roundedSum += amount;
  }

  const remainder = Math.round((poolTotal - roundedSum) * 100) / 100;
  if (rounded.length > 0 && remainder !== 0) {
    rounded[0].amount = Math.round((rounded[0].amount + remainder) * 100) / 100;
  }

  for (const r of rounded) {
    results.set(r.rank, { userId: r.userId, amount: r.amount });
  }

  return results;
}

export function distributionChecksum(
  weekId: string,
  entries: { userId: string; rank: number; amount: number }[],
  poolTotal: number,
): string {
  const payload = JSON.stringify({ weekId, poolTotal, entries });
  return createHash('sha256').update(payload).digest('hex');
}
