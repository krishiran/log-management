// lib/queries.js
// คำสั่งค้นหา/สรุปผลสำหรับ Dashboard และ GET /api/logs
// ตัวกรองทุกตัวใช้ parameter ($1, $2, ...) เสมอ ส่วนชื่อคอลัมน์/ช่วงเวลามาจาก whitelist ด้านล่างเท่านั้น
import db from "./db.js";
import { getTimezone } from "./config.js";
import { DEFAULT_TIMEFRAME, TIMEFRAMES, buildWhere } from "./query-filters.js";

export { DEFAULT_TIMEFRAME, TIMEFRAMES, buildWhere } from "./query-filters.js";

const TOP_FIELDS = { src_ip: "src_ip", user_name: "user_name", event_type: "event_type", source: "source" };

export async function searchLogs(filters, { limit = 50, offset = 0 } = {}) {
  const { sql, params } = buildWhere(filters);
  const lim = Math.min(Math.max(Number.parseInt(limit, 10) || 50, 1), 200);
  const off = Math.max(Number.parseInt(offset, 10) || 0, 0);
  params.push(lim, off);
  const res = await db.query(
    `SELECT * FROM logs WHERE ${sql} ORDER BY timestamp DESC, id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return res.rows;
}

export async function countLogs(filters) {
  const { sql, params } = buildWhere(filters);
  const res = await db.query(`SELECT COUNT(*)::int AS n FROM logs WHERE ${sql}`, params);
  return res.rows[0].n;
}

export async function topN(field, filters, n = 5) {
  const col = TOP_FIELDS[field];
  if (!col) throw new Error(`unsupported field: ${field}`);
  const { sql, params } = buildWhere(filters);
  params.push(n);
  const res = await db.query(
    `SELECT ${col} AS key, COUNT(*)::int AS count
       FROM logs
      WHERE ${sql} AND ${col} IS NOT NULL AND ${col} <> ''
      GROUP BY ${col}
      ORDER BY count DESC, key
      LIMIT $${params.length}`,
    params
  );
  return res.rows;
}

/** จำนวน log ต่อช่วงเวลา (5 นาที / ชั่วโมง / วัน ตามช่วงที่เลือก) เรียงจากเก่าไปใหม่ */
export async function timeline(filters, maxBuckets = 24) {
  const tf = TIMEFRAMES[filters.timeframe] || TIMEFRAMES[DEFAULT_TIMEFRAME];
  const tz = getTimezone();
  const bucketSql = {
    "5min": "date_bin('5 minutes', ingested_at, TIMESTAMPTZ '2000-01-01 00:00:00+00')",
    hour: "date_trunc('hour', ingested_at)",
    day: `(date_trunc('day', ingested_at AT TIME ZONE '${tz}') AT TIME ZONE '${tz}')`,
  }[tf.bucket];

  const { sql, params } = buildWhere(filters);
  params.push(maxBuckets);
  const res = await db.query(
    `SELECT ${bucketSql} AS bucket, COUNT(*)::int AS count
       FROM logs WHERE ${sql}
      GROUP BY 1 ORDER BY 1 DESC LIMIT $${params.length}`,
    params
  );
  return { bucket: tf.bucket, points: res.rows.reverse() };
}

/** ค่าสำหรับ dropdown ตัวกรอง (source ทั้งหมด และ tenant ทั้งหมดสำหรับ admin) */
export async function filterOptions(tenant) {
  const sources = await db.query(
    `SELECT DISTINCT source FROM logs WHERE ($1::text IS NULL OR tenant = $1::text) ORDER BY source LIMIT 100`,
    [tenant || null]
  );
  const result = { sources: sources.rows.map((r) => r.source), tenants: [] };
  if (!tenant) {
    const tenants = await db.query("SELECT DISTINCT tenant FROM logs ORDER BY tenant LIMIT 100");
    result.tenants = tenants.rows.map((r) => r.tenant);
  }
  return result;
}
