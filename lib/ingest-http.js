// lib/ingest-http.js
// ส่วนที่ route handler ของ /api/ingest, /api/ingest/batch, /api/ingest/file ใช้ร่วมกัน
import { NextResponse } from "next/server";
import { authenticate } from "./ingest-auth.js";
import { extractRecords, ingestRecords } from "./ingest.js";
import { checkAlerts } from "./alerts.js";
import { ValidationError } from "./normalize.js";

export const unauthorized = () =>
  NextResponse.json(
    { status: "error", error: "Unauthorized: ต้องส่ง header x-api-key ที่ถูกต้อง (หรือเข้าสู่ระบบก่อน)" },
    { status: 401 }
  );

/** รับ records → validate/normalize/บันทึก → ตรวจ alert → ตอบ JSON */
export async function runIngest(records, auth, opts = {}) {
  try {
    const result = await ingestRecords(records, { forcedTenant: auth.tenant, defaultTenant: opts.defaultTenant });
    await checkAlerts().catch((err) => console.error("[alerts] ตรวจกฎไม่สำเร็จ:", err.message));
    return NextResponse.json({ status: "success", inserted: result.inserted }, { status: 201 });
  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json({ status: "error", error: err.message, details: err.details }, { status: err.status });
    }
    console.error("[ingest] error:", err);
    return NextResponse.json({ status: "error", error: "internal server error" }, { status: 500 });
  }
}

/** POST body เป็น JSON: object เดียว, array, หรือ {"Records":[...]} */
export async function handleJsonIngest(req) {
  const auth = await authenticate(req);
  if (!auth) return unauthorized();

  let payload;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ status: "error", error: "body ต้องเป็น JSON" }, { status: 400 });
  }
  return runIngest(extractRecords(payload), auth);
}
