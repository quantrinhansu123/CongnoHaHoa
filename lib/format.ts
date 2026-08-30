export const money = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

export const integer = new Intl.NumberFormat("vi-VN", {
  maximumFractionDigits: 2,
});

export function formatDate(value?: string | null) {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

export function toNumber(value: string | number | null | undefined) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (!value) return 0;
  return Number(String(value).replace(/[^0-9-]/g, "")) || 0;
}

export function todayIso() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

export function overdueDays(dueDate?: string | null, status?: string) {
  if (!dueDate || status !== "overdue") return null;
  const today = todayIso();
  const due = dueDate.slice(0, 10);
  if (today <= due) return null;
  const [dy, dm, dd] = due.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  const diff = Math.floor((Date.UTC(ty, tm - 1, td) - Date.UTC(dy, dm - 1, dd)) / 86_400_000);
  return diff > 0 ? diff : null;
}

export function formatOverdueDays(dueDate?: string | null, status?: string) {
  const days = overdueDays(dueDate, status);
  return days == null ? "—" : `${integer.format(days)} ngày`;
}

export function csvCell(value: unknown) {
  const raw = String(value ?? "");
  const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}
