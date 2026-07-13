/** Запросы дашборда (MAX debug, календарь — через scheduling). */

import { fetchJson } from "./_base";

export async function sendMaxTestMessage(chatId: string | number, text: string): Promise<{ ok: boolean; data: unknown }> {
  const { ok, data } = await fetchJson("/api/max-send-message", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chatId, text }),
  });
  return { ok, data };
}
