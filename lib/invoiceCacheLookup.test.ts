import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { readNormalizedByDateRange } from './documentCacheNormalized.js';
const db = new PGlite();
const pool = { query: (sql: string, params?: any[]) => db.query(sql, params) } as Pool;
beforeAll(async () => {
  await db.exec(`CREATE TABLE cache_invoices_rows (doc_number text, doc_date date, customer_inn text, payload jsonb, updated_at timestamptz)`);
  for (const [number,date,inn] of [['0000-004169','2026-09-29','123'],['4169','2025-09-29','123'],['0000-004169','2026-09-29','456'],['0000-004157','2026-09-29','123']]) {
    await db.query('INSERT INTO cache_invoices_rows VALUES ($1,$2,$3,$4,now())',[number,date,inn,JSON.stringify({Number:number,DateDoc:date,List:[{Name:'Услуги'}]})]);
  }
});
afterAll(async()=>{await db.close();});
it('selects invoice by normalized number, year and allowed customer in SQL',async()=>{
  for(const invoiceNumber of ['4169','0000-004169']) {
    const rows=await readNormalizedByDateRange(pool,'invoices','2026-01-01','2026-12-31',{invoiceNumber,inns:new Set(['123'])});
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({Number:'0000-004169',DateDoc:'2026-09-29',List:[{Name:'Услуги'}]});
  }
});
it('does not return documents outside an empty access scope',async()=>{
  expect(await readNormalizedByDateRange(pool,'invoices','2026-01-01','2026-12-31',{invoiceNumber:'4169',inns:new Set()})).toEqual([]);
});
it('returns empty for absent number and keeps list requests unchanged',async()=>{
  expect(await readNormalizedByDateRange(pool,'invoices','2026-01-01','2026-12-31',{invoiceNumber:'9999'})).toEqual([]);
  expect(await readNormalizedByDateRange(pool,'invoices','2026-01-01','2026-12-31',{})).toHaveLength(3);
});
