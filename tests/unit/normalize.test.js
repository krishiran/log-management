// Unit test: การ normalize log ตาม Schema กลาง — ไม่ต้องมีเซิร์ฟเวอร์/ฐานข้อมูล   รัน: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { ValidationError, normalizeLog, parseSeverity, parseTimestamp } from "../../lib/normalize.js";

// ---- ตัวอย่างตามโจทย์ข้อ 4 (รูปแบบแบน) ----

test("4.3 HTTP API: ip → src_ip, ติดแท็ก external_ip", () => {
  const n = normalizeLog({
    tenant: "demoA", source: "api", event_type: "app_login_failed", user: "alice",
    ip: "203.0.113.7", reason: "wrong_password", "@timestamp": "2025-08-20T07:20:00Z",
  });
  assert.equal(n.tenant, "demoA");
  assert.equal(n.source, "api");
  assert.equal(n.user_name, "alice");
  assert.equal(n.src_ip, "203.0.113.7");
  assert.ok(n.tags.includes("external_ip"));
  assert.equal(n.timestamp.toISOString(), "2025-08-20T07:20:00.000Z");
  assert.equal(n.data.reason, "wrong_password", "ฟิลด์นอก schema ต้องยังอยู่ใน data");
});

test("4.4 CrowdStrike (แบบแบน): เก็บ severity/action/host/process", () => {
  const n = normalizeLog({
    tenant: "demoA", source: "crowdstrike", event_type: "malware_detected", host: "WIN10-01",
    process: "powershell.exe", severity: 8, sha256: "abc...", action: "quarantine", "@timestamp": "2025-08-20T08:00:00Z",
  });
  assert.equal(n.severity, 8);
  assert.equal(n.action, "quarantine");
  assert.equal(n.host, "WIN10-01");
  assert.equal(n.process, "powershell.exe");
});

test("4.5 AWS (แบบแบน): cloud.* → คอลัมน์ cloud_*, raw ที่เป็น object ถูกแปลงเป็นข้อความ", () => {
  const n = normalizeLog({
    tenant: "demoB", source: "aws",
    cloud: { service: "iam", account_id: "123456789012", region: "ap-southeast-1" },
    event_type: "CreateUser", user: "admin", "@timestamp": "2025-08-20T09:10:00Z",
    raw: { eventName: "CreateUser", requestParameters: { userName: "temp-user" } },
  });
  assert.equal(n.cloud_service, "iam");
  assert.equal(n.cloud_account_id, "123456789012");
  assert.equal(n.cloud_region, "ap-southeast-1");
  assert.equal(n.action, "create");
  assert.equal(typeof n.raw, "string");
  assert.match(n.raw, /temp-user/);
});

test("4.6 M365 (แบบแบน)", () => {
  const n = normalizeLog({
    tenant: "demoB", source: "m365", event_type: "UserLoggedIn", user: "bob@demo.local",
    ip: "198.51.100.23", status: "Success", workload: "Exchange", "@timestamp": "2025-08-20T10:05:00Z",
  });
  assert.equal(n.user_name, "bob@demo.local");
  assert.equal(n.src_ip, "198.51.100.23");
});

test("4.7 AD 4625 (แบบแบน): event_id → event_subtype, เติม action/severity จากตาราง EventID", () => {
  const n = normalizeLog({
    tenant: "demoA", source: "ad", event_id: 4625, event_type: "LogonFailed", user: "demo\\eve",
    host: "DC01", ip: "203.0.113.77", logon_type: 3, "@timestamp": "2025-08-20T11:11:11Z",
  });
  assert.equal(n.event_subtype, "EventID_4625");
  assert.equal(n.action, "deny");
  assert.equal(n.severity, 5);
  assert.equal(n.user_name, "demo\\eve");
});

// ---- รูปแบบดั้งเดิมของผู้ผลิต ----

test("AWS CloudTrail ต้นฉบับ", () => {
  const n = normalizeLog({
    eventTime: "2026-09-20T09:10:00Z", eventSource: "iam.amazonaws.com", eventName: "CreateUser",
    awsRegion: "ap-southeast-1", sourceIPAddress: "203.0.113.9", recipientAccountId: "123456789012",
    userIdentity: { type: "IAMUser", userName: "admin" },
  });
  assert.equal(n.source, "aws");
  assert.equal(n.event_type, "CreateUser");
  assert.equal(n.cloud_service, "iam");
  assert.equal(n.cloud_region, "ap-southeast-1");
  assert.equal(n.user_name, "admin");
  assert.equal(n.src_ip, "203.0.113.9");
  assert.equal(n.action, "create");
});

test("AWS ConsoleLogin ที่ล้มเหลว → event_type ConsoleLoginFailed (เข้ากฎ alert ได้), sourceIPAddress ที่ไม่ใช่ IP → null", () => {
  const n = normalizeLog({
    eventTime: "2026-09-20T09:12:30Z", eventSource: "signin.amazonaws.com", eventName: "ConsoleLogin",
    sourceIPAddress: "AWS Internal", responseElements: { ConsoleLogin: "Failure" }, userIdentity: { type: "Root" },
  });
  assert.equal(n.event_type, "ConsoleLoginFailed");
  assert.equal(n.severity, 5);
  assert.equal(n.src_ip, null);
});

test("Microsoft 365 Unified Audit Log ต้นฉบับ: CreationTime ไม่มี timezone ถือเป็น UTC, ClientIP ที่มีพอร์ตถูกตัดพอร์ต", () => {
  const n = normalizeLog({
    CreationTime: "2026-09-20T10:07:12", Operation: "UserLoginFailed", RecordType: 15, ResultStatus: "Failed",
    UserId: "bob@demo.local", ClientIP: "203.0.113.55:51234", Workload: "AzureActiveDirectory",
  });
  assert.equal(n.source, "m365");
  assert.equal(n.timestamp.toISOString(), "2026-09-20T10:07:12.000Z");
  assert.equal(n.src_ip, "203.0.113.55");
  assert.equal(n.action, "deny");
  assert.equal(n.user_name, "bob@demo.local");
});

test("Windows Security EventID 4625 ต้นฉบับ", () => {
  const n = normalizeLog({
    EventID: 4625, Channel: "Security", Computer: "DC01", TimeCreated: { SystemTime: "2026-09-20T11:11:11Z" },
    TargetUserName: "eve", TargetDomainName: "DEMO", IpAddress: "203.0.113.77", LogonType: 3,
  });
  assert.equal(n.source, "ad");
  assert.equal(n.event_type, "LogonFailed");
  assert.equal(n.event_subtype, "EventID_4625");
  assert.equal(n.user_name, "DEMO\\eve");
  assert.equal(n.host, "DC01");
});

test("CrowdStrike Falcon detection ต้นฉบับ: SeverityName → severity 0–10", () => {
  const n = normalizeLog({
    metadata: { eventType: "DetectionSummaryEvent", eventCreationTime: 1789898400000 },
    event: { ComputerName: "WIN10-01", UserName: "alice", FileName: "powershell.exe", SeverityName: "Critical",
      Tactic: "Execution", Technique: "PowerShell", PatternDispositionDescription: "Process was quarantined" },
  });
  assert.equal(n.source, "crowdstrike");
  assert.equal(n.severity, 9);
  assert.equal(n.action, "quarantine");
  assert.equal(n.host, "WIN10-01");
  assert.equal(n.process, "powershell.exe");
});

// ---- การตรวจข้อมูลผิดรูปแบบ (ต้องเป็น ValidationError ไม่ใช่ error ของฐานข้อมูล) ----

test("ข้อมูลผิดรูปแบบถูกปฏิเสธด้วย ValidationError", () => {
  for (const bad of [
    { source: "api", severity: "banana" },
    { source: "api", "@timestamp": "not-a-date" },
    { source: "api", tenant: "ชื่อ tenant ไม่ถูกต้อง!" },
    [1, 2, 3],
    "just a string",
    null,
  ]) {
    assert.throws(() => normalizeLog(bad), ValidationError, JSON.stringify(bad));
  }
});

test("severity รับได้ทั้งตัวเลขและชื่อ และถูกจำกัดที่ 0–10", () => {
  assert.equal(parseSeverity("high"), 7);
  assert.equal(parseSeverity("Critical"), 9);
  assert.equal(parseSeverity(99), 10);
  assert.equal(parseSeverity(-3), 0);
  assert.equal(parseSeverity(undefined), 0);
});

test("timestamp: epoch วินาที/มิลลิวินาที และข้อความ", () => {
  assert.equal(parseTimestamp(1789898400).toISOString(), "2026-09-20T10:00:00.000Z");
  assert.equal(parseTimestamp(1789898400000).toISOString(), "2026-09-20T10:00:00.000Z");
  assert.equal(parseTimestamp("2025-08-20T07:20:00+07:00").toISOString(), "2025-08-20T00:20:00.000Z");
});

test("ความยาวเกินคอลัมน์ถูกตัด และตัวอักษร NUL ถูกลบ (กัน error ตอน INSERT)", () => {
  const n = normalizeLog({ source: "api", event_type: "x".repeat(500), user: "bad\u0000name" });
  assert.equal(n.event_type.length, 100);
  assert.equal(n.user_name, "badname");
});

test("defaultTenant ใช้เมื่อ log ไม่ระบุ tenant", () => {
  assert.equal(normalizeLog({ source: "api" }, { defaultTenant: "demoZ" }).tenant, "demoZ");
  assert.equal(normalizeLog({ source: "api" }).tenant, "default");
});
