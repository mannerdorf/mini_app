import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { computeTimesheetEntryAmount } from "./_timesheet-amount.js";

function mapDepartmentToPnl(raw?: string | null): { department: string; logisticsStage: string | null } {
  const source = String(raw ?? "").trim();
  const upper = source.toUpperCase();
  const known = new Set(["LOGISTICS_MSK", "LOGISTICS_KGD", "ADMINISTRATION", "DIRECTION", "IT", "SALES", "SERVICE", "GENERAL"]);
  if (known.has(upper)) return { department: upper, logisticsStage: null };
  const s = source.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
  if (s.includes("забор")) return { department: "LOGISTICS_MSK", logisticsStage: "PICKUP" };
  const hasMsk = s.includes("москва") || s.includes("мск");
  const hasKgd = s.includes("калининград") || s.includes("кгд");
  if (s.includes("склад") && hasMsk && !hasKgd) return { department: "LOGISTICS_MSK", logisticsStage: "DEPARTURE_WAREHOUSE" };
  if (s.includes("склад отправления")) return { department: "LOGISTICS_MSK", logisticsStage: "DEPARTURE_WAREHOUSE" };
  if (s.includes("магистрал")) return { department: "LOGISTICS_MSK", logisticsStage: "MAINLINE" };
  if (s.includes("склад") && hasKgd) return { department: "LOGISTICS_KGD", logisticsStage: "ARRIVAL_WAREHOUSE" };
  if (s.includes("склад получения")) return { department: "LOGISTICS_KGD", logisticsStage: "ARRIVAL_WAREHOUSE" };
  if (s.includes("последняя миля") || s.includes("last mile") || (s.includes("миля") && hasKgd)) return { department: "LOGISTICS_KGD", logisticsStage: "LAST_MILE" };
  if (s.includes("администрац") || s.includes("управляющ")) return { department: "ADMINISTRATION", logisticsStage: null };
  if (s.includes("дирекц")) return { department: "DIRECTION", logisticsStage: null };
  if (s.includes("продаж")) return { department: "SALES", logisticsStage: null };
  if (s.includes("сервис")) return { department: "SERVICE", logisticsStage: null };
  if (s === "it" || s.includes(" айти") || s.includes("it ")) return { department: "IT", logisticsStage: null };
  return { department: source || "GENERAL", logisticsStage: null };
}

function mapPrimaryDepartmentCandidate(raw?: string | null): { department: string; logisticsStage: string | null } {
  const source = String(raw ?? "").trim();
  if (!source) return { department: "GENERAL", logisticsStage: null };
  const primary = source.split(",").map((x) => x.trim()).find(Boolean) || source;
  return mapDepartmentToPnl(primary);
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const month = req.query.month as string;
  const year = req.query.year as string;
  const department = req.query.department as string;
  const logisticsStage = (req.query.logisticsStage as string) || "";

  if (!month || !year || !department) {
    return res.status(400).json({ error: "month, year, department required" });
  }

  const period = `${year}-${String(Number(month)).padStart(2, "0")}-01`;
  const nextPeriod = (() => {
    const y = Number(year);
    const m = Number(month);
    const d = new Date(y, m, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  })();

  try {
    const pool = getPool();
    const result = await pool.query(
      `SELECT e.employee_id AS "employeeId",
              e.work_date::text AS "workDate",
              e.value_text AS "valueText",
              e.amount AS "storedAmount",
              ru.department AS "employeeDepartment",
              coalesce(ru.full_name, ru.login, '') AS "employeeName",
              ru.accrual_type AS "accrualType",
              ru.accrual_rate AS "accrualRate",
              sro.shift_rate AS "shiftRateOverride"
       FROM employee_timesheet_entries e
       JOIN registered_users ru ON ru.id = e.employee_id
       LEFT JOIN employee_timesheet_shift_rate_overrides sro
         ON sro.employee_id = e.employee_id
        AND sro.work_date = e.work_date
       WHERE e.work_date >= $1::date
         AND e.work_date < $2::date`,
      [period, nextPeriod]
    );

    const targetDep = String(department).trim();
    const targetStage = logisticsStage === "null" || logisticsStage === "" ? null : String(logisticsStage).trim();

    const accruals: Array<{
      employeeId: number;
      employeeName: string;
      workDate: string;
      valueText: string;
      amount: number;
      employeeDepartment: string;
    }> = [];

    for (const r of result.rows) {
      let amountAbs = Number(r.storedAmount);
      if (!Number.isFinite(amountAbs) || amountAbs <= 0) {
        const accrualType = normalizeAccrualType(r.accrualType) as "hour" | "shift" | "month";
        const rate = Number(r.accrualRate || 0);
        const valueText = String(r.valueText || "");
        const override = Number.isFinite(Number(r.shiftRateOverride)) ? Number(r.shiftRateOverride) : null;
        amountAbs = computeTimesheetEntryAmount(accrualType, rate, valueText, override);
      }
      if (!(amountAbs > 0)) continue;

      const primary = mapPrimaryDepartmentCandidate(r.employeeDepartment);
      let matched = false;
      if (primary.department === targetDep) {
        if (targetStage == null) {
          matched = primary.logisticsStage == null;
        } else if (primary.logisticsStage === targetStage) {
          matched = true;
        } else if (primary.logisticsStage == null) {
          matched = true;
        }
      }
      if (!matched) continue;

      accruals.push({
        employeeId: r.employeeId,
        employeeName: String(r.employeeName || "").trim() || `Сотрудник #${r.employeeId}`,
        workDate: String(r.workDate || "").slice(0, 10),
        valueText,
        amount: Number(Number(amountAbs).toFixed(2)),
        employeeDepartment: String(r.employeeDepartment || "").trim() || "",
      });
    }

    accruals.sort((a, b) => {
      const dc = a.employeeName.localeCompare(b.employeeName);
      if (dc !== 0) return dc;
      return a.workDate.localeCompare(b.workDate);
    });

    return res.json({ accruals });
  } catch (e) {
    console.error("pnl-timesheet-accruals:", e);
    return res.status(500).json({ error: "Ошибка загрузки начислений" });
  }
}
