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
  // MAX API может требовать "Bearer " префикс или просто токен
  // Проверяем, есть ли уже префикс
  const authHeader = args.token.startsWith("Bearer ") 
    ? args.token 
    : `Bearer ${args.token}`;

  const res = await fetch(`${MAX_API_BASE}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader,
    },
    body: JSON.stringify({
      chat_id: Number(args.chatId), // Принудительно в число
      text: args.text,
      format: args.format,
      attachments: args.attachments,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => "no error text");
    console.error(`MAX sendMessage failed: status=${res.status}, body=${errorText}`);
    throw new Error(`MAX API Error: ${res.status} - ${errorText}`);
  }

  const result = await res.json().catch(() => ({}));
  console.log("MAX sendMessage success:", JSON.stringify(result));
  return result;
}

export function getMaxWebhookSecret(req: VercelRequest): string | null {
  const header = req.headers["x-max-bot-api-secret"] || req.headers["x-haulz-secret"];
  if (typeof header === "string" && header.trim()) return header.trim();
  return null;
}

export function extractCargoNumberFromPayload(payload: unknown): string | null {
  const s = String(payload ?? "").trim();
  
  if (!s) {
    console.log("[extractCargoNumber] Empty payload");
    return null;
  }
  
  console.log("[extractCargoNumber] Searching in payload:", s.substring(0, 100));
  
  // Ищем паттерн haulz_perevozka_<номер>
  const m = s.match(/haulz_perevozka_([0-9A-Za-zА-Яа-я._-]{1,64})/u);
  
  if (m && m[1]) {
    console.log("[extractCargoNumber] Found cargo number:", m[1]);
    return m[1];
  }

  // Поддержка нового формата: haulz_n_<номер>
  const m2 = s.match(/haulz_n_([0-9A-Za-zА-Яа-я._-]{1,64})/u);
  if (m2 && m2[1]) {
    console.log("[extractCargoNumber] Found cargo number (haulz_n):", m2[1]);
    return m2[1];
  }
  
  console.log("[extractCargoNumber] No cargo number found in payload");
  return null;
}

