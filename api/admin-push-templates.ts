import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import {
  getAdminTokenFromRequest,
  getAdminTokenPayload,
  verifyAdminToken,
} from "../lib/adminAuth.js";
import { withErrorLog } from "../lib/requestErrorLog.js";
import { initRequestContext, logError } from "./_lib/observability.js";
import {
  PUSH_NOTIFICATION_EVENTS,
  type PushNotificationTemplateEventId,
  listPushNotificationTemplates,
  savePushNotificationTemplates,
  defaultPushNotificationTemplates,
} from "../lib/pushNotificationTemplates.js";

function parseJsonBody(req: VercelRequest): Record<string, unknown> {
  let body: unknown = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return {};
    }
  }
  return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
}

async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "admin-push-templates");
  const token = getAdminTokenFromRequest(req);
  if (!verifyAdminToken(token)) {
    return res.status(401).json({ error: "Требуется авторизация админа", request_id: ctx.requestId });
  }
  if (getAdminTokenPayload(token)?.superAdmin !== true) {
    return res.status(403).json({ error: "Доступ только для супер-администратора", request_id: ctx.requestId });
  }

  try {
    const pool = getPool();

    if (req.method === "GET") {
      let templates;
      let notice: string | undefined;
      try {
        templates = await listPushNotificationTemplates(pool);
      } catch (e: unknown) {
        templates = defaultPushNotificationTemplates();
        notice = `Не удалось прочитать шаблоны из БД: ${(e as Error)?.message || String(e)}. Показаны значения по умолчанию.`;
        logError(ctx, "admin_push_templates_list_fallback", e);
      }
      return res.status(200).json({
        ok: true,
        templates,
        notice,
        variables: [
          { key: "cargo_number", hint: "Номер перевозки" },
          { key: "number", hint: "Номер перевозки (алиас)" },
          { key: "stage_label", hint: "Название этапа" },
          { key: "mest", hint: "Число мест" },
          { key: "w", hint: "Вес, кг" },
          { key: "pw", hint: "Платный вес, кг" },
          { key: "volume", hint: "Объём" },
          { key: "sender", hint: "Отправитель" },
          { key: "receiver", hint: "Получатель" },
          { key: "bill_sum", hint: "Сумма счёта" },
        ],
        request_id: ctx.requestId,
      });
    }

    if (req.method === "PUT" || req.method === "POST") {
      const body = parseJsonBody(req);
      const rawTemplates = Array.isArray(body.templates) ? body.templates : [];
      const parsed = rawTemplates
        .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object")
        .map((row) => ({
          eventId: String(row.eventId ?? row.event_id ?? "").trim() as PushNotificationTemplateEventId,
          titleTemplate: row.titleTemplate ?? row.title_template,
          bodyTemplate: row.bodyTemplate ?? row.body_template,
          enabled: row.enabled,
        }))
        .filter((row) => PUSH_NOTIFICATION_EVENTS.includes(row.eventId));

      if (parsed.length === 0) {
        return res.status(400).json({ error: "templates: массив eventId обязателен", request_id: ctx.requestId });
      }

      const editor = String(getAdminTokenPayload(token)?.login || "admin").trim() || "admin";
      await savePushNotificationTemplates(pool, parsed, editor);
      const templates = await listPushNotificationTemplates(pool);
      return res.status(200).json({ ok: true, templates, saved: parsed.length, request_id: ctx.requestId });
    }

    res.setHeader("Allow", "GET, PUT, POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  } catch (e: unknown) {
    logError(ctx, "admin_push_templates_failed", e);
    return res.status(500).json({
      error: (e as Error)?.message || "Ошибка шаблонов push",
      request_id: ctx.requestId,
    });
  }
}

export default withErrorLog(handler);
