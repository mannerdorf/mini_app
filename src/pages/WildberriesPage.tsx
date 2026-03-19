import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Flex, Panel, Typography, Input } from "@maxhub/max-ui";
import { Download, FileUp, RefreshCw, Search, Trash2, Upload } from "lucide-react";
import type { AuthData } from "../types";

type WbTab = "inbound" | "returned" | "claims" | "summary";
type ImportMode = "append" | "upsert";

type Props = {
  auth: AuthData;
  canUpload: boolean;
};

type WbSearchResult = {
  source: "summary" | "inbound" | "returned" | "claims";
  id: string;
  boxId: string | null;
  title: string;
  snippet: string;
  score: number;
  payload: Record<string, unknown>;
};

type ColumnDef = { key: string; label: string };

const INBOUND_DETAIL_COLUMNS: ColumnDef[] = [
  { key: "inventoryNumber", label: "Номер ввозной описи" },
  { key: "inventoryCreatedAt", label: "Дата создания ввозной описи" },
  { key: "boxNumber", label: "Номер коробки" },
  { key: "shk", label: "ШК" },
  { key: "article", label: "Артикул" },
  { key: "brand", label: "Бренд" },
  { key: "description", label: "Описание" },
  { key: "priceRub", label: "Цена, RUB" },
  { key: "massKg", label: "Масса" },
];

function formatWbCellValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return "";
  if (key === "totalPriceRub" || key === "priceRub") {
    const n = Number(value);
    if (!Number.isFinite(n)) return String(value);
    return n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (key === "inventoryCreatedAt" || key === "createdAt" || key === "documentDate") {
    const s = String(value);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    return s;
  }
  return String(value);
}

const TAB_LABELS: Array<{ key: WbTab; label: string }> = [
  { key: "inbound", label: "Описи" },
  { key: "returned", label: "Возвращенный груз" },
  { key: "claims", label: "Претензии" },
  { key: "summary", label: "Сводная" },
];

function buildQuery(params: Record<string, string | number | undefined>) {
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue;
    const text = String(v).trim();
    if (!text) continue;
    query.set(k, text);
  }
  return query.toString();
}

export function WildberriesPage({ auth, canUpload }: Props) {
  const [activeTab, setActiveTab] = useState<WbTab>("inbound");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [importMode, setImportMode] = useState<ImportMode>("append");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<WbSearchResult[]>([]);
  const [claimsRevisionId, setClaimsRevisionId] = useState<number | null>(null);
  const [claimsRevisions, setClaimsRevisions] = useState<Array<{ id: number; revision_number: number; is_active: boolean }>>([]);
  const [expandedInboundInv, setExpandedInboundInv] = useState<string | null>(null);
  const [inboundDetailsCache, setInboundDetailsCache] = useState<Record<string, Record<string, unknown>[]>>({});
  const [inboundDetailLoading, setInboundDetailLoading] = useState<string | null>(null);
  const [deletingInventory, setDeletingInventory] = useState<string | null>(null);
  const inboundDetailsCacheRef = useRef(inboundDetailsCache);
  inboundDetailsCacheRef.current = inboundDetailsCache;
  const [manualReturned, setManualReturned] = useState({
    boxId: "",
    cargoNumber: "",
    description: "",
    documentNumber: "",
    documentDate: "",
    amountRub: "",
    hasShk: false,
  });

  const [filters, setFilters] = useState({
    dateFrom: "",
    dateTo: "",
    inventoryNumber: "",
    boxId: "",
    article: "",
    brand: "",
    claimNumber: "",
    q: "",
  });

  const authHeaders = useMemo(
    () => ({
      "x-login": auth.login,
      "x-password": auth.password,
    }),
    [auth.login, auth.password],
  );

  const dataEndpoint = useMemo(() => {
    if (activeTab === "inbound") return "/api/wb/inbound";
    if (activeTab === "returned") return "/api/wb/returned";
    if (activeTab === "claims") return "/api/wb/claims";
    return "/api/wb/summary";
  }, [activeTab]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = buildQuery({
        page,
        limit,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        inventoryNumber: activeTab === "inbound" ? filters.inventoryNumber : undefined,
        boxId: filters.boxId,
        article: filters.article,
        brand: filters.brand,
        claimNumber: activeTab === "summary" ? filters.claimNumber : undefined,
        q: filters.q,
        history: activeTab === "claims" ? "true" : undefined,
        revisionId: activeTab === "claims" && claimsRevisionId ? claimsRevisionId : undefined,
        view: activeTab === "inbound" ? "summary" : undefined,
      });
      const res = await fetch(`${dataEndpoint}?${query}`, { headers: authHeaders });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Ошибка загрузки");
      setItems(Array.isArray(data?.items) ? data.items : []);
      setTotal(Number(data?.total || 0));
      if (activeTab === "claims") {
        setClaimsRevisionId(Number(data?.revisionId || 0) || null);
        const revisions = Array.isArray(data?.revisions) ? data.revisions : [];
        setClaimsRevisions(revisions);
      }
    } catch (e: unknown) {
      setError((e as Error)?.message || "Ошибка загрузки данных");
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [activeTab, authHeaders, claimsRevisionId, dataEndpoint, filters.article, filters.boxId, filters.brand, filters.claimNumber, filters.dateFrom, filters.dateTo, filters.inventoryNumber, filters.q, limit, page]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    setExpandedInboundInv(null);
  }, [activeTab, page, limit, filters.dateFrom, filters.dateTo, filters.inventoryNumber, filters.boxId, filters.article, filters.brand, filters.q]);

  const loadInboundDetails = useCallback(
    async (inventoryNumber: string) => {
      if (Object.prototype.hasOwnProperty.call(inboundDetailsCacheRef.current, inventoryNumber)) return;
      setInboundDetailLoading(inventoryNumber);
      try {
        const query = buildQuery({
          inventoryNumber,
          limit: 500,
          page: 1,
        });
        const res = await fetch(`/api/wb/inbound?${query}`, { headers: authHeaders });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Ошибка загрузки строк");
        const rows = Array.isArray(data?.items) ? data.items : [];
        setInboundDetailsCache((prev) => ({ ...prev, [inventoryNumber]: rows }));
      } catch {
        setInboundDetailsCache((prev) => ({ ...prev, [inventoryNumber]: [] }));
      } finally {
        setInboundDetailLoading(null);
      }
    },
    [authHeaders],
  );

  const toggleInboundRow = useCallback(
    (inventoryNumber: string) => {
      setExpandedInboundInv((prev) => {
        if (prev === inventoryNumber) return null;
        void loadInboundDetails(inventoryNumber);
        return inventoryNumber;
      });
    },
    [loadInboundDetails],
  );

  const handleDeleteInboundInventory = useCallback(
    async (inventoryNumber: string) => {
      const inv = String(inventoryNumber).trim();
      if (!inv) return;
      if (!window.confirm(`Удалить ведомость «${inv}» и все строки ввозной описи? Действие необратимо.`)) return;
      setUploadError(null);
      setDeletingInventory(inv);
      try {
        const res = await fetch("/api/wb/inbound/delete-inventory", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders },
          body: JSON.stringify({ inventoryNumber: inv }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Ошибка удаления");
        setExpandedInboundInv((prev) => (prev === inv ? null : prev));
        setInboundDetailsCache((prev) => {
          const next = { ...prev };
          delete next[inv];
          return next;
        });
        await loadData();
      } catch (e: unknown) {
        setUploadError((e as Error)?.message || "Ошибка удаления");
      } finally {
        setDeletingInventory(null);
      }
    },
    [authHeaders, loadData],
  );

  const handleUpload = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      const files = Array.from(fileList).slice(0, 15);
      if (fileList.length > 15) {
        setUploadError("Можно загрузить максимум 15 файлов за раз");
        return;
      }
      setUploading(true);
      setUploadError(null);
      try {
        const fd = new FormData();
        for (const file of files) fd.append("file", file);
        fd.append("mode", importMode);
        const endpoint =
          activeTab === "inbound"
            ? "/api/wb/inbound/import"
            : activeTab === "returned"
              ? "/api/wb/returned/import"
              : "/api/wb/claims/import";
        const res = await fetch(endpoint, {
          method: "POST",
          headers: authHeaders,
          body: fd,
        });
        const rawText = await res.text();
        let data: Record<string, unknown> = {};
        if (rawText) {
          try {
            data = JSON.parse(rawText) as Record<string, unknown>;
          } catch {
            data = {};
          }
        }
        if (!res.ok) {
          const apiErr = typeof data.error === "string" ? data.error.trim() : "";
          const reqId = typeof data.request_id === "string" ? data.request_id : "";
          const idSuffix = reqId ? ` [${reqId}]` : "";
          if (apiErr) throw new Error(`${apiErr}${idSuffix}`);
          const snippet = rawText.replace(/\s+/g, " ").trim().slice(0, 280);
          if (snippet && !snippet.startsWith("{"))
            throw new Error(`Сервер ответил ${res.status}: ${snippet}${idSuffix}`);
          throw new Error(`Импорт не выполнен (HTTP ${res.status})${idSuffix || ""}. Попробуйте меньший файл или режим «Обновить по ключу».`);
        }
        // Отдельный запрос: на Vercel фоновый rebuild после ответа импорта может не выполниться.
        if (data.summaryRebuildAsync === true) {
          try {
            await fetch("/api/wb/summary/refresh", { method: "POST", headers: authHeaders });
          } catch {
            /* ignore */
          }
        }
        await loadData();
      } catch (e: unknown) {
        setUploadError((e as Error)?.message || "Ошибка импорта");
      } finally {
        setUploading(false);
      }
    },
    [activeTab, authHeaders, importMode, loadData],
  );

  const handleExport = useCallback(
    async (format: "csv" | "xlsx") => {
      const query = buildQuery({
        block: activeTab,
        format,
        q: filters.q,
      });
      const res = await fetch(`/api/wb/export?${query}`, { headers: authHeaders });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `wb_${activeTab}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    },
    [activeTab, authHeaders, filters.q],
  );

  const handleManualReturnedSubmit = useCallback(async () => {
    setUploadError(null);
    try {
      const res = await fetch("/api/wb/returned/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          ...manualReturned,
          amountRub: manualReturned.amountRub ? Number(manualReturned.amountRub) : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Ошибка сохранения");
      setManualReturned({
        boxId: "",
        cargoNumber: "",
        description: "",
        documentNumber: "",
        documentDate: "",
        amountRub: "",
        hasShk: false,
      });
      await loadData();
    } catch (e: unknown) {
      setUploadError((e as Error)?.message || "Ошибка сохранения");
    }
  }, [authHeaders, loadData, manualReturned]);

  const runHybridSearch = useCallback(async () => {
    if (!filters.q.trim()) return;
    setSearchLoading(true);
    try {
      const query = buildQuery({
        q: filters.q,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        boxId: filters.boxId,
        article: filters.article,
        brand: filters.brand,
        limit: 30,
      });
      const res = await fetch(`/api/wildberries/search?${query}`, { headers: authHeaders });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Ошибка поиска");
      setSearchResults(Array.isArray(data?.items) ? data.items : []);
    } catch {
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, [authHeaders, filters.article, filters.boxId, filters.brand, filters.dateFrom, filters.dateTo, filters.q]);

  const columns = useMemo<ColumnDef[]>(() => {
    if (activeTab === "inbound") {
      return [
        { key: "inventoryNumber", label: "Номер ведомости" },
        { key: "inventoryCreatedAt", label: "Дата ведомости" },
        { key: "boxCount", label: "Кол-во коробов" },
        { key: "totalPriceRub", label: "Общая стоимость, RUB" },
      ];
    }
    if (activeTab === "returned") {
      return [
        { key: "boxId", label: "ID коробки" },
        { key: "cargoNumber", label: "Номер груза" },
        { key: "description", label: "Описание" },
        { key: "hasShk", label: "Есть ШК" },
        { key: "documentNumber", label: "Номер документа" },
        { key: "documentDate", label: "Дата документа" },
        { key: "amountRub", label: "Стоимость" },
        { key: "source", label: "Источник" },
        { key: "createdAt", label: "Создано" },
      ];
    }
    if (activeTab === "claims") {
      return [
        { key: "claimNumber", label: "Номер из претензии" },
        { key: "boxId", label: "ID коробки" },
        { key: "docNumber", label: "Номер документа" },
        { key: "docDate", label: "Дата" },
        { key: "rowNumber", label: "Номер строки" },
        { key: "description", label: "Описание" },
        { key: "amountRub", label: "Стоимость" },
      ];
    }
    return [
      { key: "boxId", label: "ID коробки" },
      { key: "claimNumber", label: "Номер из претензии" },
      { key: "declared", label: "Заявлено / Не заявлено" },
      { key: "documentNumber", label: "Номер документа" },
      { key: "documentDate", label: "Дата" },
      { key: "rowNumber", label: "Номер строки" },
      { key: "description", label: "Описание" },
      { key: "costRub", label: "Стоимость" },
      { key: "article", label: "Артикул" },
      { key: "brand", label: "Бренд" },
    ];
  }, [activeTab]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="wb-page">
      <Panel className="wb-panel" mode="secondary">
        <div className="wb-panel-tabs-section">
        <div className="wb-tabs">
          {TAB_LABELS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`wb-tab-btn ${activeTab === tab.key ? "active" : ""}`}
              onClick={() => {
                setActiveTab(tab.key);
                setPage(1);
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
        </div>

        <div className="wb-filters-grid">
          <Input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => setFilters((p) => ({ ...p, dateFrom: e.target.value }))}
            className="admin-form-input"
            placeholder="Дата с"
          />
          <Input
            type="date"
            value={filters.dateTo}
            onChange={(e) => setFilters((p) => ({ ...p, dateTo: e.target.value }))}
            className="admin-form-input"
            placeholder="Дата по"
          />
          {activeTab === "inbound" && (
            <Input
              value={filters.inventoryNumber}
              onChange={(e) => setFilters((p) => ({ ...p, inventoryNumber: e.target.value }))}
              className="admin-form-input"
              placeholder="Номер описи"
            />
          )}
          <Input
            value={filters.boxId}
            onChange={(e) => setFilters((p) => ({ ...p, boxId: e.target.value }))}
            className="admin-form-input"
            placeholder="ID коробки"
          />
          <Input
            value={filters.article}
            onChange={(e) => setFilters((p) => ({ ...p, article: e.target.value }))}
            className="admin-form-input"
            placeholder="Артикул"
          />
          <Input
            value={filters.brand}
            onChange={(e) => setFilters((p) => ({ ...p, brand: e.target.value }))}
            className="admin-form-input"
            placeholder="Бренд"
          />
          {activeTab === "summary" && (
            <Input
              value={filters.claimNumber}
              onChange={(e) => setFilters((p) => ({ ...p, claimNumber: e.target.value }))}
              className="admin-form-input"
              placeholder="Номер претензии"
            />
          )}
          <Input
            value={filters.q}
            onChange={(e) => setFilters((p) => ({ ...p, q: e.target.value }))}
            className="admin-form-input"
            placeholder="Поиск по всем полям"
          />
        </div>

        <Flex gap="0.5rem" wrap="wrap" align="center" style={{ marginTop: "0.75rem" }}>
          <Button className="wb-action-btn" onClick={() => void loadData()} disabled={loading}>
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {loading ? " Загрузка..." : "Обновить"}
          </Button>
          <Button className="wb-action-btn" onClick={() => void runHybridSearch()} disabled={!filters.q.trim() || searchLoading}>
            {searchLoading ? <Search className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Гибридный поиск
          </Button>
          <Button className="wb-action-btn" onClick={() => void handleExport("csv")}>
            <Download className="w-4 h-4" />
            CSV
          </Button>
          <Button className="wb-action-btn" onClick={() => void handleExport("xlsx")}>
            <Download className="w-4 h-4" />
            XLSX
          </Button>
        </Flex>

        {canUpload && (activeTab === "inbound" || activeTab === "returned" || activeTab === "claims") && (
          <div className="wb-upload-box">
            <Flex align="center" gap="0.5rem" wrap="wrap">
              <Typography.Body style={{ marginRight: "0.25rem" }}>Режим импорта:</Typography.Body>
              <button type="button" className={`wb-mode-btn ${importMode === "append" ? "active" : ""}`} onClick={() => setImportMode("append")}>
                Добавить новые
              </button>
              <button type="button" className={`wb-mode-btn ${importMode === "upsert" ? "active" : ""}`} onClick={() => setImportMode("upsert")}>
                Обновить по ключу
              </button>
            </Flex>
            <label className="wb-upload-drop">
              <input
                type="file"
                multiple
                accept=".xlsx,.xls,.csv"
                style={{ display: "none" }}
                onChange={(e) => {
                  const files = e.target.files;
                  void handleUpload(files).finally(() => {
                    e.target.value = "";
                  });
                }}
              />
              <FileUp size={16} />
              <span>{uploading ? "Идет импорт..." : "Перетащите файлы или нажмите для выбора (до 15)"}</span>
            </label>
          </div>
        )}

        {canUpload && activeTab === "returned" && (
          <div className="wb-manual-panel">
            <Typography.Body style={{ fontWeight: 600, marginBottom: "0.5rem", color: "var(--color-text-primary)" }}>
              Ручной ввод (грузы без ШК)
            </Typography.Body>
            <div className="wb-filters-grid">
              <Input className="admin-form-input" placeholder="ID коробки*" value={manualReturned.boxId} onChange={(e) => setManualReturned((p) => ({ ...p, boxId: e.target.value }))} />
              <Input className="admin-form-input" placeholder="Номер груза" value={manualReturned.cargoNumber} onChange={(e) => setManualReturned((p) => ({ ...p, cargoNumber: e.target.value }))} />
              <Input className="admin-form-input" placeholder="Описание" value={manualReturned.description} onChange={(e) => setManualReturned((p) => ({ ...p, description: e.target.value }))} />
              <Input className="admin-form-input" placeholder="Номер документа" value={manualReturned.documentNumber} onChange={(e) => setManualReturned((p) => ({ ...p, documentNumber: e.target.value }))} />
              <Input className="admin-form-input" type="date" placeholder="Дата документа" value={manualReturned.documentDate} onChange={(e) => setManualReturned((p) => ({ ...p, documentDate: e.target.value }))} />
              <Input className="admin-form-input" placeholder="Стоимость" value={manualReturned.amountRub} onChange={(e) => setManualReturned((p) => ({ ...p, amountRub: e.target.value }))} />
            </div>
            <Flex gap="0.5rem" style={{ marginTop: "0.5rem" }}>
              <Button className="wb-action-btn" onClick={() => void handleManualReturnedSubmit()}>
                <Upload className="w-4 h-4" />
                Сохранить запись
              </Button>
            </Flex>
          </div>
        )}

        {activeTab === "claims" && claimsRevisions.length > 0 && (
          <Flex align="center" gap="0.5rem" style={{ marginTop: "0.75rem" }}>
            <Typography.Body>Ревизия:</Typography.Body>
            <select
              className="admin-form-input"
              value={claimsRevisionId ?? ""}
              onChange={(e) => setClaimsRevisionId(Number(e.target.value) || null)}
              style={{ maxWidth: 220 }}
            >
              {claimsRevisions.map((r) => (
                <option key={r.id} value={r.id}>
                  v{r.revision_number} {r.is_active ? "(активная)" : ""}
                </option>
              ))}
            </select>
          </Flex>
        )}

        {uploadError && <Typography.Body style={{ color: "var(--color-error)", marginTop: "0.5rem" }}>{uploadError}</Typography.Body>}
        {error && <Typography.Body style={{ color: "var(--color-error)", marginTop: "0.5rem" }}>{error}</Typography.Body>}

        <div className="wb-table-wrap">
          <table className="wb-table">
            <thead>
              <tr>
                {activeTab === "inbound" && <th className="wb-col-expand" aria-hidden />}
                {columns.map((col) => (
                  <th key={col.key}>{col.label}</th>
                ))}
                {activeTab === "inbound" && canUpload && (
                  <th className="wb-col-actions" title="Удаление ведомости">
                    {/* пустой заголовок — колонка действий */}
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td
                    colSpan={
                      columns.length +
                      (activeTab === "inbound" ? 1 : 0) +
                      (activeTab === "inbound" && canUpload ? 1 : 0)
                    }
                    style={{ textAlign: "center", color: "var(--color-text-secondary)" }}
                  >
                    {loading ? "Загрузка..." : "Нет данных"}
                  </td>
                </tr>
              ) : activeTab === "inbound" ? (
                items.map((row, idx) => {
                  const inv = String(row.inventoryNumber ?? idx);
                  const open = expandedInboundInv === inv;
                  const detailRows = inboundDetailsCache[inv] ?? [];
                  return (
                    <React.Fragment key={`inbound-${inv}-${idx}`}>
                      <tr
                        className={`wb-inbound-summary-row ${open ? "wb-inbound-summary-row--open" : ""}`}
                        onClick={() => toggleInboundRow(inv)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            toggleInboundRow(inv);
                          }
                        }}
                      >
                        <td className="wb-col-expand">{open ? "▼" : "▶"}</td>
                        {columns.map((col) => (
                          <td key={col.key}>{formatWbCellValue(col.key, row[col.key])}</td>
                        ))}
                        {canUpload && (
                          <td className="wb-col-actions">
                            <button
                              type="button"
                              className="wb-delete-inventory-btn"
                              title="Удалить ведомость"
                              aria-label={`Удалить ведомость ${inv}`}
                              disabled={deletingInventory === inv}
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleDeleteInboundInventory(inv);
                              }}
                            >
                              {deletingInventory === inv ? (
                                <RefreshCw className="w-4 h-4 animate-spin" aria-hidden />
                              ) : (
                                <Trash2 className="w-4 h-4" aria-hidden />
                              )}
                            </button>
                          </td>
                        )}
                      </tr>
                      {open && (
                        <tr className="wb-inbound-detail-row">
                          <td colSpan={columns.length + 1 + (canUpload ? 1 : 0)}>
                            {inboundDetailLoading === inv && detailRows.length === 0 ? (
                              <Typography.Body style={{ color: "var(--color-text-secondary)", padding: "0.5rem" }}>Загрузка строк...</Typography.Body>
                            ) : detailRows.length === 0 ? (
                              <Typography.Body style={{ color: "var(--color-text-secondary)", padding: "0.5rem" }}>Нет строк по этой ведомости</Typography.Body>
                            ) : (
                              <div className="wb-inbound-detail-wrap">
                                <table className="wb-table wb-table--nested">
                                  <thead>
                                    <tr>
                                      {INBOUND_DETAIL_COLUMNS.map((c) => (
                                        <th key={c.key}>{c.label}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {detailRows.map((dr, dIdx) => (
                                      <tr key={`${inv}-d-${dIdx}`}>
                                        {INBOUND_DETAIL_COLUMNS.map((c) => (
                                          <td key={c.key}>{formatWbCellValue(c.key, dr[c.key])}</td>
                                        ))}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              ) : (
                items.map((row, idx) => (
                  <tr key={`${activeTab}-${idx}`}>
                    {columns.map((col) => (
                      <td key={col.key}>{formatWbCellValue(col.key, row[col.key])}</td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <Flex align="center" justify="space-between" style={{ marginTop: "0.75rem" }}>
          <Typography.Body style={{ color: "var(--color-text-secondary)" }}>
            {`Страница ${page} из ${totalPages} • записей: ${total}`}
          </Typography.Body>
          <Flex gap="0.5rem" align="center">
            <Button className="wb-action-btn" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
              Назад
            </Button>
            <Button className="wb-action-btn" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
              Далее
            </Button>
            <select className="admin-form-input" value={limit} onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }} style={{ width: 90 }}>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </Flex>
        </Flex>

        {searchResults.length > 0 && (
          <div className="wb-search-results">
            <Typography.Body style={{ fontWeight: 600, marginBottom: "0.5rem" }}>Результаты гибридного поиска</Typography.Body>
            {searchResults.map((r) => (
              <div key={`${r.source}-${r.id}`} className="wb-search-card">
                <div>
                  <Typography.Body style={{ fontWeight: 600 }}>{r.title}</Typography.Body>
                  <Typography.Body style={{ color: "var(--color-text-secondary)" }}>{r.snippet}</Typography.Body>
                </div>
                <Typography.Body style={{ color: "var(--color-primary-blue)" }}>{r.source}</Typography.Body>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

export default WildberriesPage;

