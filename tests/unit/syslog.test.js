// Unit test: ตัวแกะ Syslog   รัน: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { createLineBuffer, parseKeyValues, syslogToLog } from "../../lib/syslog.js";

const FW = "<134>Aug 20 12:44:56 fw01 vendor=demo product=ngfw action=deny src=10.0.1.10 dst=8.8.8.8 spt=5353 dpt=53 proto=udp msg=DNS blocked policy=Block-DNS";
const RT = "<190>Aug 20 13:01:02 r1 if=ge-0/0/1 event=link-down mac=aa:bb:cc:dd:ee:ff reason=carrier-loss";
const OPTS = { defaultTenant: "demoA", tenantMap: {} };

test("โจทย์ 4.1 Firewall syslog: แกะฟิลด์ครบและ normalize เป็น source=firewall", () => {
  const n = syslogToLog(FW, "192.0.2.1", OPTS);
  assert.equal(n.source, "firewall");
  assert.equal(n.tenant, "demoA");
  assert.equal(n.vendor, "demo");
  assert.equal(n.product, "ngfw");
  assert.equal(n.event_type, "traffic_deny");
  assert.equal(n.action, "deny");
  assert.equal(n.src_ip, "10.0.1.10");
  assert.equal(n.dst_ip, "8.8.8.8");
  assert.equal(n.src_port, 5353);
  assert.equal(n.dst_port, 53);
  assert.equal(n.protocol, "udp");
  assert.equal(n.host, "fw01");
  assert.equal(n.rule_name, "Block-DNS");
  assert.ok(n.severity >= 3, "deny ต้องมี severity อย่างน้อย 3");
  assert.equal(n.raw, FW);
});

test("โจทย์ 4.2 Router syslog: source=network, event=link-down → link_down", () => {
  const n = syslogToLog(RT, "192.0.2.9", OPTS);
  assert.equal(n.source, "network");
  assert.equal(n.event_type, "link_down");
  assert.equal(n.host, "r1");
  assert.equal(n.src_ip, "192.0.2.9", "ไม่มี src= ให้ใช้ IP ของอุปกรณ์ที่ส่งมา");
});

test("tenant: ข้อความ (tenant=) ชนะ map ตาม IP และชนะค่า default", () => {
  const opts = { defaultTenant: "demoA", tenantMap: { "192.0.2.9": "demoB" } };
  assert.equal(syslogToLog(RT, "192.0.2.9", opts).tenant, "demoB");
  assert.equal(syslogToLog(`${RT} tenant=demoC`, "192.0.2.9", opts).tenant, "demoC");
  assert.equal(syslogToLog(RT, "192.0.2.77", opts).tenant, "demoA");
});

test("IPv6-mapped IPv4 (::ffff:1.2.3.4) ถูกแปลงเป็น IPv4", () => {
  assert.equal(syslogToLog(RT, "::ffff:192.0.2.9", OPTS).src_ip, "192.0.2.9");
});

test("parseKeyValues: ค่ามีเว้นวรรคและค่าที่ครอบด้วย \"\"", () => {
  const kv = parseKeyValues('a=1 msg=DNS blocked by policy b="x y z" c=3');
  assert.equal(kv.a, "1");
  assert.equal(kv.msg, "DNS blocked by policy");
  assert.equal(kv.b, "x y z");
  assert.equal(kv.c, "3");
});

test("TCP framing: ข้อความถูกตัดตามบรรทัดแม้มาเป็นหลาย chunk / หลายข้อความใน chunk เดียว", () => {
  const lines = [];
  const buf = createLineBuffer((l) => lines.push(l));
  buf.push(Buffer.from("first\nsec"));
  buf.push(Buffer.from("ond\r\nthird\n"));
  buf.push(Buffer.from("last-without-newline"));
  buf.flush();
  assert.deepEqual(lines, ["first", "second", "third", "last-without-newline"]);
});

test("TCP framing: ตัวอักษรไทย (UTF-8) ที่ถูกแบ่งกลาง chunk ไม่เพี้ยน", () => {
  const bytes = Buffer.from("ทดสอบ\n", "utf8");
  const lines = [];
  const buf = createLineBuffer((l) => lines.push(l));
  buf.push(bytes.subarray(0, 4));
  buf.push(bytes.subarray(4));
  assert.deepEqual(lines, ["ทดสอบ"]);
});
