"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  CheckCircle2,
  Clipboard,
  Download,
  ExternalLink,
  Link2,
  LoaderCircle,
  MessageCircleMore,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  UserPlus,
  UsersRound,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { ZaloContact, ZaloMessage } from "@/lib/types";

const PAGE_SOURCE = "ha-hoa-web-page-v130";
const EXTENSION_SOURCE = "ha-hoa-zalo-extension-v130";

interface CapturedMessage {
  messageKey: string;
  direction: "incoming" | "outgoing" | "system";
  senderName?: string;
  body: string;
  displayTime?: string;
  sentAt?: string;
  messageType?: "text" | "image" | "file" | "system";
  sortOrder: number;
}

interface BridgeResponse {
  ok: boolean;
  error?: string;
  warning?: string;
  displayName?: string;
  phone?: string;
  conversationId?: string;
  conversationKey?: string;
  conversationUrl?: string;
  capturedAt?: string;
  exact?: boolean;
  extensionVersion?: string;
  messages?: CapturedMessage[];
  captures?: AutoCaptureEvent[];
}

interface AutoCaptureEvent {
  eventId: string;
  createdAt: string;
  triggerKey: string;
  conversationKey: string;
  capture: BridgeResponse;
}

interface AiResult {
  summary: string;
  customer_intent: string;
  suggestions: string[];
  next_action: string;
  persisted?: boolean;
  persistence_warning?: string;
}

function bridgeRequest(action: "ping" | "capture" | "open" | "drain" | "ack", payload: Record<string, string> = {}, timeout = 12000) {
  return new Promise<BridgeResponse>((resolve) => {
    const requestId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    const timer = window.setTimeout(() => {
      window.removeEventListener("message", receive);
      resolve({
        ok: false,
        error: action === "capture"
          ? "Tiện ích đã quét quá thời gian chờ. Giữ nguyên tab Zalo rồi thử đồng bộ lại."
          : "Không thấy tiện ích Hà Hoà Zalo Bridge trên trình duyệt.",
      });
    }, timeout);

    function receive(event: MessageEvent) {
      const data = event.data as Record<string, unknown> | null;
      if (event.source !== window || event.origin !== window.location.origin || !data) return;
      if (data.source !== EXTENSION_SOURCE || data.type !== "HAHOA_ZALO_BRIDGE_RESPONSE" || data.requestId !== requestId) return;
      window.clearTimeout(timer);
      window.removeEventListener("message", receive);
      resolve(data as unknown as BridgeResponse);
    }

    window.addEventListener("message", receive);
    window.postMessage({ source: PAGE_SOURCE, type: "HAHOA_ZALO_BRIDGE_REQUEST", requestId, action, payload }, window.location.origin);
  });
}

function normalizePhone(value: string) {
  return value.trim().replace(/[^\d+]/g, "");
}

function contactInitials(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(-2).map((part) => part[0]).join("").toLocaleUpperCase("vi-VN");
}

function messageTime(message: ZaloMessage) {
  if (message.display_time) return message.display_time;
  const value = message.sent_at || message.captured_at;
  return new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }).format(new Date(value));
}

export function ZaloContacts({ accessToken, onOpenDebtAi }: { accessToken: string; onOpenDebtAi: () => void }) {
  const [contacts, setContacts] = useState<ZaloContact[]>([]);
  const [messages, setMessages] = useState<ZaloMessage[]>([]);
  const [selected, setSelected] = useState<ZaloContact | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [busy, setBusy] = useState<"save" | "sync" | string | null>(null);
  const [extensionReady, setExtensionReady] = useState(false);
  const [extensionVersion, setExtensionVersion] = useState("");
  const [autoSyncing, setAutoSyncing] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [aiResult, setAiResult] = useState<AiResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const selectedIdRef = useRef<string | null>(null);
  const autoWorkRef = useRef<Promise<void>>(Promise.resolve());
  const processingEventsRef = useRef(new Set<string>());

  const loadContacts = useCallback(async () => {
    setLoading(true);
    const { data, error: loadError } = await supabase.from("zalo_contacts")
      .select("id,display_name,phone,conversation_id,conversation_key,conversation_url,source,last_synced_at,created_at,updated_at")
      .order("updated_at", { ascending: false });
    if (loadError) setError(databaseMessage(loadError.message));
    else {
      const next = (data || []) as ZaloContact[];
      setContacts(next);
      setSelected((current) => current ? next.find((item) => item.id === current.id) || null : current);
    }
    setLoading(false);
  }, []);

  const loadMessages = useCallback(async (contact: ZaloContact) => {
    setSelected(contact);
    setAiResult(null);
    setLoadingMessages(true);
    setError("");
    const [messageResult, suggestionResult] = await Promise.all([
      supabase.from("zalo_messages")
        .select("id,contact_id,message_key,direction,sender_name,body,display_time,sent_at,message_type,sort_order,captured_at")
        .eq("contact_id", contact.id).order("captured_at", { ascending: false }).limit(250),
      supabase.from("zalo_ai_suggestions")
        .select("summary,customer_intent,suggestions,next_action,status,error,updated_at")
        .eq("contact_id", contact.id).maybeSingle(),
    ]);
    const { data, error: loadError } = messageResult;
    setLoadingMessages(false);
    if (loadError) {
      setMessages([]);
      setError(databaseMessage(loadError.message));
      return;
    }
    const rows = (data || []) as ZaloMessage[];
    rows.sort((a, b) => {
      const timeA = a.sent_at ? new Date(a.sent_at).getTime() : 0;
      const timeB = b.sent_at ? new Date(b.sent_at).getTime() : 0;
      return timeA && timeB && timeA !== timeB ? timeA - timeB : a.sort_order - b.sort_order;
    });
    setMessages(rows);
    const storedSuggestion = suggestionResult.data as (AiResult & { status?: string }) | null;
    if (storedSuggestion?.status === "ready" && Array.isArray(storedSuggestion.suggestions)) setAiResult(storedSuggestion);
  }, []);

  useEffect(() => {
    selectedIdRef.current = selected?.id || null;
  }, [selected]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadContacts(), 0);
    return () => window.clearTimeout(timer);
  }, [loadContacts]);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      void bridgeRequest("ping", {}, 2500).then((response) => {
        if (active) {
          setExtensionReady(response.ok);
          setExtensionVersion(response.extensionVersion || "");
        }
      });
    }, 150);
    return () => { active = false; window.clearTimeout(timer); };
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 4500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("vi-VN");
    if (!query) return contacts;
    return contacts.filter((contact) => `${contact.display_name} ${contact.phone || ""}`.toLocaleLowerCase("vi-VN").includes(query));
  }, [contacts, search]);

  async function addContact(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const displayName = name.trim();
    const normalizedPhone = normalizePhone(phone);
    if (!displayName) return setError("Cần nhập tên liên hệ.");
    if (!/^(?:\+?84|0)\d{9}$/.test(normalizedPhone)) return setError("SĐT cần đủ 10 số, ví dụ 0912345678.");
    setBusy("save");
    const { data, error: saveError } = await supabase.from("zalo_contacts").insert({ display_name: displayName, phone: normalizedPhone, source: "manual" }).select("*").single();
    setBusy(null);
    if (saveError) return setError(databaseMessage(saveError.message));
    setName("");
    setPhone("");
    setNotice(`Đã thêm ${displayName} vào danh bạ.`);
    await loadContacts();
    if (data) void loadMessages(data as ZaloContact);
  }

  const persistCapturedConversation = useCallback(async (response: BridgeResponse, selectAfterSave: boolean) => {
    if (!response.ok || !response.displayName) throw new Error(response.error || "Không đọc được hội thoại Zalo đang mở.");
    const existing = await findExistingContact(response);
    const contactRow = {
      display_name: response.displayName.trim(),
      phone: normalizePhone(response.phone || existing?.phone || "") || null,
      conversation_id: response.conversationId || existing?.conversation_id || null,
      conversation_key: response.conversationKey || existing?.conversation_key || null,
      conversation_url: response.conversationUrl || existing?.conversation_url || null,
      source: "zalo_extension" as const,
      last_synced_at: response.capturedAt || new Date().toISOString(),
    };
    const contactQuery = existing
      ? supabase.from("zalo_contacts").update(contactRow).eq("id", existing.id).select("*").single()
      : supabase.from("zalo_contacts").insert(contactRow).select("*").single();
    const { data: savedContact, error: contactError } = await contactQuery;
    if (contactError || !savedContact) throw new Error(databaseMessage(contactError?.message || "Không lưu được liên hệ Zalo."));

    const capturedAt = response.capturedAt || new Date().toISOString();
    const messageRows = (response.messages || []).filter((message) => message.body.trim()).map((message) => ({
      contact_id: savedContact.id,
      message_key: message.messageKey,
      direction: message.direction,
      sender_name: message.senderName || null,
      body: message.body.trim(),
      display_time: message.displayTime || null,
      sent_at: message.sentAt || null,
      message_type: message.messageType || "text",
      sort_order: message.sortOrder,
      captured_at: capturedAt,
    }));
    if (messageRows.length) {
      const { error: messageError } = await supabase.from("zalo_messages").upsert(messageRows, { onConflict: "contact_id,message_key" });
      if (messageError) throw new Error(databaseMessage(messageError.message));
    }
    const contact = savedContact as ZaloContact;
    await loadContacts();
    if (selectAfterSave || selectedIdRef.current === contact.id) await loadMessages(contact);
    return { contact, messageCount: messageRows.length };
  }, [loadContacts, loadMessages]);

  const requestAiSuggestion = useCallback(async (contactId: string) => {
    const response = await fetch("/api/ai/zalo-suggestions", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ contact_id: contactId }),
    });
    const data = await response.json() as AiResult & { error?: string };
    if (!response.ok) throw new Error(data.error || "AI chưa tạo được gợi ý.");
    return data;
  }, [accessToken]);

  const processAutomaticCapture = useCallback(async (event: AutoCaptureEvent) => {
    setAutoSyncing(true);
    setError("");
    let saved = false;
    try {
      const { contact, messageCount } = await persistCapturedConversation(event.capture, false);
      saved = true;
      setNotice(`Khách vừa nhắn: đã tự đồng bộ ${messageCount} tin của “${contact.display_name}”. AI đang tạo câu trả lời…`);
      try {
        const suggestion = await requestAiSuggestion(contact.id);
        if (selectedIdRef.current === contact.id) setAiResult(suggestion);
        setNotice(suggestion.persistence_warning || `Đã tự đồng bộ “${contact.display_name}” và tạo 3 câu trả lời gợi ý.`);
      } catch (caught) {
        setError(`Đã tự đồng bộ tin mới nhưng AI chưa tạo được gợi ý: ${caught instanceof Error ? caught.message : "Lỗi không xác định."}`);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không tự đồng bộ được tin Zalo mới.");
    } finally {
      if (saved) await bridgeRequest("ack", { eventId: event.eventId }, 5000);
      processingEventsRef.current.delete(event.eventId);
      setAutoSyncing(false);
    }
  }, [persistCapturedConversation, requestAiSuggestion]);

  const enqueueAutomaticCapture = useCallback((event: AutoCaptureEvent) => {
    if (!event?.eventId || processingEventsRef.current.has(event.eventId)) return;
    processingEventsRef.current.add(event.eventId);
    autoWorkRef.current = autoWorkRef.current
      .catch(() => undefined)
      .then(() => processAutomaticCapture(event));
  }, [processAutomaticCapture]);

  useEffect(() => {
    const receiveAutomaticCapture = (event: MessageEvent) => {
      const data = event.data as { source?: string; type?: string; event?: AutoCaptureEvent } | null;
      if (event.source !== window || event.origin !== window.location.origin || !data) return;
      if (data.source !== EXTENSION_SOURCE || data.type !== "HAHOA_ZALO_AUTO_CAPTURE_READY" || !data.event) return;
      enqueueAutomaticCapture(data.event);
    };
    window.addEventListener("message", receiveAutomaticCapture);
    void bridgeRequest("drain", {}, 5000).then((response) => {
      for (const event of response.captures || []) enqueueAutomaticCapture(event);
    });
    return () => window.removeEventListener("message", receiveAutomaticCapture);
  }, [enqueueAutomaticCapture]);

  async function syncCurrentConversation() {
    setBusy("sync");
    setError("");
    setNotice("Tiện ích đang đọc và cuộn lịch sử Zalo. Giữ nguyên cuộc chat, quá trình có thể mất khoảng một phút.");
    const response = await bridgeRequest("capture", {}, 100000);
    if (!response.ok || !response.displayName) {
      setBusy(null);
      setError(response.error || "Không đọc được hội thoại Zalo đang mở.");
      return;
    }
    try {
      const { contact, messageCount } = await persistCapturedConversation(response, true);
      setExtensionReady(true);
      setNotice(`Đã đồng bộ “${contact.display_name}” và ${messageCount} tin nhắn.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không lưu được hội thoại Zalo.");
    } finally {
      setBusy(null);
    }
  }

  async function openOnZalo(contact: ZaloContact) {
    setBusy(`open-${contact.id}`);
    setError("");
    if (!extensionReady) {
      const fallback = contact.conversation_url || (contact.phone ? `https://zalo.me/${contact.phone.replace(/\D/g, "")}` : "https://chat.zalo.me/");
      window.open(fallback, "ha_hoa_zalo");
      setBusy(null);
      setError("Đã mở Zalo nhưng muốn vào thẳng đúng cuộc chat thì cần cài và bật tiện ích Hà Hoà Zalo Bridge.");
      return;
    }
    const response = await bridgeRequest("open", {
      displayName: contact.display_name, phone: contact.phone || "", conversationId: contact.conversation_id || "", conversationKey: contact.conversation_key || "", conversationUrl: contact.conversation_url || "",
    }, 20000);
    setBusy(null);
    if (!response.ok) return setError(response.error || "Không mở được hội thoại Zalo.");
    if (response.warning) setNotice(response.warning);
  }

  async function generateSuggestions() {
    if (!selected || !messages.length) return;
    setAiLoading(true);
    setAiResult(null);
    setError("");
    try {
      const data = await requestAiSuggestion(selected.id);
      setAiResult(data);
      if (data.persistence_warning) setNotice(data.persistence_warning);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "AI chưa tạo được gợi ý.");
    } finally {
      setAiLoading(false);
    }
  }

  async function copySuggestion(value: string) {
    await navigator.clipboard.writeText(value);
    setNotice("Đã sao chép câu trả lời. Mở Zalo và dán để gửi.");
  }

  async function deleteContact(contact: ZaloContact) {
    if (!window.confirm(`Xoá ${contact.display_name} và lịch sử đã đồng bộ?`)) return;
    setBusy(contact.id);
    const { error: deleteError } = await supabase.from("zalo_contacts").delete().eq("id", contact.id);
    setBusy(null);
    if (deleteError) return setError(databaseMessage(deleteError.message));
    setContacts((current) => current.filter((item) => item.id !== contact.id));
    if (selected?.id === contact.id) { setSelected(null); setMessages([]); setAiResult(null); }
    setNotice(`Đã xoá ${contact.display_name}.`);
  }

  return <section className="zalo-directory">
    <div className="zalo-toolbar-card">
      <div className="zalo-bridge-state"><span className={extensionReady ? "ready" : "offline"}>{extensionReady ? <CheckCircle2 /> : <Link2 />}</span><div><strong>{extensionReady ? "Đã kết nối Zalo Web" : "Chưa thấy tiện ích Zalo Bridge"}</strong><small>{extensionReady ? `Tự đồng bộ tin khách mới và tạo gợi ý AI${extensionVersion ? ` · Bản ${extensionVersion}` : ""}.` : "Cài tiện ích để tự nhận tin mới từ Zalo Web."}</small></div></div>
      <div className="zalo-toolbar-actions">
        <a className="secondary-button" href="/zalo-bridge-extension.zip?v=1.3.0" download><Download size={17} /> {extensionReady ? "Cập nhật tiện ích 1.3" : "Tải tiện ích 1.3"}</a>
        <a className="secondary-button" href="https://chat.zalo.me/" target="ha_hoa_zalo" rel="noreferrer"><ExternalLink size={17} /> Mở Zalo Web</a>
        <button className="primary-button" onClick={() => void syncCurrentConversation()} disabled={busy === "sync"}>{busy === "sync" ? <LoaderCircle className="spin" size={17} /> : <RefreshCw size={17} />} Đồng bộ hội thoại đang mở</button>
      </div>
    </div>

    {!extensionReady && <details className="zalo-install-guide"><summary>Cách cài tiện ích trên Edge/Chrome</summary><ol><li>Tải file tiện ích rồi giải nén.</li><li>Mở <code>edge://extensions</code> hoặc <code>chrome://extensions</code>, bật Chế độ nhà phát triển.</li><li>Chọn “Tải tiện ích đã giải nén”, chọn thư mục vừa giải nén rồi tải lại trang.</li></ol></details>}
    {error && <div className="error-banner zalo-message"><span>{error}</span><button onClick={() => setError("")}>×</button></div>}
    {notice && <div className="zalo-success">{notice}</div>}

    <div className="zalo-workspace">
      <aside className="zalo-sidebar">
        <details className="zalo-add-card"><summary><span><UserPlus size={18} /></span><strong>Thêm liên hệ</strong><Plus size={17} /></summary><form onSubmit={(event) => void addContact(event)}><label className="field"><span>Tên liên hệ</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ví dụ: Huy Ba Vì" maxLength={100} /></label><label className="field"><span>Số điện thoại Zalo</span><div className="input-icon"><Phone size={17} /><input inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="0912345678" maxLength={16} /></div></label><button className="primary-button zalo-save-button" type="submit" disabled={busy === "save"}>{busy === "save" ? <LoaderCircle className="spin" size={17} /> : <UserPlus size={17} />} Lưu liên hệ</button></form></details>

        <div className="zalo-list-card">
          <div className="zalo-list-heading"><div className="zalo-section-heading"><span><UsersRound size={19} /></span><div><h2>Danh bạ</h2><p>{contacts.length} liên hệ đã lưu</p></div></div><label className="zalo-search"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm tên hoặc SĐT" /></label></div>
          <div className="zalo-contact-list">
            {loading && <div className="zalo-empty compact"><LoaderCircle className="spin" /> Đang tải…</div>}
            {!loading && !filtered.length && <div className="zalo-empty compact"><MessageCircleMore /><strong>Chưa có liên hệ</strong></div>}
            {filtered.map((contact) => <article className={`zalo-contact ${selected?.id === contact.id ? "selected" : ""}`} key={contact.id}><button className="zalo-contact-main" onClick={() => void loadMessages(contact)} disabled={busy === contact.id}><span className="zalo-avatar">{contactInitials(contact.display_name)}</span><span className="zalo-contact-copy"><strong>{contact.display_name}</strong><small>{contact.phone || "Chưa có SĐT"}</small><i className={contact.source === "zalo_extension" ? "synced" : "manual"}>{contact.source === "zalo_extension" ? "Có lịch sử đồng bộ" : "Liên hệ thủ công"}</i></span></button><button className="icon-button danger" title="Xoá liên hệ" onClick={() => void deleteContact(contact)} disabled={busy === contact.id}><Trash2 size={15} /></button></article>)}
          </div>
        </div>

        <section className="zalo-ai-card">
          <div className="zalo-ai-heading"><span><Sparkles size={18} /></span><div><strong>AI gợi ý</strong><small>{selected ? `Dựa trên hội thoại với ${selected.display_name}` : "Chọn một hội thoại trước"}</small></div></div>
          {autoSyncing && <div className="zalo-auto-sync"><LoaderCircle className="spin" size={15} /><span>Đang nhận tin Zalo mới và tạo gợi ý…</span></div>}
          <button className="secondary-button zalo-debt-ai-button" onClick={onOpenDebtAi}><Bot size={16} /> Hỏi AI về công nợ</button>
          {!selected && <p className="zalo-ai-placeholder">Bấm vào tên liên hệ để xem lịch sử và nhờ AI gợi ý cách trả lời.</p>}
          {selected && !messages.length && <p className="zalo-ai-placeholder">Hội thoại này chưa có lịch sử. Mở đúng chat trên Zalo rồi bấm đồng bộ.</p>}
          {selected && messages.length > 0 && !aiResult && <button className="primary-button zalo-ai-button" onClick={() => void generateSuggestions()} disabled={aiLoading}>{aiLoading ? <LoaderCircle className="spin" size={16} /> : <Bot size={16} />} Phân tích và gợi ý trả lời</button>}
          {aiResult && <div className="zalo-ai-result"><div><small>Tóm tắt</small><p>{aiResult.summary}</p></div>{aiResult.customer_intent && <div><small>Khách đang cần</small><p>{aiResult.customer_intent}</p></div>}<div className="zalo-ai-suggestions"><small>Câu trả lời gợi ý</small>{aiResult.suggestions.map((suggestion, index) => <button key={`${suggestion}-${index}`} onClick={() => void copySuggestion(suggestion)}><span>{suggestion}</span><Clipboard size={14} /></button>)}</div>{aiResult.next_action && <div><small>Việc nên làm tiếp</small><p>{aiResult.next_action}</p></div>}<button className="text-button" onClick={() => void generateSuggestions()} disabled={aiLoading}><RefreshCw size={14} /> Tạo lại gợi ý</button></div>}
        </section>
      </aside>

      <section className="zalo-chat-card">
        {!selected ? <div className="zalo-chat-empty"><span><MessageCircleMore size={30} /></span><h2>Chọn một cuộc hội thoại</h2><p>Bấm vào liên hệ bên trái để xem lịch sử đã đồng bộ.</p></div> : <><header className="zalo-chat-header"><span className="zalo-avatar large">{contactInitials(selected.display_name)}</span><div><strong>{selected.display_name}</strong><small>{selected.phone || "Chưa có SĐT"} · {messages.length} tin nhắn đã lưu</small></div><button className="secondary-button" onClick={() => void openOnZalo(selected)} disabled={busy === `open-${selected.id}`}>{busy === `open-${selected.id}` ? <LoaderCircle className="spin" size={16} /> : <ExternalLink size={16} />} Mở trên Zalo</button></header><div className="zalo-chat-history">{loadingMessages && <div className="zalo-chat-loading"><LoaderCircle className="spin" /> Đang tải lịch sử…</div>}{!loadingMessages && !messages.length && <div className="zalo-chat-empty"><span><Link2 size={28} /></span><h2>Chưa có lịch sử</h2><p>Mở đúng cuộc chat trên Zalo Web rồi bấm “Đồng bộ hội thoại đang mở”.</p></div>}{!loadingMessages && messages.map((message) => <div className={`zalo-bubble-row ${message.direction}`} key={message.id}><div className="zalo-bubble"><p>{message.body}</p><small>{messageTime(message)}</small></div></div>)}</div><footer className="zalo-chat-footer"><span>Tin khách mới được tự đồng bộ khi Zalo Web và website đang mở.</span><button className="text-button" onClick={() => void syncCurrentConversation()} disabled={busy === "sync"}><RefreshCw size={14} /> Đồng bộ mới</button></footer></>}
      </section>
    </div>
  </section>;
}

async function findExistingContact(response: BridgeResponse) {
  const lookups: Array<["conversation_id" | "conversation_key" | "phone", string | undefined]> = [
    ["conversation_id", response.conversationId],
    ["conversation_key", response.conversationKey],
    ["phone", normalizePhone(response.phone || "") || undefined],
  ];
  for (const [column, value] of lookups) {
    if (!value) continue;
    const { data } = await supabase.from("zalo_contacts").select("*").eq(column, value).limit(1).maybeSingle();
    if (data) return data as ZaloContact;
  }
  return null;
}

function databaseMessage(message: string) {
  if (/zalo_contacts.*does not exist|schema cache/i.test(message)) return "Bảng danh bạ Zalo chưa có trên Supabase. Cần chạy migration 20260830010000_zalo_contacts.sql.";
  if (/zalo_messages.*does not exist|schema cache/i.test(message)) return "Bảng lịch sử Zalo chưa có trên Supabase. Hãy chạy file supabase_zalo_threads.sql trong SQL Editor.";
  if (/zalo_ai_suggestions.*does not exist|schema cache/i.test(message)) return "Bảng gợi ý AI chưa có trên Supabase. Hãy chạy lại file supabase_zalo_threads.sql trong SQL Editor.";
  if (/duplicate key|zalo_contacts_phone_key/i.test(message)) return "SĐT hoặc cuộc hội thoại này đã có trong danh bạ.";
  return message;
}
