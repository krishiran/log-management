import { redirect } from "next/navigation";
import DashboardView from "@/components/DashboardView";
import { getSession, scopeTenant } from "@/lib/session";
import { DEFAULT_TIMEFRAME, TIMEFRAMES, countLogs, filterOptions, searchLogs, timeline, topN } from "@/lib/queries";
import { EMPTY_SUMMARY, severitySummary } from "@/lib/summary";
import { listAlertEvents } from "@/lib/alerts";

export const dynamic = "force-dynamic";

const one = (v) => (Array.isArray(v) ? v[0] : v) || "";

export default async function Home({ searchParams }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const params = await searchParams;
  const q = one(params?.q);
  const severity = one(params?.severity);
  const source = one(params?.source);
  const timeframe = TIMEFRAMES[one(params?.timeframe)] ? one(params?.timeframe) : DEFAULT_TIMEFRAME;
  const isAdmin = session.role === "admin";

  // viewer ถูกล็อกที่ tenant ของตนเสมอ (กำหนดจาก JWT ฝั่ง server ไม่ใช่จาก parameter)
  const tenant = scopeTenant(session, one(params?.tenant));
  const filters = { q, severity, source, timeframe, tenant };

  const data = {
    logs: [],
    total: 0,
    topIps: [],
    topUsers: [],
    topEvents: [],
    topSources: [],
    tl: { bucket: "hour", points: [] },
    options: { sources: [], tenants: [] },
    alerts: [],
    alertCount: 0,
    summary: EMPTY_SUMMARY,
  };
  let errorMsg = null;

  try {
    const [logs, total, topIps, topUsers, topEvents, topSources, tl, options, recentAlerts, summary] = await Promise.all([
      searchLogs(filters, { limit: 50 }),
      countLogs(filters),
      topN("src_ip", filters),
      topN("user_name", filters),
      topN("event_type", filters),
      topN("source", filters),
      timeline(filters),
      filterOptions(isAdmin ? "" : session.tenant),
      listAlertEvents({ tenant, hours: 1, limit: 100 }),
      severitySummary(filters),
    ]);
    Object.assign(data, {
      logs,
      total,
      topIps,
      topUsers,
      topEvents,
      topSources,
      tl,
      options,
      alerts: recentAlerts.slice(0, 5),
      alertCount: recentAlerts.length,
      summary,
    });
  } catch (err) {
    console.error("[dashboard] query error:", err);
    errorMsg = "ไม่สามารถดึงข้อมูลจากฐานข้อมูลได้ กรุณาลองใหม่อีกครั้ง";
  }

  return (
    <DashboardView
      session={session}
      filters={{ q, severity, source, timeframe, tenant }}
      data={data}
      isAdmin={isAdmin}
      errorMsg={errorMsg}
    />
  );
}
