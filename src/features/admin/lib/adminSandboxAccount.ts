import type { Account } from "../../../types";

/** Учётные данные CMS-сессии для песочницы API / отчёта (те же login/password, что при входе в админку). */
export function buildAdminSandboxAccount(login: string, password: string): Account {
  return {
    id: "__admin_sandbox__",
    login,
    password,
    isRegisteredUser: true,
    permissions: { haulz: true, service_mode: true },
    customers: [],
  };
}
