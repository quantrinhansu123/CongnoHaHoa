"use client";

import { FormEvent, KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";
import { Bot, CalendarDays, CheckCircle2, Clipboard, Download, ExternalLink, Link2, LoaderCircle, LogOut, Send, Sparkles, UserRound, X } from "lucide-react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface Props {
  accessToken: string;
  onClose: () => void;
}

interface CodexStatus {
  configured: boolean;
  authenticated: boolean;
  fallback_available: boolean;
  message: string;
}

interface DeviceLogin {
  loginToken: string;
  userCode: string;
  verificationUrl: string;
  interval: number;
}

const WELCOME: ChatMessage = {
  role: "assistant",
  content: "Anh/chị muốn kiểm tra công nợ của khách hàng nào? Có thể nhập thêm Công và khoảng ngày để kết quả chính xác hơn.",
};

const suggestions = [
  "Khách nào đang nợ nhiều nhất?",
  "Khoản nào đã quá hạn nhưng chưa trả hết?",
  "Tổng công nợ theo từng Công là bao nhiêu?",
];

function localIsoDate(date = new Date()) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

export function DebtAiChat({ accessToken, onClose }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [fromDate, setFromDate] = useState(() => localIsoDate());
  const [toDate, setToDate] = useState(() => localIsoDate());
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");
  const [codexStatus, setCodexStatus] = useState<CodexStatus | null>(null);
  const [codexLoading, setCodexLoading] = useState(true);
  const [deviceLogin, setDeviceLogin] = useState<DeviceLogin | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const pollTimerRef = useRef<number | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const loadCodexStatus = useCallback(async () => {
    setCodexLoading(true);
    try {
      const response = await fetch("/api/codex/status", { headers: { Authorization: `Bearer ${accessToken}` } });
      const data = await response.json() as CodexStatus & { error?: string };
      if (!response.ok) throw new Error(data.error || "Không đọc được trạng thái Codex.");
      setCodexStatus(data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không đọc được trạng thái Codex.");
    } finally {
      setCodexLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadCodexStatus(), 0);
    return () => {
      window.clearTimeout(timer);
      if (pollTimerRef.current) window.clearTimeout(pollTimerRef.current);
    };
  }, [loadCodexStatus]);

  async function beginCodexLogin() {
    setCodexLoading(true);
    setError("");
    try {
      const response = await fetch("/api/codex/login", { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } });
      const data = await response.json() as { login_token?: string; user_code?: string; verification_url?: string; interval?: number; error?: string };
      if (!response.ok || !data.login_token || !data.user_code || !data.verification_url) throw new Error(data.error || "Không tạo được mã đăng nhập Codex.");
      const login = { loginToken: data.login_token, userCode: data.user_code, verificationUrl: data.verification_url, interval: Math.max(2, data.interval || 5) };
      setDeviceLogin(login);
      schedulePoll(login);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không tạo được mã đăng nhập Codex.");
    } finally {
      setCodexLoading(false);
    }
  }

  function schedulePoll(login: DeviceLogin) {
    if (pollTimerRef.current) window.clearTimeout(pollTimerRef.current);
    pollTimerRef.current = window.setTimeout(() => void pollCodexLogin(login), login.interval * 1000);
  }

  async function pollCodexLogin(login: DeviceLogin) {
    try {
      const response = await fetch("/api/codex/login/poll", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ login_token: login.loginToken }),
      });
      const data = await response.json() as { pending?: boolean; authenticated?: boolean; error?: string };
      if (!response.ok) throw new Error(data.error || "Không xác nhận được đăng nhập Codex.");
      if (data.authenticated) {
        setDeviceLogin(null);
        setCodexStatus({ configured: true, authenticated: true, fallback_available: false, message: "Codex đã đăng nhập bằng ChatGPT" });
        setMessages((current) => [...current, { role: "assistant", content: "Đã kết nối ChatGPT/Codex. Anh/chị có thể bắt đầu hỏi dữ liệu công nợ." }]);
        return;
      }
      schedulePoll(login);
    } catch (caught) {
      setDeviceLogin(null);
      setError(caught instanceof Error ? caught.message : "Không xác nhận được đăng nhập Codex.");
    }
  }

  async function disconnectCodex() {
    setCodexLoading(true);
    setError("");
    try {
      const response = await fetch("/api/codex/status", { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } });
      if (!response.ok) throw new Error("Không thể ngắt kết nối Codex.");
      setDeviceLogin(null);
      setCodexStatus((current) => ({ configured: true, authenticated: false, fallback_available: current?.fallback_available || false, message: "Codex chưa đăng nhập bằng ChatGPT" }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không thể ngắt kết nối Codex.");
    } finally {
      setCodexLoading(false);
    }
  }

  async function submit(event?: FormEvent, suggestion?: string) {
    event?.preventDefault();
    const question = (suggestion || input).trim();
    if (!question || loading) return;
    if (!fromDate || !toDate || fromDate > toDate) {
      setError("Hãy chọn khoảng ngày hợp lệ trước khi hỏi AI.");
      return;
    }
    const nextMessages = [...messages, { role: "user" as const, content: question }];
    setMessages(nextMessages);
    setInput("");
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages.slice(1), from_date: fromDate, to_date: toDate }),
      });
      const data = await response.json() as { message?: string; error?: string; code?: string };
      if (data.code === "CODEX_LOGIN_REQUIRED" || data.code === "CODEX_SESSION_EXPIRED") {
        setCodexStatus((current) => ({ configured: true, authenticated: false, fallback_available: current?.fallback_available || false, message: "Cần đăng nhập lại ChatGPT/Codex" }));
      }
      if (!response.ok) throw new Error(data.error || "Không thể nhận câu trả lời từ AI.");
      setMessages((current) => [...current, { role: "assistant", content: data.message || "AI chưa trả về nội dung." }]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không thể nhận câu trả lời từ AI.");
    } finally {
      setLoading(false);
    }
  }

  async function downloadJson() {
    setDownloading(true);
    setError("");
    try {
      if (!fromDate || !toDate || fromDate > toDate) throw new Error("Hãy chọn khoảng ngày hợp lệ trước khi tải JSON.");
      const query = new URLSearchParams({ from_date: fromDate, to_date: toDate });
      const response = await fetch(`/api/debts/json?${query}`, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!response.ok) {
        const data = await response.json() as { error?: string };
        throw new Error(data.error || "Không thể tải file JSON.");
      }
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") || "";
      const filename = disposition.match(/filename="([^"]+)"/)?.[1] || "cong-no-ha-hoa.json";
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không thể tải file JSON.");
    } finally {
      setDownloading(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  }

  function changeDate(kind: "from" | "to", value: string) {
    if (kind === "from") setFromDate(value);
    else setToDate(value);
    setMessages([WELCOME]);
    setError("");
  }

  return (
    <div className="ai-drawer-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="ai-drawer" aria-label="Hỏi AI về công nợ">
        <header className="ai-drawer-header">
          <div className="ai-heading-icon"><Sparkles size={21} /></div>
          <div><p className="eyebrow">TRỢ LÝ DỮ LIỆU</p><h2>Hỏi AI về công nợ</h2></div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Đóng ô chat"><X /></button>
        </header>

        <div className="ai-data-bar">
          <div className="ai-data-heading"><strong>Dữ liệu trực tiếp từ Supabase</strong><span>AI đọc đủ JSON trong khoảng ngày đã chọn</span></div>
          <div className="ai-date-range" aria-label="Khoảng ngày dữ liệu AI">
            <label><span>Từ ngày</span><div><CalendarDays size={14} /><input type="date" value={fromDate} max={toDate || undefined} onChange={(event) => changeDate("from", event.target.value)} /></div></label>
            <label><span>Đến ngày</span><div><CalendarDays size={14} /><input type="date" value={toDate} min={fromDate || undefined} onChange={(event) => changeDate("to", event.target.value)} /></div></label>
          </div>
          <button className="secondary-button" type="button" onClick={() => void downloadJson()} disabled={downloading}>
            {downloading ? <LoaderCircle className="spin" size={16} /> : <Download size={16} />} Tải JSON
          </button>
        </div>

        <div className={`codex-connect ${codexStatus?.authenticated ? "connected" : ""}`}>
          {codexLoading ? <><LoaderCircle className="spin" size={18} /><div><strong>Đang kiểm tra kết nối Codex…</strong></div></> : codexStatus?.authenticated ? <>
            <CheckCircle2 size={19} /><div><strong>ChatGPT/Codex đã kết nối</strong><span>Phiên được mã hoá và chỉ dùng ở máy chủ</span></div><button type="button" className="text-button" onClick={() => void disconnectCodex()}><LogOut size={14} /> Ngắt</button>
          </> : deviceLogin ? <>
            <Link2 size={19} /><div className="codex-device-info"><strong>Nhập mã trên trang OpenAI</strong><code>{deviceLogin.userCode}</code><span>Hệ thống đang chờ anh/chị xác nhận…</span></div><div className="codex-device-actions"><button type="button" className="icon-button" title="Sao chép mã" onClick={() => void navigator.clipboard.writeText(deviceLogin.userCode)}><Clipboard size={15} /></button><a className="primary-button" href={deviceLogin.verificationUrl} target="_blank" rel="noreferrer">Mở OpenAI <ExternalLink size={14} /></a></div>
          </> : <>
            <Bot size={19} /><div><strong>Chưa kết nối ChatGPT/Codex</strong><span>Đăng nhập bằng tài khoản ChatGPT có quyền dùng Codex</span></div><button type="button" className="primary-button" onClick={() => void beginCodexLogin()}><Link2 size={15} /> Đăng nhập Codex</button>
          </>}
        </div>

        <div className="ai-messages">
          {messages.map((message, index) => (
            <div className={`ai-message ${message.role}`} key={`${message.role}-${index}`}>
              <span>{message.role === "assistant" ? <Bot size={17} /> : <UserRound size={17} />}</span>
              <p>{message.content}</p>
            </div>
          ))}
          {loading && <div className="ai-message assistant"><span><Bot size={17} /></span><p className="ai-thinking"><i /><i /><i /></p></div>}
          <div ref={bottomRef} />
        </div>

        {messages.length === 1 && (
          <div className="ai-suggestions">
            {suggestions.map((suggestion) => <button type="button" key={suggestion} disabled={!fromDate || !toDate || fromDate > toDate || (!codexStatus?.authenticated && !codexStatus?.fallback_available)} onClick={() => void submit(undefined, suggestion)}>{suggestion}</button>)}
          </div>
        )}

        <form className="ai-composer" onSubmit={(event) => void submit(event)}>
          {error && <p className="form-error">{error}</p>}
          <div>
            <textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={handleKeyDown} placeholder="Ví dụ: Công nợ khách Hồng từ 01/07 đến 31/07?" maxLength={2000} rows={2} />
            <button className="primary-button" type="submit" disabled={!input.trim() || !fromDate || !toDate || fromDate > toDate || loading || (!codexStatus?.authenticated && !codexStatus?.fallback_available)} aria-label="Gửi câu hỏi"><Send size={18} /></button>
          </div>
          <small>Enter để gửi · Shift + Enter để xuống dòng</small>
        </form>
      </aside>
    </div>
  );
}
