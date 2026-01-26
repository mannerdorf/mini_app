import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button, Flex, Input, Panel, Typography } from "@maxhub/max-ui";
import { X } from "lucide-react";

type ChatRole = "user" | "assistant";
type ChatMessage = { role: ChatRole; content: string };

const LS_SESSION_KEY = "haulz.chat.sessionId";
const LS_MESSAGES_PREFIX = "haulz.chat.messages.";

function safeParse<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function getOrCreateSessionId() {
  if (typeof window === "undefined") return "server";
  const existing = window.localStorage.getItem(LS_SESSION_KEY);
  if (existing) return existing;
  const sid =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `s_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  window.localStorage.setItem(LS_SESSION_KEY, sid);
  return sid;
}

function getMessagesKey(sessionId: string) {
  return `${LS_MESSAGES_PREFIX}${sessionId}`;
}

export function ChatModal({
  isOpen,
  onClose,
  userId,
}: {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
}) {
  const [sessionId, setSessionId] = useState<string>(() => getOrCreateSessionId());
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  const canSend = useMemo(() => input.trim().length > 0 && !sending, [input, sending]);

  useEffect(() => {
    if (!isOpen) return;
    const stored = safeParse<ChatMessage[]>(
      typeof window !== "undefined" ? window.localStorage.getItem(getMessagesKey(sessionId)) : null,
    );
    if (stored && Array.isArray(stored)) setMessages(stored);
  }, [isOpen, sessionId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(getMessagesKey(sessionId), JSON.stringify(messages.slice(-50)));
  }, [messages, sessionId]);

  useEffect(() => {
    if (!isOpen) return;
    // scroll to bottom
    requestAnimationFrame(() => {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
    });
  }, [isOpen, messages.length]);

  if (!isOpen) return null;

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    setSending(true);
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, userId, message: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Ошибка: ${res.status}`);

      if (data?.sessionId && typeof data.sessionId === "string" && data.sessionId !== sessionId) {
        setSessionId(data.sessionId);
        if (typeof window !== "undefined") window.localStorage.setItem(LS_SESSION_KEY, data.sessionId);
      }
      setMessages((prev) => [...prev, { role: "assistant", content: data?.reply || "" }]);
    } catch (e: any) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Ошибка: ${e?.message || "не удалось получить ответ"}` },
      ]);
    } finally {
      setSending(false);
    }
  };

  const reset = async () => {
    try {
      await fetch("/api/chat-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
    } catch {
      // ignore
    }
    const sid =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `s_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    setSessionId(sid);
    setMessages([]);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(LS_SESSION_KEY, sid);
      window.localStorage.removeItem(getMessagesKey(sessionId));
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <Typography.Headline>Чат с HAULZ</Typography.Headline>
          <Flex align="center" style={{ gap: 8 }}>
            <Button onClick={reset} className="filter-button">
              Новый диалог
            </Button>
            <Button className="modal-close-button" onClick={onClose} aria-label="Закрыть">
              <X size={20} />
            </Button>
          </Flex>
        </div>

        <Panel mode="secondary" style={{ padding: 12, maxHeight: 360, overflow: "auto" }} ref={listRef as any}>
          {messages.length === 0 ? (
            <Typography.Body style={{ opacity: 0.8 }}>
              Напиши вопрос в свободной форме — я помогу.
            </Typography.Body>
          ) : (
            <Flex direction="column" style={{ gap: 10 }}>
              {messages.map((m, idx) => (
                <div key={idx}>
                  <Typography.Label style={{ opacity: 0.7 }}>
                    {m.role === "user" ? "Вы" : "HAULZ"}
                  </Typography.Label>
                  <Typography.Body style={{ whiteSpace: "pre-wrap" }}>{m.content}</Typography.Body>
                </div>
              ))}
            </Flex>
          )}
        </Panel>

        <Flex align="center" style={{ gap: 8, marginTop: 12 }}>
          <Input
            className="login-input"
            placeholder="Введите сообщение…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") send();
            }}
          />
          <Button className="button-primary" disabled={!canSend} onClick={send}>
            {sending ? "..." : "Отправить"}
          </Button>
        </Flex>
      </div>
    </div>
  );
}

