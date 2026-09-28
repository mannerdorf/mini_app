/** Read-only readiness report. Load DATABASE_URL in the shell; never prints credentials or documents. */
import { getPool } from "../api/_db.js";
import { isOpenDocument, isArchiveCandidate } from "../lib/documentRefreshQueue.js";
import { cronDateWindow } from "../lib/cronWorkState.js";
const pool = getPool();
try {
  const recent = cronDateWindow(3);
  const tables = ["cron_work_state", "one_c_request_gate", "one_c_request_waiters", "cache_invoices_rows", "cache_perevozki_rows"];
  const readiness = [];
  for (const table of tables) readiness.push({ table, exists: Boolean((await pool.query("SELECT to_regclass($1) AS name", [table])).rows[0].name) });
  console.log(JSON.stringify({tables:readiness}));
  if (readiness.some(row => !row.exists)) throw new Error("Required tables missing");
  for (const kind of ["invoices", "perevozki"] as const) {
    const table = kind === "invoices" ? "cache_invoices_rows" : "cache_perevozki_rows";
    const rows = (await pool.query(`SELECT doc_date::text AS day,updated_at,payload FROM ${table}`)).rows;
    const open = rows.filter(row => isOpenDocument(kind,row.payload));
    const archived = open.filter(row => isArchiveCandidate(kind,row.day,row.payload));
    const archiveDays = new Set(archived.map(row => row.day)).size;
    const dates = new Set(open.filter(row => row.day && row.day < recent.dateFrom && !isArchiveCandidate(kind,row.day,row.payload)).map(row => row.day));
    const states: Record<string,number> = {};
    if (kind === "perevozki") for (const row of rows) {
      const state = String(row.payload.State ?? row.payload.state ?? "Не указан");
      states[state] = (states[state] || 0)+1;
    }
    console.log(JSON.stringify({kind,documents:rows.length,open:open.length,oldActiveDays:dates.size,archiveDocuments:archived.length,archiveDays,minimumCycleMinutes:dates.size*5,undated:open.filter(row=>!row.day).length,states}));
  }
  console.log(JSON.stringify({queues:(await pool.query("SELECT name,next_at,lease_until,failures,updated_at FROM cron_work_state WHERE name LIKE 'documents_%' ORDER BY name")).rows}));
} catch {
  console.error("Проверка не завершена: проверьте подключение и наличие таблиц; секреты не выводятся.");
  process.exitCode = 1;
} finally { await pool.end(); }
