import * as XLSX from "xlsx";

export type ExcelKind = "debts" | "payments" | "returns";

export interface DebtImportRow {
  row: number;
  customer_code: string | null;
  customer_name: string;
  amount: number;
  sales_person: string | null;
  delivery_person: string | null;
  order_date: string;
  due_days: number;
  paid_amount: number | null;
  payment_date: string | null;
  notes: string | null;
}

export interface PaymentImportRow {
  row: number;
  customer_name: string;
  order_date: string;
  amount: number;
  paid_at: string;
  sales_person: string | null;
  delivery_person: string | null;
  notes: string | null;
}

export interface ReturnImportRow {
  row: number;
  customer_name: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  returned_at: string;
  notes: string | null;
}

export type ParsedImport =
  | { kind: "debts"; rows: DebtImportRow[] }
  | { kind: "payments"; rows: PaymentImportRow[] }
  | { kind: "returns"; rows: ReturnImportRow[] };

const TEMPLATES: Record<ExcelKind, { headers: string[]; sample: (string | number)[]; filename: string }> = {
  debts: {
    headers: ["Mã KH", "Tên khách hàng", "Số tiền nợ", "NV kinh doanh", "NV giao hàng", "Ngày đơn hàng", "Hạn thanh toán (ngày)", "Số tiền đã trả", "Ngày thanh toán", "Ghi chú"],
    sample: ["KH001", "Nguyễn Văn A", 5_000_000, "Anh Bình", "Anh Cường", "01/08/2026", 30, 2_000_000, "15/08/2026", ""],
    filename: "mau-khoan-no.xlsx",
  },
  payments: {
    headers: ["Tên khách hàng", "Ngày nợ", "Số tiền trả", "Ngày trả", "NV kinh doanh", "NV giao hàng", "Ghi chú"],
    sample: ["Nguyễn Văn A", "01/08/2026", 2_000_000, "15/08/2026", "Anh Bình", "Anh Cường", ""],
    filename: "mau-tra-no.xlsx",
  },
  returns: {
    headers: ["Tên khách hàng", "Sản phẩm", "Số lượng", "Đơn giá", "Ngày thu hồi", "Ghi chú"],
    sample: ["Nguyễn Văn A", "Hàng mẫu", 10, 150_000, "20/08/2026", ""],
    filename: "mau-thu-hoi.xlsx",
  },
};

const DEBT_FIELDS: Record<string, keyof Omit<DebtImportRow, "row">> = {
  customer_code: "customer_code",
  customer_name: "customer_name",
  amount: "amount",
  sales_person: "sales_person",
  delivery_person: "delivery_person",
  order_date: "order_date",
  due_days: "due_days",
  paid_amount: "paid_amount",
  payment_date: "payment_date",
  notes: "notes",
};

const PAYMENT_FIELDS: Record<string, keyof Omit<PaymentImportRow, "row">> = {
  customer_name: "customer_name",
  order_date: "order_date",
  amount: "amount",
  paid_at: "paid_at",
  sales_person: "sales_person",
  delivery_person: "delivery_person",
  notes: "notes",
};

const RETURN_FIELDS: Record<string, keyof Omit<ReturnImportRow, "row">> = {
  customer_name: "customer_name",
  product_name: "product_name",
  quantity: "quantity",
  unit_price: "unit_price",
  returned_at: "returned_at",
  notes: "notes",
};

function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function classifyDebtHeader(value: unknown) {
  const text = normalizeHeader(value);
  if (!text) return null;
  if (text.includes("ma kh")) return "customer_code";
  if (text.includes("ten khach hang")) return "customer_name";
  if (text.includes("so tien no")) return "amount";
  if (text.includes("nv kinh doanh") || text === "nvkd no") return "sales_person";
  if (text.includes("nv giao")) return "delivery_person";
  if (text.includes("ngay don hang") || text === "ngay no") return "order_date";
  if (text.includes("han thanh toan") || text.includes("han no") || text.includes("han tra")) return "due_days";
  if (text.includes("so tien da tra") || text.includes("da thanh toan")) return "paid_amount";
  if (text.includes("ngay thanh toan") || text === "ngay tra") return "payment_date";
  if (text === "ghi chu") return "notes";
  return null;
}

function classifyPaymentHeader(value: unknown) {
  const text = normalizeHeader(value);
  if (!text) return null;
  if (text.includes("ten khach hang")) return "customer_name";
  if (text.includes("ngay no") || text.includes("ngay don hang")) return "order_date";
  if (text.includes("so tien tra") || text.includes("so tien da tra")) return "amount";
  if (text.includes("ngay tra") || text.includes("ngay thanh toan")) return "paid_at";
  if (text.includes("nv kinh doanh")) return "sales_person";
  if (text.includes("nv giao")) return "delivery_person";
  if (text === "ghi chu") return "notes";
  return null;
}

function classifyReturnHeader(value: unknown) {
  const text = normalizeHeader(value);
  if (!text) return null;
  if (text.includes("ten khach hang")) return "customer_name";
  if (text.includes("san pham")) return "product_name";
  if (text === "so luong" || text === "sl") return "quantity";
  if (text.includes("don gia")) return "unit_price";
  if (text.includes("ngay thu hoi")) return "returned_at";
  if (text === "ghi chu") return "notes";
  return null;
}

function cleanText(value: unknown) {
  if (value == null) return null;
  const text = String(value).replace(/\s+/g, " ").trim();
  return text || null;
}

function parseNumber(value: unknown) {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = String(value).replace(/[^0-9,.-]/g, "");
  if (!text) return null;
  let normalized = text;
  if ((text.match(/,/g) || []).length === 1 && !text.includes(".")) normalized = text.replace(",", ".");
  else normalized = text.replace(/,/g, "").replace(/\./g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function excelSerialToIso(serial: number) {
  const utc = new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000);
  if (Number.isNaN(utc.getTime())) return null;
  return utc.toISOString().slice(0, 10);
}

function parseDate(value: unknown) {
  if (value == null || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === "number" && value > 30_000 && value < 80_000) return excelSerialToIso(value);
  const text = String(value).trim().split(" ")[0];
  const match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (match) {
    const day = Number(match[1]);
    const month = Number(match[2]);
    let year = Number(match[3]);
    if (year < 100) year += 2000;
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 1990 && year <= 2100) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  return null;
}

function readWorkbookRows(buffer: ArrayBuffer) {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error("File Excel không có sheet dữ liệu.");
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true }) as unknown[][];
}

function findHeaderRow(rows: unknown[][], classifier: (value: unknown) => string | null, required: string[]) {
  for (let index = 0; index < Math.min(rows.length, 15); index += 1) {
    const row = rows[index] || [];
    const columns: Record<string, number> = {};
    row.forEach((cell, cellIndex) => {
      const field = classifier(cell);
      if (field) columns[field] = cellIndex;
    });
    if (required.every((field) => field in columns)) return { headerRow: index, columns };
  }
  return null;
}

function mapRows<T extends { row: number }>(
  rows: unknown[][],
  headerRow: number,
  columns: Record<string, number>,
  fields: Record<string, keyof Omit<T, "row">>,
  build: (sourceRow: number, values: Partial<Record<keyof Omit<T, "row">, unknown>>) => T | null,
) {
  const parsed: T[] = [];
  for (let index = headerRow + 1; index < rows.length; index += 1) {
    const row = rows[index] || [];
    const values: Partial<Record<keyof Omit<T, "row">, unknown>> = {};
    Object.entries(columns).forEach(([field, cellIndex]) => {
      const key = fields[field];
      if (key) values[key] = row[cellIndex];
    });
    const item = build(index + 1, values);
    if (item) parsed.push(item);
  }
  return parsed;
}

export function downloadTemplate(kind: ExcelKind) {
  const template = TEMPLATES[kind];
  const sheet = XLSX.utils.aoa_to_sheet([template.headers, template.sample]);
  sheet["!cols"] = template.headers.map((header) => ({ wch: Math.max(header.length + 4, 14) }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Du lieu");
  XLSX.writeFile(workbook, template.filename);
}

export function parseExcelFile(buffer: ArrayBuffer, kind: ExcelKind): ParsedImport {
  const rows = readWorkbookRows(buffer);
  if (kind === "debts") {
    const header = findHeaderRow(rows, classifyDebtHeader, ["customer_name", "amount"]);
    if (!header) throw new Error("Không tìm thấy tiêu đề cột hợp lệ. Tải mẫu Excel để đối chiếu.");
    const parsed = mapRows<DebtImportRow>(rows, header.headerRow, header.columns, DEBT_FIELDS, (sourceRow, values) => {
      const customer_name = cleanText(values.customer_name);
      const amount = parseNumber(values.amount);
      if (!customer_name || amount == null || amount <= 0) return null;
      const order_date = parseDate(values.order_date) || new Date().toISOString().slice(0, 10);
      const due_days = parseNumber(values.due_days);
      const paid_amount = parseNumber(values.paid_amount);
      return {
        row: sourceRow,
        customer_code: cleanText(values.customer_code),
        customer_name,
        amount,
        sales_person: cleanText(values.sales_person),
        delivery_person: cleanText(values.delivery_person),
        order_date,
        due_days: due_days != null && due_days >= 0 ? Math.round(due_days) : 30,
        paid_amount: paid_amount != null && paid_amount > 0 ? paid_amount : null,
        payment_date: parseDate(values.payment_date),
        notes: cleanText(values.notes),
      };
    });
    return { kind: "debts", rows: parsed };
  }

  if (kind === "payments") {
    const header = findHeaderRow(rows, classifyPaymentHeader, ["customer_name", "amount", "paid_at"]);
    if (!header) throw new Error("Không tìm thấy tiêu đề cột hợp lệ. Tải mẫu Excel để đối chiếu.");
    const parsed = mapRows<PaymentImportRow>(rows, header.headerRow, header.columns, PAYMENT_FIELDS, (sourceRow, values) => {
      const customer_name = cleanText(values.customer_name);
      const amount = parseNumber(values.amount);
      const paid_at = parseDate(values.paid_at);
      if (!customer_name || amount == null || amount <= 0 || !paid_at) return null;
      return {
        row: sourceRow,
        customer_name,
        order_date: parseDate(values.order_date) || paid_at,
        amount,
        paid_at,
        sales_person: cleanText(values.sales_person),
        delivery_person: cleanText(values.delivery_person),
        notes: cleanText(values.notes),
      };
    });
    return { kind: "payments", rows: parsed };
  }

  const header = findHeaderRow(rows, classifyReturnHeader, ["customer_name", "product_name", "quantity", "returned_at"]);
  if (!header) throw new Error("Không tìm thấy tiêu đề cột hợp lệ. Tải mẫu Excel để đối chiếu.");
  const parsed = mapRows<ReturnImportRow>(rows, header.headerRow, header.columns, RETURN_FIELDS, (sourceRow, values) => {
    const customer_name = cleanText(values.customer_name);
    const product_name = cleanText(values.product_name);
    const quantity = parseNumber(values.quantity);
    const returned_at = parseDate(values.returned_at);
    if (!customer_name || !product_name || quantity == null || quantity <= 0 || !returned_at) return null;
    return {
      row: sourceRow,
      customer_name,
      product_name,
      quantity,
      unit_price: parseNumber(values.unit_price) ?? 0,
      returned_at,
      notes: cleanText(values.notes),
    };
  });
  return { kind: "returns", rows: parsed };
}
