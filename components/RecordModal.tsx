"use client";

import { FormEvent, useMemo, useState } from "react";
import { X } from "lucide-react";
import { money, todayIso, toNumber, formatDate, formatOverdueDays } from "@/lib/format";
import type { AppSettings, CustomerOption, DebtRow, PaymentRow, ReturnRow } from "@/lib/types";

export type ModalKind = "debts" | "payments" | "returns";
export type EditableRow = DebtRow | PaymentRow | ReturnRow;
export type RecordPayload = Record<string, string | number | null>;

interface Props {
  open: boolean;
  kind: ModalKind;
  record: EditableRow | null;
  customers: CustomerOption[];
  debts: DebtRow[];
  settings: AppSettings;
  saving: boolean;
  presetDebtId?: string | null;
  onClose: () => void;
  onSave: (payload: RecordPayload) => Promise<void>;
}

export function RecordModal({ open, kind, record, customers, debts, settings, saving, presetDebtId = null, onClose, onSave }: Props) {
  const [form, setForm] = useState<Record<string, string>>(() => initialForm(kind, record, settings, presetDebtId, debts));

  const selectedDebt = useMemo(() => debts.find((debt) => debt.id === form.debt_id), [debts, form.debt_id]);
  const lockedDebt = presetDebtId && !record ? selectedDebt : null;
  if (!open) return null;

  const set = (field: string, value: string) => setForm((current) => ({ ...current, [field]: value }));
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (kind === "debts") {
      await onSave({ ...form, amount: toNumber(form.amount), due_days: toNumber(form.due_days), quantity: form.quantity ? Number(form.quantity) : null, unit_price: form.unit_price ? toNumber(form.unit_price) : null });
    } else if (kind === "payments") {
      await onSave({ ...form, amount: toNumber(form.amount) });
    } else {
      await onSave({ ...form, quantity: Number(form.quantity), unit_price: toNumber(form.unit_price), debt_id: form.debt_id || null });
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="modal-heading"><div><p className="eyebrow">{record ? "CHỈNH SỬA" : lockedDebt ? "THANH TOÁN" : "THÊM MỚI"}</p><h2 id="modal-title">{kindLabel(kind, Boolean(lockedDebt))}</h2></div><button className="icon-button" onClick={onClose}><X /></button></div>
        <form onSubmit={submit}>
          {kind === "debts" && (
            <div className="form-grid">
              <label className="span-2"><span>Khách hàng *</span><select value={form.customer_id || ""} onChange={(event) => set("customer_id", event.target.value)} required={!form.new_customer} disabled={Boolean(record)}><option value="">Chọn khách hàng</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}{customer.code ? ` · ${customer.code}` : ""}</option>)}</select></label>
              {!record && <label className="span-2 field-divider"><span>Hoặc tạo khách hàng mới</span><input value={form.new_customer || ""} onChange={(event) => set("new_customer", event.target.value)} placeholder="Tên khách hàng mới" /></label>}
              {form.new_customer && <><label><span>Mã khách hàng</span><input value={form.customer_code || ""} onChange={(event) => set("customer_code", event.target.value)} /></label><label><span>Số điện thoại</span><input value={form.phone || ""} onChange={(event) => set("phone", event.target.value)} /></label><label className="span-2"><span>Khu vực</span><input value={form.region || ""} onChange={(event) => set("region", event.target.value)} /></label></>}
              <label><span>Số tiền nợ *</span><input inputMode="numeric" value={form.amount || ""} onChange={(event) => set("amount", event.target.value)} required /></label>
              <label><span>Ngày nợ *</span><input type="date" value={form.order_date || ""} onChange={(event) => set("order_date", event.target.value)} required /></label>
              <label><span>Hạn nợ</span><select value={form.due_days || ""} onChange={(event) => set("due_days", event.target.value)}>{settings.debt_terms.map((term) => <option key={term} value={term}>{term} ngày</option>)}</select></label>
              <label><span>NV kinh doanh</span><input value={form.sales_person || ""} onChange={(event) => set("sales_person", event.target.value)} /></label>
              <label><span>NV giao hàng</span><input value={form.delivery_person || ""} onChange={(event) => set("delivery_person", event.target.value)} /></label>
              <label><span>Sản phẩm/mặt hàng</span><input value={form.product_name || ""} onChange={(event) => set("product_name", event.target.value)} /></label>
              <label><span>Số lượng</span><input type="number" min="0" step="0.01" value={form.quantity || ""} onChange={(event) => set("quantity", event.target.value)} /></label>
              <label><span>Đơn giá</span><input inputMode="numeric" value={form.unit_price || ""} onChange={(event) => set("unit_price", event.target.value)} /></label>
              <label className="span-2"><span>Ghi chú</span><textarea value={form.notes || ""} onChange={(event) => set("notes", event.target.value)} /></label>
            </div>
          )}

          {kind === "payments" && (
            <div className="form-grid">
              {lockedDebt ? (
                <div className="span-2 payment-debt-summary">
                  <p className="eyebrow">Khoản nợ đang thanh toán</p>
                  <strong>{lockedDebt.customer_name}</strong>
                  <small>{lockedDebt.customer_code || lockedDebt.phone || "Chưa có mã KH"}</small>
                  <div className="payment-debt-grid">
                    <div><span>Ngày nợ</span><strong>{formatDate(lockedDebt.order_date)}</strong></div>
                    <div><span>Hạn trả</span><strong>{formatDate(lockedDebt.due_date)}</strong></div>
                    <div><span>Số ngày quá hạn</span><strong>{formatOverdueDays(lockedDebt.due_date, lockedDebt.status)}</strong></div>
                    <div><span>Tiền nợ</span><strong>{money.format(lockedDebt.amount)}</strong></div>
                    <div><span>Đã trả</span><strong className="paid-text">{money.format(lockedDebt.paid_amount)}</strong></div>
                    <div><span>Còn lại</span><strong className="remaining-amount">{money.format(lockedDebt.remaining_amount)}</strong></div>
                  </div>
                </div>
              ) : (
                <label className="span-2"><span>Khoản nợ *</span><select value={form.debt_id || ""} onChange={(event) => set("debt_id", event.target.value)} required disabled={Boolean(record)}><option value="">Chọn khoản nợ</option>{debts.filter((debt) => debt.remaining_amount > 0 || debt.id === form.debt_id).map((debt) => <option key={debt.id} value={debt.id}>{debt.customer_name} · còn {money.format(debt.remaining_amount)} · {formatDate(debt.order_date)}</option>)}</select></label>
              )}
              {selectedDebt && !lockedDebt && <div className="span-2 debt-context"><span>Dư nợ hiện tại</span><strong>{money.format(selectedDebt.remaining_amount)}</strong></div>}
              <label><span>Số tiền trả *</span><input inputMode="numeric" value={form.amount || ""} onChange={(event) => set("amount", event.target.value)} required /></label>
              <label><span>Ngày trả *</span><input type="date" value={form.paid_at || ""} onChange={(event) => set("paid_at", event.target.value)} required /></label>
              <label><span>NV kinh doanh</span><input value={form.sales_person || ""} onChange={(event) => set("sales_person", event.target.value)} /></label>
              <label><span>NV giao hàng</span><input value={form.delivery_person || ""} onChange={(event) => set("delivery_person", event.target.value)} /></label>
              <label className="span-2"><span>Ghi chú</span><textarea value={form.notes || ""} onChange={(event) => set("notes", event.target.value)} /></label>
            </div>
          )}

          {kind === "returns" && (
            <div className="form-grid">
              <label className="span-2"><span>Khách hàng *</span><select value={form.customer_id || ""} onChange={(event) => { set("customer_id", event.target.value); set("debt_id", ""); }} required disabled={Boolean(record)}><option value="">Chọn khách hàng</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label>
              <label className="span-2"><span>Gắn với khoản nợ (không bắt buộc)</span><select value={form.debt_id || ""} onChange={(event) => set("debt_id", event.target.value)}><option value="">Không gắn khoản nợ cụ thể</option>{debts.filter((debt) => debt.customer_id === form.customer_id).map((debt) => <option key={debt.id} value={debt.id}>{debt.order_date} · {money.format(debt.remaining_amount)} còn lại</option>)}</select></label>
              <label className="span-2"><span>Sản phẩm/mặt hàng *</span><input value={form.product_name || ""} onChange={(event) => set("product_name", event.target.value)} required /></label>
              <label><span>Số lượng *</span><input type="number" min="0.01" step="0.01" value={form.quantity || ""} onChange={(event) => set("quantity", event.target.value)} required /></label>
              <label><span>Đơn giá *</span><input inputMode="numeric" value={form.unit_price || ""} onChange={(event) => set("unit_price", event.target.value)} required /></label>
              <label><span>Ngày thu hồi *</span><input type="date" value={form.returned_at || ""} onChange={(event) => set("returned_at", event.target.value)} required /></label>
              <label><span>Thành tiền</span><input value={money.format(Number(form.quantity || 0) * toNumber(form.unit_price))} readOnly /></label>
              <label className="span-2"><span>Ghi chú</span><textarea value={form.notes || ""} onChange={(event) => set("notes", event.target.value)} /></label>
            </div>
          )}
          <div className="modal-actions"><button className="secondary-button" type="button" onClick={onClose}>Huỷ</button><button className="primary-button" type="submit" disabled={saving}>{saving ? "Đang lưu…" : lockedDebt ? "Ghi nhận thanh toán" : record ? "Lưu thay đổi" : "Thêm dữ liệu"}</button></div>
        </form>
      </section>
    </div>
  );
}

function kindLabel(kind: ModalKind, payingDebt = false) {
  if (kind === "payments") return payingDebt ? "Thanh toán khoản nợ" : "Khách hàng trả nợ";
  if (kind === "returns") return "Hàng thu hồi";
  return "Khoản nợ khách hàng";
}

function initialForm(kind: ModalKind, record: EditableRow | null, settings: AppSettings, presetDebtId: string | null = null, debts: DebtRow[] = []): Record<string, string> {
  if (kind === "debts") {
    const row = record as DebtRow | null;
    return { customer_id: row?.customer_id || "", new_customer: "", customer_code: "", phone: "", region: "", amount: row ? String(row.amount) : "", order_date: row?.order_date || todayIso(), due_days: String(row?.due_days || settings.debt_terms[0] || 30), sales_person: row?.sales_person || "", delivery_person: row?.delivery_person || "", product_name: row?.product_name || "", quantity: row?.quantity ? String(row.quantity) : "", unit_price: row?.unit_price ? String(row.unit_price) : "", notes: row?.notes || "" };
  }
  if (kind === "payments") {
    const row = record as PaymentRow | null;
    const debtId = row?.debt_id || presetDebtId || "";
    const debt = debts.find((item) => item.id === debtId);
    return { debt_id: debtId, amount: row ? String(row.amount) : "", paid_at: row?.paid_at || todayIso(), sales_person: row?.sales_person || debt?.sales_person || "", delivery_person: row?.delivery_person || debt?.delivery_person || "", notes: row?.notes || "" };
  }
  const row = record as ReturnRow | null;
  return { customer_id: row?.customer_id || "", debt_id: row?.debt_id || "", product_name: row?.product_name || "", quantity: row ? String(row.quantity) : "1", unit_price: row ? String(row.unit_price) : "", returned_at: row?.returned_at || todayIso(), notes: row?.notes || "" };
}
