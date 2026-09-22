# ตัวช่วยที่ทุกสคริปต์ในโฟลเดอร์นี้ใช้ร่วมกัน (ใช้ด้วย: source "$(dirname "$0")/_env.sh")
#   BASE_URL   ที่อยู่ของระบบ (ค่าเริ่มต้น http://localhost:3000)  เช่น BASE_URL=https://logs.example.com
#   CURL_OPTS  ตัวเลือกเพิ่มของ curl  เช่น CURL_OPTS=-k เมื่อใช้ใบรับรอง self-signed
#   API_KEY    ระบุ API key เอง (ไม่ระบุ = อ่านจาก API_KEYS ในไฟล์ .env)
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_URL="${BASE_URL:-http://localhost:3000}"
CURL_OPTS="${CURL_OPTS:-}"

# อ่านค่าจาก .env โดยไม่ source ทั้งไฟล์ (API_KEYS มีอักขระ * จึงไม่ปลอดภัยที่จะ source)
envval() {
  [ -f "$ROOT/.env" ] || return 0
  grep -E "^$1=" "$ROOT/.env" | head -1 | cut -d= -f2-
}

# apikey <tenant|*>  → คืน API key ของ tenant นั้นจาก API_KEYS
apikey() {
  if [ -n "${API_KEY:-}" ]; then echo "$API_KEY"; return; fi
  envval API_KEYS | tr ',' '\n' | grep -F "$1=" | head -1 | cut -d= -f2-
}
