// Integration test: เรียก API ของระบบที่รันอยู่จริง (ต้องเปิดระบบก่อน: make up หรือ npm run dev)
//   รัน:  npm run test:integration
//   ค่าที่ต้องใช้ (อ่านจาก environment ก่อน ไม่มีก็อ่านจากไฟล์ .env):
//     BASE_URL (ค่าเริ่มต้น http://localhost:3000), API_KEYS, ADMIN_PASSWORD, VIEWERA_PASSWORD
//   ถ้าไม่มีระบบรันอยู่ ชุดทดสอบนี้จะถูกข้าม (skip) ไม่ทำให้ล้ม
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const dotenv = {};
try {
  for (const line of fs.readFileSync(path.join(root, ".env"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) dotenv[m[1]] = m[2];
  }
} catch {
  // ไม่มี .env — ใช้ค่าจาก environment อย่างเดียว
}
const env = (k) => process.env[k] ?? dotenv[k] ?? "";

const BASE = (env("BASE_URL") || "http://localhost:3000").replace(/\/$/, "");
const keys = Object.fromEntries(
  env("API_KEYS").split(",").map((p) => p.trim().split("=")).filter((p) => p.length === 2)
);
const KEY_A = keys.demoA;
const KEY_B = keys.demoB;
const KEY_ALL = keys["*"];

let up = false;
try {
  up = (await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(3000) })).ok;
} catch {
  up = false;
}
const skip = !up || !KEY_A || !KEY_B || !KEY_ALL ? `ไม่พบระบบที่ ${BASE} หรือไม่มี API_KEYS (รัน make up ก่อน)` : false;

const post = (p, body, key, extra = {}) =>
  fetch(`${BASE}${p}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(key ? { "x-api-key": key } : {}), ...extra },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
const get = (p, key, cookie) =>
  fetch(`${BASE}${p}`, { headers: { ...(key ? { "x-api-key": key } : {}), ...(cookie ? { cookie } : {}) } });

async function login(username, password) {
  const res = await post("/api/login", { username, password });
  assert.equal(res.status, 200, `login ${username} ไม่สำเร็จ`);
  return res.headers.getSetCookie()[0].split(";")[0];
}

const marker = `it${Date.now()}`; // ทำให้ทุกครั้งที่รันไม่ชนกับข้อมูลเดิม

test("health check", { skip }, async () => {
  assert.equal((await get("/api/health")).status, 200);
});

test("ingest ต้องมี API key ที่ถูกต้อง", { skip }, async () => {
  assert.equal((await post("/api/ingest", { source: "api" })).status, 401);
  assert.equal((await post("/api/ingest", { source: "api" }, "wrong-key")).status, 401);
});

test("POST /api/ingest (ตัวอย่างโจทย์ 4.3) แล้วค้นเจอ", { skip }, async () => {
  const res = await post("/api/ingest", {
    tenant: "demoA", source: "api", event_type: `app_login_failed_${marker}`, user: "alice",
    ip: "203.0.113.7", reason: "wrong_password", "@timestamp": "2025-08-20T07:20:00Z",
  }, KEY_A);
  assert.equal(res.status, 201);
  const found = await (await get(`/api/logs?q=${marker}&timeframe=24h`, KEY_A)).json();
  assert.equal(found.total, 1);
  assert.equal(found.rows[0].src_ip, "203.0.113.7");
});

test("key ของ tenant หนึ่งอ้าง tenant อื่นไม่ได้ (บังคับ tenant) และมองไม่เห็นข้อมูลของ tenant อื่น", { skip }, async () => {
  await post("/api/ingest", { tenant: "demoB", source: "api", event_type: `spoof_${marker}` }, KEY_A);
  const own = await (await get(`/api/logs?q=spoof_${marker}&timeframe=24h`, KEY_A)).json();
  const other = await (await get(`/api/logs?q=spoof_${marker}&timeframe=24h`, KEY_B)).json();
  assert.equal(own.total, 1);
  assert.equal(own.rows[0].tenant, "demoA");
  assert.equal(other.total, 0);
});

test("ข้อมูลผิดรูปแบบตอบ 400 (ไม่ใช่ 500) และ batch เป็น all-or-nothing", { skip }, async () => {
  assert.equal((await post("/api/ingest", { source: "api", severity: "banana" }, KEY_A)).status, 400);
  const res = await post("/api/ingest/batch", [
    { source: "api", event_type: `batch_ok_${marker}` },
    { source: "api", "@timestamp": "not-a-date" },
  ], KEY_A);
  assert.equal(res.status, 400);
  assert.equal((await res.json()).details[0].index, 1);
  assert.equal((await (await get(`/api/logs?q=batch_ok_${marker}&timeframe=24h`, KEY_A)).json()).total, 0);
});

test("ไฟล์ CloudTrail ต้นฉบับ ({Records:[...]}) ถูก normalize เป็น source=aws", { skip }, async () => {
  const body = { Records: [{
    eventTime: "2026-09-20T09:10:00Z", eventSource: "iam.amazonaws.com", eventName: "CreateUser",
    awsRegion: "ap-southeast-1", sourceIPAddress: "203.0.113.9", recipientAccountId: "123456789012",
    userIdentity: { type: "IAMUser", userName: `admin_${marker}` },
  }] };
  const res = await post("/api/ingest/file?tenant=demoB", body, KEY_ALL);
  assert.equal(res.status, 201);
  const found = await (await get(`/api/logs?q=admin_${marker}&tenant=demoB&timeframe=24h`, KEY_ALL)).json();
  assert.equal(found.total, 1);
  assert.equal(found.rows[0].source, "aws");
  assert.equal(found.rows[0].cloud_service, "iam");
  assert.equal(found.rows[0].tenant, "demoB");
});

test("RBAC: viewerA เห็นเฉพาะ demoA แม้ขอ tenant=demoB, admin เห็นทุก tenant", { skip: skip || !env("VIEWERA_PASSWORD") || !env("ADMIN_PASSWORD") }, async () => {
  await post("/api/ingest", { source: "api", event_type: `only_b_${marker}` }, KEY_B);
  const viewer = await login("viewerA", env("VIEWERA_PASSWORD"));
  const admin = await login("admin", env("ADMIN_PASSWORD"));

  const v = await (await get(`/api/logs?q=only_b_${marker}&tenant=demoB&timeframe=24h`, null, viewer)).json();
  const a = await (await get(`/api/logs?q=only_b_${marker}&tenant=demoB&timeframe=24h`, null, admin)).json();
  assert.equal(v.total, 0);
  assert.equal(a.total, 1);

  // ไม่มี session ต้องเข้า API ค้นหาไม่ได้
  assert.equal((await get("/api/logs")).status, 401);
});

test("Alert: ล็อกอินล้มเหลวซ้ำ ≥ 3 ครั้งจาก IP เดียวกันภายใน 5 นาที → เกิด alert เพียงครั้งเดียว และ tenant อื่นมองไม่เห็น", { skip }, async () => {
  const ip = `198.51.100.${100 + Math.floor(Math.random() * 100)}`;
  const one = () => ({ tenant: "demoA", source: "api", event_type: "app_login_failed", user: "alice", ip });
  await post("/api/ingest/batch", [one(), one()], KEY_A);
  const before = await (await get("/api/alerts?hours=1", KEY_A)).json();
  assert.ok(!before.rows.some((r) => r.group_key === ip), "ยังไม่ถึง threshold ไม่ควรมี alert");

  await post("/api/ingest/batch", [one(), one(), one()], KEY_A);
  const after = await (await get("/api/alerts?hours=1", KEY_A)).json();
  assert.equal(after.rows.filter((r) => r.group_key === ip).length, 1);

  const otherTenant = await (await get("/api/alerts?hours=1", KEY_B)).json();
  assert.ok(!otherTenant.rows.some((r) => r.group_key === ip));
});
