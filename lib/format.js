// lib/format.js
// จัดรูปแบบวันเวลาตามเขตเวลาของระบบ (หน้าเว็บ render ที่ฝั่ง server ซึ่งใน container เป็น UTC จึงต้องระบุ timeZone เสมอ)
import { getTimezone } from "./config.js";

const LOCALE = "th-TH-u-ca-gregory"; // ภาษาไทย แต่ใช้ปี ค.ศ. เพื่อให้ตรงกับ @timestamp ใน log

export function formatDateTime(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: getTimezone(),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}

export function formatTimeLabel(value, bucket) {
  const d = new Date(value);
  const timeZone = getTimezone();
  if (bucket === "day") {
    return new Intl.DateTimeFormat(LOCALE, { timeZone, day: "2-digit", month: "2-digit" }).format(d);
  }
  return new Intl.DateTimeFormat(LOCALE, { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
}
