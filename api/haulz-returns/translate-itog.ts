import type { VercelRequest, VercelResponse } from "@vercel/node";
import { initRequestContext, logError } from "../_lib/observability.js";
import { resolveHaulzReturnsAccess } from "../_haulzReturns.js";
import { translateProductNamesEnToRu } from "../../lib/haulzReturns/openaiTranslate.js";

const MAX_ITEMS = 50;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "haulz_returns_translate_itog");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  const access = await resolveHaulzReturnsAccess(req, req.body);
  if (!access) {
    return res.status(401).json({ error: "Нет доступа", request_id: ctx.requestId });
  }

  const body = req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>) : {};
  const rawItems = body.items;
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return res.status(400).json({ error: "Передайте items: [{ rowId, text }]", request_id: ctx.requestId });
  }
  if (rawItems.length > MAX_ITEMS) {
    return res.status(400).json({
      error: `Не более ${MAX_ITEMS} строк за один запрос`,
      request_id: ctx.requestId,
    });
  }

  const items: { rowId: string; text: string }[] = [];
  for (const row of rawItems) {
    if (!row || typeof row !== "object") continue;
    const rowId = String((row as { rowId?: unknown }).rowId ?? "").trim();
    const text = String((row as { text?: unknown }).text ?? "").trim();
    if (!rowId || !text) continue;
    items.push({ rowId, text });
  }

  if (items.length === 0) {
    return res.status(400).json({ error: "Нет строк для перевода", request_id: ctx.requestId });
  }

  try {
    const translations = await translateProductNamesEnToRu(items.map((i) => i.text));
    const result = items.map((item, idx) => ({
      rowId: item.rowId,
      translation: translations[idx] ?? "",
    }));
    return res.status(200).json({ items: result, request_id: ctx.requestId });
  } catch (error: unknown) {
    logError(ctx, "haulz_returns_translate_itog_failed", error);
    const message = error instanceof Error ? error.message : "Ошибка перевода";
    return res.status(500).json({ error: message, request_id: ctx.requestId });
  }
}
