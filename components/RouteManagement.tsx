"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Edit3, LoaderCircle, Plus, Search, Trash2, X } from "lucide-react";
import {
  STAFF_DEPARTMENT_DRIVER,
  STAFF_DEPARTMENT_SALES,
  formatLocationsList,
  isDriverDepartment,
  isSalesDepartment,
  normalizeAssignedStaff,
  normalizeLocations,
  reindexLocations,
  staffNames,
  type RouteAssignedStaff,
  type RouteLocationItem,
} from "@/lib/route-helpers";
import { supabase } from "@/lib/supabase";
import type { RouteOverviewRow, StaffOption } from "@/lib/types";

type Draft = {
  name: string;
  locations: RouteLocationItem[];
  assigned_staff: RouteAssignedStaff;
};

export function RouteManagement() {
  const [rows, setRows] = useState<RouteOverviewRow[]>([]);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<RouteOverviewRow | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  const salesStaff = useMemo(() => staff.filter((member) => isSalesDepartment(member.department)), [staff]);
  const driverStaff = useMemo(() => staff.filter((member) => isDriverDepartment(member.department)), [staff]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    const [routeResult, staffResult] = await Promise.all([
      supabase.from("route_overview").select("*").order("name"),
      supabase.from("staff_members").select("id,name,phone,department").order("name"),
    ]);
    if (routeResult.error || staffResult.error) {
      setError(routeResult.error?.message || staffResult.error?.message || "Không tải được dữ liệu.");
    } else {
      setRows(((routeResult.data || []) as RouteOverviewRow[]).map(normalizeRouteRow));
      setStaff((staffResult.data || []) as StaffOption[]);
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
    return rows.filter((row) => {
      const haystack = [
        row.name,
        formatLocationsList(row.locations),
        staffNames(row.assigned_staff.sales, staff),
        staffNames(row.assigned_staff.drivers, staff),
      ].join(" ").toLocaleLowerCase("vi");
      return haystack.includes(term);
    });
  }, [rows, search, staff]);

  function openCreate() {
    setEditing(null);
    setDraft({ name: "", locations: [], assigned_staff: { sales: [], drivers: [] } });
    setError("");
  }

  function openEdit(row: RouteOverviewRow) {
    setEditing(row);
    setDraft({
      name: row.name,
      locations: row.locations.map((item) => ({ ...item })),
      assigned_staff: { sales: [...row.assigned_staff.sales], drivers: [...row.assigned_staff.drivers] },
    });
    setError("");
  }

  async function saveRoute(event: FormEvent) {
    event.preventDefault();
    if (!draft?.name.trim()) {
      setError("Cần nhập tên tuyến.");
      return;
    }
    setSaving(true);
    setError("");
    const payload = {
      name: draft.name.trim(),
      locations: reindexLocations(draft.locations),
      assigned_staff: draft.assigned_staff,
    };
    const query = editing
      ? supabase.from("routes").update(payload).eq("id", editing.id)
      : supabase.from("routes").insert(payload);
    const { error: saveError } = await query;
    setSaving(false);
    if (saveError) {
      setError(saveError.code === "23505" ? "Tên tuyến đã tồn tại." : saveError.message);
      return;
    }
    setDraft(null);
    setEditing(null);
    setNotice(editing ? "Đã cập nhật tuyến." : "Đã thêm tuyến.");
    await loadData();
  }

  async function deleteRoute(row: RouteOverviewRow) {
    if (!window.confirm(`Xoá tuyến "${row.name}"?`)) return;
    const { error: deleteError } = await supabase.from("routes").delete().eq("id", row.id);
    if (deleteError) setError(deleteError.message);
    else {
      setNotice("Đã xoá tuyến.");
      await loadData();
    }
  }

  return (
    <section className="master-data-page">
      {notice && <div className="sales-notice">{notice}</div>}
      {error && <div className="error-banner"><span>{error}</span><button type="button" onClick={() => setError("")}><X size={17} /></button></div>}

      <div className="sales-filter-card">
        <div className="input-icon sales-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm tên tuyến, địa điểm, nhân viên…" /></div>
        <button type="button" className="primary-button" onClick={openCreate}><Plus size={17} /> Thêm tuyến</button>
      </div>

      <div className="table-card">
        <div className="table-toolbar"><div><strong>Danh sách tuyến</strong><span>{filtered.length} tuyến</span></div></div>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Tên tuyến</th><th>Địa điểm</th><th>Kinh doanh phụ trách</th><th>Lái xe</th><th /></tr></thead>
            <tbody>
              {loading && <tr><td className="empty-cell" colSpan={5}><LoaderCircle className="spin" size={21} /> Đang tải…</td></tr>}
              {!loading && !filtered.length && <tr><td className="empty-cell" colSpan={5}>Chưa có tuyến.</td></tr>}
              {!loading && filtered.map((row) => (
                <tr key={row.id}>
                  <td><strong>{row.name}</strong></td>
                  <td className="route-locations-cell">{formatLocationsList(row.locations) || "—"}</td>
                  <td>{staffNames(row.assigned_staff.sales, staff) || "—"}</td>
                  <td>{staffNames(row.assigned_staff.drivers, staff) || "—"}</td>
                  <td className="actions-cell">
                    <button type="button" className="icon-button" title="Sửa" onClick={() => openEdit(row)}><Edit3 size={15} /></button>
                    <button type="button" className="icon-button danger" title="Xoá" onClick={() => void deleteRoute(row)}><Trash2 size={15} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {draft && (
        <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setDraft(null)}>
          <section className="modal-card master-data-modal route-modal" role="dialog" aria-modal="true">
            <div className="modal-heading"><div><p className="eyebrow">TUYẾN BÁN HÀNG</p><h2>{editing ? "Sửa tuyến" : "Thêm tuyến"}</h2></div><button type="button" className="icon-button" onClick={() => setDraft(null)}><X /></button></div>
            <form onSubmit={saveRoute}>
              <div className="form-grid">
                <label className="field span-2"><span>Tên tuyến *</span><input required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>

                <div className="span-2 ordered-section">
                  <div className="ordered-section-heading"><strong>Địa điểm theo thứ tự</strong><small>1. Ba Vì · 2. Bất Bạt · …</small></div>
                  <OrderedLocationEditor
                    items={draft.locations}
                    onChange={(locations) => setDraft({ ...draft, locations })}
                  />
                </div>

                <div className="span-2 ordered-section">
                  <div className="ordered-section-heading"><strong>Kinh doanh phụ trách</strong><small>Chọn từ nhân sự bộ phận {STAFF_DEPARTMENT_SALES}</small></div>
                  <StaffPickList
                    selectedIds={draft.assigned_staff.sales}
                    options={salesStaff}
                    emptyHint={`Chưa có nhân sự bộ phận ${STAFF_DEPARTMENT_SALES}. Thêm ở mục Nhân sự.`}
                    onChange={(sales) => setDraft({ ...draft, assigned_staff: { ...draft.assigned_staff, sales } })}
                  />
                </div>

                <div className="span-2 ordered-section">
                  <div className="ordered-section-heading"><strong>Lái xe</strong><small>Chọn từ nhân sự bộ phận {STAFF_DEPARTMENT_DRIVER}</small></div>
                  <StaffPickList
                    selectedIds={draft.assigned_staff.drivers}
                    options={driverStaff}
                    emptyHint={`Chưa có nhân sự bộ phận ${STAFF_DEPARTMENT_DRIVER}. Thêm ở mục Nhân sự.`}
                    onChange={(drivers) => setDraft({ ...draft, assigned_staff: { ...draft.assigned_staff, drivers } })}
                  />
                </div>
              </div>
              <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setDraft(null)}>Huỷ</button><button type="submit" className="primary-button" disabled={saving}>{saving ? "Đang lưu…" : editing ? "Lưu thay đổi" : "Thêm tuyến"}</button></div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}

function OrderedLocationEditor({ items, onChange }: { items: RouteLocationItem[]; onChange: (items: RouteLocationItem[]) => void }) {
  const [newName, setNewName] = useState("");

  function addItem() {
    const name = newName.trim();
    if (!name) return;
    onChange(reindexLocations([...items, { order: items.length + 1, name }]));
    setNewName("");
  }

  function updateName(index: number, name: string) {
    onChange(reindexLocations(items.map((item, itemIndex) => itemIndex === index ? { ...item, name } : item)));
  }

  function move(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= items.length) return;
    const next = [...items];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    onChange(reindexLocations(next));
  }

  function remove(index: number) {
    onChange(reindexLocations(items.filter((_, itemIndex) => itemIndex !== index)));
  }

  return (
    <div className="ordered-list-editor">
      {!items.length && <p className="ordered-empty">Chưa có địa điểm.</p>}
      {items.map((item, index) => (
        <div className="ordered-list-row" key={`${item.order}-${index}`}>
          <span className="ordered-index">{index + 1}.</span>
          <input value={item.name} onChange={(event) => updateName(index, event.target.value)} placeholder="Tên địa điểm" />
          <div className="ordered-list-actions">
            <button type="button" className="icon-button" title="Lên" disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={14} /></button>
            <button type="button" className="icon-button" title="Xuống" disabled={index === items.length - 1} onClick={() => move(index, 1)}><ArrowDown size={14} /></button>
            <button type="button" className="icon-button danger" title="Xoá" onClick={() => remove(index)}><Trash2 size={14} /></button>
          </div>
        </div>
      ))}
      <div className="ordered-list-add">
        <input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Thêm địa điểm mới…" onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addItem(); } }} />
        <button type="button" className="secondary-button" onClick={addItem}><Plus size={15} /> Thêm</button>
      </div>
    </div>
  );
}

function StaffPickList({ selectedIds, options, emptyHint, onChange }: {
  selectedIds: string[];
  options: StaffOption[];
  emptyHint: string;
  onChange: (ids: string[]) => void;
}) {
  const [pickId, setPickId] = useState("");

  function addMember() {
    if (!pickId || selectedIds.includes(pickId)) return;
    onChange([...selectedIds, pickId]);
    setPickId("");
  }

  function move(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= selectedIds.length) return;
    const next = [...selectedIds];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    onChange(next);
  }

  function remove(index: number) {
    onChange(selectedIds.filter((_, itemIndex) => itemIndex !== index));
  }

  const available = options.filter((member) => !selectedIds.includes(member.id));

  return (
    <div className="ordered-list-editor">
      {!options.length && <p className="ordered-empty">{emptyHint}</p>}
      {!selectedIds.length && options.length > 0 && <p className="ordered-empty">Chưa phân công.</p>}
      {selectedIds.map((id, index) => {
        const member = options.find((item) => item.id === id);
        return (
          <div className="ordered-list-row" key={id}>
            <span className="ordered-index">{index + 1}.</span>
            <div className="ordered-staff-label"><strong>{member?.name || "Không rõ"}</strong>{member?.phone && <small>{member.phone}</small>}</div>
            <div className="ordered-list-actions">
              <button type="button" className="icon-button" title="Lên" disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={14} /></button>
              <button type="button" className="icon-button" title="Xuống" disabled={index === selectedIds.length - 1} onClick={() => move(index, 1)}><ArrowDown size={14} /></button>
              <button type="button" className="icon-button danger" title="Xoá" onClick={() => remove(index)}><Trash2 size={14} /></button>
            </div>
          </div>
        );
      })}
      {available.length > 0 && (
        <div className="ordered-list-add">
          <select value={pickId} onChange={(event) => setPickId(event.target.value)}>
            <option value="">Chọn nhân viên…</option>
            {available.map((member) => <option key={member.id} value={member.id}>{member.name}{member.phone ? ` · ${member.phone}` : ""}</option>)}
          </select>
          <button type="button" className="secondary-button" onClick={addMember} disabled={!pickId}><Plus size={15} /> Thêm</button>
        </div>
      )}
    </div>
  );
}

function normalizeRouteRow(row: RouteOverviewRow): RouteOverviewRow {
  return {
    ...row,
    locations: normalizeLocations(row.locations),
    assigned_staff: normalizeAssignedStaff(row.assigned_staff),
  };
}
