/**
 * Загрузка деталей перевозки (Getperevozka): статусы, номенклатура, мета (авто, водитель).
 */
import { cityToCode } from "./formatUtils";
import { formatPerevozkaNumberForApi } from "./perevozkaNumber";
import type { AuthData, CargoItem, PerevozkaTimelineStep } from "../types";
import { PROXY_API_GETPEREVOZKA_URL } from "../constants/config";
import { normalizePerevozkaSteps } from "../../api/lib/postbGetapiNormalize.js";

export type PerevozkaDetailsResult = {
    steps: PerevozkaTimelineStep[] | null;
    nomenclature: Record<string, unknown>[];
    meta: { autoReg: string; autoType: string; driver: string };
};
type PerevozkaDetailsOptions = {
    /** Принудительно ходить через сервисный аккаунт Vercel (без user-ветки) */
    forceServiceAuth?: boolean;
};

const STEPS_KEYS = ['items', 'Items', 'Steps', 'stages', 'Statuses', 'statuses', 'Статусы', 'статусы', 'History', 'history'];
const NOMENCLATURE_KEYS = ['Packages', 'Nomenclature', 'Goods', 'CargoNomenclature', 'ПринятыйГруз', 'Номенклатура', 'TablePart', 'CargoItems', 'Items', 'GoodsList', 'Nomenklatura'];
const GETPEREVOZKA_CLIENT_TIMEOUT_MS = 58_000;

const TIMELINE_NEST_KEYS = ['Response', 'Data', 'Result', 'result', 'data'];

function normalizeStageKey(s: string): string {
    return s.replace(/\s+/g, '').toLowerCase();
}

export function mapTimelineStageLabel(raw: string, item: CargoItem): string {
    const key = normalizeStageKey(raw);
    const from = cityToCode(item.CitySender) || '—';
    const to = cityToCode(item.CityReceiver) || '—';
    if (/полученаинформация|получена\s*информация/.test(key)) return 'Получена информация';
    if (/полученаотзаказчика|получена\s*от\s*заказчика/.test(key)) return `Получена в ${from}`;
    if (/полученанаскладе|получена\s*на\s*складе/.test(key)) return `Получена в ${from}`;
    if (/упакована/.test(key)) return 'Измерена';
    if (/консолидация/.test(key)) return 'Консолидация';
    if (/отправленаваэропорт|отправлена\s*в\s*аэропорт|загружена/.test(key)) return 'Загружена в ТС';
    if (/улетела/.test(key)) return 'Отправлена';
    if (/квручению|к\s*вручению/.test(key)) return `Прибыла в ${to}`;
    if (/поставленанадоставку|поставлена\s*на\s*доставку|в\s*месте\s*прибытия/.test(key)) return 'Запланирована доставка';
    if (/доставлена/.test(key)) return 'Доставлена';
    return raw;
}

export function getTimelineStepColor(label: string): 'success' | 'warning' | 'danger' | 'purple' | 'default' {
    const lower = (label || '').toLowerCase();
    if (lower.includes('доставлен') || lower.includes('заверш')) return 'success';
    if (lower.includes('доставке')) return 'purple';
    if (lower.includes('пути') || lower.includes('отправлен') || lower.includes('готов')) return 'warning';
    if (lower.includes('отменен') || lower.includes('аннулирован')) return 'danger';
    return 'default';
}

export function extractNomenclatureFromPerevozka(data: any): Record<string, unknown>[] {
    const tryExtract = (obj: any): Record<string, unknown>[] => {
        if (!obj || typeof obj !== 'object') return [];
        for (const key of NOMENCLATURE_KEYS) {
            const val = obj[key];
            if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object' && val[0] !== null) {
                return val as Record<string, unknown>[];
            }
        }
        for (const key of Object.keys(obj)) {
            if (STEPS_KEYS.includes(key)) continue;
            const val = obj[key];
            if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object' && val[0] !== null && !Array.isArray(val[0])) {
                return val as Record<string, unknown>[];
            }
        }
        return [];
    };
    const fromRoot = tryExtract(data);
    if (fromRoot.length > 0) return fromRoot;
    for (const nest of ['Response', 'Data', 'Result', 'result', 'data']) {
        const fromNest = tryExtract(data?.[nest]);
        if (fromNest.length > 0) return fromNest;
    }
    return [];
}

function nomenclatureSkuText(skuRaw: unknown): string {
    if (Array.isArray(skuRaw)) {
        return skuRaw
            .map((it: unknown) => {
                if (it == null) return "";
                if (typeof it === "string") return it;
                if (typeof it === "object") {
                    const o = it as Record<string, unknown>;
                    return String(o.SKU ?? o.sku ?? o.Name ?? o.Номенклатура ?? "");
                }
                return String(it);
            })
            .map((s) => s.trim())
            .filter(Boolean)
            .join(" ");
    }
    if (skuRaw && typeof skuRaw === "object") {
        const o = skuRaw as Record<string, unknown>;
        return String(o.SKU ?? o.sku ?? o.Name ?? o.Номенклатура ?? "").trim();
    }
    return String(skuRaw ?? "").trim();
}

/** Текст для поиска по штрихкоду и номенклатуре принятого груза. */
export function buildNomenclatureSearchText(rows: Record<string, unknown>[]): string {
    const parts: string[] = [];
    for (const row of rows) {
        const barcode = String(
            row.Package ??
                row.package ??
                row.Barcode ??
                row.barcode ??
                row.Штрихкод ??
                row.НомерМеста ??
                row.PlaceNumber ??
                "",
        ).trim();
        if (barcode) parts.push(barcode);
        const skuRaw =
            row.SKUs ??
            row.skus ??
            row.SKU ??
            row.sku ??
            row.Nomenclature ??
            row.Номенклатура ??
            row.Goods ??
            row.Товар ??
            row.Name ??
            row.Наименование;
        const name = nomenclatureSkuText(skuRaw);
        if (name) parts.push(name);
    }
    return parts.join(" ");
}

export function buildNomenclatureSearchTextFromCargoItem(item: CargoItem | Record<string, unknown>): string {
    const rows = extractNomenclatureFromPerevozka(item);
    return rows.length > 0 ? buildNomenclatureSearchText(rows) : "";
}

function mapRawElementsToSteps(raw: unknown[], item: CargoItem): PerevozkaTimelineStep[] {
    return raw.map((el: any) => {
        const rawLabel = el?.Stage ?? el?.Name ?? el?.Status ?? el?.label ?? el?.title ?? String(el);
        const labelStr = typeof rawLabel === "string" ? rawLabel : String(rawLabel);
        const date = el?.Date ?? el?.date ?? el?.DatePrih ?? el?.DateVr;
        const displayLabel = mapTimelineStageLabel(labelStr, item);
        return { label: displayLabel, date, completed: true };
    });
}

function sortTimelineSteps(steps: PerevozkaTimelineStep[], item: CargoItem): PerevozkaTimelineStep[] {
    const fromCity = cityToCode(item.CitySender) || "—";
    const toCity = cityToCode(item.CityReceiver) || "—";
    const senderLabel = `Получена в ${fromCity}`;
    const arrivedAtDestLabel = `Прибыла в ${toCity}`;
    const orderOf = (l: string, i: number): number => {
        if (l === "Получена информация") return 1;
        if (l === senderLabel) return 2;
        if (l === "Измерена") return 3;
        if (l === "Консолидация") return 4;
        if (l === "Загружена в ТС") return 5;
        if (l === "Отправлена") return 6;
        if (l === arrivedAtDestLabel) return 7;
        if (l === "Запланирована доставка") return 8;
        if (l === "Доставлена") return 9;
        return 10 + i;
    };
    return steps
        .map((s, i) => ({ s, key: orderOf(s.label, i) }))
        .sort((a, b) => a.key - b.key)
        .map((x) => x.s);
}

function stepsFromNormalized(data: unknown, item: CargoItem): PerevozkaTimelineStep[] {
    return normalizePerevozkaSteps(data).map((s) => ({
        label: mapTimelineStageLabel(s.title, item),
        date: s.date || undefined,
        completed: true,
    }));
}

function extractRawTimelineArray(data: unknown): unknown[] {
    if (Array.isArray(data)) return data;
    if (!data || typeof data !== 'object') return [];
    const record = data as Record<string, unknown>;
    for (const key of STEPS_KEYS) {
        const val = record[key];
        if (Array.isArray(val) && val.length > 0) return val;
    }
    for (const nest of TIMELINE_NEST_KEYS) {
        const nested = record[nest];
        if (!nested || typeof nested !== 'object' || Array.isArray(nested)) continue;
        for (const key of STEPS_KEYS) {
            const val = (nested as Record<string, unknown>)[key];
            if (Array.isArray(val) && val.length > 0) return val;
        }
    }
    return [];
}

function isMeaningfulStepLabel(label: string): boolean {
    const t = String(label ?? "").trim();
    return t !== "" && t !== "—" && t !== "-";
}

function resolveTimelineSteps(data: unknown, item: CargoItem): PerevozkaTimelineStep[] {
    const raw = extractRawTimelineArray(data);
    let sorted = sortTimelineSteps(
        raw.length > 0 ? mapRawElementsToSteps(raw, item) : [],
        item,
    );
    if (sorted.length === 0) {
        const normalized = stepsFromNormalized(data, item).filter((s) => isMeaningfulStepLabel(s.label));
        if (normalized.length > 1) sorted = sortTimelineSteps(normalized, item);
    }
    return sorted.filter((s) => isMeaningfulStepLabel(s.label));
}

async function fetchPerevozkaDetailsOnce(
    auth: AuthData,
    number: string,
    item: CargoItem,
    options?: PerevozkaDetailsOptions,
): Promise<PerevozkaDetailsResult> {
    const forceServiceAuth = options?.forceServiceAuth === true;
    const apiNumber = formatPerevozkaNumberForApi(number);
    const requestInn = String(item?.INN ?? item?.Inn ?? item?.inn ?? auth?.inn ?? "").trim();
    const payload = forceServiceAuth
        ? { number: apiNumber, ...(requestInn ? { inn: requestInn } : {}) }
        : {
            login: auth.login,
            password: auth.password,
            number: apiNumber,
            ...(requestInn ? { inn: requestInn } : {}),
            ...(auth.isRegisteredUser ? { isRegisteredUser: true } : {}),
        };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GETPEREVOZKA_CLIENT_TIMEOUT_MS);
    let res: Response;
    try {
        res = await fetch(PROXY_API_GETPEREVOZKA_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: controller.signal,
        });
    } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') {
            throw new Error('Превышено время ожидания статусов перевозки');
        }
        throw e;
    } finally {
        clearTimeout(timer);
    }
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any)?.error || (err as any)?.details || `Ошибка ${res.status}`);
    }
    const data = await res.json();
    const sorted = resolveTimelineSteps(data, item);
    const nomenclature = extractNomenclatureFromPerevozka(data);
    const tryReadField = (fieldNames: string[]): string => {
        const candidates: any[] = [
            data,
            data?.Response,
            data?.Data,
            data?.Result,
            data?.result,
            data?.data,
            Array.isArray(data?.items) ? data.items[0] : null,
        ];
        for (const candidate of candidates) {
            if (!candidate || typeof candidate !== 'object') continue;
            for (const field of fieldNames) {
                const rawVal = (candidate as any)[field];
                const value = String(rawVal ?? '').trim();
                if (value) return value;
            }
        }
        return '';
    };
    const meta = {
        autoReg: tryReadField(['AutoReg', 'autoReg', 'AutoREG']),
        autoType: tryReadField(['AutoType', 'autoType', 'TypeOfTranzit', 'TypeOfTransit']),
        driver: tryReadField(['Driver', 'driver', 'DriverFio', 'DriverName']),
    };
    return { steps: sorted.length ? sorted : null, nomenclature, meta };
}

export async function fetchPerevozkaDetails(
    auth: AuthData,
    number: string,
    item: CargoItem,
    options?: PerevozkaDetailsOptions,
): Promise<PerevozkaDetailsResult> {
    const first = await fetchPerevozkaDetailsOnce(auth, number, item, options);
    const firstCount = first.steps?.length ?? 0;
    if (firstCount > 1 || options?.forceServiceAuth) return first;

    const retry = await fetchPerevozkaDetailsOnce(auth, number, item, {
        ...options,
        forceServiceAuth: true,
    });
    if ((retry.steps?.length ?? 0) > firstCount) return retry;
    return first;
}

export async function fetchPerevozkaTimeline(
    auth: AuthData,
    number: string,
    item: CargoItem,
    options?: PerevozkaDetailsOptions
): Promise<PerevozkaTimelineStep[] | null> {
    const { steps } = await fetchPerevozkaDetails(auth, number, item, options);
    return steps;
}
