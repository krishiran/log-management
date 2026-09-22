// lib/ingest-auth.js
// ยืนยันตัวตนของ request ที่เข้า /api/ingest*, /api/logs ได้ 2 แบบ
//   1) header x-api-key            (เครื่องส่ง log / สคริปต์)
//   2) cookie session ของผู้ใช้      (เรียกจากหน้าเว็บ)
import { resolveApiKey } from "./apikeys.js";
import { SESSION_COOKIE, verifySession } from "./auth.js";

/** @returns {Promise<null | {type: "api_key"|"session", tenant: string, user?: string, role?: string}>} tenant = "all" หมายถึงเข้าถึงได้ทุก tenant */
export async function authenticate(req) {
  const apiKey = req.headers.get("x-api-key");
  if (apiKey) {
    const tenant = resolveApiKey(apiKey);
    return tenant ? { type: "api_key", tenant } : null;
  }

  const token = req.cookies?.get(SESSION_COOKIE)?.value;
  const session = await verifySession(token);
  if (session) {
    return {
      type: "session",
      tenant: session.role === "admin" ? "all" : session.tenant,
      user: session.username,
      role: session.role,
    };
  }
  return null;
}
