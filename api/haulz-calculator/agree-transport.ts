import type { VercelRequest, VercelResponse } from "@vercel/node";
import { haulzCalculatorPreflight } from "./_preflight.js";
import { getPool } from "../_db.js";
import { initRequestContext, logError } from "../_lib/observability.js";
import { pgTableExists } from "../_haulzReturns.js";
import { getClientIp, isRateLimited, HAULZ_CALC_QUOTE_LIMIT } from "../../lib/rateLimit.js";
import { confirmTransportAgree } from "../../lib/haulzCalculator/calculatorDraftAgree.js";
import { HAULZ_CALC_DRAFT_STATUS_LABELS } from "../../lib/haulzCalculator/draftStatus.js";

function renderAgreePage(title: string, message: string, ok: boolean): string {
  const color = ok ? "#047857" : "#b45309";
  return `<!DOCTYPE html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title></head>
<body style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f3f4f6;color:#111827;">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:2rem 1rem;">
    <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:1.5rem;box-shadow:0 4px 20px rgba(0,0,0,.08);">
      <div style="font-size:1.25rem;font-weight:700;color:#1e3a8a;margin-bottom:0.75rem;">HAULZ</div>
      <h1 style="margin:0 0 0.75rem;font-size:1.125rem;color:${color};">${title}</h1>
      <p style="margin:0;font-size:0.9375rem;line-height:1.55;color:#4b5563;">${message}</p>
    </div>
  </td></tr></table>
</body></html>`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (haulzCalculatorPreflight(req, res)) return;
  const ctx = initRequestContext(req, res, "haulz_calculator_agree_transport");
  if (isRateLimited("haulz_calc_agree", getClientIp(req), HAULZ_CALC_QUOTE_LIMIT)) {
    return res.status(429).send("Слишком много запросов");
  }
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).send("Method not allowed");
  }

  const pool = getPool();
  if (!(await pgTableExists(pool, "haulz_calc_drafts"))) {
    return res.status(503).send("Сервис временно недоступен");
  }

  const token = String(req.query.token ?? "").trim();
  if (!token) {
    return res.status(400).send(renderAgreePage("Ошибка", "Не указана ссылка согласования.", false));
  }

  try {
    const result = await confirmTransportAgree(pool, token);
    if (!result.ok) {
      if (result.reason === "not_found") {
        return res.status(404).send(renderAgreePage("Ссылка недействительна", "Заявка не найдена или ссылка устарела.", false));
      }
      return res.status(400).send(
        renderAgreePage(
          "Нельзя согласовать",
          "Эта заявка уже обработана или находится в другом статусе.",
          false,
        ),
      );
    }

    const label = HAULZ_CALC_DRAFT_STATUS_LABELS[result.draft.status];
    if (result.already) {
      return res.status(200).send(
        renderAgreePage(
          "Уже принято",
          `Запрос на перевозку уже зарегистрирован. Статус: ${label}. Менеджер HAULZ свяжется с вами.`,
          true,
        ),
      );
    }

    return res.status(200).send(
      renderAgreePage(
        "Спасибо!",
        `Вы согласовали перевозку. Статус заявки: ${label}. Менеджер HAULZ свяжется с вами для подтверждения деталей.`,
        true,
      ),
    );
  } catch (e) {
    logError(ctx, "haulz_calc_agree_transport_failed", e);
    return res.status(500).send(renderAgreePage("Ошибка", "Не удалось обработать запрос. Попробуйте позже.", false));
  }
}
