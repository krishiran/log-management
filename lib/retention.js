// lib/retention.js
// ลบ log ที่เก็บเกิน RETENTION_DAYS วัน (ค่าเริ่มต้น 7) — นับจากเวลาที่ระบบรับเข้า (ingested_at)
import db from "./db.js";
import { getRetentionDays } from "./config.js";

export async function cleanupOldLogs() {
  const days = getRetentionDays();
  try {
    const logs = await db.query("DELETE FROM logs WHERE ingested_at < NOW() - make_interval(days => $1::int)", [days]);
    const alerts = await db.query("DELETE FROM alert_events WHERE fired_at < NOW() - make_interval(days => $1::int)", [days]);
    console.log(`[retention] ลบ log ${logs.rowCount} รายการ และ alert ${alerts.rowCount} รายการที่เก่ากว่า ${days} วัน`);
    return { logs: logs.rowCount, alerts: alerts.rowCount };
  } catch (err) {
    console.error("[retention] ล้มเหลว:", err.message);
    return null;
  }
}
