import { normalizeStaffName } from "@/lib/staff-import";
import { supabase } from "@/lib/supabase";
import type { DebtRow, StaffMember } from "@/lib/types";

export type StaffMetrics = {
  total_revenue: number;
  total_collected: number;
  total_debt: number;
};

const PLACEHOLDER_NAMES = new Set(["chua phan cong", "khong ro", "—", "-", ""]);

function isValidSalesName(value: string) {
  const normalized = normalizeStaffName(value);
  return normalized.length > 0 && !PLACEHOLDER_NAMES.has(normalized);
}

async function fetchAllDebtOverview() {
  const rows: Pick<DebtRow, "sales_person" | "amount" | "paid_amount" | "remaining_amount">[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("debt_overview")
      .select("sales_person,amount,paid_amount,remaining_amount")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...((data || []) as Pick<DebtRow, "sales_person" | "amount" | "paid_amount" | "remaining_amount">[]));
    if ((data || []).length < pageSize) break;
  }

  return rows;
}

export function aggregateStaffMetrics(rows: Pick<DebtRow, "sales_person" | "amount" | "paid_amount" | "remaining_amount">[]) {
  const map = new Map<string, StaffMetrics>();

  for (const row of rows) {
    const name = String(row.sales_person || "").trim();
    if (!isValidSalesName(name)) continue;
    const key = normalizeStaffName(name);
    const current = map.get(key) || { total_revenue: 0, total_collected: 0, total_debt: 0 };
    current.total_revenue += Number(row.amount) || 0;
    current.total_collected += Number(row.paid_amount) || 0;
    current.total_debt += Number(row.remaining_amount) || 0;
    map.set(key, current);
  }

  return map;
}

export async function syncStaffMetrics(staff: StaffMember[]) {
  const metricsMap = aggregateStaffMetrics(await fetchAllDebtOverview());
  const syncedAt = new Date().toISOString();
  let matched = 0;

  await Promise.all(
    staff.map(async (member) => {
      const metrics = metricsMap.get(normalizeStaffName(member.name)) || {
        total_revenue: 0,
        total_collected: 0,
        total_debt: 0,
      };
      if (metrics.total_revenue > 0 || metrics.total_collected > 0 || metrics.total_debt > 0) matched += 1;

      const { error } = await supabase
        .from("staff_members")
        .update({
          total_revenue: metrics.total_revenue,
          total_collected: metrics.total_collected,
          total_debt: metrics.total_debt,
          metrics_synced_at: syncedAt,
        })
        .eq("id", member.id);
      if (error) throw error;
    }),
  );

  return { updated: staff.length, matched, syncedAt };
}

export async function fetchStaffDebtDetails(staffName: string) {
  const targetKey = normalizeStaffName(staffName);
  const rows: DebtRow[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase.from("debt_overview").select("*").order("order_date", { ascending: false }).range(from, from + pageSize - 1);
    if (error) throw error;
    for (const row of (data || []) as DebtRow[]) {
      if (normalizeStaffName(String(row.sales_person || "")) === targetKey) {
        rows.push(normalizeDebtRow(row));
      }
    }
    if ((data || []).length < pageSize) break;
  }

  return rows;
}

function normalizeDebtRow(row: DebtRow): DebtRow {
  return {
    ...row,
    amount: Number(row.amount),
    paid_amount: Number(row.paid_amount),
    returned_amount: Number(row.returned_amount),
    remaining_amount: Number(row.remaining_amount),
  };
}

export function normalizeStaffMetrics(row: StaffMember): StaffMember {
  return {
    ...row,
    total_revenue: Number(row.total_revenue ?? 0),
    total_collected: Number(row.total_collected ?? 0),
    total_debt: Number(row.total_debt ?? 0),
  };
}
