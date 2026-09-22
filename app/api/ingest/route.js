// POST /api/ingest — รับ log 1 รายการ (หรือหลายรายการเป็น array) เป็น JSON
// ยืนยันตัวตนด้วย header x-api-key (key ที่ผูกกับ tenant จะบังคับ tenant ให้เอง)
import { handleJsonIngest } from "@/lib/ingest-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  return handleJsonIngest(req);
}
