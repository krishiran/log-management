// lib/syslog.js
// แกะข้อความ Syslog (RFC3164 / RFC5424 แบบหลวม) ให้เป็นฟิลด์แบบแบน แล้วส่งเข้า normalizeLog
import { StringDecoder } from "node:string_decoder";
import { cleanIp, normalizeLog } from "./normalize.js";

const PRI_RE = /^<(\d{1,3})>/;
// <134>Aug 20 12:44:56 fw01 ...   หรือ   <134>1 2025-08-20T12:44:56Z fw01 ...
const HEADER_RE = /^(?:<\d{1,3}>)?(?:\d\s)?(?:[A-Z][a-z]{2}\s+\d{1,2}\s\d{2}:\d{2}:\d{2}|\d{4}-\d{2}-\d{2}T\S+)\s+(\S+)\s+(.*)$/s;

/** key=value ที่ค่าอาจมีเว้นวรรคได้ (ค่าสิ้นสุดเมื่อเจอ key= ตัวถัดไป) หรือครอบด้วย "..." */
export function parseKeyValues(text) {
  const out = {};
  const re = /([\w.-]+)=("[^"]*"|.*?)(?=\s+[\w.-]+=|$)/gs;
  let m;
  while ((m = re.exec(text)) !== null) {
    const key = m[1].toLowerCase();
    let value = m[2].trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (!(key in out)) out[key] = value;
  }
  return out;
}

/** "10.0.0.5=demoB,10.0.0.6=demoA" → { "10.0.0.5": "demoB", ... } */
export function parseTenantMap(value = process.env.SYSLOG_TENANT_MAP || "") {
  const map = {};
  for (const part of String(value).split(",")) {
    const [ip, tenant] = part.split("=").map((s) => s.trim());
    if (ip && tenant) map[ip] = tenant;
  }
  return map;
}

/**
 * tenant ของ syslog เลือกตามลำดับ: (1) tenant=... ในข้อความ (2) IP ของอุปกรณ์ตาม SYSLOG_TENANT_MAP (3) SYSLOG_DEFAULT_TENANT
 * @returns ฟิลด์แบบแบน พร้อมส่งเข้า normalizeLog
 */
export function parseSyslog(message, remoteIp, opts = {}) {
  const text = String(message).trim();
  const pri = text.match(PRI_RE);
  const priority = pri ? Number.parseInt(pri[1], 10) : 13;
  const syslogSeverity = priority % 8; // 0 = emergency ... 7 = debug

  const head = text.match(HEADER_RE);
  const hostname = head ? head[1] : null;
  const body = head ? head[2] : text.replace(PRI_RE, "");
  const kv = parseKeyValues(body);

  const looksLikeFirewall = Boolean(kv.action || kv.src || kv.dst || kv.proto || kv.policy);
  const action = kv.action ? kv.action.toLowerCase() : null;

  let severity = Math.round(((7 - syslogSeverity) * 10) / 7); // <134> (info) → 1
  if (action === "deny" || action === "drop" || action === "block") severity = Math.max(severity, 3);

  const tenantMap = opts.tenantMap || parseTenantMap();
  const defaultTenant = opts.defaultTenant || process.env.SYSLOG_DEFAULT_TENANT || "default";
  const tenant = kv.tenant || tenantMap[remoteIp] || defaultTenant;

  let eventType = "syslog_event";
  if (looksLikeFirewall) {
    if (action === "deny" || action === "drop" || action === "block") eventType = "traffic_deny";
    else if (action === "allow" || action === "accept") eventType = "traffic_allow";
  } else if (kv.event) {
    eventType = kv.event.replace(/-/g, "_");
  }

  return {
    timestamp: new Date(), // ใช้เวลาที่รับ (เวลาใน header ของ syslog ไม่มีปีและ timezone จึงไม่น่าเชื่อถือ)
    tenant,
    source: looksLikeFirewall ? "firewall" : "network",
    vendor: kv.vendor,
    product: kv.product,
    event_type: eventType,
    severity,
    action,
    src_ip: kv.src || kv.src_ip || remoteIp,
    dst_ip: kv.dst || kv.dst_ip,
    src_port: kv.spt || kv.src_port,
    dst_port: kv.dpt || kv.dst_port,
    protocol: kv.proto || kv.protocol,
    host: hostname,
    rule_name: kv.policy || kv.rule,
    rule_id: kv.ruleid || kv.rule_id,
    tags: ["syslog"],
    raw: text,
    // เก็บรายละเอียดที่แกะได้ไว้ใน data เพื่อค้นย้อนหลัง
    msg: kv.msg,
    syslog_priority: priority,
    remote_ip: remoteIp,
  };
}

/** แกะข้อความ syslog แล้ว normalize ในขั้นตอนเดียว */
export function syslogToLog(message, remoteIp, opts = {}) {
  return normalizeLog(parseSyslog(message, cleanIp(remoteIp) || remoteIp, opts));
}

/** ตัดข้อความ TCP ตามบรรทัด (TCP เป็น stream: 1 chunk อาจมีหลายข้อความ หรือข้อความเดียวถูกแบ่งหลาย chunk) */
export function createLineBuffer(onLine, maxLength = 65536) {
  const decoder = new StringDecoder("utf8");
  let buffer = "";
  const emit = (line) => {
    const clean = line.replace(/\r$/, "");
    if (clean.trim()) onLine(clean);
  };
  return {
    push(chunk) {
      buffer += decoder.write(chunk);
      let idx;
      while ((idx = buffer.indexOf("\n")) >= 0) {
        emit(buffer.slice(0, idx));
        buffer = buffer.slice(idx + 1);
      }
      if (buffer.length > maxLength) {
        emit(buffer); // กันบัฟเฟอร์โตไม่จำกัดถ้าไม่มี newline
        buffer = "";
      }
    },
    flush() {
      buffer += decoder.end();
      emit(buffer);
      buffer = "";
    },
  };
}
