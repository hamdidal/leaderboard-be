import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://127.0.0.1:3001';
const DEMO_USER_ID = __ENV.DEMO_USER_ID || 'demo-user';

function resolveCaseMeta() {
  const envPlayers = Number(__ENV.CASE_TOTAL_PLAYERS);
  const envWeek = __ENV.CASE_WEEK_ID;
  return {
    totalPlayers: Number.isFinite(envPlayers) && envPlayers > 0 ? envPlayers : 0,
    weekId: envWeek && envWeek.length > 0 ? envWeek : '?',
  };
}

export const options = {
  scenarios: {
    case_leaderboard_reads: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '15s', target: 3 },
        { duration: '30s', target: 5 },
        { duration: '15s', target: 0 },
      ],
      gracefulRampDown: '5s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.05'],
    'http_req_duration{endpoint:health}': ['p(95)<100'],
    'http_req_duration{endpoint:top}': ['p(95)<250'],
    'http_req_duration{endpoint:me}': ['p(95)<350'],
    'http_req_duration{endpoint:pool}': ['p(95)<150'],
    'http_req_duration{endpoint:week}': ['p(95)<150'],
  },
};

export function setup() {
  const health = http.get(`${BASE_URL}/healthz`, { tags: { endpoint: 'health' } });
  if (health.status !== 200) {
    throw new Error(`API not healthy at ${BASE_URL} (status ${health.status})`);
  }

  const weekRes = http.get(`${BASE_URL}/api/week/current`, { tags: { endpoint: 'week' } });
  check(weekRes, { 'week 200': (r) => r.status === 200 });

  const weekBody = weekRes.json();
  const totalPlayers = weekBody?.totalPlayers ?? 0;
  const weekId = weekBody?.weekId ?? '?';
  if (totalPlayers < 100) {
    throw new Error('totalPlayers < 100 — run npm run seed before load test');
  }

  const tokenRes = http.post(
    `${BASE_URL}/api/auth/demo-token`,
    JSON.stringify({ userId: DEMO_USER_ID }),
    { headers: { 'Content-Type': 'application/json' }, tags: { endpoint: 'auth' } },
  );

  check(tokenRes, {
    'demo token issued': (r) => r.status === 200 && r.json('token'),
  });

  if (!tokenRes.json('token')) {
    throw new Error('Failed to obtain demo JWT — is NODE_ENV=development and seed done?');
  }

  return {
    token: tokenRes.json('token'),
    totalPlayers,
    weekId,
  };
}

export default function (data) {
  const topRes = http.get(`${BASE_URL}/api/leaderboard/top`, {
    tags: { endpoint: 'top' },
  });
  check(topRes, {
    'top 200': (r) => r.status === 200,
    'top has entries': (r) => {
      const body = r.json();
      return Array.isArray(body.entries) && body.entries.length > 0;
    },
  });

  const poolRes = http.get(`${BASE_URL}/api/pool`, { tags: { endpoint: 'pool' } });
  check(poolRes, { 'pool 200': (r) => r.status === 200 });

  const meRes = http.get(`${BASE_URL}/api/leaderboard/me`, {
    headers: { Authorization: `Bearer ${data.token}` },
    tags: { endpoint: 'me' },
  });
  check(meRes, {
    'me 200': (r) => r.status === 200,
    'me has neighbors': (r) => {
      const body = r.json();
      return body.me != null && Array.isArray(body.neighbors);
    },
  });

  sleep(1.25);
}

export function handleSummary(data) {
  const failedRate = (data.metrics.http_req_failed?.values?.rate ?? 0) * 100;
  const p95Top = data.metrics['http_req_duration{endpoint:top}']?.values?.['p(95)'];
  const p95Me = data.metrics['http_req_duration{endpoint:me}']?.values?.['p(95)'];
  const p95Pool = data.metrics['http_req_duration{endpoint:pool}']?.values?.['p(95)'];
  const meta = resolveCaseMeta();
  const totalPlayers = meta.totalPlayers > 0 ? meta.totalPlayers : '?';
  const weekId = meta.weekId;
  const log2N =
    typeof totalPlayers === 'number' && totalPlayers > 0 ? Math.log2(totalPlayers).toFixed(1) : '?';

  const topPass = p95Top != null && p95Top < 250;
  const mePass = p95Me != null && p95Me < 350;
  const failPass = failedRate < 5;

  return {
    stdout: [
      '',
      '=== Case reviewer — API read load (k6) ===',
      `BASE_URL:       ${BASE_URL}`,
      `Week:           ${weekId}`,
      `totalPlayers:   ${typeof totalPlayers === 'number' ? totalPlayers.toLocaleString() : totalPlayers} (Redis ZCARD)`,
      `log₂(N):         ${log2N}`,
      `http_req_failed: ${failedRate.toFixed(2)}%  ${failPass ? 'PASS' : 'FAIL'} (target <5%)`,
      p95Top != null
        ? `p95 /top:        ${p95Top.toFixed(1)}ms  ${topPass ? 'PASS' : 'FAIL'} (target <250ms)`
        : '',
      p95Me != null
        ? `p95 /me:         ${p95Me.toFixed(1)}ms  ${mePass ? 'PASS' : 'FAIL'} (target <350ms)`
        : '',
      p95Pool != null ? `p95 /pool:       ${p95Pool.toFixed(1)}ms` : '',
      '',
      'This simulates concurrent leaderboard reads, not 2M simultaneous users.',
      '2M DAU ≈ batched earns + moderate read peaks — see docs/SCALE-TESTING.md',
      '',
    ]
      .filter(Boolean)
      .join('\n'),
  };
}
