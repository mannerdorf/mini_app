import type { VercelRequest, VercelResponse } from "@vercel/node";
import { initRequestContext, logError } from "../_lib/observability.js";
import { resolveHaulzReturnsAccess } from "../_haulzReturns.js";
import { translateProductNamesEnToRu } from "../../lib/haulzReturns/openaiTranslate.js";
import { resolveOpenaiApiKey } from "../../lib/haulzReturns/openaiEnv.js";
import { isRussianOnlyText, itogTextNeedsTranslation } from "../../lib/haulzReturns/textLanguage.js";

const MAX_ITEMS = 50;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "haulz_returns_translate_itog");
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
    }

    const access = await resolveHaulzReturnsAccess(req, req.body);
    if (!access) {
      return res.status(401).json({ error: "Нет доступа", request_id: ctx.requestId });
    }

    if (!resolveOpenaiApiKey()) {
      return res.status(503).json({
        error: "OPENAI_API_KEY не настроен на сервере API (Vercel → Environment Variables)",
        request_id: ctx.requestId,
      });
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

    const items: { rowKey: string; text: string }[] = [];
    for (const row of rawItems) {
      if (!row || typeof row !== "object") continue;
      const item = row as { rowKey?: unknown; rowId?: unknown; text?: unknown };
      const rowKey = String(item.rowKey ?? item.rowId ?? "").trim();
      const text = String(item.text ?? "").trim();
      if (!rowKey || !text) continue;
      items.push({ rowKey, text });
    }

    if (items.length === 0) {
      return res.status(400).json({ error: "Нет строк для перевода", request_id: ctx.requestId });
    }

    const toTranslate: { rowKey: string; text: string; index: number }[] = [];
    const result: { rowKey: string; rowId: string; translation: string }[] = items.map((item) => ({
      rowKey: item.rowKey,
      rowId: item.rowKey,
      translation: isRussianOnlyText(item.text) ? item.text : "",
    }));

    items.forEach((item, index) => {
      if (itogTextNeedsTranslation(item.text)) {
        toTranslate.push({ ...item, index });
      } else if (isRussianOnlyText(item.text)) {
        result[index]!.translation = item.text;
      }
    });

    if (toTranslate.length > 0) {
      const translations = await translateProductNamesEnToRu(toTranslate.map((i) => i.text));
      toTranslate.forEach((item, idx) => {
        result[item.index]!.translation = translations[idx] ?? "";
      });
    }

    return res.status(200).json({ items: result, request_id: ctx.requestId });
  } catch (error: unknown) {
    logError(ctx, "haulz_returns_translate_itog_failed", error);
    const message = error instanceof Error ? error.message : "Ошибка перевода";
    return res.status(500).json({ error: message, request_id: ctx.requestId });
  }
}
