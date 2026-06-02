/** Ключи прав зарегистрированных пользователей (согласовано с admin-presets). */
export const REGISTERED_PERMISSION_KEYS = [
  "cms_access",
  "home",
  "dashboard",
  "cargo",
  "doc_invoices",
  "doc_acts",
  "doc_orders",
  "doc_sendings",
  "doc_claims",
  "doc_contracts",
  "doc_acts_settlement",
  "doc_tariffs",
  "haulz",
  "red_returns",
  "eor",
  "wb",
  "wb_admin",
  "chat",
  "service_mode",
  "analytics",
  "supervisor",
  "accounting",
] as const;

/** Только «Красный возврат»: остальные разделы выключены. */
export function exclusiveRedReturnsPermissions(): Record<string, boolean> {
  const out = REGISTERED_PERMISSION_KEYS.reduce<Record<string, boolean>>((acc, key) => {
    acc[key] = false;
    return acc;
  }, {});
  out.red_returns = true;
  return out;
}
