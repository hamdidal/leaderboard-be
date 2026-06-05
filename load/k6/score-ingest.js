import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://127.0.0.1:3001';
const INTERNAL_API_KEY = __ENV.INTERNAL_API_KEY || 'dev-internal-api-key-min-32-chars!!!';

export const options = {
  scenarios: {
    score_ingest: {
      executor: 'constant-arrival-rate',
      rate: 30,
      timeUnit: '1s',
      duration: '45s',
      preAllocatedVUs: 10,
      maxVUs: 40,
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.05'],
    'http_req_duration{endpoint:ingest}': ['p(95)<150'],
  },
};

let seq = 0;

export function setup() {
  const health = http.get(`${BASE_URL}/healthz`);
  check(health, { 'health ok': (r) => r.status === 200 });
}

export default function () {
  seq += 1;
  const userId = `k6-load-user-${__VU}-${seq % 500}`;
  const idempotencyKey = `k6-ingest-${__VU}-${String(__ITER).padStart(8, '0')}`;

  const res = http.post(
    `${BASE_URL}/api/internal/scores`,
    JSON.stringify({
      userId,
      amount: 10 + (seq % 50),
      idempotencyKey,
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Api-Key': INTERNAL_API_KEY,
      },
      tags: { endpoint: 'ingest' },
    },
  );

  check(res, {
    'ingest 2xx': (r) => r.status === 201 || r.status === 200,
  });

  sleep(0.05);
}
