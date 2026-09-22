// lib/alerts.js
// กฎแจ้งเตือนแบบ threshold:  "มี event ที่ตรงเงื่อนไข ≥ N ครั้ง ภายใน W วินาที โดยจัดกลุ่มตาม src_ip/user/host"
//   ตัวอย่างกฎเริ่มต้น: ล็อกอินล้มเหลว (event_type มีคำว่า fail) ≥ 3 ครั้งจาก IP เดิมภายใน 5 นาที
// นับจากเวลาที่ระบบ "รับเข้า" (ingested_at) เพื่อให้ log ที่มี timestamp ย้อนหลังก็ยังถูกตรวจ
import db from "./db.js";
import { GROUP_BY_OPTIONS } from "./alert-rules.js";
import { sendAlertNotification } from "./webhook.js";

export { GROUP_BY_OPTIONS, parseRuleInput, toPatterns } from "./alert-rules.js";

export async function createRule(rule, createdBy) {
  const res = await db.query(
    `INSERT INTO alert_rules (name, tenant, match_event, min_severity, threshold, window_seconds, group_by, notify_webhook, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
    [rule.name, rule.tenant, rule.match_event, rule.min_severity, rule.threshold, rule.window_seconds, rule.group_by, rule.notify_webhook, createdBy || null]
  );
  return res.rows[0].id;
}

export async function setRuleEnabled(id, enabled) {
  await db.query("UPDATE alert_rules SET enabled = $2 WHERE id = $1", [id, enabled]);
}

export async function deleteRule(id) {
  await db.query("DELETE FROM alert_rules WHERE id = $1", [id]);
}

/** viewer เห็นเฉพาะกฎที่ใช้กับ tenant ของตน (หรือกฎที่ใช้กับทุก tenant) */
export async function listRules(tenant) {
  const res = await db.query(
    `SELECT * FROM alert_rules WHERE ($1::text IS NULL OR tenant IS NULL OR tenant = $1::text) ORDER BY id`,
    [tenant || null]
  );
  return res.rows;
}

export async function listAlertEvents({ tenant, hours = 24, limit = 100 } = {}) {
  const res = await db.query(
    `SELECT * FROM alert_events
     WHERE fired_at >= NOW() - make_interval(hours => $1::int) AND ($2::text IS NULL OR tenant = $2::text)
     ORDER BY fired_at DESC LIMIT $3::int`,
    [hours, tenant || null, limit]
  );
  return res.rows;
}

/** หาว่าตอนนี้มี group ไหนเข้าเงื่อนไขของกฎบ้าง */
export async function evaluateRule(executor, rule) {
  const col = GROUP_BY_OPTIONS[rule.group_by] || "src_ip"; // ค่าจาก whitelist เท่านั้น จึงต่อ string ได้อย่างปลอดภัย
  const res = await executor.query(
    `SELECT tenant,
            COALESCE(NULLIF(${col}::text, ''), '(ไม่ระบุ)') AS group_key,
            COUNT(*)::int AS hits,
            MAX(severity)::int AS max_severity,
            MAX(timestamp) AS last_seen
       FROM logs
      WHERE ingested_at >= NOW() - make_interval(secs => $1::int)
        AND (event_type ILIKE ANY($2::text[]) OR ($3::int IS NOT NULL AND severity >= $3::int))
        AND ($4::text IS NULL OR tenant = $4::text)
      GROUP BY tenant, group_key
     HAVING COUNT(*) >= $5::int
      ORDER BY last_seen DESC
      LIMIT 50`,
    [rule.window_seconds, rule.match_event || [], rule.min_severity, rule.tenant, rule.threshold]
  );
  return res.rows;
}

/**
 * ตรวจทุกกฎที่เปิดอยู่ แล้วบันทึก alert ใหม่ (กันซ้ำ: กลุ่มเดิมจะไม่ถูกแจ้งอีกจนกว่าจะพ้นช่วง window ของกฎ)
 * ใช้ advisory lock กัน 2 process (web + syslog) ตรวจพร้อมกันแล้วแจ้งซ้ำ
 */
export async function checkAlerts() {
  const fired = await db.withTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(74210)");
    const rules = (await client.query("SELECT * FROM alert_rules WHERE enabled")).rows;
    const created = [];

    for (const rule of rules) {
      const matches = await evaluateRule(client, rule);
      for (const m of matches) {
        const ins = await client.query(
          `INSERT INTO alert_events (rule_id, rule_name, tenant, group_by, group_key, hits, max_severity, last_seen)
           SELECT $1::int, $2::text, $3::text, $4::text, $5::text, $6::int, $7::int, $8::timestamptz
            WHERE NOT EXISTS (
              SELECT 1 FROM alert_events
               WHERE rule_id = $1::int AND tenant = $3::text AND group_key = $5::text
                 AND fired_at > NOW() - make_interval(secs => $9::int))
           RETURNING id`,
          [rule.id, rule.name, m.tenant, rule.group_by, m.group_key, m.hits, m.max_severity, m.last_seen, Math.max(60, rule.window_seconds)]
        );
        if (ins.rowCount > 0) {
          created.push({
            id: ins.rows[0].id,
            notify: rule.notify_webhook,
            rule_name: rule.name,
            tenant: m.tenant,
            group_by: rule.group_by,
            group_key: m.group_key,
            hits: m.hits,
            max_severity: m.max_severity,
            window_seconds: rule.window_seconds,
          });
        }
      }
    }
    return created;
  });

  // ส่ง webhook หลัง commit แล้ว (ช้า/ล้มเหลวก็ไม่กระทบการบันทึก alert)
  for (const alert of fired) {
    if (!alert.notify) continue;
    const ok = await sendAlertNotification(alert).catch(() => 0);
    if (ok > 0) await db.query("UPDATE alert_events SET notified = TRUE WHERE id = $1", [alert.id]);
  }
  return fired;
}

let timer = null;

/** ใช้กับ syslog ที่เข้ามาถี่ๆ: รวมการตรวจให้เหลือครั้งเดียวต่อช่วงสั้นๆ */
export function scheduleAlertCheck(delayMs = 2000) {
  if (timer) return;
  timer = setTimeout(async () => {
    timer = null;
    try {
      await checkAlerts();
    } catch (err) {
      console.error("[alerts] ตรวจกฎไม่สำเร็จ:", err.message);
    }
  }, delayMs);
  if (typeof timer.unref === "function") timer.unref();
}
