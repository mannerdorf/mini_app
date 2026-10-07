import { SERVICE_AUTH } from "../oneCServiceAuth.js";
import { POST_ZAYAVKA_URL } from '../post1cZayavkaUpload.js';
import { requestFetch } from '../requestCancellation.js';
export type DeliveryDiagnostics = { curl: string; status: number | null; response: string; elapsedMs: number };
export type DeliveryWriteResult = { ok: boolean; rejectedByService?: boolean; invoiceNumber?: string; invoiceId?: string; error?: string; uncertain?: boolean; diagnostics?: DeliveryDiagnostics };
function deliveryCredentials() {
  const login = String(process.env.PEREVOZKI_SERVICE_LOGIN ?? '').trim();
  const password = String(process.env.PEREVOZKI_SERVICE_PASSWORD ?? '').trim();
  return login && password ? {login,password} : null;
}
export function deliveryRequestPreview(method: 'SetPickupNumber' | 'SetPickupCost' | 'CreatePickupInvoice' | 'SetLastMileCost' | 'CreateLastMileInvoice', payload: Record<string, unknown>) {
  const credentials = deliveryCredentials();
  const base = process.env.ONE_C_DELIVERY_BASE_URL || POST_ZAYAVKA_URL.replace(/PostZayavka2\/?$/, '');
  const url = `${base.replace(/\/$/, '')}/${method}/`;
  const body = JSON.stringify(payload);
  const secrets = credentials ? [credentials.password, `${credentials.login}:${credentials.password}`, Buffer.from(`${credentials.login}:${credentials.password}`).toString('base64')].filter(Boolean).sort((a,b)=>b.length-a.length) : [];
  {
    secrets.push(SERVICE_AUTH, SERVICE_AUTH.replace(/^Basic\s+/i, ''));
    secrets.sort((a,b)=>b.length-a.length);
  }
  const redact = (value: string) => secrets.reduce((text, secret)=>text.split(secret).join('[REDACTED]'), value);
  const quote = (value: string) => "'" + value.replace(/'/g, "'\\''") + "'";
  const authVariables = '${PEREVOZKI_SERVICE_LOGIN}:${PEREVOZKI_SERVICE_PASSWORD}';
  const authorizationCurl = '\n  --header "Authorization: ${SERVICE_AUTH}"';
  const diagnostics: DeliveryDiagnostics = {
    curl: `curl --request POST --max-time 20 ${quote(redact(url))} \\\n  --header 'Content-Type: application/json; charset=utf-8' \\\n  --header "Auth: Basic ${authVariables}" \\\n${authorizationCurl ? authorizationCurl.trimStart() + " \\\n  " : ""}--data-raw ${quote(redact(body))}`,
    status: null, response: '', elapsedMs: 0,
  };
  return {url,body,redact,diagnostics};
}
/** Shared DeliveryWebService authentication; only Create*Invoice methods create an invoice. */
export async function deliverySetter(method: 'SetPickupNumber' | 'SetPickupCost' | 'CreatePickupInvoice' | 'SetLastMileCost' | 'CreateLastMileInvoice', payload: Record<string, unknown>, diagnostic = false): Promise<DeliveryWriteResult> {
  const credentials = deliveryCredentials();
  if (!credentials) return { ok: false, error: 'Не настроены PEREVOZKI_SERVICE_LOGIN и PEREVOZKI_SERVICE_PASSWORD' };
  const {url,body,redact,diagnostics} = deliveryRequestPreview(method,payload);
  const started = Date.now();
  const finish = (result: DeliveryWriteResult): DeliveryWriteResult => diagnostic ? {...result, diagnostics: {...diagnostics, elapsedMs: Date.now()-started}} : result;
  try {
    const response = await requestFetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8', Auth: `Basic ${credentials.login}:${credentials.password}`, Authorization:SERVICE_AUTH },
      body, signal: AbortSignal.timeout(20000),
    });
    diagnostics.status = response.status;
    const raw = await response.text();
    diagnostics.response = redact(raw).slice(0,16000) + (raw.length>16000 ? '\n[Ответ обрезан]' : '');
    let data: {Success?: unknown; Error?: unknown; Номер?: unknown; Ссылка?: unknown} | null = null;
    try { data = JSON.parse(raw); } catch { /* Preserve non-JSON responses in diagnostics. */ }
    if (response.ok && data?.Success === true) {
      if ((method === 'CreatePickupInvoice' || method === 'CreateLastMileInvoice')) {
        const invoiceNumber = typeof data.Номер === 'string' ? data.Номер.trim() : '';
        if (!invoiceNumber) return finish({ok:false,uncertain:true,error:'1С подтвердила создание счёта, но не вернула номер. Требуется сверка.'});
        return finish({ok:true,invoiceNumber,invoiceId:typeof data.Ссылка === 'string' ? data.Ссылка : undefined});
      }
      return finish({ok:true});
    }
    const rejectedByService = response.status < 500 && data?.Success === false && typeof data.Error === 'string' && data.Error.trim().length > 0;
    return finish({ ok: false, error: typeof data?.Error === 'string' ? redact(data.Error).slice(0, 500) : `Неподтверждённый ответ 1С (${response.status})`,
      uncertain: response.status >= 500 || (response.ok && !rejectedByService),
      rejectedByService });
  } catch { return finish({ ok: false, uncertain: true, error: 'Связь с 1С прервана. Результат требует сверки.' }); }
}
