const BASE_URL = "https://tdn.postb.ru/workbase/hs/DeliveryWebService/GETAPI";
const SERVICE_AUTH = "Basic YWRtaW46anVlYmZueWU=";

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


export function planDateCredentials() {
 const login=(process.env.PLAN_DATE_SERVICE_LOGIN||process.env.HAULZ_1C_SERVICE_LOGIN||process.env.PEREVOZKI_SERVICE_LOGIN||'').trim();
 const password=(process.env.PLAN_DATE_SERVICE_PASSWORD||process.env.HAULZ_1C_SERVICE_PASSWORD||process.env.PEREVOZKI_SERVICE_PASSWORD||'').trim();
 if(!login||!password) throw new Error('Не настроены учётные данные записи плановой даты');
 return {login,password};
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
export async function readPlanDate(login:string,password:string,number:string) {
 const url=new URL(BASE_URL);url.searchParams.set('metod','Getperevozka');url.searchParams.set('Number',number);
 const response=await fetch(url,{headers:{Auth:`Basic ${login}:${password}`,Authorization:SERVICE_AUTH},signal:AbortSignal.timeout(25000)});
 if(!response.ok) return null;
 return extractConfirmedPlanDate(await response.json(),number);
}
