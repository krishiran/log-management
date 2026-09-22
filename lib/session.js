// lib/session.js
// ดึง session ของผู้ใช้จาก cookie (ใช้ใน Server Component / Server Action)
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "./auth.js";

export async function getSession() {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value);
}

/** คืน tenant ที่ผู้ใช้นี้มีสิทธิ์ดู: admin เลือกได้อิสระ (ค่าว่าง = ทุก tenant), viewer ถูกล็อกที่ tenant ของตน */
export function scopeTenant(session, requested) {
  if (session.role === "admin") return requested || "";
  return session.tenant;
}
