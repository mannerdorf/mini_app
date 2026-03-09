import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { initRequestContext, logError } from "./_lib/observability.js";

function cityToCode(city: unknown): string {
  if (city == null) return "";
  const s = String(city).trim().toLowerCase();
  if (/калининградская\s*область|калининград|кгд/.test(s)) return "KGD";
  if (/советск|черняховск|балтийск|гусев|светлый|гурьевск|зеленоградск|светлогорск|пионерский|багратионовск|нестеров|озёрск|правдинск|полесск|лаврово|мамоново|янтарный/.test(s)) return "KGD";
  if (/московская\s*область|москва|мск|msk/.test(s)) return "MSK";
  if (/подольск|балашиха|химки|королёв|мытищи|люберцы|электросталь|коломна|одинцово|серпухов|орехово-зуево|раменское|жуковский|пушкино|сергиев\s*посад|воскресенск|лобня|клин|дубна|егорьевск|чехов|дмитров|ступино|ногинск|долгопрудный|реутов|андреевск|фрязино|троицк|ивантеевка|дзержинский|видное|красногорск|домодедово|железнодорожный|котельники/.test(s)) return "MSK";
  return "";
}

function isFerry(item: any): boolean {
  return item?.AK === true || item?.AK === "true" || item?.AK === "1" || item?.AK === 1;
}

function getDirection(item: any): "MSK_TO_KGD" | "KGD_TO_MSK" | null {
  const from = cityToCode(item?.CitySender ?? item?.citySender);
  const to = cityToCode(item?.CityReceiver ?? item?.cityReceiver);
  if (from === "MSK" && to === "KGD") return "MSK_TO_KGD";
  if (from === "KGD" && to === "MSK") return "KGD_TO_MSK";
  if (to === "KGD") return "MSK_TO_KGD";
  if (to === "MSK") return "KGD_TO_MSK";
  return null;
}

function parseNum(v: unknown): number {
  if (typeof v === "number") return isNaN(v) ? 0 : v;
  if (typeof v === "string") return parseFloat(v.replace(/\s/g, "").replace(/,/g, ".")) || 0;
  return 0;
}

function normalizeDateOnly(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  const ruMatch = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (ruMatch) return `${ruMatch[3]}-${ruMatch[2]}-${ruMatch[1]}`;
  return "";
}

interface AggRow {
  customer: string;
  direction: "MSK_TO_KGD" | "KGD_TO_MSK";
  transportType: "AUTO" | "FERRY";
  weightKg: number;
  volume: number;
  paidWeightKg: number;
  revenue: number;
  count: number;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "pnl_sales_auto");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  try {
    const month = Number(req.query.month);
    const year = Number(req.query.year);
    if (!month || !year) return res.status(400).json({ error: "month, year required", request_id: ctx.requestId });

    const dateFrom = `${year}-${String(month).padStart(2, "0")}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const dateTo = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

    const pool = getPool();
    const { rows: cacheRows } = await pool.query<{ data: unknown[] }>(
      "SELECT data FROM cache_perevozki WHERE id = 1"
    );

    if (cacheRows.length === 0) {
      return res.json({ rows: [], totals: { weightKg: 0, volume: 0, paidWeightKg: 0, revenue: 0, count: 0 } });
    }

    const allItems = Array.isArray(cacheRows[0].data) ? cacheRows[0].data : [];

    const filtered = allItems.filter((item: any) => {
      const d = normalizeDateOnly(item?.DatePrih ?? item?.DateVr ?? "");
      return d >= dateFrom && d <= dateTo;
    });

    const byKey = new Map<string, AggRow>();

    for (const item of filtered as any[]) {
      const direction = getDirection(item);
      if (!direction) continue;

      const transportType: "AUTO" | "FERRY" = isFerry(item) ? "FERRY" : "AUTO";
      const customer = String(item?.Customer ?? item?.customer ?? "").trim() || "Без заказчика";
      const key = `${direction}:${transportType}:${customer}`;

      const existing = byKey.get(key);
      const revenue = parseNum(item?.Sum);
      const weightKg = parseNum(item?.W);
      const volume = parseNum(item?.Value);
      const paidWeightKg = parseNum(item?.PW);

      if (existing) {
        existing.weightKg += weightKg;
        existing.volume += volume;
        existing.paidWeightKg += paidWeightKg;
        existing.revenue += revenue;
        existing.count += 1;
      } else {
        byKey.set(key, { customer, direction, transportType, weightKg, volume, paidWeightKg, revenue, count: 1 });
      }
    }

    const rows = Array.from(byKey.values()).sort((a, b) => {
      if (a.direction !== b.direction) return a.direction < b.direction ? -1 : 1;
      if (a.transportType !== b.transportType) return a.transportType < b.transportType ? -1 : 1;
      return b.revenue - a.revenue;
    });

    const totals = rows.reduce(
      (acc, r) => ({
        weightKg: acc.weightKg + r.weightKg,
        volume: acc.volume + r.volume,
        paidWeightKg: acc.paidWeightKg + r.paidWeightKg,
        revenue: acc.revenue + r.revenue,
        count: acc.count + r.count,
      }),
      { weightKg: 0, volume: 0, paidWeightKg: 0, revenue: 0, count: 0 }
    );

    return res.json({ rows, totals });
  } catch (error) {
    logError(ctx, "pnl_sales_auto_failed", error);
    const message = error instanceof Error ? error.message : "Ошибка авторасчета продаж P&L";
    return res.status(500).json({ error: message, request_id: ctx.requestId });
  }
}
