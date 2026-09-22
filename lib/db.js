// lib/db.js
import pg from "pg";

const { Pool } = pg;

// ใช้ pool เดียวต่อ process (กัน hot-reload ของ next dev สร้าง pool ซ้ำ)
const store = globalThis;

if (!store.__logMgmtPool) {
  const pool = new Pool({
    host: process.env.PGHOST || "localhost",
    user: process.env.PGUSER || "postgres",
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE || "logdb",
    port: Number.parseInt(process.env.PGPORT || "5432", 10),
    max: Number.parseInt(process.env.PGPOOL_MAX || "10", 10),
  });
  // idle client ที่หลุดต้องไม่ทำให้ process ล้ม
  pool.on("error", (err) => console.error("[db] idle client error:", err.message));
  store.__logMgmtPool = pool;
}

const pool = store.__logMgmtPool;

/** รันหลายคำสั่งใน transaction เดียว: ถ้า fn throw จะ ROLLBACK ทั้งหมด */
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback error
    }
    throw err;
  } finally {
    client.release();
  }
}

const db = {
  query: (text, params) => pool.query(text, params),
  withTransaction,
  end: () => pool.end(),
};

export default db;
