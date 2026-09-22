// lib/normalize.js
// แปลง log จากหลายแหล่งให้เป็น Schema กลาง (ดู docs/architecture.md หัวข้อ Schema)
//
// รองรับ 2 แบบ:
//   1) JSON "แบบแบน" ที่ผู้ส่งเตรียมมาแล้ว (ตัวอย่างในโจทย์ข้อ 4) — รองรับชื่อฟิลด์หลายแบบ (ip/src/src_ip ฯลฯ)
//   2) รูปแบบ "ดั้งเดิมของผู้ผลิต" — AWS CloudTrail, Microsoft 365 Unified Audit Log,
//      Windows Security Event, CrowdStrike Falcon detection
//
// ทุกข้อมูลที่ผ่านเข้ามาจะถูกตรวจ/ตัดความยาวก่อนลงฐานข้อมูล ถ้าข้อมูลผิดรูปแบบจะ throw ValidationError (HTTP 400)
import { isIP } from "node:net";
import { TENANT_RE } from "./config.js";

export class ValidationError extends Error {
  constructor(message, status = 400, details = undefined) {
    super(message);
    this.name = "ValidationError";
    this.status = status;
    this.details = details;
  }
}

// ---------- ตัวช่วยตรวจ/แปลงค่า ----------

// eslint-disable-next-line no-control-regex
const NUL_RE = /\u0000/g;

function str(v, max = 100) {
  if (v === undefined || v === null || v === "") return null;
  const s = (typeof v === "object" ? JSON.stringify(v) : String(v)).replace(NUL_RE, "").trim();
  return s ? s.slice(0, max) : null;
}

function int(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

function port(v) {
  const n = int(v);
  return n !== null && n >= 0 && n <= 65535 ? n : null;
}

/** คืนค่าแรกที่ไม่ว่างจากรายชื่อ key */
function pick(obj, ...keys) {
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

export function cleanIp(v) {
  if (v === undefined || v === null) return null;
  let s = String(v).trim();
  if (!s || s === "-") return null;
  const bracket = s.match(/^\[([^\]]+)\](?::\d+)?$/); // [::1]:443
  if (bracket) s = bracket[1];
  else if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(s)) s = s.replace(/:\d+$/, ""); // 1.2.3.4:5678
  s = s.replace(/^::ffff:/i, "");
  return isIP(s) ? s : null;
}

function isPrivateIp(ip) {
  if (!ip) return false;
  return /^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|127\.|169\.254\.|::1$|f[cd][0-9a-f]{2}:|fe80:)/i.test(ip);
}

/** แปลง timestamp หลายรูปแบบ (RFC3339, epoch วินาที/มิลลิวินาที, "YYYY-MM-DD HH:mm:ss" ที่ไม่มี timezone ถือเป็น UTC) */
export function parseTimestamp(v) {
  if (v === undefined || v === null || v === "") return new Date();
  let d;
  if (v instanceof Date) {
    d = v;
  } else if (typeof v === "number" || /^\d+(\.\d+)?$/.test(String(v).trim())) {
    const n = Number(v);
    d = new Date(n < 1e11 ? n * 1000 : n);
  } else {
    let s = String(v).trim();
    if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s)) s = `${s.replace(" ", "T")}Z`;
    d = new Date(s);
  }
  if (Number.isNaN(d.getTime())) {
    throw new ValidationError(`timestamp ไม่ถูกต้อง: ${String(v).slice(0, 50)}`);
  }
  return d;
}

const SEVERITY_NAMES = {
  emergency: 10,
  critical: 9,
  fatal: 9,
  alert: 9,
  high: 7,
  major: 7,
  error: 6,
  medium: 5,
  moderate: 5,
  warning: 4,
  warn: 4,
  low: 3,
  minor: 3,
  notice: 2,
  informational: 1,
  info: 1,
  debug: 0,
  none: 0,
};

/** severity 0–10: รับตัวเลข หรือชื่อ (critical/high/medium/low/info ...) */
export function parseSeverity(v, fallback = 0) {
  if (v === undefined || v === null || v === "") return fallback;
  if (typeof v === "number" || /^-?\d+(\.\d+)?$/.test(String(v).trim())) {
    return Math.min(10, Math.max(0, Math.round(Number(v))));
  }
  const mapped = SEVERITY_NAMES[String(v).trim().toLowerCase()];
  if (mapped === undefined) throw new ValidationError(`severity ไม่ถูกต้อง: ${String(v).slice(0, 30)}`);
  return mapped;
}

function tagList(...lists) {
  const out = [];
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const t of list) {
      const s = str(t, 50);
      if (s && !out.includes(s)) out.push(s);
    }
  }
  return out.slice(0, 20);
}

// ---------- Mapper ของแต่ละผู้ผลิต (รูปแบบดั้งเดิม → ฟิลด์แบบแบน) ----------

const AWS_CREATE_RE = /^(Create|Put|Run|Start|Attach|Add|Register|Import|Enable|Update)/;
const AWS_DELETE_RE = /^(Delete|Terminate|Remove|Detach|Disable|Deregister|Stop)/;

function awsAction(name) {
  if (!name) return null;
  if (name === "ConsoleLogin") return "login";
  if (AWS_CREATE_RE.test(name)) return "create";
  if (AWS_DELETE_RE.test(name)) return "delete";
  return null;
}

function isCloudTrail(b) {
  return typeof b.eventName === "string" && Boolean(b.eventSource || b.awsRegion || b.eventTime);
}

function fromCloudTrail(b) {
  const ui = b.userIdentity && typeof b.userIdentity === "object" ? b.userIdentity : {};
  const consoleFailed =
    b.eventName === "ConsoleLogin" && String(b.responseElements?.ConsoleLogin || "").toLowerCase() === "failure";
  return {
    "@timestamp": b.eventTime,
    tenant: b.tenant,
    source: "aws",
    vendor: "AWS",
    product: "CloudTrail",
    event_type: consoleFailed ? "ConsoleLoginFailed" : b.eventName,
    event_subtype: b.eventSource,
    severity: consoleFailed ? 5 : b.errorCode ? 4 : 1,
    action: consoleFailed ? "deny" : awsAction(b.eventName),
    src_ip: b.sourceIPAddress,
    user: ui.userName || ui.arn || ui.principalId || ui.type,
    cloud: {
      service: String(b.eventSource || "").replace(/\.amazonaws\.com$/, "") || undefined,
      account_id: b.recipientAccountId || ui.accountId,
      region: b.awsRegion,
    },
    tags: b.errorCode ? [`error:${b.errorCode}`] : [],
  };
}

function isM365(b) {
  return typeof b.Operation === "string" && Boolean(b.Workload || b.RecordType !== undefined || b.UserId);
}

function fromM365(b) {
  const op = b.Operation;
  const failed = /fail/i.test(op) || /fail/i.test(String(b.ResultStatus || ""));
  let action = null;
  if (failed) action = "deny";
  else if (/logg?ed ?in|login/i.test(op)) action = "login";
  else if (/(Delete|Remove|Purge)/i.test(op)) action = "delete";
  else if (/^(Create|Add|New)/i.test(op)) action = "create";
  const object = typeof b.ObjectId === "string" && /^https?:\/\//i.test(b.ObjectId) ? b.ObjectId : undefined;
  return {
    "@timestamp": b.CreationTime,
    tenant: b.tenant,
    source: "m365",
    vendor: "Microsoft",
    product: b.Workload || "Microsoft 365",
    event_type: op,
    event_subtype: b.RecordType !== undefined ? `RecordType_${b.RecordType}` : undefined,
    severity: failed ? 5 : 0,
    action,
    src_ip: b.ClientIP || b.ClientIPAddress,
    user: b.UserId,
    url: object,
    tags: b.ResultStatus ? [`result:${b.ResultStatus}`] : [],
  };
}

// EventID ของ Windows Security ที่พบบ่อย: [ชื่อกลาง, action, severity]
const WIN_EVENTS = {
  4624: ["LogonSuccess", "login", 0],
  4625: ["LogonFailed", "deny", 5],
  4634: ["Logoff", "logout", 0],
  4647: ["Logoff", "logout", 0],
  4648: ["ExplicitCredentialLogon", "login", 2],
  4672: ["SpecialPrivilegesAssigned", null, 2],
  4720: ["UserCreated", "create", 3],
  4726: ["UserDeleted", "delete", 4],
  4740: ["AccountLockedOut", "deny", 6],
};

function isWindowsEvent(b) {
  return b.EventID !== undefined && (b.Computer !== undefined || b.Channel !== undefined || b.TargetUserName !== undefined || b.IpAddress !== undefined);
}

function fromWindows(b) {
  const id = int(b.EventID);
  const known = WIN_EVENTS[id];
  const domain = str(b.TargetDomainName, 60);
  const name = str(b.TargetUserName || b.SubjectUserName, 60);
  return {
    "@timestamp": b.TimeCreated?.SystemTime || b.TimeCreated || b["@timestamp"],
    tenant: b.tenant,
    source: "ad",
    vendor: "Microsoft",
    product: "Windows Security",
    event_id: id,
    event_type: known ? known[0] : `EventID_${id}`,
    severity: known ? known[2] : 1,
    action: known ? known[1] : null,
    user: name ? (domain ? `${domain}\\${name}` : name) : undefined,
    host: b.Computer || b.WorkstationName,
    src_ip: b.IpAddress,
  };
}

function isCrowdStrike(b) {
  return b.metadata && typeof b.metadata === "object" && b.event && typeof b.event === "object";
}

function fromCrowdStrike(b) {
  const e = b.event;
  const m = b.metadata;
  let severity = e.SeverityName;
  if (severity === undefined && e.Severity !== undefined) {
    const n = Number(e.Severity);
    severity = n <= 5 ? n * 2 : Math.round(n / 10); // Falcon ใช้ทั้งสเกล 1–5 และ 0–100
  }
  const disposition = String(e.PatternDispositionDescription || "");
  return {
    "@timestamp": m.eventCreationTime,
    tenant: b.tenant,
    source: "crowdstrike",
    vendor: "CrowdStrike",
    product: "Falcon",
    event_type: m.eventType,
    event_subtype: [e.Tactic, e.Technique].filter(Boolean).join(": ") || undefined,
    severity,
    action: /quarantin/i.test(disposition) ? "quarantine" : "alert",
    host: e.ComputerName,
    user: e.UserName,
    process: e.FileName,
    src_ip: e.LocalIP,
    rule_name: e.DetectName || e.DetectDescription,
    rule_id: e.DetectId || e.PatternId,
    tags: tagList([e.Tactic, e.Technique]),
  };
}

/** ตรวจว่า body เป็นรูปแบบของผู้ผลิตรายใด แล้วแปลงเป็นฟิลด์แบบแบน (ถ้าไม่ตรงคืน body เดิม) */
function toFlat(body) {
  if (isCrowdStrike(body)) return fromCrowdStrike(body);
  if (isCloudTrail(body)) return fromCloudTrail(body);
  if (isM365(body)) return fromM365(body);
  if (isWindowsEvent(body)) return fromWindows(body);
  return body;
}

// ---------- ตัวหลัก ----------

/**
 * @param {object} body log ดิบ (แบบแบน หรือรูปแบบของผู้ผลิต)
 * @param {{defaultTenant?: string}} [opts]
 * @returns log ตาม Schema กลาง พร้อมลงตาราง logs (timestamp เป็น Date, tags เป็น array, raw เป็น string, data คือต้นฉบับ)
 */
export function normalizeLog(body, opts = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ValidationError("แต่ละ log ต้องเป็น JSON object");
  }

  const f = toFlat(body);
  const cloud = f.cloud && typeof f.cloud === "object" ? f.cloud : {};

  const source = str(f.source, 50) || "unknown";
  const tenant = str(f.tenant, 50) || opts.defaultTenant || "default";
  if (!TENANT_RE.test(tenant)) {
    throw new ValidationError("tenant ต้องเป็นตัวอักษร ตัวเลข หรือ . _ - ไม่เกิน 50 ตัว");
  }

  // AD/Windows แบบแบน (มี event_id): เติม action/severity ที่ขาดจากตาราง EventID
  const winId = source === "ad" ? int(pick(f, "event_id", "EventID")) : null;
  const win = winId !== null ? WIN_EVENTS[winId] : undefined;

  const srcIp = cleanIp(pick(f, "src_ip", "ip", "src"));
  const eventType = str(pick(f, "event_type", "event") ?? win?.[0], 100) || "unknown";

  let action = str(f.action ?? win?.[1], 50);
  if (!action && source === "aws") action = awsAction(eventType);

  const tags = tagList(f.tags, f._tags);
  if (srcIp) {
    const t = isPrivateIp(srcIp) ? "internal_ip" : "external_ip";
    if (!tags.includes(t)) tags.push(t);
  }

  let raw;
  if (f.raw !== undefined && f.raw !== null && f.raw !== "") {
    raw = typeof f.raw === "string" ? f.raw : JSON.stringify(f.raw);
  } else {
    raw = JSON.stringify(body);
  }

  return {
    timestamp: parseTimestamp(pick(f, "@timestamp", "timestamp")),
    tenant,
    source,
    vendor: str(f.vendor, 50),
    product: str(f.product, 50),
    event_type: eventType,
    event_subtype: str(f.event_subtype ?? (winId !== null ? `EventID_${winId}` : undefined), 100),
    severity: parseSeverity(f.severity, win?.[2] ?? 0),
    action,
    src_ip: srcIp,
    src_port: port(pick(f, "src_port", "spt")),
    dst_ip: cleanIp(pick(f, "dst_ip", "dst")),
    dst_port: port(pick(f, "dst_port", "dpt")),
    protocol: str(pick(f, "protocol", "proto"), 20),
    user_name: str(pick(f, "user", "username", "user_name"), 100),
    host: str(pick(f, "host", "hostname"), 100),
    process: str(f.process, 100),
    url: str(f.url, 2000),
    http_method: str(pick(f, "http_method", "method"), 10),
    status_code: int(f.status_code),
    rule_name: str(pick(f, "rule_name", "rule"), 100),
    rule_id: str(f.rule_id, 100),
    cloud_account_id: str(cloud.account_id ?? f.cloud_account_id, 100),
    cloud_region: str(cloud.region ?? f.cloud_region, 50),
    cloud_service: str(cloud.service ?? f.cloud_service, 50),
    tags,
    raw: raw.replace(NUL_RE, "").slice(0, 32768),
    data: body,
  };
}
