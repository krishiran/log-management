import { NextResponse } from "next/server";
import db from "@/lib/db";
import { SESSION_COOKIE, SESSION_MAX_AGE, signSession } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/password";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// กันเดารหัสผ่าน: ผิดเกิน 5 ครั้งใน 15 นาที (นับต่อ IP+username) จะถูกปฏิเสธชั่วคราว
// (เก็บในหน่วยความจำ — พอสำหรับ demo แบบ instance เดียว)
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 5;
const fails = new Map();

const failKey = (req, username) => `${req.headers.get("x-forwarded-for") || "local"}|${username}`;

function isLocked(key) {
  const rec = fails.get(key);
  if (!rec) return false;
  if (Date.now() - rec.first > WINDOW_MS) {
    fails.delete(key);
    return false;
  }
  return rec.count >= MAX_FAILS;
}

function recordFail(key) {
  const rec = fails.get(key);
  if (!rec || Date.now() - rec.first > WINDOW_MS) fails.set(key, { count: 1, first: Date.now() });
  else rec.count++;
}

// hash จำลองไว้เทียบเมื่อไม่พบผู้ใช้ เพื่อให้เวลาตอบใกล้เคียงกัน (ไม่บอกใบ้ว่ามี username นี้หรือไม่)
const DUMMY_HASH = hashPassword("dummy-password-for-timing");

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "body ต้องเป็น JSON" }, { status: 400 });
  }

  const username = String(body?.username || "").trim().slice(0, 50);
  const password = String(body?.password || "");
  const key = failKey(req, username);

  if (isLocked(key)) {
    return NextResponse.json({ error: "พยายามเข้าสู่ระบบผิดหลายครั้ง กรุณารอสักครู่แล้วลองใหม่" }, { status: 429 });
  }

  try {
    const res = await db.query("SELECT username, password_hash, role, tenant FROM users WHERE username = $1", [username]);
    const user = res.rows[0];
    const ok = verifyPassword(password, user ? user.password_hash : DUMMY_HASH);

    if (!user || !ok) {
      recordFail(key);
      return NextResponse.json({ error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" }, { status: 401 });
    }
    fails.delete(key);

    const token = await signSession({ username: user.username, role: user.role, tenant: user.tenant });
    const response = NextResponse.json({
      status: "success",
      user: { username: user.username, role: user.role, tenant: user.tenant },
    });

    response.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: req.headers.get("x-forwarded-proto") === "https" || req.nextUrl.protocol === "https:",
      path: "/",
      maxAge: SESSION_MAX_AGE,
    });
    return response;
  } catch (err) {
    console.error("[login] error:", err);
    return NextResponse.json({ error: "เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ status: "success" });
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
