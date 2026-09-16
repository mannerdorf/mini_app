import React, { useCallback, useEffect, useState } from "react";
import { Flex, Typography } from "@maxhub/max-ui";
import { RefreshCw, Trash2 } from "lucide-react";
import {
  adminDeleteCompletedPickupRoute,
  fetchAdminPickupDispatchSnapshot,
  type AdminPickupRouteRow,
} from "../../../api/client/admin/pickupDispatch";
import { PickupRouteStatusBadge } from "../../pickup/PickupRouteStatusBadge";
import { pickupRouteCanSuperAdminDeleteCompleted } from "../../../../lib/pickup/model";

const CITY_OPTIONS = [
  { value: "moscow" as const, label: "Москва" },
  { value: "kaliningrad" as const, label: "Калининград" },
];

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function AdminPickupDispatchSection({ adminToken }: { adminToken: string }) {
  const [city, setCity] = useState<"moscow" | "kaliningrad">("moscow");
  const [date, setDate] = useState(todayIso);
  const [routes, setRoutes] = useState<AdminPickupRouteRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!adminToken) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAdminPickupDispatchSnapshot(adminToken, { city, date });
      setRoutes(data.routes ?? []);
    } catch (e: unknown) {
      setRoutes([]);
      setError((e as Error)?.message || "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, [adminToken, city, date]);

  useEffect(() => {
    void load();
  }, [load]);

  const deleteRoute = async (route: AdminPickupRouteRow) => {
    const prompt =
      "Заборы останутся в журнале дня без привязки к маршруту. Удалить завершённый маршрут «" +
      route.name +
      "»?";
    if (!window.confirm(prompt)) return;
    setBusyId(route.id);
    setError(null);
    setNotice(null);
    try {
      await adminDeleteCompletedPickupRoute(adminToken, {
        id: route.id,
        version: route.version,
      });
      setNotice("Маршрут удалён");
      await load();
    } catch (e: unknown) {
      setError((e as Error)?.message || "Не удалось удалить");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <Typography.Title style={{ marginBottom: "0.5rem" }}>Диспетчеризация заборов</Typography.Title>
      <Typography.Body style={{ color: "var(--color-text-secondary)", marginBottom: "1rem" }}>
        Просмотр маршрутов по городу и дате. Завершённые маршруты можно удалить — заборы останутся в
        списке дня без маршрута (история заборов и фото сохраняются).
      </Typography.Body>

      <Flex align="center" gap="0.5rem" wrap="wrap" style={{ marginBottom: "1rem" }}>
        <select
          className="admin-form-input"
          value={city}
          onChange={(e) => setCity(e.target.value as "moscow" | "kaliningrad")}
          aria-label="Город"
        >
          {CITY_OPTIONS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <input
          type="date"
          className="admin-form-input"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          aria-label="Дата"
        />
        <button type="button" className="button-secondary" disabled={loading} onClick={() => void load()}>
          <RefreshCw className="w-4 h-4" style={{ marginRight: "0.35rem", verticalAlign: "middle" }} />
          Обновить
        </button>
      </Flex>

      {error && (
        <p className="admin-error" style={{ marginBottom: "0.75rem" }}>
          {error}
        </p>
      )}
      {notice && (
        <p style={{ marginBottom: "0.75rem", color: "var(--color-success, #15803d)" }}>{notice}</p>
      )}

      {loading ? (
        <Typography.Body>Загрузка…</Typography.Body>
      ) : !routes.length ? (
        <Typography.Body style={{ color: "var(--color-text-secondary)" }}>
          На выбранную дату маршрутов нет.
        </Typography.Body>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Время</th>
                <th>Маршрут</th>
                <th>Статус</th>
                <th>Водитель</th>
                <th>Авто</th>
                <th>Заборы</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {routes.map((r) => (
                <tr key={r.id}>
                  <td>{r.start_time}</td>
                  <td>{r.name}</td>
                  <td>
                    <PickupRouteStatusBadge status={r.status} />
                  </td>
                  <td>{r.driverName || "—"}</td>
                  <td>{r.vehiclePlate || "—"}</td>
                  <td>
                    {r.collectedCount} / {r.jobCount}
                  </td>
                  <td>
                    {pickupRouteCanSuperAdminDeleteCompleted(r.status) && (
                      <button
                        type="button"
                        className="filter-button"
                        style={{ color: "#dc2626" }}
                        disabled={busyId === r.id}
                        title="Удалить завершённый маршрут"
                        onClick={() => void deleteRoute(r)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
