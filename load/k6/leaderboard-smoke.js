import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://127.0.0.1:3001';
const DEMO_USER_ID = __ENV.DEMO_USER_ID || 'demo-user';

export const options = {
  scenarios: {
    leaderboard_reads: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 5 },
        { duration: '25s', target: 10 },
        { duration: '10s', target: 0 },
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
  },
};

export function setup() {
  const health = http.get(`${BASE_URL}/healthz`, { tags: { endpoint: 'health' } });
  if (health.status !== 200) {
    throw new Error(`API not healthy at ${BASE_URL} (status ${health.status})`);
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

  return { token: tokenRes.json('token') };
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

  sleep(0.85);
}

export function handleSummary(data) {
  const p95Top =
    data.metrics['http_req_duration{endpoint:top}']?.values?.['p(95)'] ??
    data.metrics.http_req_duration?.values?.['p(95)'];
  const p95Me = data.metrics['http_req_duration{endpoint:me}']?.values?.['p(95)'];

  return {
    stdout: [
      '',
      '--- k6 leaderboard smoke ---',
      `BASE_URL: ${BASE_URL}`,
      `http_req_failed: ${((data.metrics.http_req_failed?.values?.rate ?? 0) * 100).toFixed(2)}%`,
      p95Top != null ? `p95 top: ${p95Top.toFixed(1)}ms` : '',
      p95Me != null ? `p95 me: ${p95Me.toFixed(1)}ms` : '',
      '',
    ].join('\n'),
  };
}
