// lib/query-filters.js
// ตัวสร้างเงื่อนไข WHERE สำหรับค้นหา log (ไม่แตะฐานข้อมูล — แยกไว้เพื่อให้ unit test ได้)
// ตัวกรองทุกตัวใช้ parameter ($1, $2, ...) เสมอ ส่วนช่วงเวลามาจาก whitelist ด้านล่างเท่านั้น

// ตัวกรองเวลานับจากเวลาที่ระบบรับเข้า (ingested_at) เพื่อให้เห็น log ที่เพิ่งส่งมาทันที แม้ @timestamp จะเป็นเวลาในอดีต
export const TIMEFRAMES = {
  "1h": { label: "ล่าสุด 1 ชั่วโมง", interval: "1 hour", bucket: "5min" },
  "24h": { label: "ล่าสุด 24 ชั่วโมง", interval: "24 hours", bucket: "hour" },
  "7d": { label: "ล่าสุด 7 วัน", interval: "7 days", bucket: "day" },
  all: { label: "ทั้งหมด", interval: null, bucket: "day" },
};

export const DEFAULT_TIMEFRAME = "24h";


const escapeLike = (s) => String(s).replace(/[\\%_]/g, (c) => `\\${c}`);

/** @param {{q?: string, severity?: string|number, tenant?: string, source?: string, timeframe?: string}} f */
export function buildWhere(f = {}) {
  const cond = [];
  const params = [];
  const add = (sql, value) => {
    params.push(value);
    cond.push(sql.replace("?", `$${params.length}`));
  };

  const tf = TIMEFRAMES[f.timeframe] || TIMEFRAMES[DEFAULT_TIMEFRAME];
  if (tf.interval) cond.push(`ingested_at >= NOW() - INTERVAL '${tf.interval}'`);

  if (f.tenant) add("tenant = ?", f.tenant);
  if (f.source) add("source = ?", f.source);

  if (f.severity !== undefined && f.severity !== "") {
    const n = Number.parseInt(f.severity, 10);
    if (Number.isFinite(n)) add("severity >= ?", n);
  }

  if (f.q) {
    params.push(`%${escapeLike(f.q)}%`);
    const p = `$${params.length}`;
    cond.push(`(raw ILIKE ${p} OR event_type ILIKE ${p} OR user_name ILIKE ${p} OR src_ip ILIKE ${p} OR host ILIKE ${p})`);
  }

  return { sql: cond.length ? cond.join(" AND ") : "TRUE", params };
}
