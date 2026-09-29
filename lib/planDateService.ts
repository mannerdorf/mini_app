const BASE_URL = "https://tdn.postb.ru/workbase/hs/DeliveryWebService/GETAPI";
import { SERVICE_AUTH } from './oneCServiceAuth.js';
import type { Pool } from 'pg';

const normalizeText = (value: unknown) => String(value ?? "").trim();

export async function callSetPlanDate(
  serviceLogin: string,
  servicePassword: string,
  cargoNumber: string,
  date: string
): Promise<{ ok: true } | { ok: false; error: string; uncertain?: boolean }> {
  const url = new URL(BASE_URL);
  url.searchParams.set("metod", "SetPlanDataDostavki");
  url.searchParams.set("Perevozka", cargoNumber);
  url.searchParams.set("Date", date);

  try {
    const upstream = await fetch(url.toString(), {
      method: "GET",
      signal: AbortSignal.timeout(25000),
      headers: {
        Auth: `Basic ${serviceLogin}:${servicePassword}`,
        Authorization: SERVICE_AUTH,
      },
    });
    const text = await upstream.text();
    if (!upstream.ok) {
      try {
        const json = JSON.parse(text) as Record<string, unknown>;
        const message = json?.Error ?? json?.error ?? json?.message;
        return { ok: false, uncertain: upstream.status >= 500, error: String(message || text || upstream.statusText || `HTTP ${upstream.status}`) };
      } catch {
        return { ok: false, uncertain: upstream.status >= 500, error: text || upstream.statusText || `HTTP ${upstream.status}` };
      }
    }
    try {
      const json = JSON.parse(text) as Record<string, unknown>;
      if (json && typeof json === "object" && json.Success === false) {
        const message = json.Error ?? json.error ?? json.message;
        return { ok: false, error: String(message || "Ошибка записи даты в 1С") };
      }
      if (json?.Success !== true && json?.success !== true) {
        return { ok: false, uncertain: true, error: "1С не подтвердила запись даты. Сверьте результат перед повтором." };
      }
    } catch {
      return { ok: false, uncertain: true, error: "1С вернула неподтверждённый ответ. Сверьте дату перед повтором." };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, uncertain: true, error: "Ответ 1С не получен за отведённое время. Результат записи неизвестен; сверьте дату в 1С перед повтором." };
  }
}


export class PlanDateConfigurationError extends Error {}
export function planDateCredentials() {
 for (const prefix of ['PLAN_DATE_SERVICE','HAULZ_1C_SERVICE','PEREVOZKI_SERVICE','POLL_SERVICE']) {
   const login=(process.env[`${prefix}_LOGIN`]||'').trim();
   const password=(process.env[`${prefix}_PASSWORD`]||'').trim();
   if(login && password) return {login,password};
 }
 throw new PlanDateConfigurationError('Не настроена полная пара логина и пароля 1С: PLAN_DATE_SERVICE, HAULZ_1C_SERVICE, PEREVOZKI_SERVICE или POLL_SERVICE. Проверьте окружение haulz-cron и перезапустите службу.');
}
export function extractConfirmedPlanDate(data:unknown, number:string):string|null {
 if(!data || typeof data!=='object' || Array.isArray(data)) return null;
 const row=data as Record<string,unknown>;
 const received=String(row.rawNumber??row.Number??row.Номер??'').replace(/^0+/, '');
 if(!received || received!==number.replace(/^0+/, '')) return null;
 // Only explicit plan fields; never infer a plan from actual arrival or cached fallback.
 for(const key of ['DateArrivalPlan','DateDeliveryPlan','PlanDate','ПлановаяДатаПрибытия','ПлановаяДатаДоставки']) {
   const value=String(row[key]??'');
   const iso=value.match(/^(\d{4}-\d{2}-\d{2})(?:T|$)/)?.[1];
   const ru=value.match(/^(\d{2})\.(\d{2})\.(\d{4})(?:\s|$)/);
   if(iso) return iso;
   if(ru) return `${ru[3]}-${ru[2]}-${ru[1]}`;
 }
 return null;
}
/** Getperevozka returns history/packages; only GetPerevozki exposes DateArrival. */
export async function readPlanDate(pool:Pool,login:string,password:string,number:string) {
 const normalized=(await pool.query("SELECT to_regclass('public.cache_perevozki_rows') AS name")).rows[0]?.name;
 let rows:any[]=[];
 if(normalized) rows=(await pool.query(`SELECT payload FROM cache_perevozki_rows
   WHERE ltrim(coalesce(payload->>'rawNumber',payload->>'Number'),'0')=ltrim($1,'0')`,[number])).rows.map(r=>r.payload);
 if(!rows.length) {
   const legacy=(await pool.query("SELECT to_regclass('public.cache_perevozki') AS name")).rows[0]?.name;
   if(legacy) rows=(await pool.query(`SELECT item AS payload FROM cache_perevozki,
     LATERAL jsonb_array_elements(data) item WHERE id=1 AND ltrim(coalesce(item->>'rawNumber',item->>'Number'),'0')=ltrim($1,'0')`,[number])).rows.map(r=>r.payload);
 }
 if(rows.length!==1) throw new Error('Не найдена однозначная перевозка для проверки даты в 1С');
 const cached=rows[0];
 const inn=String(cached.ЗаказчикИНН??cached.INN??cached.CustomerINN??'').trim();
 const dates=[cached.DatePrih,cached.DateDoc].map(v=>String(v??'').slice(0,10)).filter(v=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&v>'2000-01-01'&&Number.isFinite(Date.parse(v))).sort();
 if(!inn||!dates.length) throw new Error('Не хватает ИНН или даты перевозки для проверки в 1С');
 const url=new URL('https://tdn.postb.ru/workbase/hs/DeliveryWebService/GetPerevozki');
 url.searchParams.set('INN',inn);
 url.searchParams.set('DateB',dates[0]);url.searchParams.set('DateE',dates[dates.length-1]);
 let response:Response;
 try {response=await fetch(url,{headers:{Auth:`Basic ${login}:${password}`,Authorization:SERVICE_AUTH},signal:AbortSignal.timeout(60000)});}
 catch {throw new Error('Не удалось получить свежую дату из 1С за 60 секунд; результат записи не проверен');}
 if(!response.ok) throw new Error(`Проверка даты в 1С: HTTP ${response.status}`);
 const data:any=await response.json();
 const items=Array.isArray(data)?data:data?.items;
 if(!Array.isArray(items)) throw new Error('1С вернула неожиданный формат списка перевозок');
 const matches=items.filter(r=>r&&typeof r==='object'&&String(r.rawNumber??r.Number??'').replace(/^0+/,'')===number.replace(/^0+/,''));
 if(matches.length!==1) throw new Error('Перевозка не найдена однозначно в свежем ответе 1С');
 const row=matches[0];
 const receivedInn=String(row.ЗаказчикИНН??row.INN??row.CustomerINN??'').trim();
 if(receivedInn && receivedInn!==inn) throw new Error('ИНН перевозки в ответе 1С не совпадает');
 // Read the real list field, never synthetic plan fields patched into our cache.
 const date=String(row.DateArrival??'').slice(0,10);
 if(!date || date==='0001-01-01') throw new Error('В свежих данных 1С плановая дата не заполнена');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date) throw new Error('В 1С некорректная плановая дата');
 return date;
}
