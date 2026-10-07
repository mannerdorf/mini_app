import type { Pool } from 'pg';

export type PickupInvoiceLine = { number:string; date:string; inn:string; line:{Name?:string;Operation?:string} };
const normalizedNumber=(value:string)=>value.trim().replace(/^0+/,'');
export function pickupInvoiceForTransport(lines:PickupInvoiceLine[],transport:string,year:string,inn:string,serviceKind: "pickup" | "last_mile" = "pickup"):string {
  const matches=new Set<string>();
  for(const item of lines) {
    if(item.date.slice(0,4)!==year || (inn && item.inn && inn!==item.inn))continue;
    const description=`${item.line.Name||''} ${item.line.Operation||''}`;
    if(!(serviceKind === "last_mile" ? /последн[а-яё]*\s+мил[а-яё]*/i : /забор/i).test(description))continue;
    const numbers=[...description.matchAll(/перевозк[аи]\s*№?\s*(\d+)/gi)].map(match=>normalizedNumber(match[1]));
    if(numbers.includes(normalizedNumber(transport)))matches.add(item.number);
  }
  return matches.size===1?[...matches][0]:'';
}
/** Read only service lines, never invoice PDF blobs or transport-level BillNum. */
export async function readPickupInvoiceLines(pool:Pool,dateFrom:string,dateTo:string):Promise<PickupInvoiceLine[]> {
  const {rows}=await pool.query(`SELECT i.doc_number AS number,to_char(i.doc_date,'YYYY-MM-DD') AS date,
    coalesce(i.customer_inn,'') AS inn,l.line
    FROM cache_invoices_rows i CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(i.payload->'List')='array' THEN i.payload->'List' ELSE '[]'::jsonb END) AS l(line)
    WHERE i.doc_date BETWEEN $1::date AND $2::date
      AND concat(l.line->>'Name',' ',l.line->>'Operation') ~* 'забор|последн[а-яё]*[[:space:]]+мил'`,[dateFrom,dateTo]);
  return rows;
}
