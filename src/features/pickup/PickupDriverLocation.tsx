import React, { useEffect, useState } from "react";
import { LocateFixed } from "lucide-react";
import type { PickupCall } from "./client";
import { startLocationTracking, type LocationState } from "./locationTracking";

export function PickupDriverLocation({
  routeId,
  available,
  call,
}: {
  routeId: string;
  available: boolean;
  call: PickupCall;
}) {
  const [enabled, setEnabled] = useState(false);
  const [state, setState] = useState<LocationState | null>(null);
  useEffect(() => {
    if (!enabled || !available) return;
    if (!navigator.geolocation) {
      setState({
        status: "error",
        message:
          "Устройство не поддерживает геолокацию. Откройте маршрут в браузере по HTTPS.",
      });
      setEnabled(false);
      return;
    }
    return startLocationTracking({
      routeId,
      call,
      geolocation: navigator.geolocation,
      document,
      onState: setState,
      onDenied: () => setEnabled(false),
    });
  }, [enabled, available, routeId, call]);
  return (
    <section
      className={`pk-driver-location ${state?.status === "error" ? "pk-driver-location--error" : ""}`}
      aria-label="Местоположение водителя"
    >
      <div className="pk-section-heading">
        <strong>
          <LocateFixed size={18} /> Моя геолокация
        </strong>
        <span className="pk-hint">{enabled ? "Включена" : "Выключена"}</span>
      </div>
      <p className="pk-hint">
        Диспетчер увидит вашу позицию на карте. Передаём её каждые 5 минут,
        пока этот экран открыт. После выхода или блокировки экрана обновление
        прекращается.
      </p>
      {!available ? (
        <p className="pk-warning">
          Передача GPS пока не подключена администратором.
        </p>
      ) : (
        <button
          type="button"
          className={enabled ? "" : "pk-primary"}
          onClick={() => {
            if (enabled) setState(null);
            setEnabled(!enabled);
          }}
        >
          {enabled ? "Отключить передачу GPS" : "Передавать моё местоположение"}
        </button>
      )}
      {state && (
        <p
          role="status"
          className={state.status === "error" ? "pk-warning" : "pk-hint"}
        >
          {state.message}
          {state.sentAt &&
            ` · ${new Date(state.sentAt).toLocaleTimeString("ru-RU")}`}
        </p>
      )}
      {!enabled && !state && (
        <p className="pk-hint">
          После отключения на мониторе останется последняя позиция с временем её
          получения.
        </p>
      )}
    </section>
  );
}
