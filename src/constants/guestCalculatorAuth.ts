import type { AuthData } from "../types";

/** Пустые credentials — гостевой калькулятор (см. resolveHaulzCalculatorGuestQuoteAccess на API). */
export const GUEST_CALCULATOR_AUTH: AuthData = { login: "", password: "" };

export function isGuestCalculatorAuth(auth: AuthData): boolean {
  return !auth.login?.trim() && !auth.password?.trim();
}
