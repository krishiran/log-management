// lib/config.js
// ค่าตั้งต้นที่ใช้ร่วมกันทั้งระบบ (อ่านจาก environment ตอนเรียกใช้ ไม่อ่านตอน build)

export const TENANT_RE = /^[A-Za-z0-9_.-]{1,50}$/;

/** คืน JWT secret เป็น Uint8Array ถ้ายังไม่ได้ตั้งค่า (หรือยังเป็นค่า CHANGE_ME) จะ throw เพื่อไม่ให้ระบบรันด้วย secret ที่เดาได้ */
export function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 16 || secret.includes("CHANGE_ME")) {
    throw new Error(
      "JWT_SECRET ยังไม่ได้ตั้งค่า (ต้องยาวอย่างน้อย 16 ตัวอักษรและไม่ใช่ค่า CHANGE_ME) — ดู .env.example หรือรัน ./run.sh เพื่อสร้าง .env ให้อัตโนมัติ"
    );
  }
  return new TextEncoder().encode(secret);
}

/** เขตเวลาที่ใช้แสดงผลบนหน้าเว็บ (ตรวจรูปแบบก่อน เพราะบางจุดถูกนำไปใช้ใน SQL) */
export function getTimezone() {
  const tz = process.env.APP_TIMEZONE || "Asia/Bangkok";
  return /^[A-Za-z0-9_/+-]{1,64}$/.test(tz) ? tz : "Asia/Bangkok";
}

export function getRetentionDays() {
  const n = Number.parseInt(process.env.RETENTION_DAYS || "7", 10);
  return Number.isFinite(n) && n >= 1 ? n : 7;
}
