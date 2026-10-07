import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { respondCorsPreflight } from "./_lib/cors.js";
import { resolveHaulzCalculatorAccess } from "./_haulzCalculator.js";
import {
  checkCargo,
  cleanNumber,
  normalizeCargo,
  readBacklog,
} from "../lib/tms/backlog.js";
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (respondCorsPreflight(req, res)) return;
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });
  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: "Некорректный запрос" });
  }
  if (!body || typeof body !== "object")
    return res.status(400).json({ error: "Некорректный запрос" });
  if (
    body.numbers !== undefined &&
    (!Array.isArray(body.numbers) ||
      !body.numbers.length ||
      body.numbers.length > 4 ||
      body.numbers.some(
        (n: unknown) => typeof n !== "string" || !/^\d{1,20}$/.test(n),
      ))
  )
    return res.status(400).json({ error: "Допустимо до 4 номеров за запрос" });
  try {
    if (!(await resolveHaulzCalculatorAccess(req, body)))
      return res
        .status(403)
        .json({ error: "TMS доступен сотрудникам с правом HAULZ" });
    const numbers = body.numbers?.map(cleanNumber);
    const { rows, assigned } = await readBacklog(getPool(), numbers);
    const items = await Promise.all(
      rows.map(async (r) => {
        const updatedAt = r.updated_at?.toISOString() ?? null;
        const item = normalizeCargo(r.payload, updatedAt);
        return numbers
          ? { ...item, ...(await checkCargo(r.payload, updatedAt ?? "")) }
          : item;
      }),
    );
    return res
      .status(200)
      .json({ items, assigned, checkedAt: new Date().toISOString() });
  } catch (error) {
    console.error(
      "[tms-backlog]",
      error instanceof Error ? error.name : "Error",
    );
    return res
      .status(500)
      .json({
        error:
          "Не удалось загрузить перевозки для планирования. Повторите попытку.",
      });
  }
}
