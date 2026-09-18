import type { Pool } from 'pg';

export function safeOrdersSyncError(error: unknown): string {
  const e = error as { name?: string; message?: string; code?: string };
  const message = String(e?.message || '');
  if (e?.name === 'TimeoutError' || e?.name === 'AbortError' || /timeout|timed out/i.test(message)) return '1С не ответила за отведённое время';
  const http = message.match(/^HTTP (\d{3})/);
  if (http) return `1С вернула HTTP ${http[1]}`;
  if (/Invalid JSON/i.test(message)) return 'Ответ 1С не является JSON';
  if (/неверный формат ответа/.test(message)) return 'Ответ GetZayavki не соответствует ожидаемому массиву заявок (Номер, ЗаказчикИНН, Ссылка)';
  if (e?.code === '42P01') return 'Не найдена таблица БД: проверьте миграции';
  if (/fetch failed|ECONN|ENOTFOUND/i.test(message)) return 'Не удалось подключиться к 1С';
  return 'Ошибка загрузки или записи. Подробности доступны в серверном журнале по request_id';
}

export async function writeOrdersSyncTrace(pool: Pool, requestId: string, patch: Record<string, unknown>, start = false) {
  try {
    if (start) await pool.query(`INSERT INTO orders_sync_diagnostics(id,request_id,detail) VALUES(1,$1,$2)
      ON CONFLICT(id) DO UPDATE SET request_id=$1,started_at=now(),updated_at=now(),detail=$2`, [requestId,JSON.stringify(patch)]);
    else await pool.query(`UPDATE orders_sync_diagnostics SET detail=detail || $2::jsonb,updated_at=now() WHERE id=1 AND request_id=$1`, [requestId,JSON.stringify(patch)]);
  } catch {
    // Diagnostics must not interrupt the actual refresh when migration 115 is pending.
  }
}

export async function readOrdersSyncTrace(pool: Pool) {
  try {
    const row = (await pool.query('SELECT request_id,started_at,updated_at,detail FROM orders_sync_diagnostics WHERE id=1')).rows[0];
    return row ? {available:true,...row} : {available:true, detail:null};
  } catch {
    return {available:false,detail:null};
  }
}
