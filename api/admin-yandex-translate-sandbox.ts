import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { getAdminTokenFromRequest, verifyAdminToken } from "../lib/adminAuth.js";
import { writeAuditLog } from "../lib/adminAuditLog.js";
import { withErrorLog } from "../lib/requestErrorLog.js";
import { initRequestContext, logError } from "./_lib/observability.js";
import {
  applyProductNameTranslation,
  collectUniqueProductNameTranslationKeys,
  productNameTranslationKey,
  splitProductNamePrefix,
} from "../lib/fivepost/productNameTranslation.js";
import {
  requireProductNameTranslator,
  resolveProductNameTranslator,
  translateProductNamesToRu,
} from "../lib/fivepost/productNameTranslate.js";
import {
  resolveYandexFolderId,
  resolveYandexTranslateApiKey,
  translateTextsToRuYandex,
} from "../lib/fivepost/yandexTranslate.js";
import { resolveOpenaiApiKey } from "../lib/haulzReturns/openaiEnv.js";
import { translationLooksSuccessful } from "../lib/haulzReturns/textLanguage.js";

type TranslateMode = "direct" | "productNames" | "fivepost";

function parseBody(req: VercelRequest): Record<string, unknown> {
  let body: unknown = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
}

function keyHint(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.length <= 7) return "***";
  return `${trimmed.slice(0, 4)}***${trimmed.slice(-3)}`;
}

function normalizeTexts(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item ?? "").trim()).filter(Boolean);
  }
  const single = String(value ?? "").trim();
  if (!single) return [];
  return single
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "admin-yandex-translate-sandbox");
  const token = getAdminTokenFromRequest(req);
  if (!verifyAdminToken(token)) {
    return res.status(401).json({ error: "Требуется авторизация админа", request_id: ctx.requestId });
  }

  const yandexKey = resolveYandexTranslateApiKey();
  const folderId = resolveYandexFolderId();
  const openaiKey = resolveOpenaiApiKey();
  const preferredProvider = resolveProductNameTranslator();

  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      yandexConfigured: Boolean(yandexKey),
      yandexKeyHint: keyHint(yandexKey),
      folderIdConfigured: Boolean(folderId),
      folderIdHint: folderId ? keyHint(folderId) : "",
      openaiConfigured: Boolean(openaiKey),
      openaiKeyHint: keyHint(openaiKey),
      preferredProvider,
      request_id: ctx.requestId,
    });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  const body = parseBody(req);
  const mode = String(body.mode || "direct") as TranslateMode;
  const texts = normalizeTexts(body.texts);
  if (texts.length === 0) {
    return res.status(400).json({ error: "Укажите texts (строка или массив строк)", request_id: ctx.requestId });
  }
  if (texts.length > 100) {
    return res.status(400).json({ error: "Максимум 100 строк за один запрос", request_id: ctx.requestId });
  }

  try {
    if (mode === "direct") {
      if (!yandexKey) {
        return res.status(500).json({
          error: "Не задан YANDEX_TRANSLATE_API_KEY в окружении API",
          request_id: ctx.requestId,
        });
      }

      const translations = await translateTextsToRuYandex(texts);
      const rows = texts.map((original, idx) => {
        const translated = translations[idx] ?? "";
        return {
          original,
          translated,
          looksSuccessful: translationLooksSuccessful(original, translated),
        };
      });

      try {
        const pool = getPool();
        await writeAuditLog(pool, {
          action: "integration_yandex_translate_sandbox",
          target_type: "integration",
          details: { mode, count: texts.length, successCount: rows.filter((r) => r.looksSuccessful).length },
        });
      } catch (e) {
        logError(ctx, "admin_yandex_translate_sandbox_audit_failed", e);
      }

      return res.status(200).json({
        ok: true,
        mode,
        provider: "yandex",
        folderIdConfigured: Boolean(folderId),
        rows,
        successCount: rows.filter((r) => r.looksSuccessful).length,
        request_id: ctx.requestId,
      });
    }

    if (mode === "productNames") {
      const provider = requireProductNameTranslator();
      const translations = await translateProductNamesToRu(texts);
      const rows = texts.map((original, idx) => {
        const translated = translations[idx] ?? "";
        return {
          original,
          translated,
          looksSuccessful: translationLooksSuccessful(original, translated),
        };
      });

      return res.status(200).json({
        ok: true,
        mode,
        provider,
        rows,
        successCount: rows.filter((r) => r.looksSuccessful).length,
        request_id: ctx.requestId,
      });
    }

    if (mode === "fivepost") {
      const provider = requireProductNameTranslator();
      const keys = collectUniqueProductNameTranslationKeys(texts);
      const translatedKeys = keys.length > 0 ? await translateProductNamesToRu(keys) : [];
      const translationMap = new Map<string, string>();
      keys.forEach((key, idx) => {
        const translated = translatedKeys[idx]?.trim();
        if (translated) translationMap.set(key, translated);
      });

      const rows = texts.map((original) => {
        const { prefix, core } = splitProductNamePrefix(original);
        const translated = applyProductNameTranslation(original, translationMap);
        return {
          original,
          prefix,
          core,
          translationKey: productNameTranslationKey(original),
          translated,
          looksSuccessful: translationLooksSuccessful(original, translated),
        };
      });

      return res.status(200).json({
        ok: true,
        mode,
        provider,
        uniqueKeys: keys,
        translationMap: Object.fromEntries(translationMap),
        rows,
        successCount: rows.filter((r) => r.looksSuccessful).length,
        request_id: ctx.requestId,
      });
    }

    return res.status(400).json({ error: "Неподдерживаемый mode (direct | productNames | fivepost)", request_id: ctx.requestId });
  } catch (e: unknown) {
    logError(ctx, "admin_yandex_translate_sandbox_failed", e);
    return res.status(500).json({
      error: (e as Error)?.message || "Ошибка перевода",
      request_id: ctx.requestId,
    });
  }
}

export default withErrorLog(handler);
