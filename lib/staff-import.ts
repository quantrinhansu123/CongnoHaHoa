import { STAFF_DEPARTMENT_SALES } from "@/lib/route-helpers";
import { supabase } from "@/lib/supabase";
import type { StaffMember } from "@/lib/types";

const PLACEHOLDER_NAMES = new Set(["chua phan cong", "khong ro", "—", "-"]);

export function normalizeStaffName(value: string) {
  return value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .toLocaleLowerCase("vi")
    .replace(/\s+/g, " ");
}

function isValidSalesName(value: string) {
  const normalized = normalizeStaffName(value);
  return normalized.length > 0 && !PLACEHOLDER_NAMES.has(normalized);
}

export function accountFromName(name: string, usedAccounts: Set<string>) {
  let base = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "") || "nv.kd";

  let account = base;
  let suffix = 2;
  while (usedAccounts.has(account.toLocaleLowerCase("vi"))) {
    account = `${base}${suffix}`;
    suffix += 1;
  }
  usedAccounts.add(account.toLocaleLowerCase("vi"));
  return account;
}

async function fetchSalesPersonNames() {
  const names = new Set<string>();
  const tables = ["debts", "payments", "sales_route_reports"] as const;
  const pageSize = 1000;

  for (const table of tables) {
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase.from(table).select("sales_person").range(from, from + pageSize - 1);
      if (error) throw error;
      for (const row of data || []) {
        const name = String(row.sales_person || "").trim();
        if (isValidSalesName(name)) names.add(name);
      }
      if ((data || []).length < pageSize) break;
    }
  }

  return [...names].sort((a, b) => a.localeCompare(b, "vi"));
}

export async function importSalesStaffFromDebts(existing: StaffMember[]) {
  const salesNames = await fetchSalesPersonNames();
  const existingNames = new Set(existing.map((row) => normalizeStaffName(row.name)));
  const usedAccounts = new Set(existing.map((row) => row.account.toLocaleLowerCase("vi")));

  const payload = salesNames
    .filter((name) => !existingNames.has(normalizeStaffName(name)))
    .map((name) => ({
      name,
      phone: null,
      account: accountFromName(name, usedAccounts),
      password: "123456",
      department: STAFF_DEPARTMENT_SALES,
      position: "Nhân viên kinh doanh",
    }));

  if (!payload.length) {
    return { inserted: 0, skipped: salesNames.length, total: salesNames.length };
  }

  const { error } = await supabase.from("staff_members").insert(payload);
  if (error) throw error;

  return { inserted: payload.length, skipped: salesNames.length - payload.length, total: salesNames.length };
}
