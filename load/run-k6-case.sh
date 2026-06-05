#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_URL="${BASE_URL:-http://127.0.0.1:3001}"

WEEK_JSON="$(curl -sf "${BASE_URL}/api/week/current" 2>/dev/null || true)"
if [ -n "${WEEK_JSON}" ]; then
  export CASE_WEEK_ID="$(node -e "console.log(JSON.parse(process.argv[1]).weekId)" "${WEEK_JSON}")"
  export CASE_TOTAL_PLAYERS="$(node -e "console.log(JSON.parse(process.argv[1]).totalPlayers)" "${WEEK_JSON}")"
fi

BASE_URL="${BASE_URL}" k6 run "${ROOT}/load/k6/leaderboard-case.js"
