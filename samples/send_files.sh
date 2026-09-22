#!/usr/bin/env bash
# อัปโหลดไฟล์ตัวอย่างของ AWS CloudTrail / Microsoft 365 / Windows AD / CrowdStrike เข้า /api/ingest/file
#   ไฟล์ที่เป็นรูปแบบดั้งเดิมของผู้ผลิตไม่มีฟิลด์ tenant จึงระบุผ่าน ?tenant=  (ใช้ API key แบบ global "*")
source "$(dirname "$0")/_env.sh"
KEY="$(apikey '*')"
[ -n "$KEY" ] || { echo "ไม่พบ API key แบบ global (*) — ตั้ง API_KEY=... หรือสร้าง .env (./run.sh)"; exit 1; }

send() { # send <ไฟล์> <tenant>
  echo "📁 $1 → tenant=$2"
  # shellcheck disable=SC2086
  curl $CURL_OPTS -sS -X POST "$BASE_URL/api/ingest/file?tenant=$2" \
    -H "x-api-key: $KEY" -H "Content-Type: application/json" \
    --data-binary "@$ROOT/samples/$1"
  echo
}

send cloudtrail_records.json demoB      # {"Records":[...]} รูปแบบไฟล์ CloudTrail จริง
send m365_ual.json demoB                # Microsoft 365 Unified Audit Log
send windows_events.json demoA          # Windows Security (EventID 4624/4625/4740)
send crowdstrike_detection.json demoA   # CrowdStrike Falcon detection
send sample_aws.json demoB              # ตัวอย่างแบบแบนตามโจทย์ (มี tenant ในไฟล์)
send sample_m365.json demoB
send sample_ad.json demoA
echo "✅ เสร็จ — เปิด Dashboard แล้วกรอง Source เป็น aws / m365 / ad / crowdstrike"
