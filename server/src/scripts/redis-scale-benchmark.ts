import { config } from 'dotenv';
import path from 'path';
import { performance } from 'node:perf_hooks';
import Redis from 'ioredis';
import { RedisKeys } from '../lib/redis-keys';

config({ path: path.resolve(__dirname, '../../../.env') });

const ITERATIONS = Math.max(
  50,
  Number.parseInt(process.env.BENCHMARK_ITERATIONS ?? '200', 10) || 200,
);
const WARMUP = 20;
const BENCH_USER = 'scale-bench-user';

type BenchStats = {
  p50: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
};

function percentile(sorted: number[], p: number): number {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))];
}

async function bench(label: string, fn: () => Promise<void>): Promise<BenchStats> {
  for (let i = 0; i < WARMUP; i++) {
    await fn();
  }

  const times: number[] = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const start = performance.now();
    await fn();
    times.push(performance.now() - start);
  }

  times.sort((a, b) => a - b);
  const stats: BenchStats = {
    p50: percentile(times, 50),
    p95: percentile(times, 95),
    p99: percentile(times, 99),
    min: times[0],
    max: times[times.length - 1],
  };

  console.log(
    `  ${label.padEnd(28)} p50=${stats.p50.toFixed(2)}ms  p95=${stats.p95.toFixed(2)}ms  p99=${stats.p99.toFixed(2)}ms`,
  );
  return stats;
}

function passLabel(actual: number, thresholdMs: number): string {
  return actual <= thresholdMs ? 'PASS' : 'WARN';
}

async function main(): Promise<void> {
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');

  try {
    const weekId = await redis.get(RedisKeys.currentWeek());
    if (!weekId) {
      console.error('No active week in Redis. Run: npm run seed');
      process.exit(1);
    }

    const lbKey = RedisKeys.weekLeaderboard(weekId);
    const totalPlayers = await redis.zcard(lbKey);

    if (totalPlayers < 100) {
      console.error(`Only ${totalPlayers} players in ZSET. Run: npm run seed`);
      process.exit(1);
    }

    const midIndex = Math.floor(totalPlayers / 2);
    const tailIndex = totalPlayers - 1;

    const [topMember, midMember, tailMember] = await Promise.all([
      redis.zrevrange(lbKey, 0, 0),
      redis.zrevrange(lbKey, midIndex, midIndex),
      redis.zrevrange(lbKey, tailIndex, tailIndex),
    ]);

    const rank1User = topMember[0];
    const midUser = midMember[0];
    const tailUser = tailMember[0];

    if (!rank1User || !midUser || !tailUser) {
      console.error('Could not sample players from leaderboard ZSET.');
      process.exit(1);
    }

    const log2N = Math.log2(totalPlayers);

    console.log('');
    console.log('--- Redis scale benchmark (O(log N) hot path) ---');
    console.log(`Week:           ${weekId}`);
    console.log(`ZSET members:   ${totalPlayers.toLocaleString()} (N)`);
    console.log(`log₂(N):        ${log2N.toFixed(1)} ops (theoretical ZSET depth)`);
    console.log(`Iterations:     ${ITERATIONS} per operation (+${WARMUP} warmup)`);
    console.log('');
    console.log('Latency (local Redis; thresholds are conservative):');

    const rank1 = await bench('ZREVRANK rank #1', () =>
      redis.zrevrank(lbKey, rank1User).then(() => {}),
    );
    const rankMid = await bench('ZREVRANK rank ~N/2', () =>
      redis.zrevrank(lbKey, midUser).then(() => {}),
    );
    const rankTail = await bench('ZREVRANK rank ~N', () =>
      redis.zrevrank(lbKey, tailUser).then(() => {}),
    );
    const top100 = await bench('ZREVRANGE top 100', () =>
      redis.zrevrange(lbKey, 0, 99, 'WITHSCORES').then(() => {}),
    );

    const zeroMid = midIndex;
    const hoodStart = Math.max(0, zeroMid - 3);
    const hoodEnd = zeroMid + 2;
    const neighborhood = await bench('ZREVRANGE neighborhood', () =>
      redis.zrevrange(lbKey, hoodStart, hoodEnd, 'WITHSCORES').then(() => {}),
    );

    await redis.zadd(lbKey, 1, BENCH_USER);
    const zincrby = await bench('ZINCRBY (+10 score)', async () => {
      await redis.zincrby(lbKey, 10, BENCH_USER);
    });
    await redis.zincrby(lbKey, -10, BENCH_USER);
    await redis.zrem(lbKey, BENCH_USER);

    console.log('');
    console.log('Summary:');
    console.log(
      `  ZREVRANK (worst of 3)  ${passLabel(Math.max(rank1.p95, rankMid.p95, rankTail.p95), 10)}  (p95 ≤ 10ms)`,
    );
    console.log(`  ZREVRANGE top 100      ${passLabel(top100.p95, 15)}  (p95 ≤ 15ms)`);
    console.log(`  ZREVRANGE neighborhood ${passLabel(neighborhood.p95, 15)}  (p95 ≤ 15ms)`);
    console.log(`  ZINCRBY                ${passLabel(zincrby.p95, 10)}  (p95 ≤ 10ms)`);
    console.log('');
    console.log(
      'At 2M–10M N, log₂(N) grows by only ~4 ops vs 50K — rank latency stays sub-ms on Redis.',
    );
    console.log('Re-run after larger seed: SEED_USER_COUNT=200000 npm run seed');
    console.log('');
  } finally {
    await redis.quit();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
