import React, { useEffect, useState } from "react";
import { Button, Flex, Panel, Typography } from "@maxhub/max-ui";
import { Loader2 } from "lucide-react";
import { fetchAdminTariffsList, postAdminCacheRefresh, type AdminTariffRow } from "../../../api/client/admin/catalogs";
import { stripOoo } from "../../../lib/formatUtils";
import { formatDisplayDate } from "../../../lib/dateUtils";
import { SyncDebugPanel } from "../lib/SyncDebugPanel";
import { buildSyncDebugFromError, buildSyncDebugFromResponse } from "../lib/syncDebug";

const TARIFFS_UPSTREAM_CURL_FALLBACK = `curl --location 'https://tdn.postb.ru/workbase/hs/DeliveryWebService/GETAPI?metod=GETTarifs' --header 'Auth: Basic Info@haulz.pro:Y2ME42XyI_' --header 'Authorization: Basic YWRtaW46anVlYmZueWU='`;

export function AdminTariffsTab({ adminToken }: { adminToken: string }) {
  const [tariffsList, setTariffsList] = useState<AdminTariffRow[]>([]);
  const [tariffsLoading, setTariffsLoading] = useState(false);
  const [tariffsFetchTrigger, setTariffsFetchTrigger] = useState(0);
  const [tariffsSyncLoading, setTariffsSyncLoading] = useState(false);
  const [tariffsSyncMessage, setTariffsSyncMessage] = useState<string | null>(null);
  const [tariffsSyncDebugRequest, setTariffsSyncDebugRequest] = useState("");
  const [tariffsSyncDebugResponse, setTariffsSyncDebugResponse] = useState("");

  useEffect(() => {
    setTariffsLoading(true);
    fetchAdminTariffsList()
      .then(setTariffsList)
      .catch(() => setTariffsList([]))
      .finally(() => setTariffsLoading(false));
  }, [tariffsFetchTrigger]);

  const runTariffsSync = async () => {
    setTariffsSyncLoading(true);
    setTariffsSyncMessage(null);
    setTariffsSyncDebugResponse("");
    setTariffsSyncDebugRequest("");
    const endpoint = "/api/admin-refresh-tariffs-cache";
    const base = typeof window !== "undefined" ? window.location.origin : "";
    const internalCurl = `curl -X POST "${base}${endpoint}" -H "Authorization: Bearer <adminToken>"`;
    try {
      const { ok, status, data, text } = await postAdminCacheRefresh(adminToken, endpoint);
      const debug = buildSyncDebugFromResponse(status, text, data, internalCurl, TARIFFS_UPSTREAM_CURL_FALLBACK);
      setTariffsSyncDebugRequest(debug.debugRequest);
      setTariffsSyncDebugResponse(debug.debugResponse);
      if (!ok) throw new Error((data.error as string) || "Не удалось обновить справочник тарифов");
      setTariffsSyncMessage(`Обновлено: ${Number(data.tariffs_count ?? 0)} записей`);
      setTariffsFetchTrigger((n) => n + 1);
    } catch (e: unknown) {
      setTariffsSyncMessage((e as Error)?.message || "Не удалось обновить справочник тарифов");
      const errDebug = buildSyncDebugFromError(TARIFFS_UPSTREAM_CURL_FALLBACK, (e as Error)?.message || "Неизвестная ошибка");
      setTariffsSyncDebugRequest(errDebug.debugRequest);
      setTariffsSyncDebugResponse(errDebug.debugResponse);
    } finally {
      setTariffsSyncLoading(false);
    }
  };

  return (
    <Panel className="cargo-card" style={{ padding: "var(--pad-card, 1rem)" }}>
      <Typography.Body style={{ fontWeight: 600, marginBottom: "0.5rem" }}>Справочник Тарифы</Typography.Body>
      <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginBottom: "0.75rem" }}>
        Данные загружаются из GETAPI?metod=GETTarifs и обновляются кроном каждые 6 часов.
      </Typography.Body>
      <Flex gap="var(--element-gap, 0.75rem)" align="center" wrap="wrap" style={{ marginBottom: "var(--space-3, 0.75rem)" }}>
        <Button
          type="button"
          className="filter-button"
          disabled={tariffsLoading}
          onClick={() => setTariffsFetchTrigger((n) => n + 1)}
        >
          {tariffsLoading ? <Loader2 className="w-4 h-4 animate-spin" style={{ verticalAlign: "middle", marginRight: "0.35rem" }} /> : null}
          Обновить
        </Button>
        <Button type="button" className="button-primary" disabled={tariffsSyncLoading} onClick={() => void runTariffsSync()}>
          {tariffsSyncLoading ? <Loader2 className="w-4 h-4 animate-spin" style={{ verticalAlign: "middle", marginRight: "0.35rem" }} /> : null}
          Обновить из 1С
        </Button>
      </Flex>
      {tariffsSyncMessage && (
        <Typography.Body style={{ marginBottom: "0.65rem", fontSize: "0.82rem", color: "var(--color-text-secondary)" }}>
          {tariffsSyncMessage}
        </Typography.Body>
      )}
      <SyncDebugPanel debugRequest={tariffsSyncDebugRequest} debugResponse={tariffsSyncDebugResponse} />
      {tariffsLoading ? (
        <Flex align="center" gap="0.5rem">
          <Loader2 className="w-4 h-4 animate-spin" />
          <Typography.Body>Загрузка...</Typography.Body>
        </Flex>
      ) : tariffsList.length === 0 ? (
        <Typography.Body style={{ color: "var(--color-text-secondary)" }}>Справочник пуст</Typography.Body>
      ) : (
        <div style={{ overflowX: "auto", maxHeight: "60vh", overflowY: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
            <thead>
              <tr style={{ background: "var(--color-bg-hover)", borderBottom: "1px solid var(--color-border)" }}>
                <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>Дата</th>
                <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>Номер</th>
                <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>Заказчик</th>
                <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>ИНН</th>
                <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>Город отправления</th>
                <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>Город назначения</th>
                <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>Вид перевозки</th>
                <th style={{ padding: "0.5rem 0.75rem", textAlign: "center", fontWeight: 600 }}>ОГ</th>
                <th style={{ padding: "0.5rem 0.75rem", textAlign: "center", fontWeight: 600 }}>ВС</th>
                <th style={{ padding: "0.5rem 0.75rem", textAlign: "right", fontWeight: 600 }}>Тариф</th>
              </tr>
            </thead>
            <tbody>
              {tariffsList.map((t) => (
                <tr key={t.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                  <td style={{ padding: "0.5rem 0.75rem", whiteSpace: "nowrap" }}>{t.docDate ? formatDisplayDate(t.docDate) : "—"}</td>
                  <td style={{ padding: "0.5rem 0.75rem", whiteSpace: "nowrap" }}>{t.docNumber || "—"}</td>
                  <td style={{ padding: "0.5rem 0.75rem" }}>{stripOoo(t.customerName) || "—"}</td>
                  <td style={{ padding: "0.5rem 0.75rem", whiteSpace: "nowrap" }}>{t.customerInn || "—"}</td>
                  <td style={{ padding: "0.5rem 0.75rem" }}>{t.cityFrom || "—"}</td>
                  <td style={{ padding: "0.5rem 0.75rem" }}>{t.cityTo || "—"}</td>
                  <td style={{ padding: "0.5rem 0.75rem" }}>{t.transportType || "—"}</td>
                  <td style={{ padding: "0.5rem 0.75rem", textAlign: "center" }}>{t.isDangerous ? "Да" : "Нет"}</td>
                  <td style={{ padding: "0.5rem 0.75rem", textAlign: "center" }}>{t.isVet ? "Да" : "Нет"}</td>
                  <td style={{ padding: "0.5rem 0.75rem", textAlign: "right", whiteSpace: "nowrap" }}>
                    {t.tariff != null ? Number(t.tariff).toLocaleString("ru-RU") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!tariffsLoading && tariffsList.length > 0 && (
        <Typography.Body style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", marginTop: "0.5rem" }}>
          Записей: {tariffsList.length}
        </Typography.Body>
      )}
    </Panel>
  );
}
