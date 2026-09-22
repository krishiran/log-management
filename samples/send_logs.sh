#!/usr/bin/env bash
# ส่ง log ตัวอย่างข้อ 4.3 (HTTP API) 1 รายการด้วย curl
source "$(dirname "$0")/_env.sh"
KEY="$(apikey demoA)"
[ -n "$KEY" ] || { echo "ไม่พบ API key ของ demoA — ตั้ง API_KEY=... หรือสร้าง .env (./run.sh)"; exit 1; }

NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "🚀 POST $BASE_URL/api/ingest"
# shellcheck disable=SC2086
curl $CURL_OPTS -sS -X POST "$BASE_URL/api/ingest" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $KEY" \
  -d "{\"tenant\":\"demoA\",\"source\":\"api\",\"event_type\":\"app_login_failed\",\"user\":\"alice\",\"ip\":\"203.0.113.7\",\"reason\":\"wrong_password\",\"@timestamp\":\"$NOW\"}"
echo
