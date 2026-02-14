import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { verifyAdminToken, getAdminTokenFromRequest } from "../lib/adminAuth.js";
import { getClientIp, isRateLimited, ADMIN_API_LIMIT } from "../lib/rateLimit.js";
import { writeAuditLog } from "../lib/adminAuditLog.js";

type PresetRow = {
  id: number;
  label: string;
  permissions: Record<string, boolean>;
  financial_access: boolean;
  service_mode: boolean;
  sort_order: number;
};

const PERMISSION_KEYS = [
  "cms_access", "cargo", "doc_invoices", "doc_acts", "doc_orders", "doc_claims",
  "doc_contracts", "doc_acts_settlement", "doc_tariffs", "chat", "service_mode",
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = getAdminTokenFromRequest(req);
  if (!verifyAdminToken(token)) {
    return res.status(401).json({ error: "Требуется авторизация админа" });
  }

  if (req.method === "GET") {
    try {
      const pool = getPool();
      const { rows } = await pool.query<PresetRow>(
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
      console.error("admin-presets GET error:", e);
      return res.status(500).json({ error: "Ошибка загрузки пресетов" });
    }
  }

  if (req.method === "POST" || req.method === "DELETE") {
    const ip = getClientIp(req);
    if (isRateLimited("admin_api", ip, ADMIN_API_LIMIT)) {
      return res.status(429).json({ error: "Слишком много запросов. Подождите минуту." });
    }
  }

  if (req.method === "POST") {
    let body: { id?: string; label?: string; permissions?: Record<string, boolean>; financial?: boolean; serviceMode?: boolean } = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        return res.status(400).json({ error: "Invalid JSON" });
      }
    }
    const label = typeof body?.label === "string" ? body.label.trim() : "";
    if (!label) return res.status(400).json({ error: "Укажите название пресета" });
    const permissions = normalizePermissions(body?.permissions);
    const financial = !!body?.financial;
    const serviceMode = !!body?.serviceMode;
    const idParam = typeof body?.id === "string" ? body.id.trim() : null;

    try {
      const pool = getPool();
      if (idParam) {
        const id = parseInt(idParam, 10);
        if (isNaN(id) || id < 1) return res.status(400).json({ error: "Некорректный id" });
        await pool.query(
          `UPDATE admin_role_presets SET label = $1, permissions = $2, financial_access = $3, service_mode = $4, sort_order = COALESCE(sort_order, 0) WHERE id = $5`,
          [label, JSON.stringify(permissions), financial, serviceMode, id]
        );
        await writeAuditLog(pool, { action: "preset_updated", target_type: "preset", target_id: id, details: { label } });
        return res.status(200).json({ ok: true, id: String(id), label, permissions, financial, serviceMode });
      }
      const { rows } = await pool.query<{ id: number }>(
        `INSERT INTO admin_role_presets (label, permissions, financial_access, service_mode, sort_order)
         VALUES ($1, $2, $3, $4, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM admin_role_presets))
         RETURNING id`,
        [label, JSON.stringify(permissions), financial, serviceMode]
      );
      const newId = rows[0]?.id;
      if (newId == null) return res.status(500).json({ error: "Ошибка создания пресета" });
      await writeAuditLog(pool, { action: "preset_created", target_type: "preset", target_id: newId, details: { label } });
      return res.status(200).json({ ok: true, id: String(newId), label, permissions, financial, serviceMode });
    } catch (e: unknown) {
      console.error("admin-presets POST error:", e);
      const err = e as { code?: string };
      if (err?.code === "23505") return res.status(400).json({ error: "Пресет с таким названием уже существует" });
      return res.status(500).json({ error: "Ошибка сохранения пресета" });
    }
  }

  if (req.method === "DELETE") {
    const rawId = req.query.id;
    const idParam = typeof rawId === "string" ? rawId.trim() : Array.isArray(rawId) && rawId.length > 0 ? String(rawId[0]).trim() : "";
    const id = parseInt(idParam, 10);
    if (!idParam || isNaN(id) || id < 1) return res.status(400).json({ error: "Некорректный id" });
    try {
      const pool = getPool();
      const { rows: presetRows } = await pool.query<{ label: string }>("SELECT label FROM admin_role_presets WHERE id = $1", [id]);
      const label = presetRows[0]?.label ?? String(id);
      const { rowCount } = await pool.query("DELETE FROM admin_role_presets WHERE id = $1", [id]);
      if ((rowCount ?? 0) > 0) {
        await writeAuditLog(pool, { action: "preset_deleted", target_type: "preset", target_id: id, details: { label } });
        return res.status(200).json({ ok: true, deleted: true });
      }
      return res.status(404).json({ error: "Пресет не найден", deleted: false });
    } catch (e: unknown) {
      console.error("admin-presets DELETE error:", e);
      return res.status(500).json({ error: "Ошибка удаления пресета" });
    }
  }

  res.setHeader("Allow", "GET, POST, DELETE");
  return res.status(405).json({ error: "Method not allowed" });
}
