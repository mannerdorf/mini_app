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

  const login = typeof req.query.login === "string" ? req.query.login.trim() : "";
  if (!login) {
    return res.status(400).json({ error: "query login is required" });
  }

  try {
    const pool = getPool();
    const { rows } = await pool.query<{ inn: string; name: string }>(
      "SELECT inn, name FROM account_companies WHERE login = $1 ORDER BY name, inn",
      [login.toLowerCase()]
    );
    return res.status(200).json({
      companies: rows.map((r) => ({ inn: r.inn, name: r.name })),
    });
  } catch (e: any) {
    console.error("companies list error:", e);
    return res
      .status(500)
      .json({ error: "Database error", details: e?.message || String(e) });
  }
}
