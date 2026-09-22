#!/usr/bin/env bash
# เปิดระบบด้วยคำสั่งเดียว
#   ./run.sh          โหมด Appliance  (เว็บ http://<เครื่อง>:3000, syslog พอร์ต 514)
#   ./run.sh saas     โหมด SaaS       (เพิ่ม HTTPS ผ่าน Caddy ที่พอร์ต 443 — ตั้ง DOMAIN/CADDY_TLS ใน .env ก่อน)
set -euo pipefail
cd "$(dirname "$0")"

MODE="${1:-appliance}"

bash scripts/setup-env.sh

echo "📦 กำลัง build และเริ่ม container (โหมด: $MODE) ..."
if [ "$MODE" = "saas" ]; then
  docker compose --profile saas up -d --build
else
  docker compose up -d --build
fi

echo "⏳ รอระบบพร้อมใช้งาน ..."
ready=0
for _ in $(seq 1 60); do
  if [ "$(docker compose ps --format '{{.Health}}' app 2>/dev/null || true)" = "healthy" ]; then ready=1; break; fi
  sleep 3
done
if [ "$ready" != "1" ]; then
  echo "⚠️  ระบบยังไม่พร้อมภายใน 3 นาที ดู log ด้วย: docker compose logs app"
  exit 1
fi

get() { grep -E "^$1=" .env | head -1 | cut -d= -f2-; }

echo "✅ พร้อมใช้งานแล้ว"
if [ "$MODE" = "saas" ]; then
  echo "🌐 Dashboard : https://$(get DOMAIN)"
else
  echo "🌐 Dashboard : http://localhost:3000"
fi
echo "📡 Syslog    : UDP/TCP พอร์ต $(get SYSLOG_PORT)"
echo "👤 บัญชี     : admin / viewerA / viewerB — รหัสผ่านอยู่ใน .env (ADMIN_PASSWORD, VIEWERA_PASSWORD, VIEWERB_PASSWORD)"
echo "🔑 API keys  : $(get API_KEYS)"
echo "ℹ️  หมายเหตุ: บัญชีถูกสร้างครั้งแรกตอนฐานข้อมูลยังว่าง ถ้าเคยรันมาก่อนและอยากเริ่มใหม่ให้รัน  make reset"
