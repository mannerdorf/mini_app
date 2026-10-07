import https from 'node:https';

export function normalizeTrackingNumber(value: unknown): string {
  return String(value ?? '').trim().toUpperCase().replace(/\s+/g, '');
}
export function validTrackingNumber(value: string): boolean {
  return /^[A-Z0-9][A-Z0-9-]{2,49}$/.test(value);
}
/** FESCO requires HTTP/1.1; the native HTTPS client also avoids undici socket resets. */
export function requestFescoTracking(number: string, token: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const request = https.get(`https://api.fesco.com/api/v1/lk/tracking?numbers=${encodeURIComponent(number)}`, {
      headers: { Authorization: `Bearer ${token}`, 'X-Lk-Lang': 'ru', Accept: 'application/json' },
    }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => {
        body += chunk;
        if (body.length > 2_000_000) response.destroy(new Error('Ответ FESCO слишком большой'));
      });
      response.on('error', () => reject(new Error('Соединение с FESCO прервано')));
      response.on('end', () => {
        if (response.statusCode !== 200) {
          reject(new Error(response.statusCode === 429 ? 'Лимит запросов FESCO. Повторите позже.' : response.statusCode === 401 || response.statusCode === 403 ? 'FESCO отклонил доступ. Проверьте токен API на сервере.' : 'FESCO временно недоступен'));
          return;
        }
        try { const data = JSON.parse(body); if (!Array.isArray(data.data)) throw new Error(); resolve(data.data); }
        catch { reject(new Error('FESCO вернул ответ в неизвестном формате')); }
      });
    });
    const timer = setTimeout(() => request.destroy(new Error('timeout')), 20_000);
    request.on('close', () => clearTimeout(timer));
    request.on('error', () => reject(new Error('Не удалось получить данные FESCO. Повторите запрос.')));
  });
}
