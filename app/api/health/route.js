// GET /api/health — ใช้เป็น healthcheck ของ Docker (เปิดสาธารณะ ไม่ต้องล็อกอิน และไม่เปิดเผยข้อมูลใดๆ)
import { NextResponse } from "next/server";
import db from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.query("SELECT 1");
    return NextResponse.json({ status: "ok" });
  } catch {
    return NextResponse.json({ status: "db_unavailable" }, { status: 503 });
  }
}
