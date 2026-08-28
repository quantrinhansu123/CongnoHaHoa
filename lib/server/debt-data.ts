import type { SupabaseClient } from "@supabase/supabase-js";
import type { DebtStatus } from "@/lib/types";

export interface DebtQueryArgs {
  customer: string | null;
  cong: string | null;
  from_date: string | null;
  to_date: string | null;
  status: DebtStatus | "all" | null;
  limit: number;
}

interface DebtRecord {
  id: string;
  customer_name: string;
  customer_code: string | null;
  source_sheet: string | null;
  sales_person: string | null;
  amount: number | string;
  paid_amount: number | string;
  returned_amount: number | string;
  remaining_amount: number | string;
  order_date: string;
  due_date: string;
  status: DebtStatus;
}

interface PaymentDateRecord {
  debt_id: string;
  paid_at: string;
}

export interface DebtJsonRow {
  KH: string;
  "Công": string;
  "Tổng công nợ": number;
  "Ngày nợ": string;
  "Ngày trả": string | null;
}

const DEBT_FIELDS = "id,customer_name,customer_code,source_sheet,sales_person,amount,paid_amount,returned_amount,remaining_amount,order_date,due_date,status";

export function normalizedDebtArgs(value: Partial<DebtQueryArgs> = {}): DebtQueryArgs {
  const status = typeof value.status === "string" && ["paid", "overdue", "due_soon", "open"].includes(value.status)
    ? value.status as DebtStatus
    : "all";

  return {
    customer: cleanText(value.customer),
    cong: cleanText(value.cong),
    from_date: cleanDate(value.from_date),
    to_date: cleanDate(value.to_date),
    status,
    limit: Math.max(1, Math.min(Number(value.limit) || 50, 100)),
  };
}

export async function queryDebtData(supabase: SupabaseClient, input: Partial<DebtQueryArgs>) {
  const args = normalizedDebtArgs(input);
  const rows = await fetchDebtRows(supabase, args);
  const selected = rows.slice(0, args.limit);
  const paymentDates = await fetchLatestPaymentDates(supabase, selected.map((row) => row.id));
  const customerNames = unique(rows.map((row) => row.customer_name));
  const congNames = unique(rows.map(debtCong));

  return {
    filters: args,
    matching_records: rows.length,
    truncated: rows.length > selected.length,
    clarification: {
      customer_candidates: args.customer && customerNames.length > 1 ? customerNames.slice(0, 12) : [],
      cong_candidates: args.cong && congNames.length > 1 ? congNames.slice(0, 12) : [],
    },
    totals: {
      total_debt: sum(rows, "amount"),
      total_paid: sum(rows, "paid_amount"),
      total_returned: sum(rows, "returned_amount"),
      remaining: sum(rows, "remaining_amount"),
      customers: customerNames.length,
    },
    records: selected.map((row) => ({
      kh: row.customer_name,
      ma_kh: row.customer_code,
      cong: debtCong(row),
      nv_kinh_doanh: row.sales_person,
      tong_cong_no: Number(row.amount),
      da_tra: Number(row.paid_amount),
      hang_thu_hoi: Number(row.returned_amount),
      con_lai: Number(row.remaining_amount),
      ngay_no: row.order_date,
      han_tra: row.due_date,
      ngay_tra_gan_nhat: paymentDates.get(row.id) || null,
      trang_thai: row.status,
    })),
  };
}

export async function exportDebtJson(supabase: SupabaseClient): Promise<DebtJsonRow[]> {
  const rows = await fetchDebtRows(supabase, normalizedDebtArgs({ limit: 100 }));
  const paymentDates = await fetchAllLatestPaymentDates(supabase);
  return rows.map((row) => ({
    KH: row.customer_name,
    "Công": debtCong(row),
    "Tổng công nợ": Number(row.amount),
    "Ngày nợ": row.order_date,
    "Ngày trả": paymentDates.get(row.id) || null,
  }));
}

async function fetchDebtRows(supabase: SupabaseClient, args: DebtQueryArgs): Promise<DebtRecord[]> {
  const rows: DebtRecord[] = [];
  for (let from = 0; ; from += 1000) {
    let query = supabase
      .from("debt_overview")
      .select(DEBT_FIELDS)
      .order("order_date", { ascending: false })
      .range(from, from + 999);
    if (args.customer) {
      const customer = searchableText(args.customer);
      if (customer) query = query.ilike("customer_name", `%${customer}%`);
    }
    if (args.cong) {
      const cong = searchableText(args.cong);
      if (cong) query = query.or(`source_sheet.ilike.%${cong}%,sales_person.ilike.%${cong}%`);
    }
    if (args.from_date) query = query.gte("order_date", args.from_date);
    if (args.to_date) query = query.lte("order_date", args.to_date);
    if (args.status && args.status !== "all") query = query.eq("status", args.status);
    const { data, error } = await query;
    if (error) throw error;
    const page = (data || []) as DebtRecord[];
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

async function fetchLatestPaymentDates(supabase: SupabaseClient, debtIds: string[]) {
  const latest = new Map<string, string>();
  if (!debtIds.length) return latest;
  const { data, error } = await supabase
    .from("payments")
    .select("debt_id,paid_at")
    .in("debt_id", debtIds)
    .order("paid_at", { ascending: false });
  if (error) throw error;
  for (const row of (data || []) as PaymentDateRecord[]) {
    if (!latest.has(row.debt_id)) latest.set(row.debt_id, row.paid_at);
  }
  return latest;
}

async function fetchAllLatestPaymentDates(supabase: SupabaseClient) {
  const latest = new Map<string, string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("payments")
      .select("debt_id,paid_at")
      .order("paid_at", { ascending: false })
      .range(from, from + 999);
    if (error) throw error;
    const page = (data || []) as PaymentDateRecord[];
    for (const row of page) {
      if (!latest.has(row.debt_id)) latest.set(row.debt_id, row.paid_at);
    }
    if (page.length < 1000) return latest;
  }
}

function debtCong(row: DebtRecord) {
  return row.source_sheet?.trim() || row.sales_person?.trim() || "Chưa phân loại";
}

function cleanText(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text.slice(0, 120) : null;
}

function cleanDate(value: unknown) {
  const text = cleanText(value);
  return text && /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function searchableText(value: string) {
  return value.replace(/[^\p{L}\p{N}\s-]/gu, "").trim();
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "vi"));
}

function sum(rows: DebtRecord[], field: "amount" | "paid_amount" | "returned_amount" | "remaining_amount") {
  return rows.reduce((total, row) => total + Number(row[field] || 0), 0);
}
