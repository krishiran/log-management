// POST /api/ingest/file — อัปโหลดไฟล์ log (JSON, NDJSON หรือไฟล์ CloudTrail {"Records":[...]})
//   multipart/form-data: field "file" (และ "tenant" ถ้าต้องการกำหนด tenant ให้ log ที่ไม่มีระบุ)
//   หรือส่งเนื้อไฟล์ตรงๆ เป็น body:  curl --data-binary @file.json "…/api/ingest/file?tenant=demoA" -H "x-api-key: …"
import { NextResponse } from "next/server";
import { authenticate } from "@/lib/ingest-auth";
import { MAX_FILE_BYTES, extractRecords, parseJsonOrNdjson } from "@/lib/ingest";
import { runIngest, unauthorized } from "@/lib/ingest-http";
import { ValidationError } from "@/lib/normalize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  const auth = await authenticate(req);
  if (!auth) return unauthorized();

  try {
    let text;
    let defaultTenant;
    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!file || typeof file === "string") throw new ValidationError('ต้องแนบไฟล์ในฟิลด์ชื่อ "file"');
      if (file.size > MAX_FILE_BYTES) throw new ValidationError("ไฟล์ใหญ่เกิน 10 MB", 413);
      text = await file.text();
      defaultTenant = String(form.get("tenant") || "").trim() || undefined;
    } else {
      text = await req.text();
      if (text.length > MAX_FILE_BYTES) throw new ValidationError("ไฟล์ใหญ่เกิน 10 MB", 413);
      defaultTenant = new URL(req.url).searchParams.get("tenant") || undefined;
    }

    const records = extractRecords(parseJsonOrNdjson(text));
    return await runIngest(records, auth, { defaultTenant });
  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json({ status: "error", error: err.message, details: err.details }, { status: err.status });
    }
    console.error("[ingest/file] error:", err);
    return NextResponse.json({ status: "error", error: "internal server error" }, { status: 500 });
  }
}
