// lib/webhook.js
// ส่งแจ้งเตือนเมื่อ "กฎ alert" เข้าเงื่อนไข (ไม่ส่งทุก event)
// ตั้งค่าที่ .env: DISCORD_WEBHOOK_URL, SLACK_WEBHOOK_URL, WEBHOOK_URL (ระบบอื่นที่รับ JSON)

export function buildAlertMessage(alert) {
  const lines = [
    `🚨 [ALERT] ${alert.rule_name}`,
    `Tenant: ${alert.tenant}`,
    `${alert.group_by}: ${alert.group_key}`,
    `พบ ${alert.hits} เหตุการณ์ (severity สูงสุด ${alert.max_severity}) ภายใน ${alert.window_seconds} วินาที`,
  ];
  return lines.join("\n").slice(0, 1900); // Discord จำกัด 2000 ตัวอักษร
}

async function post(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

/** @returns {Promise<number>} จำนวนปลายทางที่ส่งสำเร็จ */
export async function sendAlertNotification(alert) {
  const text = buildAlertMessage(alert);
  const jobs = [];
  if (process.env.DISCORD_WEBHOOK_URL) jobs.push(["discord", post(process.env.DISCORD_WEBHOOK_URL, { content: text })]);
  if (process.env.SLACK_WEBHOOK_URL) jobs.push(["slack", post(process.env.SLACK_WEBHOOK_URL, { text })]);
  if (process.env.WEBHOOK_URL) jobs.push(["webhook", post(process.env.WEBHOOK_URL, { text, content: text, alert })]);

  const results = await Promise.allSettled(jobs.map(([, p]) => p));
  let ok = 0;
  results.forEach((r, i) => {
    if (r.status === "fulfilled") ok++;
    else console.error(`[webhook:${jobs[i][0]}] ส่งไม่สำเร็จ:`, r.reason?.message || r.reason);
  });
  return ok;
}
