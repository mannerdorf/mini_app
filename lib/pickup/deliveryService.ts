import { get1cOrderUploadCredentials, POST_ZAYAVKA_URL } from '../post1cZayavkaUpload.js';
import { requestFetch } from '../requestCancellation.js';
export type DeliveryDiagnostics = { curl: string; status: number | null; response: string; elapsedMs: number };
export type DeliveryWriteResult = { ok: boolean; error?: string; uncertain?: boolean; diagnostics?: DeliveryDiagnostics };
export function deliveryRequestPreview(method: 'SetPickupNumber' | 'SetPickupCost', payload: Record<string, unknown>) {
  const credentials = get1cOrderUploadCredentials();
  const base = process.env.ONE_C_DELIVERY_BASE_URL || POST_ZAYAVKA_URL.replace(/PostZayavka2\/?$/, '');
  const url = `${base.replace(/\/$/, '')}/${method}/`;
  const body = JSON.stringify(payload);
  const secrets = credentials ? [credentials.password, `${credentials.login}:${credentials.password}`, Buffer.from(`${credentials.login}:${credentials.password}`).toString('base64')].filter(Boolean).sort((a,b)=>b.length-a.length) : [];
  const redact = (value: string) => secrets.reduce((text, secret)=>text.split(secret).join('[REDACTED]'), value);
  const quote = (value: string) => "'" + value.replace(/'/g, "'\\''") + "'";
  const diagnostics: DeliveryDiagnostics = {
    curl: `curl --request POST --max-time 20 ${quote(redact(url))} \\\n  --header 'Content-Type: application/json' \\\n  --header "Auth: Basic \${ONE_C_LOGIN}:\${ONE_C_PASSWORD}" \\\n  --data-raw ${quote(redact(body))}`,
    status: null, response: '', elapsedMs: 0,
  };
  return {url,body,redact,diagnostics};
}
/** These setters overwrite a property; SetPickupCost does NOT create an invoice. */
export async function deliverySetter(method: 'SetPickupNumber' | 'SetPickupCost', payload: Record<string, unknown>, diagnostic = false): Promise<DeliveryWriteResult> {
  const credentials = get1cOrderUploadCredentials();
  if (!credentials) return { ok: false, error: 'Не настроены учётные данные 1С' };
  const {url,body,redact,diagnostics} = deliveryRequestPreview(method,payload);
  const started = Date.now();
  const finish = (result: DeliveryWriteResult): DeliveryWriteResult => diagnostic ? {...result, diagnostics: {...diagnostics, elapsedMs: Date.now()-started}} : result;
  try {
    const response = await requestFetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Auth: `Basic ${credentials.login}:${credentials.password}` },
      body, signal: AbortSignal.timeout(20000),
    });
    diagnostics.status = response.status;
    const raw = await response.text();
    diagnostics.response = redact(raw).slice(0,16000) + (raw.length>16000 ? '\n[Ответ обрезан]' : '');
    let data: {Success?: unknown; Error?: unknown} | null = null;
    try { data = JSON.parse(raw); } catch { /* Preserve non-JSON responses in diagnostics. */ }
    if (response.ok && data?.Success === true) return finish({ ok: true });
    return finish({ ok: false, error: typeof data?.Error === 'string' ? redact(data.Error).slice(0, 500) : `Неподтверждённый ответ 1С (${response.status})`,
      uncertain: response.status >= 500 || response.ok });
  } catch { return finish({ ok: false, uncertain: true, error: 'Связь с 1С прервана. Результат требует сверки.' }); }
}
