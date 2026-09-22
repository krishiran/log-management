import { redirect } from "next/navigation";
import AlertsView from "@/components/AlertsView";
import { getSession, scopeTenant } from "@/lib/session";
import { listAlertEvents, listRules } from "@/lib/alerts";
import { createRuleAction, deleteRuleAction, toggleRuleAction } from "./actions";

export const dynamic = "force-dynamic";

const one = (v) => (Array.isArray(v) ? v[0] : v) || "";

export default async function AlertsPage({ searchParams }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const params = await searchParams;
  const error = one(params?.error);
  const isAdmin = session.role === "admin";
  const tenant = scopeTenant(session, ""); // admin = ทุก tenant, viewer = tenant ของตน

  let events = [];
  let rules = [];
  let errorMsg = null;
  try {
    [events, rules] = await Promise.all([
      listAlertEvents({ tenant, hours: 24, limit: 100 }),
      listRules(tenant),
    ]);
  } catch (err) {
    console.error("[alerts] query error:", err);
    errorMsg = "ไม่สามารถดึงข้อมูลจากฐานข้อมูลได้";
  }

  return (
    <AlertsView
      session={session}
      events={events}
      rules={rules}
      error={error || errorMsg}
      isAdmin={isAdmin}
      actions={{ create: createRuleAction, toggle: toggleRuleAction, remove: deleteRuleAction }}
    />
  );
}
