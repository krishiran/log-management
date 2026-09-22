# ติดตั้งแบบ Appliance

ติดตั้งบนเครื่องเดียว (VM หรือเครื่องภายในองค์กร) ให้อุปกรณ์ในเครือข่ายส่ง Syslog เข้ามา และเข้าเว็บผ่านพอร์ต 3000

## สิ่งที่ต้องมี

- Docker Engine + Docker Compose v2 (`docker compose version`)
- พอร์ตว่าง: 3000 (เว็บ) และ 514 UDP/TCP (Syslog)
- Linux/macOS/WSL/Git Bash ใช้ `run.sh`; Windows ใช้ `run.bat` (ต้องมี PowerShell)

## ขั้นตอน

```bash
git clone <repo> && cd <repo>
./run.sh
```

สคริปต์สร้าง `.env` (รหัสผ่าน/คีย์สุ่มทุกค่า), build image, เริ่ม `postgres` → `app` → `syslog` แล้วรอจนพร้อม จากนั้นพิมพ์:

- Dashboard: `http://localhost:3000` (หรือ `http://<IP เครื่อง>:3000`)
- ตำแหน่งรหัสผ่านและ API key: ไฟล์ `.env`

ดูรหัสผ่านผู้ใช้:

```bash
grep -E '^(ADMIN|VIEWERA|VIEWERB)_PASSWORD|^API_KEYS' .env
```

## ทำเองด้วย Docker Compose

```bash
bash scripts/setup-env.sh          # สร้าง .env (ทำซ้ำได้ ไม่เขียนทับค่าเดิม)
docker compose up -d --build
docker compose ps                  # app ต้องเป็น healthy
docker compose logs -f app syslog
```

## ตรวจสอบว่าทำงาน

1. `curl http://localhost:3000/api/health` → `{"status":"ok"}`
2. เข้า `http://localhost:3000` ล็อกอินด้วย `admin`
3. `make sample-syslog` แล้วรีเฟรช Dashboard — ควรเห็น log จาก `firewall` และ `network`
4. `make sample-api` — ควรเห็น source `api`, `crowdstrike`, `aws`, `m365`, `ad`
5. `make sample-bruteforce` — ควรเห็นแบนเนอร์ alert และรายการในหน้า `/alerts`
6. ออกแล้วล็อกอินเป็น `viewerA` — ต้องเห็นเฉพาะ `demoA`

## ตั้งค่าอุปกรณ์ให้ส่ง Syslog

ชี้อุปกรณ์ไปที่ `<IP เครื่อง>` พอร์ต 514 (UDP หรือ TCP) รูปแบบข้อความที่แกะได้คือ `<PRI>วันที่ host key=value key=value …` ตามตัวอย่างในโจทย์ เช่น `action=deny src=10.0.1.10 dst=8.8.8.8 spt=5353 dpt=53 proto=udp`

การกำหนด tenant ให้ Syslog (เรียงลำดับความสำคัญ):

1. ใส่ `tenant=demoB` ท้ายข้อความ
2. `SYSLOG_TENANT_MAP=10.0.0.5=demoB,10.0.0.6=demoA` ใน `.env` (จับคู่ IP อุปกรณ์)
3. `SYSLOG_DEFAULT_TENANT` (ค่าเริ่มต้น `demoA`)

แก้ `.env` แล้วรัน `docker compose up -d` เพื่อให้มีผล

หมายเหตุ: พอร์ต 514 เป็นพอร์ตต่ำกว่า 1024 แต่ Docker จัดการให้เอง ไม่ต้องรันด้วย root; หากพอร์ตชนกับ rsyslog ของเครื่อง ให้เปลี่ยน `SYSLOG_PORT` (เช่น 5514)

## แจ้งเตือนผ่าน Discord/Slack

ใส่ `DISCORD_WEBHOOK_URL` หรือ `SLACK_WEBHOOK_URL` ใน `.env` แล้ว `docker compose up -d` — ส่งเมื่อกฎเข้าเงื่อนไขเท่านั้น จัดการกฎที่หน้า `/alerts` (เฉพาะ admin)

## บำรุงรักษา

| งาน | คำสั่ง |
|-----|--------|
| ดู log ของระบบ | `docker compose logs -f` |
| หยุด (เก็บข้อมูล) | `docker compose down` |
| เริ่มใหม่ทั้งหมด (**ลบข้อมูล**) | `make reset` |
| สำรองฐานข้อมูล | `docker compose exec postgres pg_dump -U postgres logdb > backup.sql` |
| อัปเดตโค้ด | `git pull && docker compose up -d --build` |

## แก้ปัญหาเบื้องต้น

- **app ไม่ขึ้น healthy / restart วน** — `docker compose logs app`; สาเหตุที่พบบ่อยคือ `.env` ไม่ครบหรือ `JWT_SECRET` ยังเป็น `CHANGE_ME`
- **Syslog ไม่เข้า** — ตรวจไฟร์วอลล์ของเครื่อง (UDP/TCP 514), `docker compose logs syslog`; ทดสอบ `make sample-syslog`
- **ล็อกอินไม่ได้หลังเปลี่ยนรหัสใน `.env`** — ผู้ใช้ถูกสร้างครั้งแรกเท่านั้น ใช้ `make reset` (ข้อมูลหาย) หรือตั้งค่ารหัสใหม่ใน DB โดยตรง
- **Windows: สคริปต์ `.sh` error `\r`** — ไฟล์ต้องเป็น LF (repo มี `.gitattributes` บังคับให้แล้ว; ถ้า clone ก่อนหน้านั้นให้ clone ใหม่)
