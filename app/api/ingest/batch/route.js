// POST /api/ingest/batch — รับ log หลายรายการ: array, {"Records":[...]} (CloudTrail) หรือ object เดียว
// ทั้งชุดถูกบันทึกใน transaction เดียว: ถ้ามีรายการไม่ถูกต้องจะไม่บันทึกเลยและบอกว่ารายการที่เท่าไร
import { handleJsonIngest } from "@/lib/ingest-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  return handleJsonIngest(req);
}
