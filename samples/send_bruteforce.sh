#!/usr/bin/env bash
# จำลองการเดารหัสผ่าน: ล็อกอินล้มเหลว 6 ครั้งจาก IP เดียวกันภายในไม่กี่วินาที → ควรเห็น Alert ในหน้า /alerts
#   (และส่ง webhook ถ้าตั้ง DISCORD_WEBHOOK_URL / SLACK_WEBHOOK_URL ไว้)
source "$(dirname "$0")/_env.sh"
KEY="$(apikey demoA)"
[ -n "$KEY" ] || { echo "ไม่พบ API key ของ demoA — ตั้ง API_KEY=... หรือสร้าง .env (./run.sh)"; exit 1; }

for i in 1 2 3 4 5 6; do
  NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  # shellcheck disable=SC2086
  curl $CURL_OPTS -sS -o /dev/null -w "ครั้งที่ $i → HTTP %{http_code}\n" -X POST "$BASE_URL/api/ingest" \
    -H "Content-Type: application/json" -H "x-api-key: $KEY" \
    -d "{\"tenant\":\"demoA\",\"source\":\"api\",\"event_type\":\"app_login_failed\",\"user\":\"alice\",\"ip\":\"203.0.113.99\",\"reason\":\"wrong_password\",\"@timestamp\":\"$NOW\"}"
done
echo "✅ ส่งครบ 6 ครั้ง — เปิด $BASE_URL/alerts"
