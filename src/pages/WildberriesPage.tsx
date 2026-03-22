import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Flex, Panel, Typography, Input } from "@maxhub/max-ui";
import { TapSwitch } from "../components/TapSwitch";
import { Download, FileDown, FileUp, RefreshCw, Trash2, Upload, ChevronDown, X } from "lucide-react";
import type { AuthData } from "../types";
import { DOCUMENT_METHODS } from "../documentMethods";
import { PROXY_API_DOWNLOAD_URL } from "../constants/config";
import { coerceStatusDisplay } from "../lib/statusUtils";
import { normalizeWbPerevozkaHaulzDigits } from "../lib/wbPerevozkaNumber";
import { downloadBase64File } from "../utils";

type WbTab = "inbound" | "returned" | "claims" | "summary";
type ImportMode = "append" | "upsert";

type Props = {
  auth: AuthData;
  canUpload: boolean;
};

type ColumnDef = { key: string; label: string };

type InboundSummarySortKey = "inventoryNumber" | "inventoryCreatedAt" | "boxCount" | "totalPriceRub";

const INBOUND_SUMMARY_SORT_KEYS = new Set<string>(["inventoryNumber", "inventoryCreatedAt", "boxCount", "totalPriceRub"]);

/** Сортировка таблицы вкладки «Сводная» (без № и статуса 1С). */
const WB_SUMMARY_SORT_KEYS = new Set<string>([
  "shk",
  "boxId",
  "inboundBoxShk",
  "isReturned",
  "claimRowNumber",
  "claimPriceRub",
  "inventoryNumber",
  "inboundRowNumber",
  "inboundTitle",
  "inboundPriceRub",
]);

/** Колонки логистики из импорта возвратной описи (без сортировки по заголовку). Бейдж «Статус» — отдельно в ячейке. */
const WB_SUMMARY_LOGISTICS_KEYS = new Set<string>([
  "lvOtchetDostavki",
  "lvOtpavkaAp",
  "lvDataInfo",
  "lvDataUpakovano",
  "lvDataKonsolidirovano",
  "lvDataUletelo",
  "lvDataKVrucheniyu",
  "lvDataDostavleno",
]);

/** Номера описей, которые подсвечиваются фиолетовым на вкладке «Описи». */
const WB_INBOUND_HIGHLIGHT_INVENTORY_NUMBERS = new Set([
  "208633205",
  "208359616",
  "208550564",
  "208614312",
  "208630095",
]);

/** Блок «ШК коробов (текст)» + «Применить к описям» на вкладке «Описи». Включите true, если снова понадобится. */
const WB_SHOW_INBOUND_BOX_SHK_TEXT_PANEL = false;

/** Фильтр сводной: строки без last_status в кэше PostB (совпадает с api/wb/summary.ts). */
const WB_SUMMARY_FILTER_POSTB_EMPTY = "__postb_empty__";

function normalizeWbInventoryNumberKey(raw: unknown): string {
  return String(raw ?? "")
    .replace(/\s+/g, "")
    .trim();
}

const INBOUND_DETAIL_COLUMNS: ColumnDef[] = [
  { key: "lineNumber", label: "№" },
  { key: "inventoryNumber", label: "Номер ввозной описи" },
  { key: "inventoryCreatedAt", label: "Дата создания ввозной описи" },
  { key: "boxNumber", label: "Номер короба" },
  { key: "boxShk", label: "ШК короба" },
  { key: "shk", label: "ШК" },
  { key: "article", label: "Артикул" },
  { key: "brand", label: "Бренд" },
  { key: "description", label: "Описание" },
  { key: "priceRub", label: "Цена, RUB" },
  { key: "isReturned", label: "Возврат" },
  { key: "priceRubAfterReturn", label: "Сумма с учётом возврата" },
  { key: "massKg", label: "Масса" },
];

const RETURNED_DETAIL_COLUMNS: ColumnDef[] = [
  { key: "inboundInventoryNumber", label: "Номер описи" },
  { key: "boxId", label: "Номер короба" },
  { key: "inboundRowNumber", label: "№ строки описи" },
  { key: "inboundTitle", label: "Наименование" },
  { key: "inboundPriceRub", label: "Стоимость по описи" },
];

/** Колонки выгрузки WB в раскрытой таблице претензий (по заголовкам из файла). ШК — отдельно вторым столбцом после №. */
const CLAIMS_DETAIL_SHK_HEADER_KEYS = ["штрихкод", "шк", "баркод", "barcode"];

const CLAIMS_EXCEL_COLUMN_SPEC: { label: string; headerKeys: string[] }[] = [
  { label: "ID", headerKeys: ["id"] },
  { label: "Тип", headerKeys: ["тип"] },
  { label: "ID заявки на оплату", headerKeys: ["id заявки на оплату"] },
  { label: "Тип брака", headerKeys: ["тип брака"] },
  { label: "Дата заявки на оплату", headerKeys: ["дата заявки на оплату"] },
  { label: "СЦ", headerKeys: ["сц"] },
  { label: "Дата претензии", headerKeys: ["дата претензии"] },
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

/** ШК строки претензии: поле из БД, иначе из Excel (all_columns). */
function claimsDetailRowShk(rec: Record<string, unknown>, all: Record<string, unknown>): string {
  const db = String(rec.shk ?? "").trim();
  if (db) return db;
  return pickClaimsExcelValue(all, CLAIMS_DETAIL_SHK_HEADER_KEYS);
}

type ReturnedGroup = { documentNumber: string | null; batchId: number | null };

function returnedGroupCacheKey(g: ReturnedGroup): string {
  return JSON.stringify([String(g.documentNumber ?? "").trim(), g.batchId ?? null]);
}

function returnedDetailCacheKey(
  g: ReturnedGroup,
  f: { dateFrom: string; dateTo: string; boxId: string; q: string },
): string {
  return `${returnedGroupCacheKey(g)}\x1f${JSON.stringify({
    df: f.dateFrom,
    dt: f.dateTo,
    box: f.boxId,
    q: f.q,
  })}`;
}

function claimsDetailCacheKey(
  revisionId: number,
  f: { dateFrom: string; dateTo: string; boxId: string; q: string },
): string {
  return `${revisionId}\x1f${JSON.stringify({
    df: f.dateFrom,
    dt: f.dateTo,
    box: f.boxId,
    q: f.q,
  })}`;
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

/** Совпадение строки детализации с «Поиск» / «Номер короба» — только для подсветки (строки не скрываем). */
function inboundDetailRowMatchesNeedle(row: Record<string, unknown>, needleLower: string): boolean {
  if (!needleLower) return true;
  const keys = [
    "boxNumber",
    "boxShk",
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
    "isReturned",
    "priceRubAfterReturn",
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

const WB_SUMMARY_INBOUND_KEYS = new Set([
  "inventoryNumber",
  "inboundRowNumber",
  "inboundBoxShk",
  "inboundTitle",
  "inboundPriceRub",
]);

/** Ячейки сводной: претензия + поиск короба в описях или «нет в описях». */
function formatWbSummaryCell(colKey: string, row: Record<string, unknown>): string {
  const hasInbound = row.hasInbound === true;
  if (colKey === "shk") {
    /** API отдаёт shk с приоритетом c.shk (претензия), затем s.shk, i.shk */
    const t = String(row.shk ?? "").trim() || String(row.inboundShk ?? "").trim();
    return t || "—";
  }
  if (colKey === "isReturned") {
    return row.isReturned === true || row.isReturned === "true" ? "Да" : "Нет";
  }
  if (colKey === "boxId") return formatWbCellValue("boxId", row.boxId);
  if (colKey === "claimRowNumber") {
    const v = row.claimRowNumber;
    if (v === null || v === undefined || v === "") return "—";
    return String(v);
  }
  if (colKey === "claimPriceRub") {
    const v = row.claimPriceRub;
    if (v === null || v === undefined || v === "") return "—";
    return formatWbCellValue("claimPriceRub", v);
  }
  if (WB_SUMMARY_LOGISTICS_KEYS.has(colKey)) {
    const t = String(row[colKey] ?? "").trim();
    return t || "—";
  }
  if (WB_SUMMARY_INBOUND_KEYS.has(colKey)) {
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
    if (colKey === "inboundBoxShk") {
      const t = String(row.inboundBoxShk ?? "").trim();
      return t || "—";
    }
    if (colKey === "inventoryNumber") {
      const t = String(row.inventoryNumber ?? "").trim();
      return t || "—";
    }
  }
  return formatWbCellValue(colKey, row[colKey]);
}

/** Число из значения API/Excel (запятая, пробелы, NBSP) — для сумм и итогов. */
function parseWbMoneyNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "bigint") return Number(value);
  let s = String(value).trim();
  if (!s) return null;
  s = s.replace(/\u00a0/g, "").replace(/\u2007|\u202f/g, "").replace(/\s+/g, "");
  s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function formatWbMoneyRu(value: unknown): string {
  const n = parseWbMoneyNumber(value);
  if (n === null) return value === null || value === undefined ? "" : String(value);
  return n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatWbCellValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return "";
  if (
    key === "totalPriceRub" ||
    key === "priceRub" ||
    key === "priceRubAfterReturn" ||
    key === "totalAmountRub" ||
    key === "claimPriceRub"
  ) {
    return formatWbMoneyRu(value);
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
      const n = parseWbMoneyNumber(value);
      if (n === null) return "нет данных";
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

/** Код посылки для GetPosilka: ШК короба `$1:1:…:120762` (как в Postman), иначе ШК строки, иначе GA из справочника. */
function wbPostbPosilkaCode(rec: Record<string, unknown>): string {
  const box = String(rec.inboundBoxShk ?? "").trim();
  if (box) return box;
  const shk = String(rec.shk ?? "").trim();
  if (shk) return shk;
  const app = String(rec.appCargoNumber ?? "").trim();
  if (/^GA[0-9A-Z_-]+$/i.test(app)) return app;
  const g = app.match(/GA[0-9A-Z_-]+/i);
  if (g) return g[0];
  return "";
}

function wbPerevozkaNumberRaw(rec: Record<string, unknown>): string {
  return normalizeWbPerevozkaHaulzDigits(String(rec.lvPerevozkaNasha ?? "").trim());
}

/** Шаги GetPosilka из сводки (jsonb с API). */
function wbPostbStepsFromRec(rec: Record<string, unknown>): Array<{ title: string; date: string }> {
  const v = rec.postbPosilkaSteps;
  if (Array.isArray(v)) {
    return v.map((x) => ({
      title: String((x as { title?: string })?.title ?? ""),
      date: String((x as { date?: string })?.date ?? ""),
    }));
  }
  if (typeof v === "string" && v.trim()) {
    try {
      const j = JSON.parse(v) as unknown;
      if (!Array.isArray(j)) return [];
      return j.map((x) => ({
        title: String((x as { title?: string })?.title ?? ""),
        date: String((x as { date?: string })?.date ?? ""),
      }));
    } catch {
      return [];
    }
  }
  return [];
}

/** Есть сохранённый ответ PostB в БД — не дёргаем GetPosilka на клиенте. */
function wbHasPostbServerCache(rec: Record<string, unknown>): boolean {
  const st = coerceStatusDisplay(rec.postbLastStatus);
  const pv = String(rec.postbPerevozka ?? "").trim();
  return Boolean(st || pv || wbPostbStepsFromRec(rec).length > 0);
}

type WbPosilkaCached = {
  lastStatus: string;
  perevozka: string;
  posilkaSteps: Array<{ title: string; date: string }>;
};

type WbAppDebugPayload = {
  at: string;
  requestUrl: string;
  requestBody: Record<string, unknown>;
  responseStatus: number | null;
  responseBody: unknown;
  responseText: string;
  networkError: string;
};

function sanitizeWbDebugResponse(payload: unknown): unknown {
  if (!payload || typeof payload !== "object") return payload;
  const p = payload as Record<string, unknown>;
  if (typeof p.data === "string" && p.data.length > 120) {
    return {
      ...p,
      data: `<base64:${p.data.length} chars>`,
    };
  }
  return payload;
}

const wbPosilkaInflight = new Map<string, Promise<WbPosilkaCached>>();
const wbPosilkaResolved = new Map<string, WbPosilkaCached>();

function fetchWbPosilkaOnce(code: string, authHeaders: Record<string, string>): Promise<WbPosilkaCached> {
  const key = code.trim();
  if (!key) return Promise.resolve({ lastStatus: "", perevozka: "", posilkaSteps: [] });
  if (wbPosilkaResolved.has(key)) return Promise.resolve(wbPosilkaResolved.get(key)!);
  if (!wbPosilkaInflight.has(key)) {
    const p = (async () => {
      try {
        const u = `/api/wb/postb-getapi?kind=posilka&code=${encodeURIComponent(key)}`;
        const res = await fetch(u, { headers: authHeaders });
        const d = (await res.json().catch(() => ({}))) as {
          lastStatus?: string;
          perevozka?: string;
          posilkaSteps?: Array<{ title: string; date: string }>;
        };
        const entry: WbPosilkaCached = {
          lastStatus: String(d?.lastStatus ?? "").trim(),
          perevozka: normalizeWbPerevozkaHaulzDigits(String(d?.perevozka ?? "").trim()),
          posilkaSteps: Array.isArray(d?.posilkaSteps) ? d.posilkaSteps : [],
        };
        wbPosilkaResolved.set(key, entry);
        return entry;
      } catch {
        const empty: WbPosilkaCached = { lastStatus: "", perevozka: "", posilkaSteps: [] };
        wbPosilkaResolved.set(key, empty);
        return empty;
      } finally {
        wbPosilkaInflight.delete(key);
      }
    })();
    wbPosilkaInflight.set(key, p);
  }
  return wbPosilkaInflight.get(key)!;
}

async function fetchWbPosilkaForce(code: string, authHeaders: Record<string, string>): Promise<WbPosilkaCached> {
  const key = code.trim();
  if (!key) return { lastStatus: "", perevozka: "", posilkaSteps: [] };
  const u = `/api/wb/postb-getapi?kind=posilka&refresh=1&code=${encodeURIComponent(key)}`;
  const res = await fetch(u, { headers: authHeaders });
  const d = (await res.json().catch(() => ({}))) as {
    lastStatus?: string;
    perevozka?: string;
    posilkaSteps?: Array<{ title: string; date: string }>;
  };
  const entry: WbPosilkaCached = {
    lastStatus: String(d?.lastStatus ?? "").trim(),
    perevozka: normalizeWbPerevozkaHaulzDigits(String(d?.perevozka ?? "").trim()),
    posilkaSteps: Array.isArray(d?.posilkaSteps) ? d.posilkaSteps : [],
  };
  wbPosilkaResolved.set(key, entry);
  return entry;
}

function useWbPosilka(code: string, authHeaders: Record<string, string>): WbPosilkaCached & { loading: boolean } {
  const empty: WbPosilkaCached = { lastStatus: "", perevozka: "", posilkaSteps: [] };
  const k0 = code.trim();
  const [data, setData] = useState<WbPosilkaCached>(() =>
    k0 && wbPosilkaResolved.has(k0) ? wbPosilkaResolved.get(k0)! : empty,
  );
  const [loading, setLoading] = useState(() => Boolean(k0) && !wbPosilkaResolved.has(k0));

  useEffect(() => {
    const k = code.trim();
    if (!k) {
      setData(empty);
      setLoading(false);
      return;
    }
    if (wbPosilkaResolved.has(k)) {
      setData(wbPosilkaResolved.get(k)!);
      setLoading(false);
      return;
    }
    setLoading(true);
    let cancelled = false;
    void fetchWbPosilkaOnce(k, authHeaders).then((entry) => {
      if (!cancelled) {
        setData(entry);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [code, authHeaders]);

  return { ...data, loading };
}

function tryParseRuOrIsoDate(raw: string): Date | null {
  const t = raw.trim();
  if (!t) return null;
  const iso = /^\d{4}-\d{2}-\d{2}/.test(t) ? new Date(t.slice(0, 10)) : null;
  if (iso && !Number.isNaN(iso.getTime())) return iso;
  const m = t.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})/);
  if (m) {
    const d = Number(m[1]);
    const mo = Number(m[2]) - 1;
    let y = Number(m[3]);
    if (y < 100) y += 2000;
    const dt = new Date(y, mo, d);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  const d2 = new Date(t);
  return Number.isNaN(d2.getTime()) ? null : d2;
}

function WbPerevozkaTimelineModal(props: {
  open: boolean;
  number: string;
  authHeaders: Record<string, string>;
  /** Статусы из ответа GetPosilka (Сверки[].Статусы) — без второго запроса */
  initialStepsFromPosilka?: Array<{ title: string; date: string }>;
  onClose: () => void;
}) {
  const { open, number, authHeaders, initialStepsFromPosilka, onClose } = props;
  const [steps, setSteps] = useState<Array<{ title: string; date: string }>>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !number) return;
    if (initialStepsFromPosilka && initialStepsFromPosilka.length > 0) {
      setSteps(initialStepsFromPosilka);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setSteps([]);
    void (async () => {
      try {
        const u = `/api/wb/postb-getapi?kind=perevozka&number=${encodeURIComponent(number)}`;
        const res = await fetch(u, { headers: authHeaders });
        const d = (await res.json().catch(() => ({}))) as { steps?: Array<{ title: string; date: string }> };
        if (!cancelled) setSteps(Array.isArray(d?.steps) ? d.steps : []);
      } catch {
        if (!cancelled) setSteps([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, number, authHeaders, initialStepsFromPosilka]);

  if (!open) return null;

  const formatLine = (dateRaw: string) => {
    if (!dateRaw) return "";
    const dt = tryParseRuOrIsoDate(dateRaw);
    if (!dt)
      return (
        <span className="wb-timeline-date-muted">{dateRaw}</span>
      );
    const wd = dt.toLocaleDateString("ru-RU", { weekday: "short" });
    const rest = dt.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
    return (
      <span className="wb-timeline-date-line">
        <span className="wb-timeline-wd">{wd}</span>
        <span className="wb-timeline-d">, {rest}</span>
      </span>
    );
  };

  const dotClass = (title: string, idx: number, total: number) => {
    const low = title.toLowerCase();
    if (idx === total - 1) return "perevozka-timeline-dot perevozka-timeline-dot-success";
    if (low.includes("отправлен") && !low.includes("доставлен")) {
      return "perevozka-timeline-dot perevozka-timeline-dot-warning";
    }
    return "perevozka-timeline-dot perevozka-timeline-dot-default";
  };

  const n = steps.length;
  const fillPct = n <= 1 ? 100 : Math.min(100, Math.max(8, ((n - 1) / Math.max(n - 1, 1)) * 100));

  return (
    <div
      className="wb-perevozka-modal-backdrop"
      role="presentation"
      onClick={onClose}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <div
        className="wb-perevozka-modal"
        role="dialog"
        aria-labelledby="wb-perevozka-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="wb-perevozka-modal-head">
          <Typography.Body id="wb-perevozka-title" style={{ fontWeight: 700, fontSize: "1.05rem" }}>
            Статусы перевозки
          </Typography.Body>
          <button type="button" className="wb-perevozka-modal-close" aria-label="Закрыть" onClick={onClose}>
            <X className="w-5 h-5" />
          </button>
        </div>
        <Typography.Body style={{ color: "var(--color-text-secondary)", marginBottom: "0.75rem" }}>
          Перевозка № {number}
        </Typography.Body>
        {loading ? (
          <Typography.Body>Загрузка…</Typography.Body>
        ) : steps.length === 0 ? (
          <Typography.Body style={{ color: "var(--color-text-secondary)" }}>
            Нет данных статусов (проверьте ответ Getperevozka или номер перевозки).
          </Typography.Body>
        ) : (
          <div className="perevozka-timeline-wrap">
            <div className="perevozka-timeline" style={{ position: "relative" }}>
              <div className="perevozka-timeline-track-fill" style={{ height: `${fillPct}%` }} />
              {steps.map((s, idx) => (
                <div key={`${idx}-${s.title}`} className="perevozka-timeline-item">
                  <div className={dotClass(s.title, idx, steps.length)} />
                  <div className="perevozka-timeline-content">
                    <Typography.Body style={{ fontWeight: 700, marginBottom: 2 }}>{s.title}</Typography.Body>
                    <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>
                      {formatLine(s.date)}
                    </Typography.Body>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function WbAppDebugModal(props: {
  open: boolean;
  payload: WbAppDebugPayload | null;
  onClose: () => void;
}) {
  const { open, payload, onClose } = props;
  if (!open || !payload) return null;

  return (
    <div
      className="wb-perevozka-modal-backdrop"
      role="presentation"
      onClick={onClose}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <div
        className="wb-perevozka-modal"
        role="dialog"
        aria-labelledby="wb-app-debug-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="wb-perevozka-modal-head">
          <Typography.Body id="wb-app-debug-title" style={{ fontWeight: 700, fontSize: "1.05rem" }}>
            Отладка АПП
          </Typography.Body>
          <button type="button" className="wb-perevozka-modal-close" aria-label="Закрыть" onClick={onClose}>
            <X className="w-5 h-5" />
          </button>
        </div>
        <Typography.Body style={{ color: "var(--color-text-secondary)", marginBottom: "0.75rem" }}>
          {payload.at}
        </Typography.Body>
        <pre
          style={{
            margin: 0,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            fontSize: "0.78rem",
            lineHeight: 1.45,
            background: "var(--color-bg-hover)",
            border: "1px solid var(--color-border)",
            borderRadius: 10,
            padding: "0.75rem",
            maxHeight: "60vh",
            overflow: "auto",
          }}
        >
{JSON.stringify(payload, null, 2)}
        </pre>
      </div>
    </div>
  );
}

/** Бейдж статуса 1С (GetPosilka) + АПП; номер перевозки из ответа или из колонки / импорта. */
function WbSummaryStatus1cCell(props: {
  rec: Record<string, unknown>;
  authHeaders: Record<string, string>;
  appKey: string;
  wbAppDownloadingKey: string | null;
  onOpenTimeline: (payload: { number: string; stepsFromPosilka?: Array<{ title: string; date: string }> }) => void;
  onDownloadApp: (perevozkaNumber: string, loadingKey: string) => void;
}) {
  const { rec, authHeaders, appKey, wbAppDownloadingKey, onOpenTimeline, onDownloadApp } = props;
  const code = wbPostbPosilkaCode(rec);
  const [manualPosilka, setManualPosilka] = useState<WbPosilkaCached | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const serverSteps = wbPostbStepsFromRec(rec);
  const serverStatus = coerceStatusDisplay(rec.postbLastStatus);
  const serverPerevozka = String(rec.postbPerevozka ?? "").trim();
  const skipFetch = wbHasPostbServerCache(rec);
  const d = useWbPosilka(skipFetch ? "" : code, authHeaders);
  const lastStatus = coerceStatusDisplay(manualPosilka?.lastStatus) || serverStatus || d.lastStatus;
  const perevozka = normalizeWbPerevozkaHaulzDigits((manualPosilka?.perevozka || serverPerevozka || d.perevozka).trim());
  const inventoryNumber = String(rec.inventoryNumber ?? "").trim();
  const hasInbound = rec.hasInbound === true || Boolean(inventoryNumber);
  const noInbound = !hasInbound;
  const posilkaSteps = manualPosilka?.posilkaSteps?.length
    ? manualPosilka.posilkaSteps
    : serverSteps.length > 0
      ? serverSteps
      : d.posilkaSteps;
  const loading = skipFetch ? false : d.loading;
  const lvFb = wbPerevozkaNumberRaw(rec);
  const hasHaulz = Boolean(lvFb);
  /** Перевозка: сначала колонка HAULZ, затем кэш GetPosilka (ведущие нули для GetFile) */
  const transport = lvFb || perevozka;
  /** Если в HAULZ нет номера перевозки — считаем, что статус в PostB не передавался. */
  const display = noInbound
    ? "нет в описи"
    : !hasHaulz
      ? "не передавалась"
      : !code
        ? "—"
        : loading
          ? "…"
          : lastStatus || "—";

  const low = lastStatus.toLowerCase();
  let statusTone = "";
  if (noInbound) statusTone = " wb-postb-1c-badge--not-inbound";
  else if (!hasHaulz) statusTone = " wb-postb-1c-badge--not-sent";
  else if (low.includes("доставлен")) statusTone = " wb-postb-1c-badge--delivered";
  else if (low.includes("консолидац")) statusTone = " wb-postb-1c-badge--consolidation";
  else if (low.includes("пути") || low.includes("доставк") || low.includes("отправ") || low.includes("упак") || low.includes("сортиров")) {
    statusTone = " wb-postb-1c-badge--transit";
  } else if (!low) {
    statusTone = " wb-postb-1c-badge--empty";
  }

  const busy = wbAppDownloadingKey === appKey;
  const appNumber = lvFb || perevozka;
  const refreshBusy = refreshing;
  const canOpenTimeline = !noInbound && hasHaulz && Boolean(transport);
  const canRefresh = !noInbound && hasHaulz && Boolean(code);

  return (
    <>
      <div className="wb-postb-status-row">
        <button
          type="button"
          className={`wb-postb-1c-badge${statusTone}`}
          disabled={!canOpenTimeline}
          title={
            canOpenTimeline
              ? "Открыть статусы перевозки"
              : noInbound
                ? "По строке нет данных в описи"
              : hasHaulz
                ? "Нет номера перевозки (колонка «Перевозка HAULZ» или ответ GetPosilka)"
                : "Нет номера в колонке «Перевозка HAULZ»: статус не передавалась"
          }
          onClick={() => {
            if (canOpenTimeline && transport)
              onOpenTimeline({
                number: transport,
                stepsFromPosilka: posilkaSteps.length ? posilkaSteps : undefined,
              });
          }}
        >
          {display}
        </button>
        <button
          type="button"
          className={`wb-postb-refresh-badge${refreshBusy ? " wb-postb-refresh-badge--busy" : ""}`}
          disabled={!canRefresh || refreshBusy}
          title={canRefresh ? "Принудительно обновить статус посылки (GetPosilka, refresh=1)" : noInbound ? "По строке нет данных в описи" : "Нельзя обновить без номера HAULZ"}
          onClick={() => {
            if (!canRefresh || !code || refreshBusy) return;
            setRefreshing(true);
            void fetchWbPosilkaForce(code, authHeaders)
              .then((entry) => setManualPosilka(entry))
              .finally(() => setRefreshing(false));
          }}
        >
          <RefreshCw className={`wb-postb-app-badge-icon${refreshBusy ? " animate-spin" : ""}`} aria-hidden />
        </button>
      </div>
      {appNumber ? (
        <button
          type="button"
          className={`wb-postb-app-badge${busy ? " wb-postb-app-badge--busy" : ""}`}
          disabled={busy}
          title="Скачать АПП (GetFile, metod=АПП, номер из «Перевозка HAULZ»)"
          onClick={() => onDownloadApp(appNumber, appKey)}
        >
          {busy ? <RefreshCw className="wb-postb-app-badge-icon animate-spin" aria-hidden /> : <FileDown className="wb-postb-app-badge-icon" aria-hidden />}
          {busy ? "…" : "АПП"}
        </button>
      ) : null}
    </>
  );
}

function WbSummaryPerevozkaHaulzCell(props: { rec: Record<string, unknown>; authHeaders: Record<string, string> }) {
  const { rec, authHeaders } = props;
  const code = wbPostbPosilkaCode(rec);
  const lvFallback = wbPerevozkaNumberRaw(rec);
  const cachedPv = normalizeWbPerevozkaHaulzDigits(String(rec.postbPerevozka ?? "").trim());
  const skipFetch = wbHasPostbServerCache(rec);
  const d = useWbPosilka(skipFetch ? "" : code, authHeaders);
  const show = lvFallback || cachedPv || normalizeWbPerevozkaHaulzDigits(d.perevozka);
  if (!show) return "—";
  return show;
}

type WbInboundListFilters = {
  dateFrom: string;
  dateTo: string;
  inventoryNumber: string;
  boxId: string;
  q: string;
};

/** Ключ кэша детализации: те же фильтры, что и у сводки (иначе подгружалась вся ведомость). */
function inboundDetailCacheKey(inventoryNumber: string, f: WbInboundListFilters): string {
  const inv = String(inventoryNumber ?? "").trim();
  const sig = JSON.stringify({
    df: f.dateFrom,
    dt: f.dateTo,
    invF: f.inventoryNumber,
    box: f.boxId,
    q: f.q,
  });
  return `${inv}\x1f${sig}`;
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
  const [expandedClaimsRevisionId, setExpandedClaimsRevisionId] = useState<number | null>(null);
  const [claimsDetailsCache, setClaimsDetailsCache] = useState<Record<string, Record<string, unknown>[]>>({});
  const [claimsDetailLoading, setClaimsDetailLoading] = useState<string | null>(null);
  const [deletingClaimsRevisionId, setDeletingClaimsRevisionId] = useState<number | null>(null);
  const [expandedInboundInv, setExpandedInboundInv] = useState<string | null>(null);
  const [inboundDetailsCache, setInboundDetailsCache] = useState<Record<string, Record<string, unknown>[]>>({});
  const [inboundDetailLoading, setInboundDetailLoading] = useState<string | null>(null);
  /** Ключ строки: `in-${id}` в описях (если вернём АПП туда) или `s-${page}-${idx}` на сводной */
  const [wbAppDownloadingKey, setWbAppDownloadingKey] = useState<string | null>(null);
  const [deletingInventory, setDeletingInventory] = useState<string | null>(null);
  const [expandedReturnedGroup, setExpandedReturnedGroup] = useState<ReturnedGroup | null>(null);
  const [returnedDetailsCache, setReturnedDetailsCache] = useState<Record<string, Record<string, unknown>[]>>({});
  const [returnedDetailLoading, setReturnedDetailLoading] = useState<string | null>(null);
  const [deletingReturnedGroup, setDeletingReturnedGroup] = useState<string | null>(null);
  const [summaryHeader, setSummaryHeader] = useState<{
    formedAt: string | null;
    placeCount: number;
    totalClaimRub: string | number;
    totalInboundRub: string | number;
    totalNotInInboundClaimRub: string | number;
    /** Стоимость в описи по строкам, у которых в PostB нет last_status (в «Все» учтены, по статусу — нет). */
    totalInboundRubPostbBlank: string | number;
    rowCountPostbBlank: number;
    /** Разбивка сумм по last_status PostB (без учёта фильтра статуса в запросе). */
    inboundByPostbStatus: Array<{
      status: string;
      rowCount: number;
      totalClaimRub: string | number;
      totalInboundRub: string | number;
    }>;
  } | null>(null);
  const [summaryOnlyNotInInbound, setSummaryOnlyNotInInbound] = useState(false);
  const [summaryGroupByPerevozka, setSummaryGroupByPerevozka] = useState(false);
  const [summarySort, setSummarySort] = useState<{ by: string; dir: "asc" | "desc" }>({ by: "", dir: "asc" });
  const [clearingSummary, setClearingSummary] = useState(false);
  /** Текстовый список короб:ШК для вкладки «Описи» ($1:1:3820740543:120762). */
  const [inboundBoxShkText, setInboundBoxShkText] = useState("");
  const [boxShkApplying, setBoxShkApplying] = useState(false);
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

  const [summaryFilterStatus, setSummaryFilterStatus] = useState("");
  const [summaryUploadExpanded, setSummaryUploadExpanded] = useState(true);
  const [batchUploadExpanded, setBatchUploadExpanded] = useState(true);
  const [inboundBoxShkExpanded, setInboundBoxShkExpanded] = useState(false);
  const [manualReturnedExpanded, setManualReturnedExpanded] = useState(true);
  const [summaryCompactExpanded, setSummaryCompactExpanded] = useState(true);
  const [perevozkaModal, setPerevozkaModal] = useState<{
    number: string;
    stepsFromPosilka?: Array<{ title: string; date: string }>;
  } | null>(null);
  const [wbAppDebug, setWbAppDebug] = useState<WbAppDebugPayload | null>(null);
  const [wbAppDebugOpen, setWbAppDebugOpen] = useState(false);

  const [filters, setFilters] = useState({
    dateFrom: "",
    dateTo: "",
    inventoryNumber: "",
    boxId: "",
    claimNumber: "",
    q: "",
  });

  /** Нижний регистр: фильтр строк внутри раскрытой ведомости (поиск / номер короба). */
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
        claimNumber: activeTab === "summary" ? filters.claimNumber : undefined,
        onlyNotInInbound: activeTab === "summary" && summaryOnlyNotInInbound ? "true" : undefined,
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
        ...(activeTab === "summary" && summarySort.by
          ? { sortBy: summarySort.by, sortDir: summarySort.dir }
          : activeTab === "inbound"
            ? { sortBy: inboundSummarySort.by, sortDir: inboundSummarySort.dir }
            : {}),
        ...(activeTab === "summary" && summaryFilterStatus ? { filterLogisticsStatus: summaryFilterStatus } : {}),
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
            totalClaimRub: (sh as { totalClaimRub?: unknown }).totalClaimRub ?? "0",
            totalInboundRub: (sh as { totalInboundRub?: unknown }).totalInboundRub ?? "0",
            totalNotInInboundClaimRub: (sh as { totalNotInInboundClaimRub?: unknown }).totalNotInInboundClaimRub ?? "0",
            totalInboundRubPostbBlank: (sh as { totalInboundRubPostbBlank?: unknown }).totalInboundRubPostbBlank ?? "0",
            rowCountPostbBlank: Number((sh as { rowCountPostbBlank?: unknown }).rowCountPostbBlank ?? 0),
            inboundByPostbStatus: (() => {
              const raw = (sh as { inboundByPostbStatus?: unknown }).inboundByPostbStatus;
              if (!Array.isArray(raw)) return [];
              return raw.map((row) => {
                const r = row as Record<string, unknown>;
                return {
                  status: String(r.status ?? ""),
                  rowCount: Number(r.rowCount ?? 0),
                  totalClaimRub: r.totalClaimRub ?? "0",
                  totalInboundRub: r.totalInboundRub ?? "0",
                };
              });
            })(),
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
    filters.boxId,
    filters.claimNumber,
    filters.dateFrom,
    filters.dateTo,
    filters.inventoryNumber,
    filters.q,
    inboundSummarySort.by,
    inboundSummarySort.dir,
    summaryOnlyNotInInbound,
    summarySort.by,
    summarySort.dir,
    summaryFilterStatus,
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
    setInboundDetailsCache({});
    setReturnedDetailsCache({});
  }, [
    activeTab,
    page,
    limit,
    inboundSummarySort.by,
    inboundSummarySort.dir,
    filters.dateFrom,
    filters.dateTo,
    filters.boxId,
    filters.q,
    filters.inventoryNumber,
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
  }, [filters.dateFrom, filters.dateTo, filters.boxId, filters.q]);

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

  const onSummarySortClick = useCallback((key: string) => {
    if (!WB_SUMMARY_SORT_KEYS.has(key)) return;
    setSummarySort((prev) => {
      if (prev.by === key) return { by: key, dir: prev.dir === "asc" ? "desc" : "asc" };
      return { by: key, dir: "asc" };
    });
    setPage(1);
  }, []);

  const loadInboundDetails = useCallback(
    async (inventoryNumber: string) => {
      const cacheKey = inboundDetailCacheKey(inventoryNumber, filters);
      if (Object.prototype.hasOwnProperty.call(inboundDetailsCacheRef.current, cacheKey)) return;
      setInboundDetailLoading(cacheKey);
      try {
        const query = buildQuery({
          inventoryNumber,
          dateFrom: filters.dateFrom,
          dateTo: filters.dateTo,
          boxId: filters.boxId,
          q: filters.q,
          /** См. api/wb/inbound.ts INBOUND_DETAIL_SINGLE_INV_MAX_LIMIT */
          limit: 15000,
          page: 1,
        });
        const res = await fetch(`/api/wb/inbound?${query}`, { headers: authHeaders });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Ошибка загрузки строк");
        const rows = Array.isArray(data?.items) ? data.items : [];
        setInboundDetailsCache((prev) => ({ ...prev, [cacheKey]: rows }));
      } catch {
        setInboundDetailsCache((prev) => ({ ...prev, [cacheKey]: [] }));
      } finally {
        setInboundDetailLoading(null);
      }
    },
    [authHeaders, filters.boxId, filters.dateFrom, filters.dateTo, filters.inventoryNumber, filters.q],
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
          for (const k of Object.keys(next)) {
            if (k === inv || k.startsWith(`${inv}\x1f`)) delete next[k];
          }
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
      const cacheKey = returnedDetailCacheKey(group, {
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        boxId: filters.boxId,
        q: filters.q,
      });
      if (Object.prototype.hasOwnProperty.call(returnedDetailsCacheRef.current, cacheKey)) return;
      setReturnedDetailLoading(cacheKey);
      try {
        const params = new URLSearchParams();
        params.set("view", "detail");
        params.set("gDoc", String(group.documentNumber ?? ""));
        params.set("gBatch", group.batchId === null || group.batchId === undefined ? "" : String(group.batchId));
        if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
        if (filters.dateTo) params.set("dateTo", filters.dateTo);
        if (filters.boxId.trim()) params.set("boxId", filters.boxId.trim());
        if (filters.q.trim()) params.set("q", filters.q.trim());
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
    [authHeaders, filters.boxId, filters.dateFrom, filters.dateTo, filters.q],
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
          for (const k of Object.keys(next)) {
            if (k === cacheKey || k.startsWith(`${cacheKey}\x1f`)) delete next[k];
          }
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
      const key = claimsDetailCacheKey(revisionId, {
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        boxId: filters.boxId,
        q: filters.q,
      });
      if (Object.prototype.hasOwnProperty.call(claimsDetailsCacheRef.current, key)) return;
      setClaimsDetailLoading(key);
      try {
        const params = new URLSearchParams();
        params.set("view", "detail");
        params.set("revisionId", String(revisionId));
        if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
        if (filters.dateTo) params.set("dateTo", filters.dateTo);
        if (filters.boxId.trim()) params.set("boxId", filters.boxId.trim());
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
    [authHeaders, filters.boxId, filters.dateFrom, filters.dateTo, filters.q],
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
          const prefix = `${revisionId}\x1f`;
          for (const k of Object.keys(next)) {
            if (k === String(revisionId) || k.startsWith(prefix)) delete next[k];
          }
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

  const handleApplyInboundBoxShk = useCallback(async () => {
    const text = inboundBoxShkText.trim();
    if (!text) {
      setUploadError("Вставьте список строк (минимум два поля через «:»; предпоследнее — номер короба).");
      return;
    }
    setBoxShkApplying(true);
    setUploadError(null);
    try {
      const res = await fetch("/api/wb/inbound/box-shk-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Ошибка применения ШК коробов");
      const n = Number(data?.rowsUpdated ?? 0);
      const p = Number(data?.pairsInFile ?? 0);
      setInboundDetailsCache({});
      await loadData();
      setUploadError(null);
      if (typeof window !== "undefined") {
        window.alert(`Применено пар из файла: ${p}. Обновлено строк в описях: ${n}.`);
      }
    } catch (e: unknown) {
      setUploadError((e as Error)?.message || "Ошибка применения ШК коробов");
    } finally {
      setBoxShkApplying(false);
    }
  }, [authHeaders, inboundBoxShkText, loadData]);

  const handleDownloadWbApp = useCallback(async (perevozkaNumber: string, loadingKey: string) => {
    const n = normalizeWbPerevozkaHaulzDigits(String(perevozkaNumber ?? ""));
    if (!n) {
      setUploadError("Нет номера перевозки (колонка «Перевозка HAULZ»)");
      return;
    }
    if (!auth?.login || !auth?.password) {
      setUploadError("Требуется авторизация для скачивания АПП");
      return;
    }
    setUploadError(null);
    setWbAppDownloadingKey(loadingKey);
    const metod = DOCUMENT_METHODS["АПП"] ?? "АПП";
    const requestUrl = typeof window !== "undefined" && window.location?.origin
      ? `${window.location.origin}${PROXY_API_DOWNLOAD_URL}`
      : PROXY_API_DOWNLOAD_URL;
    const requestBody: Record<string, unknown> = {
      login: auth.login,
      password: auth.password,
      metod,
      number: n,
      ...(auth.isRegisteredUser ? { isRegisteredUser: true } : {}),
    };
    const debugBase: WbAppDebugPayload = {
      at: new Date().toLocaleString("ru-RU"),
      requestUrl,
      requestBody: {
        ...requestBody,
        password: "***",
      },
      responseStatus: null,
      responseBody: null,
      responseText: "",
      networkError: "",
    };
    try {
      const res = await fetch(requestUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const raw = await res.text();
      let data: Record<string, unknown> = {};
      try {
        data = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      } catch {
        data = {};
      }
      setWbAppDebug({
        ...debugBase,
        responseStatus: res.status,
        responseBody: sanitizeWbDebugResponse(data),
        responseText: raw.slice(0, 5000),
      });
      if (!res.ok) throw new Error(data?.message || data?.error || "Не удалось получить АПП");
      if (!data?.data) throw new Error("Документ АПП не найден");
      await downloadBase64File({
        data: String(data.data),
        name: data?.name || `АПП_${n}.pdf`,
        isHtml: Boolean(data?.isHtml),
      });
    } catch (e: unknown) {
      setWbAppDebug((prev) =>
        prev
          ? { ...prev, networkError: (e as Error)?.message || "Ошибка скачивания АПП" }
          : { ...debugBase, networkError: (e as Error)?.message || "Ошибка скачивания АПП" },
      );
      setUploadError((e as Error)?.message || "Ошибка скачивания АПП");
    } finally {
      setWbAppDownloadingKey(null);
    }
  }, [auth]);

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

  /** Импорт колонок логистики из файла возвратной описи (колонка «Посылка» = ШК короба / ключ посылки). */
  const handleLogisticsImport = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList?.length) return;
      const file = fileList[0];
      if (!file) return;
      setUploading(true);
      setUploadError(null);
      try {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/wb/logistics-import", {
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
          throw new Error(apiErr ? `${apiErr}${idSuffix}` : `HTTP ${res.status}${idSuffix}`);
        }
        await loadData();
      } catch (e: unknown) {
        setUploadError((e as Error)?.message || "Ошибка импорта логистики");
      } finally {
        setUploading(false);
      }
    },
    [authHeaders, loadData],
  );

  const handleExport = useCallback(
    async (format: "csv" | "xlsx") => {
      const query = buildQuery({
        block: activeTab,
        format,
        q: filters.q,
        ...(activeTab === "summary" && summaryFilterStatus ? { filterLogisticsStatus: summaryFilterStatus } : {}),
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
    [activeTab, authHeaders, filters.q, summaryFilterStatus],
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
        { key: "totalAmountRub", label: "Сумма" },
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
      { key: "lineNumber", label: "№" },
      { key: "shk", label: "ШК" },
      { key: "boxId", label: "Номер короба" },
      { key: "inboundBoxShk", label: "ШК короба" },
      { key: "isReturned", label: "Возвращена" },
      { key: "claimRowNumber", label: "Номер строки претензии" },
      { key: "claimPriceRub", label: "Цена из претензии" },
      { key: "inventoryNumber", label: "Номер описи" },
      { key: "inboundRowNumber", label: "Номер строки в описи" },
      { key: "inboundTitle", label: "Описание в описи" },
      { key: "inboundPriceRub", label: "Стоимость в описи" },
      { key: "lvPerevozkaNasha", label: "Перевозка HAULZ" },
      { key: "lvOtchetDostavki", label: "Отчет о доставке" },
      { key: "lvOtpavkaAp", label: "Отправка" },
      { key: "lvDataInfo", label: "Дата получена информация" },
      { key: "lvDataUpakovano", label: "Дата упаковано" },
      { key: "lvDataKonsolidirovano", label: "Дата консолидировано" },
      { key: "lvDataUletelo", label: "Дата отправки" },
      { key: "lvDataKVrucheniyu", label: "Дата к Вручению" },
      { key: "lvDataDostavleno", label: "Дата Доставлено" },
      { key: "status1c", label: "Статус (PostB)" },
    ];
  }, [activeTab]);

  /** Итог по колонке «Сумма» на текущей странице (возвратный груз). */
  const returnedPageAmountSum = useMemo(() => {
    if (activeTab !== "returned") return null;
    let sum = 0;
    for (const row of items) {
      const n = parseWbMoneyNumber((row as Record<string, unknown>).totalAmountRub);
      if (n !== null) sum += n;
    }
    return sum;
  }, [activeTab, items]);

  /** Сводная: склеиваем строки до уровня «Перевозка HAULZ» на текущей странице. */
  const summaryViewItems = useMemo<Record<string, unknown>[]>(() => {
    if (activeTab !== "summary" || !summaryGroupByPerevozka) return items;

    const groups = new Map<
      string,
      { row: Record<string, unknown>; claimSum: number; inboundSum: number; count: number }
    >();

    for (let idx = 0; idx < items.length; idx += 1) {
      const rec = items[idx] as Record<string, unknown>;
      const k = normalizeWbPerevozkaHaulzDigits(String(rec.lvPerevozkaNasha ?? "").trim());
      const key = k || `__nogroup__${idx}`;
      const claim = parseWbMoneyNumber(rec.claimPriceRub) ?? 0;
      const inbound = parseWbMoneyNumber(rec.inboundPriceRub) ?? 0;

      if (!groups.has(key)) {
        groups.set(key, { row: { ...rec }, claimSum: claim, inboundSum: inbound, count: 1 });
        continue;
      }

      const g = groups.get(key)!;
      g.count += 1;
      g.claimSum += claim;
      g.inboundSum += inbound;
      g.row.isReturned = Boolean(g.row.isReturned) || Boolean(rec.isReturned);
      g.row.hasInbound = Boolean(g.row.hasInbound) || Boolean(rec.hasInbound);
      if (String(g.row.lvLogisticsStatus ?? "").trim() !== String(rec.lvLogisticsStatus ?? "").trim()) {
        g.row.lvLogisticsStatus = "Смешано";
      }
      const collapseKeys = ["shk", "boxId", "inboundBoxShk", "inventoryNumber", "claimRowNumber", "inboundRowNumber"];
      for (const ck of collapseKeys) {
        const a = String(g.row[ck] ?? "").trim();
        const b = String(rec[ck] ?? "").trim();
        if (a && b && a !== b) g.row[ck] = "—";
      }
    }

    return Array.from(groups.values()).map((g) => ({
      ...g.row,
      claimPriceRub: g.claimSum,
      inboundPriceRub: g.inboundSum,
    }));
  }, [activeTab, items, summaryGroupByPerevozka]);

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

        <div className="wb-filters-grid wb-filters-grid--main">
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
            placeholder="Номер короба"
            title="Фильтр по номеру короба (частичное совпадение)"
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
          {activeTab === "summary" ? (
            <Button
              className="wb-action-btn"
              onClick={() => setSummaryGroupByPerevozka((v) => !v)}
              title="Склеить строки текущей страницы до уровня перевозок HAULZ"
            >
              {summaryGroupByPerevozka ? "По перевозкам: ВКЛ" : "По перевозкам"}
            </Button>
          ) : null}
          <Button className="wb-action-btn" onClick={() => void handleExport("csv")}>
            <Download className="w-4 h-4" />
            CSV
          </Button>
          <Button className="wb-action-btn" onClick={() => void handleExport("xlsx")}>
            <Download className="w-4 h-4" />
            XLSX
          </Button>
          {canUpload && activeTab === "summary" && (
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
        </Flex>

        {canUpload && activeTab === "summary" && (
          <div className="wb-collapsible-block">
            <button
              type="button"
              className="wb-collapsible-toggle"
              onClick={() => setSummaryUploadExpanded((v) => !v)}
              aria-expanded={summaryUploadExpanded}
            >
              <span>Импорт логистики (сводная)</span>
              <ChevronDown className={`w-4 h-4 wb-collapsible-caret${summaryUploadExpanded ? " is-open" : ""}`} aria-hidden />
            </button>
            {summaryUploadExpanded && (
              <div className="wb-upload-box" style={{ marginTop: "0.5rem" }}>
                <Typography.Body style={{ marginBottom: "0.35rem" }}>
                  Импорт логистики из возвратной описи (колонка «Посылка» должна совпадать с «ШК короба» в сводной):
                </Typography.Body>
                <label className="wb-upload-drop">
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    style={{ display: "none" }}
                    disabled={uploading || loading}
                    onChange={(e) => {
                      const files = e.target.files;
                      void handleLogisticsImport(files).finally(() => {
                        e.target.value = "";
                      });
                    }}
                  />
                  <FileUp size={16} />
                  <span>{uploading ? "Идёт импорт..." : "Выберите один .xlsx / .xls"}</span>
                </label>
              </div>
            )}
          </div>
        )}

        {canUpload && (activeTab === "inbound" || activeTab === "returned" || activeTab === "claims") && (
          <div className="wb-collapsible-block">
            <button
              type="button"
              className="wb-collapsible-toggle"
              onClick={() => setBatchUploadExpanded((v) => !v)}
              aria-expanded={batchUploadExpanded}
            >
              <span>Импорт файлов</span>
              <ChevronDown className={`w-4 h-4 wb-collapsible-caret${batchUploadExpanded ? " is-open" : ""}`} aria-hidden />
            </button>
            {batchUploadExpanded && (
              <div className="wb-upload-box" style={{ marginTop: "0.5rem" }}>
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
          </div>
        )}

        {WB_SHOW_INBOUND_BOX_SHK_TEXT_PANEL && canUpload && activeTab === "inbound" && (
          <div className="wb-collapsible-block">
            <button
              type="button"
              className="wb-collapsible-toggle"
              onClick={() => setInboundBoxShkExpanded((v) => !v)}
              aria-expanded={inboundBoxShkExpanded}
            >
              <span>ШК коробов (текст)</span>
              <ChevronDown className={`w-4 h-4 wb-collapsible-caret${inboundBoxShkExpanded ? " is-open" : ""}`} aria-hidden />
            </button>
            {inboundBoxShkExpanded && (
              <div
                className="wb-box-shk-panel"
                style={{
                  marginTop: "0.5rem",
                  padding: "0.65rem 1rem",
                  borderRadius: "10px",
                  border: "1px dashed rgba(124, 58, 237, 0.45)",
                  background: "var(--color-bg-card)",
                }}
              >
                <Typography.Body style={{ fontSize: "0.8125rem", color: "var(--color-text-secondary)", marginBottom: "0.5rem", display: "block" }}>
                  По каждой строке предпоследнее поле через «:» — номер короба; в колонку «ШК короба» записывается{" "}
                  <strong>вся строка целиком</strong> (как в файле). Пример:{" "}
                  <code style={{ fontSize: "0.8em" }}>$1:1:3820740543:120762</code> → короб{" "}
                  <code style={{ fontSize: "0.8em" }}>3820740543</code>, в БД ШК короба:{" "}
                  <code style={{ fontSize: "0.8em" }}>$1:1:3820740543:120762</code>.
                </Typography.Body>
                <textarea
                  className="admin-form-input"
                  value={inboundBoxShkText}
                  onChange={(e) => setInboundBoxShkText(e.target.value)}
                  placeholder={"$1:1:3820740543:120762\n$1:1:3818456844:119900"}
                  rows={6}
                  style={{
                    width: "100%",
                    minHeight: "7rem",
                    resize: "vertical",
                    fontFamily: "ui-monospace, monospace",
                    fontSize: "0.8125rem",
                    marginBottom: "0.5rem",
                    boxSizing: "border-box",
                  }}
                />
                <Button className="wb-action-btn" onClick={() => void handleApplyInboundBoxShk()} disabled={boxShkApplying || loading}>
                  {boxShkApplying ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {boxShkApplying ? " Применение…" : "Применить к описям"}
                </Button>
              </div>
            )}
          </div>
        )}

        {canUpload && activeTab === "returned" && (
          <div className="wb-collapsible-block">
            <button
              type="button"
              className="wb-collapsible-toggle"
              onClick={() => setManualReturnedExpanded((v) => !v)}
              aria-expanded={manualReturnedExpanded}
            >
              <span>Ручной ввод (грузы без ШК)</span>
              <ChevronDown className={`w-4 h-4 wb-collapsible-caret${manualReturnedExpanded ? " is-open" : ""}`} aria-hidden />
            </button>
            {manualReturnedExpanded && (
              <div className="wb-manual-panel" style={{ marginTop: "0.5rem" }}>
                <div className="wb-filters-grid">
                  <Input className="admin-form-input" placeholder="ID короба*" value={manualReturned.boxId} onChange={(e) => setManualReturned((p) => ({ ...p, boxId: e.target.value }))} />
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
          </div>
        )}

        {activeTab === "summary" && (
          <div className="wb-summary-compact">
            <div className="wb-summary-compact-head">
              <Typography.Body style={{ margin: 0, fontWeight: 600 }}>Сводные итоги</Typography.Body>
              <button
                type="button"
                className="wb-collapsible-toggle wb-collapsible-toggle--inline"
                onClick={() => setSummaryCompactExpanded((v) => !v)}
                aria-expanded={summaryCompactExpanded}
              >
                <span>{summaryCompactExpanded ? "Свернуть" : "Развернуть"}</span>
                <ChevronDown className={`w-4 h-4 wb-collapsible-caret${summaryCompactExpanded ? " is-open" : ""}`} aria-hidden />
              </button>
            </div>
            {summaryCompactExpanded && (
              <>
                <div className="wb-summary-compact-grid">
                  <div className="wb-summary-metric-card">
                    <span className="wb-summary-metric-label">Дата формирования</span>
                    <strong className="wb-summary-metric-value">
                      {summaryHeader?.formedAt
                        ? (() => {
                            const d = new Date(summaryHeader.formedAt);
                            return Number.isNaN(d.getTime())
                              ? String(summaryHeader.formedAt).slice(0, 19).replace("T", " ")
                              : d.toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
                          })()
                        : "—"}
                    </strong>
                  </div>
                  <div className="wb-summary-metric-card">
                    <span className="wb-summary-metric-label">Кол-во мест</span>
                    <strong className="wb-summary-metric-value">{total}</strong>
                  </div>
                  <div className="wb-summary-metric-card">
                    <span className="wb-summary-metric-label">Стоимость в претензии</span>
                    <strong className="wb-summary-metric-value">
                      {Number(summaryHeader?.totalClaimRub ?? 0).toLocaleString("ru-RU", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{" "}
                      ₽
                    </strong>
                  </div>
                  <div className="wb-summary-metric-card">
                    <span className="wb-summary-metric-label">Стоимость в описях</span>
                    <strong className="wb-summary-metric-value">
                      {Number(summaryHeader?.totalInboundRub ?? 0).toLocaleString("ru-RU", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{" "}
                      ₽
                    </strong>
                  </div>
                  <div className="wb-summary-metric-card wb-summary-metric-card--warn">
                    <span className="wb-summary-metric-label">Нет в описях (по претензии)</span>
                    <strong className="wb-summary-metric-value">
                      {Number(summaryHeader?.totalNotInInboundClaimRub ?? 0).toLocaleString("ru-RU", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{" "}
                      ₽
                    </strong>
                  </div>
                  <div className="wb-summary-metric-card wb-summary-metric-card--switch">
                    <span className="wb-summary-metric-label">Фильтр</span>
                    <div className="wb-summary-switch-row">
                      <TapSwitch
                        checked={summaryOnlyNotInInbound}
                        onToggle={() => {
                          setSummaryOnlyNotInInbound((v) => !v);
                          setPage(1);
                        }}
                      />
                      <Typography.Body style={{ margin: 0, fontSize: "0.84rem" }}>Нет в описях</Typography.Body>
                    </div>
                  </div>
                </div>
                {summaryHeader && summaryHeader.inboundByPostbStatus.length > 0 && (
                  <div className="wb-summary-status-breakdown">
                    <div className="wb-summary-status-list">
                      <button
                        type="button"
                        className={`wb-summary-status-item wb-summary-status-item--filter${!summaryFilterStatus ? " wb-summary-status-item--active" : ""}`}
                        onClick={() => {
                          setSummaryFilterStatus("");
                          setPage(1);
                        }}
                      >
                        <span className="wb-summary-status-label">Все</span>
                        <strong className="wb-summary-status-value">Сбросить</strong>
                        <span className="wb-summary-status-meta">фильтр</span>
                      </button>
                      {summaryHeader.inboundByPostbStatus.map((row) => {
                        const label = row.status.trim() ? row.status : "Без статуса (PostB)";
                        const key = row.status.trim() ? row.status : "__empty__";
                        const filterValue = row.status.trim() ? row.status.trim() : WB_SUMMARY_FILTER_POSTB_EMPTY;
                        const isActive = summaryFilterStatus === filterValue;
                        return (
                          <button
                            type="button"
                            key={key}
                            className={`wb-summary-status-item wb-summary-status-item--filter${isActive ? " wb-summary-status-item--active" : ""}`}
                            onClick={() => {
                              setSummaryFilterStatus((prev) => (prev === filterValue ? "" : filterValue));
                              setPage(1);
                            }}
                          >
                            <span className="wb-summary-status-label">{label}</span>
                            <strong className="wb-summary-status-value">
                              {Number(row.totalInboundRub).toLocaleString("ru-RU", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}{" "}
                              ₽
                            </strong>
                            <span className="wb-summary-status-meta">({row.rowCount} м.)</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {canUpload && activeTab === "claims" && (
          <Typography.Body style={{ color: "var(--color-text-secondary)", marginTop: "0.5rem", fontSize: "0.875rem" }}>
            Импорт: в базу попадают только строки со статусом «Подтверждено», если в файле есть колонка «Статус». Остальные строки пропускаются.
          </Typography.Body>
        )}

        {uploadError && (
          <Flex align="center" gap="0.5rem" style={{ marginTop: "0.5rem", flexWrap: "wrap" }}>
            <Typography.Body style={{ color: "var(--color-error)", margin: 0 }}>{uploadError}</Typography.Body>
            {wbAppDebug ? (
              <button
                type="button"
                className="wb-postb-app-badge"
                onClick={() => setWbAppDebugOpen(true)}
                title="Показать отладку последнего запроса АПП"
              >
                Отладка АПП
              </button>
            ) : null}
          </Flex>
        )}
        {error && <Typography.Body style={{ color: "var(--color-error)", marginTop: "0.5rem" }}>{error}</Typography.Body>}

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
                        : activeTab === "summary" && summarySort.by === col.key
                          ? summarySort.dir === "asc"
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
                    ) : activeTab === "summary" && WB_SUMMARY_SORT_KEYS.has(col.key) ? (
                      <button type="button" className="wb-sort-th" onClick={() => onSummarySortClick(col.key)}>
                        <span>{col.label}</span>
                        {summarySort.by === col.key ? (
                          <span className="wb-sort-indicator" aria-hidden>
                            {summarySort.dir === "asc" ? " ▲" : " ▼"}
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
              {(activeTab === "summary" ? summaryViewItems.length === 0 : items.length === 0) ? (
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
                        ? "Нет данных. Нужна активная ревизия претензий (ШК в файле), «Описи» для сопоставления по ШК и при необходимости «Возвращенный груз». Нажмите «Обновить» — пересчёт сводной."
                        : "Нет данных"}
                  </td>
                </tr>
              ) : activeTab === "inbound" ? (
                items.map((row, idx) => {
                  const inv = String(row.inventoryNumber ?? idx);
                  const open = expandedInboundInv === inv;
                  const inboundDetailKey = inboundDetailCacheKey(inv, filters);
                  const detailRowsRaw = inboundDetailsCache[inboundDetailKey] ?? [];
                  const needle = inboundDetailNeedle;
                  const invHighlight = WB_INBOUND_HIGHLIGHT_INVENTORY_NUMBERS.has(normalizeWbInventoryNumberKey(row.inventoryNumber));
                  return (
                    <React.Fragment key={`inbound-${inv}-${idx}`}>
                      <tr
                        className={`wb-inbound-summary-row ${open ? "wb-inbound-summary-row--open" : ""}${
                          inboundSummaryFilterHit ? " wb-inbound-summary-row--filter-hit" : ""
                        }${invHighlight ? " wb-inbound-summary-row--inv-highlight" : ""}`}
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
                            {inboundDetailLoading === inboundDetailKey && detailRowsRaw.length === 0 ? (
                              <Typography.Body style={{ color: "var(--color-text-secondary)", padding: "0.5rem" }}>Загрузка строк...</Typography.Body>
                            ) : detailRowsRaw.length === 0 ? (
                              <Typography.Body style={{ color: "var(--color-text-secondary)", padding: "0.5rem" }}>Нет строк по этой ведомости</Typography.Body>
                            ) : (
                              <div className="wb-inbound-detail-wrap">
                                {needle ||
                                filters.boxId.trim() ||
                                filters.inventoryNumber.trim() ? (
                                  <Typography.Body
                                    style={{
                                      color: "var(--color-text-secondary)",
                                      padding: "0 0 0.5rem",
                                      fontSize: "0.875rem",
                                    }}
                                  >
                                    {needle
                                      ? "Строки с учётом фильтров над таблицей; подсвечены совпадения с полем «Номер короба» / «Поиск»."
                                      : "Строки с учётом фильтров над таблицей (номер описи, короб, даты, поиск)."}
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
                  const returnedDetailKey = returnedDetailCacheKey(g, {
                    dateFrom: filters.dateFrom,
                    dateTo: filters.dateTo,
                    boxId: filters.boxId,
                    q: filters.q,
                  });
                  const open =
                    expandedReturnedGroup !== null &&
                    returnedGroupCacheKey(expandedReturnedGroup) === cacheKey;
                  const detailRowsRaw = returnedDetailsCache[returnedDetailKey] ?? [];
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
                            {returnedDetailLoading === returnedDetailKey && detailRowsRaw.length === 0 ? (
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
                                  {filters.boxId.trim() || filters.q.trim() || filters.dateFrom || filters.dateTo
                                    ? "Строки группы с учётом фильтров (даты, короб, поиск). Сопоставление с «Описью» по коробу, ШК, баркоду или стикеру."
                                    : "Строка ищется в «Описи» по номеру короба, ШК, баркоду или стикеру."}
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
                                      <tr key={`${returnedDetailKey}-d-${dIdx}`}>
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
                  const claimsDetailKey = claimsDetailCacheKey(revisionId, {
                    dateFrom: filters.dateFrom,
                    dateTo: filters.dateTo,
                    boxId: filters.boxId,
                    q: filters.q,
                  });
                  const detailRowsRaw = claimsDetailsCache[claimsDetailKey] ?? [];
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
                            {claimsDetailLoading === claimsDetailKey && detailRowsRaw.length === 0 ? (
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
                                      <th>ШК</th>
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
                                        <tr key={`${claimsDetailKey}-d-${dIdx}`}>
                                          <td>{dIdx + 1}</td>
                                          <td>{claimsDetailRowShk(rec, all) || "—"}</td>
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
                summaryViewItems.map((row, idx) => {
                  const rec = row as Record<string, unknown>;
                  const lineNo = (page - 1) * limit + idx + 1;
                  const appKey = `s-${page}-${idx}`;
                  return (
                    <tr key={`${activeTab}-${idx}`}>
                      {columns.map((col) => (
                        <td key={col.key}>
                          {col.key === "lineNumber" ? (
                            String(lineNo)
                          ) : col.key === "lvLogisticsStatus" ? (
                            (() => {
                              const t = String(rec.lvLogisticsStatus ?? "").trim();
                              if (!t) return "—";
                              const low = t.toLowerCase();
                              let cls = "wb-log-badge wb-log-badge--muted";
                              if (low.includes("доставлен")) cls = "wb-log-badge wb-log-badge--ok";
                              else if (low.includes("отправлен") || low.includes("улетел")) cls = "wb-log-badge wb-log-badge--warn";
                              return <span className={cls}>{t}</span>;
                            })()
                          ) : col.key === "lvPerevozkaNasha" ? (
                            <WbSummaryPerevozkaHaulzCell rec={rec} authHeaders={authHeaders} />
                          ) : col.key === "status1c" ? (
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "flex-start",
                                gap: "0.35rem",
                              }}
                            >
                              <WbSummaryStatus1cCell
                                rec={rec}
                                authHeaders={authHeaders}
                                appKey={appKey}
                                wbAppDownloadingKey={wbAppDownloadingKey}
                                onOpenTimeline={setPerevozkaModal}
                                onDownloadApp={(num, key) => void handleDownloadWbApp(num, key)}
                              />
                            </div>
                          ) : (
                            formatWbSummaryCell(col.key, rec)
                          )}
                        </td>
                      ))}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <Flex align="center" justify="space-between" style={{ marginTop: "0.75rem" }}>
          <Typography.Body style={{ color: "var(--color-text-secondary)" }}>
            {`Страница ${page} из ${totalPages} • записей: ${
              activeTab === "summary" && summaryGroupByPerevozka ? summaryViewItems.length : total
            }`}
            {returnedPageAmountSum !== null
              ? ` • Сумма на странице: ${returnedPageAmountSum.toLocaleString("ru-RU", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })} ₽`
              : ""}
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
              {activeTab === "summary" ? <option value={1000}>1000</option> : null}
            </select>
          </Flex>
        </Flex>

        <WbPerevozkaTimelineModal
          open={perevozkaModal !== null}
          number={perevozkaModal?.number ?? ""}
          initialStepsFromPosilka={perevozkaModal?.stepsFromPosilka}
          authHeaders={authHeaders}
          onClose={() => setPerevozkaModal(null)}
        />
        <WbAppDebugModal
          open={wbAppDebugOpen}
          payload={wbAppDebug}
          onClose={() => setWbAppDebugOpen(false)}
        />
      </Panel>
    </div>
  );
}

export default WildberriesPage;

