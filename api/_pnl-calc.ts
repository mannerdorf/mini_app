import type { Pool } from "pg";
import { startOfMonth, endOfMonth, subMonths } from "date-fns";

export interface FilterParams {
  from?: string;
  to?: string;
  direction?: string;
  transportType?: string;
}

export interface PnLData {
  revenue: number;
  cogs: number;
  grossProfit: number;
  opex: number;
  ebitda: number;
  ebitdaPercent: number;
  capex: number;
  netAfterCapex: number;
  belowEbitda: number;
  creditPayments: number;
}

function buildDateWhere(
  col: string,
  f: { dateFrom?: Date; dateTo?: Date },
  params: unknown[],
  idx: { v: number }
): string[] {
  const conds: string[] = [];
  if (f.dateFrom) {
    conds.push(`${col} >= $${idx.v}`);
    params.push(f.dateFrom.toISOString());
    idx.v++;
  }
  if (f.dateTo) {
    conds.push(`${col} <= $${idx.v}`);
    params.push(f.dateTo.toISOString());
    idx.v++;
  }
  return conds;
}

function parseFilter(p: FilterParams) {
  return {
    dateFrom: p.from ? new Date(p.from) : undefined,
    dateTo: p.to ? new Date(p.to) : undefined,
    direction: p.direction && p.direction !== "all" ? p.direction : undefined,
    transportType:
      p.transportType && p.transportType !== "all"
        ? p.transportType
        : undefined,
  };
}

async function opsSum(
  pool: Pool,
  type: string,
  f: ReturnType<typeof parseFilter>
): Promise<number> {
  const params: unknown[] = [type];
  const idx = { v: 2 };
  const conds = ["operation_type = $1"];
  conds.push(...buildDateWhere("date", f, params, idx));
  if (f.direction) {
    conds.push(`direction = $${idx.v}`);
    params.push(f.direction);
    idx.v++;
  }
  if (f.transportType) {
    conds.push(`transport_type = $${idx.v}`);
    params.push(f.transportType);
    idx.v++;
  }
  const sql = `SELECT coalesce(sum(abs(amount)),0) AS total FROM pnl_operations WHERE ${conds.join(" AND ")}`;
  const { rows } = await pool.query(sql, params);
  return Number(rows[0].total);
}

async function manualExpenseSum(
  pool: Pool,
  catType: string,
  f: ReturnType<typeof parseFilter>
): Promise<number> {
  const params: unknown[] = [catType];
  const idx = { v: 2 };
  const conds = ["c.type = $1"];
  conds.push(...buildDateWhere("m.period", f, params, idx));
  if (f.direction) {
    conds.push(`m.direction = $${idx.v}`);
    params.push(f.direction);
    idx.v++;
  }
  if (f.transportType) {
    conds.push(`m.transport_type = $${idx.v}`);
    params.push(f.transportType);
    idx.v++;
  }
  const sql = `SELECT coalesce(sum(m.amount),0) AS total FROM pnl_manual_expenses m JOIN pnl_expense_categories c ON c.id = m.category_id WHERE ${conds.join(" AND ")}`;
  const { rows } = await pool.query(sql, params);
  return Number(rows[0].total);
}

export async function getPnL(
  pool: Pool,
  params: FilterParams
): Promise<PnLData> {
  const f = parseFilter(params);

  const [
    revenueOps,
    cogsOps,
    opexOps,
    capexOps,
    belowEbitdaOps,
    creditPay,
    manualRev,
    manualCogs,
    manualOpex,
    manualCapex,
  ] = await Promise.all([
    opsSum(pool, "REVENUE", f),
    opsSum(pool, "COGS", f),
    opsSum(pool, "OPEX", f),
    opsSum(pool, "CAPEX", f),
    (async () => {
      const p: unknown[] = [];
      const idx = { v: 1 };
      const c = ["operation_type IN ('BELOW_EBITDA_DIVIDENDS','BELOW_EBITDA_TRANSIT')"];
      c.push(...buildDateWhere("date", f, p, idx));
      if (f.direction) {
        c.push(`direction = $${idx.v}`);
        p.push(f.direction);
        idx.v++;
      }
      if (f.transportType) {
        c.push(`transport_type = $${idx.v}`);
        p.push(f.transportType);
        idx.v++;
      }
      const { rows } = await pool.query(
        `SELECT coalesce(sum(abs(amount)),0) AS total FROM pnl_operations WHERE ${c.join(" AND ")}`,
        p
      );
      return Number(rows[0].total);
    })(),
    (async () => {
      const p: unknown[] = [];
      const idx = { v: 1 };
      const c: string[] = [];
      c.push(...buildDateWhere("date", f, p, idx));
      const w = c.length ? " WHERE " + c.join(" AND ") : "";
      const { rows } = await pool.query(
        `SELECT coalesce(sum(abs(amount)),0) AS total FROM pnl_credit_payments${w}`,
        p
      );
      return Number(rows[0].total);
    })(),
    (async () => {
      const p: unknown[] = [];
      const idx = { v: 1 };
      const c: string[] = [];
      c.push(...buildDateWhere("period", f, p, idx));
      if (f.direction) {
        c.push(`direction = $${idx.v}`);
        p.push(f.direction);
        idx.v++;
      }
      if (f.transportType) {
        c.push(`transport_type = $${idx.v}`);
        p.push(f.transportType);
        idx.v++;
      }
      const w = c.length ? " WHERE " + c.join(" AND ") : "";
      const { rows } = await pool.query(
        `SELECT coalesce(sum(amount),0) AS total FROM pnl_manual_revenues${w}`,
        p
      );
      return Number(rows[0].total);
    })(),
    manualExpenseSum(pool, "COGS", f),
    manualExpenseSum(pool, "OPEX", f),
    manualExpenseSum(pool, "CAPEX", f),
  ]);

  const revenue = revenueOps + manualRev;
  const cogs = cogsOps + manualCogs;
  const opex = opexOps + manualOpex;
  const capex = capexOps + manualCapex;
  const belowEbitda = belowEbitdaOps + creditPay;
  const grossProfit = revenue - cogs;
  const ebitda = grossProfit - opex;
  const ebitdaPercent = revenue > 0 ? (ebitda / revenue) * 100 : 0;
  const netAfterCapex = ebitda - capex;

  return {
    revenue,
    cogs,
    grossProfit,
    opex,
    ebitda,
    ebitdaPercent,
    capex,
    netAfterCapex,
    belowEbitda,
    creditPayments: creditPay,
  };
}

export async function getCogsByStage(
  pool: Pool,
  params: FilterParams
): Promise<{ stage: string; amount: number }[]> {
  const f = parseFilter(params);
  const byStage: Record<string, number> = {};
  const stageExpr = `
    coalesce(
      logistics_stage,
      case
        when lower(department) like '%забор%' then 'PICKUP'
        when lower(department) like '%склад москва%' or lower(department) like '%склад отправления%' then 'DEPARTURE_WAREHOUSE'
        when lower(department) like '%магистрал%' then 'MAINLINE'
        when lower(department) like '%склад калининград%' or lower(department) like '%склад получения%' then 'ARRIVAL_WAREHOUSE'
        when lower(department) like '%последняя миля%' then 'LAST_MILE'
        else null
      end
    )
  `;

  {
    const p: unknown[] = ["COGS"];
    const idx = { v: 2 };
    const c = ["operation_type = $1", `${stageExpr} IS NOT NULL`];
    c.push(...buildDateWhere("date", f, p, idx));
    if (f.direction) {
      c.push(`direction = $${idx.v}`);
      p.push(f.direction);
      idx.v++;
    }
    if (f.transportType) {
      c.push(`transport_type = $${idx.v}`);
      p.push(f.transportType);
      idx.v++;
    }
    const { rows } = await pool.query(
      `SELECT ${stageExpr} AS logistics_stage, sum(abs(amount)) AS total
       FROM pnl_operations
       WHERE ${c.join(" AND ")}
       GROUP BY ${stageExpr}`,
      p
    );
    for (const r of rows)
      byStage[r.logistics_stage] = (byStage[r.logistics_stage] || 0) + Number(r.total);
  }

  {
    const p: unknown[] = ["COGS"];
    const idx = { v: 2 };
    const c = ["c.type = $1", "c.logistics_stage IS NOT NULL"];
    c.push(...buildDateWhere("m.period", f, p, idx));
    if (f.direction) {
      c.push(`m.direction = $${idx.v}`);
      p.push(f.direction);
      idx.v++;
    }
    if (f.transportType) {
      c.push(`m.transport_type = $${idx.v}`);
      p.push(f.transportType);
      idx.v++;
    }
    const { rows } = await pool.query(
      `SELECT c.logistics_stage, sum(m.amount) AS total FROM pnl_manual_expenses m JOIN pnl_expense_categories c ON c.id = m.category_id WHERE ${c.join(" AND ")} GROUP BY c.logistics_stage`,
      p
    );
    for (const r of rows)
      byStage[r.logistics_stage] = (byStage[r.logistics_stage] || 0) + Number(r.total);
  }

  return Object.entries(byStage).map(([stage, amount]) => ({ stage, amount }));
}

export async function getOpexByDepartment(
  pool: Pool,
  params: FilterParams
): Promise<{ dept: string; amount: number }[]> {
  const f = parseFilter(params);
  const byDept: Record<string, number> = {};

  {
    const p: unknown[] = ["OPEX"];
    const idx = { v: 2 };
    const c = ["operation_type = $1"];
    c.push(...buildDateWhere("date", f, p, idx));
    if (f.direction) {
      c.push(`direction = $${idx.v}`);
      p.push(f.direction);
      idx.v++;
    }
    if (f.transportType) {
      c.push(`transport_type = $${idx.v}`);
      p.push(f.transportType);
      idx.v++;
    }
    const { rows } = await pool.query(
      `SELECT department, sum(abs(amount)) AS total FROM pnl_operations WHERE ${c.join(" AND ")} GROUP BY department`,
      p
    );
    for (const r of rows)
      byDept[r.department] = (byDept[r.department] || 0) + Number(r.total);
  }

  {
    const p: unknown[] = ["OPEX"];
    const idx = { v: 2 };
    const c = ["c.type = $1"];
    c.push(...buildDateWhere("m.period", f, p, idx));
    if (f.direction) {
      c.push(`m.direction = $${idx.v}`);
      p.push(f.direction);
      idx.v++;
    }
    if (f.transportType) {
      c.push(`m.transport_type = $${idx.v}`);
      p.push(f.transportType);
      idx.v++;
    }
    const { rows } = await pool.query(
      `SELECT c.department, sum(m.amount) AS total FROM pnl_manual_expenses m JOIN pnl_expense_categories c ON c.id = m.category_id WHERE ${c.join(" AND ")} GROUP BY c.department`,
      p
    );
    for (const r of rows)
      byDept[r.department] = (byDept[r.department] || 0) + Number(r.total);
  }

  return Object.entries(byDept).map(([dept, amount]) => ({ dept, amount }));
}

export async function getRevenueByDirection(
  pool: Pool,
  params: FilterParams
): Promise<{ direction: string; amount: number; label?: string }[]> {
  const f = parseFilter(params);
  const DIR_LABELS: Record<string, string> = {
    MSK_TO_KGD: "МСК→КГД",
    KGD_TO_MSK: "КГД→МСК",
  };
  const key = (dir: string, transport?: string | null) =>
    transport && transport !== "" ? `${dir}:${transport}` : dir;
  const byKey: Record<string, number> = {};

  {
    const p: unknown[] = ["REVENUE"];
    const idx = { v: 2 };
    const c = ["operation_type = $1", "direction IS NOT NULL"];
    c.push(...buildDateWhere("date", f, p, idx));
    if (f.direction) {
      c.push(`direction = $${idx.v}`);
      p.push(f.direction);
      idx.v++;
    }
    if (f.transportType) {
      c.push(`transport_type = $${idx.v}`);
      p.push(f.transportType);
      idx.v++;
    }
    const { rows } = await pool.query(
      `SELECT direction, transport_type, sum(abs(amount)) AS total FROM pnl_operations WHERE ${c.join(" AND ")} GROUP BY direction, transport_type`,
      p
    );
    for (const r of rows) {
      const k = key(r.direction, r.transport_type);
      byKey[k] = (byKey[k] || 0) + Number(r.total);
    }
  }

  {
    const p: unknown[] = [];
    const idx = { v: 1 };
    const c: string[] = [];
    c.push(...buildDateWhere("r.period", f, p, idx));
    if (f.direction) {
      c.push(`r.direction = $${idx.v}`);
      p.push(f.direction);
      idx.v++;
    }
    if (f.transportType) {
      c.push(`r.transport_type = $${idx.v}`);
      p.push(f.transportType);
      idx.v++;
    }
    const w = c.length ? " WHERE " + c.join(" AND ") : "";
    const { rows } = await pool.query(
      `SELECT r.direction, r.transport_type, sum(r.amount) AS total FROM pnl_manual_revenues r JOIN pnl_income_categories ic ON ic.id = r.category_id${w} GROUP BY r.direction, r.transport_type`,
      p
    );
    for (const r of rows) {
      const k = key(r.direction || ic_dir(r), r.transport_type);
      byKey[k] = (byKey[k] || 0) + Number(r.total);
    }
  }

  {
    const p: unknown[] = [];
    const idx = { v: 1 };
    const c: string[] = [];
    c.push(...buildDateWhere("date", f, p, idx));
    if (f.direction) {
      c.push(`direction = $${idx.v}`);
      p.push(f.direction);
      idx.v++;
    }
    if (f.transportType) {
      c.push(`transport_type = $${idx.v}`);
      p.push(f.transportType);
      idx.v++;
    }
    const w = c.length ? " WHERE " + c.join(" AND ") : "";
    const { rows } = await pool.query(
      `SELECT direction, transport_type, sum(revenue) AS total FROM pnl_sales${w} GROUP BY direction, transport_type`,
      p
    );
    for (const r of rows) {
      const k = key(r.direction, r.transport_type);
      byKey[k] = (byKey[k] || 0) + Number(r.total);
    }
  }

  return Object.entries(byKey).map(([k, amount]) => {
    const [dir, transport] = k.includes(":") ? k.split(":") : [k, ""];
    const label = transport
      ? `${DIR_LABELS[dir] ?? dir} ${transport === "FERRY" ? "паром" : "авто"}`
      : DIR_LABELS[dir] ?? dir;
    return { direction: k, amount, label };
  });
}

function ic_dir(_r: { direction: string }): string {
  return _r.direction || "";
}

export async function getEbitdaByDirection(
  pool: Pool,
  params: FilterParams
): Promise<{ direction: string; amount: number }[]> {
  const f = parseFilter(params);
  const dirs = ["MSK_TO_KGD", "KGD_TO_MSK"];
  const result: { direction: string; amount: number }[] = [];
  for (const d of dirs) {
    const [rev, cogs] = await Promise.all([
      opsSum(pool, "REVENUE", { ...f, direction: d }),
      opsSum(pool, "COGS", { ...f, direction: d }),
    ]);
    const opexAll = await opsSum(pool, "OPEX", f);
    const totalRev = await opsSum(pool, "REVENUE", f);
    const opexShare = totalRev > 0 ? rev / totalRev : 0;
    const ebitda = rev - cogs - opexAll * opexShare;
    result.push({ direction: d, amount: ebitda });
  }
  return result;
}

export async function getTotalWeightKg(
  pool: Pool,
  params: FilterParams
): Promise<number> {
  const f = parseFilter(params);
  const p: unknown[] = [];
  const idx = { v: 1 };
  const c: string[] = [];
  c.push(...buildDateWhere("date", f, p, idx));
  if (f.direction) {
    c.push(`direction = $${idx.v}`);
    p.push(f.direction);
    idx.v++;
  }
  if (f.transportType) {
    c.push(`transport_type = $${idx.v}`);
    p.push(f.transportType);
    idx.v++;
  }
  const w = c.length ? " WHERE " + c.join(" AND ") : "";
  const { rows } = await pool.query(
    `SELECT coalesce(sum(weight_kg),0) AS total FROM pnl_sales${w}`,
    p
  );
  return Number(rows[0].total);
}

export async function getUnitEconomics(
  pool: Pool,
  params: FilterParams
) {
  const weightKg = await getTotalWeightKg(pool, params);
  if (weightKg <= 0) return null;

  const pnl = await getPnL(pool, params);
  const cogsByStage = await getCogsByStage(pool, params);

  const cogsByStagePerKg: Record<string, number> = {};
  for (const { stage, amount } of cogsByStage) {
    cogsByStagePerKg[stage] = amount / weightKg;
  }

  const f = parseFilter(params);
  const p: unknown[] = ["COGS"];
  const idx = { v: 2 };
  const conds = ["operation_type = $1"];
  conds.push(...buildDateWhere("date", f, p, idx));
  if (f.direction) {
    conds.push(`direction = $${idx.v}`);
    p.push(f.direction);
    idx.v++;
  }
  if (f.transportType) {
    conds.push(`transport_type = $${idx.v}`);
    p.push(f.transportType);
    idx.v++;
  }
  const { rows } = await pool.query(
    `SELECT department, sum(abs(amount)) AS total FROM pnl_operations WHERE ${conds.join(" AND ")} GROUP BY department`,
    p
  );
  const cogsByDeptPerKg: Record<string, number> = {};
  for (const r of rows) {
    cogsByDeptPerKg[r.department] = Number(r.total) / weightKg;
  }

  return {
    weightKg,
    revenuePerKg: pnl.revenue / weightKg,
    cogsPerKg: pnl.cogs / weightKg,
    marginPerKg: (pnl.revenue - pnl.cogs) / weightKg,
    ebitdaPerKg: pnl.ebitda / weightKg,
    cogsByStagePerKg,
    cogsByDeptPerKg,
  };
}

export async function getMonthlySeries(
  pool: Pool,
  params: FilterParams,
  metric: "revenue" | "cogs" | "ebitda" | "netAfterCapex"
): Promise<{ month: string; value: number }[]> {
  const to = params.to ? new Date(params.to) : new Date();
  const from = params.from ? new Date(params.from) : subMonths(to, 11);
  const direction = params.direction;
  const transportType = params.transportType;
  const months: { month: string; value: number }[] = [];
  let cur = startOfMonth(from);

  while (cur <= to) {
    const next = endOfMonth(cur);
    const f: FilterParams = {
      from: cur.toISOString(),
      to: next.toISOString(),
      ...(direction && { direction }),
      ...(transportType && transportType !== "all" && { transportType }),
    };
    const pnl = await getPnL(pool, f);
    let val = 0;
    if (metric === "revenue") val = pnl.revenue;
    else if (metric === "cogs") val = pnl.cogs;
    else if (metric === "ebitda") val = pnl.ebitda;
    else if (metric === "netAfterCapex") val = pnl.netAfterCapex;
    months.push({ month: cur.toISOString().slice(0, 7), value: val });
    cur = startOfMonth(subMonths(next, -1));
  }
  return months;
}

export async function getMonthlyMarginPerKg(
  pool: Pool,
  params: FilterParams
): Promise<{ month: string; marginPerKg: number }[]> {
  const to = params.to ? new Date(params.to) : new Date();
  const from = params.from ? new Date(params.from) : subMonths(to, 11);
  const direction = params.direction;
  const transportType = params.transportType;
  const months: { month: string; marginPerKg: number }[] = [];
  let cur = startOfMonth(from);

  while (cur <= to) {
    const next = endOfMonth(cur);
    const f: FilterParams = {
      from: cur.toISOString(),
      to: next.toISOString(),
      ...(direction && { direction }),
      ...(transportType && transportType !== "all" && { transportType }),
    };
    const ue = await getUnitEconomics(pool, f);
    months.push({
      month: cur.toISOString().slice(0, 7),
      marginPerKg: ue ? ue.marginPerKg : 0,
    });
    cur = startOfMonth(subMonths(next, -1));
  }
  return months;
}
