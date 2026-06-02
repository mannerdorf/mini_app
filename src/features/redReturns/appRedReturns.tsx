/**
 * Пользователь «только Красный возврат»: зарегистрированный аккаунт с red_returns
 * и без основных модулей HAULZ — единственный экран «Возвраты».
 */
import type { Account } from "../../types";

function hasCoreNonRedReturnsAccess(perms: Record<string, boolean | undefined>): boolean {
  return !!(
    perms.cms_access ||
    perms.haulz ||
    perms.eor ||
    perms.accounting ||
    perms.supervisor ||
    perms.analytics ||
    perms.wb ||
    perms.wb_admin ||
    perms.service_mode
  );
}

export function isRedReturnsOnlyAccount(
  activeAccount: Pick<Account, "isRegisteredUser" | "permissions"> | null | undefined,
): boolean {
  if (!activeAccount?.isRegisteredUser) return false;
  const perms = activeAccount.permissions || {};
  if (perms.red_returns !== true) return false;
  return !hasCoreNonRedReturnsAccess(perms);
}
