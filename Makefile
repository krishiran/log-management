.PHONY: help setup build up saas-up down reset logs test test-integration sample-syslog sample-api sample-files sample-bruteforce

help:
	@echo "make up | saas-up | down | reset | logs | test | test-integration | sample-syslog | sample-api | sample-files | sample-bruteforce"

setup:
	@bash scripts/setup-env.sh

build: setup
	docker compose build

up: setup
	docker compose up -d --build
	@echo "🌐 Dashboard: http://localhost:3000   📡 Syslog: UDP/TCP 514   (บัญชีและ API key อยู่ใน .env)"

saas-up: setup
	docker compose --profile saas up -d --build
	@echo "🔒 HTTPS ผ่าน Caddy — ดู DOMAIN/CADDY_TLS ใน .env และ docs/setup_saas.md"

down:
	docker compose --profile saas down

# ลบข้อมูลทั้งหมด (volume ของฐานข้อมูล) เพื่อเริ่มใหม่ตั้งแต่ต้น
reset:
	docker compose --profile saas down -v

logs:
	docker compose logs -f

# unit tests (ไม่ต้องมีเซิร์ฟเวอร์/ฐานข้อมูล)
test:
	npm test

# integration tests: ต้องรันระบบอยู่ (make up) — ตั้ง BASE_URL และค่าใน .env ให้ครบ
test-integration:
	npm run test:integration

sample-syslog:
	bash samples/send_syslog.sh

sample-api:
	python3 samples/post_logs.py

sample-files:
	bash samples/send_files.sh

sample-bruteforce:
	bash samples/send_bruteforce.sh
