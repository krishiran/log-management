import Link from "next/link";
import Header from "./Header";
import AutoRefresh from "./AutoRefresh";
import UploadForm from "./UploadForm";
import { IconList, IconWarning, IconBell, IconServer, IconSearch } from "./Icons";
import { TIMEFRAMES } from "../lib/query-filters.js";
import { formatDateTime, formatTimeLabel } from "../lib/format.js";

const fmt = (n) => Number(n || 0).toLocaleString("en-US");

export function severityClass(level) {
  if (level >= 8) return "crit";
  if (level >= 5) return "high";
  if (level >= 3) return "med";
  return "info";
}

export function SeverityPill({ level }) {
  const cls = severityClass(level);
  const name = { crit: "CRITICAL", high: "HIGH", med: "MEDIUM", info: "INFO" }[cls];
  return <span className={`pill ${cls}`}>{name} · {level}</span>;
}

function StatCard({ tone, label, value, hint, icon }) {
  return (
    <div className={`stat ${tone}`}>
      <div>
        <div className="stat-label">{label}</div>
        <div className="stat-value">{value}</div>
        <div className="stat-hint">{hint}</div>
      </div>
      <div className="stat-icon">{icon}</div>
    </div>
  );
}

// เลือกแกน Y ให้ลงตัว 4 ช่อง (เช่น 0/10/20/30/40) เพื่อให้กราฟอ่านง่าย
function niceMax(max) {
  if (max <= 4) return 4;
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) || 10 * pow;
  return Math.max(1, Math.round(step)) * 4;
}

export function TimelineChart({ tl }) {
  const points = tl.points || [];
  if (points.length === 0) {
    return <div className="chart-empty">ยังไม่มีข้อมูลในช่วงเวลานี้</div>;
  }
  const top = niceMax(Math.max(...points.map((p) => p.count), 1));
  const ticks = [0, 1, 2, 3, 4].map((i) => ({ pct: i * 25, value: Math.round((top / 4) * i) }));
  const dense = points.length > 14; // แท่งเยอะ: ซ่อนตัวเลขบนแท่งและแสดงป้ายเวลาเว้นช่อง
  const every = dense ? 2 : 1;

  return (
    <div className="chart-scroll">
      <div className="chart">
        <div className="chart-yaxis" aria-hidden="true">
          {ticks.map((t) => (
            <span key={t.pct} style={{ bottom: `${t.pct}%` }}>{t.value}</span>
          ))}
        </div>
        <div className="chart-main">
          <div className="chart-plot">
            <div className="chart-grid" aria-hidden="true">
              {[100, 75, 50, 25, 0].map((pct) => (
                <i key={pct} style={{ bottom: `${pct}%` }} />
              ))}
            </div>
            {points.map((p, i) => (
              <div key={new Date(p.bucket).toISOString()} className="bar-slot">
                <div
                  className={`bar${i < 3 ? " tip-left" : i >= points.length - 3 ? " tip-right" : ""}`}
                  style={{ height: `${(p.count / top) * 100}%` }}
                  data-tip={`${formatDateTime(p.bucket)} · ${fmt(p.count)} รายการ`}
                >
                  {!dense && <span className="bar-count">{fmt(p.count)}</span>}
                </div>
              </div>
            ))}
          </div>
          <div className="chart-labels">
            {points.map((p, i) => (
              <span key={new Date(p.bucket).toISOString()}>{i % every === 0 ? formatTimeLabel(p.bucket, tl.bucket) : ""}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function SeverityDonut({ summary }) {
  const parts = [
    { key: "crit", label: "CRITICAL", n: summary.critical },
    { key: "high", label: "HIGH", n: summary.high },
    { key: "med", label: "MEDIUM", n: summary.medium },
    { key: "info", label: "INFO", n: summary.info },
  ];
  const total = parts.reduce((s, p) => s + p.n, 0);
  let acc = 0;
  return (
    <div className="donut-wrap">
      <div className="donut">
        <svg viewBox="0 0 42 42" role="img" aria-label="สัดส่วน log ตามระดับ severity">
          <circle className="donut-track" cx="21" cy="21" r="15.9155" fill="none" strokeWidth="5" />
          {total > 0 &&
            parts.map((p) => {
              if (p.n === 0) return null;
              const pct = (p.n / total) * 100;
              const el = (
                <circle
                  key={p.key}
                  className={`seg-${p.key}`}
                  cx="21"
                  cy="21"
                  r="15.9155"
                  fill="none"
                  strokeWidth="5"
                  strokeDasharray={`${pct} ${100 - pct}`}
                  strokeDashoffset={-acc}
                />
              );
              acc += pct;
              return el;
            })}
        </svg>
        <div className="donut-center">
          <div className="donut-total">{fmt(total)}</div>
          <div className="donut-cap">รายการ</div>
        </div>
      </div>
      <div className="legend">
        {parts.map((p) => (
          <div key={p.key}>
            <span className={`dot ${p.key}`} />
            <span>{p.label}</span>
            <b>{fmt(p.n)}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

function TopCard({ title, items, mono }) {
  const max = Math.max(...items.map((i) => i.count), 1);
  return (
    <div className="card">
      <div className="card-body">
        <div className="top-title">{title}</div>
        {items.length === 0 ? (
          <span className="muted small">ไม่มีข้อมูล</span>
        ) : (
          <ul className="top-list">
            {items.map((item) => (
              <li key={item.key}>
                <div className="top-row">
                  <span className={`top-key${mono ? " mono" : ""}`} title={item.key}>{item.key}</span>
                  <span className="top-count">{fmt(item.count)}</span>
                </div>
                <div className="top-track">
                  <div className="top-fill" style={{ width: `${Math.max(4, (item.count / max) * 100)}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// หน้า Dashboard (ส่วนแสดงผลล้วน ๆ) — app/page.js เป็นคนดึงข้อมูลแล้วส่งเข้ามา
export default function DashboardView({ session, filters, data, isAdmin, errorMsg }) {
  const { q, severity, source, timeframe, tenant } = filters;
  const { logs, total, topIps, topUsers, topEvents, topSources, tl, options, alerts, alertCount, summary } = data;
  const bucketLabel = tl.bucket === "5min" ? "ทุก 5 นาที" : tl.bucket === "hour" ? "รายชั่วโมง" : "รายวัน";

  return (
    <div className="container">
      <Header session={session} active="dashboard" />

      {errorMsg && <div className="notice-error">{errorMsg}</div>}

      {alerts.length > 0 && (
        <div className="banner" role="alert">
          <div className="banner-head">
            <strong>Alert ล่าสุด (1 ชั่วโมง)</strong>
            <Link href="/alerts" className="btn btn-danger-ghost btn-sm">ดูทั้งหมด</Link>
          </div>
          <ul>
            {alerts.map((a) => (
              <li key={a.id}>
                [{formatDateTime(a.fired_at)}] <b>{a.rule_name}</b> — tenant <code>{a.tenant}</code>, {a.group_by}=
                <code>{a.group_key}</code>: {a.hits} เหตุการณ์ (severity สูงสุด {a.max_severity})
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="stat-grid">
        <StatCard tone="indigo" label="log ทั้งหมด" value={fmt(total)} hint={(TIMEFRAMES[timeframe] || {}).label} icon={<IconList />} />
        <StatCard
          tone="red"
          label="HIGH / CRITICAL"
          value={fmt(summary.critical + summary.high)}
          hint={`CRITICAL ${fmt(summary.critical)} · HIGH ${fmt(summary.high)}`}
          icon={<IconWarning />}
        />
        <StatCard
          tone="amber"
          label="Alert ใน 1 ชั่วโมง"
          value={alertCount >= 100 ? "100+" : fmt(alertCount)}
          hint="ดูรายละเอียดที่หน้า Alerts"
          icon={<IconBell />}
        />
        <StatCard tone="green" label="Source ที่ส่งเข้ามา" value={fmt(summary.sources)} hint="ตามตัวกรองปัจจุบัน" icon={<IconServer />} />
      </div>

      <div className="grid-2-1">
        <div className="card">
          <div className="card-body">
            <div className="card-head">
              <span className="card-title">ปริมาณ log ตามช่วงเวลา ({bucketLabel})</span>
            </div>
            <TimelineChart tl={tl} />
          </div>
        </div>
        <div className="card">
          <div className="card-body">
            <div className="card-head">
              <span className="card-title">สัดส่วน Severity</span>
            </div>
            <SeverityDonut summary={summary} />
          </div>
        </div>
      </div>

      <div className="grid-4">
        <TopCard title="Top IP" items={topIps} mono />
        <TopCard title="Top Users" items={topUsers} />
        <TopCard title="Top Event Types" items={topEvents} />
        <TopCard title="Top Sources" items={topSources} />
      </div>

      <div className="card mb-16">
        <div className="card-body">
          <form method="GET" className="filter-grid">
            <div>
              <label className="label" htmlFor="f-q">ค้นหา</label>
              <input id="f-q" type="text" name="q" defaultValue={q} className="input" placeholder="ข้อความ, event, user, IP, host..." />
            </div>
            <div>
              <label className="label" htmlFor="f-tf">ช่วงเวลา</label>
              <select id="f-tf" name="timeframe" defaultValue={timeframe} className="select">
                {Object.entries(TIMEFRAMES).map(([key, tf]) => (
                  <option key={key} value={key}>{tf.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="f-src">Source</label>
              <select id="f-src" name="source" defaultValue={source} className="select">
                <option value="">ทุก Source</option>
                {options.sources.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="f-sev">Severity</label>
              <select id="f-sev" name="severity" defaultValue={severity} className="select">
                <option value="">Severity ทั้งหมด</option>
                <option value="3">≥ 3 MEDIUM</option>
                <option value="5">≥ 5 HIGH</option>
                <option value="8">≥ 8 CRITICAL</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="f-tn">Tenant</label>
              {isAdmin ? (
                <select id="f-tn" name="tenant" defaultValue={tenant} className="select">
                  <option value="">ทุก Tenant</option>
                  {options.tenants.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              ) : (
                <input id="f-tn" type="text" value={session.tenant} disabled readOnly className="input" />
              )}
            </div>
            <button type="submit" className="btn btn-primary">
              <IconSearch width={16} height={16} /> ค้นหา
            </button>
          </form>
          <div className="filter-hint">
            ช่วงเวลานับจากเวลาที่ระบบรับ log เข้ามา · <Link href="/">ล้างตัวกรอง</Link>
          </div>
        </div>
      </div>

      <details className="card upload">
        <summary>📁 อัปโหลดไฟล์ log (JSON / NDJSON / AWS CloudTrail)</summary>
        <div className="card-body">
          <UploadForm isAdmin={isAdmin} />
        </div>
      </details>

      <div className="card">
        <div className="table-head">
          <div className="table-title">
            รายการ log
            <span className="count-pill">พบ {fmt(total)} รายการ (แสดง {logs.length} ล่าสุด)</span>
          </div>
          <AutoRefresh seconds={10} />
        </div>
        <div className="table-scroll">
          <table className="tbl">
            <thead>
              <tr>
                <th>เวลา (event)</th>
                <th>Severity</th>
                <th>Tenant</th>
                <th>Source</th>
                <th>Event Type</th>
                <th>User / IP / Host</th>
                <th>Raw</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan="7" className="empty">ไม่พบข้อมูล log ตามเงื่อนไข</td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id}>
                    <td className="nowrap small">{formatDateTime(log.timestamp)}</td>
                    <td><SeverityPill level={log.severity} /></td>
                    <td><code>{log.tenant}</code></td>
                    <td><span className="tag">{log.source}</span></td>
                    <td className="cell-main">{log.event_type}</td>
                    <td>
                      <div className="cell-main">{log.user_name || "-"}</div>
                      <div className="cell-sub mono">{[log.src_ip, log.host].filter(Boolean).join(" · ") || "-"}</div>
                    </td>
                    <td><div className="cell-raw" title={log.raw}>{log.raw}</div></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
