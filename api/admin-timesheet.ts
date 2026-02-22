import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { verifyAdminToken, getAdminTokenFromRequest, getAdminTokenPayload } from "../lib/adminAuth.js";
import { withErrorLog } from "../lib/requestErrorLog.js";

function parseMonth(value: unknown): { month: string; start: string; next: string } | null {
  const month = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  const [yRaw, mRaw] = month.split("-");
  const year = Number(yRaw);
  const monthNum = Number(mRaw);
  if (!Number.isFinite(year) || !Number.isFinite(monthNum) || monthNum < 1 || monthNum > 12) return null;
  const start = `${year}-${String(monthNum).padStart(2, "0")}-01`;
  const nextDate = new Date(year, monthNum, 1);
  const next = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, "0")}-01`;
  return { month, start, next };
}

async function ensureTimesheetTable(pool: ReturnType<typeof getPool>) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS employee_timesheet_entries (
      id bigserial PRIMARY KEY,
      employee_id bigint NOT NULL REFERENCES registered_users(id) ON DELETE CASCADE,
      work_date date NOT NULL,
      value_text text NOT NULL DEFAULT '',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (employee_id, work_date)
    )
  `);
  await pool.query("CREATE INDEX IF NOT EXISTS employee_timesheet_entries_work_date_idx ON employee_timesheet_entries(work_date)");
  await pool.query("CREATE INDEX IF NOT EXISTS employee_timesheet_entries_employee_id_idx ON employee_timesheet_entries(employee_id)");
}

async function handler(req: VercelRequest, res: VercelResponse) {
  const token = getAdminTokenFromRequest(req);
  if (!verifyAdminToken(token)) return res.status(401).json({ error: "Требуется авторизация админа" });
  if (!getAdminTokenPayload(token)?.superAdmin) return res.status(403).json({ error: "Доступ только для супер-администратора" });

  const pool = getPool();
  await ensureTimesheetTable(pool);

  if (req.method === "GET") {
    const monthInfo = parseMonth(req.query?.month);
    if (!monthInfo) return res.status(400).json({ error: "Укажите месяц в формате YYYY-MM" });

    const { rows } = await pool.query<{ employee_id: number; work_date: string; value_text: string }>(
      `SELECT employee_id, work_date::text as work_date, value_text
       FROM employee_timesheet_entries
       WHERE work_date >= $1::date AND work_date < $2::date`,
      [monthInfo.start, monthInfo.next]
    );

    const entries: Record<string, string> = {};
    for (const row of rows) {
      entries[`${row.employee_id}__${row.work_date}`] = String(row.value_text || "");
    }
    return res.status(200).json({ ok: true, month: monthInfo.month, entries });
  }

  if (req.method === "PUT") {
    let body: any = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        return res.status(400).json({ error: "Invalid JSON" });
      }
    }
    const monthInfo = parseMonth(body?.month);
    if (!monthInfo) return res.status(400).json({ error: "Укажите месяц в формате YYYY-MM" });
    const employeeId = Number(body?.employeeId);
    const date = String(body?.date || "").trim();
    const value = String(body?.value || "").trim();

    if (!Number.isFinite(employeeId) || employeeId <= 0) return res.status(400).json({ error: "employeeId обязателен" });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: "date обязателен в формате YYYY-MM-DD" });
    if (!date.startsWith(`${monthInfo.month}-`)) return res.status(400).json({ error: "Дата не соответствует выбранному месяцу" });

    if (value === "") {
      await pool.query("DELETE FROM employee_timesheet_entries WHERE employee_id = $1 AND work_date = $2::date", [employeeId, date]);
      return res.status(200).json({ ok: true });
    }

    await pool.query(
      `INSERT INTO employee_timesheet_entries(employee_id, work_date, value_text)
       VALUES ($1, $2::date, $3)
       ON CONFLICT (employee_id, work_date)
       DO UPDATE SET value_text = EXCLUDED.value_text, updated_at = now()`,
      [employeeId, date, value]
    );
    return res.status(200).json({ ok: true });
  }

  res.setHeader("Allow", "GET, PUT");
  return res.status(405).json({ error: "Method not allowed" });
}

export default withErrorLog(handler);

