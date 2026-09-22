// GET /api/alerts?hours=24&limit=100 — รายการ alert ที่เกิดขึ้น (ใช้ cookie session หรือ header x-api-key)
// viewer / key ที่ผูก tenant จะเห็นเฉพาะ tenant ของตน
import { NextResponse } from "next/server";
import { authenticate } from "@/lib/ingest-auth";
import { listAlertEvents } from "@/lib/alerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  const auth = await authenticate(req);
  if (!auth) return NextResponse.json({ status: "error", error: "Unauthorized" }, { status: 401 });

  const p = new URL(req.url).searchParams;
  const tenant = auth.tenant === "all" ? p.get("tenant") || "" : auth.tenant;
  const hours = Math.min(Math.max(Number.parseInt(p.get("hours") || "24", 10) || 24, 1), 168);
  const limit = Math.min(Math.max(Number.parseInt(p.get("limit") || "100", 10) || 100, 1), 500);

  try {
    const rows = await listAlertEvents({ tenant, hours, limit });
    return NextResponse.json({ status: "success", count: rows.length, rows });
  } catch (err) {
    console.error("[alerts] error:", err);
    return NextResponse.json({ status: "error", error: "internal server error" }, { status: 500 });
  }
}
