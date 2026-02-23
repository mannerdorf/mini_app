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

function normalizeAccrualType(value: unknown): "hour" | "shift" {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "hour";
  if (raw === "shift" || raw === "смена") return "shift";
  if (raw === "hour" || raw === "часы" || raw === "час") return "hour";
  return raw.includes("shift") || raw.includes("смен") ? "shift" : "hour";
}

function normalizeShiftMark(rawValue: string): "Я" | "ПР" | "Б" | "ОГ" | "ОТ" | "УВ" | "" {
  const raw = String(rawValue || "").trim().toUpperCase();
  if (!raw) return "";
  if (raw === "Я" || raw === "ПР" || raw === "Б" || raw === "ОГ" || raw === "ОТ" || raw === "УВ") return raw as any;
  if (raw === "С" || raw === "C" || raw === "1" || raw === "TRUE" || raw === "ON" || raw === "YES") return "Я";
  if (raw.includes("СМЕН") || raw.includes("SHIFT")) return "Я";
  return "";
}

function parseHoursValue(rawValue: string): number {
  const raw = String(rawValue || "").trim();
  if (!raw) return 0;
  const hhmm = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (hhmm) {
    const h = Number(hhmm[1]);
    const m = Number(hhmm[2]);
    if (Number.isFinite(h) && Number.isFinite(m) && m >= 0 && m < 60) return h + m / 60;
  }
  const parsed = Number(raw.replace(",", ".").replace(/[^\d.]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeCooperationType(value: unknown): "self_employed" | "ip" | "staff" {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "staff";
  if (raw === "self_employed" || raw === "self-employed" || raw.includes("самозан")) return "self_employed";
  if (raw === "ip" || raw.includes("ип")) return "ip";
  return "staff";
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
  await pool.query(`
    CREATE TABLE IF NOT EXISTS employee_timesheet_payment_marks (
      id bigserial PRIMARY KEY,
      employee_id bigint NOT NULL REFERENCES registered_users(id) ON DELETE CASCADE,
      work_date date NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (employee_id, work_date)
    )
  `);
  await pool.query("CREATE INDEX IF NOT EXISTS employee_timesheet_payment_marks_work_date_idx ON employee_timesheet_payment_marks(work_date)");
  await pool.query("CREATE INDEX IF NOT EXISTS employee_timesheet_payment_marks_employee_id_idx ON employee_timesheet_payment_marks(employee_id)");
  await pool.query("ALTER TABLE registered_users ADD COLUMN IF NOT EXISTS cooperation_type text");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS employee_timesheet_payouts (
      id bigserial PRIMARY KEY,
      employee_id bigint NOT NULL REFERENCES registered_users(id) ON DELETE CASCADE,
      payout_date date NOT NULL DEFAULT current_date,
      period_month date NOT NULL,
      period_from date NOT NULL,
      period_to date NOT NULL,
      amount numeric(12,2) NOT NULL DEFAULT 0,
      tax_amount numeric(12,2) NOT NULL DEFAULT 0,
      cooperation_type text,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await pool.query("CREATE INDEX IF NOT EXISTS employee_timesheet_payouts_employee_idx ON employee_timesheet_payouts(employee_id)");
  await pool.query("CREATE INDEX IF NOT EXISTS employee_timesheet_payouts_period_month_idx ON employee_timesheet_payouts(period_month)");
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
    const paymentRes = await pool.query<{ employee_id: number; work_date: string }>(
      `SELECT employee_id, work_date::text as work_date
       FROM employee_timesheet_payment_marks
       WHERE work_date >= $1::date AND work_date < $2::date`,
      [monthInfo.start, monthInfo.next]
    );
    const paymentMarks: Record<string, boolean> = {};
    for (const row of paymentRes.rows) {
      paymentMarks[`${row.employee_id}__${row.work_date}`] = true;
    }
    const payoutRes = await pool.query<{
      id: number;
      employee_id: number;
      payout_date: string;
      period_from: string;
      period_to: string;
      amount: number;
      tax_amount: number;
      cooperation_type: string | null;
      created_at: string;
    }>(
      `SELECT id, employee_id, payout_date::text as payout_date, period_from::text as period_from, period_to::text as period_to,
              amount, tax_amount, cooperation_type, created_at::text as created_at
       FROM employee_timesheet_payouts
       WHERE period_month = $1::date
       ORDER BY created_at DESC`,
      [monthInfo.start]
    );
    const payoutsByEmployee: Record<string, Array<{
      id: number; payoutDate: string; periodFrom: string; periodTo: string; amount: number; taxAmount: number; cooperationType: string; createdAt: string;
    }>> = {};
    for (const row of payoutRes.rows) {
      const k = String(row.employee_id);
      payoutsByEmployee[k] = payoutsByEmployee[k] || [];
      payoutsByEmployee[k].push({
        id: row.id,
        payoutDate: row.payout_date,
        periodFrom: row.period_from,
        periodTo: row.period_to,
        amount: Number(row.amount || 0),
        taxAmount: Number(row.tax_amount || 0),
        cooperationType: normalizeCooperationType(row.cooperation_type),
        createdAt: row.created_at,
      });
    }
    return res.status(200).json({ ok: true, month: monthInfo.month, entries, paymentMarks, payoutsByEmployee });
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

  if (req.method === "PATCH") {
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
    const paid = Boolean(body?.paid);
    if (!Number.isFinite(employeeId) || employeeId <= 0) return res.status(400).json({ error: "employeeId обязателен" });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: "date обязателен в формате YYYY-MM-DD" });
    if (!date.startsWith(`${monthInfo.month}-`)) return res.status(400).json({ error: "Дата не соответствует выбранному месяцу" });

    if (!paid) {
      await pool.query("DELETE FROM employee_timesheet_payment_marks WHERE employee_id = $1 AND work_date = $2::date", [employeeId, date]);
      return res.status(200).json({ ok: true });
    }
    await pool.query(
      `INSERT INTO employee_timesheet_payment_marks(employee_id, work_date)
       VALUES ($1, $2::date)
       ON CONFLICT (employee_id, work_date)
       DO UPDATE SET updated_at = now()`,
      [employeeId, date]
    );
    return res.status(200).json({ ok: true });
  }

  if (req.method === "POST") {
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
    if (!Number.isFinite(employeeId) || employeeId <= 0) return res.status(400).json({ error: "employeeId обязателен" });

    const employeeRes = await pool.query<{ accrual_type: string | null; accrual_rate: number | null; cooperation_type: string | null }>(
      `SELECT accrual_type, accrual_rate, cooperation_type
       FROM registered_users
       WHERE id = $1
       LIMIT 1`,
      [employeeId]
    );
    const employee = employeeRes.rows[0];
    if (!employee) return res.status(404).json({ error: "Сотрудник не найден" });
    const accrualType = normalizeAccrualType(employee.accrual_type);
    const rate = Number(employee.accrual_rate || 0);
    const cooperationType = normalizeCooperationType(employee.cooperation_type);

    const marksRes = await pool.query<{ work_date: string }>(
      `SELECT work_date::text as work_date
       FROM employee_timesheet_payment_marks
       WHERE employee_id = $1
         AND work_date >= $2::date
         AND work_date < $3::date
       ORDER BY work_date`,
      [employeeId, monthInfo.start, monthInfo.next]
    );
    if (marksRes.rows.length === 0) return res.status(400).json({ error: "Не выбраны дни к выплате" });
    const markedDates = marksRes.rows.map((r) => r.work_date);
    const periodFrom = markedDates[0];
    const periodTo = markedDates[markedDates.length - 1];

    const entriesRes = await pool.query<{ work_date: string; value_text: string }>(
      `SELECT work_date::text as work_date, value_text
       FROM employee_timesheet_entries
       WHERE employee_id = $1
         AND work_date >= $2::date
         AND work_date <= $3::date`,
      [employeeId, periodFrom, periodTo]
    );
    const entryByDate = new Map<string, string>();
    for (const row of entriesRes.rows) entryByDate.set(row.work_date, String(row.value_text || ""));

    let units = 0;
    if (accrualType === "shift") {
      for (const date of markedDates) {
        if (normalizeShiftMark(entryByDate.get(date) || "") === "Я") units += 1;
      }
    } else {
      for (const date of markedDates) {
        units += parseHoursValue(entryByDate.get(date) || "");
      }
    }
    const amount = Number((units * rate).toFixed(2));
    const taxAmount = cooperationType === "ip" || cooperationType === "self_employed"
      ? Number((amount / 0.94 - amount).toFixed(2))
      : 0;

    const inserted = await pool.query<{ id: number; payout_date: string; created_at: string }>(
      `INSERT INTO employee_timesheet_payouts(employee_id, payout_date, period_month, period_from, period_to, amount, tax_amount, cooperation_type)
       VALUES ($1, current_date, $2::date, $3::date, $4::date, $5, $6, $7)
       RETURNING id, payout_date::text as payout_date, created_at::text as created_at`,
      [employeeId, monthInfo.start, periodFrom, periodTo, amount, taxAmount, cooperationType]
    );

    await pool.query(
      `DELETE FROM employee_timesheet_payment_marks
       WHERE employee_id = $1
         AND work_date >= $2::date
         AND work_date < $3::date`,
      [employeeId, monthInfo.start, monthInfo.next]
    );

    return res.status(200).json({
      ok: true,
      payout: {
        id: inserted.rows[0]?.id,
        payoutDate: inserted.rows[0]?.payout_date,
        periodFrom,
        periodTo,
        amount,
        taxAmount,
        cooperationType,
        createdAt: inserted.rows[0]?.created_at,
      },
      clearedMarks: markedDates.map((d) => `${employeeId}__${d}`),
    });
  }

  res.setHeader("Allow", "GET, PUT, PATCH, POST");
  return res.status(405).json({ error: "Method not allowed" });
}

export default withErrorLog(handler);

