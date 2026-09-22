# ติดตั้งแบบ SaaS (HTTPS สาธารณะ)

ใช้โค้ดและ `docker-compose.yml` ชุดเดียวกับโหมด Appliance เพิ่มเพียง profile `saas` ซึ่งเปิด Caddy เป็น reverse proxy ทำ HTTPS ที่พอร์ต 80/443 และผูกเว็บ `app` ไว้ที่ `127.0.0.1:3000` เพื่อให้เข้าถึงจากภายนอกผ่าน HTTPS เท่านั้น

## สิ่งที่ต้องมี

- VM สาธารณะ (Linux) ที่ติดตั้ง Docker + Compose v2
- เปิดพอร์ตในไฟร์วอลล์/Security Group ของผู้ให้บริการ: **80/tcp, 443/tcp** (เว็บ) และ **514/udp + 514/tcp** (Syslog) — ถ้าไม่รับ Syslog จากภายนอกไม่ต้องเปิด 514
- โดเมนที่ชี้ (DNS A record) มาที่ IP ของ VM — หรือไม่มีโดเมนก็ใช้ IP ได้แต่จะเป็นใบรับรอง self-signed

## แบบ A: มีโดเมน (ใบรับรองจริงจาก Let's Encrypt)

1. ตั้ง DNS: `logs.example.com  A  <IP ของ VM>` และรอให้มีผล (`dig +short logs.example.com`)
2. บนเครื่อง VM:

   ```bash
   git clone <repo> && cd <repo>
   bash scripts/setup-env.sh
   ```

3. แก้ `.env`:

   ```
   APP_BIND=127.0.0.1
   DOMAIN=logs.example.com
   CADDY_TLS=
   ```

   (`CADDY_TLS` ปล่อยว่าง = Caddy ขอใบรับรองจริงให้อัตโนมัติ)
4. เริ่มระบบ:

   ```bash
   ./run.sh saas
   ```

5. เปิด `https://logs.example.com` — ต้องขึ้นรูปกุญแจ (ใบรับรองถูกต้อง) การออกใบรับรองครั้งแรกใช้เวลาไม่กี่วินาที ถ้าไม่สำเร็จดู `docker compose logs caddy` (สาเหตุมักเป็น DNS ยังไม่ชี้มา หรือพอร์ต 80/443 ถูกปิด)

## แบบ B: ไม่มีโดเมน ใช้ IP (self-signed)

แก้ `.env`:

```
APP_BIND=127.0.0.1
DOMAIN=<IP สาธารณะของ VM>
CADDY_TLS=tls internal
```

แล้ว `./run.sh saas` — เข้า `https://<IP>` เบราว์เซอร์จะเตือนว่าใบรับรองไม่น่าเชื่อถือ (เพราะออกโดย CA ภายในของ Caddy) ให้กด "ขั้นสูง → ดำเนินการต่อ" การเข้ารหัสยังทำงานเต็มรูปแบบ เพียงแต่ไม่มี CA สาธารณะรับรอง

ถ้าต้องการให้เบราว์เซอร์เชื่อ ให้นำ root CA ของ Caddy ไปติดตั้งในเครื่องผู้ใช้:

```bash
docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt ./caddy-root.crt
```

ทดสอบด้วย curl โดยไม่ตรวจใบรับรอง: `curl -k https://<IP>/api/health`

## ตรวจสอบหลังติดตั้ง

```bash
docker compose ps                         # app, syslog, caddy ต้อง Up (app healthy)
curl -I  http://<DOMAIN>                  # ต้องถูก redirect ไป https
curl -sk https://<DOMAIN>/api/health      # {"status":"ok"}
curl -m3 http://<IP>:3000                 # จากเครื่องอื่นต้องต่อไม่ได้ (APP_BIND=127.0.0.1)
nmap -p 5432 <IP>                         # ต้อง closed/filtered (Postgres ไม่เปิดออกภายนอก)
```

จากนั้นทำตามขั้นตอนในหัวข้อ "ตรวจสอบว่าทำงาน" ของ [setup_appliance.md](setup_appliance.md) โดยใช้ `https://<DOMAIN>` และส่ง log ด้วย:

```bash
curl -k -X POST https://<DOMAIN>/api/ingest \
  -H "Content-Type: application/json" -H "x-api-key: <key ของ demoA>" \
  -d '{"source":"api","event_type":"app_login_failed","user":"alice","ip":"203.0.113.7"}'
```

Syslog ส่งจากอุปกรณ์ไปที่ `<DOMAIN หรือ IP>:514` (ไม่ผ่าน Caddy และไม่เข้ารหัส — จำกัดที่ไฟร์วอลล์ให้รับเฉพาะ IP ของอุปกรณ์ที่เชื่อถือได้)

## ข้อควรทำก่อนเปิดใช้จริง

- จำกัดพอร์ต 514 ในไฟร์วอลล์ให้รับเฉพาะ IP ต้นทางที่รู้จัก
- ตั้ง `DISCORD_WEBHOOK_URL`/`SLACK_WEBHOOK_URL` เพื่อรับแจ้งเตือน
- เก็บ `.env` ให้ปลอดภัย (สิทธิ์ `chmod 600 .env`) และสำรอง volume `pgdata`
- เปลี่ยนรหัสผ่านตัวอย่างทั้งหมดที่ใช้ในการสาธิต (ระบบสุ่มให้แล้ว ไม่ควรใช้ค่าซ้ำที่อื่น)
- โดเมนจริงต้องชี้ DNS ก่อนสั่ง `./run.sh saas` มิฉะนั้น Let's Encrypt ขอใบรับรองไม่สำเร็จ (จำกัดจำนวนครั้งที่ลองต่อชั่วโมง)
