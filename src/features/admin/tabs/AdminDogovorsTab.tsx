import React, { useCallback, useEffect, useState } from "react";
import { Button, Flex, Panel, Typography } from "@maxhub/max-ui";
import { Download, Loader2 } from "lucide-react";
import {
  downloadAdminDocument,
  fetchAdminDogovorsList,
  formatDocDateForDownload,
  postAdminCacheRefresh,
  type AdminDogovorRow,
} from "../../../api/client/admin/catalogs";
import { getCachedDocumentEdoInfo } from "../../../lib/edoStatus";
import { DocumentsEdoTableStatus } from "../../../features/documents/views/documentsViewBlocks";
import { formatDisplayDate } from "../../../lib/dateUtils";
import { stripOoo } from "../../../lib/formatUtils";
import { downloadBase64File } from "../../../utils";
import { SyncDebugPanel } from "../lib/SyncDebugPanel";
import { buildSyncDebugFromError, buildSyncDebugFromResponse } from "../lib/syncDebug";

const DOGOVORS_UPSTREAM_CURL_FALLBACK = `curl --location 'https://tdn.postb.ru/workbase/hs/DeliveryWebService/GETAPI?metod=GETdogovors' --header 'Auth: Basic Info@haulz.pro:Y2ME42XyI_' --header 'Authorization: Basic YWRtaW46anVlYmZueWU='`;

export function AdminDogovorsTab({ adminToken }: { adminToken: string }) {
  const [dogovorsList, setDogovorsList] = useState<AdminDogovorRow[]>([]);
  const [dogovorsLoading, setDogovorsLoading] = useState(false);
  const [dogovorsFetchTrigger, setDogovorsFetchTrigger] = useState(0);
  const [dogovorsSyncLoading, setDogovorsSyncLoading] = useState(false);
  const [dogovorsSyncMessage, setDogovorsSyncMessage] = useState<string | null>(null);
  const [dogovorsSyncDebugRequest, setDogovorsSyncDebugRequest] = useState("");
  const [dogovorsSyncDebugResponse, setDogovorsSyncDebugResponse] = useState("");
  const [dogovorsDownloadingId, setDogovorsDownloadingId] = useState<number | null>(null);
  const [dogovorsDownloadError, setDogovorsDownloadError] = useState<string | null>(null);

  useEffect(() => {
    setDogovorsLoading(true);
    fetchAdminDogovorsList()
      .then(setDogovorsList)
      .catch(() => setDogovorsList([]))
      .finally(() => setDogovorsLoading(false));
  }, [dogovorsFetchTrigger]);

  const downloadDogovorFile = useCallback(async (row: { id: number; docNumber: string; docDate: string | null; customerInn: string }) => {
    const number = String(row.docNumber || "").trim();
    const dateDog = formatDocDateForDownload(row.docDate);
    const inn = String(row.customerInn || "").trim();
    if (!number || !dateDog || !inn) return;
    setDogovorsDownloadingId(row.id);
    setDogovorsDownloadError(null);
    try {
      const data = await downloadAdminDocument({ metod: "Договор", number, dateDog, inn });
      await downloadBase64File({
        data: data.data,
        name: data.name || `Договор_${number}.pdf`,
        isHtml: Boolean(data.isHtml),
      });
    } catch (e: unknown) {
      setDogovorsDownloadError((e as Error)?.message || "Ошибка скачивания");
    } finally {
      setDogovorsDownloadingId(null);
    }
  }, []);

  const runDogovorsSync = useCallback(async () => {
    setDogovorsSyncLoading(true);
    setDogovorsSyncMessage(null);
    setDogovorsSyncDebugResponse("");
    setDogovorsSyncDebugRequest("");
    const endpoint = "/api/admin-refresh-dogovors-cache";
    const base = typeof window !== "undefined" ? window.location.origin : "";
    const internalCurl = `curl -X POST "${base}${endpoint}" -H "Authorization: Bearer <adminToken>"`;
    try {
      const { ok, status, data, text } = await postAdminCacheRefresh(adminToken, endpoint);
      const debug = buildSyncDebugFromResponse(status, text, data, internalCurl, DOGOVORS_UPSTREAM_CURL_FALLBACK);
      setDogovorsSyncDebugRequest(debug.debugRequest);
      setDogovorsSyncDebugResponse(debug.debugResponse);
      if (!ok) throw new Error((data.error as string) || "Не удалось обновить справочник договоров");
      setDogovorsSyncMessage(`Обновлено: ${Number(data.dogovors_count ?? 0)} записей`);
      setDogovorsFetchTrigger((n) => n + 1);
    } catch (e: unknown) {
      setDogovorsSyncMessage((e as Error)?.message || "Не удалось обновить справочник договоров");
      const errDebug = buildSyncDebugFromError(DOGOVORS_UPSTREAM_CURL_FALLBACK, (e as Error)?.message || "Неизвестная ошибка");
      setDogovorsSyncDebugRequest(errDebug.debugRequest);
      setDogovorsSyncDebugResponse(errDebug.debugResponse);
    } finally {
      setDogovorsSyncLoading(false);
    }
  }, [adminToken]);

  return (
    <Panel className="cargo-card" style={{ padding: "var(--pad-card, 1rem)" }}>
      <Typography.Body style={{ fontWeight: 600, marginBottom: "0.5rem" }}>Справочник Договоры</Typography.Body>
      <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginBottom: "0.75rem" }}>
        Данные загружаются из GETAPI?metod=GETdogovors и обновляются кроном раз в 24 часа.
      </Typography.Body>
      <Flex gap="var(--element-gap, 0.75rem)" align="center" wrap="wrap" style={{ marginBottom: "var(--space-3, 0.75rem)" }}>
        <Button type="button" className="filter-button" disabled={dogovorsLoading} onClick={() => setDogovorsFetchTrigger((n) => n + 1)}>
          {dogovorsLoading ? <Loader2 className="w-4 h-4 animate-spin" style={{ verticalAlign: "middle", marginRight: "0.35rem" }} /> : null}
          Обновить
        </Button>
        <Button type="button" className="button-primary" disabled={dogovorsSyncLoading} onClick={() => void runDogovorsSync()}>
          {dogovorsSyncLoading ? <Loader2 className="w-4 h-4 animate-spin" style={{ verticalAlign: "middle", marginRight: "0.35rem" }} /> : null}
          Обновить из 1С
        </Button>
      </Flex>
      {dogovorsSyncMessage && (
        <Typography.Body style={{ marginBottom: "0.65rem", fontSize: "0.82rem", color: "var(--color-text-secondary)" }}>
          {dogovorsSyncMessage}
        </Typography.Body>
      )}
      {dogovorsDownloadError && (
        <Typography.Body style={{ marginBottom: "0.65rem", fontSize: "0.82rem", color: "#ef4444" }}>
          {dogovorsDownloadError}
        </Typography.Body>
      )}
      <SyncDebugPanel debugRequest={dogovorsSyncDebugRequest} debugResponse={dogovorsSyncDebugResponse} />
      {dogovorsLoading ? (
        <Flex align="center" gap="0.5rem">
          <Loader2 className="w-4 h-4 animate-spin" />
          <Typography.Body>Загрузка...</Typography.Body>
        </Flex>
      ) : dogovorsList.length === 0 ? (
        <Typography.Body style={{ color: "var(--color-text-secondary)" }}>Справочник пуст</Typography.Body>
      ) : (
        <div style={{ overflowX: "auto", maxHeight: "60vh", overflowY: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
            <thead>
              <tr style={{ background: "var(--color-bg-hover)", borderBottom: "1px solid var(--color-border)" }}>
                <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>Номер</th>
                <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>Дата</th>
                <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>Контрагент</th>
                <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>ИНН</th>
                <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>Наименование</th>
                <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>ЭДО</th>
                <th style={{ padding: "0.5rem 0.75rem", textAlign: "right", fontWeight: 600 }}></th>
              </tr>
            </thead>
            <tbody>
              {dogovorsList.map((row) => {
                const hasDownload = row.docNumber && row.docDate && row.customerInn;
                const isDownloading = dogovorsDownloadingId === row.id;
                const edoInfo = getCachedDocumentEdoInfo(row);
                return (
                  <tr key={row.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                    <td style={{ padding: "0.5rem 0.75rem", whiteSpace: "nowrap" }}>{row.docNumber || "—"}</td>
                    <td style={{ padding: "0.5rem 0.75rem", whiteSpace: "nowrap" }}>{row.docDate ? formatDisplayDate(row.docDate) : "—"}</td>
                    <td style={{ padding: "0.5rem 0.75rem" }}>{stripOoo(row.customerName) || "—"}</td>
                    <td style={{ padding: "0.5rem 0.75rem", whiteSpace: "nowrap" }}>{row.customerInn || "—"}</td>
                    <td style={{ padding: "0.5rem 0.75rem" }}>{row.title || "—"}</td>
                    <td style={{ padding: "0.5rem 0.75rem", whiteSpace: "nowrap" }}><DocumentsEdoTableStatus info={edoInfo} /></td>
                    <td style={{ padding: "0.5rem 0.75rem", textAlign: "right" }}>
                      {hasDownload ? (
                        <Button
                          type="button"
                          className="filter-button"
                          style={{ fontSize: "0.8rem", padding: "0.25rem 0.5rem" }}
                          disabled={isDownloading}
                          onClick={() => void downloadDogovorFile(row)}
                        >
                          {isDownloading ? <Loader2 className="w-4 h-4 animate-spin" style={{ verticalAlign: "middle", marginRight: "0.25rem" }} /> : <Download className="w-4 h-4" style={{ verticalAlign: "middle", marginRight: "0.25rem" }} />}
                          Скачать
                        </Button>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {!dogovorsLoading && dogovorsList.length > 0 && (
        <Typography.Body style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", marginTop: "0.5rem" }}>
          Записей: {dogovorsList.length}
        </Typography.Body>
      )}
    </Panel>
  );
}
