// GET /api/logs?q=&source=&severity=&timeframe=1h|24h|7d|all&tenant=&limit=&offset=
// ค้นหา log — ใช้ cookie session (เข้าสู่ระบบแล้ว) หรือ header x-api-key
// viewer / key ที่ผูก tenant จะเห็นเฉพาะ tenant ของตน (ค่า ?tenant= ถูกละเลย)
import { NextResponse } from "next/server";
import { authenticate } from "@/lib/ingest-auth";
import { countLogs, searchLogs } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  const auth = await authenticate(req);
  if (!auth) return NextResponse.json({ status: "error", error: "Unauthorized" }, { status: 401 });

  const p = new URL(req.url).searchParams;
  const tenant = auth.tenant === "all" ? p.get("tenant") || "" : auth.tenant;
  const filters = {
    q: p.get("q") || "",
    source: p.get("source") || "",
    severity: p.get("severity") || "",
    timeframe: p.get("timeframe") || "24h",
    tenant,
  };

  try {
    const [rows, total] = await Promise.all([
      searchLogs(filters, { limit: p.get("limit") || 50, offset: p.get("offset") || 0 }),
      countLogs(filters),
    ]);
    return NextResponse.json({ status: "success", total, count: rows.length, rows });
  } catch (err) {
    console.error("[logs] error:", err);
    return NextResponse.json({ status: "error", error: "internal server error" }, { status: 500 });
  }
}
