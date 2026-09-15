import type { Account } from "../src/types.js";
import { adminUserRequiresCustomerAssignment } from "./adminUserCustomerBinding.js";

/** Зарегистрированный пользователь только с pickup (водитель/диспетчер), без разделов ЛК заказчика. */
export function isPickupStandaloneAccount(
  activeAccount: Pick<Account, "isRegisteredUser" | "permissions"> | null | undefined,
): boolean {
  if (!activeAccount?.isRegisteredUser) return false;
  const perms = activeAccount.permissions || {};
  if (perms.driver !== true && perms.dispatcher !== true) return false;
  if (adminUserRequiresCustomerAssignment(perms)) return false;
  return true;
}

export function pickupStandaloneMode(
  activeAccount: Pick<Account, "isRegisteredUser" | "permissions"> | null | undefined,
): "driver" | "dispatch" | null {
  if (!isPickupStandaloneAccount(activeAccount)) return null;
  const perms = activeAccount!.permissions || {};
  if (perms.dispatcher === true) return "dispatch";
  if (perms.driver === true) return "driver";
  return null;
}
