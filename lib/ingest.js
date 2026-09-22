// lib/ingest.js
// ขั้นตอนรับ log เข้าระบบ (ใช้ร่วมกันทุกทาง: HTTP, batch, อัปโหลดไฟล์, syslog)
//   ตรวจ + normalize ทุกรายการก่อน → ถ้ามีรายการผิดจะไม่บันทึกอะไรเลย → บันทึกทั้งหมดใน transaction เดียว
import db from "./db.js";
import { normalizeLog, ValidationError } from "./normalize.js";
import { scheduleAlertCheck } from "./alerts.js";

export const MAX_BATCH = 5000;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

const COLUMNS = [
  "timestamp", "tenant", "source", "vendor", "product", "event_type", "event_subtype",
  "severity", "action", "src_ip", "src_port", "dst_ip", "dst_port", "protocol",
  "user_name", "host", "process", "url", "http_method", "status_code",
  "rule_name", "rule_id", "cloud_account_id", "cloud_region", "cloud_service",
  "tags", "raw", "data",
];

// jsonb ไม่รับ \u0000
const jsonText = (v) => JSON.stringify(v).replace(/\\u0000/g, "");

function toRow(n) {
  return [
    n.timestamp, n.tenant, n.source, n.vendor, n.product, n.event_type, n.event_subtype,
    n.severity, n.action, n.src_ip, n.src_port, n.dst_ip, n.dst_port, n.protocol,
    n.user_name, n.host, n.process, n.url, n.http_method, n.status_code,
    n.rule_name, n.rule_id, n.cloud_account_id, n.cloud_region, n.cloud_service,
    jsonText(n.tags), n.raw, jsonText(n.data),
  ];
}

/** INSERT หลายแถวต่อ 1 คำสั่ง (แบ่งชุดละ 500 แถว) — executor คือ db หรือ client ใน transaction */
export async function insertNormalized(executor, list) {
  const CHUNK = 500;
  for (let i = 0; i < list.length; i += CHUNK) {
    const params = [];
    const tuples = list.slice(i, i + CHUNK).map((n) => {
      const placeholders = toRow(n).map((v) => {
        params.push(v);
        return `$${params.length}`;
      });
      return `(${placeholders.join(",")})`;
    });
    await executor.query(`INSERT INTO logs (${COLUMNS.join(", ")}) VALUES ${tuples.join(",")}`, params);
  }
  return list.length;
}

/** log ที่ normalize แล้ว (เช่นจาก syslog) → บันทึก + ตั้งเวลาตรวจ alert */
export async function saveNormalized(list) {
  await insertNormalized(db, list);
  scheduleAlertCheck();
  return list.length;
}

/** รองรับ array, object เดี่ยว, และไฟล์ CloudTrail ({"Records":[...]}) */
export function extractRecords(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    for (const key of ["Records", "records"]) {
      if (Array.isArray(payload[key])) return payload[key];
    }
  }
  return [payload];
}

/** JSON ปกติ หรือ NDJSON (1 บรรทัดต่อ 1 log) */
export function parseJsonOrNdjson(text) {
  const trimmed = String(text).trim();
  if (!trimmed) throw new ValidationError("ไฟล์ว่าง");
  try {
    return JSON.parse(trimmed);
  } catch {
    const out = [];
    const lines = trimmed.split(/\r?\n/).filter((l) => l.trim());
    lines.forEach((line, i) => {
      try {
        out.push(JSON.parse(line));
      } catch {
        throw new ValidationError(`ไม่ใช่ JSON/NDJSON ที่ถูกต้อง (บรรทัดที่ ${i + 1})`);
      }
    });
    return out;
  }
}

/**
 * @param {unknown[]} records
 * @param {{forcedTenant?: string, defaultTenant?: string}} opts
 *   forcedTenant: tenant ของ API key/ผู้ใช้ — บังคับทับค่าใน payload เสมอ ("all" = ไม่บังคับ)
 */
export async function ingestRecords(records, { forcedTenant, defaultTenant } = {}) {
  if (records.length === 0) throw new ValidationError("ไม่มี log ให้รับเข้า");
  if (records.length > MAX_BATCH) throw new ValidationError(`ส่งได้ไม่เกิน ${MAX_BATCH} รายการต่อครั้ง`, 413);

  const list = [];
  const errors = [];
  records.forEach((record, index) => {
    try {
      const isObject = record && typeof record === "object" && !Array.isArray(record);
      const body = isObject && forcedTenant && forcedTenant !== "all" ? { ...record, tenant: forcedTenant } : record;
      list.push(normalizeLog(body, { defaultTenant }));
    } catch (err) {
      if (!(err instanceof ValidationError)) throw err;
      errors.push({ index, error: err.message });
    }
  });

  if (errors.length > 0) {
    throw new ValidationError("มีบางรายการไม่ถูกต้อง จึงไม่ได้บันทึกรายการใดเลย", 400, errors.slice(0, 20));
  }

  await db.withTransaction((client) => insertNormalized(client, list));
  return { inserted: list.length, tenants: [...new Set(list.map((n) => n.tenant))] };
}
