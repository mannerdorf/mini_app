/**
 * Загрузка деталей перевозки (Getperevozka): статусы, номенклатура, мета (авто, водитель).
 */
import { cityToCode } from "./formatUtils";
import type { AuthData, CargoItem, PerevozkaTimelineStep } from "../types";
import { PROXY_API_GETPEREVOZKA_URL } from "../constants/config";

export type PerevozkaDetailsResult = {
    steps: PerevozkaTimelineStep[] | null;
    nomenclature: Record<string, unknown>[];
    meta: { autoReg: string; autoType: string; driver: string };
};

const STEPS_KEYS = ['items', 'Steps', 'stages', 'Statuses'];
const NOMENCLATURE_KEYS = ['Packages', 'Nomenclature', 'Goods', 'CargoNomenclature', 'ПринятыйГруз', 'Номенклатура', 'TablePart', 'CargoItems', 'Items', 'GoodsList', 'Nomenklatura'];

function normalizeStageKey(s: string): string {
    return s.replace(/\s+/g, '').toLowerCase();
}

export function mapTimelineStageLabel(raw: string, item: CargoItem): string {
    const key = normalizeStageKey(raw);
    const from = cityToCode(item.CitySender) || '—';
    const to = cityToCode(item.CityReceiver) || '—';
    if (/полученаинформация|получена\s*информация/.test(key)) return 'Получена информация';
    if (/полученаотзаказчика|получена\s*от\s*заказчика/.test(key)) return `Получена в ${from}`;
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

function extractNomenclatureFromPerevozka(data: any): Record<string, unknown>[] {
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

export async function fetchPerevozkaDetails(auth: AuthData, number: string, item: CargoItem): Promise<PerevozkaDetailsResult> {
    const res = await fetch(PROXY_API_GETPEREVOZKA_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            login: auth.login,
            password: auth.password,
            number,
            ...(auth.inn ? { inn: auth.inn } : {}),
            ...(auth.isRegisteredUser ? { isRegisteredUser: true } : {}),
        }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any)?.error || (err as any)?.details || `Ошибка ${res.status}`);
    }
    const data = await res.json();
    const raw = Array.isArray(data) ? data : (data?.items ?? data?.Steps ?? data?.stages ?? data?.Statuses ?? []);
    const steps: PerevozkaTimelineStep[] = Array.isArray(raw)
        ? raw.map((el: any) => {
            const rawLabel = el?.Stage ?? el?.Name ?? el?.Status ?? el?.label ?? String(el);
            const labelStr = typeof rawLabel === 'string' ? rawLabel : String(rawLabel);
            const date = el?.Date ?? el?.date ?? el?.DatePrih ?? el?.DateVr;
            const displayLabel = mapTimelineStageLabel(labelStr, item);
            return { label: displayLabel, date, completed: true };
        })
        : [];
    const fromCity = cityToCode(item.CitySender) || '—';
    const toCity = cityToCode(item.CityReceiver) || '—';
    const senderLabel = `Получена в ${fromCity}`;
    const arrivedAtDestLabel = `Прибыла в ${toCity}`;
    const orderOf = (l: string, i: number): number => {
        if (l === 'Получена информация') return 1;
        if (l === senderLabel) return 2;
        if (l === 'Измерена') return 3;
        if (l === 'Консолидация') return 4;
        if (l === 'Загружена в ТС') return 5;
        if (l === 'Отправлена') return 6;
        if (l === arrivedAtDestLabel) return 7;
        if (l === 'Запланирована доставка') return 8;
        if (l === 'Доставлена') return 9;
        return 10 + i;
    };
    const sorted = steps.map((s, i) => ({ s, key: orderOf(s.label, i) }))
        .sort((a, b) => a.key - b.key)
        .map((x) => x.s);
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

export async function fetchPerevozkaTimeline(auth: AuthData, number: string, item: CargoItem): Promise<PerevozkaTimelineStep[] | null> {
    const { steps } = await fetchPerevozkaDetails(auth, number, item);
    return steps;
}
