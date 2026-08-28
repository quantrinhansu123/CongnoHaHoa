"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  ClipboardCopy,
  Edit3,
  LoaderCircle,
  MapPin,
  PackageCheck,
  PhoneCall,
  Plus,
  Search,
  Trash2,
  TrendingUp,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { formatDate, integer, money, todayIso, toNumber } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import type { SalesRating, SalesRouteReport } from "@/lib/types";

type ReportDraft = Omit<SalesRouteReport, "id" | "created_at" | "updated_at" | keyof NumericReportFields> & {
  [K in keyof NumericReportFields]: string;
};

interface NumericReportFields {
  total_customers: number;
  answered_customers: number;
  unanswered_customers: number;
  ordering_customers: number;
  non_ordering_customers: number;
  actual_revenue: number;
  average_revenue: number;
  next_revenue_target: number;
  target_percentage: number | null;
}

const EMPTY_TEXT = "+,";

export function SalesRouteManagement() {
  const [reports, setReports] = useState<SalesRouteReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [editing, setEditing] = useState<SalesRouteReport | null>(null);
  const [draft, setDraft] = useState<ReportDraft | null>(null);

  const loadReports = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error: loadError } = await supabase
      .from("sales_route_reports")
      .select("*")
      .order("report_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (loadError) setError(databaseError(loadError.message));
    else setReports(((data || []) as SalesRouteReport[]).map(normalizeReport));
    setLoading(false);
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadReports(), 0);
    return () => window.clearTimeout(initialLoad);
  }, [loadReports]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const filtered = useMemo(() => reports.filter((report) => {
    if (fromDate && report.report_date < fromDate) return false;
    if (toDate && report.report_date > toDate) return false;
    const term = search.trim().toLocaleLowerCase("vi");
    return !term || `${report.sales_person} ${report.route_name} ${report.top_products || ""}`.toLocaleLowerCase("vi").includes(term);
  }), [reports, search, fromDate, toDate]);

  const totals = useMemo(() => filtered.reduce((result, report) => ({
    customers: result.customers + report.total_customers,
    calls: result.calls + report.answered_customers,
    orders: result.orders + report.ordering_customers,
    revenue: result.revenue + report.actual_revenue,
  }), { customers: 0, calls: 0, orders: 0, revenue: 0 }), [filtered]);

  function openCreate() {
    setEditing(null);
    setDraft(emptyDraft());
    setError("");
  }

  function openEdit(report: SalesRouteReport) {
    setEditing(report);
    setDraft(toDraft(report));
    setError("");
  }

  async function saveReport(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    if (!draft.report_date || !draft.sales_person.trim() || !draft.route_name.trim()) {
      setError("Cần nhập ngày báo cáo, nhân viên và tuyến bán hàng.");
      return;
    }

    setSaving(true);
    setError("");
    const payload = draftToPayload(draft);
    const query = editing
      ? supabase.from("sales_route_reports").update(payload).eq("id", editing.id)
      : supabase.from("sales_route_reports").insert(payload);
    const { error: saveError } = await query;
    setSaving(false);
    if (saveError) {
      setError(saveError.code === "23505" ? "Ngày, nhân viên và tuyến này đã có báo cáo." : databaseError(saveError.message));
      return;
    }
    setDraft(null);
    setEditing(null);
    setNotice(editing ? "Đã cập nhật báo cáo." : "Đã lưu báo cáo mới.");
    await loadReports();
  }

  async function deleteReport(report: SalesRouteReport) {
    if (!window.confirm(`Xoá báo cáo ${report.sales_person} – ${report.route_name} ngày ${formatDate(report.report_date)}?`)) return;
    const { error: deleteError } = await supabase.from("sales_route_reports").delete().eq("id", report.id);
    if (deleteError) setError(databaseError(deleteError.message));
    else {
      setNotice("Đã xoá báo cáo.");
      await loadReports();
    }
  }

  async function copyReport(report: SalesRouteReport) {
    try {
      await navigator.clipboard.writeText(formatReportText(report));
      setNotice("Đã sao chép báo cáo để gửi Zalo/Telegram.");
    } catch {
      setError("Trình duyệt không cho phép sao chép. Hãy thử lại trên HTTPS.");
    }
  }

  return (
    <section className="sales-route-page">
      {notice && <div className="sales-notice">{notice}</div>}
      {error && <div className="error-banner"><span>{error}</span><button type="button" onClick={() => setError("")}><X size={17} /></button></div>}

      <div className="sales-kpi-grid">
        <SalesKpi icon={<Users />} label="Khách trên tuyến" value={integer.format(totals.customers)} />
        <SalesKpi icon={<PhoneCall />} label="Khách nghe máy" value={integer.format(totals.calls)} />
        <SalesKpi icon={<PackageCheck />} label="Khách lấy hàng" value={integer.format(totals.orders)} />
        <SalesKpi icon={<TrendingUp />} label="Doanh thu thực tế" value={money.format(totals.revenue)} emphasis />
      </div>

      <div className="sales-filter-card">
        <div className="input-icon sales-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm nhân viên, tuyến hoặc hàng chủ đạo…" /></div>
        <label><span>Từ ngày</span><input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></label>
        <label><span>Đến ngày</span><input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} /></label>
        <button type="button" className="primary-button" onClick={openCreate}><Plus size={17} /> Báo cáo mới</button>
      </div>

      <div className="table-card sales-report-table">
        <div className="table-toolbar"><div><strong>Báo cáo bán hàng theo tuyến</strong><span>{filtered.length} báo cáo</span></div></div>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Ngày</th><th>Nhân viên / Tuyến</th><th>Khách hàng</th><th>Lấy hàng</th><th>Doanh thu</th><th>Dự kiến ngày sau</th><th>Xếp loại</th><th /></tr></thead>
            <tbody>
              {loading && <tr><td className="empty-cell" colSpan={8}><LoaderCircle className="spin" size={21} /> Đang tải báo cáo…</td></tr>}
              {!loading && !filtered.length && <tr><td className="empty-cell" colSpan={8}>Chưa có báo cáo phù hợp.</td></tr>}
              {!loading && filtered.map((report) => (
                <tr key={report.id}>
                  <td><div className="sales-date"><CalendarDays size={15} />{formatDate(report.report_date)}</div></td>
                  <td><div className="customer-cell"><strong>{report.sales_person}</strong><small><MapPin size={11} /> {report.route_name}</small></div></td>
                  <td><strong>{integer.format(report.total_customers)}</strong><small className="sales-cell-note">Nghe máy: {integer.format(report.answered_customers)}</small></td>
                  <td><strong>{integer.format(report.ordering_customers)}</strong><small className="sales-cell-note">Không lấy: {integer.format(report.non_ordering_customers)}</small></td>
                  <td className="number-cell"><strong>{money.format(report.actual_revenue)}</strong><small className="sales-cell-note">TB: {money.format(report.average_revenue)}</small></td>
                  <td className="number-cell">{money.format(report.next_revenue_target)}<small className="sales-cell-note">{report.target_percentage == null ? "Chưa chốt %" : `${integer.format(report.target_percentage)}/100%`}</small></td>
                  <td><span className={`rating-pill ${ratingClass(report.self_rating)}`}>{report.self_rating}</span></td>
                  <td className="actions-cell">
                    <button type="button" className="icon-button" title="Sao chép báo cáo" onClick={() => void copyReport(report)}><ClipboardCopy size={15} /></button>
                    <button type="button" className="icon-button" title="Sửa" onClick={() => openEdit(report)}><Edit3 size={15} /></button>
                    <button type="button" className="icon-button danger" title="Xoá" onClick={() => void deleteReport(report)}><Trash2 size={15} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {draft && <SalesReportModal draft={draft} editing={Boolean(editing)} saving={saving} onChange={setDraft} onClose={() => { setDraft(null); setEditing(null); }} onSubmit={saveReport} />}
    </section>
  );
}

function SalesKpi({ icon, label, value, emphasis = false }: { icon: React.ReactNode; label: string; value: string; emphasis?: boolean }) {
  return <article className={`sales-kpi ${emphasis ? "emphasis" : ""}`}><span>{icon}</span><div><small>{label}</small><strong>{value}</strong></div></article>;
}

function SalesReportModal({ draft, editing, saving, onChange, onClose, onSubmit }: {
  draft: ReportDraft;
  editing: boolean;
  saving: boolean;
  onChange: (draft: ReportDraft) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
}) {
  const set = <K extends keyof ReportDraft>(key: K, value: ReportDraft[K]) => onChange({ ...draft, [key]: value });
  const total = toNumber(draft.total_customers);
  const answered = toNumber(draft.answered_customers);
  const unanswered = toNumber(draft.unanswered_customers);
  const ordered = toNumber(draft.ordering_customers);
  const notOrdered = toNumber(draft.non_ordering_customers);
  const unclassified = answered - ordered - notOrdered;
  const recommended = suggestedRating(toNumber(draft.actual_revenue));

  return (
    <div className="modal-backdrop sales-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal-card sales-report-modal" role="dialog" aria-modal="true" aria-label={editing ? "Sửa báo cáo tuyến" : "Thêm báo cáo tuyến"}>
        <div className="modal-heading"><div><p className="eyebrow">QUẢN TRỊ SALE THEO TUYẾN</p><h2>{editing ? "Sửa báo cáo bán hàng" : "Báo cáo bán hàng mới"}</h2></div><button type="button" className="icon-button" onClick={onClose}><X /></button></div>
        <form onSubmit={onSubmit}>
          <FormSection title="Thông tin báo cáo" number="I">
            <Field label="Ngày báo cáo" required><input required type="date" value={draft.report_date} onChange={(event) => set("report_date", event.target.value)} /></Field>
            <Field label="Nhân viên bán hàng" required><div className="input-icon"><UserRound size={16} /><input required value={draft.sales_person} onChange={(event) => set("sales_person", event.target.value)} placeholder="Ví dụ: Hoa" /></div></Field>
            <Field label="Tuyến bán hàng" required wide><div className="input-icon"><MapPin size={16} /><input required value={draft.route_name} onChange={(event) => set("route_name", event.target.value)} placeholder="Ví dụ: Ba Vì" /></div></Field>
          </FormSection>

          <FormSection title="Khách hàng trên tuyến" number="II">
            <NumberField label="1. Tổng số khách hàng trên tuyến" value={draft.total_customers} onChange={(value) => set("total_customers", value)} />
            <NumberField label="2. Tổng số khách hàng nghe máy" value={draft.answered_customers} onChange={(value) => set("answered_customers", value)} />
            <NumberField label="3. Tổng số khách hàng không nghe máy" value={draft.unanswered_customers} onChange={(value) => set("unanswered_customers", value)} />
            <NumberField label="4. Tổng số khách hàng lấy hàng" value={draft.ordering_customers} onChange={(value) => set("ordering_customers", value)} />
            <NumberField label="5. Tổng số khách không lấy hàng" value={draft.non_ordering_customers} onChange={(value) => set("non_ordering_customers", value)} />
            {(total !== answered + unanswered || unclassified !== 0) && <div className="sales-count-warning">
              {total !== answered + unanswered && <span>Tổng nghe máy + không nghe máy đang lệch {integer.format(Math.abs(total - answered - unanswered))} khách so với tổng tuyến.</span>}
              {unclassified > 0 && <span>Còn {integer.format(unclassified)} khách nghe máy chưa phân loại lấy/không lấy hàng.</span>}
              {unclassified < 0 && <span>Số lấy/không lấy hàng đang vượt số nghe máy {integer.format(Math.abs(unclassified))} khách.</span>}
            </div>}
          </FormSection>

          <FormSection title="Doanh thu" number="III">
            <MoneyField label="6. Doanh thu thực tế gọi điện (không gồm đơn xuất kho buổi sáng)" value={draft.actual_revenue} onChange={(value) => set("actual_revenue", value)} />
            <MoneyField label="7. Doanh thu trung bình/khách hàng/đơn hàng" value={draft.average_revenue} onChange={(value) => set("average_revenue", value)} />
            {ordered > 0 && <p className="sales-calculation">Theo doanh thu và số khách lấy hàng: {money.format(toNumber(draft.actual_revenue) / ordered)}/khách.</p>}
          </FormSection>

          <FormSection title="Phản hồi thị trường" number="IV">
            <TextField label="8. Khách hàng phản ánh về hàng hoá" value={draft.product_feedback} onChange={(value) => set("product_feedback", value)} />
            <TextField label="9. Khách hàng phản ánh về NV giao hàng" value={draft.delivery_feedback} onChange={(value) => set("delivery_feedback", value)} />
            <TextField label="10. Sản phẩm khách hỏi NPP chưa có" value={draft.missing_products} onChange={(value) => set("missing_products", value)} />
            <TextField label="11. Hàng hoá chủ đạo bán được" value={draft.top_products} onChange={(value) => set("top_products", value)} placeholder="Túi, giấy, cốc xốp, ống hút, chổi…" />
          </FormSection>

          <FormSection title="12. Ý kiến đóng góp của NV bán hàng" number="V">
            <TextField label="a. Phát triển hàng hoá" value={draft.product_development_feedback} onChange={(value) => set("product_development_feedback", value)} />
            <TextField label="b. Chất lượng sản phẩm" value={draft.product_quality_feedback} onChange={(value) => set("product_quality_feedback", value)} />
            <TextField label="c. Nhân viên giao hàng" value={draft.delivery_staff_feedback} onChange={(value) => set("delivery_staff_feedback", value)} />
            <TextField label="d. Nhà phân phối" value={draft.distributor_feedback} onChange={(value) => set("distributor_feedback", value)} />
          </FormSection>

          <FormSection title="Tự đánh giá và kế hoạch" number="VI">
            <TextField label="13. Bản thân cần cải thiện" value={draft.self_improvement} onChange={(value) => set("self_improvement", value)} />
            <TextField label="Ý kiến cá nhân" value={draft.personal_opinion} onChange={(value) => set("personal_opinion", value)} />
            <MoneyField label="14. Doanh thu dự kiến ngày bán hàng kế tiếp" value={draft.next_revenue_target} onChange={(value) => set("next_revenue_target", value)} />
            <NumberField label="Mức đạt mục tiêu (/100%)" value={draft.target_percentage} onChange={(value) => set("target_percentage", value)} max={100} />
            <Field label="15. Tự đánh giá xếp loại" wide><select value={draft.self_rating} onChange={(event) => set("self_rating", event.target.value as SalesRating)}><option>Yếu</option><option>Trung bình</option><option>Khá</option><option>Xuất sắc</option></select><small>Gợi ý theo doanh thu hiện tại: {recommended || "chưa thuộc khoảng quy định"}.</small></Field>
            <div className="sales-rating-guide"><span>Yếu: ≤ 7 triệu</span><span>Trung bình: 12–20 triệu</span><span>Khá: &gt; 20–28 triệu</span><span>Xuất sắc: ≥ 35 triệu</span></div>
          </FormSection>

          <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Huỷ</button><button type="submit" className="primary-button" disabled={saving}>{saving ? <><LoaderCircle className="spin" size={17} /> Đang lưu…</> : editing ? "Lưu thay đổi" : "Lưu báo cáo"}</button></div>
        </form>
      </section>
    </div>
  );
}

function FormSection({ title, number, children }: { title: string; number: string; children: React.ReactNode }) {
  return <fieldset className="sales-form-section"><legend><span>{number}</span>{title}</legend><div className="sales-form-grid">{children}</div></fieldset>;
}

function Field({ label, required = false, wide = false, children }: { label: string; required?: boolean; wide?: boolean; children: React.ReactNode }) {
  return <label className={`field ${wide ? "sales-wide" : ""}`}><span>{label}{required && " *"}</span>{children}</label>;
}

function NumberField({ label, value, onChange, max }: { label: string; value: string; onChange: (value: string) => void; max?: number }) {
  return <Field label={label}><input type="number" min="0" max={max} step="1" value={value} onChange={(event) => onChange(event.target.value)} /></Field>;
}

function MoneyField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <Field label={label}><input type="number" min="0" step="1000" value={value} onChange={(event) => onChange(event.target.value)} /><small>{money.format(toNumber(value))}</small></Field>;
}

function TextField({ label, value, onChange, placeholder }: { label: string; value: string | null; onChange: (value: string) => void; placeholder?: string }) {
  return <Field label={label} wide><textarea value={value || ""} onChange={(event) => onChange(event.target.value)} placeholder={placeholder || "Nhập nội dung; để trống nếu không có phản ánh"} /></Field>;
}

function emptyDraft(): ReportDraft {
  return {
    distributor: "NPP Hà Hoà",
    report_date: todayIso(),
    sales_person: "",
    route_name: "",
    total_customers: "0",
    answered_customers: "0",
    unanswered_customers: "0",
    ordering_customers: "0",
    non_ordering_customers: "0",
    actual_revenue: "0",
    average_revenue: "0",
    product_feedback: "",
    delivery_feedback: "",
    missing_products: "",
    top_products: "",
    product_development_feedback: "",
    product_quality_feedback: "",
    delivery_staff_feedback: "",
    distributor_feedback: "",
    self_improvement: "",
    personal_opinion: "",
    next_revenue_target: "0",
    target_percentage: "",
    self_rating: "Trung bình",
  };
}

function toDraft(report: SalesRouteReport): ReportDraft {
  return {
    ...report,
    total_customers: String(report.total_customers),
    answered_customers: String(report.answered_customers),
    unanswered_customers: String(report.unanswered_customers),
    ordering_customers: String(report.ordering_customers),
    non_ordering_customers: String(report.non_ordering_customers),
    actual_revenue: String(report.actual_revenue),
    average_revenue: String(report.average_revenue),
    next_revenue_target: String(report.next_revenue_target),
    target_percentage: report.target_percentage == null ? "" : String(report.target_percentage),
  };
}

function draftToPayload(draft: ReportDraft) {
  return {
    distributor: draft.distributor.trim(),
    report_date: draft.report_date,
    sales_person: draft.sales_person.trim(),
    route_name: draft.route_name.trim(),
    total_customers: toNumber(draft.total_customers),
    answered_customers: toNumber(draft.answered_customers),
    unanswered_customers: toNumber(draft.unanswered_customers),
    ordering_customers: toNumber(draft.ordering_customers),
    non_ordering_customers: toNumber(draft.non_ordering_customers),
    actual_revenue: toNumber(draft.actual_revenue),
    average_revenue: toNumber(draft.average_revenue),
    product_feedback: nullable(draft.product_feedback),
    delivery_feedback: nullable(draft.delivery_feedback),
    missing_products: nullable(draft.missing_products),
    top_products: nullable(draft.top_products),
    product_development_feedback: nullable(draft.product_development_feedback),
    product_quality_feedback: nullable(draft.product_quality_feedback),
    delivery_staff_feedback: nullable(draft.delivery_staff_feedback),
    distributor_feedback: nullable(draft.distributor_feedback),
    self_improvement: nullable(draft.self_improvement),
    personal_opinion: nullable(draft.personal_opinion),
    next_revenue_target: toNumber(draft.next_revenue_target),
    target_percentage: draft.target_percentage === "" ? null : Math.min(toNumber(draft.target_percentage), 100),
    self_rating: draft.self_rating,
  };
}

function normalizeReport(report: SalesRouteReport): SalesRouteReport {
  return {
    ...report,
    total_customers: Number(report.total_customers),
    answered_customers: Number(report.answered_customers),
    unanswered_customers: Number(report.unanswered_customers),
    ordering_customers: Number(report.ordering_customers),
    non_ordering_customers: Number(report.non_ordering_customers),
    actual_revenue: Number(report.actual_revenue),
    average_revenue: Number(report.average_revenue),
    next_revenue_target: Number(report.next_revenue_target),
    target_percentage: report.target_percentage == null ? null : Number(report.target_percentage),
  };
}

function suggestedRating(revenue: number): SalesRating | null {
  if (revenue <= 7_000_000) return "Yếu";
  if (revenue >= 12_000_000 && revenue <= 20_000_000) return "Trung bình";
  if (revenue > 20_000_000 && revenue <= 28_000_000) return "Khá";
  if (revenue >= 35_000_000) return "Xuất sắc";
  return null;
}

function formatReportText(report: SalesRouteReport) {
  const text = (value: string | null) => value?.trim() || EMPTY_TEXT;
  return `BÁO CÁO KINH DOANH NGÀY: ${report.distributor}\n${formatDate(report.report_date)}\nBáo cáo kết quả bán hàng NV: ${report.sales_person}\n\nI. Tuyến bán hàng: ${report.route_name}\nII. Khách hàng:\n1. Tổng số khách hàng trên tuyến: ${report.total_customers}\n2. Tổng số khách hàng nghe máy: ${report.answered_customers}\n3. Tổng số khách hàng không nghe máy: ${report.unanswered_customers}\n4. Tổng số khách hàng lấy hàng: ${report.ordering_customers}\n5. Tổng số khách không lấy hàng: ${report.non_ordering_customers}\n6. Doanh thu bán hàng thực tế gọi điện (không bao gồm đơn xuất kho buổi sáng): ${money.format(report.actual_revenue)}\n7. Doanh thu trung bình/khách hàng/đơn hàng: ${money.format(report.average_revenue)}\n8. Khách hàng phản ánh về hàng hoá:\n${text(report.product_feedback)}\n9. Khách hàng phản ánh về NV giao hàng:\n${text(report.delivery_feedback)}\n10. Sản phẩm khách hỏi NPP chưa có:\n${text(report.missing_products)}\n11. Hàng hoá chủ đạo bán được:\n${text(report.top_products)}\n12. Ý kiến đóng góp của NV bán hàng:\na. Phát triển hàng hoá:\n${text(report.product_development_feedback)}\nb. Chất lượng sản phẩm:\n${text(report.product_quality_feedback)}\nc. Nhân viên giao hàng:\n${text(report.delivery_staff_feedback)}\nd. Nhà phân phối:\n${text(report.distributor_feedback)}\n13. Bản thân cần cải thiện:\n${text(report.self_improvement)}\nÝ kiến cá nhân:\n${text(report.personal_opinion)}\n14. Mức dự kiến doanh thu ngày bán hàng kế tiếp: ${money.format(report.next_revenue_target)}; đạt ${report.target_percentage == null ? "........" : integer.format(report.target_percentage)}/100% mục tiêu\n15. Tự đánh giá xếp loại: ${report.self_rating}`;
}

function nullable(value: string | null) {
  const trimmed = value?.trim();
  return trimmed || null;
}

function ratingClass(rating: SalesRating) {
  return rating === "Xuất sắc" ? "excellent" : rating === "Khá" ? "good" : rating === "Trung bình" ? "average" : "weak";
}

function databaseError(message: string) {
  if (/sales_route_reports|schema cache|does not exist/i.test(message)) return "Chưa khởi tạo bảng Quản trị Sale trên Supabase. Cần chạy migration sales_route_reports trước.";
  return message;
}
