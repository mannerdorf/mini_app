import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const loginParam = req.query.login;
  const logins = (Array.isArray(loginParam) ? loginParam : loginParam ? [loginParam] : [])
    .map((l) => (typeof l === "string" ? l.trim() : ""))
    .filter(Boolean);
  const accessAllParam = req.query.access_all;
  const accessAllLogins = new Set(
    (Array.isArray(accessAllParam) ? accessAllParam : accessAllParam ? [accessAllParam] : [])
      .map((l) => (typeof l === "string" ? l.trim().toLowerCase() : ""))
      .filter(Boolean)
  );
  if (logins.length === 0) {
    return res.status(400).json({ error: "query login (or multiple login) is required" });
  }

  try {
    let pool;
    try {
      pool = getPool();
    } catch {
      return res.status(200).json({ companies: [] });
    }
    const all: { login: string; inn: string; name: string }[] = [];

    let verifiedAccessAll: Set<string> = new Set();
    if (accessAllLogins.size > 0) {
      const { rows } = await pool.query<{ login: string }>(
        `SELECT LOWER(TRIM(login)) as login FROM registered_users
         WHERE active = true AND COALESCE(access_all_inns, false) = true`
      );
      verifiedAccessAll = new Set(rows.map((r) => r.login));
    }

    for (const login of logins) {
      const loginLower = login.toLowerCase();
      if (accessAllLogins.has(loginLower) && verifiedAccessAll.has(loginLower)) {
        const { rows } = await pool.query<{ inn: string; customer_name: string }>(
          "SELECT inn, customer_name FROM cache_customers ORDER BY customer_name, inn"
        );
        for (const r of rows) {
          all.push({ login: loginLower, inn: r.inn, name: r.customer_name || r.inn });
        }
      } else {
        const { rows } = await pool.query<{ inn: string; name: string }>(
          "SELECT inn, name FROM account_companies WHERE login = $1 ORDER BY name, inn",
          [loginLower]
        );
        for (const r of rows) {
          all.push({ login: loginLower, inn: r.inn, name: r.name });
        }
      }
    }
    return res.status(200).json({ companies: all });
  } catch (e: any) {
    console.error("companies list error:", e);
    return res
      .status(500)
      .json({ error: "Database error", details: e?.message || String(e) });
  }
}
