#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_URL="${BASE_URL:-http://127.0.0.1:3001}"
SKIP_INGEST="${SKIP_INGEST:-0}"

echo ""
echo "=== Muscle Land — Case scale test ==="
echo "Target: ${BASE_URL}"
echo ""

if ! curl -sf "${BASE_URL}/healthz" > /dev/null; then
  echo "ERROR: API not running at ${BASE_URL}"
  echo "  npm run dev -w server"
  exit 1
fi

WEEK_JSON="$(curl -sf "${BASE_URL}/api/week/current" 2>/dev/null || true)"
if [ -n "${WEEK_JSON}" ]; then
  echo "${WEEK_JSON}" | node -e "
    const d = JSON.parse(require('fs').readFileSync(0, 'utf8'));
    console.log('Active week: ' + d.weekId + ' — ' + d.totalPlayers.toLocaleString() + ' players in Redis ZSET');
  "
else
  echo "WARN: Could not read /api/week/current — run: npm run seed"
fi

echo ""
echo "--- Step 1/3: Redis O(log N) benchmark ---"
(cd "${ROOT}" && npm run benchmark:redis -w server)

echo ""
echo "--- Step 2/3: API read load (k6) ---"
if ! command -v k6 >/dev/null 2>&1; then
  echo "ERROR: k6 not installed."
  echo "  macOS: brew install k6"
  echo "  Docs:  https://grafana.com/docs/k6/latest/set-up/install-k6/"
  exit 1
fi
if [ -n "${WEEK_JSON}" ]; then
  export CASE_WEEK_ID="$(node -e "console.log(JSON.parse(process.argv[1]).weekId)" "${WEEK_JSON}")"
  export CASE_TOTAL_PLAYERS="$(node -e "console.log(JSON.parse(process.argv[1]).totalPlayers)" "${WEEK_JSON}")"
fi

set +e
BASE_URL="${BASE_URL}" bash "${ROOT}/load/run-k6-case.sh"
K6_READ_EXIT=$?
set -e

if [ "${K6_READ_EXIT}" -ne 0 ]; then
  echo "WARN: k6 read thresholds not met (exit ${K6_READ_EXIT}) — often 429 rate limit; see docs/SCALE-TESTING.md"
fi

if [ "${SKIP_INGEST}" = "1" ]; then
  echo ""
  echo "--- Step 3/3: Score ingest — skipped (SKIP_INGEST=1) ---"
else
  echo ""
  echo "--- Step 3/3: Score ingest load (k6, ~30 events/s) ---"
  set +e
  BASE_URL="${BASE_URL}" k6 run "${ROOT}/load/k6/score-ingest.js"
  K6_INGEST_EXIT=$?
  set -e
  if [ "${K6_INGEST_EXIT}" -ne 0 ]; then
    echo "WARN: k6 ingest thresholds not met (exit ${K6_INGEST_EXIT})"
  fi
fi

echo ""
echo "=== Case scale test complete ==="
echo "Interpretation: docs/SCALE-TESTING.md"
echo "Heavier data:   SEED_USER_COUNT=200000 npm run seed && npm run test:scale"
echo ""
