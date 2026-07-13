import React, { useCallback, useEffect, useState } from "react";
import { Button, Flex, Panel, Typography, Input } from "@maxhub/max-ui";
import { ChevronDown, ChevronUp, ChevronsUpDown, Loader2 } from "lucide-react";
import { searchAdminSuppliers, postAdminRefreshSuppliersCache } from "../../../api/client/admin/suppliers";
import { SyncDebugPanel } from "../lib/SyncDebugPanel";
import { buildSyncDebugFromError, buildSyncDebugFromResponse } from "../lib/syncDebug";

export function AdminSuppliersTab({ adminToken, isSuperAdmin }: { adminToken: string; isSuperAdmin: boolean }) {
  const [suppliersList, setSuppliersList] = useState<{ inn: string; supplier_name: string; email: string }[]>([]);
  const [suppliersSearch, setSuppliersSearch] = useState("");
  const [suppliersShowOnlyWithoutEmail, setSuppliersShowOnlyWithoutEmail] = useState(false);
  const [suppliersSortBy, setSuppliersSortBy] = useState<"inn" | "supplier_name" | "email">("supplier_name");
  const [suppliersSortOrder, setSuppliersSortOrder] = useState<"asc" | "desc">("asc");
  const [suppliersLoading, setSuppliersLoading] = useState(false);
  const [suppliersFetchTrigger, setSuppliersFetchTrigger] = useState(0);
  const [suppliersSyncLoading, setSuppliersSyncLoading] = useState(false);
  const [suppliersSyncMessage, setSuppliersSyncMessage] = useState<string | null>(null);
  const [suppliersSyncDebugRequest, setSuppliersSyncDebugRequest] = useState("");
  const [suppliersSyncDebugResponse, setSuppliersSyncDebugResponse] = useState("");

  useEffect(() => {
    setSuppliersLoading(true);
    const query = suppliersSearch.trim();
    searchAdminSuppliers(adminToken, { q: query, limit: query.length >= 2 ? 500 : 10000 })
      .then(setSuppliersList)
      .catch(() => setSuppliersList([]))
      .finally(() => setSuppliersLoading(false));
  }, [suppliersSearch, adminToken, suppliersFetchTrigger]);

  const runSuppliersSync = useCallback(async () => {
    setSuppliersSyncLoading(true);
    setSuppliersSyncMessage(null);
    setSuppliersSyncDebugResponse("");
    setSuppliersSyncDebugRequest("");
    const endpoint = "/api/admin-refresh-suppliers-cache";
    const base = typeof window !== "undefined" ? window.location.origin : "";
    const internalCurl = `curl -X POST "${base}${endpoint}" -H "Authorization: Bearer <adminToken>"`;
    try {
      const { ok, status, data, text } = await postAdminRefreshSuppliersCache(adminToken);
      const debug = buildSyncDebugFromResponse(status, text, data, internalCurl);
      setSuppliersSyncDebugRequest(debug.debugRequest);
      setSuppliersSyncDebugResponse(debug.debugResponse);
      if (!ok) throw new Error((data.error as string) || "Не удалось обновить справочник поставщиков");
      setSuppliersSyncMessage(`Обновлено: ${Number(data.suppliers_count || 0)} записей`);
      setSuppliersFetchTrigger((n) => n + 1);
    } catch (e: unknown) {
      setSuppliersSyncMessage((e as Error)?.message || "Не удалось обновить справочник поставщиков");
      const errDebug = buildSyncDebugFromError(internalCurl, (e as Error)?.message || "Неизвестная ошибка");
      setSuppliersSyncDebugRequest(errDebug.debugRequest);
      setSuppliersSyncDebugResponse(errDebug.debugResponse);
    } finally {
      setSuppliersSyncLoading(false);
    }
  }, [adminToken]);

  const filtered = suppliersShowOnlyWithoutEmail
    ? suppliersList.filter((s) => !s.email || String(s.email).trim() === "")
    : suppliersList;
  const sorted = [...filtered].sort((a, b) => {
    const key = suppliersSortBy;
    const va = (key === "inn" ? a.inn : key === "supplier_name" ? (a.supplier_name || "") : (a.email || "")).toLowerCase();
    const vb = (key === "inn" ? b.inn : key === "supplier_name" ? (b.supplier_name || "") : (b.email || "")).toLowerCase();
    const cmp = va.localeCompare(vb, "ru");
    return suppliersSortOrder === "asc" ? cmp : -cmp;
  });
  const toggleSort = (col: "inn" | "supplier_name" | "email") => {
    if (suppliersSortBy === col) setSuppliersSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    else { setSuppliersSortBy(col); setSuppliersSortOrder("asc"); }
  };
  const thStyle: React.CSSProperties = { padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600, cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" };
  const thClass = "sortable-th";

  return (
    <Panel className="cargo-card" style={{ padding: "var(--pad-card, 1rem)" }}>
      <Typography.Body style={{ fontWeight: 600, marginBottom: "0.5rem" }}>Справочник поставщиков</Typography.Body>
      <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginBottom: "0.75rem" }}>
        Данные загружаются из `GETALLKontragents` и обновляются кроном каждые 15 минут.
      </Typography.Body>
      <Flex gap="var(--element-gap, 0.75rem)" align="center" wrap="wrap" style={{ marginBottom: "var(--space-3, 0.75rem)" }}>
        <label htmlFor="suppliers-search" className="visually-hidden">Поиск поставщиков по ИНН или наименованию</label>
        <Input
          id="suppliers-search"
          type="text"
          placeholder="Поиск по ИНН или наименованию..."
          value={suppliersSearch}
          onChange={(e) => setSuppliersSearch(e.target.value)}
          className="admin-form-input"
          style={{ maxWidth: "24rem" }}
          aria-label="Поиск поставщиков по ИНН или наименованию"
        />
        <label htmlFor="suppliers-only-without-email" style={{ display: "flex", alignItems: "center", gap: "0.35rem", cursor: "pointer", fontSize: "0.9rem" }}>
          <input
            id="suppliers-only-without-email"
            type="checkbox"
            checked={suppliersShowOnlyWithoutEmail}
            onChange={(e) => setSuppliersShowOnlyWithoutEmail(e.target.checked)}
          />
          <Typography.Body>Только без email</Typography.Body>
        </label>
        <Button
          type="button"
          className="filter-button"
          disabled={suppliersLoading}
          onClick={() => {
            setSuppliersSyncMessage(null);
            setSuppliersFetchTrigger((n) => n + 1);
          }}
          style={{ marginLeft: "auto" }}
        >
          {suppliersLoading ? <Loader2 className="w-4 h-4 animate-spin" style={{ verticalAlign: "middle", marginRight: "0.35rem" }} /> : null}
          Обновить
        </Button>
        {isSuperAdmin && (
          <Button type="button" className="button-primary" disabled={suppliersSyncLoading} onClick={() => void runSuppliersSync()}>
            {suppliersSyncLoading ? <Loader2 className="w-4 h-4 animate-spin" style={{ verticalAlign: "middle", marginRight: "0.35rem" }} /> : null}
            Обновить из 1С
          </Button>
        )}
      </Flex>
      {suppliersSyncMessage && (
        <Typography.Body style={{ marginBottom: "0.65rem", fontSize: "0.82rem", color: "var(--color-text-secondary)" }}>
          {suppliersSyncMessage}
        </Typography.Body>
      )}
      <SyncDebugPanel debugRequest={suppliersSyncDebugRequest} debugResponse={suppliersSyncDebugResponse} />
      {suppliersLoading ? (
        <Flex align="center" gap="0.5rem">
          <Loader2 className="w-4 h-4 animate-spin" />
          <Typography.Body>Загрузка...</Typography.Body>
        </Flex>
      ) : suppliersList.length === 0 ? (
        <Typography.Body style={{ color: "var(--color-text-secondary)" }}>
          {suppliersSearch.trim().length >= 2 ? "Нет совпадений" : "Справочник пуст"}
        </Typography.Body>
      ) : (
        <>
          <div style={{ overflowX: "auto", maxHeight: "60vh", overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
              <thead>
                <tr style={{ background: "var(--color-bg-hover)", borderBottom: "1px solid var(--color-border)" }}>
                  <th className={thClass} style={thStyle} onClick={() => toggleSort("inn")} role="columnheader" aria-sort={suppliersSortBy === "inn" ? (suppliersSortOrder === "asc" ? "ascending" : "descending") : undefined} title="Нажмите для сортировки">
                    ИНН {suppliersSortBy === "inn" ? (suppliersSortOrder === "asc" ? <ChevronUp size={14} style={{ verticalAlign: "middle", marginLeft: 2 }} /> : <ChevronDown size={14} style={{ verticalAlign: "middle", marginLeft: 2 }} />) : <ChevronsUpDown size={14} style={{ verticalAlign: "middle", marginLeft: 2, opacity: 0.5 }} />}
                  </th>
                  <th className={thClass} style={thStyle} onClick={() => toggleSort("supplier_name")} role="columnheader" aria-sort={suppliersSortBy === "supplier_name" ? (suppliersSortOrder === "asc" ? "ascending" : "descending") : undefined} title="Нажмите для сортировки">
                    Наименование {suppliersSortBy === "supplier_name" ? (suppliersSortOrder === "asc" ? <ChevronUp size={14} style={{ verticalAlign: "middle", marginLeft: 2 }} /> : <ChevronDown size={14} style={{ verticalAlign: "middle", marginLeft: 2 }} />) : <ChevronsUpDown size={14} style={{ verticalAlign: "middle", marginLeft: 2, opacity: 0.5 }} />}
                  </th>
                  <th className={thClass} style={thStyle} onClick={() => toggleSort("email")} role="columnheader" aria-sort={suppliersSortBy === "email" ? (suppliersSortOrder === "asc" ? "ascending" : "descending") : undefined} title="Нажмите для сортировки">
                    Email {suppliersSortBy === "email" ? (suppliersSortOrder === "asc" ? <ChevronUp size={14} style={{ verticalAlign: "middle", marginLeft: 2 }} /> : <ChevronDown size={14} style={{ verticalAlign: "middle", marginLeft: 2 }} />) : <ChevronsUpDown size={14} style={{ verticalAlign: "middle", marginLeft: 2, opacity: 0.5 }} />}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((s) => (
                  <tr key={s.inn} style={{ borderBottom: "1px solid var(--color-border)" }}>
                    <td style={{ padding: "0.5rem 0.75rem" }}>{s.inn}</td>
                    <td style={{ padding: "0.5rem 0.75rem" }}>{s.supplier_name || "—"}</td>
                    <td style={{ padding: "0.5rem 0.75rem", color: "var(--color-text-secondary)" }}>{s.email || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Typography.Body style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", marginTop: "0.5rem" }}>
            Записей: {sorted.length}{suppliersShowOnlyWithoutEmail && sorted.length !== suppliersList.length ? ` (из ${suppliersList.length})` : ""}
          </Typography.Body>
        </>
      )}
    </Panel>
  );
}
