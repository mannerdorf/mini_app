import type { VercelRequest, VercelResponse } from "@vercel/node";

/**
 * POST /api/verify-service-mode
 * Body: { password: string }
 * Проверяет пароль служебного режима. Пароль задаётся в Vercel: SERVICE_MODE_PASSWORD
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const expected = process.env.SERVICE_MODE_PASSWORD;
  if (!expected || expected.trim() === "") {
    return res.status(500).json({ error: "Сервис не настроен" });
  }

  let body: { password?: string } = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: "Invalid JSON" });
    }
  }

  const password = typeof body?.password === "string" ? body.password.trim() : "";
  if (!password) {
    return res.status(400).json({ error: "Пароль не указан" });
  }

  if (password === expected) {
    return res.status(200).json({ ok: true });
  }

  return res.status(401).json({ error: "Неверный пароль" });
}
