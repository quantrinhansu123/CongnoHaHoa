"use client";

import { useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, FileDown, FileSpreadsheet, FileUp, Pencil, Trash2 } from "lucide-react";
import { formatDate, integer, money } from "@/lib/format";
import type { DebtRow, PaymentRow, ReturnRow, TabKey } from "@/lib/types";

type Row = DebtRow | PaymentRow | ReturnRow;

interface Props {
  kind: Exclude<TabKey, "overview"> | "overview";
  rows: Row[];
  onEdit?: (row: Row) => void;
  onDelete?: (id: string) => void;
  onExport: () => void;
  onDownloadTemplate?: () => void;
  onImport?: (file: File) => void;
  importing?: boolean;
  compact?: boolean;
}

const statusLabels = {
  paid: "Đã tất toán",
  overdue: "Quá hạn",
  due_soon: "Sắp đến hạn",
  open: "Còn hạn",
};

export function DataTable({ kind, rows, onEdit, onDelete, onExport, onDownloadTemplate, onImport, importing = false, compact = false }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [page, setPage] = useState(1);
  const pageSize = compact ? 8 : 20;
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));

  const safePage = Math.min(page, pages);
  const visible = useMemo(() => rows.slice((safePage - 1) * pageSize, safePage * pageSize), [rows, safePage, pageSize]);
  const actions = Boolean(onEdit || onDelete);

  return (
    <section className="table-card">
      <div className="table-toolbar">
        <div><strong>{tableTitle(kind)}</strong><span>{rows.length.toLocaleString("vi-VN")} bản ghi</span></div>
        <div className="table-toolbar-actions">
          {onDownloadTemplate && <button className="secondary-button" type="button" onClick={onDownloadTemplate}><FileDown size={17} /> Tải mẫu Excel</button>}
          {onImport && (
            <>
              <input ref={fileInputRef} className="hidden-file-input" type="file" accept=".xlsx,.xls" onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) onImport(file);
              }} />
              <button className="secondary-button" type="button" onClick={() => fileInputRef.current?.click()} disabled={importing}><FileUp size={17} /> {importing ? "Đang nhập…" : "Nhập Excel"}</button>
            </>
          )}
          <button className="secondary-button" type="button" onClick={onExport} disabled={!rows.length}><FileSpreadsheet size={17} /> Xuất CSV</button>
        </div>
      </div>
      <div className="table-scroll">
        <table>
          <thead>{renderHeader(kind, actions)}</thead>
          <tbody>
            {!visible.length && <tr><td className="empty-cell" colSpan={12}>Không có dữ liệu phù hợp.</td></tr>}
            {kind === "debts" || kind === "overview"
              ? (visible as DebtRow[]).map((row) => (
                <tr key={row.id} className={row.status === "overdue" ? "overdue-row" : ""}>
                  <td><div className="customer-cell"><strong>{row.customer_name}</strong><small>{row.customer_code || row.phone || "Chưa có mã KH"}</small></div></td>
                  <td>{formatDate(row.order_date)}</td>
                  <td>{formatDate(row.due_date)}</td>
                  <td>{row.sales_person || "—"}</td>
                  <td>{row.delivery_person || "—"}</td>
                  <td className="number-cell">{money.format(row.amount)}</td>
                  <td className="number-cell paid-text">{money.format(row.paid_amount)}</td>
                  <td className="number-cell"><strong>{money.format(row.remaining_amount)}</strong></td>
                  <td><span className={`status-pill ${row.status}`}>{statusLabels[row.status]}</span></td>
                  {actions && actionCell(row, onEdit, onDelete)}
                </tr>
              ))
              : kind === "payments"
                ? (visible as PaymentRow[]).map((row) => (
                  <tr key={row.id}>
                    <td><div className="customer-cell"><strong>{row.debt?.customer?.name || "Không rõ"}</strong><small>Khoản nợ {formatDate(row.debt?.order_date)}</small></div></td>
                    <td>{formatDate(row.paid_at)}</td>
                    <td className="number-cell"><strong className="paid-text">{money.format(row.amount)}</strong></td>
                    <td>{row.sales_person || "—"}</td>
                    <td>{row.delivery_person || "—"}</td>
                    <td className="note-cell">{row.notes || "—"}</td>
                    {actions && actionCell(row, onEdit, onDelete)}
                  </tr>
                ))
                : (visible as ReturnRow[]).map((row) => (
                  <tr key={row.id}>
                    <td><strong>{row.customer?.name || "Không rõ"}</strong></td>
                    <td>{row.product_name}</td>
                    <td className="number-cell">{integer.format(row.quantity)}</td>
                    <td className="number-cell">{money.format(row.unit_price)}</td>
                    <td className="number-cell"><strong>{money.format(row.total_amount)}</strong></td>
                    <td>{formatDate(row.returned_at)}</td>
                    <td className="note-cell">{row.notes || "—"}</td>
                    {actions && actionCell(row, onEdit, onDelete)}
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
      {!compact && rows.length > pageSize && (
        <div className="pagination">
          <span>Trang {safePage}/{pages}</span>
          <div><button className="icon-button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={safePage === 1}><ChevronLeft size={18} /></button><button className="icon-button" onClick={() => setPage((value) => Math.min(pages, value + 1))} disabled={safePage === pages}><ChevronRight size={18} /></button></div>
        </div>
      )}
    </section>
  );
}

function tableTitle(kind: Props["kind"]) {
  if (kind === "payments") return "Danh sách khách hàng trả nợ";
  if (kind === "returns") return "Danh sách hàng thu hồi";
  if (kind === "overview") return "Khoản nợ gần đây";
  return "Danh sách khoản nợ";
}

function renderHeader(kind: Props["kind"], actions: boolean) {
  if (kind === "payments") return <tr><th>Khách hàng</th><th>Ngày trả</th><th className="number-cell">Số tiền trả</th><th>NV kinh doanh</th><th>NV giao hàng</th><th>Ghi chú</th>{actions && <th />}</tr>;
  if (kind === "returns") return <tr><th>Khách hàng</th><th>Sản phẩm</th><th className="number-cell">SL</th><th className="number-cell">Đơn giá</th><th className="number-cell">Thành tiền</th><th>Ngày thu hồi</th><th>Ghi chú</th>{actions && <th />}</tr>;
  return <tr><th>Khách hàng</th><th>Ngày nợ</th><th>Hạn trả</th><th>NV kinh doanh</th><th>NV giao hàng</th><th className="number-cell">Tiền nợ</th><th className="number-cell">Đã trả</th><th className="number-cell">Còn lại</th><th>Trạng thái</th>{actions && <th />}</tr>;
}

function actionCell(row: Row, onEdit?: (row: Row) => void, onDelete?: (id: string) => void) {
  return (
    <td className="actions-cell">
      {onEdit && <button className="icon-button" onClick={() => onEdit(row)} title="Sửa"><Pencil size={16} /></button>}
      {onDelete && <button className="icon-button danger" onClick={() => onDelete(row.id)} title="Xoá"><Trash2 size={16} /></button>}
    </td>
  );
}
