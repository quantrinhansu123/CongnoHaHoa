import type { TabKey } from "@/lib/types";

export const TAB_ROUTES: Record<TabKey, string> = {
  overview: "/tonghop",
  debts: "/khach-no",
  payments: "/tra-no",
  returns: "/thu-hoi",
  sales_routes: "/sale-tuyen",
  zalo_contacts: "/danh-ba-zalo",
  customers_list: "/danh-sach-khach-hang",
  staff: "/nhan-su",
  routes: "/tuyen",
};

const ROUTE_TABS = Object.fromEntries(
  Object.entries(TAB_ROUTES).map(([tab, path]) => [path, tab as TabKey]),
) as Record<string, TabKey>;

export function tabFromPath(pathname: string): TabKey | null {
  const normalized = pathname.endsWith("/") && pathname.length > 1 ? pathname.slice(0, -1) : pathname;
  return ROUTE_TABS[normalized] ?? null;
}
