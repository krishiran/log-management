"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// อัปโหลดไฟล์ log (JSON / NDJSON / CloudTrail {"Records":[...]}) ให้ระบบ normalize แล้วบันทึก
export default function UploadForm({ isAdmin }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  async function onSubmit(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const file = data.get("file");
    if (!file || !file.size) {
      setMessage({ ok: false, text: "กรุณาเลือกไฟล์ก่อน" });
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/ingest/file", { method: "POST", body: data });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setMessage({ ok: true, text: `รับเข้าและ normalize แล้ว ${json.inserted} รายการ` });
        form.reset();
        router.refresh();
      } else {
        const first = json.details?.[0];
        const detail = first ? ` (รายการที่ ${first.index + 1}: ${first.error})` : "";
        setMessage({ ok: false, text: `${json.error || "อัปโหลดไม่สำเร็จ"}${detail}` });
      }
    } catch {
      setMessage({ ok: false, text: "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="upload-form">
      <div className="upload-row">
        <input type="file" name="file" accept=".json,.ndjson,.jsonl,.txt" className="input input-sm upload-file" />
        {isAdmin && (
          <input type="text" name="tenant" className="input input-sm upload-tenant" placeholder="tenant (ถ้า log ไม่ได้ระบุ)" />
        )}
        <button type="submit" className="btn btn-ghost btn-sm" disabled={busy}>
          {busy ? "กำลังอัปโหลด..." : "อัปโหลด"}
        </button>
      </div>
      {message && <div className={`small upload-msg ${message.ok ? "ok" : "err"}`}>{message.text}</div>}
    </form>
  );
}
