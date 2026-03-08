import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";

const DEFAULT_PREFS = {
  telegram: { daily_summary: true } as Record<string, boolean>,
  webpush: { daily_summary: false } as Record<string, boolean>,
};

const EVENTS = ["accepted", "in_transit", "delivered", "bill_created", "bill_paid", "daily_summary"] as const;

/** GET ?login= — настройки из БД (notification_preferences). POST { login, preferences } — сохранить в БД. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  let pool: Awaited<ReturnType<typeof getPool>>;
  try {
    pool = getPool();
  } catch {
    return res.status(503).json({ error: "Database not configured" });
  }

  if (req.method === "GET") {
    const login = String(req.query?.login || "").trim().toLowerCase();
    if (!login) return res.status(400).json({ error: "login is required" });

    const prefs = { ...DEFAULT_PREFS };
    try {
      try {
        const stateRes = await pool.query<{ preferences: any }>(
          "SELECT preferences FROM notification_preferences_state WHERE login = $1 LIMIT 1",
          [login]
        );
        if (stateRes.rows.length > 0) {
          const raw = stateRes.rows[0]?.preferences || {};
          const telegram = raw?.telegram && typeof raw.telegram === "object" ? raw.telegram : {};
          const webpush = raw?.webpush && typeof raw.webpush === "object" ? raw.webpush : {};
          return res.status(200).json({
            telegram: { ...DEFAULT_PREFS.telegram, ...telegram },
            webpush: { ...DEFAULT_PREFS.webpush, ...webpush },
          });
        }
      } catch (e: any) {
        // New state table missing or inaccessible; fallback to legacy rows below.
        if (e?.code !== "42P01") {
          console.error("webpush-preferences GET state table error:", e?.message || e);
        }
      }
      const { rows } = await pool.query<{ channel: string; event_id: string; enabled: boolean }>(
        "SELECT channel, event_id, enabled FROM notification_preferences WHERE login = $1",
        [login]
      );
      for (const r of rows) {
        const ch = r.channel === "telegram" ? "telegram" : "webpush";
        if (EVENTS.includes(r.event_id as any)) {
          prefs[ch][r.event_id] = r.enabled;
        }
      }
      return res.status(200).json(prefs);
    } catch (e: any) {
      if (e?.code === "42P01") {
        return res.status(200).json(prefs);
      }
      console.error("webpush-preferences GET error:", e?.message || e);
      return res.status(500).json({ error: "Failed to load preferences" });
    }
  }

  let body: any = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: "Invalid JSON body" });
    }
  }

  const login = String(body?.login || "").trim().toLowerCase();
  const preferences = body?.preferences;
  if (!login) return res.status(400).json({ error: "login is required" });
  if (!preferences || typeof preferences !== "object") {
    return res.status(400).json({ error: "preferences object is required" });
  }

  const telegram = preferences.telegram && typeof preferences.telegram === "object" ? preferences.telegram : {};
  const webpush = preferences.webpush && typeof preferences.webpush === "object" ? preferences.webpush : {};
  const current = {
    telegram: { ...DEFAULT_PREFS.telegram, ...telegram },
    webpush: { ...DEFAULT_PREFS.webpush, ...webpush },
  };

  try {
    try {
      await pool.query(
        `INSERT INTO notification_preferences_state (login, preferences, updated_at)
         VALUES ($1, $2::jsonb, now())
         ON CONFLICT (login)
         DO UPDATE SET preferences = excluded.preferences, updated_at = now()`,
        [login, JSON.stringify(current)]
      );
    } catch (e: any) {
      // Continue with legacy sync if new table does not exist in DB yet.
      if (e?.code !== "42P01") {
        console.error("webpush-preferences POST state table error:", e?.message || e);
      }
    }

    // Legacy sync: keep old row-based table in sync if it exists.
    for (const eventId of EVENTS) {
      try {
        await pool.query(
          `INSERT INTO notification_preferences (login, channel, event_id, enabled, updated_at)
           VALUES ($1, 'telegram', $2, $3, now())
           ON CONFLICT (login, channel, event_id) DO UPDATE SET enabled = excluded.enabled, updated_at = now()`,
          [login, eventId, !!current.telegram[eventId]]
        );
        await pool.query(
          `INSERT INTO notification_preferences (login, channel, event_id, enabled, updated_at)
           VALUES ($1, 'web', $2, $3, now())
           ON CONFLICT (login, channel, event_id) DO UPDATE SET enabled = excluded.enabled, updated_at = now()`,
          [login, eventId, !!current.webpush[eventId]]
        );
      } catch (e: any) {
        // Old schema may reject new event_id values by CHECK constraint.
        if (e?.code === "23514" || e?.code === "42P01") continue;
        throw e;
      }
    }
    return res.status(200).json({ ok: true, preferences: current });
  } catch (e: any) {
    console.error("webpush-preferences POST error:", e?.message || e);
    return res.status(500).json({ error: "Failed to save preferences" });
  }
}
