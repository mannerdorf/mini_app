import type { PickupCall } from "./client";
import { ApiError } from "./client";

export type LocationState = {
  status: "waiting" | "sending" | "sent" | "error";
  message: string;
  sentAt?: string;
};

/** Foreground-only, explicitly started by the driver. Never queue stale GPS fixes. */
export function startLocationTracking({
  routeId,
  call,
  geolocation,
  document,
  onState,
  onDenied,
}: {
  routeId: string;
  call: PickupCall;
  geolocation: Pick<Geolocation, "getCurrentPosition">;
  document: Pick<
    Document,
    "visibilityState" | "addEventListener" | "removeEventListener"
  >;
  onState: (state: LocationState) => void;
  onDenied: () => void;
}) {
  let active = true,
    inFlight = false;
  const sample = () => {
    if (!active || inFlight || document.visibilityState !== "visible") return;
    inFlight = true;
    try {
      geolocation.getCurrentPosition(
        async (position) => {
          if (!active || document.visibilityState !== "visible") {
            inFlight = false;
            return;
          }
          onState({ status: "sending", message: "Передаём координаты…" });
          try {
            const result = await call<{
              accepted: boolean;
              warning?: string;
              measured_at?: string;
            }>({
              action: "location",
              id: routeId,
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy,
              measured_at: new Date(position.timestamp).toISOString(),
            });
            if (active)
              onState(
                result.warning
                  ? {
                      status: "error",
                      message: `GPS ненадёжен: ${result.warning}. Диспетчер видит предупреждение.`,
                    }
                  : result.accepted
                    ? {
                        status: "sent",
                        message: "Координаты переданы диспетчеру",
                        sentAt: result.measured_at,
                      }
                    : {
                        status: "waiting",
                        message: "Ожидаем новую позицию GPS",
                      },
              );
          } catch (error) {
            if (active) {
              onState({
                status: "error",
                message:
                  error instanceof ApiError
                    ? error.message
                    : "Нет связи. Повторим передачу с новыми координатами.",
              });
              if (
                error instanceof ApiError &&
                [400, 401, 403].includes(error.status)
              ) {
                active = false;
                onDenied();
              }
            }
          } finally {
            inFlight = false;
          }
        },
        (error) => {
          inFlight = false;
          if (!active) return;
          onState({
            status: "error",
            message:
              error.code === 1
                ? "Доступ к геолокации запрещён. Разрешите его в настройках устройства или браузера."
                : "Не удалось определить позицию. Проверьте геолокацию; попробуем снова.",
          });
          if (error.code === 1) {
            active = false;
            onDenied();
          }
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 },
      );
    } catch {
      inFlight = false;
      active = false;
      onState({
        status: "error",
        message:
          "Геолокация недоступна в этом приложении. Откройте маршрут в браузере по HTTPS.",
      });
      onDenied();
    }
  };
  onState({ status: "waiting", message: "Определяем местоположение…" });
  sample();
  const timer = setInterval(sample, 5 * 60 * 1000);
  const visible = () => {
    if (document.visibilityState === "visible") sample();
    else if (active)
      onState({
        status: "waiting",
        message: "Передача приостановлена, пока экран маршрута скрыт.",
      });
  };
  document.addEventListener("visibilitychange", visible);
  return () => {
    active = false;
    clearInterval(timer);
    document.removeEventListener("visibilitychange", visible);
  };
}
