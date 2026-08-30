import type { RouteAssignedStaff, RouteLocationItem } from "@/lib/route-helpers";

export type TabKey = "overview" | "debts" | "payments" | "returns" | "sales_routes" | "zalo_contacts" | "customers_list" | "staff" | "routes";

export type DebtStatus = "paid" | "overdue" | "due_soon" | "open";

export interface DebtRow {
  id: string;
  customer_id: string;
  customer_code: string | null;
  customer_name: string;
  phone: string | null;
  address: string | null;
  region: string | null;
  amount: number;
  paid_amount: number;
  returned_amount: number;
  remaining_amount: number;
  order_date: string;
  due_days: number;
  due_date: string;
  sales_person: string | null;
  delivery_person: string | null;
  product_name: string | null;
  quantity: number | null;
  unit_price: number | null;
  notes: string | null;
  status: DebtStatus;
  source_sheet: string | null;
  source_row: number | null;
  created_at: string;
}

export interface PaymentRow {
  id: string;
  debt_id: string;
  amount: number;
  paid_at: string;
  notes: string | null;
  sales_person: string | null;
  delivery_person: string | null;
  created_at: string;
  customer_name?: string;
  customer_code?: string | null;
  phone?: string | null;
  debt_order_date?: string;
  debt?: {
    customer?: { name: string } | null;
    amount?: number;
    order_date?: string;
  } | null;
}

export interface ReturnRow {
  id: string;
  debt_id: string | null;
  customer_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_amount: number;
  returned_at: string;
  notes: string | null;
  created_at: string;
  customer?: { name: string } | null;
}

export interface CustomerOption {
  id: string;
  code: string | null;
  name: string;
  phone: string | null;
  address: string | null;
  region: string | null;
}

export interface AppSettings {
  max_debt: number;
  debt_terms: number[];
}

export type SalesRating = "Yếu" | "Trung bình" | "Khá" | "Xuất sắc";

export interface SalesRouteReport {
  id: string;
  distributor: string;
  report_date: string;
  sales_person: string;
  route_name: string;
  total_customers: number;
  answered_customers: number;
  unanswered_customers: number;
  ordering_customers: number;
  non_ordering_customers: number;
  actual_revenue: number;
  average_revenue: number;
  product_feedback: string | null;
  delivery_feedback: string | null;
  missing_products: string | null;
  top_products: string | null;
  product_development_feedback: string | null;
  product_quality_feedback: string | null;
  delivery_staff_feedback: string | null;
  distributor_feedback: string | null;
  self_improvement: string | null;
  personal_opinion: string | null;
  next_revenue_target: number;
  target_percentage: number | null;
  self_rating: SalesRating;
  created_at: string;
  updated_at: string;
}

export interface ZaloContact {
  id: string;
  display_name: string;
  phone: string | null;
  conversation_id: string | null;
  conversation_key: string | null;
  conversation_url: string | null;
  source: "manual" | "zalo_extension";
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ZaloMessage {
  id: string;
  contact_id: string;
  message_key: string;
  direction: "incoming" | "outgoing" | "system";
  sender_name: string | null;
  body: string;
  display_time: string | null;
  sent_at: string | null;
  message_type: "text" | "image" | "file" | "system";
  sort_order: number;
  captured_at: string;
}

export interface ZaloAiSuggestion {
  id: string;
  contact_id: string;
  trigger_message_key: string | null;
  summary: string;
  customer_intent: string;
  suggestions: string[];
  next_action: string;
  status: "ready" | "failed";
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface CustomerListRow {
  id: string;
  name: string;
  phone: string | null;
  route_id: string | null;
  route_name: string | null;
  route_location: string | null;
  route_locations?: RouteLocationItem[] | null;
  total_revenue: number;
  total_collected: number;
  total_debt: number;
  created_at: string;
  updated_at: string;
}

export interface StaffMember {
  id: string;
  name: string;
  phone: string | null;
  account: string;
  password: string;
  department: string | null;
  position: string | null;
  total_revenue: number;
  total_collected: number;
  total_debt: number;
  metrics_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface StaffOption {
  id: string;
  name: string;
  phone: string | null;
  department: string | null;
}

export interface RouteOption {
  id: string;
  name: string;
  locations: RouteLocationItem[];
}

export interface RouteOverviewRow {
  id: string;
  name: string;
  locations: RouteLocationItem[];
  assigned_staff: RouteAssignedStaff;
  created_at: string;
  updated_at: string;
}

export interface Filters {
  from: string;
  to: string;
  customer: string;
  sales: string;
  delivery: string;
  region: string;
  search: string;
  status: string;
}

export const EMPTY_FILTERS: Filters = {
  from: "",
  to: "",
  customer: "",
  sales: "",
  delivery: "",
  region: "",
  search: "",
  status: "",
};
