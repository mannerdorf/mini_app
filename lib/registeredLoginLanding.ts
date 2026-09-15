import type { ProfileView } from "../src/types";
import { adminUserRequiresCustomerAssignment } from "./adminUserCustomerBinding";

/** Profile screen right after CMS login when no LK customer binding is needed. */
export function defaultProfileViewAfterRegisteredLogin(
  permissions: Record<string, boolean> | null | undefined,
): ProfileView | null {
  if (!permissions || adminUserRequiresCustomerAssignment(permissions)) return null;
  if (permissions.dispatcher === true) return "pickupDispatch";
  if (permissions.driver === true) return "pickupDriver";
  return null;
}
