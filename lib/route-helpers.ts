export interface RouteLocationItem {
  order: number;
  name: string;
}

export interface RouteAssignedStaff {
  sales: string[];
  drivers: string[];
}

export const STAFF_DEPARTMENT_SALES = "Kinh doanh";
export const STAFF_DEPARTMENT_DRIVER = "Lái xe";

export function normalizeLocations(raw: unknown): RouteLocationItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item, index) => {
      if (typeof item === "string") return { order: index + 1, name: item.trim() };
      if (item && typeof item === "object") {
        const record = item as Record<string, unknown>;
        const name = String(record.name ?? "").trim();
        const order = Number(record.order);
        return name ? { order: Number.isFinite(order) && order > 0 ? order : index + 1, name } : null;
      }
      return null;
    })
    .filter((item): item is RouteLocationItem => Boolean(item))
    .sort((a, b) => a.order - b.order)
    .map((item, index) => ({ ...item, order: index + 1 }));
}

export function normalizeAssignedStaff(raw: unknown): RouteAssignedStaff {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { sales: [], drivers: [] };
  }
  const record = raw as Record<string, unknown>;
  return {
    sales: uniqueIds(record.sales),
    drivers: uniqueIds(record.drivers),
  };
}

export function formatLocationsList(locations: RouteLocationItem[]): string {
  return reindexLocations(locations)
    .map((item) => `${item.order}. ${item.name}`)
    .join(", ");
}

export function reindexLocations(locations: RouteLocationItem[]): RouteLocationItem[] {
  return locations
    .filter((item) => item.name.trim())
    .map((item, index) => ({ name: item.name.trim(), order: index + 1 }));
}

export function isSalesDepartment(department: string | null | undefined) {
  return normalizeDepartment(department) === normalizeDepartment(STAFF_DEPARTMENT_SALES);
}

export function isDriverDepartment(department: string | null | undefined) {
  return normalizeDepartment(department) === normalizeDepartment(STAFF_DEPARTMENT_DRIVER);
}

export function staffNames(ids: string[], staff: Array<{ id: string; name: string }>) {
  return ids
    .map((id) => staff.find((member) => member.id === id)?.name)
    .filter(Boolean)
    .join(", ");
}

function uniqueIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item)).filter(Boolean))];
}

function normalizeDepartment(value: string | null | undefined) {
  return (value || "").trim().toLocaleLowerCase("vi");
}
