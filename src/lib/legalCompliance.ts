import type { AccountPermissions } from "../types";
import type { LegalStatusResponse } from "../api/client/legal";

/** Служебный режим: блокирующее окно и принятие оферты/согласия на ПД не требуются. */
export function applyLegalPendingForServiceMode(
  pending: LegalStatusResponse["pending"],
  permissions?: AccountPermissions | null
): LegalStatusResponse["pending"] {
  if (permissions?.service_mode !== true) return pending;
  return { offer: false, consent: false, any: false };
}

export function adjustLegalStatusForAccount(
  status: LegalStatusResponse,
  permissions?: AccountPermissions | null
): LegalStatusResponse {
  const pending = applyLegalPendingForServiceMode(status.pending, permissions);
  return pending === status.pending ? status : { ...status, pending };
}
