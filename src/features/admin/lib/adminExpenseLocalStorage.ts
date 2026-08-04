import type { ExpenseRequestItem } from "../../../pages/ExpenseRequestsPage";

const STORAGE_PREFIX = "haulz.expense_requests.";

export function expenseRequestsStorageKey(login: string): string {
  return `${STORAGE_PREFIX}${login}`;
}

export function loadExpenseRequestsFromLocalStorage(): (ExpenseRequestItem & { login: string })[] {
  const all: (ExpenseRequestItem & { login: string })[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith(STORAGE_PREFIX)) continue;
    const login = k.slice(STORAGE_PREFIX.length);
    try {
      const items = JSON.parse(localStorage.getItem(k) ?? "[]") as ExpenseRequestItem[];
      if (Array.isArray(items)) {
        items.forEach((r) => {
          if (r && r.createdAt) all.push({ ...r, login });
        });
      }
    } catch {
      /* skip */
    }
  }
  all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return all;
}

export function patchExpenseRequestInLocalStorage(
  login: string,
  itemId: string,
  patch: Partial<ExpenseRequestItem>,
): void {
  try {
    const storageKey = expenseRequestsStorageKey(login);
    const raw = localStorage.getItem(storageKey);
    if (!raw) return;
    const items = JSON.parse(raw) as ExpenseRequestItem[];
    if (!Array.isArray(items)) return;
    const updated = items.map((r) => (r.id === itemId ? { ...r, ...patch } : r));
    localStorage.setItem(storageKey, JSON.stringify(updated));
  } catch {
    /* skip */
  }
}

export function deleteExpenseRequestFromLocalStorage(login: string, itemId: string): void {
  try {
    const storageKey = expenseRequestsStorageKey(login);
    const raw = localStorage.getItem(storageKey);
    if (!raw) return;
    const items = JSON.parse(raw) as ExpenseRequestItem[];
    const updated = items.filter((r) => r.id !== itemId);
    localStorage.setItem(storageKey, JSON.stringify(updated));
  } catch {
    /* skip */
  }
}

export function replaceExpenseRequestInLocalStorage(
  login: string,
  itemId: string,
  mapper: (item: ExpenseRequestItem) => ExpenseRequestItem,
): void {
  try {
    const storageKey = expenseRequestsStorageKey(login);
    const raw = localStorage.getItem(storageKey);
    if (!raw) return;
    const items = JSON.parse(raw) as ExpenseRequestItem[];
    if (!Array.isArray(items)) return;
    const updated = items.map((r) => (r.id === itemId ? mapper(r) : r));
    localStorage.setItem(storageKey, JSON.stringify(updated));
  } catch {
    /* skip */
  }
}
