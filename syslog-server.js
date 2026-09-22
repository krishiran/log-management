// syslog-server.js
// ตัวรับ Syslog แบบ UDP + TCP (พอร์ต SYSLOG_PORT ค่าเริ่มต้น 514) → แกะข้อความ → normalize → บันทึกลง Postgres
// รันเป็น service แยกใน docker-compose (ชื่อ syslog) จึงไม่ผูกกับเว็บ: เว็บล่มก็ยังรับ log ได้ และกลับกัน
import dgram from "node:dgram";
import net from "node:net";
import db from "./lib/db.js";
import { saveNormalized } from "./lib/ingest.js";
import { cleanIp } from "./lib/normalize.js";
import { cleanupOldLogs } from "./lib/retention.js";
import { createLineBuffer, parseTenantMap, syslogToLog } from "./lib/syslog.js";

const PORT = Number.parseInt(process.env.SYSLOG_PORT || "514", 10);
const opts = {
  defaultTenant: process.env.SYSLOG_DEFAULT_TENANT || "default",
  tenantMap: parseTenantMap(),
};

async function handleMessage(message, remoteIp, proto) {
  try {
    const log = syslogToLog(message, remoteIp, opts);
    await saveNormalized([log]);
    console.log(`[syslog ${proto}] ${remoteIp} tenant=${log.tenant} source=${log.source} → ${message.slice(0, 80)}`);
  } catch (err) {
    console.error(`[syslog ${proto}] ประมวลผลไม่สำเร็จ (${remoteIp}):`, err.message);
  }
}

function fatal(label, err) {
  console.error(`[syslog] ${label} ผิดพลาด:`, err.message);
  process.exit(1); // ให้ Docker restart (restart: unless-stopped) แทนที่จะค้างอยู่โดยไม่รับ log
}

// ---------------------------------------------------------------- UDP
const udp = dgram.createSocket("udp4");
udp.on("message", (msg, rinfo) => {
  const remoteIp = cleanIp(rinfo.address) || rinfo.address;
  // 1 datagram อาจมีหลายบรรทัด
  for (const line of msg.toString("utf8").split(/\r?\n/)) {
    if (line.trim()) handleMessage(line, remoteIp, "udp");
  }
});
udp.on("error", (err) => fatal(`UDP :${PORT}`, err));
udp.on("listening", () => console.log(`📡 Syslog UDP listening on :${PORT}`));
udp.bind(PORT);

// ---------------------------------------------------------------- TCP
const tcp = net.createServer((socket) => {
  const remoteIp = cleanIp(socket.remoteAddress) || socket.remoteAddress || "unknown";
  const lines = createLineBuffer((line) => handleMessage(line, remoteIp, "tcp"));

  socket.setTimeout(5 * 60 * 1000);
  socket.on("data", (chunk) => lines.push(chunk));
  socket.on("end", () => lines.flush());
  socket.on("timeout", () => socket.destroy());
  // ถ้าไม่มี handler นี้ ECONNRESET จากฝั่งอุปกรณ์จะทำให้ทั้ง process ล้ม
  socket.on("error", (err) => console.error(`[syslog tcp] connection ${remoteIp}:`, err.message));
});
tcp.on("error", (err) => fatal(`TCP :${PORT}`, err));
tcp.listen(PORT, () => console.log(`📡 Syslog TCP listening on :${PORT}`));

// ---------------------------------------------------------------- Retention (ลบ log เก่า)
cleanupOldLogs();
const retentionTimer = setInterval(cleanupOldLogs, 6 * 60 * 60 * 1000);

// ---------------------------------------------------------------- ปิดตัวอย่างเรียบร้อยเมื่อ docker stop
async function shutdown() {
  console.log("[syslog] กำลังปิด...");
  clearInterval(retentionTimer);
  udp.close();
  tcp.close();
  await db.end().catch(() => {});
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
