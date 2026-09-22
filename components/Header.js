import Link from "next/link";
import LogoutButton from "./LogoutButton";
import ThemeToggle from "./ThemeToggle";
import { IconLogo } from "./Icons";

// แถบหัวของทุกหน้า: ชื่อระบบ, ผู้ใช้/บทบาท/tenant, เมนู, สลับธีม, ออกจากระบบ
export default function Header({ session, active }) {
  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark">
          <IconLogo width={22} height={22} />
        </div>
        <div>
          <div className="brand-title">Log Management</div>
          <div className="brand-sub">
            <span className="chip">
              ผู้ใช้ <strong>{session.username}</strong> ({String(session.role).toUpperCase()})
            </span>
            <span className="chip chip-primary">
              Tenant <strong>{session.tenant}</strong>
            </span>
          </div>
        </div>
      </div>
      <div className="topbar-actions">
        <nav className="nav-tabs" aria-label="เมนูหลัก">
          <Link href="/" className={`nav-tab${active === "dashboard" ? " active" : ""}`}>
            Dashboard
          </Link>
          <Link href="/alerts" className={`nav-tab${active === "alerts" ? " active" : ""}`}>
            Alerts
          </Link>
        </nav>
        <ThemeToggle />
        <LogoutButton />
      </div>
    </header>
  );
}
