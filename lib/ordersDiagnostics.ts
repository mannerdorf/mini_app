import type { Pool } from 'pg';
import { readOrdersSyncTrace } from './ordersSyncDiagnostics.js';
import { normalizeCompanyName, orderMatchesCustomerScope } from './orderCustomerScope.js';

export async function diagnoseOrders(pool: Pool, options: {
  matchesScope: (row: any) => boolean;
  dateOf: (row: any) => string;
  dateFrom: string; dateTo: string; customerName: unknown; requestId: string;
}) {
  const sync = await readOrdersSyncTrace(pool);
  // Never expose the global payload, customer list or global row counts.
  const detail = sync.detail;
  const cron = {available:sync.available, requestId:sync.request_id ?? null,
    startedAt:sync.started_at ?? null, updatedAt:sync.updated_at ?? null,
    status:detail?.status ?? 'unknown',stage:detail?.stage ?? null,
    dateFrom:detail?.dateFrom ?? null,dateTo:detail?.dateTo ?? null,
    httpStatus:detail?.httpStatus ?? null,error:detail?.error ?? null};
  const base = {version:'orders-diagnostics-v1',requestId:options.requestId,checkedAt:new Date().toISOString(),
    path:['GetZayavki','/api/cron/refresh-orders-cache','cache_orders','/api/orders','Фильтры журнала'],
    period:{dateFrom:options.dateFrom,dateTo:options.dateTo},cron};
  try {
    const row=(await pool.query('SELECT data,fetched_at FROM cache_orders WHERE id=1')).rows[0];
    if(!row) return {...base,database:{state:'missing_snapshot'},counts:null};
    if(!Array.isArray(row.data)) return {...base,database:{state:'invalid_payload'},counts:null};
    const scoped=row.data.filter(options.matchesScope);
    const named=scoped.filter((r:any)=>!normalizeCompanyName(options.customerName) || orderMatchesCustomerScope(r,{name:String(options.customerName)}));
    const dated=named.filter((r:any)=>{const d=options.dateOf(r);return !d || (d>=options.dateFrom && d<=options.dateTo);});
    return {...base,database:{state:'ready',fetchedAt:row.fetched_at,stale:Date.now()-new Date(row.fetched_at).getTime()>15*60000},
      counts:{authorized:scoped.length,afterName:named.length,afterDates:dated.length,withoutDate:named.filter((r:any)=>!options.dateOf(r)).length}};
  } catch {
    return {...base,database:{state:'unavailable'},counts:null};
  }
}
