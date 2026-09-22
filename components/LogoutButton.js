"use client";

import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();

  const handleLogout = async () => {
    // ยิง DELETE ไปที่ API เพื่อลบ user_session cookie
    await fetch("/api/login", {
      method: "DELETE",
    });

    // นำผู้ใช้กลับไปหน้า Login
    router.push("/login");
    router.refresh();
  };

  return (
    <button onClick={handleLogout} className="btn btn-danger-ghost">
      ออกจากระบบ
    </button>
  );
}
