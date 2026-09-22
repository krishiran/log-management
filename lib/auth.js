// lib/auth.js
// ใช้เฉพาะ jose (ไม่พึ่ง next/headers) เพื่อให้ middleware และ route handler เรียกใช้ร่วมกันได้
import { SignJWT, jwtVerify } from "jose";
import { getJwtSecret } from "./config.js";

export const SESSION_COOKIE = "user_session";
export const SESSION_MAX_AGE = 60 * 60 * 24; // 1 วัน

export async function signSession({ username, role, tenant }) {
  return new SignJWT({ username, role, tenant })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1d")
    .sign(getJwtSecret());
}

/** ตรวจ token: คืน payload ถ้าถูกต้อง, คืน null ถ้าไม่ถูกต้อง/หมดอายุ */
export async function verifySession(token) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getJwtSecret(), { algorithms: ["HS256"] });
    if (!payload.role || !payload.tenant) return null;
    return payload;
  } catch {
    return null;
  }
}
