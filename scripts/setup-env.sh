#!/usr/bin/env bash
# สร้างไฟล์ .env จาก .env.example (ถ้ายังไม่มี) โดยแทนที่ CHANGE_ME ด้วยค่าสุ่ม
#   CHANGE_ME_PW → 12 ตัวอักษร (รหัสผ่านผู้ใช้),  CHANGE_ME → 32 ตัวอักษร (secret / key / รหัสผ่านฐานข้อมูล)
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -f .env ]; then
  echo "✔ พบ .env อยู่แล้ว — ไม่แก้ไข"
  exit 0
fi

rand() { # $1 = จำนวนไบต์ (ได้ตัวอักษร hex จำนวน 2 เท่า)
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex "$1"
  else
    head -c "$1" /dev/urandom | od -An -tx1 | tr -d ' \n'
  fi
}

tmp="$(mktemp)"
while IFS= read -r line || [ -n "$line" ]; do
  while [[ "$line" == *CHANGE_ME_PW* ]]; do line="${line/CHANGE_ME_PW/$(rand 6)}"; done
  while [[ "$line" == *CHANGE_ME* ]]; do line="${line/CHANGE_ME/$(rand 16)}"; done
  printf '%s\n' "$line"
done < .env.example > "$tmp"
mv "$tmp" .env
chmod 600 .env
echo "✔ สร้าง .env แล้ว (secret ทั้งหมดถูกสุ่มใหม่)"
