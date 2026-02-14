import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";

const PERMISSION_KEYS = [
  "cms_access", "cargo", "doc_invoices", "doc_acts", "doc_orders", "doc_claims",
  "doc_contracts", "doc_acts_settlement", "doc_tariffs", "chat", "service_mode", "analytics",
];

function normalizePermissions(permissions: unknown): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  if (permissions && typeof permissions === "object") {
    for (const k of PERMISSION_KEYS) {
      out[k] = !!(permissions as Record<string, unknown>)[k];
    }
  }
  for (const k of PERMISSION_KEYS) {
    if (!(k in out)) out[k] = false;
  }
  return out;
}

/** GET /api/role-presets — список пресетов ролей (для формы приглашения сотрудников, без авторизации) */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const pool = getPool();
    const { rows } = await pool.query<{ id: number; label: string; permissions: unknown; financial_access: boolean; service_mode: boolean; sort_order: number }>(
      "SELECT id, label, permissions, financial_access, service_mode, sort_order FROM admin_role_presets ORDER BY sort_order, id"
    );
    const presets = rows.map((r) => ({
      id: String(r.id),
      label: r.label,
      permissions: normalizePermissions(r.permissions),
      financial: r.financial_access,
      serviceMode: r.service_mode,
    }));
    return res.status(200).json({ presets });
  } catch (e: unknown) {
    console.error("role-presets error:", e);
    // Возвращаем пустой список, чтобы форма приглашения не ломалась (таблица может отсутствовать до миграции 018)
    return res.status(200).json({ presets: [] });
  }
}
