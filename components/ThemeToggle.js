"use client";

import { IconMoon, IconSun } from "./Icons";

// สลับ light/dark: ตั้ง data-theme บน <html> และจำค่าไว้ใน localStorage
// (ไอคอนพระอาทิตย์/พระจันทร์ถูกสลับด้วย CSS จึงไม่มีปัญหา hydration)
export default function ThemeToggle() {
  const toggle = () => {
    const root = document.documentElement;
    const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    try {
      localStorage.setItem("lm-theme", next);
    } catch {
      // เบราว์เซอร์ปิดการเก็บข้อมูล: ยังสลับธีมได้ในหน้านี้ แค่ไม่จำค่า
    }
  };

  return (
    <button type="button" className="btn btn-icon theme-toggle" onClick={toggle} aria-label="สลับโหมดสว่าง/มืด" title="สลับโหมดสว่าง/มืด">
      <IconMoon className="moon" />
      <IconSun className="sun" />
    </button>
  );
}
