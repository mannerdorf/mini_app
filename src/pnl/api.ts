const PATH_MAP: Record<string, string> = {
  '/api/pnl': '/api/pnl-report',
  '/api/operations': '/api/pnl-operations',
  '/api/credits': '/api/pnl-credits',
  '/api/income-categories': '/api/pnl-income-categories',
  '/api/expense-categories': '/api/pnl-expense-categories',
  '/api/expense-categories/from-statement': '/api/pnl-expense-categories-from-statement',
  '/api/subdivisions': '/api/pnl-subdivisions',
  '/api/manual-entry': '/api/pnl-manual-entry',
  '/api/sales/manual': '/api/pnl-sales-manual',
  '/api/statement': '/api/pnl-statement',
  '/api/unit-economics': '/api/pnl-unit-economics',
  '/api/charts': '/api/pnl-charts',
  '/api/charts/monthly-margin': '/api/pnl-charts-monthly-margin',
  '/api/alerts': '/api/pnl-alerts',
  '/api/rules': '/api/pnl-rules',
  '/api/upload/bank': '/api/pnl-upload-bank',
  '/api/upload/sales': '/api/pnl-upload-sales',
  '/api/upload/statement': '/api/pnl-upload-statement',
  '/api/upload/expenses': '/api/pnl-upload-expenses',
  '/api/pnl-sales-auto': '/api/pnl-sales-auto',
  '/api/timesheet-accruals': '/api/pnl-timesheet-accruals',
};

const DYN_PREFIXES = [
  { prefix: '/api/expense-categories/', target: '/api/pnl-expense-categories' },
  { prefix: '/api/income-categories/', target: '/api/pnl-income-categories' },
  { prefix: '/api/subdivisions/', target: '/api/pnl-subdivisions' },
];

function mapPath(path: string): string {
  if (PATH_MAP[path]) return PATH_MAP[path];
  for (const { prefix, target } of DYN_PREFIXES) {
    if (path.startsWith(prefix)) {
      const id = path.slice(prefix.length);
      if (id && id !== 'from-statement') {
        return `${target}?id=${encodeURIComponent(id)}`;
      }
    }
  }
  return path;
}

export function pnlUrl(path: string, params?: Record<string, string>): string {
  const mapped = mapPath(path);
  const url = new URL(mapped, window.location.origin);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v) url.searchParams.set(k, v);
    });
  }
  return url.toString();
}

export async function pnlFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(pnlUrl(path), {
    ...init,
    headers: {
      ...init?.headers,
    },
  });
}

async function parseResponse<T>(res: Response): Promise<T> {
  const text = await res.text().catch(() => '');
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    if (!res.ok) throw new Error(text || `Ошибка ${res.status}`);
    return {} as T;
  }
  try {
    return (text ? JSON.parse(text) : {}) as T;
  } catch {
    if (!res.ok) throw new Error(text || `Ошибка ${res.status}`);
    return {} as T;
  }
}

export async function pnlGet<T = unknown>(path: string, params?: Record<string, string>): Promise<T> {
  const res = await fetch(pnlUrl(path, params), { cache: 'no-store' });
  return parseResponse<T>(res);
}

export async function pnlPost<T = unknown>(path: string, body: unknown): Promise<T> {
  const res = await fetch(pnlUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return parseResponse<T>(res);
}

export async function pnlPostForm(path: string, formData: FormData): Promise<Response> {
  return fetch(pnlUrl(path), { method: 'POST', body: formData });
}

export async function pnlPatch<T = unknown>(path: string, body: unknown): Promise<T> {
  const res = await fetch(pnlUrl(path), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return parseResponse<T>(res);
}

export async function pnlDelete(path: string): Promise<Response> {
  return fetch(pnlUrl(path), { method: 'DELETE' });
}
