import {
  pickupJobCanDelete,
  pickupRouteCanDelete,
  pickupRouteCanSuperAdminDeleteCompleted,
  type JobStatus,
  type Route,
} from "./model.js";

/** Заборы с зафиксированным результатом (не «ожидает» / не «отменён»). */
export function pickupJobIsFinishedForCleanup(status: JobStatus): boolean {
  return ["picked_up", "partial", "deposited", "resolved"].includes(status);
}

/** Как в CMS: 1-я строка прав суперадмина (скрин «Разделы»). */
export const PICKUP_COMPLETED_ROUTE_DELETE_PERMISSION_KEYS = [
  "cms_access",
  "service_mode",
  "analytics",
  "haulz",
] as const;

export function pickupMayDeleteCompletedRoute(
  permissions: Record<string, unknown> | null | undefined,
): boolean {
  if (!permissions) return false;
  return PICKUP_COMPLETED_ROUTE_DELETE_PERMISSION_KEYS.every(
    (key) => permissions[key] === true,
  );
}

/** Кнопка «Удалить» в диспетчеризации приложения. */
export function pickupRouteCanDeleteInDispatchApp(
  status: Route["status"],
  permissions: Record<string, unknown> | null | undefined,
): boolean {
  if (pickupRouteCanDelete(status)) return true;
  return (
    pickupMayDeleteCompletedRoute(permissions) &&
    pickupRouteCanSuperAdminDeleteCompleted(status)
  );
}

/** Кнопка «Удалить» у забора в диспетчеризации приложения. */
export function pickupJobCanDeleteInDispatchApp(
  status: JobStatus,
  permissions: Record<string, unknown> | null | undefined,
): boolean {
  if (pickupJobCanDelete(status)) return true;
  return (
    pickupMayDeleteCompletedRoute(permissions) &&
    pickupJobIsFinishedForCleanup(status)
  );
}
