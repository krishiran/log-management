import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";

// เส้นทางที่ไม่ต้องมี session:
//   /login, /api/login   — หน้า/API เข้าสู่ระบบ
//   /api/health          — healthcheck
//   /api/ingest*         — ตรวจสิทธิ์เองด้วย x-api-key (หรือ session) ใน route handler
const PUBLIC_PREFIXES = ["/login", "/api/login", "/api/health", "/api/ingest"];

export async function middleware(req) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  // /api/logs และ /api/alerts รับได้ทั้ง session และ x-api-key จึงให้ route handler ตัดสินเอง
  if ((pathname === "/api/logs" || pathname === "/api/alerts") && req.headers.get("x-api-key")) {
    return NextResponse.next();
  }

  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ status: "error", error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
