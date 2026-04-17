import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { verifyAdminToken, getAdminTokenFromRequest, getAdminTokenPayload } from "../lib/adminAuth.js";
import { hashPassword, generatePassword } from "../lib/passwordUtils.js";
import { withErrorLog } from "../lib/requestErrorLog.js";
import { initRequestContext } from "./_lib/observability.js";
import {
  ensureEmployeeAccrualRateHistoryTable,
  getAccrualRateAtDate,
  parseIsoDateOnly,
  syncRegisteredUserAccrualRateFromHistory,
  todayDateMoscow,
} from "./_employee-accrual-rate-history.js";

const EMPLOYEE_ROLES = new Set(["employee", "department_head"]);
const ACCRUAL_TYPES = new Set(["hour", "shift", "month"]);
const COOPERATION_TYPES = new Set(["self_employed", "ip", "staff"]);

type ColumnName = { column_name: string };

function parseMonth(value: unknown): { month: string; start: string } | null {
  const month = String(Array.isArray(value) ? value[0] : value ?? "").trim();
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  const [yRaw, mRaw] = month.split("-");
  const year = Number(yRaw);
  const monthNum = Number(mRaw);
  if (!Number.isFinite(year) || !Number.isFinite(monthNum) || monthNum < 1 || monthNum > 12) return null;
  const start = `${year}-${String(monthNum).padStart(2, "0")}-01`;
  return { month, start };
}

function normalizeAccrualType(value: unknown): "hour" | "shift" | "month" {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "hour";
  if (raw === "shift" || raw === "смена") return "shift";
  if (raw === "month" || raw === "месяц" || raw === "monthly") return "month";
  if (raw === "hour" || raw === "часы" || raw === "час") return "hour";
  if (raw.includes("month") || raw.includes("месяц")) return "month";
  return raw.includes("shift") || raw.includes("смен") ? "shift" : "hour";
}

function normalizeCooperationType(value: unknown): "self_employed" | "ip" | "staff" {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "staff";
  if (raw === "self_employed" || raw === "self-employed" || raw.includes("самозан")) return "self_employed";
  if (raw === "ip" || raw.includes("ип")) return "ip";
  if (raw === "staff" || raw.includes("штат")) return "staff";
  return "staff";
}

async function upsertEmployeeRateHistoryRow(
  pool: ReturnType<typeof getPool>,
  employeeId: number,
  effectiveFrom: string,
  newRate: number,
  legacyFallback: number | null
): Promise<boolean> {
  const prior = await getAccrualRateAtDate(pool, employeeId, effectiveFrom, legacyFallback);
  if (Math.abs(prior - newRate) < 0.005) return false;
  await pool.query(
    `INSERT INTO employee_accrual_rate_history (employee_id, effective_from, accrual_rate)
     VALUES ($1, $2::date, $3::numeric)
     ON CONFLICT (employee_id, effective_from) DO UPDATE SET accrual_rate = EXCLUDED.accrual_rate`,
    [employeeId, effectiveFrom, Number(newRate.toFixed(2))]
  );
  return true;
}

async function ensureEmployeeColumns(pool: ReturnType<typeof getPool>) {
  const readCols = async () => {
    const { rows } = await pool.query<ColumnName>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'registered_users'`
    );
    return new Set(rows.map((r) => r.column_name));
  };
  let cols = await readCols();
  if (!cols.has("position")) {
    await pool.query("ALTER TABLE registered_users ADD COLUMN IF NOT EXISTS position text");
  }
  if (!cols.has("accrual_type")) {
    await pool.query("ALTER TABLE registered_users ADD COLUMN IF NOT EXISTS accrual_type text");
  }
  if (!cols.has("accrual_rate")) {
    await pool.query("ALTER TABLE registered_users ADD COLUMN IF NOT EXISTS accrual_rate numeric(12,2)");
  }
  if (!cols.has("cooperation_type")) {
    await pool.query("ALTER TABLE registered_users ADD COLUMN IF NOT EXISTS cooperation_type text");
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS employee_timesheet_month_exclusions (
      id bigserial PRIMARY KEY,
      employee_id bigint NOT NULL REFERENCES registered_users(id) ON DELETE CASCADE,
      month_key date NOT NULL,
      created_by_user_id bigint REFERENCES registered_users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (employee_id, month_key)
    )
  `);
  await pool.query("CREATE INDEX IF NOT EXISTS employee_timesheet_month_exclusions_month_idx ON employee_timesheet_month_exclusions(month_key)");
  await ensureEmployeeAccrualRateHistoryTable(pool);
  cols = await readCols();
  const has = cols.has("full_name") && cols.has("department") && cols.has("employee_role");
  const hasPosition = cols.has("position");
  const hasAccrualType = cols.has("accrual_type");
  const hasAccrualRate = cols.has("accrual_rate");
  const hasCooperationType = cols.has("cooperation_type");
  return { cols, has, hasPosition, hasAccrualType, hasAccrualRate, hasCooperationType };
}

async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "admin-employee-directory");
  const token = getAdminTokenFromRequest(req);
  if (!verifyAdminToken(token)) {
    return res.status(401).json({ error: "Требуется авторизация админа", request_id: ctx.requestId });
  }
  if (!getAdminTokenPayload(token)?.superAdmin) {
    return res.status(403).json({ error: "Доступ только для супер-администратора", request_id: ctx.requestId });
  }

  const pool = getPool();
  const columnsInfo = await ensureEmployeeColumns(pool);
  if (!columnsInfo.has) {
    return res.status(400).json({ error: "Нужна миграция 027_registered_users_employee_directory.sql", request_id: ctx.requestId });
  }

  if (req.method === "GET") {
    const rateHistoryFor = parseInt(String(req.query?.rate_history_for || "0"), 10);
    if (rateHistoryFor > 0) {
      const { rows } = await pool.query<{
        id: string;
        effective_from: string;
        accrual_rate: string;
        created_at: string;
      }>(
        `SELECT id::text, effective_from::text, accrual_rate::text, created_at::text
         FROM employee_accrual_rate_history
         WHERE employee_id = $1
         ORDER BY effective_from DESC, id DESC`,
        [rateHistoryFor]
      );
      return res.status(200).json({
        ok: true,
        rate_history: rows.map((r) => ({
          id: Number(r.id),
          effective_from: String(r.effective_from || "").slice(0, 10),
          accrual_rate: Number(r.accrual_rate || 0),
          created_at: r.created_at,
        })),
        request_id: ctx.requestId,
      });
    }

    const monthInfo = parseMonth(req.query?.month);
    const monthFilterSql = monthInfo
      ? `AND id NOT IN (
          SELECT employee_id
          FROM employee_timesheet_month_exclusions
          WHERE month_key = $1::date
        )`
      : "";
    const { rows } = await pool.query<{
      id: number;
      login: string;
      full_name: string | null;
      department: string | null;
      position: string | null;
      accrual_type: "hour" | "shift" | "month" | null;
      accrual_rate: number | null;
      cooperation_type: "self_employed" | "ip" | "staff" | null;
      employee_role: "employee" | "department_head" | null;
      active: boolean;
      invited_with_preset_label: string | null;
      created_at: string;
    }>(
      `SELECT id, login, full_name, department, ${
        columnsInfo.hasPosition ? "position" : "null::text as position"
      }, ${columnsInfo.hasAccrualType ? "accrual_type" : "null::text as accrual_type"}, ${
        columnsInfo.hasAccrualRate ? "accrual_rate" : "null::numeric as accrual_rate"
      }, ${columnsInfo.hasCooperationType ? "cooperation_type" : "null::text as cooperation_type"}, employee_role, active, invited_with_preset_label, created_at
       FROM registered_users
       WHERE (coalesce(trim(full_name), '') <> '' OR employee_role is not null OR invited_by_user_id is not null)
       ${monthFilterSql}
       ORDER BY created_at DESC`
      ,
      monthInfo ? [monthInfo.start] : []
    );
    return res.status(200).json({
      ok: true,
      items: rows.map((r) => ({
        ...r,
        accrual_type: normalizeAccrualType(r.accrual_type),
        cooperation_type: normalizeCooperationType(r.cooperation_type || "staff"),
      })),
      request_id: ctx.requestId,
    });
  }

  if (req.method === "POST") {
    let body: any = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch { return res.status(400).json({ error: "Invalid JSON" }); }
    }
    const emailRaw = String(body?.email || "").trim();
    const email = emailRaw.toLowerCase();
    const fullName = String(body?.full_name || "").trim();
    const department = String(body?.department || "").trim();
    const position = String(body?.position || "").trim();
    const accrualType = normalizeAccrualType(body?.accrual_type || "hour");
    const accrualRateRaw = body?.accrual_rate;
    const accrualRate = Number(accrualRateRaw);
    const cooperationType = normalizeCooperationType(body?.cooperation_type || "staff");
    const employeeRole = String(body?.employee_role || "employee").trim();
    if (!fullName) return res.status(400).json({ error: "Укажите ФИО" });
    if (!department) return res.status(400).json({ error: "Укажите структурное подразделение" });
    if (!EMPLOYEE_ROLES.has(employeeRole)) return res.status(400).json({ error: "Некорректная роль сотрудника" });
    if (!ACCRUAL_TYPES.has(accrualType)) return res.status(400).json({ error: "Некорректный тип начисления" });
    if (!COOPERATION_TYPES.has(cooperationType)) return res.status(400).json({ error: "Некорректный тип сотрудничества" });
    if (!Number.isFinite(accrualRate) || accrualRate < 0) return res.status(400).json({ error: "Укажите корректную ставку начисления" });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Некорректный email" });

    try {
      // If email is provided, assign attributes to an existing account.
      if (email) {
        const existingUser = await pool.query<{
          id: number;
          permissions: Record<string, boolean> | null;
          accrual_rate: number | null;
        }>(
          `SELECT id, permissions${columnsInfo.hasAccrualRate ? ", accrual_rate" : ", null::numeric as accrual_rate"}
           FROM registered_users WHERE lower(trim(login)) = $1`,
          [email]
        );
        const user = existingUser.rows[0];
        if (!user) {
          return res.status(400).json({ error: "Пользователь с таким email не найден" });
        }
        const userRowAccrualRate = columnsInfo.hasAccrualRate ? user.accrual_rate : null;

        const currentPermissions =
          user.permissions && typeof user.permissions === "object" ? user.permissions : {};
        const nextPermissions: Record<string, boolean> = {
          ...currentPermissions,
          haulz: true,
          supervisor: employeeRole === "department_head",
        };

        const hasUpdatedAt = columnsInfo.cols.has("updated_at");
        const setParts: string[] = [];
        const params: unknown[] = [];
        const addParam = (value: unknown) => {
          params.push(value);
          return `$${params.length}`;
        };
        setParts.push(`permissions = ${addParam(JSON.stringify(nextPermissions))}`);
        setParts.push(`full_name = ${addParam(fullName)}`);
        setParts.push(`department = ${addParam(department)}`);
        if (columnsInfo.hasPosition) setParts.push(`position = ${addParam(position)}`);
        if (columnsInfo.hasAccrualType) setParts.push(`accrual_type = ${addParam(accrualType)}`);
        if (columnsInfo.hasAccrualRate) setParts.push(`accrual_rate = ${addParam(Number(accrualRate.toFixed(2)))}`);
        if (columnsInfo.hasCooperationType) setParts.push(`cooperation_type = ${addParam(cooperationType)}`);
        setParts.push(`employee_role = ${addParam(employeeRole)}`);
        if (hasUpdatedAt) setParts.push("updated_at = now()");
        await pool.query(
          `UPDATE registered_users
           SET ${setParts.join(", ")}
           WHERE id = ${addParam(user.id)}`,
          params
        );

        const eff = parseIsoDateOnly(body?.accrual_rate_effective_from) ?? todayDateMoscow();
        await upsertEmployeeRateHistoryRow(pool, user.id, eff, Number(accrualRate.toFixed(2)), userRowAccrualRate);
        await syncRegisteredUserAccrualRateFromHistory(pool, user.id, userRowAccrualRate);

        return res.status(200).json({ ok: true, id: user.id, mode: "assign_existing", request_id: ctx.requestId });
      }

      // If email is empty, create an internal employee record without mail login.
      const internalLogin = `employee-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@internal.local`;
      const randomPasswordHash = hashPassword(generatePassword(24));
      const permissions: Record<string, boolean> = {
        cms_access: false,
        cargo: false,
        doc_invoices: false,
        doc_acts: false,
        doc_orders: false,
        doc_sendings: false,
        doc_claims: false,
        doc_contracts: false,
        doc_acts_settlement: false,
        doc_tariffs: false,
        haulz: true,
        eor: false,
        chat: false,
        service_mode: false,
        analytics: false,
        supervisor: employeeRole === "department_head",
      };
      const hasUpdatedAt = columnsInfo.cols.has("updated_at");
      const params: unknown[] = [];
      const addParam = (value: unknown) => {
        params.push(value);
        return `$${params.length}`;
      };
      const insertColumns = [
        "login",
        "password_hash",
        "inn",
        "company_name",
        "permissions",
        "financial_access",
        "access_all_inns",
        "active",
        "full_name",
        "department",
      ];
      const insertValues: string[] = [
        addParam(internalLogin),
        addParam(randomPasswordHash),
        addParam(""),
        addParam(""),
        addParam(JSON.stringify(permissions)),
        "false",
        "false",
        "false",
        addParam(fullName),
        addParam(department),
      ];
      if (columnsInfo.hasPosition) {
        insertColumns.push("position");
        insertValues.push(addParam(position));
      }
      if (columnsInfo.hasAccrualType) {
        insertColumns.push("accrual_type");
        insertValues.push(addParam(accrualType));
      }
      if (columnsInfo.hasAccrualRate) {
        insertColumns.push("accrual_rate");
        insertValues.push(addParam(Number(accrualRate.toFixed(2))));
      }
      if (columnsInfo.hasCooperationType) {
        insertColumns.push("cooperation_type");
        insertValues.push(addParam(cooperationType));
      }
      insertColumns.push("employee_role");
      insertValues.push(addParam(employeeRole));
      if (hasUpdatedAt) {
        insertColumns.push("updated_at");
        insertValues.push("now()");
      }
      const { rows } = await pool.query<{ id: number }>(
        `INSERT INTO registered_users (${insertColumns.join(", ")})
         VALUES (${insertValues.join(", ")})
         RETURNING id`,
        params
      );
      const newId = rows[0]?.id;
      if (newId) {
        const eff = parseIsoDateOnly(body?.accrual_rate_effective_from) ?? todayDateMoscow();
        await upsertEmployeeRateHistoryRow(pool, newId, eff, Number(accrualRate.toFixed(2)), null);
        await syncRegisteredUserAccrualRateFromHistory(pool, newId, Number(accrualRate.toFixed(2)));
      }
      return res.status(200).json({ ok: true, id: newId, mode: "create_internal", request_id: ctx.requestId });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || "Ошибка сохранения атрибутов сотрудника", request_id: ctx.requestId });
    }
  }

  if (req.method === "PATCH") {
    const rateHistoryId = parseInt(String(req.query?.rate_history_id || "0"), 10);
    if (rateHistoryId > 0) {
      let rateHistBody: any = req.body;
      if (typeof rateHistBody === "string") {
        try {
          rateHistBody = JSON.parse(rateHistBody);
        } catch {
          return res.status(400).json({ error: "Invalid JSON", request_id: ctx.requestId });
        }
      }
      const newRate = Number(rateHistBody?.accrual_rate);
      if (!Number.isFinite(newRate) || newRate < 0) {
        return res.status(400).json({ error: "Укажите корректную ставку", request_id: ctx.requestId });
      }
      const histRow = await pool.query<{ id: number; employee_id: number; effective_from: string }>(
        `SELECT id, employee_id, effective_from::text
         FROM employee_accrual_rate_history WHERE id = $1`,
        [rateHistoryId]
      );
      const h = histRow.rows[0];
      if (!h) return res.status(404).json({ error: "Запись истории не найдена", request_id: ctx.requestId });

      const oldEff = String(h.effective_from || "").slice(0, 10);
      let newEff = oldEff;
      if (typeof rateHistBody?.effective_from === "string" && String(rateHistBody.effective_from).trim() !== "") {
        const parsed = parseIsoDateOnly(rateHistBody.effective_from);
        if (!parsed) {
          return res.status(400).json({ error: "Дата должна быть в формате YYYY-MM-DD", request_id: ctx.requestId });
        }
        newEff = parsed;
      }

      if (newEff !== oldEff) {
        const clash = await pool.query<{ id: number }>(
          `SELECT id FROM employee_accrual_rate_history
           WHERE employee_id = $1 AND effective_from = $2::date AND id <> $3`,
          [h.employee_id, newEff, rateHistoryId]
        );
        if (clash.rows.length > 0) {
          return res.status(409).json({
            error: "Уже есть ставка с этой датой начала. Удалите или измените другую запись.",
            request_id: ctx.requestId,
          });
        }
      }

      await pool.query(
        `UPDATE employee_accrual_rate_history
         SET effective_from = $1::date, accrual_rate = $2::numeric
         WHERE id = $3`,
        [newEff, Number(newRate.toFixed(2)), rateHistoryId]
      );

      const ruBefore = await pool.query<{ accrual_rate: string | null }>(
        "SELECT accrual_rate::text FROM registered_users WHERE id = $1",
        [h.employee_id]
      );
      const legacy = ruBefore.rows[0]?.accrual_rate == null ? null : Number(ruBefore.rows[0].accrual_rate);
      await syncRegisteredUserAccrualRateFromHistory(pool, h.employee_id, legacy);

      const cur = await pool.query<{ accrual_rate: string | null }>(
        "SELECT accrual_rate::text FROM registered_users WHERE id = $1",
        [h.employee_id]
      );
      const nextAccrual = cur.rows[0]?.accrual_rate == null ? null : Number(cur.rows[0].accrual_rate);
      return res.status(200).json({
        ok: true,
        employee_id: h.employee_id,
        accrual_rate: nextAccrual,
        request_id: ctx.requestId,
      });
    }

    const id = parseInt(String(req.query?.id || "0"), 10);
    if (!id) return res.status(400).json({ error: "id обязателен" });
    let body: any = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch { return res.status(400).json({ error: "Invalid JSON" }); }
    }
    const hasUpdatedAt = columnsInfo.cols.has("updated_at");
    const hasProfileUpdate =
      typeof body?.full_name === "string" ||
      typeof body?.department === "string" ||
      typeof body?.position === "string" ||
      typeof body?.accrual_type === "string" ||
      typeof body?.accrual_rate !== "undefined" ||
      typeof body?.cooperation_type === "string" ||
      typeof body?.employee_role === "string";

    if (typeof body?.active !== "boolean" && !hasProfileUpdate) {
      return res.status(400).json({ error: "Передайте active или атрибуты сотрудника" });
    }

    if (typeof body?.active === "boolean" && !hasProfileUpdate) {
      await pool.query(
        `UPDATE registered_users
         SET active = $1${hasUpdatedAt ? ", updated_at = now()" : ""}
         WHERE id = $2`,
        [body.active, id]
      );
      return res.status(200).json({ ok: true, request_id: ctx.requestId });
    }

    const existing = await pool.query<{
      full_name: string | null;
      department: string | null;
      position: string | null;
      accrual_type: "hour" | "shift" | "month" | null;
      accrual_rate: number | null;
      cooperation_type: "self_employed" | "ip" | "staff" | null;
      employee_role: "employee" | "department_head" | null;
      permissions: Record<string, boolean> | null;
    }>(
      `SELECT full_name, department, ${
        columnsInfo.hasPosition ? "position" : "null::text as position"
      }, ${columnsInfo.hasAccrualType ? "accrual_type" : "null::text as accrual_type"}, ${
        columnsInfo.hasAccrualRate ? "accrual_rate" : "null::numeric as accrual_rate"
      }, ${columnsInfo.hasCooperationType ? "cooperation_type" : "null::text as cooperation_type"}, employee_role, permissions
       FROM registered_users WHERE id = $1`,
      [id]
    );
    if (!existing.rows[0]) return res.status(404).json({ error: "Сотрудник не найден" });
    const row = existing.rows[0];
    const hasFullNameUpdate = typeof body?.full_name === "string";
    const hasDepartmentUpdate = typeof body?.department === "string";
    const hasPositionUpdate = typeof body?.position === "string";
    const hasAccrualTypeUpdate = typeof body?.accrual_type === "string";
    const hasAccrualRateUpdate = typeof body?.accrual_rate !== "undefined";
    const hasCooperationTypeUpdate = typeof body?.cooperation_type === "string";
    const hasRoleUpdate = typeof body?.employee_role === "string";

    const fullName = hasFullNameUpdate ? String(body.full_name).trim() : "";
    const department = hasDepartmentUpdate ? String(body.department).trim() : "";
    const position = hasPositionUpdate ? String(body.position).trim() : "";
    const accrualType = hasAccrualTypeUpdate
      ? normalizeAccrualType(body.accrual_type)
      : normalizeAccrualType(row.accrual_type || "hour");
    const accrualRate = hasAccrualRateUpdate
      ? Number(body.accrual_rate)
      : (row.accrual_rate == null ? 0 : Number(row.accrual_rate));
    const cooperationType = hasCooperationTypeUpdate
      ? normalizeCooperationType(body.cooperation_type)
      : normalizeCooperationType(row.cooperation_type || "staff");
    const employeeRole = hasRoleUpdate
      ? String(body.employee_role).trim()
      : (row.employee_role || (row.permissions?.supervisor ? "department_head" : "employee"));

    if (hasFullNameUpdate && !fullName) return res.status(400).json({ error: "Укажите ФИО" });
    if (hasDepartmentUpdate && !department) return res.status(400).json({ error: "Укажите структурное подразделение" });
    if (!ACCRUAL_TYPES.has(accrualType)) return res.status(400).json({ error: "Некорректный тип начисления" });
    if (!Number.isFinite(accrualRate) || accrualRate < 0) return res.status(400).json({ error: "Укажите корректную ставку начисления" });
    if (!COOPERATION_TYPES.has(cooperationType)) return res.status(400).json({ error: "Некорректный тип сотрудничества" });
    if (!EMPLOYEE_ROLES.has(employeeRole)) return res.status(400).json({ error: "Некорректная роль сотрудника" });
    const currentPermissions =
      row.permissions && typeof row.permissions === "object"
        ? row.permissions
        : {};
    const nextPermissions: Record<string, boolean> = {
      ...currentPermissions,
      haulz: true,
      supervisor: employeeRole === "department_head",
    };

    const setParts: string[] = [];
    const params: unknown[] = [];
    const addParam = (value: unknown) => {
      params.push(value);
      return `$${params.length}`;
    };

    setParts.push(`permissions = ${addParam(JSON.stringify(nextPermissions))}`);
    if (hasFullNameUpdate) setParts.push(`full_name = ${addParam(fullName)}`);
    if (hasDepartmentUpdate) setParts.push(`department = ${addParam(department)}`);
    if (hasPositionUpdate && columnsInfo.hasPosition) setParts.push(`position = ${addParam(position)}`);
    if (hasAccrualTypeUpdate && columnsInfo.hasAccrualType) setParts.push(`accrual_type = ${addParam(accrualType)}`);
    if (hasAccrualRateUpdate && columnsInfo.hasAccrualRate) {
      const eff = parseIsoDateOnly(body?.accrual_rate_effective_from) ?? todayDateMoscow();
      await upsertEmployeeRateHistoryRow(pool, id, eff, Number(accrualRate.toFixed(2)), row.accrual_rate);
    }
    if (hasCooperationTypeUpdate && columnsInfo.hasCooperationType) setParts.push(`cooperation_type = ${addParam(cooperationType)}`);
    if (hasRoleUpdate) setParts.push(`employee_role = ${addParam(employeeRole)}`);
    if (hasUpdatedAt) setParts.push("updated_at = now()");

    await pool.query(
      `UPDATE registered_users
       SET ${setParts.join(", ")}
       WHERE id = ${addParam(id)}`,
      params
    );
    let nextAccrualRate: number | undefined;
    if (hasAccrualRateUpdate && columnsInfo.hasAccrualRate) {
      await syncRegisteredUserAccrualRateFromHistory(pool, id, row.accrual_rate);
      const cur = await pool.query<{ accrual_rate: string | null }>(
        "SELECT accrual_rate::text FROM registered_users WHERE id = $1",
        [id]
      );
      nextAccrualRate = cur.rows[0]?.accrual_rate == null ? undefined : Number(cur.rows[0].accrual_rate);
    }
    return res.status(200).json({
      ok: true,
      ...(nextAccrualRate !== undefined ? { accrual_rate: nextAccrualRate } : {}),
      request_id: ctx.requestId,
    });
  }

  if (req.method === "DELETE") {
    const rateHistoryId = parseInt(String(req.query?.rate_history_id || "0"), 10);
    if (rateHistoryId > 0) {
      const employeeIdFromQuery = parseInt(String(req.query?.employee_id || "0"), 10);
      const histRow = await pool.query<{ employee_id: number }>(
        "SELECT employee_id FROM employee_accrual_rate_history WHERE id = $1",
        [rateHistoryId]
      );
      const h = histRow.rows[0];
      if (!h) return res.status(404).json({ error: "Запись истории не найдена", request_id: ctx.requestId });
      if (employeeIdFromQuery > 0 && employeeIdFromQuery !== h.employee_id) {
        return res.status(400).json({ error: "Несовпадение сотрудника", request_id: ctx.requestId });
      }

      const ruBefore = await pool.query<{ accrual_rate: string | null }>(
        "SELECT accrual_rate::text FROM registered_users WHERE id = $1",
        [h.employee_id]
      );
      const legacy = ruBefore.rows[0]?.accrual_rate == null ? null : Number(ruBefore.rows[0].accrual_rate);

      await pool.query("DELETE FROM employee_accrual_rate_history WHERE id = $1", [rateHistoryId]);
      await syncRegisteredUserAccrualRateFromHistory(pool, h.employee_id, legacy);

      const cur = await pool.query<{ accrual_rate: string | null }>(
        "SELECT accrual_rate::text FROM registered_users WHERE id = $1",
        [h.employee_id]
      );
      const nextAccrual = cur.rows[0]?.accrual_rate == null ? null : Number(cur.rows[0].accrual_rate);
      return res.status(200).json({
        ok: true,
        employee_id: h.employee_id,
        accrual_rate: nextAccrual,
        request_id: ctx.requestId,
      });
    }

    const id = parseInt(String(req.query?.id || "0"), 10);
    if (!id) return res.status(400).json({ error: "id обязателен" });
    const existing = await pool.query<{ permissions: Record<string, boolean> | null }>(
      "SELECT permissions FROM registered_users WHERE id = $1",
      [id]
    );
    const row = existing.rows[0];
    if (!row) return res.status(404).json({ error: "Сотрудник не найден" });

    await pool.query("DELETE FROM employee_accrual_rate_history WHERE employee_id = $1", [id]);

    const currentPermissions =
      row.permissions && typeof row.permissions === "object" ? row.permissions : {};
    const nextPermissions: Record<string, boolean> = {
      ...currentPermissions,
      haulz: false,
      eor: false,
      supervisor: false,
    };

    const hasUpdatedAt = columnsInfo.cols.has("updated_at");
    const hasInvitedByUserId = columnsInfo.cols.has("invited_by_user_id");
    const hasInvitedPresetLabel = columnsInfo.cols.has("invited_with_preset_label");
    const setParts: string[] = [];
    const params: unknown[] = [];
    const addParam = (value: unknown) => {
      params.push(value);
      return `$${params.length}`;
    };

    setParts.push(`permissions = ${addParam(JSON.stringify(nextPermissions))}`);
    setParts.push("full_name = null");
    setParts.push("department = null");
    setParts.push("employee_role = null");
    if (columnsInfo.hasPosition) setParts.push("position = null");
    if (columnsInfo.hasAccrualType) setParts.push("accrual_type = null");
    if (columnsInfo.hasAccrualRate) setParts.push("accrual_rate = null");
    if (columnsInfo.hasCooperationType) setParts.push("cooperation_type = null");
    if (hasInvitedByUserId) setParts.push("invited_by_user_id = null");
    if (hasInvitedPresetLabel) setParts.push("invited_with_preset_label = null");
    if (hasUpdatedAt) setParts.push("updated_at = now()");

    await pool.query(
      `UPDATE registered_users
       SET ${setParts.join(", ")}
       WHERE id = ${addParam(id)}`,
      params
    );

    return res.status(200).json({ ok: true, request_id: ctx.requestId });
  }

  res.setHeader("Allow", "GET, POST, PATCH, DELETE");
  return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
}

export default withErrorLog(handler);
