"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Edit3, LoaderCircle, Plus, Search, Trash2, Users, WalletCards, ArrowDownToLine, Banknote, X } from "lucide-react";
import { money } from "@/lib/format";
import { formatLocationsList, normalizeLocations } from "@/lib/route-helpers";
import { supabase } from "@/lib/supabase";
import type { CustomerListRow, RouteOption } from "@/lib/types";

type Draft = { name: string; phone: string; route_id: string };

export function CustomerListManagement() {
  const [rows, setRows] = useState<CustomerListRow[]>([]);
  const [routes, setRoutes] = useState<RouteOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<CustomerListRow | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    const [customerResult, routeResult] = await Promise.all([
      supabase.from("customer_list_overview").select("*").order("name"),
      supabase.from("routes").select("id,name,locations").order("name"),
    ]);
    if (customerResult.error || routeResult.error) {
      setError(customerResult.error?.message || routeResult.error?.message || "Không tải được dữ liệu.");
    } else {
      setRows(((customerResult.data || []) as CustomerListRow[]).map(normalizeRow));
      setRoutes(((routeResult.data || []) as RouteOption[]).map((route) => ({
        ...route,
        locations: normalizeLocations(route.locations),
      })));
    }
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
    return rows.filter((row) => `${row.name} ${row.phone || ""} ${row.route_name || ""} ${row.route_location || ""}`.toLocaleLowerCase("vi").includes(term));
  }, [rows, search]);

  const totals = useMemo(() => ({
    customers: filtered.length,
    revenue: filtered.reduce((sum, row) => sum + row.total_revenue, 0),
    collected: filtered.reduce((sum, row) => sum + row.total_collected, 0),
    debt: filtered.reduce((sum, row) => sum + row.total_debt, 0),
  }), [filtered]);

  function openCreate() {
    setEditing(null);
    setDraft({ name: "", phone: "", route_id: "" });
    setError("");
  }

  function openEdit(row: CustomerListRow) {
    setEditing(row);
    setDraft({ name: row.name, phone: row.phone || "", route_id: row.route_id || "" });
    setError("");
  }

  async function saveCustomer(event: FormEvent) {
    event.preventDefault();
    if (!draft?.name.trim()) {
      setError("Cần nhập tên khách hàng.");
      return;
    }
    setSaving(true);
    setError("");
    const payload = { name: draft.name.trim(), phone: draft.phone.trim() || null, route_id: draft.route_id || null };
    const query = editing
      ? supabase.from("customers").update(payload).eq("id", editing.id)
      : supabase.from("customers").insert(payload);
    const { error: saveError } = await query;
    setSaving(false);
    if (saveError) {
      setError(saveError.message);
      return;
    }
    setDraft(null);
    setEditing(null);
    setNotice(editing ? "Đã cập nhật khách hàng." : "Đã thêm khách hàng.");
    await loadData();
  }

  async function deleteCustomer(row: CustomerListRow) {
    if (!window.confirm(`Xoá khách hàng "${row.name}"?`)) return;
    const { error: deleteError } = await supabase.from("customers").delete().eq("id", row.id);
    if (deleteError) setError(deleteError.message);
    else {
      setNotice("Đã xoá khách hàng.");
      await loadData();
    }
  }

  return (
    <section className="master-data-page">
      {notice && <div className="sales-notice">{notice}</div>}
      {error && <div className="error-banner"><span>{error}</span><button type="button" onClick={() => setError("")}><X size={17} /></button></div>}

      <section className="summary-grid customer-summary-grid" aria-label="Tổng hợp danh sách khách hàng">
        <article className="summary-card">
          <div className="summary-icon indigo"><Users size={21} /></div>
          <div><span>Số khách hàng</span><strong>{totals.customers.toLocaleString("vi-VN")}</strong></div>
        </article>
        <article className="summary-card">
          <div className="summary-icon blue"><WalletCards size={21} /></div>
          <div><span>Tổng doanh số</span><strong>{money.format(totals.revenue)}</strong></div>
        </article>
        <article className="summary-card">
          <div className="summary-icon amber"><ArrowDownToLine size={21} /></div>
          <div><span>Đã thu</span><strong>{money.format(totals.collected)}</strong></div>
        </article>
        <article className="summary-card emphasis">
          <div className="summary-icon green"><Banknote size={21} /></div>
          <div><span>Công nợ</span><strong>{money.format(totals.debt)}</strong></div>
        </article>
      </section>

      <div className="sales-filter-card">
        <div className="input-icon sales-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm tên, SĐT, tuyến hoặc địa điểm…" /></div>
        <button type="button" className="primary-button" onClick={openCreate}><Plus size={17} /> Thêm khách hàng</button>
      </div>

      <div className="table-card">
        <div className="table-toolbar"><div><strong>Danh sách khách hàng</strong><span>{filtered.length} khách hàng</span></div></div>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Tên</th><th>SĐT</th><th>Tuyến</th><th>Địa điểm</th><th className="number-cell">Doanh thu</th><th className="number-cell">Đã thu</th><th className="number-cell">Công nợ</th><th /></tr></thead>
            <tbody>
              {loading && <tr><td className="empty-cell" colSpan={8}><LoaderCircle className="spin" size={21} /> Đang tải…</td></tr>}
              {!loading && !filtered.length && <tr><td className="empty-cell" colSpan={8}>Chưa có khách hàng.</td></tr>}
              {!loading && filtered.map((row) => (
                <tr key={row.id}>
                  <td><strong>{row.name}</strong></td>
                  <td>{row.phone || "—"}</td>
                  <td>{row.route_name || "—"}</td>
                  <td>{row.route_location || "—"}</td>
                  <td className="number-cell">{money.format(row.total_revenue)}</td>
                  <td className="number-cell paid-text">{money.format(row.total_collected)}</td>
                  <td className="number-cell"><strong>{money.format(row.total_debt)}</strong></td>
                  <td className="actions-cell">
                    <button type="button" className="icon-button" title="Sửa" onClick={() => openEdit(row)}><Edit3 size={15} /></button>
                    <button type="button" className="icon-button danger" title="Xoá" onClick={() => void deleteCustomer(row)}><Trash2 size={15} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {draft && (
        <CustomerFormModal
          draft={draft}
          editing={Boolean(editing)}
          routes={routes}
          saving={saving}
          onChange={setDraft}
          onClose={() => setDraft(null)}
          onSubmit={saveCustomer}
        />
      )}
    </section>
  );
}

function CustomerFormModal({ draft, editing, routes, saving, onChange, onClose, onSubmit }: {
  draft: Draft;
  editing: boolean;
  routes: RouteOption[];
  saving: boolean;
  onChange: (draft: Draft) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
}) {
  const selectedRoute = routes.find((route) => route.id === draft.route_id);

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal-card master-data-modal" role="dialog" aria-modal="true">
        <div className="modal-heading"><div><p className="eyebrow">DANH SÁCH KHÁCH HÀNG</p><h2>{editing ? "Sửa khách hàng" : "Thêm khách hàng"}</h2></div><button type="button" className="icon-button" onClick={onClose}><X /></button></div>
        <form onSubmit={onSubmit}>
          <div className="form-grid">
            <label className="field span-2"><span>Tên *</span><input required value={draft.name} onChange={(event) => onChange({ ...draft, name: event.target.value })} /></label>
            <label className="field"><span>SĐT</span><input value={draft.phone} onChange={(event) => onChange({ ...draft, phone: event.target.value })} /></label>
            <label className="field"><span>Tuyến</span><select value={draft.route_id} onChange={(event) => onChange({ ...draft, route_id: event.target.value })}><option value="">Chưa phân tuyến</option>{routes.map((route) => <option key={route.id} value={route.id}>{route.name}</option>)}</select></label>
            <label className="field span-2"><span>Địa điểm</span><input readOnly value={selectedRoute ? formatLocationsList(selectedRoute.locations) : ""} placeholder="Chọn tuyến để lấy địa điểm" /><small>Địa điểm tự lấy theo thứ tự trên tuyến đã chọn.</small></label>
          </div>
          <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Huỷ</button><button type="submit" className="primary-button" disabled={saving}>{saving ? "Đang lưu…" : editing ? "Lưu thay đổi" : "Thêm khách hàng"}</button></div>
        </form>
      </section>
    </div>
  );
}

function normalizeRow(row: CustomerListRow): CustomerListRow {
  return {
    ...row,
    total_revenue: Number(row.total_revenue),
    total_collected: Number(row.total_collected),
    total_debt: Number(row.total_debt),
  };
}
