"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  Bell,
  ChevronDown,
  CircleDollarSign,
  ContactRound,
  LayoutDashboard,
  LogOut,
  MapPinned,
  Menu,
  Plus,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  Settings,
  Sparkles,
  WalletCards,
  X,
} from "lucide-react";
import { DataTable } from "@/components/DataTable";
import { DebtAiChat } from "@/components/DebtAiChat";
import { FilterPanel } from "@/components/FilterPanel";
import { LoginScreen } from "@/components/LoginScreen";
import { RecordModal, type EditableRow, type ModalKind, type RecordPayload } from "@/components/RecordModal";
import { SalesRouteManagement } from "@/components/SalesRouteManagement";
import { SummaryCards } from "@/components/SummaryCards";
import { ZaloContacts } from "@/components/ZaloContacts";
import { csvCell, money, toNumber } from "@/lib/format";
import { downloadTemplate, parseExcelFile, type ExcelKind } from "@/lib/excel";
import { hasSupabaseConfig, supabase } from "@/lib/supabase";
import {
  EMPTY_FILTERS,
  type AppSettings,
  type CustomerOption,
  type DebtRow,
  type Filters,
  type PaymentRow,
  type ReturnRow,
  type TabKey,
} from "@/lib/types";

const DEFAULT_SETTINGS: AppSettings = { max_debt: 0, debt_terms: [15, 30, 45, 60] };

export default function Home() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [debts, setDebts] = useState<DebtRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [returns, setReturns] = useState<ReturnRow[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aiChatOpen, setAiChatOpen] = useState(false);
  const [modal, setModal] = useState<{ open: boolean; kind: ModalKind; record: EditableRow | null }>({ open: false, kind: "debts", record: null });
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);

  const loadData = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    else setRefreshing(true);
    setError("");

    const [debtResult, paymentResult, returnResult, customerResult, settingResult] = await Promise.all([
      fetchPaged((from, to) => supabase.from("debt_overview").select("*").order("order_date", { ascending: false }).range(from, to)),
      fetchPaged((from, to) => supabase.from("payments").select("id,debt_id,amount,paid_at,notes,sales_person,delivery_person,created_at,debt:debts(amount,order_date,customer:customers(name))").order("paid_at", { ascending: false }).range(from, to)),
      fetchPaged((from, to) => supabase.from("returns").select("id,debt_id,customer_id,product_name,quantity,unit_price,total_amount,returned_at,notes,created_at,customer:customers(name)").order("returned_at", { ascending: false }).range(from, to)),
      fetchPaged((from, to) => supabase.from("customers").select("id,code,name,phone,address,region").order("name").range(from, to)),
      supabase.from("organization_settings").select("max_debt,debt_terms").eq("id", 1).maybeSingle(),
    ]);

    const firstError = debtResult.error || paymentResult.error || returnResult.error || customerResult.error || settingResult.error;
    if (firstError) {
      setError(firstError.message);
    } else {
      setDebts(((debtResult.data || []) as unknown as DebtRow[]).map(normalizeDebt));
      setPayments(((paymentResult.data || []) as unknown as PaymentRow[]).map(normalizePayment));
      setReturns(((returnResult.data || []) as unknown as ReturnRow[]).map(normalizeReturn));
      setCustomers((customerResult.data || []) as CustomerOption[]);
      if (settingResult.data) setSettings({ max_debt: Number(settingResult.data.max_debt), debt_terms: settingResult.data.debt_terms });
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    const initialLoad = window.setTimeout(() => void loadData(), 0);
    const channel = supabase
      .channel("cong-no-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "debts" }, () => void loadData(true))
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, () => void loadData(true))
      .on("postgres_changes", { event: "*", schema: "public", table: "returns" }, () => void loadData(true))
      .subscribe();
    return () => { window.clearTimeout(initialLoad); void supabase.removeChannel(channel); };
  }, [session, loadData]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const filteredDebts = useMemo(() => debts.filter((row) => matchDebt(row, filters)), [debts, filters]);
  const filteredDebtIds = useMemo(() => new Set(filteredDebts.map((row) => row.id)), [filteredDebts]);
  const filteredCustomerIds = useMemo(() => new Set(filteredDebts.map((row) => row.customer_id)), [filteredDebts]);
  const filteredPayments = useMemo(() => payments.filter((row) => {
    if ((filters.customer || filters.sales || filters.delivery || filters.region || filters.status) && !filteredDebtIds.has(row.debt_id)) return false;
    if (filters.from && row.paid_at < filters.from) return false;
    if (filters.to && row.paid_at > filters.to) return false;
    if (filters.search && !`${row.debt?.customer?.name || ""} ${row.notes || ""}`.toLocaleLowerCase("vi").includes(filters.search.toLocaleLowerCase("vi"))) return false;
    return true;
  }), [payments, filters, filteredDebtIds]);
  const filteredReturns = useMemo(() => returns.filter((row) => {
    if ((filters.customer || filters.sales || filters.delivery || filters.region || filters.status) && !filteredCustomerIds.has(row.customer_id)) return false;
    if (filters.from && row.returned_at < filters.from) return false;
    if (filters.to && row.returned_at > filters.to) return false;
    if (filters.search && !`${row.customer?.name || ""} ${row.product_name} ${row.notes || ""}`.toLocaleLowerCase("vi").includes(filters.search.toLocaleLowerCase("vi"))) return false;
    return true;
  }), [returns, filters, filteredCustomerIds]);

  const totals = useMemo(() => {
    const debt = filteredDebts.reduce((sum, row) => sum + row.amount, 0);
    const paid = filteredDebts.reduce((sum, row) => sum + row.paid_amount, 0);
    const returned = filteredReturns.reduce((sum, row) => sum + row.total_amount, 0);
    return { debt, paid, returned, remaining: Math.max(debt - paid - returned, 0), overdueCount: filteredDebts.filter((row) => row.status === "overdue").length };
  }, [filteredDebts, filteredReturns]);

  const salesBreakdown = useMemo(() => {
    const groups = new Map<string, number>();
    filteredDebts.forEach((row) => groups.set(row.sales_person || "Chưa phân công", (groups.get(row.sales_person || "Chưa phân công") || 0) + row.remaining_amount));
    return [...groups.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [filteredDebts]);

  if (!hasSupabaseConfig) return <LoginScreen />;
  if (session === undefined) return <div className="app-loading"><Image src="/logo-ha-hoa.jpg" alt="Hà Hoà" width={72} height={72} priority /><span>Đang khởi tạo hệ thống…</span></div>;
  if (!session) return <LoginScreen />;

  const activeRows = activeTab === "payments" ? filteredPayments : activeTab === "returns" ? filteredReturns : filteredDebts;

  function openCreate() {
    if (activeTab === "sales_routes") return;
    const kind: ModalKind = activeTab === "payments" || activeTab === "returns" ? activeTab : "debts";
    setModal({ open: true, kind, record: null });
  }

  async function saveRecord(payload: RecordPayload) {
    setSaving(true);
    setError("");
    try {
      if (modal.kind === "debts") await saveDebt(payload);
      else if (modal.kind === "payments") await savePayment(payload);
      else await saveReturn(payload);
      setModal((current) => ({ ...current, open: false }));
      setToast(modal.record ? "Đã lưu thay đổi." : "Đã thêm dữ liệu mới.");
      await loadData(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không thể lưu dữ liệu.");
    } finally {
      setSaving(false);
    }
  }

  async function saveDebt(payload: RecordPayload) {
    let customerId = String(payload.customer_id || "");
    const newCustomer = String(payload.new_customer || "").trim();
    if (!modal.record && newCustomer) {
      const normalized = newCustomer.toLocaleLowerCase("vi");
      const existing = customers.find((customer) => customer.name.trim().toLocaleLowerCase("vi") === normalized);
      if (existing) customerId = existing.id;
      else {
        const { data, error: customerError } = await supabase.from("customers").insert({ name: newCustomer, code: payload.customer_code || null, phone: payload.phone || null, region: payload.region || null }).select("id").single();
        if (customerError) throw customerError;
        customerId = data.id;
      }
    }
    if (!customerId) throw new Error("Cần chọn hoặc tạo khách hàng.");

    const amount = Number(payload.amount);
    const editing = modal.record as DebtRow | null;
    const existingOutstanding = debts.filter((row) => row.customer_id === customerId && row.id !== editing?.id).reduce((sum, row) => sum + row.remaining_amount, 0);
    const adjustedAmount = Math.max(amount - (editing?.paid_amount || 0) - (editing?.returned_amount || 0), 0);
    if (settings.max_debt > 0 && existingOutstanding + adjustedAmount > settings.max_debt) {
      throw new Error(`Khoản nợ vượt hạn mức ${money.format(settings.max_debt)} của khách hàng.`);
    }

    const row = clean({
      customer_id: customerId,
      amount,
      order_date: payload.order_date,
      due_days: payload.due_days,
      sales_person: payload.sales_person,
      delivery_person: payload.delivery_person,
      product_name: payload.product_name,
      quantity: payload.quantity,
      unit_price: payload.unit_price,
      notes: payload.notes,
    });
    const query = editing ? supabase.from("debts").update(row).eq("id", editing.id) : supabase.from("debts").insert(row);
    const { error: saveError } = await query;
    if (saveError) throw saveError;
  }

  async function savePayment(payload: RecordPayload) {
    const editing = modal.record as PaymentRow | null;
    const debt = debts.find((row) => row.id === payload.debt_id);
    if (!debt) throw new Error("Không tìm thấy khoản nợ đã chọn.");
    const allowed = debt.remaining_amount + (editing?.amount || 0);
    if (Number(payload.amount) > allowed) throw new Error(`Số tiền trả vượt dư nợ ${money.format(allowed)}.`);
    const row = clean({ debt_id: payload.debt_id, amount: payload.amount, paid_at: payload.paid_at, sales_person: payload.sales_person, delivery_person: payload.delivery_person, notes: payload.notes });
    const query = editing ? supabase.from("payments").update(row).eq("id", editing.id) : supabase.from("payments").insert(row);
    const { error: saveError } = await query;
    if (saveError) throw saveError;
  }

  async function saveReturn(payload: RecordPayload) {
    const editing = modal.record as ReturnRow | null;
    const row = clean({ customer_id: payload.customer_id, debt_id: payload.debt_id, product_name: payload.product_name, quantity: payload.quantity, unit_price: payload.unit_price, returned_at: payload.returned_at, notes: payload.notes });
    const query = editing ? supabase.from("returns").update(row).eq("id", editing.id) : supabase.from("returns").insert(row);
    const { error: saveError } = await query;
    if (saveError) throw saveError;
  }

  async function deleteRecord(kind: ModalKind, id: string) {
    if (!window.confirm("Xoá bản ghi này? Thao tác không thể hoàn tác.")) return;
    const { error: deleteError } = await supabase.from(kind).delete().eq("id", id);
    if (deleteError) setError(deleteError.message);
    else { setToast("Đã xoá bản ghi."); await loadData(true); }
  }

  function exportActive() {
    if (!activeRows.length) return;
    let headers: string[];
    let body: unknown[][];
    if (activeTab === "payments") {
      headers = ["Khách hàng", "Ngày trả", "Số tiền trả", "NV kinh doanh", "NV giao hàng", "Ghi chú"];
      body = filteredPayments.map((row) => [row.debt?.customer?.name, row.paid_at, row.amount, row.sales_person, row.delivery_person, row.notes]);
    } else if (activeTab === "returns") {
      headers = ["Khách hàng", "Sản phẩm", "Số lượng", "Đơn giá", "Thành tiền", "Ngày thu hồi", "Ghi chú"];
      body = filteredReturns.map((row) => [row.customer?.name, row.product_name, row.quantity, row.unit_price, row.total_amount, row.returned_at, row.notes]);
    } else {
      headers = ["Mã KH", "Khách hàng", "Ngày nợ", "Hạn trả", "NV kinh doanh", "NV giao hàng", "Tiền nợ", "Đã trả", "Thu hồi", "Còn lại", "Trạng thái", "Ghi chú"];
      body = filteredDebts.map((row) => [row.customer_code, row.customer_name, row.order_date, row.due_date, row.sales_person, row.delivery_person, row.amount, row.paid_amount, row.returned_amount, row.remaining_amount, row.status, row.notes]);
    }
    const csv = `\uFEFF${[headers, ...body].map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    link.download = `cong-no-ha-hoa-${activeTab}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function downloadActiveTemplate() {
    downloadTemplate(excelKind(activeTab));
  }

  async function importExcelFile(file: File) {
    setImporting(true);
    setError("");
    try {
      const kind = excelKind(activeTab);
      const parsed = parseExcelFile(await file.arrayBuffer(), kind);
      if (!parsed.rows.length) throw new Error("Không có dòng dữ liệu hợp lệ trong file Excel.");

      const customerMap = new Map(customers.map((customer) => [customer.name.trim().toLocaleLowerCase("vi"), customer]));
      let imported = 0;

      if (parsed.kind === "debts") {
        for (const row of parsed.rows) {
          const customerId = await findOrCreateCustomer(row.customer_name, row.customer_code, customerMap);
          const { data: debt, error: debtError } = await supabase.from("debts").insert(clean({
            customer_id: customerId,
            amount: row.amount,
            order_date: row.order_date,
            due_days: row.due_days,
            sales_person: row.sales_person,
            delivery_person: row.delivery_person,
            notes: row.notes,
            source_sheet: file.name,
            source_row: row.row,
          })).select("id").single();
          if (debtError) throw new Error(`Dòng ${row.row}: ${debtError.message}`);
          if (row.paid_amount) {
            const { error: paymentError } = await supabase.from("payments").insert(clean({
              debt_id: debt.id,
              amount: row.paid_amount,
              paid_at: row.payment_date || row.order_date,
              sales_person: row.sales_person,
              delivery_person: row.delivery_person,
              notes: row.notes,
              source_sheet: file.name,
              source_row: row.row,
            }));
            if (paymentError) throw new Error(`Dòng ${row.row} (thanh toán): ${paymentError.message}`);
          }
          imported += 1;
        }
      } else if (parsed.kind === "payments") {
        for (const row of parsed.rows) {
          const normalized = row.customer_name.trim().toLocaleLowerCase("vi");
          const debt = debts.find((item) => item.customer_name.trim().toLocaleLowerCase("vi") === normalized && item.order_date === row.order_date)
            || debts.find((item) => item.customer_name.trim().toLocaleLowerCase("vi") === normalized && item.remaining_amount > 0);
          if (!debt) throw new Error(`Dòng ${row.row}: Không tìm thấy khoản nợ của "${row.customer_name}".`);
          if (row.amount > debt.remaining_amount) throw new Error(`Dòng ${row.row}: Số tiền trả vượt dư nợ ${money.format(debt.remaining_amount)}.`);
          const { error: paymentError } = await supabase.from("payments").insert(clean({
            debt_id: debt.id,
            amount: row.amount,
            paid_at: row.paid_at,
            sales_person: row.sales_person,
            delivery_person: row.delivery_person,
            notes: row.notes,
            source_sheet: file.name,
            source_row: row.row,
          }));
          if (paymentError) throw new Error(`Dòng ${row.row}: ${paymentError.message}`);
          imported += 1;
        }
      } else {
        for (const row of parsed.rows) {
          const customerId = await findOrCreateCustomer(row.customer_name, null, customerMap);
          const { error: returnError } = await supabase.from("returns").insert(clean({
            customer_id: customerId,
            product_name: row.product_name,
            quantity: row.quantity,
            unit_price: row.unit_price,
            returned_at: row.returned_at,
            notes: row.notes,
            source_sheet: file.name,
            source_row: row.row,
          }));
          if (returnError) throw new Error(`Dòng ${row.row}: ${returnError.message}`);
          imported += 1;
        }
      }

      setToast(`Đã nhập ${imported} bản ghi từ Excel.`);
      await loadData(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không thể nhập file Excel.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-mark"><Image src="/logo-ha-hoa.jpg" alt="Hà Hoà" width={50} height={50} priority /><div><strong>NPP HÀ HOÀ</strong><span>Quản lý công nợ</span></div></div>
        <button className="mobile-menu icon-button" onClick={() => setMenuOpen((value) => !value)}>{menuOpen ? <X /> : <Menu />}</button>
        <nav className={menuOpen ? "open" : ""}>
          <NavButton icon={<LayoutDashboard />} label="Tổng hợp" active={activeTab === "overview"} onClick={() => { setActiveTab("overview"); setMenuOpen(false); }} />
          <NavButton icon={<WalletCards />} label="Khách hàng nợ" active={activeTab === "debts"} onClick={() => { setActiveTab("debts"); setMenuOpen(false); }} />
          <NavButton icon={<CircleDollarSign />} label="Khách trả nợ" active={activeTab === "payments"} onClick={() => { setActiveTab("payments"); setMenuOpen(false); }} />
          <NavButton icon={<RotateCcw />} label="Hàng thu hồi" active={activeTab === "returns"} onClick={() => { setActiveTab("returns"); setMenuOpen(false); }} />
          <NavButton icon={<MapPinned />} label="Quản trị Sale theo tuyến" active={activeTab === "sales_routes"} onClick={() => { setActiveTab("sales_routes"); setMenuOpen(false); }} />
          <NavButton icon={<ContactRound />} label="Danh bạ Zalo" active={activeTab === "zalo_contacts"} onClick={() => { setActiveTab("zalo_contacts"); setMenuOpen(false); }} />
          <NavButton icon={<Sparkles />} label="Hỏi AI" active={false} onClick={() => { setAiChatOpen(true); setMenuOpen(false); }} />
        </nav>
        <div className="top-actions">
          <button className="icon-button" title="Làm mới" onClick={() => void loadData(true)}><RefreshCw size={19} className={refreshing ? "spin" : ""} /></button>
          <button className="icon-button notification" title="Khoản quá hạn" onClick={() => setFilters({ ...EMPTY_FILTERS, status: "overdue" })}><Bell size={19} />{totals.overdueCount > 0 && <i />}</button>
          <button className="user-menu" onClick={() => setSettingsOpen(true)}><span>{initials(session.user.user_metadata?.full_name || session.user.email || "HH")}</span><div><strong>{session.user.user_metadata?.full_name || "Nhân viên Hà Hoà"}</strong><small>{session.user.email}</small></div><ChevronDown size={16} /></button>
        </div>
      </header>

      <main className="main-content">
        <div className="page-heading">
          <div><p className="eyebrow">{new Intl.DateTimeFormat("vi-VN", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }).format(new Date())}</p><h1>{pageTitle(activeTab)}</h1><p>{pageDescription(activeTab)}</p></div>
          <div className="heading-actions"><button className="secondary-button" onClick={() => setSettingsOpen(true)}><Settings size={17} /> Cấu hình</button>{activeTab !== "sales_routes" && activeTab !== "zalo_contacts" && <button className="primary-button" onClick={openCreate}><Plus size={18} /> {addLabel(activeTab)}</button>}</div>
        </div>

        {error && <div className="error-banner"><span>{error}</span><button onClick={() => setError("")}><X size={17} /></button></div>}
        {toast && <div className="toast-message">{toast}</div>}

        {activeTab === "sales_routes" ? <SalesRouteManagement /> : activeTab === "zalo_contacts" ? <ZaloContacts /> : <>
          <SummaryCards {...totals} />
          <FilterPanel filters={filters} rows={debts} onChange={setFilters} onReset={() => setFilters(EMPTY_FILTERS)} />

          {loading ? <TableSkeleton /> : activeTab === "overview" ? (
            <div className="overview-layout">
              <DataTable
                kind="overview"
                rows={filteredDebts.slice(0, 20)}
                onExport={exportActive}
                onDownloadTemplate={downloadActiveTemplate}
                onImport={(file) => void importExcelFile(file)}
                importing={importing}
                compact
              />
              <section className="breakdown-card">
                <div className="card-heading"><div><span className="summary-icon green"><ReceiptText size={18} /></span><div><strong>Dư nợ theo NV kinh doanh</strong><small>6 nhóm cao nhất</small></div></div></div>
                <div className="breakdown-list">
                  {!salesBreakdown.length && <p className="muted">Chưa có dữ liệu.</p>}
                  {salesBreakdown.map(([name, value]) => {
                    const max = salesBreakdown[0]?.[1] || 1;
                    return <div className="breakdown-row" key={name}><div><span>{name}</span><strong>{money.format(value)}</strong></div><i><b style={{ width: `${Math.max(3, (value / max) * 100)}%` }} /></i></div>;
                  })}
                </div>
              </section>
            </div>
          ) : (
            <DataTable
              kind={activeTab}
              rows={activeRows}
              onExport={exportActive}
              onDownloadTemplate={downloadActiveTemplate}
              onImport={(file) => void importExcelFile(file)}
              importing={importing}
              onEdit={(row) => setModal({ open: true, kind: activeTab as ModalKind, record: row })}
              onDelete={(id) => void deleteRecord(activeTab as ModalKind, id)}
            />
          )}
        </>}
      </main>

      {settingsOpen && <SettingsDrawer settings={settings} onClose={() => setSettingsOpen(false)} onSaved={(next) => { setSettings(next); setToast("Đã cập nhật cấu hình."); setSettingsOpen(false); }} onLogout={() => void supabase.auth.signOut()} />}
      {aiChatOpen && <DebtAiChat accessToken={session.access_token} onClose={() => setAiChatOpen(false)} />}
      {modal.open && <RecordModal key={`${modal.kind}-${modal.record?.id || "new"}`} open kind={modal.kind} record={modal.record} customers={customers} debts={debts} settings={settings} saving={saving} onClose={() => setModal((current) => ({ ...current, open: false }))} onSave={saveRecord} />}
    </div>
  );
}

function NavButton({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return <button className={active ? "active" : ""} onClick={onClick}>{icon}<span>{label}</span></button>;
}

function SettingsDrawer({ settings, onClose, onSaved, onLogout }: { settings: AppSettings; onClose: () => void; onSaved: (next: AppSettings) => void; onLogout: () => void }) {
  const [maxDebt, setMaxDebt] = useState(String(settings.max_debt));
  const [terms, setTerms] = useState(settings.debt_terms.join(", "));
  const [saving, setSaving] = useState(false);

  async function save() {
    const debtTerms = [...new Set(terms.split(/[,;\s]+/).map(Number).filter((value) => Number.isInteger(value) && value > 0))].sort((a, b) => a - b);
    if (!debtTerms.length) return;
    setSaving(true);
    const next = { max_debt: toNumber(maxDebt), debt_terms: debtTerms };
    const { error } = await supabase.from("organization_settings").update(next).eq("id", 1);
    setSaving(false);
    if (!error) onSaved(next);
  }

  return <div className="drawer-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><aside className="settings-drawer"><div className="modal-heading"><div><p className="eyebrow">THIẾT LẬP</p><h2>Cấu hình công nợ</h2></div><button className="icon-button" onClick={onClose}><X /></button></div><div className="settings-body"><label className="field"><span>Hạn mức nợ tối đa/khách hàng</span><input inputMode="numeric" value={maxDebt} onChange={(event) => setMaxDebt(event.target.value)} /><small>Đặt 0 nếu không giới hạn. Hiện tại: {money.format(toNumber(maxDebt))}</small></label><label className="field"><span>Các kỳ hạn nợ (ngày)</span><input value={terms} onChange={(event) => setTerms(event.target.value)} placeholder="15, 30, 45, 60" /><small>Phân cách bằng dấu phẩy.</small></label><button className="primary-button" onClick={() => void save()} disabled={saving}>{saving ? "Đang lưu…" : "Lưu cấu hình"}</button></div><div className="drawer-footer"><button className="secondary-button danger-text" onClick={onLogout}><LogOut size={17} /> Đăng xuất</button></div></aside></div>;
}

function TableSkeleton() {
  return <div className="table-card skeleton-card"><i /><i /><i /><i /><i /></div>;
}

function matchDebt(row: DebtRow, filters: Filters) {
  if (filters.from && row.order_date < filters.from) return false;
  if (filters.to && row.order_date > filters.to) return false;
  if (filters.customer && row.customer_name !== filters.customer) return false;
  if (filters.sales && row.sales_person !== filters.sales) return false;
  if (filters.delivery && row.delivery_person !== filters.delivery) return false;
  if (filters.region && !row.region?.toLocaleLowerCase("vi").includes(filters.region.toLocaleLowerCase("vi"))) return false;
  if (filters.status && row.status !== filters.status) return false;
  if (filters.search) {
    const haystack = `${row.customer_code || ""} ${row.customer_name} ${row.phone || ""} ${row.region || ""} ${row.product_name || ""} ${row.notes || ""}`.toLocaleLowerCase("vi");
    if (!haystack.includes(filters.search.toLocaleLowerCase("vi"))) return false;
  }
  return true;
}

function normalizeDebt(row: DebtRow): DebtRow {
  return { ...row, amount: Number(row.amount), paid_amount: Number(row.paid_amount), returned_amount: Number(row.returned_amount), remaining_amount: Number(row.remaining_amount), due_days: Number(row.due_days), quantity: row.quantity == null ? null : Number(row.quantity), unit_price: row.unit_price == null ? null : Number(row.unit_price) };
}

function normalizePayment(row: PaymentRow): PaymentRow { return { ...row, amount: Number(row.amount) }; }
function normalizeReturn(row: ReturnRow): ReturnRow { return { ...row, quantity: Number(row.quantity), unit_price: Number(row.unit_price), total_amount: Number(row.total_amount) }; }

function clean(input: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(input).map(([key, value]) => [key, value === "" ? null : value]));
}

async function fetchPaged(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
) {
  const pageSize = 1000;
  const data: unknown[] = [];
  for (let from = 0; ; from += pageSize) {
    const result = await fetchPage(from, from + pageSize - 1);
    if (result.error) return { data, error: result.error };
    const page = result.data || [];
    data.push(...page);
    if (page.length < pageSize) break;
  }
  return { data, error: null };
}

function initials(value: string) { return value.split(/[\s@]+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase(); }
function pageTitle(tab: TabKey) { return tab === "debts" ? "Khách hàng nợ" : tab === "payments" ? "Khách hàng trả nợ" : tab === "returns" ? "Hàng thu hồi" : tab === "sales_routes" ? "Quản trị Sale theo tuyến" : tab === "zalo_contacts" ? "Danh bạ Zalo" : "Tổng quan công nợ"; }
function pageDescription(tab: TabKey) { return tab === "sales_routes" ? "Theo dõi kết quả gọi khách, doanh thu, phản hồi thị trường và kế hoạch bán hàng từng tuyến." : tab === "zalo_contacts" ? "Lưu liên hệ và mở đúng cuộc hội thoại trên Zalo Web chỉ bằng một lần bấm." : "Kiểm soát dòng tiền và công nợ khách hàng theo thời gian thực."; }
function addLabel(tab: TabKey) { return tab === "payments" ? "Ghi nhận trả nợ" : tab === "returns" ? "Ghi nhận thu hồi" : "Thêm khoản nợ"; }
function excelKind(tab: TabKey): ExcelKind { return tab === "payments" ? "payments" : tab === "returns" ? "returns" : "debts"; }

async function findOrCreateCustomer(name: string, code: string | null, customerMap: Map<string, CustomerOption>) {
  const normalized = name.trim().toLocaleLowerCase("vi");
  const existing = customerMap.get(normalized);
  if (existing) return existing.id;

  const { data, error } = await supabase.from("customers").insert({ name: name.trim(), code }).select("id,code,name,phone,address,region").single();
  if (!error && data) {
    customerMap.set(normalized, data as CustomerOption);
    return data.id;
  }

  const { data: found, error: findError } = await supabase.from("customers").select("id,code,name,phone,address,region").ilike("name", name.trim()).maybeSingle();
  if (findError) throw findError;
  if (!found) throw error || new Error(`Không thể tạo khách hàng "${name}".`);
  customerMap.set(normalized, found as CustomerOption);
  return found.id;
}
