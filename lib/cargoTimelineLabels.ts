import { cityToCode } from './cityToCode.js';
import type { CargoItem } from '../src/types.js';

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
