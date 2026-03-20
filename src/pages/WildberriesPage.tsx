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

type InboundSummarySortKey = "inventoryNumber" | "inventoryCreatedAt" | "boxCount" | "totalPriceRub";

const INBOUND_SUMMARY_SORT_KEYS = new Set<string>(["inventoryNumber", "inventoryCreatedAt", "boxCount", "totalPriceRub"]);

const INBOUND_DETAIL_COLUMNS: ColumnDef[] = [
  { key: "lineNumber", label: "№" },
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

const RETURNED_DETAIL_COLUMNS: ColumnDef[] = [
  { key: "inboundInventoryNumber", label: "Номер описи" },
  { key: "boxId", label: "Номер коробки" },
  { key: "inboundRowNumber", label: "№ строки описи" },
  { key: "inboundTitle", label: "Наименование" },
  { key: "inboundPriceRub", label: "Стоимость по описи" },
];

/** Колонки выгрузки WB в раскрытой таблице претензий (по заголовкам из файла). */
const CLAIMS_EXCEL_COLUMN_SPEC: { label: string; headerKeys: string[] }[] = [
  { label: "ID", headerKeys: ["id"] },
  { label: "Тип", headerKeys: ["тип"] },
  { label: "ID заявки на оплату", headerKeys: ["id заявки на оплату"] },
  { label: "Тип брака", headerKeys: ["тип брака"] },
  { label: "Дата заявки на оплату", headerKeys: ["дата заявки на оплату"] },
  { label: "СЦ", headerKeys: ["сц"] },
  { label: "Дата претензии", headerKeys: ["дата претензии"] },
  { label: "Штрихкод", headerKeys: ["штрихкод", "шк"] },
  { label: "Цена, руб.", headerKeys: ["цена, руб.", "цена руб.", "цена, руб"] },
  { label: "Комментарий", headerKeys: ["комментарий", "описание"] },
  { label: "Отмена удержания", headerKeys: ["отмена удержания"] },
  { label: "Статус", headerKeys: ["статус", "status"] },
];

function wbClaimsHeaderNorm(s: string): string {
  return String(s ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function pickClaimsExcelValue(all: Record<string, unknown>, headerKeys: string[]): string {
  if (!all || typeof all !== "object") return "";
  const entries = Object.entries(all);
  for (const want of headerKeys) {
    const w = wbClaimsHeaderNorm(want);
    for (const [k, v] of entries) {
      if (wbClaimsHeaderNorm(k) === w) {
        if (v === null || v === undefined) return "";
        if (v instanceof Date) return v.toISOString().slice(0, 10);
        return String(v).trim();
      }
    }
  }
  return "";
}

type ReturnedGroup = { documentNumber: string | null; batchId: number | null };

function returnedGroupCacheKey(g: ReturnedGroup): string {
  return JSON.stringify([String(g.documentNumber ?? "").trim(), g.batchId ?? null]);
}

function normalizeReturnedGroupRow(row: Record<string, unknown>): ReturnedGroup {
  const documentNumber =
    row.documentNumber === null || row.documentNumber === undefined
      ? null
      : String(row.documentNumber).trim() || null;
  const rawBatch = row.batchId;
  const batchId =
    rawBatch === null || rawBatch === undefined || rawBatch === ""
      ? null
      : typeof rawBatch === "number"
        ? rawBatch
        : Number(String(rawBatch).trim());
  return {
    documentNumber,
    batchId: batchId !== null && Number.isFinite(batchId) ? Math.trunc(batchId) : null,
  };
}

/** Значение ячейки в строку для поиска (числа из API/Excel не теряем в toString). */
function cellValueForNeedleMatch(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return "";
    if (Number.isInteger(v) && Math.abs(v) <= Number.MAX_SAFE_INTEGER) return String(v);
    return String(v);
  }
  if (typeof v === "bigint") return v.toString();
  return String(v).trim();
}

/** Совпадение строки детализации с «Поиск» / «Номер коробки» — только для подсветки (строки не скрываем). */
function inboundDetailRowMatchesNeedle(row: Record<string, unknown>, needleLower: string): boolean {
  if (!needleLower) return true;
  const keys = [
    "boxNumber",
    "shk",
    "sticker",
    "barcode",
    "article",
    "brand",
    "description",
    "nomenclature",
    "inventoryNumber",
    "receiverFullName",
    "phone",
    "kit",
    "size",
    "tnvEd",
  ] as const;
  const parts = keys.map((k) => cellValueForNeedleMatch(row[k]));
  const hay = parts.join(" ").toLowerCase();
  if (hay.includes(needleLower)) return true;
  const needleCompact = needleLower.replace(/\s+/g, "").replace(/\u00a0/g, "");
  const hayCompact = hay.replace(/\s+/g, "").replace(/\u00a0/g, "");
  if (needleCompact.length >= 2 && hayCompact.includes(needleCompact)) return true;
  const needleDigits = needleLower.replace(/\D/g, "");
  if (needleDigits.length >= 4) {
    const hayDigits = hay.replace(/\D/g, "");
    if (hayDigits.includes(needleDigits)) return true;
  }
  return false;
}

/** Ячейки сводной: коробка из претензии + данные из описи или «нет в описях». */
function formatWbSummaryCell(colKey: string, row: Record<string, unknown>): string {
  const hasInbound = row.hasInbound === true;
  if (colKey === "boxId") return formatWbCellValue("boxId", row.boxId);
  if (!hasInbound) {
    if (colKey === "inventoryNumber") return "нет в описях";
    return "—";
  }
  if (colKey === "inboundPriceRub") return formatWbCellValue("priceRub", row.inboundPriceRub);
  if (colKey === "inboundRowNumber") {
    const v = row.inboundRowNumber;
    if (v === null || v === undefined || v === "") return "—";
    return String(v);
  }
  if (colKey === "inboundTitle") {
    const t = String(row.inboundTitle ?? "").trim();
    return t || "—";
  }
  if (colKey === "inventoryNumber") {
    const t = String(row.inventoryNumber ?? "").trim();
    return t || "—";
  }
  return formatWbCellValue(colKey, row[colKey]);
}

function formatWbCellValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return "";
  if (key === "totalPriceRub" || key === "priceRub" || key === "totalAmountRub") {
    const n = Number(value);
    if (!Number.isFinite(n)) return String(value);
    return n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (key === "inventoryCreatedAt" || key === "createdAt" || key === "documentDate" || key === "uploadedAt") {
    const s = String(value);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    return s;
  }
  if (key === "isActive") return value === true ? "Да" : "";
  return String(value);
}

function formatReturnedDetailCell(key: string, value: unknown): string {
  if (key === "inboundTitle" || key === "inboundPriceRub") {
    if (value === null || value === undefined || value === "") return "нет данных";
    if (key === "inboundPriceRub") {
      const n = Number(value);
      if (!Number.isFinite(n)) return "нет данных";
      return n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return String(value);
  }
  if (key === "inboundRowNumber" && (value === null || value === undefined || value === "")) return "нет данных";
  if (key === "inboundInventoryNumber" && (value === null || value === undefined || String(value).trim() === "")) {
    return "нет данных";
  }
  return formatWbCellValue(key, value);
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
  const [expandedClaimsRevisionId, setExpandedClaimsRevisionId] = useState<number | null>(null);
  const [claimsDetailsCache, setClaimsDetailsCache] = useState<Record<string, Record<string, unknown>[]>>({});
  const [claimsDetailLoading, setClaimsDetailLoading] = useState<number | null>(null);
  const [deletingClaimsRevisionId, setDeletingClaimsRevisionId] = useState<number | null>(null);
  const [expandedInboundInv, setExpandedInboundInv] = useState<string | null>(null);
  const [inboundDetailsCache, setInboundDetailsCache] = useState<Record<string, Record<string, unknown>[]>>({});
  const [inboundDetailLoading, setInboundDetailLoading] = useState<string | null>(null);
  const [deletingInventory, setDeletingInventory] = useState<string | null>(null);
  const [expandedReturnedGroup, setExpandedReturnedGroup] = useState<ReturnedGroup | null>(null);
  const [returnedDetailsCache, setReturnedDetailsCache] = useState<Record<string, Record<string, unknown>[]>>({});
  const [returnedDetailLoading, setReturnedDetailLoading] = useState<string | null>(null);
  const [deletingReturnedGroup, setDeletingReturnedGroup] = useState<string | null>(null);
  const [summaryHeader, setSummaryHeader] = useState<{
    formedAt: string | null;
    placeCount: number;
    totalInboundRub: string | number;
  } | null>(null);
  const [clearingSummary, setClearingSummary] = useState(false);
  const [inboundSummarySort, setInboundSummarySort] = useState<{ by: InboundSummarySortKey; dir: "asc" | "desc" }>({
    by: "inventoryCreatedAt",
    dir: "desc",
  });
  const inboundDetailsCacheRef = useRef(inboundDetailsCache);
  inboundDetailsCacheRef.current = inboundDetailsCache;
  const returnedDetailsCacheRef = useRef(returnedDetailsCache);
  returnedDetailsCacheRef.current = returnedDetailsCache;
  const claimsDetailsCacheRef = useRef(claimsDetailsCache);
  claimsDetailsCacheRef.current = claimsDetailsCache;
  /** Игнорируем ответ fetch, если уже ушли на другую вкладку / запустили новую загрузку. */
  const wbLoadGenRef = useRef(0);
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

  /** Нижний регистр: фильтр строк внутри раскрытой ведомости (поиск / номер коробки). */
  const inboundDetailNeedle = useMemo(() => {
    if (activeTab !== "inbound") return "";
    return (filters.boxId.trim() || filters.q.trim()).toLowerCase();
  }, [activeTab, filters.boxId, filters.q]);

  /** Подсветка строки ведомости в сводке при любом узком фильтре. */
  const inboundSummaryFilterHit = useMemo(() => {
    if (activeTab !== "inbound") return false;
    return Boolean(filters.q.trim() || filters.boxId.trim() || filters.inventoryNumber.trim());
  }, [activeTab, filters.q, filters.boxId, filters.inventoryNumber]);

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
    const gen = ++wbLoadGenRef.current;
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
        view:
          activeTab === "inbound"
            ? "summary"
            : activeTab === "returned"
              ? "summary"
              : activeTab === "claims"
                ? "summary"
                : undefined,
        sortBy: activeTab === "inbound" ? inboundSummarySort.by : undefined,
        sortDir: activeTab === "inbound" ? inboundSummarySort.dir : undefined,
      });
      const res = await fetch(`${dataEndpoint}?${query}`, { headers: authHeaders });
      const data = await res.json().catch(() => ({}));
      if (gen !== wbLoadGenRef.current) return;
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Ошибка загрузки");
      setItems(Array.isArray(data?.items) ? data.items : []);
      setTotal(Number(data?.total || 0));
      if (activeTab === "summary") {
        const sh = data?.summaryHeader;
        if (sh && typeof sh === "object") {
          setSummaryHeader({
            formedAt: typeof (sh as { formedAt?: unknown }).formedAt === "string" ? (sh as { formedAt: string }).formedAt : null,
            placeCount: Number((sh as { placeCount?: unknown }).placeCount ?? data?.total ?? 0),
            totalInboundRub: (sh as { totalInboundRub?: unknown }).totalInboundRub ?? "0",
          });
        } else {
          setSummaryHeader(null);
        }
      } else {
        setSummaryHeader(null);
      }
    } catch (e: unknown) {
      if (gen !== wbLoadGenRef.current) return;
      setError((e as Error)?.message || "Ошибка загрузки данных");
      setItems([]);
      setTotal(0);
      if (activeTab === "summary") setSummaryHeader(null);
    } finally {
      if (gen === wbLoadGenRef.current) setLoading(false);
    }
  }, [
    activeTab,
    authHeaders,
    dataEndpoint,
    filters.article,
    filters.boxId,
    filters.brand,
    filters.claimNumber,
    filters.dateFrom,
    filters.dateTo,
    filters.inventoryNumber,
    filters.q,
    inboundSummarySort.by,
    inboundSummarySort.dir,
    limit,
    page,
  ]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  /** Одна ведомость в выдаче + фильтр → сразу раскрыть детали. */
  useEffect(() => {
    if (activeTab !== "inbound" || loading) return;
    const f = filters.q.trim() || filters.boxId.trim() || filters.inventoryNumber.trim();
    if (!f || items.length !== 1) return;
    const inv = String(items[0]?.inventoryNumber ?? "");
    if (inv) setExpandedInboundInv(inv);
  }, [activeTab, loading, filters.q, filters.boxId, filters.inventoryNumber, items]);

  useEffect(() => {
    setExpandedInboundInv(null);
    setExpandedReturnedGroup(null);
    setExpandedClaimsRevisionId(null);
  }, [
    activeTab,
    page,
    limit,
    inboundSummarySort.by,
    inboundSummarySort.dir,
    filters.dateFrom,
    filters.dateTo,
    filters.article,
    filters.brand,
  ]);

  useEffect(() => {
    if (activeTab !== "returned" || !expandedReturnedGroup) return;
    const hit = items.some((row) => {
      const g = normalizeReturnedGroupRow(row as Record<string, unknown>);
      return returnedGroupCacheKey(g) === returnedGroupCacheKey(expandedReturnedGroup);
    });
    if (!hit) setExpandedReturnedGroup(null);
  }, [activeTab, items, expandedReturnedGroup]);

  useEffect(() => {
    if (activeTab !== "claims" || expandedClaimsRevisionId === null) return;
    const hit = items.some((row) => Number(row.revisionId) === expandedClaimsRevisionId);
    if (!hit) setExpandedClaimsRevisionId(null);
  }, [activeTab, items, expandedClaimsRevisionId]);

  useEffect(() => {
    setClaimsDetailsCache({});
    setExpandedClaimsRevisionId(null);
  }, [filters.dateFrom, filters.dateTo, filters.boxId, filters.article, filters.brand, filters.q]);

  /** Свернуть, если раскрытая ведомости нет в текущей странице выдачи. */
  useEffect(() => {
    if (activeTab !== "inbound" || !expandedInboundInv) return;
    const still = items.some((r) => String(r.inventoryNumber ?? "") === expandedInboundInv);
    if (!still) setExpandedInboundInv(null);
  }, [activeTab, items, expandedInboundInv]);

  const onInboundSummarySortClick = useCallback((key: string) => {
    if (!INBOUND_SUMMARY_SORT_KEYS.has(key)) return;
    const sortKey = key as InboundSummarySortKey;
    setInboundSummarySort((prev) => {
      if (prev.by === sortKey) return { by: sortKey, dir: prev.dir === "asc" ? "desc" : "asc" };
      return { by: sortKey, dir: sortKey === "inventoryNumber" ? "asc" : "desc" };
    });
    setPage(1);
  }, []);

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

  const loadReturnedDetails = useCallback(
    async (group: ReturnedGroup) => {
      const cacheKey = returnedGroupCacheKey(group);
      if (Object.prototype.hasOwnProperty.call(returnedDetailsCacheRef.current, cacheKey)) return;
      setReturnedDetailLoading(cacheKey);
      try {
        const params = new URLSearchParams();
        params.set("view", "detail");
        params.set("gDoc", String(group.documentNumber ?? ""));
        params.set("gBatch", group.batchId === null || group.batchId === undefined ? "" : String(group.batchId));
        const res = await fetch(`/api/wb/returned?${params.toString()}`, { headers: authHeaders });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Ошибка загрузки строк");
        const rows = Array.isArray(data?.items) ? data.items : [];
        setReturnedDetailsCache((prev) => ({ ...prev, [cacheKey]: rows }));
      } catch {
        setReturnedDetailsCache((prev) => ({ ...prev, [cacheKey]: [] }));
      } finally {
        setReturnedDetailLoading(null);
      }
    },
    [authHeaders],
  );

  const toggleReturnedGroupRow = useCallback(
    (row: Record<string, unknown>) => {
      const g = normalizeReturnedGroupRow(row);
      setExpandedReturnedGroup((prev) => {
        if (prev && returnedGroupCacheKey(prev) === returnedGroupCacheKey(g)) return null;
        void loadReturnedDetails(g);
        return g;
      });
    },
    [loadReturnedDetails],
  );

  const handleDeleteReturnedGroup = useCallback(
    async (row: Record<string, unknown>) => {
      const g = normalizeReturnedGroupRow(row);
      const cacheKey = returnedGroupCacheKey(g);
      const docLabel = g.documentNumber || "без номера";
      if (!window.confirm(`Удалить группу возврата (документ «${docLabel}», партия ${g.batchId ?? "—"}) и все коробки в ней?`)) return;
      setUploadError(null);
      setDeletingReturnedGroup(cacheKey);
      try {
        const res = await fetch("/api/wb/returned/delete-group", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders },
          body: JSON.stringify({ documentNumber: g.documentNumber ?? "", batchId: g.batchId }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Ошибка удаления");
        setExpandedReturnedGroup((prev) => (prev && returnedGroupCacheKey(prev) === cacheKey ? null : prev));
        setReturnedDetailsCache((prev) => {
          const next = { ...prev };
          delete next[cacheKey];
          return next;
        });
        await loadData();
      } catch (e: unknown) {
        setUploadError((e as Error)?.message || "Ошибка удаления");
      } finally {
        setDeletingReturnedGroup(null);
      }
    },
    [authHeaders, loadData],
  );

  const loadClaimsDetails = useCallback(
    async (revisionId: number) => {
      const key = String(revisionId);
      if (Object.prototype.hasOwnProperty.call(claimsDetailsCacheRef.current, key)) return;
      setClaimsDetailLoading(revisionId);
      try {
        const params = new URLSearchParams();
        params.set("view", "detail");
        params.set("revisionId", String(revisionId));
        if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
        if (filters.dateTo) params.set("dateTo", filters.dateTo);
        if (filters.boxId.trim()) params.set("boxId", filters.boxId.trim());
        if (filters.article.trim()) params.set("article", filters.article.trim());
        if (filters.brand.trim()) params.set("brand", filters.brand.trim());
        if (filters.q.trim()) params.set("q", filters.q.trim());
        params.set("history", "true");
        const res = await fetch(`/api/wb/claims?${params.toString()}`, { headers: authHeaders });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Ошибка загрузки строк");
        const rows = Array.isArray(data?.items) ? data.items : [];
        setClaimsDetailsCache((prev) => ({ ...prev, [key]: rows }));
      } catch {
        setClaimsDetailsCache((prev) => ({ ...prev, [key]: [] }));
      } finally {
        setClaimsDetailLoading(null);
      }
    },
    [authHeaders, filters.article, filters.boxId, filters.brand, filters.dateFrom, filters.dateTo, filters.q],
  );

  const toggleClaimsRevisionRow = useCallback(
    (revisionId: number) => {
      setExpandedClaimsRevisionId((prev) => {
        if (prev === revisionId) return null;
        void loadClaimsDetails(revisionId);
        return revisionId;
      });
    },
    [loadClaimsDetails],
  );

  const handleDeleteClaimsRevision = useCallback(
    async (row: Record<string, unknown>) => {
      const revisionId = Number(row.revisionId);
      if (!Number.isFinite(revisionId) || revisionId <= 0) return;
      const revNum = String(row.revisionNumber ?? revisionId);
      const fn = String(row.sourceFilename ?? "").trim() || "файл";
      if (!window.confirm(`Удалить ревизию претензий v${revNum} («${fn}») и все строки? Действие необратимо.`)) return;
      setUploadError(null);
      setDeletingClaimsRevisionId(revisionId);
      try {
        const res = await fetch("/api/wb/claims/delete-revision", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders },
          body: JSON.stringify({ revisionId }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Ошибка удаления");
        setExpandedClaimsRevisionId((prev) => (prev === revisionId ? null : prev));
        setClaimsDetailsCache((prev) => {
          const next = { ...prev };
          delete next[String(revisionId)];
          return next;
        });
        await loadData();
      } catch (e: unknown) {
        setUploadError((e as Error)?.message || "Ошибка удаления");
      } finally {
        setDeletingClaimsRevisionId(null);
      }
    },
    [authHeaders, loadData],
  );

  /** Сводная пересобирается на сервере после импорта в фоне — на serverless это часто обрывается; ждём явный POST refresh. */
  const triggerWbSummaryRefresh = useCallback(async () => {
    try {
      await fetch("/api/wb/summary/refresh", { method: "POST", headers: authHeaders });
    } catch {
      // сеть / 401 при праве только чтения
    }
  }, [authHeaders]);

  const handleWbRefreshClick = useCallback(async () => {
    if (activeTab === "summary") {
      await triggerWbSummaryRefresh();
    }
    await loadData();
  }, [activeTab, loadData, triggerWbSummaryRefresh]);

  const handleClearWbSummary = useCallback(async () => {
    if (!window.confirm("Очистить сводную таблицу? Данные можно восстановить кнопкой «Обновить» (пересчёт по претензиям и описям).")) return;
    setUploadError(null);
    setClearingSummary(true);
    try {
      const res = await fetch("/api/wb/summary/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: "{}",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Ошибка очистки");
      await loadData();
    } catch (e: unknown) {
      setUploadError((e as Error)?.message || "Ошибка очистки сводной");
    } finally {
      setClearingSummary(false);
    }
  }, [authHeaders, loadData]);

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
      const endpoint =
        activeTab === "inbound"
          ? "/api/wb/inbound/import"
          : activeTab === "returned"
            ? "/api/wb/returned/import"
            : "/api/wb/claims/import";
      const errors: string[] = [];
      let okCount = 0;
      let summaryRefreshOnce = false;
      try {
        // Несколько файлов в одном FormData дают 413 на Vercel (~4.5 МБ на запрос) — шлём по одному файлу.
        for (const file of files) {
          const fd = new FormData();
          fd.append("file", file);
          fd.append("mode", importMode);
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
            let msg: string;
            if (res.status === 413) {
              msg = `«${file.name}»: 413 — тело запроса слишком большое (лимит хостинга Vercel ~4.5 МБ на один POST). Уменьшите файл или используйте свой сервер без этого ограничения.`;
            } else if (apiErr) {
              msg = `«${file.name}»: ${apiErr}${idSuffix}`;
            } else {
              const snippet = rawText.replace(/\s+/g, " ").trim().slice(0, 280);
              msg =
                snippet && !snippet.startsWith("{")
                  ? `«${file.name}»: ${snippet}${idSuffix}`
                  : `«${file.name}»: HTTP ${res.status}${idSuffix}`;
            }
            errors.push(msg);
            continue;
          }
          okCount += 1;
          if (data.summaryRebuildAsync === true) summaryRefreshOnce = true;
        }

        if (summaryRefreshOnce) {
          await triggerWbSummaryRefresh();
        }
        if (okCount > 0) {
          if (activeTab === "returned") setReturnedDetailsCache({});
          if (activeTab === "claims") setClaimsDetailsCache({});
          await loadData();
        }

        if (errors.length > 0) {
          const prefix = okCount > 0 ? `Готово: ${okCount} из ${files.length}. Ошибки:\n` : "";
          setUploadError(prefix + errors.join("\n"));
        } else if (okCount === 0 && files.length > 0) {
          setUploadError("Не удалось импортировать ни одного файла.");
        }
      } catch (e: unknown) {
        setUploadError((e as Error)?.message || "Ошибка импорта");
      } finally {
        setUploading(false);
      }
    },
    [activeTab, authHeaders, importMode, loadData, triggerWbSummaryRefresh],
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
      setReturnedDetailsCache({});
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
        { key: "lineNumber", label: "№" },
        { key: "uploadedAt", label: "Дата загрузки" },
        { key: "boxCount", label: "Кол-во мест" },
        { key: "matchedCount", label: "Кол-во найдено" },
        { key: "totalAmountRub", label: "Сумма стоимости, RUB" },
      ];
    }
    if (activeTab === "claims") {
      return [
        { key: "uploadedAt", label: "Дата загрузки" },
        { key: "revisionNumber", label: "Ревизия" },
        { key: "isActive", label: "Сводная" },
        { key: "itemCount", label: "Кол-во мест" },
        { key: "totalAmountRub", label: "Сумма" },
      ];
    }
    return [
      { key: "boxId", label: "Номер коробки" },
      { key: "inventoryNumber", label: "Номер описи" },
      { key: "inboundRowNumber", label: "№ строки описи" },
      { key: "inboundTitle", label: "Наименование" },
      { key: "inboundPriceRub", label: "Стоимость по описи" },
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
                if (activeTab === tab.key) return;
                setActiveTab(tab.key);
                setPage(1);
                setItems([]);
                setTotal(0);
                setSummaryHeader(null);
                setError(null);
                setLoading(true);
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
            placeholder="Номер коробки"
            title="Фильтр по номеру коробки (частичное совпадение)"
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
          <Button className="wb-action-btn" onClick={() => void handleWbRefreshClick()} disabled={loading}>
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
              <span>
                {uploading
                  ? "Идет импорт..."
                  : "До 15 файлов, каждый отдельным запросом. Перетащите или выберите"}
              </span>
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

        {canUpload && activeTab === "claims" && (
          <Typography.Body style={{ color: "var(--color-text-secondary)", marginTop: "0.5rem", fontSize: "0.875rem" }}>
            Импорт: в базу попадают только строки со статусом «Подтверждено», если в файле есть колонка «Статус». Остальные строки пропускаются.
          </Typography.Body>
        )}

        {uploadError && <Typography.Body style={{ color: "var(--color-error)", marginTop: "0.5rem" }}>{uploadError}</Typography.Body>}
        {error && <Typography.Body style={{ color: "var(--color-error)", marginTop: "0.5rem" }}>{error}</Typography.Body>}

        {activeTab === "summary" && (
          <div
            className="wb-summary-strip"
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: "1.25rem",
              marginTop: "0.75rem",
              marginBottom: "0.5rem",
              padding: "0.65rem 1rem",
              borderRadius: "10px",
              border: "1px solid var(--color-border)",
              background: "var(--color-bg-card)",
            }}
          >
            <Typography.Body style={{ margin: 0 }}>
              <span style={{ color: "var(--color-text-secondary)" }}>Дата формирования сводной: </span>
              <strong>
                {summaryHeader?.formedAt
                  ? (() => {
                      const d = new Date(summaryHeader.formedAt);
                      return Number.isNaN(d.getTime())
                        ? String(summaryHeader.formedAt).slice(0, 19).replace("T", " ")
                        : d.toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
                    })()
                  : "—"}
              </strong>
            </Typography.Body>
            <Typography.Body style={{ margin: 0 }}>
              <span style={{ color: "var(--color-text-secondary)" }}>Кол-во мест: </span>
              <strong>{total}</strong>
            </Typography.Body>
            <Typography.Body style={{ margin: 0 }}>
              <span style={{ color: "var(--color-text-secondary)" }}>Стоимость: </span>
              <strong>
                {Number(summaryHeader?.totalInboundRub ?? 0).toLocaleString("ru-RU", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{" "}
                ₽
              </strong>
            </Typography.Body>
            {canUpload && (
              <button
                type="button"
                className="wb-delete-inventory-btn"
                title="Очистить сводную таблицу"
                aria-label="Очистить сводную таблицу"
                disabled={clearingSummary || loading}
                onClick={() => void handleClearWbSummary()}
              >
                {clearingSummary ? <RefreshCw className="w-4 h-4 animate-spin" aria-hidden /> : <Trash2 className="w-4 h-4" aria-hidden />}
              </button>
            )}
          </div>
        )}

        <div className="wb-table-wrap">
          <table className="wb-table">
            <thead>
              <tr>
                {(activeTab === "inbound" || activeTab === "returned" || activeTab === "claims") && (
                  <th className="wb-col-expand" aria-hidden />
                )}
                {columns.map((col) => (
                  <th
                    key={col.key}
                    aria-sort={
                      activeTab === "inbound" && inboundSummarySort.by === col.key
                        ? inboundSummarySort.dir === "asc"
                          ? "ascending"
                          : "descending"
                        : undefined
                    }
                  >
                    {activeTab === "inbound" ? (
                      <button
                        type="button"
                        className="wb-sort-th"
                        onClick={() => onInboundSummarySortClick(col.key)}
                      >
                        <span>{col.label}</span>
                        {inboundSummarySort.by === col.key ? (
                          <span className="wb-sort-indicator" aria-hidden>
                            {inboundSummarySort.dir === "asc" ? " ▲" : " ▼"}
                          </span>
                        ) : null}
                      </button>
                    ) : (
                      col.label
                    )}
                  </th>
                ))}
                {activeTab === "inbound" && canUpload && (
                  <th className="wb-col-actions" title="Удаление ведомости">
                    {/* пустой заголовок — колонка действий */}
                  </th>
                )}
                {activeTab === "returned" && canUpload && (
                  <th className="wb-col-actions" title="Удаление группы возврата">
                    {/* пустой заголовок — колонка действий */}
                  </th>
                )}
                {activeTab === "claims" && canUpload && (
                  <th className="wb-col-actions" title="Удаление ревизии претензий">
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
                      (activeTab === "inbound" || activeTab === "returned" || activeTab === "claims" ? 1 : 0) +
                      (activeTab === "inbound" && canUpload ? 1 : 0) +
                      (activeTab === "returned" && canUpload ? 1 : 0) +
                      (activeTab === "claims" && canUpload ? 1 : 0)
                    }
                    style={{ textAlign: "center", color: "var(--color-text-secondary)" }}
                  >
                    {loading
                      ? "Загрузка..."
                      : activeTab === "summary"
                        ? "Нет данных. Если коробки уже есть в «Описи», «Возвращенный груз» или «Претензии», нажмите «Обновить» — выполнится пересчёт сводной."
                        : "Нет данных"}
                  </td>
                </tr>
              ) : activeTab === "inbound" ? (
                items.map((row, idx) => {
                  const inv = String(row.inventoryNumber ?? idx);
                  const open = expandedInboundInv === inv;
                  const detailRowsRaw = inboundDetailsCache[inv] ?? [];
                  const needle = inboundDetailNeedle;
                  return (
                    <React.Fragment key={`inbound-${inv}-${idx}`}>
                      <tr
                        className={`wb-inbound-summary-row ${open ? "wb-inbound-summary-row--open" : ""}${
                          inboundSummaryFilterHit ? " wb-inbound-summary-row--filter-hit" : ""
                        }`}
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
                            {inboundDetailLoading === inv && detailRowsRaw.length === 0 ? (
                              <Typography.Body style={{ color: "var(--color-text-secondary)", padding: "0.5rem" }}>Загрузка строк...</Typography.Body>
                            ) : detailRowsRaw.length === 0 ? (
                              <Typography.Body style={{ color: "var(--color-text-secondary)", padding: "0.5rem" }}>Нет строк по этой ведомости</Typography.Body>
                            ) : (
                              <div className="wb-inbound-detail-wrap">
                                {needle ? (
                                  <Typography.Body
                                    style={{
                                      color: "var(--color-text-secondary)",
                                      padding: "0 0 0.5rem",
                                      fontSize: "0.875rem",
                                    }}
                                  >
                                    Все позиции ведомости; подсвечены строки, где есть совпадение с фильтром.
                                  </Typography.Body>
                                ) : null}
                                <table className="wb-table wb-table--nested">
                                  <thead>
                                    <tr>
                                      {INBOUND_DETAIL_COLUMNS.map((c) => (
                                        <th key={c.key}>{c.label}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {detailRowsRaw.map((dr, dIdx) => (
                                      <tr
                                        key={`${inv}-d-${dIdx}`}
                                        className={
                                          needle && inboundDetailRowMatchesNeedle(dr as Record<string, unknown>, needle)
                                            ? "wb-inbound-detail-line--hit"
                                            : undefined
                                        }
                                      >
                                        {INBOUND_DETAIL_COLUMNS.map((c) => (
                                          <td key={c.key}>
                                            {c.key === "lineNumber"
                                              ? String(dIdx + 1)
                                              : formatWbCellValue(c.key, dr[c.key])}
                                          </td>
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
              ) : activeTab === "returned" ? (
                items.map((row, idx) => {
                  const rec = row as Record<string, unknown>;
                  const g = normalizeReturnedGroupRow(rec);
                  const cacheKey = returnedGroupCacheKey(g);
                  const open =
                    expandedReturnedGroup !== null &&
                    returnedGroupCacheKey(expandedReturnedGroup) === cacheKey;
                  const detailRowsRaw = returnedDetailsCache[cacheKey] ?? [];
                  return (
                    <React.Fragment key={`returned-${cacheKey}-${idx}`}>
                      <tr
                        className={`wb-inbound-summary-row ${open ? "wb-inbound-summary-row--open" : ""}`}
                        onClick={() => toggleReturnedGroupRow(rec)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            toggleReturnedGroupRow(rec);
                          }
                        }}
                      >
                        <td className="wb-col-expand">{open ? "▼" : "▶"}</td>
                        {columns.map((col) => (
                          <td key={col.key}>
                            {col.key === "lineNumber"
                              ? String((page - 1) * limit + idx + 1)
                              : formatWbCellValue(col.key, row[col.key])}
                          </td>
                        ))}
                        {canUpload && (
                          <td className="wb-col-actions">
                            <button
                              type="button"
                              className="wb-delete-inventory-btn"
                              title="Удалить группу"
                              aria-label="Удалить группу возврата"
                              disabled={deletingReturnedGroup === cacheKey}
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleDeleteReturnedGroup(rec);
                              }}
                            >
                              {deletingReturnedGroup === cacheKey ? (
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
                          <td
                            colSpan={columns.length + 1 + (canUpload ? 1 : 0)}
                          >
                            {returnedDetailLoading === cacheKey && detailRowsRaw.length === 0 ? (
                              <Typography.Body style={{ color: "var(--color-text-secondary)", padding: "0.5rem" }}>
                                Загрузка строк...
                              </Typography.Body>
                            ) : detailRowsRaw.length === 0 ? (
                              <Typography.Body style={{ color: "var(--color-text-secondary)", padding: "0.5rem" }}>
                                Нет строк в этой группе
                              </Typography.Body>
                            ) : (
                              <div className="wb-inbound-detail-wrap">
                                <Typography.Body
                                  style={{
                                    color: "var(--color-text-secondary)",
                                    padding: "0 0 0.5rem",
                                    fontSize: "0.875rem",
                                  }}
                                >
                                  Строка ищется в «Описи» по номеру коробки, ШК, баркоду или стикеру.
                                </Typography.Body>
                                <table className="wb-table wb-table--nested">
                                  <thead>
                                    <tr>
                                      {RETURNED_DETAIL_COLUMNS.map((c) => (
                                        <th key={c.key}>{c.label}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {detailRowsRaw.map((dr, dIdx) => (
                                      <tr key={`${cacheKey}-d-${dIdx}`}>
                                        {RETURNED_DETAIL_COLUMNS.map((c) => (
                                          <td key={c.key}>{formatReturnedDetailCell(c.key, dr[c.key])}</td>
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
              ) : activeTab === "claims" ? (
                items.map((row, idx) => {
                  const revisionId = Number(row.revisionId);
                  const open = expandedClaimsRevisionId === revisionId;
                  const cacheKey = String(revisionId);
                  const detailRowsRaw = claimsDetailsCache[cacheKey] ?? [];
                  return (
                    <React.Fragment key={`claims-${revisionId}-${idx}`}>
                      <tr
                        className={`wb-inbound-summary-row ${open ? "wb-inbound-summary-row--open" : ""}`}
                        onClick={() => {
                          if (Number.isFinite(revisionId) && revisionId > 0) toggleClaimsRevisionRow(revisionId);
                        }}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            if (Number.isFinite(revisionId) && revisionId > 0) toggleClaimsRevisionRow(revisionId);
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
                              title="Удалить ревизию"
                              aria-label={`Удалить ревизию претензий ${revisionId}`}
                              disabled={deletingClaimsRevisionId === revisionId}
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleDeleteClaimsRevision(row as Record<string, unknown>);
                              }}
                            >
                              {deletingClaimsRevisionId === revisionId ? (
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
                            {claimsDetailLoading === revisionId && detailRowsRaw.length === 0 ? (
                              <Typography.Body style={{ color: "var(--color-text-secondary)", padding: "0.5rem" }}>
                                Загрузка строк...
                              </Typography.Body>
                            ) : detailRowsRaw.length === 0 ? (
                              <Typography.Body style={{ color: "var(--color-text-secondary)", padding: "0.5rem" }}>
                                Нет строк (проверьте фильтры)
                              </Typography.Body>
                            ) : (
                              <div className="wb-inbound-detail-wrap">
                                <table className="wb-table wb-table--nested">
                                  <thead>
                                    <tr>
                                      <th>№</th>
                                      {CLAIMS_EXCEL_COLUMN_SPEC.map((c) => (
                                        <th key={c.label}>{c.label}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {detailRowsRaw.map((dr, dIdx) => {
                                      const rec = dr as Record<string, unknown>;
                                      const allRaw = rec.allColumns ?? rec.all_columns;
                                      const all =
                                        allRaw && typeof allRaw === "object" && !Array.isArray(allRaw)
                                          ? (allRaw as Record<string, unknown>)
                                          : {};
                                      return (
                                        <tr key={`${cacheKey}-d-${dIdx}`}>
                                          <td>{dIdx + 1}</td>
                                          {CLAIMS_EXCEL_COLUMN_SPEC.map((c) => (
                                            <td key={c.label}>{pickClaimsExcelValue(all, c.headerKeys)}</td>
                                          ))}
                                        </tr>
                                      );
                                    })}
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
                      <td key={col.key}>{formatWbSummaryCell(col.key, row as Record<string, unknown>)}</td>
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

