import type { VercelRequest, VercelResponse } from "@vercel/node";
import { initRequestContext } from "./_lib/observability.js";

/**
 * POST /api/verify-service-mode
 * Body: { password: string }
 * Проверяет пароль служебного режима (SERVICE_MODE_PASSWORD).
 * Служебный режим — отдельно от админки. Админка проверяется через verify-admin-access.
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  const ctx = initRequestContext(req, res, "verify-service-mode");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  const expected = process.env.SERVICE_MODE_PASSWORD?.trim();
  if (!expected) {
    return res.status(500).json({ error: "Сервис не настроен (SERVICE_MODE_PASSWORD)", request_id: ctx.requestId });
  }

  let body: { password?: string } = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: "Invalid JSON", request_id: ctx.requestId });
    }
  }

  const password = typeof body?.password === "string" ? body.password.trim() : "";
  if (!password) {
    return res.status(400).json({ error: "Пароль не указан", request_id: ctx.requestId });
  }

  if (password === expected) {
    return res.status(200).json({ ok: true, request_id: ctx.requestId });
  }

  return res.status(401).json({ error: "Неверный пароль", request_id: ctx.requestId });
}
