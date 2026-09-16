/** Служебный просмотр маршрутов всех водителей (бейдж driver + service_mode). */
export function pickupDriverServiceBrowse(actor: {
  driver: boolean;
  permissions?: Record<string, unknown>;
}): boolean {
  return actor.driver === true && actor.permissions?.service_mode === true;
}

export function pickupSnapshotSeeAllRoutes(
  actor: {
    dispatcher: boolean;
    driver: boolean;
    permissions?: Record<string, unknown>;
  },
  serviceBrowseRequested: boolean,
): boolean {
  return (
    actor.dispatcher ||
    (serviceBrowseRequested && pickupDriverServiceBrowse(actor))
  );
}
