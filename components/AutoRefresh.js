"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// รีเฟรชข้อมูลบนหน้าอัตโนมัติ (ไม่ต้องกด F5) เพื่อให้เห็น log ใหม่ภายในไม่กี่วินาที
export default function AutoRefresh({ seconds = 10 }) {
  const router = useRouter();
  const [on, setOn] = useState(true);

  useEffect(() => {
    if (!on) return undefined;
    const id = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(id);
  }, [on, seconds, router]);

  return (
    <label className="switch" htmlFor="auto-refresh">
      <input id="auto-refresh" type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} />
      <span>รีเฟรชอัตโนมัติทุก {seconds} วินาที</span>
    </label>
  );
}
