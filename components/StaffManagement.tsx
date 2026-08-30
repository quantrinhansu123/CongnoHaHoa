"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDownToLine, Banknote, Edit3, Eye, EyeOff, LoaderCircle, Plus, RefreshCw, Search, Trash2, UserPlus, WalletCards, X } from "lucide-react";
import { formatDate, money } from "@/lib/format";
import { importSalesStaffFromDebts } from "@/lib/staff-import";
import {
  STAFF_DEPARTMENT_DRIVER,
  STAFF_DEPARTMENT_SALES,
} from "@/lib/route-helpers";
import { fetchStaffDebtDetails, normalizeStaffMetrics, syncStaffMetrics } from "@/lib/staff-sync";
import { supabase } from "@/lib/supabase";
import type { DebtRow, StaffMember } from "@/lib/types";

type Draft = {
  name: string;
  phone: string;
  account: string;
  password: string;
  department: string;
  position: string;
};

export function StaffManagement() {
  const [rows, setRows] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});
  const [detailStaff, setDetailStaff] = useState<StaffMember | null>(null);
  const [detailDebts, setDetailDebts] = useState<DebtRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error: loadError } = await supabase.from("staff_members").select("*").order("name");
    if (loadError) setError(loadError.message);
    else setRows(((data || []) as StaffMember[]).map(normalizeStaffMetrics));
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadData(), 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("vi");
    if (!term) return rows;
    return rows.filter((row) => `${row.name} ${row.phone || ""} ${row.account} ${row.department || ""} ${row.position || ""}`.toLocaleLowerCase("vi").includes(term));
  }, [rows, search]);

  const totals = useMemo(() => ({
    revenue: filtered.reduce((sum, row) => sum + row.total_revenue, 0),
    collected: filtered.reduce((sum, row) => sum + row.total_collected, 0),
    debt: filtered.reduce((sum, row) => sum + row.total_debt, 0),
  }), [filtered]);

  function openCreate() {
    setEditing(null);
    setDraft({ name: "", phone: "", account: "", password: "", department: "", position: "" });
    setError("");
  }

  function openEdit(row: StaffMember) {
    setEditing(row);
    setDraft({ name: row.name, phone: row.phone || "", account: row.account, password: row.password, department: row.department || "", position: row.position || "" });
    setError("");
  }

  async function openDetail(row: StaffMember) {
    setDetailStaff(row);
    setDetailDebts([]);
    setDetailLoading(true);
    setError("");
    try {
      setDetailDebts(await fetchStaffDebtDetails(row.name));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không tải được chi tiết công nợ.");
      setDetailStaff(null);
    } finally {
      setDetailLoading(false);
    }
  }

  async function saveStaff(event: FormEvent) {
    event.preventDefault();
    if (!draft?.name.trim() || !draft.account.trim()) {
      setError("Cần nhập tên và tài khoản.");
      return;
    }
    if (!editing && !draft.password.trim()) {
      setError("Cần nhập mật khẩu cho nhân sự mới.");
      return;
    }
    setSaving(true);
    setError("");
    const payload = {
      name: draft.name.trim(),
      phone: draft.phone.trim() || null,
      account: draft.account.trim(),
      password: draft.password.trim() || editing?.password || "",
      department: draft.department.trim() || null,
      position: draft.position.trim() || null,
    };
    const query = editing
      ? supabase.from("staff_members").update(payload).eq("id", editing.id)
      : supabase.from("staff_members").insert(payload);
    const { error: saveError } = await query;
    setSaving(false);
    if (saveError) {
      setError(saveError.code === "23505" ? "Tài khoản đã tồn tại." : saveError.message);
      return;
    }
    setDraft(null);
    setEditing(null);
    setNotice(editing ? "Đã cập nhật nhân sự." : "Đã thêm nhân sự.");
    await loadData();
  }

  async function importSalesStaff() {
    setImporting(true);
    setError("");
    try {
      const result = await importSalesStaffFromDebts(rows);
      if (result.inserted === 0) {
        setNotice(`Đã có đủ ${result.total} NV kinh doanh từ Công nợ, không thêm bản ghi mới.`);
      } else {
        setNotice(`Đã thêm ${result.inserted} NV kinh doanh mới (${result.skipped} đã tồn tại).`);
      }
      await loadData();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không thể điền NV kinh doanh.");
    } finally {
      setImporting(false);
    }
  }

  async function syncMetrics() {
    setSyncing(true);
    setError("");
    try {
      const result = await syncStaffMetrics(rows);
      setNotice(`Đã đồng bộ doanh số, thực thu, công nợ cho ${result.updated} nhân sự (${result.matched} có dữ liệu Công nợ).`);
      await loadData();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không thể đồng bộ dữ liệu Công nợ.");
    } finally {
      setSyncing(false);
    }
  }

  async function deleteStaff(row: StaffMember) {
    if (!window.confirm(`Xoá nhân sự "${row.name}"?`)) return;
    const { error: deleteError } = await supabase.from("staff_members").delete().eq("id", row.id);
    if (deleteError) setError(deleteError.message);
    else {
      setNotice("Đã xoá nhân sự.");
      await loadData();
    }
  }

  return (
    <section className="master-data-page">
      {notice && <div className="sales-notice">{notice}</div>}
      {error && <div className="error-banner"><span>{error}</span><button type="button" onClick={() => setError("")}><X size={17} /></button></div>}

      <section className="summary-grid customer-summary-grid" aria-label="Tổng hợp nhân sự">
        <article className="summary-card">
          <div className="summary-icon blue"><WalletCards size={21} /></div>
          <div><span>Doanh số</span><strong>{money.format(totals.revenue)}</strong></div>
        </article>
        <article className="summary-card">
          <div className="summary-icon amber"><ArrowDownToLine size={21} /></div>
          <div><span>Thực thu</span><strong>{money.format(totals.collected)}</strong></div>
        </article>
        <article className="summary-card emphasis">
          <div className="summary-icon green"><Banknote size={21} /></div>
          <div><span>Công nợ</span><strong>{money.format(totals.debt)}</strong></div>
        </article>
      </section>

      <div className="sales-filter-card staff-filter-card">
        <div className="input-icon sales-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm tên, SĐT, tài khoản…" /></div>
        <button type="button" className="secondary-button" onClick={() => void importSalesStaff()} disabled={importing || loading || syncing}><UserPlus size={17} /> {importing ? "Đang điền…" : "Điền NV KD"}</button>
        <button type="button" className="secondary-button" onClick={() => void syncMetrics()} disabled={syncing || loading || importing || !rows.length}><RefreshCw size={17} className={syncing ? "spin" : undefined} /> {syncing ? "Đang đồng bộ…" : "Đồng bộ CN"}</button>
        <button type="button" className="primary-button" onClick={openCreate}><Plus size={17} /> Thêm nhân sự</button>
      </div>

      <div className="table-card">
        <div className="table-toolbar"><div><strong>Danh sách nhân sự</strong><span>{filtered.length} nhân viên</span></div></div>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Tên</th><th>SĐT</th><th>Tài khoản</th><th>Password</th><th>Bộ phận</th><th>Vị trí</th><th className="number-cell">Doanh số</th><th className="number-cell">Thực thu</th><th className="number-cell">Công nợ</th><th /></tr></thead>
            <tbody>
              {loading && <tr><td className="empty-cell" colSpan={10}><LoaderCircle className="spin" size={21} /> Đang tải…</td></tr>}
              {!loading && !filtered.length && <tr><td className="empty-cell" colSpan={10}>Chưa có nhân sự.</td></tr>}
              {!loading && filtered.map((row) => (
                <tr key={row.id}>
                  <td><strong>{row.name}</strong></td>
                  <td>{row.phone || "—"}</td>
                  <td>{row.account}</td>
                  <td className="password-cell">
                    <span>{visiblePasswords[row.id] ? row.password : "••••••"}</span>
                    <button type="button" className="icon-button" title={visiblePasswords[row.id] ? "Ẩn mật khẩu" : "Hiện mật khẩu"} onClick={() => setVisiblePasswords((current) => ({ ...current, [row.id]: !current[row.id] }))}>
                      {visiblePasswords[row.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </td>
                  <td>{row.department || "—"}</td>
                  <td>{row.position || "—"}</td>
                  <td className="number-cell">{money.format(row.total_revenue)}</td>
                  <td className="number-cell paid-text">{money.format(row.total_collected)}</td>
                  <td className="number-cell"><strong>{money.format(row.total_debt)}</strong></td>
                  <td className="actions-cell">
                    <button type="button" className="icon-button" title="Xem chi tiết" onClick={() => void openDetail(row)}><Eye size={15} /></button>
                    <button type="button" className="icon-button" title="Sửa" onClick={() => openEdit(row)}><Edit3 size={15} /></button>
                    <button type="button" className="icon-button danger" title="Xoá" onClick={() => void deleteStaff(row)}><Trash2 size={15} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {draft && (
        <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setDraft(null)}>
          <section className="modal-card master-data-modal" role="dialog" aria-modal="true">
            <div className="modal-heading"><div><p className="eyebrow">NHÂN SỰ</p><h2>{editing ? "Sửa nhân sự" : "Thêm nhân sự"}</h2></div><button type="button" className="icon-button" onClick={() => setDraft(null)}><X /></button></div>
            <form onSubmit={saveStaff}>
              <div className="form-grid">
                <label className="field"><span>Tên *</span><input required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
                <label className="field"><span>SĐT</span><input value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} /></label>
                <label className="field"><span>Tài khoản *</span><input required value={draft.account} onChange={(event) => setDraft({ ...draft, account: event.target.value })} disabled={Boolean(editing)} /></label>
                <label className="field"><span>Password{editing ? "" : " *"}</span><input type="text" value={draft.password} onChange={(event) => setDraft({ ...draft, password: event.target.value })} placeholder={editing ? "Để trống nếu không đổi" : ""} required={!editing} /></label>
                <label className="field"><span>Bộ phận</span><select value={draft.department} onChange={(event) => setDraft({ ...draft, department: event.target.value })}><option value="">Chưa phân bộ phận</option><option value={STAFF_DEPARTMENT_SALES}>{STAFF_DEPARTMENT_SALES}</option><option value={STAFF_DEPARTMENT_DRIVER}>{STAFF_DEPARTMENT_DRIVER}</option></select></label>
                <label className="field"><span>Vị trí</span><input value={draft.position} onChange={(event) => setDraft({ ...draft, position: event.target.value })} /></label>
              </div>
              <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setDraft(null)}>Huỷ</button><button type="submit" className="primary-button" disabled={saving}>{saving ? "Đang lưu…" : editing ? "Lưu thay đổi" : "Thêm nhân sự"}</button></div>
            </form>
          </section>
        </div>
      )}

      {detailStaff && (
        <StaffDetailModal
          staff={detailStaff}
          debts={detailDebts}
          loading={detailLoading}
          onClose={() => setDetailStaff(null)}
        />
      )}
    </section>
  );
}

function StaffDetailModal({ staff, debts, loading, onClose }: {
  staff: StaffMember;
  debts: DebtRow[];
  loading: boolean;
  onClose: () => void;
}) {
  const totals = useMemo(() => ({
    revenue: debts.reduce((sum, row) => sum + row.amount, 0),
    collected: debts.reduce((sum, row) => sum + row.paid_amount, 0),
    debt: debts.reduce((sum, row) => sum + row.remaining_amount, 0),
  }), [debts]);

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal-card staff-detail-modal" role="dialog" aria-modal="true">
        <div className="modal-heading">
          <div>
            <p className="eyebrow">CHI TIẾT NHÂN SỰ</p>
            <h2>{staff.name}</h2>
            <small>{staff.department || "Chưa phân bộ phận"}{staff.position ? ` · ${staff.position}` : ""}</small>
          </div>
          <button type="button" className="icon-button" onClick={onClose}><X /></button>
        </div>

        <div className="staff-detail-summary">
          <article><span>Doanh số</span><strong>{money.format(totals.revenue)}</strong></article>
          <article><span>Thực thu</span><strong className="paid-text">{money.format(totals.collected)}</strong></article>
          <article><span>Công nợ</span><strong>{money.format(totals.debt)}</strong></article>
          <article><span>Số khoản nợ</span><strong>{debts.length.toLocaleString("vi-VN")}</strong></article>
        </div>

        <div className="table-scroll staff-detail-table">
          <table>
            <thead><tr><th>Khách hàng</th><th>Ngày đặt</th><th>Hạn trả</th><th className="number-cell">Doanh số</th><th className="number-cell">Đã thu</th><th className="number-cell">Còn nợ</th><th>Trạng thái</th></tr></thead>
            <tbody>
              {loading && <tr><td className="empty-cell" colSpan={7}><LoaderCircle className="spin" size={21} /> Đang tải chi tiết…</td></tr>}
              {!loading && !debts.length && <tr><td className="empty-cell" colSpan={7}>Không có khoản nợ theo NV kinh doanh này.</td></tr>}
              {!loading && debts.map((row) => (
                <tr key={row.id}>
                  <td><strong>{row.customer_name}</strong>{row.customer_code ? <small>{row.customer_code}</small> : null}</td>
                  <td>{formatDate(row.order_date)}</td>
                  <td>{formatDate(row.due_date)}</td>
                  <td className="number-cell">{money.format(row.amount)}</td>
                  <td className="number-cell paid-text">{money.format(row.paid_amount)}</td>
                  <td className="number-cell"><strong>{money.format(row.remaining_amount)}</strong></td>
                  <td>{statusLabel(row.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {staff.metrics_synced_at && <p className="staff-sync-note">Dữ liệu đồng bộ lần cuối: {new Date(staff.metrics_synced_at).toLocaleString("vi-VN")}</p>}
      </section>
    </div>
  );
}

function statusLabel(status: DebtRow["status"]) {
  if (status === "paid") return "Đã trả";
  if (status === "overdue") return "Quá hạn";
  if (status === "due_soon") return "Sắp đến hạn";
  return "Đang nợ";
}
