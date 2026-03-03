import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { verifyRegisteredUser } from "../lib/verifyRegisteredUser.js";

function pickCredentials(req: VercelRequest, body: any): { login: string; password: string } {
  const loginFromHeader = typeof req.headers["x-login"] === "string" ? req.headers["x-login"] : "";
  const passwordFromHeader = typeof req.headers["x-password"] === "string" ? req.headers["x-password"] : "";
  const login = String(body?.login || loginFromHeader || "").trim();
  const password = String(body?.password || passwordFromHeader || "").trim();
  return { login, password };
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const pool = getPool();
  const body = req.method === "POST" ? req.body : req.query;
  const { login, password } = pickCredentials(req, body);
  if (!login || !password) {
    return res.status(400).json({ error: "login and password are required" });
  }

  const verified = await verifyRegisteredUser(pool, login, password);
  if (!verified) return res.status(401).json({ error: "Неверный логин или пароль" });

  if (req.method === "GET") {
    const inn = String(req.query?.inn || "").trim();
    const targetInn = inn || (verified.inn || "");
    if (!targetInn) return res.json({ requests: [] });
    if (!verified.accessAllInns && verified.inn && targetInn !== verified.inn) {
      return res.status(403).json({ error: "Нет доступа к этому ИНН" });
    }

    const { rows } = await pool.query(
      `SELECT
         id,
         login,
         customer_inn AS "customerInn",
         contract,
         period_from AS "periodFrom",
         period_to AS "periodTo",
         status,
         created_at AS "createdAt",
         updated_at AS "updatedAt"
       FROM sverki_requests
       WHERE customer_inn = $1
       ORDER BY created_at DESC, id DESC
       LIMIT 50`,
      [targetInn]
    );
    return res.json({ requests: rows });
  }

  const customerInn = String(body?.customerInn || body?.inn || "").trim();
  const contract = String(body?.contract || "").trim();
  const periodFrom = String(body?.periodFrom || "").trim();
  const periodTo = String(body?.periodTo || "").trim();

  if (!customerInn || !contract || !periodFrom || !periodTo) {
    return res.status(400).json({ error: "customerInn, contract, periodFrom, periodTo are required" });
  }
  if (!isIsoDate(periodFrom) || !isIsoDate(periodTo)) {
    return res.status(400).json({ error: "Период должен быть в формате YYYY-MM-DD" });
  }
  if (periodFrom > periodTo) {
    return res.status(400).json({ error: "Дата начала больше даты окончания" });
  }
  if (!verified.accessAllInns && verified.inn && customerInn !== verified.inn) {
    return res.status(403).json({ error: "Нет доступа к этому ИНН" });
  }

  const { rows } = await pool.query(
    `INSERT INTO sverki_requests (login, customer_inn, contract, period_from, period_to, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, 'pending', now(), now())
     RETURNING
       id,
       login,
       customer_inn AS "customerInn",
       contract,
       period_from AS "periodFrom",
       period_to AS "periodTo",
       status,
       created_at AS "createdAt",
       updated_at AS "updatedAt"`,
    [login, customerInn, contract, periodFrom, periodTo]
  );

  return res.status(201).json({ ok: true, request: rows[0] });
}
