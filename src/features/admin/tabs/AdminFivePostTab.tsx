import React, { useCallback, useEffect, useState } from "react";
import { Button, Flex, Panel, Typography } from "@maxhub/max-ui";
import { Loader2, Upload } from "lucide-react";
import {
  fetchAdminFivepostBatches,
  fetchAdminFivepostRows,
  importAdminFivepostFile,
  type FivepostBatchSummary,
  type FivepostRowDto,
} from "../../../api/client/admin/fivepostAdmin";

const ROUTE_LABELS: Record<string, string> = {
  mow_kgd: "Москва → Калининград",
  kgd_mow: "Калининград → Москва",
};

export function AdminFivePostTab({ adminToken }: { adminToken: string }) {
  const [batches, setBatches] = useState<FivepostBatchSummary[]>([]);
  const [rows, setRows] = useState<FivepostRowDto[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadBatches = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchAdminFivepostBatches(adminToken)
      .then(setBatches)
      .catch((e) => {
        setBatches([]);
        setError((e as Error)?.message || "Не удалось загрузить импорты");
      })
      .finally(() => setLoading(false));
  }, [adminToken]);

  useEffect(() => {
    loadBatches();
  }, [loadBatches]);

  const loadRows = useCallback(
    (batchId: number) => {
      setSelectedBatchId(batchId);
      setRowsLoading(true);
      setError(null);
      fetchAdminFivepostRows(adminToken, batchId)
        .then(setRows)
        .catch((e) => {
          setRows([]);
          setError((e as Error)?.message || "Не удалось загрузить строки");
        })
        .finally(() => setRowsLoading(false));
    },
    [adminToken],
  );

  const handleImport = async (file: File | null) => {
    if (!file) return;
    setImportLoading(true);
    setError(null);
    setMessage(null);
    try {
      const result = await importAdminFivepostFile(adminToken, file);
      setMessage(
        `Импортировано ${result.rowCount} строк, переведено ${result.translatedCount}. Пакет #${result.batchId}`,
      );
      loadBatches();
      loadRows(result.batchId);
    } catch (e) {
      setError((e as Error)?.message || "Ошибка импорта");
    } finally {
      setImportLoading(false);
    }
  };

  return (
    <Panel className="cargo-card" style={{ padding: "var(--pad-card, 1rem)" }}>
      <Typography.Body style={{ fontWeight: 600, marginBottom: "0.5rem" }}>5 POST — отгрузки OMNI</Typography.Body>
      <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginBottom: "0.75rem" }}>
        Загрузите Excel от 5 POST: парсинг всех полей, перевод английских наименований в колонке «Артикул вложения» через
        ChatGPT, сохранение в базу.
      </Typography.Body>

      <Flex gap="0.5rem" align="center" wrap="wrap" style={{ marginBottom: "0.75rem" }}>
        <label className="filter-button" style={{ display: "inline-flex", alignItems: "center", cursor: "pointer" }}>
          {importLoading ? <Loader2 className="w-4 h-4 animate-spin" style={{ marginRight: "0.35rem" }} /> : <Upload className="w-4 h-4" style={{ marginRight: "0.35rem" }} />}
          Загрузить Excel
          <input
            type="file"
            accept=".xlsx,.xls"
            style={{ display: "none" }}
            disabled={importLoading}
            onChange={(e) => void handleImport(e.target.files?.[0] ?? null)}
          />
        </label>
        <Button type="button" className="filter-button" disabled={loading} onClick={loadBatches}>
          Обновить список
        </Button>
      </Flex>

      {message && (
        <Typography.Body style={{ marginBottom: "0.5rem", fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>
          {message}
        </Typography.Body>
      )}
      {error && (
        <Typography.Body style={{ marginBottom: "0.5rem", fontSize: "0.85rem", color: "var(--color-danger, #c0392b)" }}>
          {error}
        </Typography.Body>
      )}

      {loading ? (
        <Flex align="center" gap="0.5rem">
          <Loader2 className="w-4 h-4 animate-spin" />
          <Typography.Body>Загрузка...</Typography.Body>
        </Flex>
      ) : batches.length === 0 ? (
        <Typography.Body style={{ color: "var(--color-text-secondary)" }}>Импортов пока нет</Typography.Body>
      ) : (
        <div style={{ overflowX: "auto", marginBottom: "1rem" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
            <thead>
              <tr style={{ background: "var(--color-bg-hover)", borderBottom: "1px solid var(--color-border)" }}>
                <th style={{ padding: "0.45rem 0.6rem", textAlign: "left" }}>ID</th>
                <th style={{ padding: "0.45rem 0.6rem", textAlign: "left" }}>Файл</th>
                <th style={{ padding: "0.45rem 0.6rem", textAlign: "left" }}>Маршрут</th>
                <th style={{ padding: "0.45rem 0.6rem", textAlign: "right" }}>Строк</th>
                <th style={{ padding: "0.45rem 0.6rem", textAlign: "right" }}>Перевод</th>
                <th style={{ padding: "0.45rem 0.6rem", textAlign: "left" }}>Дата</th>
                <th style={{ padding: "0.45rem 0.6rem" }} />
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => (
                <tr key={b.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                  <td style={{ padding: "0.45rem 0.6rem" }}>{b.id}</td>
                  <td style={{ padding: "0.45rem 0.6rem" }}>{b.filename}</td>
                  <td style={{ padding: "0.45rem 0.6rem" }}>{ROUTE_LABELS[b.route] || b.route}</td>
                  <td style={{ padding: "0.45rem 0.6rem", textAlign: "right" }}>{b.rowCount}</td>
                  <td style={{ padding: "0.45rem 0.6rem", textAlign: "right" }}>{b.translatedCount}</td>
                  <td style={{ padding: "0.45rem 0.6rem" }}>{new Date(b.createdAt).toLocaleString("ru-RU")}</td>
                  <td style={{ padding: "0.45rem 0.6rem" }}>
                    <Button type="button" className="filter-button" onClick={() => loadRows(b.id)}>
                      Открыть
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedBatchId != null && (
        <>
          <Typography.Body style={{ fontWeight: 600, marginBottom: "0.5rem" }}>
            Строки пакета #{selectedBatchId}
            {rowsLoading ? " …" : ` (${rows.length})`}
          </Typography.Body>
          {rowsLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <div style={{ overflowX: "auto", maxHeight: "55vh", overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
                <thead>
                  <tr style={{ background: "var(--color-bg-hover)", borderBottom: "1px solid var(--color-border)" }}>
                    <th style={{ padding: "0.35rem 0.5rem" }}>#</th>
                    <th style={{ padding: "0.35rem 0.5rem" }}>Заказ клиента</th>
                    <th style={{ padding: "0.35rem 0.5rem" }}>Заказ партнёра</th>
                    <th style={{ padding: "0.35rem 0.5rem" }}>ШК ТЕ</th>
                    <th style={{ padding: "0.35rem 0.5rem" }}>Мест</th>
                    <th style={{ padding: "0.35rem 0.5rem" }}>ШК OMNI</th>
                    <th style={{ padding: "0.35rem 0.5rem" }}>Наименование</th>
                    <th style={{ padding: "0.35rem 0.5rem" }}>Наименование RU</th>
                    <th style={{ padding: "0.35rem 0.5rem" }}>Цена</th>
                    <th style={{ padding: "0.35rem 0.5rem" }}>Сумма</th>
                    <th style={{ padding: "0.35rem 0.5rem" }}>Вес</th>
                    <th style={{ padding: "0.35rem 0.5rem" }}>Д×Ш×В</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                      <td style={{ padding: "0.35rem 0.5rem" }}>{r.lineNo}</td>
                      <td style={{ padding: "0.35rem 0.5rem" }}>{r.clientOrderNo}</td>
                      <td style={{ padding: "0.35rem 0.5rem" }}>{r.partnerOrderNo}</td>
                      <td style={{ padding: "0.35rem 0.5rem" }}>{r.teBarcode}</td>
                      <td style={{ padding: "0.35rem 0.5rem" }}>{r.placesCount}</td>
                      <td style={{ padding: "0.35rem 0.5rem" }}>{r.omniBarcode}</td>
                      <td style={{ padding: "0.35rem 0.5rem", maxWidth: 220 }}>{r.itemName}</td>
                      <td style={{ padding: "0.35rem 0.5rem", maxWidth: 220 }}>{r.itemNameRu}</td>
                      <td style={{ padding: "0.35rem 0.5rem" }}>{r.unitCost ?? "—"}</td>
                      <td style={{ padding: "0.35rem 0.5rem" }}>{r.totalCost ?? "—"}</td>
                      <td style={{ padding: "0.35rem 0.5rem" }}>{r.weightG ?? "—"}</td>
                      <td style={{ padding: "0.35rem 0.5rem" }}>
                        {[r.lengthMm, r.widthMm, r.heightMm].map((v) => v ?? "—").join("×")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Panel>
  );
}
