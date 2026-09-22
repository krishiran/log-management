// scripts/set-password.js
// เปลี่ยนรหัสผ่านผู้ใช้ที่มีอยู่แล้ว โดยไม่ลบข้อมูล
//   docker compose exec app node scripts/set-password.js <ชื่อผู้ใช้> <รหัสผ่านใหม่>
//   เช่น  docker compose exec app node scripts/set-password.js admin MyNewPass123
import db from "../lib/db.js";
import { hashPassword } from "../lib/password.js";
 
const [username, password] = process.argv.slice(2);
 
if (!username || !password) {
  console.error("วิธีใช้: node scripts/set-password.js <ชื่อผู้ใช้> <รหัสผ่านใหม่>");
  process.exit(1);
}
if (password.length < 4) {
  console.error("รหัสผ่านสั้นเกินไป (อย่างน้อย 4 ตัวอักษร)");
  process.exit(1);
}
 
try {
  const res = await db.query("UPDATE users SET password_hash = $1 WHERE username = $2 RETURNING username", [
    hashPassword(password),
    username,
  ]);
  if (res.rowCount === 0) {
    const all = await db.query("SELECT username FROM users ORDER BY username");
    console.error(`ไม่พบผู้ใช้ "${username}" — ผู้ใช้ที่มี: ${all.rows.map((r) => r.username).join(", ")}`);
    process.exitCode = 1;
  } else {
    console.log(`เปลี่ยนรหัสผ่านของ ${username} เรียบร้อยแล้ว`);
  }
} catch (err) {
  console.error("ล้มเหลว:", err.message);
  process.exitCode = 1;
} finally {
  await db.end();
}