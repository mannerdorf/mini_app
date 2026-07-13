/** AI-чат (Gruzik). */

import { fetchJson } from "./_base";
import { postPerevozkiList } from "./perevozkiClient";

export type ChatMessage = { role: "user" | "assistant"; content: string; emotion?: string };

export async function fetchChatHistory(sessionId: string): Promise<ChatMessage[]> {
  const { ok, data } = await fetchJson<{ history?: ChatMessage[] }>("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, action: "history" }),
  });
  if (!ok || !Array.isArray(data.history)) return [];
  return data.history.filter((item) => item?.role === "user" || item?.role === "assistant").map((item) => ({
    role: item.role,
    content: String(item.content ?? ""),
    emotion: item.emotion,
  }));
}

export async function resetChatSession(sessionId: string): Promise<void> {
  await fetch("/api/chat-reset", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId }),
  });
}

export type ChatSendBody = {
  sessionId: string;
  userId?: string;
  message: string;
  context: Record<string, unknown>;
  customer: string | null;
  preloadedCargo?: unknown;
  auth?: { login: string; password: string; inn?: string; isRegisteredUser?: boolean };
};

export async function sendChatMessage(body: ChatSendBody): Promise<{
  ok: boolean;
  status: number;
  data: Record<string, unknown>;
}> {
  const { ok, status, data } = await fetchJson<Record<string, unknown>>("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { ok, status, data };
}

export { postPerevozkiList as fetchChatPerevozkiContext };
