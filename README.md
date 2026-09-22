# Log Management Demo

ระบบรวบรวมและค้นหา log จากหลายแหล่ง (Firewall/Router ผ่าน Syslog, HTTP API, ไฟล์ JSON/NDJSON, AWS CloudTrail, Microsoft 365, Windows AD, CrowdStrike) แยกข้อมูลตาม tenant พร้อมสิทธิ์ผู้ใช้ (RBAC), HTTPS, การแจ้งเตือน (alert) และการเก็บ log ย้อนหลัง 7 วัน

รองรับ 2 รูปแบบการติดตั้งจากโค้ดชุดเดียวกัน:

| โหมด | คำสั่ง | ได้อะไร |
|------|--------|---------|
| **Appliance** | `./run.sh` | เว็บที่ `http://<เครื่อง>:3000` + Syslog พอร์ต 514 (UDP/TCP) |
| **SaaS** | `./run.sh saas` | เหมือนด้านบน + HTTPS ที่พอร์ต 443 ผ่าน Caddy (ใบรับรองอัตโนมัติ) |

## เริ่มต้นใช้งานอย่างเร็ว

ต้องมี Docker (พร้อม Docker Compose v2) เท่านั้น

```bash
# Linux / macOS / WSL / Git Bash
./run.sh            # โหมด Appliance
./run.sh saas       # โหมด SaaS (ตั้ง DOMAIN และ CADDY_TLS ใน .env ก่อน — ดู docs/setup_saas.md)

# Windows (PowerShell / cmd)
run.bat
```

สคริปต์จะ (1) สร้าง `.env` จาก `.env.example` โดยแทนที่ทุกค่า `CHANGE_ME` ด้วยรหัสสุ่ม (2) build และเริ่ม container (3) รอจน healthy แล้วพิมพ์ URL ให้

- รหัสผ่านและ API key ทั้งหมดอยู่ในไฟล์ `.env` (ไม่มีรหัสผ่านตายตัวในโค้ด และ `.env` ไม่ถูก commit)
- ผู้ใช้เริ่มต้น: `admin` (เห็นทุก tenant และจัดการกฎ alert ได้), `viewerA` (เห็นเฉพาะ `demoA`), `viewerB` (เห็นเฉพาะ `demoB`)
- ผู้ใช้ถูกสร้างตอนฐานข้อมูลว่างเท่านั้น หากเปลี่ยนรหัสใน `.env` ภายหลังต้องเริ่มใหม่ด้วย `make reset` (ลบข้อมูลทั้งหมด)

คู่มือละเอียด: [docs/setup_appliance.md](docs/setup_appliance.md) · [docs/setup_saas.md](docs/setup_saas.md) · [docs/architecture.md](docs/architecture.md)

## ลองส่ง log ตัวอย่าง

```bash
make sample-syslog      # Firewall/Router ตามโจทย์ข้อ 4.1–4.2 ผ่าน UDP และ TCP
make sample-api         # 7 ตัวอย่างตามโจทย์ข้อ 4.3–4.7 ผ่าน HTTP API
make sample-files       # อัปโหลดไฟล์ CloudTrail / M365 / Windows / CrowdStrike ต้นฉบับ
make sample-bruteforce  # ล็อกอินล้มเหลวซ้ำจาก IP เดียว เพื่อให้เกิด alert
```

หรือ import `samples/postman_collection.json` เข้า Postman

## แมปกับ Acceptance Checklist

| ข้อกำหนด | ทำอย่างไร | ตรวจสอบที่ไหน |
|----------|-----------|----------------|
| ติดตั้งด้วยคำสั่งเดียว | `./run.sh` / `run.bat` / `make up` | รัน แล้วเปิด Dashboard |
| Syslog Firewall/Router (UDP+TCP) | `syslog-server.js` เป็น service แยก พอร์ต 514 | `make sample-syslog` |
| HTTP API + API key | `POST /api/ingest`, `/api/ingest/batch` | `make sample-api` |
| อัปโหลดไฟล์ JSON/NDJSON | `POST /api/ingest/file` และฟอร์มบน Dashboard | `make sample-files` |
| Normalize เป็น Schema กลาง | `lib/normalize.js` (รองรับทั้งรูปแบบแบนและรูปแบบต้นฉบับของ CloudTrail, M365, Windows, CrowdStrike) | `npm test` |
| Multi-tenant + RBAC | tenant ถูกบังคับจาก JWT / API key ฝั่ง server เสมอ | login เป็น `viewerA` แล้วลองดู `demoB` ไม่ได้ |
| ค้นหา/กรอง Dashboard | คำค้น, ช่วงเวลา, source, severity, tenant (admin) + Top-N + timeline | หน้าแรก |
| TLS | Caddy (โหมด SaaS) | `https://<DOMAIN>` |
| Alert | กฎเก็บใน DB จัดการที่หน้า `/alerts` + webhook Discord/Slack | `make sample-bruteforce` |
| เก็บ 7 วัน | ลบอัตโนมัติตาม `RETENTION_DAYS` (ค่าเริ่มต้น 7) เมื่อเริ่มระบบและทุก 6 ชั่วโมง (รันใน service `syslog`) | `lib/retention.js` |
| เอกสาร + สถาปัตยกรรม | โฟลเดอร์ `docs/` | — |
| Unit / integration test + CI | `npm test`, `npm run test:integration`, `.github/workflows/ci.yml` | — |

## โครงสร้างโปรเจกต์ (แมปกับโครงสร้างในโจทย์)

| โจทย์ | ในโปรเจกต์นี้ | หน้าที่ |
|-------|----------------|---------|
| `/backend` | `app/api/*` และ `lib/*` | API route, การยืนยันตัวตน, normalize, ค้นหา, alert, retention |
| `/frontend` | `app/*.js` (หน้า), `components/*` | Dashboard, หน้า login, หน้า alert |
| `/ingest` | `syslog-server.js`, `lib/syslog.js`, `lib/ingest.js` | รับ Syslog และประมวลผลไฟล์/batch |
| `/docs` | `docs/*`, `README.md` | เอกสาร |
| `/deploy` | `docker-compose.yml`, `Dockerfile`, `deploy/Caddyfile`, `run.sh`, `run.bat` | ติดตั้ง |
| `/samples` | `samples/*` | ข้อมูลตัวอย่างและสคริปต์ส่ง |
| `/tests` | `tests/unit`, `tests/integration` | ชุดทดสอบ |

เหตุผลที่ไม่แยกเป็นสามโปรเจกต์: ใช้ Next.js เป็นทั้งหน้าเว็บและ API ในโปรเจกต์เดียว ลดจำนวนสิ่งที่ต้อง deploy และแชร์โค้ด `lib/` ระหว่างเว็บกับตัวรับ Syslog

## API

ทุก endpoint ตอบเป็น JSON ข้อมูลผิดรูปแบบตอบ `400` พร้อมรายละเอียด, ไม่มีสิทธิ์ตอบ `401`

| Method | Path | การยืนยันตัวตน | คำอธิบาย |
|--------|------|-----------------|-----------|
| `GET` | `/api/health` | ไม่ต้อง | ตรวจว่าเว็บและฐานข้อมูลพร้อม |
| `POST` | `/api/login` | ไม่ต้อง | `{username,password}` → ตั้ง cookie session (ผิด 5 ครั้งใน 15 นาที → `429`) |
| `DELETE` | `/api/login` | session | ออกจากระบบ |
| `POST` | `/api/ingest` | `x-api-key` หรือ session | ส่ง log 1 รายการ (ตอบ `201`) |
| `POST` | `/api/ingest/batch` | `x-api-key` หรือ session | ส่งอาร์เรย์ (สูงสุด 5,000) แบบ all-or-nothing |
| `POST` | `/api/ingest/file` | `x-api-key` หรือ session | ไฟล์ JSON/NDJSON (multipart หรือ raw body, สูงสุด 10 MB), `?tenant=` ระบุ tenant ปลายทาง |
| `GET` | `/api/logs` | session หรือ `x-api-key` | ค้นหา: `q, timeframe (1h/24h/7d/all), source, severity, tenant, limit, offset` |
| `GET` | `/api/alerts` | session หรือ `x-api-key` | รายการ alert ที่เกิดขึ้น: `hours` |

ตัวอย่างตามโจทย์ข้อ 4.3:

```bash
curl -X POST http://localhost:3000/api/ingest \
  -H "Content-Type: application/json" \
  -H "x-api-key: <key ของ demoA จาก .env>" \
  -d '{"tenant":"demoA","source":"api","event_type":"app_login_failed","user":"alice","ip":"203.0.113.7","reason":"wrong_password","@timestamp":"2025-08-20T07:20:00Z"}'
```

กฎสำคัญ:

- **API key ผูกกับ tenant** — key ของ `demoA` จะบันทึกเป็น `demoA` เสมอ แม้ในข้อมูลระบุ tenant อื่น ส่วน key `*` ส่งได้ทุก tenant
- **ตัวกรองเวลา/retention/alert ใช้เวลาที่ระบบรับเข้า (`ingested_at`)** ไม่ใช่เวลาของเหตุการณ์ ดังนั้น log เก่าที่เพิ่งอัปโหลดจะยังแสดงและไม่ถูกลบทันที; เวลาของเหตุการณ์ (`@timestamp`) ยังเก็บและแสดงในตาราง

## การตั้งค่า (`.env`)

| ตัวแปร | ความหมาย |
|--------|-----------|
| `PGPASSWORD` | รหัสผ่านฐานข้อมูล (Postgres ไม่เปิดพอร์ตออกภายนอก) |
| `JWT_SECRET` | คีย์เซ็น session อย่างน้อย 16 ตัวอักษร; ถ้ายังเป็น `CHANGE_ME` แอปจะไม่เริ่มทำงาน |
| `API_KEYS` | `demoA=<key>,demoB=<key>,*=<key>` |
| `ADMIN_PASSWORD`, `VIEWERA_PASSWORD`, `VIEWERB_PASSWORD` | รหัสผ่านผู้ใช้เริ่มต้น (เก็บแบบ scrypt hash) |
| `APP_TIMEZONE` | เขตเวลาที่แสดงผลและใช้จัดกลุ่มกราฟ (ค่าเริ่มต้น `Asia/Bangkok`) |
| `RETENTION_DAYS` | จำนวนวันที่เก็บ log (ค่าเริ่มต้น 7) |
| `SYSLOG_PORT`, `SYSLOG_DEFAULT_TENANT`, `SYSLOG_TENANT_MAP` | การรับ Syslog และการจับคู่ tenant |
| `DISCORD_WEBHOOK_URL`, `SLACK_WEBHOOK_URL`, `WEBHOOK_URL` | ปลายทางแจ้งเตือน (ไม่บังคับ) |
| `APP_BIND`, `DOMAIN`, `CADDY_TLS` | ใช้กับโหมด SaaS |

## การทดสอบ

```bash
npm test                  # unit test (ไม่ต้องมีฐานข้อมูล/เซิร์ฟเวอร์)
make up && npm run test:integration   # integration test กับระบบที่รันอยู่
```

CI (`.github/workflows/ci.yml`) รัน lint + unit test และ integration test บน Postgres จริงทุกครั้งที่ push

## ข้อจำกัดที่ทราบ

- Syslog รองรับรูปแบบ `key=value` (ตามตัวอย่างโจทย์) ไม่ได้แกะรูปแบบเฉพาะของผู้ผลิต เช่น CEF/LEEF
- Syslog ผ่าน TCP/UDP ไม่มีการเข้ารหัส (ไม่มี TLS syslog) ควรใช้ในเครือข่ายที่เชื่อถือได้
- ผู้ใช้ถูกสร้างจากค่าใน `.env` ตอนเริ่มครั้งแรก ยังไม่มีหน้าจัดการผู้ใช้
- การตรวจ alert ทำหลังรับข้อมูลเข้า (debounce 2 วินาที) ไม่ใช่ตัวจับเวลาแยก
- ยังไม่ได้ทดสอบประสิทธิภาพกับข้อมูลปริมาณมาก
