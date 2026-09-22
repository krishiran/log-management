import Header from "./Header";
import AutoRefresh from "./AutoRefresh";
import { IconBell, IconLayers, IconSend } from "./Icons";
import { formatDateTime } from "../lib/format.js";

const fmt = (n) => Number(n || 0).toLocaleString("en-US");

function severityClass(level) {
  if (level >= 8) return "crit";
  if (level >= 5) return "high";
  if (level >= 3) return "med";
  return "info";
}

// หน้า Alerts (ส่วนแสดงผลล้วน ๆ) — app/alerts/page.js ดึงข้อมูลและส่ง server action เข้ามา
export default function AlertsView({ session, events, rules, error, isAdmin, actions }) {
  const enabledCount = rules.filter((r) => r.enabled).length;
  const notifiedCount = events.filter((e) => e.notified).length;

  return (
    <div className="container">
      <Header session={session} active="alerts" />

      {error && <div className="notice-error">{error}</div>}

      <div className="stat-grid cols-3">
        <div className="stat red">
          <div>
            <div className="stat-label">Alert ใน 24 ชั่วโมง</div>
            <div className="stat-value">{fmt(events.length)}</div>
            <div className="stat-hint">ที่ระบบตรวจพบตามกฎ</div>
          </div>
          <div className="stat-icon"><IconBell /></div>
        </div>
        <div className="stat indigo">
          <div>
            <div className="stat-label">กฎที่เปิดใช้งาน</div>
            <div className="stat-value">{fmt(enabledCount)} / {fmt(rules.length)}</div>
            <div className="stat-hint">เปิดอยู่ / กฎทั้งหมด</div>
          </div>
          <div className="stat-icon"><IconLayers /></div>
        </div>
        <div className="stat green">
          <div>
            <div className="stat-label">ส่ง webhook แล้ว</div>
            <div className="stat-value">{fmt(notifiedCount)}</div>
            <div className="stat-hint">จาก alert ใน 24 ชั่วโมง</div>
          </div>
          <div className="stat-icon"><IconSend /></div>
        </div>
      </div>

      <div className="card mb-20">
        <div className="table-head">
          <div className="table-title">
            Alert ที่เกิดขึ้น
            <span className="count-pill">24 ชั่วโมงล่าสุด</span>
          </div>
          <AutoRefresh seconds={10} />
        </div>
        <div className="table-scroll">
          <table className="tbl">
            <thead>
              <tr>
                <th>เวลาที่แจ้ง</th>
                <th>กฎ</th>
                <th>Tenant</th>
                <th>กลุ่ม</th>
                <th>จำนวน</th>
                <th>Severity สูงสุด</th>
                <th>ส่ง webhook</th>
              </tr>
            </thead>
            <tbody>
              {events.length === 0 ? (
                <tr>
                  <td colSpan="7" className="empty">ยังไม่มี alert</td>
                </tr>
              ) : (
                events.map((e) => (
                  <tr key={e.id}>
                    <td className="nowrap small">{formatDateTime(e.fired_at)}</td>
                    <td className="cell-main">{e.rule_name}</td>
                    <td><code>{e.tenant}</code></td>
                    <td className="small">{e.group_by} = <code>{e.group_key}</code></td>
                    <td className="cell-main">{fmt(e.hits)}</td>
                    <td>
                      <span className={`pill ${severityClass(e.max_severity)}`}>{e.max_severity}</span>
                    </td>
                    <td>
                      <span className={`pill ${e.notified ? "ok" : "off"}`}>{e.notified ? "ส่งแล้ว" : "ไม่ได้ส่ง"}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card mb-20">
        <div className="table-head">
          <div className="table-title">กฎ Alert</div>
        </div>
        <div className="table-scroll auto-height">
          <table className="tbl">
            <thead>
              <tr>
                <th>ชื่อกฎ</th>
                <th>เงื่อนไข</th>
                <th>Tenant</th>
                <th>สถานะ</th>
                {isAdmin && <th className="right">จัดการ</th>}
              </tr>
            </thead>
            <tbody>
              {rules.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 5 : 4} className="empty">ยังไม่มีกฎ</td>
                </tr>
              ) : (
                rules.map((r) => (
                  <tr key={r.id}>
                    <td className="cell-main">{r.name}</td>
                    <td className="small">
                      {r.match_event.length > 0 && (
                        <>event_type ตรงกับ <code>{r.match_event.join(", ")}</code></>
                      )}
                      {r.match_event.length > 0 && r.min_severity !== null && " หรือ "}
                      {r.min_severity !== null && <>severity ≥ {r.min_severity}</>}
                      <div className="cell-sub">
                        ≥ {r.threshold} ครั้ง ภายใน {r.window_seconds} วินาที ต่อ {r.group_by}
                        {r.notify_webhook ? " · ส่ง webhook" : ""}
                      </div>
                    </td>
                    <td><code>{r.tenant || "ทุก tenant"}</code></td>
                    <td>
                      <span className={`pill ${r.enabled ? "ok" : "off"}`}>{r.enabled ? "เปิดใช้งาน" : "ปิดอยู่"}</span>
                    </td>
                    {isAdmin && (
                      <td className="right nowrap">
                        <div className="actions">
                          <form action={actions.toggle} className="inline-form">
                            <input type="hidden" name="id" value={r.id} />
                            <input type="hidden" name="enabled" value={r.enabled ? "false" : "true"} />
                            <button type="submit" className="btn btn-ghost btn-sm">{r.enabled ? "ปิด" : "เปิด"}</button>
                          </form>
                          <form action={actions.remove} className="inline-form">
                            <input type="hidden" name="id" value={r.id} />
                            <button type="submit" className="btn btn-danger-ghost btn-sm">ลบ</button>
                          </form>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isAdmin ? (
        <div className="card">
          <div className="card-body">
            <div className="card-head">
              <span className="card-title">สร้างกฎ Alert ใหม่</span>
            </div>
            <form action={actions.create} className="form-grid">
              <div className="col-4">
                <label className="label" htmlFor="r-name">ชื่อกฎ</label>
                <input id="r-name" name="name" className="input" placeholder="เช่น ล็อกอินล้มเหลวซ้ำ" required />
              </div>
              <div className="col-4">
                <label className="label" htmlFor="r-ev">คำใน event_type (คั่นด้วย ,)</label>
                <input id="r-ev" name="match_event" className="input" defaultValue="fail" placeholder="fail, denied" />
              </div>
              <div className="col-2">
                <label className="label" htmlFor="r-sev">หรือ severity ≥</label>
                <input id="r-sev" name="min_severity" type="number" min="0" max="10" className="input" placeholder="(ไม่ใช้)" />
              </div>
              <div className="col-2">
                <label className="label" htmlFor="r-tn">Tenant</label>
                <input id="r-tn" name="tenant" className="input" placeholder="ว่าง = ทุก tenant" />
              </div>
              <div className="col-2">
                <label className="label" htmlFor="r-th">ตั้งแต่กี่ครั้ง</label>
                <input id="r-th" name="threshold" type="number" min="1" defaultValue="3" className="input" required />
              </div>
              <div className="col-2">
                <label className="label" htmlFor="r-win">ภายใน (วินาที)</label>
                <input id="r-win" name="window_seconds" type="number" min="10" defaultValue="300" className="input" required />
              </div>
              <div className="col-2">
                <label className="label" htmlFor="r-gb">จัดกลุ่มตาม</label>
                <select id="r-gb" name="group_by" className="select" defaultValue="src_ip">
                  <option value="src_ip">src_ip</option>
                  <option value="user_name">user_name</option>
                  <option value="host">host</option>
                </select>
              </div>
              <div className="col-3">
                <label className="check" htmlFor="notify">
                  <input type="checkbox" id="notify" name="notify_webhook" defaultChecked />
                  <span>ส่ง webhook (Discord/Slack) เมื่อเข้าเงื่อนไข</span>
                </label>
              </div>
              <div className="col-3">
                <button type="submit" className="btn btn-primary btn-block">สร้างกฎ</button>
              </div>
            </form>
          </div>
        </div>
      ) : (
        <div className="muted small">บัญชี viewer ดูกฎและ alert ของ tenant ตนเองได้อย่างเดียว (สร้าง/แก้กฎได้เฉพาะ admin)</div>
      )}
    </div>
  );
}
