import { useMemo } from "react";
import * as dateUtils from "../../../lib/dateUtils";
import { normalizeInvoiceStatus, stripOoo, cityToCode } from "../../../lib/formatUtils";
import { normalizeStatus } from "../../../lib/statusUtils";
import { getFirstCargoNumberFromInvoice, buildCargoStateByNumber } from "../../../features/documents/lib/documentsPipeline";
import type { CargoItem } from "../../../types";

const { getFirstPaymentWeekdayOnOrAfter, getFirstWorkingDayOnOrAfter } = dateUtils;

export type AgingInvoice = {
    number: string;
    customer: string;
    date: string;
    sum: number;
    days: number;
    status: string;
    shipmentStatus: string;
    route: string;
};

export type UseDashboardInvoiceDataParams = {
    calendarInvoiceItems: unknown[] | null | undefined;
    paymentCalendarByInn: Record<string, { days_to_pay: number; payment_weekdays: number[] }>;
    apiDateRange: { dateFrom: string; dateTo: string };
    authInn?: string;
    items: CargoItem[];
    useServiceRequest: boolean;
};

export function useDashboardInvoiceData({
    calendarInvoiceItems,
    paymentCalendarByInn,
    apiDateRange,
    authInn,
    items,
    useServiceRequest,
    }: UseDashboardInvoiceDataParams) {
    /** Плановое поступление по счетам: срок в календарных днях; при наступлении срока — первый платёжный день недели (если заданы) или первый рабочий день. */
    const plannedByDate = useMemo(() => {
    const map = new Map<string, { total: number; items: { customer: string; sum: number; number?: string }[] }>();
    const invDate = (inv: any): string => {
        const raw = String(inv?.DateDoc ?? inv?.Date ?? inv?.date ?? inv?.dateDoc ?? inv?.Дата ?? '').trim();
        if (!raw) return '';
        const parsed = dateUtils.parseDateOnly(raw);
        if (!parsed) return '';
        const y = parsed.getFullYear();
        const m = String(parsed.getMonth() + 1).padStart(2, '0');
        const d = String(parsed.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    };
    const invSum = (inv: any) => {
        const v = inv?.SumDoc ?? inv?.Sum ?? inv?.sum ?? inv?.Сумма ?? inv?.Amount ?? 0;
        return typeof v === 'string' ? parseFloat(v) || 0 : Number(v) || 0;
    };
    const invInn = (inv: any) =>
        String(
            inv?.INN ??
            inv?.Inn ??
            inv?.inn ??
            inv?.CustomerINN ??
            inv?.CustomerInn ??
            inv?.INNCustomer ??
            inv?.InnCustomer ??
            inv?.КонтрагентИНН ??
            ''
        )
            .replace(/\D/g, '')
            .trim();
    const invCustomer = (inv: any) => String(inv?.Customer ?? inv?.customer ?? inv?.Контрагент ?? inv?.Contractor ?? inv?.Organization ?? '').trim() || '—';
    const invNumber = (inv: any) => (inv?.Number ?? inv?.number ?? inv?.Номер ?? inv?.N ?? '').toString();
    const invStatus = (inv: any) => normalizeInvoiceStatus(inv?.Status ?? inv?.State ?? inv?.state ?? inv?.Статус ?? inv?.status ?? inv?.PaymentStatus ?? '');
    (calendarInvoiceItems ?? []).forEach((inv: any) => {
        const dateStr = invDate(inv);
        if (!dateStr) return;
        // Календарь строим по счетам, выставленным в выбранном периоде (Date filter).
        if (dateStr < apiDateRange.dateFrom || dateStr > apiDateRange.dateTo) return;
        // Учитываем только не оплаченные/частично оплаченные счета.
        const status = invStatus(inv);
        if (status === 'Оплачен') return;
        const sum = invSum(inv);
        if (sum <= 0) return;
        const inn = invInn(inv) || String(authInn ?? '').replace(/\D/g, '').trim();
        const cal = paymentCalendarByInn[inn] ?? { days_to_pay: 0, payment_weekdays: [] };
        const days = cal.days_to_pay ?? 0;
        const weekdays = cal.payment_weekdays ?? [];
        const parsedDate = dateUtils.parseDateOnly(dateStr);
        if (!parsedDate) return;
        const d = new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate());
        d.setDate(d.getDate() + days);
        const deadline = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const key = weekdays.length > 0 ? getFirstPaymentWeekdayOnOrAfter(deadline, weekdays) : getFirstWorkingDayOnOrAfter(deadline);
        const customer = invCustomer(inv);
        const entry = map.get(key);
        if (!entry) {
            map.set(key, { total: sum, items: [{ customer, sum, number: invNumber(inv) }] });
        } else {
            entry.total += sum;
            entry.items.push({ customer, sum, number: invNumber(inv) });
        }
    });
    return map;
    }, [calendarInvoiceItems, paymentCalendarByInn, apiDateRange.dateFrom, apiDateRange.dateTo, authInn]);
    
    
        const invoiceAging = useMemo(() => {
    if (!useServiceRequest) return { buckets: [] as { label: string; count: number; sum: number; color: string; items: AgingInvoice[] }[], total: 0 };
    const cargoStateByNumber = buildCargoStateByNumber(items);
    const now = new Date();
    const buckets = [
        { label: 'до 7 дн.', min: 0, max: 7, count: 0, sum: 0, color: '#10b981', items: [] as AgingInvoice[] },
        { label: '7–14 дн.', min: 7, max: 14, count: 0, sum: 0, color: '#f59e0b', items: [] as AgingInvoice[] },
        { label: '14–30 дн.', min: 14, max: 30, count: 0, sum: 0, color: '#f97316', items: [] as AgingInvoice[] },
        { label: '30+ дн.', min: 30, max: Infinity, count: 0, sum: 0, color: '#ef4444', items: [] as AgingInvoice[] },
    ];
    let total = 0;
    (calendarInvoiceItems ?? []).forEach((inv: any) => {
        const status = normalizeInvoiceStatus(inv?.Status ?? inv?.State ?? inv?.state ?? inv?.Статус ?? inv?.status ?? inv?.PaymentStatus ?? '');
        if (status === 'Оплачен') return;
        const rawDate = String(inv?.DateDoc ?? inv?.Date ?? inv?.date ?? inv?.dateDoc ?? inv?.Дата ?? '').trim();
        const parsed = dateUtils.parseDateOnly(rawDate);
        if (!parsed) return;
        const days = Math.max(0, Math.round((now.getTime() - parsed.getTime()) / (24 * 60 * 60 * 1000)));
        const sum = typeof inv?.SumDoc === 'string' ? parseFloat(inv.SumDoc) || 0 : Number(inv?.SumDoc ?? inv?.Sum ?? inv?.sum ?? inv?.Сумма ?? 0) || 0;
        if (sum <= 0) return;
        const invNum = String(inv?.Number ?? inv?.number ?? inv?.Номер ?? inv?.N ?? '').trim() || '—';
        const customer = String(inv?.Customer ?? inv?.customer ?? inv?.Контрагент ?? inv?.Contractor ?? '').trim() || '—';
        const dateStr = dateUtils.formatDate(rawDate);
        const dirRaw = String(inv?.Direction ?? inv?.direction ?? inv?.Направление ?? '').trim().toUpperCase();
        const senderCode = cityToCode(inv?.CitySender ?? inv?.citySender ?? inv?.ГородОтправителя ?? inv?.city_from ?? '');
        const receiverCode = cityToCode(inv?.CityReceiver ?? inv?.cityReceiver ?? inv?.ГородПолучателя ?? inv?.city_to ?? '');
        const route = dirRaw.includes('MSK_TO_KGD') || dirRaw.includes('MSK-KGD')
            ? 'MSK-KGD'
            : dirRaw.includes('KGD_TO_MSK') || dirRaw.includes('KGD-MSK')
                ? 'KGD-MSK'
                : (senderCode && receiverCode ? `${senderCode}-${receiverCode}` : '—');
        const cargoNum = getFirstCargoNumberFromInvoice(inv);
        const rawShipmentState = cargoNum ? cargoStateByNumber.get(cargoNum) ?? cargoStateByNumber.get(cargoNum.replace(/^0+/, '') ?? '') : undefined;
        const shipmentStatus = rawShipmentState ? normalizeStatus(rawShipmentState) : '—';
        for (const b of buckets) {
            if (days >= b.min && days < b.max) {
                b.count += 1;
                b.sum += sum;
                total += sum;
                b.items.push({ number: invNum, customer: stripOoo(customer), date: dateStr, sum, days, status, shipmentStatus, route });
                break;
            }
        }
    });
    buckets.forEach((b) => b.items.sort((a, b2) => b2.sum - a.sum));
    return { buckets, total };
    }, [calendarInvoiceItems, items, useServiceRequest]);
    
    
    return { plannedByDate, invoiceAging };
}

export type DashboardInvoiceDataState = ReturnType<typeof useDashboardInvoiceData>;
