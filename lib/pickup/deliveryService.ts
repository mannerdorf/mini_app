import { get1cOrderUploadCredentials, POST_ZAYAVKA_URL } from '../post1cZayavkaUpload.js';
import { requestFetch } from '../requestCancellation.js';
export type DeliveryWriteResult = { ok: boolean; error?: string; uncertain?: boolean };
/** These setters overwrite a property; SetPickupCost does NOT create an invoice. */
export async function deliverySetter(method: 'SetPickupNumber' | 'SetPickupCost', payload: Record<string, unknown>): Promise<DeliveryWriteResult> {
  const credentials = get1cOrderUploadCredentials();
  if (!credentials) return { ok: false, error: 'Не настроены учётные данные 1С' };
  const base = process.env.ONE_C_DELIVERY_BASE_URL || POST_ZAYAVKA_URL.replace(/PostZayavka2\/?$/, '');
  try {
    const response = await requestFetch(`${base.replace(/\/$/, '')}/${method}/`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Auth: `Basic ${credentials.login}:${credentials.password}` },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(20000),
    });
    const data = await response.json().catch(() => null) as {Success?: unknown; Error?: unknown} | null;
    if (response.ok && data?.Success === true) return { ok: true };
    return { ok: false, error: typeof data?.Error === 'string' ? data.Error.slice(0, 500) : `Неподтверждённый ответ 1С (${response.status})`,
      uncertain: response.status >= 500 || response.ok };
  } catch { return { ok: false, uncertain: true, error: 'Связь с 1С прервана. Результат требует сверки.' }; }
}
