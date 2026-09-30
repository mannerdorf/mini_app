/** Public-site analytics only. Never pass form values, account data or arbitrary URL parameters. */
export const METRIKA_COUNTER_ID = 113218465;
const PUBLIC_PATHS = new Set(['/', '/kalkulyator', '/faq', '/sklady', '/o-kompanii', '/about', '/app', '/blog', '/perevozka-moskva-kaliningrad', '/perevozka-kaliningrad-moskva']);
type Ym = ((id: number, method: string, ...args: unknown[]) => void) & { a?: unknown[][]; l?: number };
declare global { interface Window { ym?: Ym } }

export function publicAnalyticsUrl(raw: string): string | null {
  const url = new URL(raw, 'https://haulz.space');
  if (url.protocol !== 'https:' || url.hostname !== 'haulz.space') return null;
  const path = url.pathname.replace(/\/+$/, '') || '/';
  if (!PUBLIC_PATHS.has(path) && !/^\/blog\/[a-z0-9][a-z0-9_-]{0,120}$/i.test(path)) return null;
  if (['tab', 'profileView', 'admin', 'token', 'login', 'forgot', 'tgWebAppData'].some(key => url.searchParams.has(key))) return null;
  const clean = new URL(path, url.origin);
  const direction = url.searchParams.get('direction');
  if (path === '/kalkulyator' && (direction === 'mow_kgd' || direction === 'kgd_mow')) clean.searchParams.set('direction', direction);
  // Campaign labels are deliberately restricted; user-entered search text and contacts are not analytics data.
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign']) {
    const value = url.searchParams.get(key);
    if (value && /^[a-z0-9_-]{1,80}$/i.test(value)) clean.searchParams.set(key, value);
  }
  return clean.href;
}

let active = false;
let lastUrl: string | null = null;
function command(method: string, ...args: unknown[]) { window.ym?.(METRIKA_COUNTER_ID, method, ...args); }
export function stopPublicMetrika() {
  if (active) command('destruct');
  active = false;
  lastUrl = null;
}
export function trackPublicPage(raw: string, title: string) {
  const url = publicAnalyticsUrl(raw);
  if (!url || window.location.hash.includes('tgWebAppData') || /Telegram|MAX[^a-z]?App/i.test(navigator.userAgent)) {
    stopPublicMetrika();
    return;
  }
  if (!window.ym) {
    const queue: Ym = (id, method, ...args) => { (queue.a ||= []).push([id, method, ...args]); };
    queue.l = Date.now();
    window.ym = queue;
  }
  if (!active) {
    command('init', { defer: true, webvisor: false, clickmap: false, trackLinks: false, accurateTrackBounce: false, url, referrer: safeReferrer(document.referrer) });
    active = true;
  }
  if (lastUrl !== url) {
    command('hit', url, { title, referer: lastUrl || safeReferrer(document.referrer) });
    lastUrl = url;
  }
  if (!document.getElementById('haulz-public-metrika')) {
    const script = document.createElement('script');
    script.id = 'haulz-public-metrika';
    script.async = true;
    script.src = `https://mc.yandex.ru/metrika/tag.js?id=${METRIKA_COUNTER_ID}`;
    document.head.appendChild(script);
  }
}
function safeReferrer(raw: string): string {
  if (!raw) return '';
  try { const u = new URL(raw); return u.hostname === 'haulz.space' ? (publicAnalyticsUrl(raw) || '') : u.origin + '/'; } catch { return ''; }
}
