"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { createRule, deleteRule, parseRuleInput, setRuleEnabled } from "@/lib/alerts";
import { ValidationError } from "@/lib/normalize";

// จัดการกฎ alert ได้เฉพาะ admin (viewer ดูได้อย่างเดียว) — ตรวจซ้ำที่ฝั่ง server ทุกครั้ง ไม่เชื่อว่าปุ่มถูกซ่อนอยู่

async function requireAdmin() {
  const session = await getSession();
  if (!session || session.role !== "admin") throw new Error("ต้องเป็น admin เท่านั้น");
  return session;
}

export async function createRuleAction(formData) {
  const session = await requireAdmin();

  let rule;
  try {
    rule = parseRuleInput({
      name: formData.get("name"),
      tenant: formData.get("tenant"),
      match_event: formData.get("match_event"),
      min_severity: formData.get("min_severity"),
      threshold: formData.get("threshold"),
      window_seconds: formData.get("window_seconds"),
      group_by: formData.get("group_by"),
      notify_webhook: formData.get("notify_webhook") === "on",
    });
  } catch (err) {
    if (err instanceof ValidationError) redirect(`/alerts?error=${encodeURIComponent(err.message)}`);
    throw err;
  }

  await createRule(rule, session.username);
  revalidatePath("/alerts");
  redirect("/alerts");
}

export async function toggleRuleAction(formData) {
  await requireAdmin();
  const id = Number.parseInt(formData.get("id"), 10);
  if (Number.isFinite(id)) await setRuleEnabled(id, formData.get("enabled") === "true");
  revalidatePath("/alerts");
}

export async function deleteRuleAction(formData) {
  await requireAdmin();
  const id = Number.parseInt(formData.get("id"), 10);
  if (Number.isFinite(id)) await deleteRule(id);
  revalidatePath("/alerts");
}
