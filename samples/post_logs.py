#!/usr/bin/env python3
"""ส่ง log ตัวอย่างตามโจทย์ (7 แหล่ง) เข้า POST /api/ingest ด้วย urllib (ไม่ต้องติดตั้งแพ็กเกจเพิ่ม)

ใช้:  python3 samples/post_logs.py
  BASE_URL   ที่อยู่ระบบ (ค่าเริ่มต้น http://localhost:3000)
  API_KEY    ระบุ key เอง (ไม่ระบุ = อ่านจาก API_KEYS ใน .env แยกตาม tenant)
  INSECURE=1 ข้ามการตรวจใบรับรอง (เมื่อเป็น self-signed)
"""
import json
import os
import ssl
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BASE_URL = os.environ.get("BASE_URL", "http://localhost:3000").rstrip("/")


def read_env():
    env = {}
    path = ROOT / ".env"
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                env[key.strip()] = value.strip()
    return env


ENV = read_env()


def api_key(tenant):
    if os.environ.get("API_KEY"):
        return os.environ["API_KEY"]
    for part in ENV.get("API_KEYS", "").split(","):
        name, _, key = part.partition("=")
        if name.strip() == tenant:
            return key.strip()
    return ""


def now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def sample_logs():
    ts = now()
    return [
        # 1) Firewall (ส่งผ่าน HTTP JSON; ของจริงส่งผ่าน Syslog ได้ด้วย samples/send_syslog.sh)
        {"tenant": "demoA", "source": "firewall", "vendor": "demo", "product": "ngfw", "event_type": "traffic_deny",
         "action": "deny", "severity": 3, "src_ip": "10.0.1.10", "dst_ip": "8.8.8.8", "src_port": 5353, "dst_port": 53,
         "protocol": "udp", "rule_name": "Block-DNS", "@timestamp": ts},
        # 2) Network (router)
        {"tenant": "demoA", "source": "network", "event_type": "link_down", "host": "r1", "severity": 2,
         "raw": "if=ge-0/0/1 event=link-down mac=aa:bb:cc:dd:ee:ff reason=carrier-loss", "@timestamp": ts},
        # 3) HTTP API (ข้อ 4.3)
        {"tenant": "demoA", "source": "api", "event_type": "app_login_failed", "user": "alice", "ip": "203.0.113.7",
         "reason": "wrong_password", "@timestamp": ts},
        # 4) CrowdStrike (ข้อ 4.4)
        {"tenant": "demoA", "source": "crowdstrike", "event_type": "malware_detected", "host": "WIN10-01",
         "process": "powershell.exe", "severity": 8, "sha256": "abc...", "action": "quarantine", "@timestamp": ts},
        # 5) AWS CloudTrail (ข้อ 4.5)
        {"tenant": "demoB", "source": "aws",
         "cloud": {"service": "iam", "account_id": "123456789012", "region": "ap-southeast-1"},
         "event_type": "CreateUser", "user": "admin", "@timestamp": ts,
         "raw": {"eventName": "CreateUser", "requestParameters": {"userName": "temp-user"}}},
        # 6) Microsoft 365 (ข้อ 4.6)
        {"tenant": "demoB", "source": "m365", "event_type": "UserLoggedIn", "user": "bob@demo.local",
         "ip": "198.51.100.23", "status": "Success", "workload": "Exchange", "@timestamp": ts},
        # 7) Windows AD (ข้อ 4.7)
        {"tenant": "demoA", "source": "ad", "event_id": 4625, "event_type": "LogonFailed", "user": "demo\\eve",
         "host": "DC01", "ip": "203.0.113.77", "logon_type": 3, "@timestamp": ts},
    ]


def post(log):
    request = urllib.request.Request(
        f"{BASE_URL}/api/ingest",
        data=json.dumps(log).encode("utf-8"),
        headers={"Content-Type": "application/json", "x-api-key": api_key(log["tenant"])},
        method="POST",
    )
    context = ssl._create_unverified_context() if os.environ.get("INSECURE") == "1" else None
    try:
        with urllib.request.urlopen(request, context=context, timeout=10) as response:
            return response.status, response.read().decode("utf-8")
    except urllib.error.HTTPError as err:
        return err.code, err.read().decode("utf-8")


def main():
    logs = sample_logs()
    if not any(api_key(log["tenant"]) for log in logs):
        sys.exit("ไม่พบ API key — ตั้ง API_KEY=... หรือสร้างไฟล์ .env ก่อน (./run.sh)")
    print(f"🚀 ส่ง sample log {len(logs)} รายการไปที่ {BASE_URL}/api/ingest")
    for i, log in enumerate(logs, 1):
        status, body = post(log)
        print(f"[{i}/{len(logs)}] {log['source']:<12} {log['event_type']:<18} → HTTP {status} {body if status >= 400 else ''}")
        time.sleep(0.2)


if __name__ == "__main__":
    main()
