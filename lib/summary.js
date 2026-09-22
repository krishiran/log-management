// lib/summary.js
// ตัวเลขสรุปสำหรับการ์ด/กราฟโดนัทบน Dashboard (อ่านอย่างเดียว)
// ใช้ buildWhere ชุดเดียวกับหน้าค้นหา จึงเคารพตัวกรองและการล็อก tenant ของ viewer เหมือนเดิมทุกประการ
import db from "./db.js";
import { buildWhere } from "./query-filters.js";

export const EMPTY_SUMMARY = { critical: 0, high: 0, medium: 0, info: 0, sources: 0 };

/** จำนวน log แยกระดับ severity (CRITICAL ≥ 8, HIGH 5-7, MEDIUM 3-4, INFO < 3) และจำนวน source ที่ไม่ซ้ำ */
export async function severitySummary(filters) {
  const { sql, params } = buildWhere(filters);
  const res = await db.query(
    `SELECT COUNT(*) FILTER (WHERE COALESCE(severity, 0) >= 8)::int AS critical,
            COUNT(*) FILTER (WHERE COALESCE(severity, 0) >= 5 AND COALESCE(severity, 0) < 8)::int AS high,
            COUNT(*) FILTER (WHERE COALESCE(severity, 0) >= 3 AND COALESCE(severity, 0) < 5)::int AS medium,
            COUNT(*) FILTER (WHERE COALESCE(severity, 0) < 3)::int AS info,
            COUNT(DISTINCT source)::int AS sources
       FROM logs WHERE ${sql}`,
    params
  );
  return res.rows[0] || EMPTY_SUMMARY;
}
