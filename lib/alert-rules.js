// lib/alert-rules.js
// ส่วนที่ไม่แตะฐานข้อมูล: ตรวจ/แปลงข้อมูลกฎ alert จากฟอร์ม (แยกไว้เพื่อให้ unit test ได้ง่าย)
import { TENANT_RE } from "./config.js";
import { ValidationError } from "./normalize.js";

export const GROUP_BY_OPTIONS = { src_ip: "src_ip", user_name: "user_name", host: "host" };

/** ข้อความหลายคำ คั่นด้วย , → รูปแบบ ILIKE เช่น "fail, denied" → ["%fail%", "%denied%"] */
export function toPatterns(text) {
  return String(text || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => (s.includes("%") ? s : `%${s}%`))
    .slice(0, 10);
}

export function parseRuleInput(input) {
  const name = String(input.name || "").trim().slice(0, 100);
  if (!name) throw new ValidationError("ต้องตั้งชื่อกฎ");

  const patterns = toPatterns(input.match_event);
  const minSeverityRaw = String(input.min_severity ?? "").trim();
  const minSeverity = minSeverityRaw === "" ? null : Number.parseInt(minSeverityRaw, 10);
  if (minSeverity !== null && !(minSeverity >= 0 && minSeverity <= 10)) {
    throw new ValidationError("min_severity ต้องอยู่ระหว่าง 0–10");
  }
  if (patterns.length === 0 && minSeverity === null) {
    throw new ValidationError("ต้องระบุคำที่ใช้จับ event_type หรือ severity ขั้นต่ำอย่างน้อย 1 อย่าง");
  }

  const threshold = Number.parseInt(input.threshold, 10);
  if (!(threshold >= 1 && threshold <= 100000)) throw new ValidationError("threshold ต้องเป็นจำนวนเต็ม 1–100000");

  const windowSeconds = Number.parseInt(input.window_seconds, 10);
  if (!(windowSeconds >= 10 && windowSeconds <= 86400)) throw new ValidationError("window_seconds ต้องอยู่ระหว่าง 10–86400");

  const groupBy = GROUP_BY_OPTIONS[input.group_by];
  if (!groupBy) throw new ValidationError("group_by ต้องเป็น src_ip, user_name หรือ host");

  const tenant = String(input.tenant || "").trim() || null;
  if (tenant && !TENANT_RE.test(tenant)) throw new ValidationError("tenant ไม่ถูกต้อง");

  return {
    name,
    tenant,
    match_event: patterns,
    min_severity: minSeverity,
    threshold,
    window_seconds: windowSeconds,
    group_by: groupBy,
    notify_webhook: input.notify_webhook === true || input.notify_webhook === "on",
  };
}
