"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { Bot, Download, LoaderCircle, Send, Sparkles, UserRound, X } from "lucide-react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface Props {
  accessToken: string;
  onClose: () => void;
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

export function DebtAiChat({ accessToken, onClose }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), [messages, loading]);

  async function submit(event?: FormEvent, suggestion?: string) {
    event?.preventDefault();
    const question = (suggestion || input).trim();
    if (!question || loading) return;
    const nextMessages = [...messages, { role: "user" as const, content: question }];
    setMessages(nextMessages);
    setInput("");
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages.slice(1) }),
      });
      const data = await response.json() as { message?: string; error?: string; code?: string };
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
      const response = await fetch("/api/debts/json", { headers: { Authorization: `Bearer ${accessToken}` } });
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

  return (
    <div className="ai-drawer-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="ai-drawer" aria-label="Hỏi AI về công nợ">
        <header className="ai-drawer-header">
          <div className="ai-heading-icon"><Sparkles size={21} /></div>
          <div><p className="eyebrow">TRỢ LÝ DỮ LIỆU</p><h2>Hỏi AI về công nợ</h2></div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Đóng ô chat"><X /></button>
        </header>

        <div className="ai-data-bar">
          <div><strong>Dữ liệu trực tiếp từ Supabase</strong><span>AI chỉ lấy phần liên quan đến câu hỏi</span></div>
          <button className="secondary-button" type="button" onClick={() => void downloadJson()} disabled={downloading}>
            {downloading ? <LoaderCircle className="spin" size={16} /> : <Download size={16} />} Tải JSON
          </button>
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
            {suggestions.map((suggestion) => <button type="button" key={suggestion} onClick={() => void submit(undefined, suggestion)}>{suggestion}</button>)}
          </div>
        )}

        <form className="ai-composer" onSubmit={(event) => void submit(event)}>
          {error && <p className="form-error">{error}</p>}
          <div>
            <textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={handleKeyDown} placeholder="Ví dụ: Công nợ khách Hồng từ 01/07 đến 31/07?" maxLength={2000} rows={2} />
            <button className="primary-button" type="submit" disabled={!input.trim() || loading} aria-label="Gửi câu hỏi"><Send size={18} /></button>
          </div>
          <small>Enter để gửi · Shift + Enter để xuống dòng</small>
        </form>
      </aside>
    </div>
  );
}
