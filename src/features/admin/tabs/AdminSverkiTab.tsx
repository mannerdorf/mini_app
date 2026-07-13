import React, { useCallback, useEffect, useState } from "react";
import { Button, Flex, Panel, Typography } from "@maxhub/max-ui";
import { Download, Loader2 } from "lucide-react";
import {
  downloadAdminDocument,
  fetchAdminSverkiList,
  formatDocDateForDownload,
  postAdminCacheRefresh,
  type AdminSverkiRow,
} from "../../../api/client/admin/catalogs";
import { getCachedDocumentEdoInfo } from "../../../lib/edoStatus";
import { DocumentsEdoTableStatus } from "../../../features/documents/views/documentsViewBlocks";
import { formatDisplayDate } from "../../../lib/dateUtils";
import { stripOoo } from "../../../lib/formatUtils";
import { downloadBase64File } from "../../../utils";
import { SyncDebugPanel } from "../lib/SyncDebugPanel";
import { buildSyncDebugFromError, buildSyncDebugFromResponse } from "../lib/syncDebug";

const SVERKI_UPSTREAM_CURL_FALLBACK = `curl --location 'https://tdn.postb.ru/workbase/hs/DeliveryWebService/GETAPI?metod=GETsverki' --header 'Auth: Basic Info@haulz.pro:Y2ME42XyI_' --header 'Authorization: Basic YWRtaW46anVlYmZueWU='`;

export function AdminSverkiTab({ adminToken }: { adminToken: string }) {
  const [sverkiList, setSverkiList] = useState<AdminSverkiRow[]>([]);
  const [sverkiLoading, setSverkiLoading] = useState(false);
  const [sverkiFetchTrigger, setSverkiFetchTrigger] = useState(0);
  const [sverkiSyncLoading, setSverkiSyncLoading] = useState(false);
  const [sverkiSyncMessage, setSverkiSyncMessage] = useState<string | null>(null);
  const [sverkiDownloadingId, setSverkiDownloadingId] = useState<number | null>(null);
  const [sverkiDownloadError, setSverkiDownloadError] = useState<string | null>(null);
  const [sverkiSyncDebugRequest, setSverkiSyncDebugRequest] = useState("");
  const [sverkiSyncDebugResponse, setSverkiSyncDebugResponse] = useState("");

  useEffect(() => {
    setSverkiLoading(true);
    fetchAdminSverkiList()
      .then(setSverkiList)
      .catch(() => setSverkiList([]))
      .finally(() => setSverkiLoading(false));
  }, [sverkiFetchTrigger]);

  const downloadSverkaFile = useCallback(async (row: { id: number; docNumber: string; docDate: string | null }) => {
    const number = String(row.docNumber || "").trim();
    const dateDoc = formatDocDateForDownload(row.docDate);
    if (!number || !dateDoc) return;
    setSverkiDownloadingId(row.id);
    setSverkiDownloadError(null);
    try {
      const data = await downloadAdminDocument({ metod: "АктСверки", number, dateDoc });
      await downloadBase64File({
        data: data.data,
        name: data.name || `АктСверки_${number}.pdf`,
        isHtml: Boolean(data.isHtml),
      });
    } catch (e: unknown) {
      setSverkiDownloadError((e as Error)?.message || "Ошибка скачивания");
    } finally {
      setSverkiDownloadingId(null);
    }
  }, []);

  const runSverkiSync = useCallback(async () => {
    setSverkiSyncLoading(true);
    setSverkiSyncMessage(null);
    setSverkiSyncDebugResponse("");
    setSverkiSyncDebugRequest("");
    const endpoint = "/api/admin-refresh-sverki-cache";
    const base = typeof window !== "undefined" ? window.location.origin : "";
    const internalCurl = `curl -X POST "${base}${endpoint}" -H "Authorization: Bearer <adminToken>"`;
    try {
      const { ok, status, data, text } = await postAdminCacheRefresh(adminToken, endpoint);
      const debug = buildSyncDebugFromResponse(status, text, data, internalCurl, SVERKI_UPSTREAM_CURL_FALLBACK);
      setSverkiSyncDebugRequest(debug.debugRequest);
      setSverkiSyncDebugResponse(debug.debugResponse);
      if (!ok) throw new Error((data.error as string) || "Не удалось обновить справочник актов сверок");
      setSverkiSyncMessage(`Обновлено: ${Number(data.sverki_count ?? 0)} записей`);
      setSverkiFetchTrigger((n) => n + 1);
    } catch (e: unknown) {
      setSverkiSyncMessage((e as Error)?.message || "Не удалось обновить справочник актов сверок");
      const errDebug = buildSyncDebugFromError(SVERKI_UPSTREAM_CURL_FALLBACK, (e as Error)?.message || "Неизвестная ошибка");
      setSverkiSyncDebugRequest(errDebug.debugRequest);
      setSverkiSyncDebugResponse(errDebug.debugResponse);
    } finally {
      setSverkiSyncLoading(false);
    }
  }, [adminToken]);

  return (
    <Panel className="cargo-card" style={{ padding: "var(--pad-card, 1rem)" }}>
      <Typography.Body style={{ fontWeight: 600, marginBottom: "0.5rem" }}>Справочник Акты сверок</Typography.Body>
      <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginBottom: "0.75rem" }}>
        Данные загружаются из GETAPI?metod=GETsverki и обновляются кроном раз в 24 часа.
      </Typography.Body>
      <Flex gap="var(--element-gap, 0.75rem)" align="center" wrap="wrap" style={{ marginBottom: "var(--space-3, 0.75rem)" }}>
        <Button type="button" className="filter-button" disabled={sverkiLoading} onClick={() => setSverkiFetchTrigger((n) => n + 1)}>
          {sverkiLoading ? <Loader2 className="w-4 h-4 animate-spin" style={{ verticalAlign: "middle", marginRight: "0.35rem" }} /> : null}
          Обновить
        </Button>
        <Button type="button" className="button-primary" disabled={sverkiSyncLoading} onClick={() => void runSverkiSync()}>
          {sverkiSyncLoading ? <Loader2 className="w-4 h-4 animate-spin" style={{ verticalAlign: "middle", marginRight: "0.35rem" }} /> : null}
          Обновить из 1С
        </Button>
      </Flex>
      {sverkiSyncMessage && (
        <Typography.Body style={{ marginBottom: "0.65rem", fontSize: "0.82rem", color: "var(--color-text-secondary)" }}>
          {sverkiSyncMessage}
        </Typography.Body>
      )}
      {sverkiDownloadError && (
        <Typography.Body style={{ marginBottom: "0.65rem", fontSize: "0.82rem", color: "#ef4444" }}>
          {sverkiDownloadError}
        </Typography.Body>
      )}
      <SyncDebugPanel debugRequest={sverkiSyncDebugRequest} debugResponse={sverkiSyncDebugResponse} />
      {sverkiLoading ? (
        <Flex align="center" gap="0.5rem">
          <Loader2 className="w-4 h-4 animate-spin" />
          <Typography.Body>Загрузка...</Typography.Body>
        </Flex>
      ) : sverkiList.length === 0 ? (
        <Typography.Body style={{ color: "var(--color-text-secondary)" }}>Справочник пуст</Typography.Body>
      ) : (
        <div style={{ overflowX: "auto", maxHeight: "60vh", overflowY: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
            <thead>
              <tr style={{ background: "var(--color-bg-hover)", borderBottom: "1px solid var(--color-border)" }}>
                <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>Номер</th>
                <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>Дата</th>
                <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>Период с</th>
                <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>Период по</th>
                <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>Контрагент</th>
                <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>ИНН</th>
                <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>ЭДО</th>
                <th style={{ padding: "0.5rem 0.75rem", textAlign: "right", fontWeight: 600 }}></th>
              </tr>
            </thead>
            <tbody>
              {sverkiList.map((row) => {
                const number = String(row.docNumber || "").trim();
                const hasDownload = number && row.docDate;
                const isDownloading = sverkiDownloadingId === row.id;
                const edoInfo = getCachedDocumentEdoInfo(row);
                return (
                  <tr key={row.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                    <td style={{ padding: "0.5rem 0.75rem", whiteSpace: "nowrap" }}>{row.docNumber || "—"}</td>
                    <td style={{ padding: "0.5rem 0.75rem", whiteSpace: "nowrap" }}>{row.docDate ? formatDisplayDate(row.docDate) : "—"}</td>
                    <td style={{ padding: "0.5rem 0.75rem", whiteSpace: "nowrap" }}>{row.periodFrom ? formatDisplayDate(row.periodFrom) : "—"}</td>
                    <td style={{ padding: "0.5rem 0.75rem", whiteSpace: "nowrap" }}>{row.periodTo ? formatDisplayDate(row.periodTo) : "—"}</td>
                    <td style={{ padding: "0.5rem 0.75rem" }}>{stripOoo(row.customerName) || "—"}</td>
                    <td style={{ padding: "0.5rem 0.75rem", whiteSpace: "nowrap" }}>{row.customerInn || "—"}</td>
                    <td style={{ padding: "0.5rem 0.75rem", whiteSpace: "nowrap" }}><DocumentsEdoTableStatus info={edoInfo} /></td>
                    <td style={{ padding: "0.5rem 0.75rem", textAlign: "right" }}>
                      {hasDownload ? (
                        <Button
                          type="button"
                          className="filter-button"
                          style={{ fontSize: "0.8rem", padding: "0.25rem 0.5rem" }}
                          disabled={isDownloading}
                          onClick={() => void downloadSverkaFile(row)}
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
      {!sverkiLoading && sverkiList.length > 0 && (
        <Typography.Body style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", marginTop: "0.5rem" }}>
          Записей: {sverkiList.length}
        </Typography.Body>
      )}
    </Panel>
  );
}
