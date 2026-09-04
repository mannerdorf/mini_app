export const PERMISSION_KEYS = [
  { key: "cms_access", label: "Доступ в CMS" },
  { key: "accounting", label: "Бухгалтерия" },
  { key: "home", label: "Главная" },
  { key: "dashboard", label: "Дашборды" },
  { key: "cargo", label: "Грузы" },
  { key: "doc_invoices", label: "Счета" },
  { key: "doc_acts", label: "УПД" },
  { key: "doc_orders", label: "Заявки" },
  { key: "doc_sendings", label: "Отправки" },
  { key: "doc_claims", label: "Претензии" },
  { key: "doc_contracts", label: "Договоры" },
  { key: "doc_acts_settlement", label: "Акты сверок" },
  { key: "doc_tariffs", label: "Тарифы" },
  { key: "haulz", label: "HAULZ" },
  { key: "red_returns", label: "Возврат из КГД" },
  { key: "service_mode", label: "Служебный режим" },
  { key: "analytics", label: "Аналитика" },
  { key: "supervisor", label: "Руководитель" },
  { key: "eor", label: "EOR" },
  { key: "wb", label: "WB" },
  { key: "wb_admin", label: "WB админ" },
] as const;

/** 1-я строка: доступна к изменению только суперадминистратору, активный цвет — красный. */
export const PERMISSION_ROW1_SUPERADMIN = [
  { key: "cms_access", label: "Доступ в CMS" },
  { key: "service_mode", label: "Служебный режим" },
  { key: "analytics", label: "Аналитика" as const },
  { key: "haulz", label: "HAULZ" as const },
  { key: "red_returns", label: "Возврат из КГД" as const },
  { key: "eor", label: "EOR" as const },
  { key: "accounting", label: "Бухгалтерия" as const },
  { key: "wb", label: "WB" as const },
  { key: "wb_admin", label: "WB админ" as const },
  { key: "doc_sendings", label: "Отправки" as const },
] as const;

export const SUPERADMIN_ONLY_PERMISSION_KEYS = new Set(
  PERMISSION_ROW1_SUPERADMIN.map((item) => item.key)
);

export function isSuperadminOnlyPermissionKey(key: string): boolean {
  return SUPERADMIN_ONLY_PERMISSION_KEYS.has(key);
}

/** Сохранение прав: 1-я строка меняется только суперадминистратором. */
export function permissionsForAdminEditor(
  isSuperAdmin: boolean,
  edited: Record<string, boolean>,
  previous?: Record<string, boolean> | null
): Record<string, boolean> {
  if (isSuperAdmin) return normalizeAnalyticsDashboardPermissions(edited);
  const prev = previous || {};
  const out = normalizeAnalyticsDashboardPermissions({ ...edited });
  for (const { key } of PERMISSION_ROW1_SUPERADMIN) {
    if (key === "doc_sendings") {
      out.doc_sendings = prev.doc_sendings === true && edited.doc_sendings === true;
      continue;
    }
    out[key] = Boolean(prev[key]);
  }
  return out;
}

/** 2-я строка: доступна всем, у кого есть доступ в CMS, активный цвет — оранжевый. */
export const PERMISSION_ROW2_ORANGE = [
  { key: "__financial__", label: "Фин. показатели" as const },
  { key: "supervisor", label: "Руководитель" as const },
] as const;

/** Подсветка кнопок 1-й строки прав (суперадмин): WB — фиолетовый, WB админ — тёмно-фиолетовый, остальное — красный. */
export function superadminRowPermissionActiveClass(key: string, isActive: boolean): string {
  if (!isActive) return "";
  if (key === "wb_admin") return "active active-wb-admin";
  if (key === "wb") return "active active-purple";
  return "active active-danger";
}

/** 3-я строка: доступна всем, у кого есть доступ в CMS, активный цвет — синий. */
export const PERMISSION_ROW3_BLUE = [
  { key: "home", label: "Главная" },
  { key: "dashboard", label: "Дашборды" },
  { key: "cargo", label: "Грузы" },
  { key: "doc_invoices", label: "Счета" },
  { key: "doc_acts", label: "УПД" },
  { key: "doc_orders", label: "Заявки" },
  { key: "doc_claims", label: "Претензии" },
  { key: "doc_contracts", label: "Договоры" },
  { key: "doc_acts_settlement", label: "Акты сверок" },
  { key: "doc_tariffs", label: "Тарифы" },
] as const;

/** Раздел «Дашборды» в приложении согласован с «Аналитика». */
export function normalizeAnalyticsDashboardPermissions(perms: Record<string, boolean>): Record<string, boolean> {
  const p = { ...perms };
  if (p.dashboard === true) p.analytics = true;
  if (p.analytics !== true) p.dashboard = false;
  return p;
}

export function applyPermissionsToggle(prev: Record<string, boolean>, key: string): Record<string, boolean> {
  const nextVal = !prev[key];
  const next = { ...prev, [key]: nextVal };
  if (key === "analytics" && !nextVal) next.dashboard = false;
  if (key === "dashboard" && nextVal && !prev.analytics) next.analytics = true;
  return normalizeAnalyticsDashboardPermissions(next);
}

export function isDashboardPermissionDisabled(key: string, perms: Record<string, boolean>): boolean {
  return key === "dashboard" && !perms.analytics;
}

/** Пресет: без суперадмина «Отправки» нельзя включить, если у пользователя их ещё не было. */
export function applyPresetPermissionsWithSendingsGate(
  presetPerms: Record<string, boolean>,
  isSuperAdmin: boolean,
  existingDocSendings: boolean
): Record<string, boolean> {
  if (isSuperAdmin) return normalizeAnalyticsDashboardPermissions({ ...presetPerms });
  const doc_sendings = presetPerms.doc_sendings === true && existingDocSendings;
  return normalizeAnalyticsDashboardPermissions({ ...presetPerms, doc_sendings });
}

export type PermissionPreset = {
  id: string;
  label: string;
  permissions: Record<string, boolean>;
  financial: boolean;
  serviceMode: boolean;
};

export function createDefaultPermissions(overrides?: Partial<Record<string, boolean>>): Record<string, boolean> {
  return normalizeAnalyticsDashboardPermissions({
    cms_access: false,
    home: true,
    dashboard: true,
    cargo: true,
    doc_invoices: true,
    doc_acts: true,
    doc_orders: true,
    doc_sendings: false,
    doc_claims: true,
    doc_contracts: true,
    doc_acts_settlement: true,
    doc_tariffs: true,
    haulz: false,
    service_mode: false,
    analytics: false,
    supervisor: false,
    eor: false,
    wb: false,
    wb_admin: false,
    ...overrides,
  });
}
