// Unit test: การยืนยันตัวตน (รหัสผ่าน, API key, JWT) และตัวสร้างเงื่อนไขค้นหา/กฎ alert   รัน: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword } from "../../lib/password.js";
import { parseApiKeys, resolveApiKey } from "../../lib/apikeys.js";
import { signSession, verifySession } from "../../lib/auth.js";
import { getJwtSecret } from "../../lib/config.js";
import { buildWhere } from "../../lib/query-filters.js";
import { parseRuleInput, toPatterns } from "../../lib/alert-rules.js";
import { ValidationError } from "../../lib/normalize.js";

test("รหัสผ่านเก็บแบบ hash (scrypt) ตรวจถูก/ผิดได้ และ hash ไม่ซ้ำกันแม้รหัสเดียวกัน", () => {
  const h1 = hashPassword("s3cret");
  const h2 = hashPassword("s3cret");
  assert.notEqual(h1, h2);
  assert.ok(h1.startsWith("scrypt$"));
  assert.ok(!h1.includes("s3cret"));
  assert.equal(verifyPassword("s3cret", h1), true);
  assert.equal(verifyPassword("wrong", h1), false);
  assert.equal(verifyPassword("s3cret", "not-a-hash"), false);
  assert.equal(verifyPassword("s3cret", undefined), false);
});

test("API key: ผูกกับ tenant, '*' = global, key ที่ยังเป็น CHANGE_ME ถูกละเลย", () => {
  const entries = parseApiKeys("demoA=key-a, demoB=key-b, *=key-admin, demoC=CHANGE_ME, bad tenant!=k");
  assert.equal(resolveApiKey("key-a", entries), "demoA");
  assert.equal(resolveApiKey("key-b", entries), "demoB");
  assert.equal(resolveApiKey("key-admin", entries), "all");
  assert.equal(resolveApiKey("CHANGE_ME", entries), null);
  assert.equal(resolveApiKey("wrong", entries), null);
  assert.equal(resolveApiKey("", entries), null);
  assert.equal(resolveApiKey(undefined, entries), null);
});

test("JWT: ต้องตั้ง JWT_SECRET จริง (ไม่ใช่ค่าเดาได้), token ที่แก้ไขหรือเซ็นด้วย secret อื่นถูกปฏิเสธ", async () => {
  const saved = process.env.JWT_SECRET;
  try {
    delete process.env.JWT_SECRET;
    assert.throws(() => getJwtSecret(), /JWT_SECRET/);
    process.env.JWT_SECRET = "CHANGE_ME";
    assert.throws(() => getJwtSecret(), /JWT_SECRET/);

    process.env.JWT_SECRET = "unit-test-secret-0123456789abcdef";
    const token = await signSession({ username: "viewerA", role: "viewer", tenant: "demoA" });
    const payload = await verifySession(token);
    assert.equal(payload.role, "viewer");
    assert.equal(payload.tenant, "demoA");

    const tampered = `${token.slice(0, -3)}abc`;
    assert.equal(await verifySession(tampered), null);
    assert.equal(await verifySession(undefined), null);

    process.env.JWT_SECRET = "another-secret-0123456789abcdefgh";
    assert.equal(await verifySession(token), null, "token ที่เซ็นด้วย secret เดิมต้องใช้ไม่ได้");
  } finally {
    if (saved === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = saved;
  }
});

test("buildWhere: ทุกตัวกรองผู้ใช้ไปอยู่ใน parameter ไม่ถูกต่อเข้า SQL (กัน SQL injection)", () => {
  const evil = "x'; DROP TABLE logs; --";
  const { sql, params } = buildWhere({ q: evil, source: evil, tenant: evil, severity: "5", timeframe: "24h" });
  assert.ok(!sql.includes("DROP"), sql);
  assert.ok(params.includes(evil));
  assert.ok(params.includes(5));
  assert.match(sql, /tenant = \$\d+/);
  assert.match(sql, /ingested_at >= NOW\(\) - INTERVAL '24 hours'/);
});

test("buildWhere: timeframe ที่ไม่รู้จักใช้ค่าเริ่มต้น, ตัวอักษร % _ ในคำค้นถูก escape", () => {
  const a = buildWhere({ timeframe: "'; DROP TABLE logs; --" });
  assert.match(a.sql, /INTERVAL '24 hours'/);
  const b = buildWhere({ q: "50%_off", timeframe: "all" });
  assert.equal(b.params[0], "%50\\%\\_off%");
});

test("กฎ alert: แปลงข้อมูลจากฟอร์มและตรวจค่า", () => {
  assert.deepEqual(toPatterns("fail, denied,%block%"), ["%fail%", "%denied%", "%block%"]);

  const rule = parseRuleInput({
    name: "ล็อกอินล้มเหลวซ้ำ", match_event: "fail", min_severity: "", threshold: "3",
    window_seconds: "300", group_by: "src_ip", tenant: "", notify_webhook: "on",
  });
  assert.deepEqual(rule.match_event, ["%fail%"]);
  assert.equal(rule.min_severity, null);
  assert.equal(rule.threshold, 3);
  assert.equal(rule.tenant, null);
  assert.equal(rule.notify_webhook, true);

  const bads = [
    { name: "", match_event: "fail", threshold: "3", window_seconds: "300", group_by: "src_ip" },
    { name: "x", match_event: "", threshold: "3", window_seconds: "300", group_by: "src_ip" },
    { name: "x", match_event: "fail", threshold: "0", window_seconds: "300", group_by: "src_ip" },
    { name: "x", match_event: "fail", threshold: "3", window_seconds: "5", group_by: "src_ip" },
    { name: "x", match_event: "fail", threshold: "3", window_seconds: "300", group_by: "raw; DROP TABLE logs" },
    { name: "x", match_event: "fail", threshold: "3", window_seconds: "300", group_by: "src_ip", tenant: "bad tenant!" },
  ];
  for (const bad of bads) assert.throws(() => parseRuleInput(bad), ValidationError, JSON.stringify(bad));
});
