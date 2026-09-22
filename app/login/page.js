"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import ThemeToggle from "@/components/ThemeToggle";
import { IconEye, IconEyeOff, IconLayers, IconLogo, IconSearch, IconBell } from "@/components/Icons";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        router.push("/");
        router.refresh();
      } else {
        setError(data.error || "เข้าสู่ระบบไม่สำเร็จ");
      }
    } catch {
      setError("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-shell">
      <section className="login-left">
        <div className="login-top">
          <div className="brand">
            <div className="brand-mark">
              <IconLogo width={22} height={22} />
            </div>
            <div className="brand-title">Log Management</div>
          </div>
          <ThemeToggle />
        </div>

        <div className="login-form-wrap">
          <h1 className="login-title">ยินดีต้อนรับกลับมา</h1>
          <p className="login-lead">กรอกข้อมูลเพื่อเข้าสู่ระบบและเข้าถึงแดชบอร์ด</p>

          {error && <div className="notice-error" role="alert">{error}</div>}

          <form onSubmit={handleLogin}>
            <div className="field">
              <label className="label" htmlFor="username">Username</label>
              <input
                id="username"
                type="text"
                className="input"
                placeholder="เช่น admin"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
              />
            </div>
            <div className="field">
              <label className="label" htmlFor="password">Password</label>
              <div className="input-wrap">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  className="input"
                  placeholder="รหัสผ่าน"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="peek"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
                >
                  {showPassword ? <IconEyeOff width={18} height={18} /> : <IconEye width={18} height={18} />}
                </button>
              </div>
            </div>
            <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
              {busy ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
            </button>
          </form>

          <p className="login-note">
            บัญชีทดสอบ (admin, viewerA, viewerB) และรหัสผ่านถูกกำหนดไว้ในไฟล์ <code>.env</code> — ดูวิธีในเอกสาร setup
          </p>
        </div>

        <div className="login-foot">© 2026 Log Management</div>
      </section>

      <aside className="login-panel">
        <span className="ring r1" />
        <span className="ring r2" />
        <h2>Welcome to<br />Log Management</h2>
        <p>รวบรวม ค้นหา และแจ้งเตือน log จากหลายแหล่งไว้ในที่เดียว แยกข้อมูลตาม tenant อย่างปลอดภัย</p>
        <ul className="login-points">
          <li><i><IconLayers width={16} height={16} /></i> รับ log ได้ทั้ง Syslog, HTTP API และอัปโหลดไฟล์</li>
          <li><i><IconSearch width={16} height={16} /></i> ค้นหาและกรองบน Dashboard แบบเรียลไทม์</li>
          <li><i><IconBell width={16} height={16} /></i> ตั้งกฎแจ้งเตือนเมื่อพบเหตุการณ์ผิดปกติ</li>
        </ul>
      </aside>
    </div>
  );
}
