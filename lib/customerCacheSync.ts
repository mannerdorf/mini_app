import type { Pool } from 'pg';

export type CachedCustomer = { inn:string; customer_name:string; email:string };
export function normalizeCacheCustomers(raw: unknown): CachedCustomer[] {
  if (!raw || typeof raw !== 'object') return [];
  const o=raw as Record<string,unknown>;
  const payload=Array.isArray(raw)?raw:o.Items??o.items??o.Customers??o.customers??o.Data??o.data??o.Result??o.result??o.Rows??o.rows??raw;
  const rows=Array.isArray(payload)?payload:payload!==raw?normalizeCacheCustomers(payload):o.INN||o.Inn||o.inn?[o]:Object.values(o).filter(v=>v&&typeof v==='object');
  const byInn=new Map<string,CachedCustomer>();
  for (const value of rows) {
    const el=value as Record<string,unknown>;
    const str=(...keys:string[])=>String(keys.map(k=>el[k]).find(v=>v!=null&&String(v).trim()!=='')??'').trim();
    const inn=str('Inn','INN','inn','ИНН','Code','code','Код').replace(/\D/g,'');
    if (!/^(\d{10}|\d{12})$/.test(inn)) continue;
    byInn.set(inn,{inn,customer_name:str('Name','name','Customer','customer','Contragent','contragent','Client','client','Заказчик','Наименование','customer_name')||inn,email:str('Email','email','E-mail','e-mail','Почта','Mail')});
  }
  return [...byInn.values()];
}

/** Readers see either the previous complete snapshot or the new one. Empty replies never erase it. */
export async function replaceCustomerCache(pool:Pool,rows:CachedCustomer[]) {
  if (!rows.length) throw new Error('1С вернул пустой список заказчиков — кэш сохранён');
  const db=await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query("SELECT pg_advisory_xact_lock(hashtext('customer_cache_snapshot'))");
    await db.query('DELETE FROM cache_customers');
    await db.query(`INSERT INTO cache_customers(inn,customer_name,email,fetched_at)
      SELECT inn,customer_name,email,now() FROM unnest($1::text[],$2::text[],$3::text[]) t(inn,customer_name,email)`,[rows.map(r=>r.inn),rows.map(r=>r.customer_name),rows.map(r=>r.email)]);
    await db.query('COMMIT');
  } catch(e) {await db.query('ROLLBACK');throw e;} finally {db.release();}
}
