"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Download,
  ExternalLink,
  Link2,
  LoaderCircle,
  MessageCircleMore,
  Phone,
  Search,
  Trash2,
  UserPlus,
  UsersRound,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { ZaloContact } from "@/lib/types";

const PAGE_SOURCE = "ha-hoa-web-page";
const EXTENSION_SOURCE = "ha-hoa-zalo-extension";

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
}

function bridgeRequest(action: "ping" | "capture" | "open", payload: Record<string, string> = {}, timeout = 12000) {
  return new Promise<BridgeResponse>((resolve) => {
    const requestId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    const timer = window.setTimeout(() => {
      window.removeEventListener("message", receive);
      resolve({ ok: false, error: "Không thấy tiện ích Hà Hoà Zalo Bridge trên trình duyệt." });
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
    window.postMessage({
      source: PAGE_SOURCE,
      type: "HAHOA_ZALO_BRIDGE_REQUEST",
      requestId,
      action,
      payload,
    }, window.location.origin);
  });
}

function normalizePhone(value: string) {
  return value.trim().replace(/[^\d+]/g, "");
}

function contactInitials(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(-2).map((part) => part[0]).join("").toLocaleUpperCase("vi-VN");
}

export function ZaloContacts() {
  const [contacts, setContacts] = useState<ZaloContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"save" | "sync" | string | null>(null);
  const [extensionReady, setExtensionReady] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadContacts = useCallback(async () => {
    setLoading(true);
    const { data, error: loadError } = await supabase
      .from("zalo_contacts")
      .select("id,display_name,phone,conversation_id,conversation_key,conversation_url,source,last_synced_at,created_at,updated_at")
      .order("display_name");
    if (loadError) setError(databaseMessage(loadError.message));
    else setContacts((data || []) as ZaloContact[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadContacts(), 0);
    return () => window.clearTimeout(timer);
  }, [loadContacts]);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      void bridgeRequest("ping", {}, 1400).then((response) => {
        if (active) setExtensionReady(response.ok);
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
    const { error: saveError } = await supabase.from("zalo_contacts").insert({
      display_name: displayName,
      phone: normalizedPhone,
      source: "manual",
    });
    setBusy(null);
    if (saveError) return setError(databaseMessage(saveError.message));
    setName("");
    setPhone("");
    setNotice(`Đã thêm ${displayName} vào danh bạ.`);
    await loadContacts();
  }

  async function syncCurrentConversation() {
    setBusy("sync");
    setError("");
    setNotice("");
    const response = await bridgeRequest("capture", {}, 15000);
    if (!response.ok || !response.displayName) {
      setBusy(null);
      setExtensionReady(!/không thấy tiện ích/i.test(response.error || ""));
      setError(response.error || "Không đọc được hội thoại Zalo đang mở.");
      return;
    }

    const existing = await findExistingContact(response);
    const row = {
      display_name: response.displayName.trim(),
      phone: normalizePhone(response.phone || existing?.phone || "") || null,
      conversation_id: response.conversationId || existing?.conversation_id || null,
      conversation_key: response.conversationKey || existing?.conversation_key || null,
      conversation_url: response.conversationUrl || existing?.conversation_url || null,
      source: "zalo_extension" as const,
      last_synced_at: response.capturedAt || new Date().toISOString(),
    };
    const query = existing
      ? supabase.from("zalo_contacts").update(row).eq("id", existing.id)
      : supabase.from("zalo_contacts").insert(row);
    const { error: saveError } = await query;
    setBusy(null);
    if (saveError) return setError(databaseMessage(saveError.message));
    setExtensionReady(true);
    setNotice(`Đã đồng bộ hội thoại “${row.display_name}”.`);
    await loadContacts();
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

  async function openContact(contact: ZaloContact) {
    setBusy(contact.id);
    setError("");
    if (!extensionReady) {
      const fallback = contact.conversation_url || (contact.phone ? `https://zalo.me/${contact.phone.replace(/\D/g, "")}` : "https://chat.zalo.me/");
      window.open(fallback, "ha_hoa_zalo");
      setBusy(null);
      setError("Đã mở Zalo nhưng muốn vào thẳng đúng cuộc chat thì cần cài và bật tiện ích Hà Hoà Zalo Bridge.");
      return;
    }
    const response = await bridgeRequest("open", {
      displayName: contact.display_name,
      phone: contact.phone || "",
      conversationId: contact.conversation_id || "",
      conversationKey: contact.conversation_key || "",
      conversationUrl: contact.conversation_url || "",
    }, 20000);
    setBusy(null);
    if (!response.ok) return setError(response.error || "Không mở được hội thoại Zalo.");
    if (response.warning) setNotice(response.warning);
  }

  async function deleteContact(contact: ZaloContact) {
    if (!window.confirm(`Xoá ${contact.display_name} khỏi danh bạ Zalo?`)) return;
    setBusy(contact.id);
    const { error: deleteError } = await supabase.from("zalo_contacts").delete().eq("id", contact.id);
    setBusy(null);
    if (deleteError) return setError(databaseMessage(deleteError.message));
    setContacts((current) => current.filter((item) => item.id !== contact.id));
    setNotice(`Đã xoá ${contact.display_name}.`);
  }

  return (
    <section className="zalo-directory">
      <div className="zalo-toolbar-card">
        <div className="zalo-bridge-state">
          <span className={extensionReady ? "ready" : "offline"}>{extensionReady ? <CheckCircle2 /> : <Link2 />}</span>
          <div>
            <strong>{extensionReady ? "Đã kết nối Zalo Web" : "Chưa thấy tiện ích Zalo Bridge"}</strong>
            <small>{extensionReady ? "Có thể đồng bộ và mở đúng cuộc hội thoại." : "Cài tiện ích một lần trên Edge/Chrome để dùng chức năng mở thẳng cuộc chat."}</small>
          </div>
        </div>
        <div className="zalo-toolbar-actions">
          {!extensionReady && <a className="secondary-button" href="/zalo-bridge-extension.zip" download><Download size={17} /> Tải tiện ích</a>}
          <a className="secondary-button" href="https://chat.zalo.me/" target="ha_hoa_zalo" rel="noreferrer"><ExternalLink size={17} /> Mở Zalo Web</a>
          <button className="primary-button" onClick={() => void syncCurrentConversation()} disabled={busy === "sync"}>
            {busy === "sync" ? <LoaderCircle className="spin" size={17} /> : <Link2 size={17} />} Đồng bộ hội thoại đang mở
          </button>
        </div>
      </div>

      {!extensionReady && <details className="zalo-install-guide">
        <summary>Cách cài tiện ích trên Edge/Chrome</summary>
        <ol><li>Tải file tiện ích ở nút phía trên rồi giải nén.</li><li>Mở <code>edge://extensions</code> hoặc <code>chrome://extensions</code>, bật Chế độ nhà phát triển.</li><li>Chọn “Tải tiện ích đã giải nén”, trỏ vào thư mục vừa giải nén rồi tải lại trang này.</li></ol>
      </details>}

      {error && <div className="error-banner zalo-message"><span>{error}</span><button onClick={() => setError("")}>×</button></div>}
      {notice && <div className="zalo-success">{notice}</div>}

      <div className="zalo-grid">
        <form className="zalo-add-card" onSubmit={(event) => void addContact(event)}>
          <div className="zalo-section-heading"><span><UserPlus size={20} /></span><div><h2>Thêm liên hệ</h2><p>Nhập tên và SĐT đang dùng trên Zalo.</p></div></div>
          <label className="field"><span>Tên liên hệ</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ví dụ: Huy Ba Vì" maxLength={100} /></label>
          <label className="field"><span>Số điện thoại Zalo</span><div className="input-icon"><Phone size={17} /><input inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="0912345678" maxLength={16} /></div></label>
          <button className="primary-button zalo-save-button" type="submit" disabled={busy === "save"}>{busy === "save" ? <LoaderCircle className="spin" size={17} /> : <UserPlus size={17} />} Lưu liên hệ</button>
          <p className="zalo-form-hint">Khi bấm mở chat, tiện ích sẽ tìm SĐT này ngay trong Zalo Web.</p>
        </form>

        <div className="zalo-list-card">
          <div className="zalo-list-heading">
            <div className="zalo-section-heading"><span><UsersRound size={20} /></span><div><h2>Danh bạ Zalo</h2><p>{contacts.length} liên hệ đã lưu</p></div></div>
            <label className="zalo-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm tên hoặc SĐT" /></label>
          </div>
          <div className="zalo-contact-list">
            {loading && <div className="zalo-empty"><LoaderCircle className="spin" /> Đang tải danh bạ…</div>}
            {!loading && !filtered.length && <div className="zalo-empty"><MessageCircleMore /><strong>Chưa có liên hệ</strong><span>Thêm bằng SĐT hoặc đồng bộ cuộc chat đang mở.</span></div>}
            {filtered.map((contact) => (
              <article className="zalo-contact" key={contact.id}>
                <button className="zalo-contact-main" onClick={() => void openContact(contact)} disabled={busy === contact.id}>
                  <span className="zalo-avatar">{contactInitials(contact.display_name)}</span>
                  <span className="zalo-contact-copy">
                    <strong>{contact.display_name}</strong>
                    <small>{contact.phone || "Chưa có SĐT"}</small>
                    <i className={contact.source === "zalo_extension" ? "synced" : "manual"}>{contact.source === "zalo_extension" ? "Đã đồng bộ đúng hội thoại" : "Tìm bằng SĐT"}</i>
                  </span>
                  <span className="zalo-open-label">{busy === contact.id ? <LoaderCircle className="spin" /> : <MessageCircleMore />} Mở chat</span>
                </button>
                <button className="icon-button danger" title="Xoá liên hệ" onClick={() => void deleteContact(contact)} disabled={busy === contact.id}><Trash2 size={17} /></button>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function databaseMessage(message: string) {
  if (/zalo_contacts.*does not exist|schema cache/i.test(message)) return "Bảng danh bạ Zalo chưa có trên Supabase. Cần chạy migration 20260830010000_zalo_contacts.sql.";
  if (/duplicate key|zalo_contacts_phone_key/i.test(message)) return "SĐT hoặc cuộc hội thoại này đã có trong danh bạ.";
  return message;
}
