import type { Pool } from "pg";
import type { QuoteRequest, QuoteResult } from "./types.js";
import { loadCalculatorTariffs } from "./tariffStore.js";

export async function saveQuoteSnapshot(
  pool: Pool,
  loginKey: string,
  request: QuoteRequest,
  result: QuoteResult,
): Promise<number> {
  const tariffs = await loadCalculatorTariffs(pool);
  const snapshot = {
    as_of_date: tariffs.asOfDate,
    pickup_version_id: tariffs.byCode.pickup_matrix?.version?.id ?? null,
    last_mile_version_id: tariffs.byCode.last_mile_matrix?.version?.id ?? null,
    settings_version_id: tariffs.byCode.calc_settings?.version?.id ?? null,
    extras_version_id: tariffs.byCode.calc_extras?.version?.id ?? null,
    mainline_versions: tariffs.mainline.map((m) => ({
      mode: m.mode,
      direction: m.direction,
      price_per_kg: m.price_per_kg,
      delivery_days: m.delivery_days,
    })),
    volumetric_factor: tariffs.settings?.volumetric_factor_kg_m3 ?? 200,
    mainline_min_chargeable_weight_kg: tariffs.settings?.mainline_min_chargeable_weight_kg ?? 20,
  };

  const { rows } = await pool.query<{ id: string }>(
    `insert into haulz_calc_quotes (login_key, direction, request, result, tariff_snapshot, km_override)
     values ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb)
     returning id::text`,
    [
      loginKey,
      result.direction,
      JSON.stringify(request),
      JSON.stringify(result),
      JSON.stringify(snapshot),
      request.kmOverride ? JSON.stringify(request.kmOverride) : null,
    ],
  );
  return Number(rows[0]?.id);
}
