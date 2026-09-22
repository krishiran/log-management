#!/usr/bin/env bash
# ส่ง Syslog ตัวอย่างในโจทย์ (ข้อ 4.1 และ 4.2) ผ่าน UDP และ TCP
#   ใช้:  bash samples/send_syslog.sh [host] [port]      ค่าเริ่มต้น 127.0.0.1 พอร์ตจาก .env (SYSLOG_PORT) หรือ 514
#   ระบุ tenant ได้โดยเติม tenant=demoB ท้ายข้อความ (ถ้าไม่ระบุ ใช้ SYSLOG_DEFAULT_TENANT / SYSLOG_TENANT_MAP)
source "$(dirname "$0")/_env.sh"
HOST="${1:-127.0.0.1}"
PORT="${2:-$(envval SYSLOG_PORT)}"
PORT="${PORT:-514}"

FW='<134>Aug 20 12:44:56 fw01 vendor=demo product=ngfw action=deny src=10.0.1.10 dst=8.8.8.8 spt=5353 dpt=53 proto=udp msg=DNS blocked policy=Block-DNS'
RT='<190>Aug 20 13:01:02 r1 if=ge-0/0/1 event=link-down mac=aa:bb:cc:dd:ee:ff reason=carrier-loss'

echo "📡 ส่ง Syslog ไปที่ $HOST:$PORT"
echo "1) UDP (nc -u)"
printf '%s\n' "$FW" | nc -u -w1 "$HOST" "$PORT"
printf '%s\n' "$RT" | nc -u -w1 "$HOST" "$PORT"

echo "2) TCP (nc)"
printf '%s\n%s\n' "$FW tenant=demoB" "$RT tenant=demoB" | nc -w1 "$HOST" "$PORT"

if command -v logger >/dev/null 2>&1; then
  echo "3) logger (ถ้ามี)"
  logger -n "$HOST" -P "$PORT" -t Firewall "action=deny src=192.168.1.100 dst=10.0.0.1 msg=Unauthorized Access"
fi
echo "✅ ส่งแล้ว — เปิด Dashboard ดู (ควรเห็นภายในไม่กี่วินาที)"
