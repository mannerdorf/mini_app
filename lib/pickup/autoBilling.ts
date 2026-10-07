import type { Pool } from "pg";
import { billingJournal, billingSend } from "./billing.js";

/** Job insertion is transactional with handoff/order edits; claims share billingSend's row locks with manual sends. */
export async function processPickupAutoBilling(pool: Pool) {
  const lock = await pool.connect();
  let locked = false;
  try {
    locked = (await lock.query("SELECT pg_try_advisory_lock(119,1) AS locked")).rows[0]?.locked === true;
    if (!locked) return { skipped: true, processed: 0 };
    const { rows } = await pool.query(`SELECT q.job_id,j.city,to_char(j.date,'YYYY-MM-DD') AS date,
      j.status,j.data,b.status AS billing_status,b.amount_manual
      FROM pickup_auto_billing_queue q JOIN pickup_jobs j ON j.id=q.job_id
      LEFT JOIN pickup_billing b ON b.job_id=j.id
      WHERE q.state='pending' AND q.next_at<=now() ORDER BY q.next_at,q.job_id LIMIT 1`);
    if (!rows.length) return { processed: 0 };
    const job = rows[0];
    async function done() {
      await pool.query("UPDATE pickup_auto_billing_queue SET state='done',updated_at=now() WHERE job_id=$1", [job.job_id]);
    }
    // A sent, uncertain or manually handled record is never automatically retried.
    if (job.billing_status && job.billing_status !== "not_issued") {
      await done(); return { processed: 1, status: job.billing_status };
    }
    try {
      if (job.status !== "deposited" || job.data.issueCustomerBill !== true || job.data.customerBillMode !== "auto" || !(job.data.serviceKind === "last_mile" ? String(job.data.cargoNumber ?? "").trim() : String(job.data.zayavkaNumber ?? "").trim()) || job.amount_manual) {
        throw new Error("Ожидание автоматического расчёта, сдачи на склад и номера заявки; ручная сумма не отправляется автоматически");
      }
      const journal = await billingJournal(pool, job.city, job.date, "cron:auto-billing", job.job_id);
      const row = journal.rows[0];
      if (!row || row.error || row.amount == null) throw new Error(row?.error || "Ожидание данных перевозки и расчёта");
      const result = await billingSend(pool, "cron:auto-billing", { id: job.job_id, version: row.version, confirmed: true }, true);
      await done();
      return { processed: 1, status: result.status };
    } catch (error) {
      // billingSend marks 'sending' before I/O; after a crash/timeout it must be reconciled, never resent.
      await pool.query(`UPDATE pickup_auto_billing_queue SET attempts=attempts+1,
        next_at=now()+interval '15 minutes',last_error=$2,updated_at=now() WHERE job_id=$1`,
      [job.job_id, (error as Error).message.slice(0, 1000)]);
      return { processed: 0, waiting: 1 };
    }
  } finally {
    try { if (locked) await lock.query("SELECT pg_advisory_unlock(119,1)"); }
    finally { lock.release(); }
  }
}
