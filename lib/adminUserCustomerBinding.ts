/** Permissions that require a customer (ИНН) or service mode in admin. */
export const CUSTOMER_BOUND_PERMISSION_KEYS = [
  "cms_access",
  "accounting",
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
  "analytics",
  "supervisor",
  "eor",
  "wb",
  "wb_admin",
  "red_returns",
  "haulz",
] as const;

export function adminUserRequiresCustomerAssignment(
  permissions: Record<string, boolean> | null | undefined,
): boolean {
  if (!permissions) return true;
  return CUSTOMER_BOUND_PERMISSION_KEYS.some((key) => permissions[key] === true);
}

export function adminUserMayOmitCustomerAssignment(
  permissions: Record<string, boolean> | null | undefined,
): boolean {
  if (!permissions) return false;
  if (permissions.service_mode === true) return true;
  if (!adminUserRequiresCustomerAssignment(permissions)) {
    return permissions.driver === true || permissions.dispatcher === true;
  }
  return false;
}
