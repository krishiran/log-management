-- lib/schema.sql
-- รันซ้ำได้ปลอดภัย (IF NOT EXISTS ทั้งหมด) — ถูกเรียกอัตโนมัติโดย scripts/init.js ทุกครั้งที่ container เริ่มทำงาน

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ---------------------------------------------------------------- logs
CREATE TABLE IF NOT EXISTS logs (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL,                 -- เวลาของเหตุการณ์ใน log (@timestamp)
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), -- เวลาที่ระบบรับเข้าจริง (ใช้กับ retention/alert/ตัวกรองเวลา)
    tenant VARCHAR(50) NOT NULL DEFAULT 'default',
    source VARCHAR(50) NOT NULL DEFAULT 'unknown',
    vendor VARCHAR(50),
    product VARCHAR(50),
    event_type VARCHAR(100),
    event_subtype VARCHAR(100),
    severity INT DEFAULT 0,
    action VARCHAR(50),
    src_ip VARCHAR(45),
    src_port INT,
    dst_ip VARCHAR(45),
    dst_port INT,
    protocol VARCHAR(20),
    user_name VARCHAR(100),
    host VARCHAR(100),
    process VARCHAR(100),
    url TEXT,
    http_method VARCHAR(10),
    status_code INT,
    rule_name VARCHAR(100),
    rule_id VARCHAR(100),
    cloud_account_id VARCHAR(100),
    cloud_region VARCHAR(50),
    cloud_service VARCHAR(50),
    tags JSONB DEFAULT '[]'::jsonb,
    raw TEXT,      -- ข้อความ/JSON ดิบ
    data JSONB     -- ต้นฉบับที่รับเข้ามา (เก็บฟิลด์ที่ไม่อยู่ใน schema กลางไว้ เช่น sha256, logon_type)
);

-- ค้นหาตาม tenant + เวลา
CREATE INDEX IF NOT EXISTS idx_logs_tenant_timestamp ON logs (tenant, timestamp DESC);
-- ตัวกรองเวลา/retention/alert (ทั้งหมดใช้ ingested_at)
CREATE INDEX IF NOT EXISTS idx_logs_ingested_at ON logs (ingested_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_tenant_source_ingested ON logs (tenant, source, ingested_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_src_ip ON logs (src_ip);
-- ค้นข้อความแบบ contains (ILIKE '%...%') เร็วด้วย trigram GIN
CREATE INDEX IF NOT EXISTS idx_logs_raw_trgm ON logs USING gin (raw gin_trgm_ops);

-- ---------------------------------------------------------------- ผู้ใช้
CREATE TABLE IF NOT EXISTS users (
    username VARCHAR(50) PRIMARY KEY,
    password_hash TEXT NOT NULL,                     -- scrypt$salt$hash
    role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'viewer')),
    tenant VARCHAR(50) NOT NULL DEFAULT 'all',        -- viewer ถูกล็อกที่ tenant นี้, admin = 'all'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------- Alert
CREATE TABLE IF NOT EXISTS alert_rules (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    tenant VARCHAR(50),                              -- NULL = ใช้กับทุก tenant (ตรวจแยกทีละ tenant)
    match_event TEXT[] NOT NULL DEFAULT '{}',        -- รูปแบบ ILIKE ของ event_type เช่น {%fail%}
    min_severity INT,                                -- หรือ severity >= ค่านี้ (NULL = ไม่ใช้)
    threshold INT NOT NULL DEFAULT 3 CHECK (threshold >= 1),
    window_seconds INT NOT NULL DEFAULT 300 CHECK (window_seconds >= 10),
    group_by VARCHAR(20) NOT NULL DEFAULT 'src_ip',
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    notify_webhook BOOLEAN NOT NULL DEFAULT TRUE,
    created_by VARCHAR(50),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alert_events (
    id SERIAL PRIMARY KEY,
    rule_id INT REFERENCES alert_rules(id) ON DELETE SET NULL,
    rule_name VARCHAR(100) NOT NULL,
    tenant VARCHAR(50) NOT NULL,
    group_by VARCHAR(20) NOT NULL,
    group_key TEXT NOT NULL,
    hits INT NOT NULL,
    max_severity INT,
    last_seen TIMESTAMPTZ,
    fired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notified BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_alert_events_fired ON alert_events (fired_at DESC);
CREATE INDEX IF NOT EXISTS idx_alert_events_dedupe ON alert_events (rule_id, tenant, group_key, fired_at DESC);
