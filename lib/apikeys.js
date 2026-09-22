// lib/apikeys.js
// API key อ่านจาก env: API_KEYS="demoA=<key>,demoB=<key>,*=<key>"
//   - key ที่ผูกกับ tenant: บังคับให้ log ที่ส่งมาเป็นของ tenant นั้นเสมอ
//   - "*" คือ key ระดับ global (ระบุ tenant ใน payload ได้เอง)
import { createHash, timingSafeEqual } from "node:crypto";
import { TENANT_RE } from "./config.js";

const sha256 = (s) => createHash("sha256").update(String(s)).digest();

export function parseApiKeys(value = process.env.API_KEYS || "") {
  const entries = [];
  for (const part of String(value).split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const tenantRaw = trimmed.slice(0, idx).trim();
    const key = trimmed.slice(idx + 1).trim();
    const tenant = tenantRaw === "*" ? "all" : tenantRaw;
    if (!key || key.includes("CHANGE_ME")) continue; // ยังไม่ได้ตั้งค่าจริง
    if (tenant !== "all" && !TENANT_RE.test(tenant)) continue;
    entries.push({ tenant, digest: sha256(key) });
  }
  return entries;
}

/** คืนชื่อ tenant (หรือ "all") ที่ key นี้เป็นเจ้าของ, ไม่ตรงกับ key ไหนคืน null */
export function resolveApiKey(key, entries = parseApiKeys()) {
  if (!key) return null;
  const digest = sha256(key);
  let matched = null;
  for (const entry of entries) {
    // เทียบครบทุกรายการ (ไม่ return ก่อน) เพื่อลดข้อมูลรั่วจากเวลาตอบสนอง
    if (timingSafeEqual(entry.digest, digest) && matched === null) matched = entry.tenant;
  }
  return matched;
}
