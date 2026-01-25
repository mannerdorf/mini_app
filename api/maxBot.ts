import type { VercelRequest } from "@vercel/node";

const MAX_API_BASE = "https://platform-api.max.ru";

export type MaxInlineKeyboardButton =
  | { type: "link"; text: string; payload: string }
  | { type: "callback"; text: string; payload: string }
  | { type: "message"; text: string; payload: string }
  | { type: "open_app"; text: string; payload: string };

export type MaxInlineKeyboardAttachment = {
  type: "inline_keyboard";
  payload: {
    buttons: MaxInlineKeyboardButton[][];
  };
};

export async function maxSendMessage(args: {
  token: string;
  chatId: number | string;
  text: string;
  format?: "markdown" | "html";
  attachments?: MaxInlineKeyboardAttachment[];
}) {
  const res = await fetch(`${MAX_API_BASE}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: args.token,
    },
    body: JSON.stringify({
      chat_id: args.chatId,
      text: args.text,
      format: args.format,
      attachments: args.attachments,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`MAX sendMessage failed: ${res.status} ${text}`);
  }

  return await res.json().catch(() => ({}));
}

export function getMaxWebhookSecret(req: VercelRequest): string | null {
  const header = req.headers["x-haulz-secret"];
  if (typeof header === "string" && header.trim()) return header.trim();
  return null;
}

export function extractCargoNumberFromPayload(payload: unknown): string | null {
  const s = String(payload ?? "");
  const m = s.match(/haulz_perevozka_([0-9A-Za-zА-Яа-я._-]{1,64})/u);
  return m?.[1] || null;
}

