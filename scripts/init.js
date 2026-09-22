// scripts/init.js
// รันทุกครั้งที่ container เว็บเริ่มทำงาน (และด้วยคำสั่ง `npm run init`):
//   1) รอฐานข้อมูลพร้อม  2) สร้าง/อัปเดตตารางตาม lib/schema.sql (รันซ้ำได้)
//   3) สร้างผู้ใช้เริ่มต้นถ้ายังไม่มีผู้ใช้เลย (รหัสผ่านมาจาก .env และเก็บแบบ hash)
//   4) สร้างกฎ alert ตัวอย่างถ้ายังไม่มีกฎเลย
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import db from "../lib/db.js";
import { hashPassword } from "../lib/password.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForDatabase() {
  for (let attempt = 1; attempt <= 30; attempt++) {
    try {
      await db.query("SELECT 1");
      return;
    } catch (err) {
      console.log(`[init] รอฐานข้อมูลพร้อม (${attempt}/30): ${err.message}`);
      await sleep(2000);
    }
  }
  throw new Error("เชื่อมต่อฐานข้อมูลไม่ได้");
}

async function seedUsers() {
  const { rows } = await db.query("SELECT COUNT(*)::int AS n FROM users");
  if (rows[0].n > 0) return;

  const defaults = [
    { username: "admin", role: "admin", tenant: "all", env: "ADMIN_PASSWORD" },
    { username: "viewerA", role: "viewer", tenant: "demoA", env: "VIEWERA_PASSWORD" },
    { username: "viewerB", role: "viewer", tenant: "demoB", env: "VIEWERB_PASSWORD" },
  ];

  for (const u of defaults) {
    let password = process.env[u.env];
    if (!password || password.includes("CHANGE_ME")) {
      password = randomBytes(9).toString("base64url");
      console.log(`[init] ${u.env} ไม่ได้ตั้งค่า → สร้างรหัสผ่านสุ่มให้ ${u.username}: ${password}  (จดไว้ จะแสดงครั้งเดียว)`);
    }
    await db.query("INSERT INTO users (username, password_hash, role, tenant) VALUES ($1, $2, $3, $4)", [
      u.username,
      hashPassword(password),
      u.role,
      u.tenant,
    ]);
  }
  console.log("[init] สร้างผู้ใช้เริ่มต้นแล้ว: admin, viewerA (demoA), viewerB (demoB)");
}

async function seedRules() {
  const { rows } = await db.query("SELECT COUNT(*)::int AS n FROM alert_rules");
  if (rows[0].n > 0) return;

  await db.query(
    `INSERT INTO alert_rules (name, match_event, min_severity, threshold, window_seconds, group_by, created_by)
     VALUES ($1, $2, NULL, 3, 300, 'src_ip', 'system'),
            ($3, '{}', 8, 1, 300, 'host', 'system')`,
    ["ล็อกอินล้มเหลวซ้ำจาก IP เดิม (≥3 ครั้งใน 5 นาที)", ["%fail%"], "เหตุการณ์ระดับวิกฤต (severity ≥ 8)"]
  );
  console.log("[init] สร้างกฎ alert เริ่มต้น 2 กฎ");
}

try {
  await waitForDatabase();
  await db.query(fs.readFileSync(path.join(here, "../lib/schema.sql"), "utf8"));
  console.log("[init] ตารางพร้อมใช้งาน");
  await seedUsers();
  await seedRules();
  await db.end();
} catch (err) {
  console.error("[init] ล้มเหลว:", err.message);
  process.exit(1);
}
