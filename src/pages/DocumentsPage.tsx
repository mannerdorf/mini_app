import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { Button, Flex, Panel, Typography } from "@maxhub/max-ui";
import { Calendar, ChevronDown, ArrowUp, ArrowDown, Share2, Heart, Ship, Loader2, Truck, Flag, ClipboardList, RotateCcw, Download } from "lucide-react";
import { TapSwitch } from "../components/TapSwitch";
import { FilterDropdownPortal } from "../components/ui/FilterDropdownPortal";
import { CustomPeriodModal } from "../components/modals/CustomPeriodModal";
import { InvoiceDetailModal } from "../components/modals/InvoiceDetailModal";
import { ActDetailModal } from "../components/modals/ActDetailModal";
import { DateText } from "../components/ui/DateText";
import { formatCurrency, stripOoo, formatInvoiceNumber, normalizeInvoiceStatus, cityToCode } from "../lib/formatUtils";
import { normalizeStatus, STATUS_MAP, getFilterKeyByStatus } from "../lib/statusUtils";
import { StatusBadge } from "../components/shared/StatusBadges";
import {
    loadDateFilterState,
    saveDateFilterState,
    getWeekRange,
    getYearsList,
    getWeeksList,
    MONTH_NAMES,
    DEFAULT_DATE_FROM,
    DEFAULT_DATE_TO,
    getPayTillDate,
getPayTillDateColor,
} from "../lib/dateUtils";
import type { AccountPermissions, AuthData, DateFilter, StatusFilter } from "../types";
import { useDocumentsDateRange } from "./useDocumentsDateRange";
import { useDocumentsDataLoad } from "./useDocumentsDataLoad";
import { useAppRuntime } from "../contexts/AppRuntimeContext";
import { fetchPerevozkaDetails } from "../lib/perevozkaDetails";
import {
    INVOICE_FAVORITES_VALUE,
    buildActsSummary,
    buildCargoRouteByNumber,
    buildCargoStateByNumber,
    buildCargoTransportByNumber,
    buildDocsSummary,
    buildFilteredActs,
    buildFilteredInvoices,
    buildFilteredOrders,
    getEdoStatus,
    getFirstCargoNumberFromInvoice,
} from "./documentsPipeline";
import { DocumentsSummaryCard, DocumentsStateBlocks } from "./documentsViewBlocks";

const INVOICE_STATUS_OPTIONS = ['Оплачен', 'Не оплачен', 'Оплачен частично'] as const;

type ClaimStatusKey =
    | 'draft'
    | 'new'
    | 'under_review'
    | 'waiting_docs'
    | 'in_progress'
    | 'awaiting_leader'
    | 'sent_to_accounting'
    | 'approved'
    | 'rejected'
    | 'paid'
    | 'offset'
    | 'closed';

const CLAIM_STATUS_LABELS: Record<ClaimStatusKey, string> = {
    draft: 'Черновик',
    new: 'Новая',
    under_review: 'На рассмотрении',
    waiting_docs: 'Ожидает документы',
    in_progress: 'В работе',
    awaiting_leader: 'Ожидает решения руководителя',
    sent_to_accounting: 'Передана в бухгалтерию',
    approved: 'Удовлетворена',
    rejected: 'Отказ',
    paid: 'Выплачено',
    offset: 'Зачтено',
    closed: 'Закрыта',
};

const CLAIM_STATUS_BADGE: Record<ClaimStatusKey, { bg: string; color: string }> = {
    draft: { bg: 'rgba(107,114,128,0.15)', color: '#6b7280' },
    new: { bg: 'rgba(107,114,128,0.15)', color: '#6b7280' },
    under_review: { bg: 'rgba(245,158,11,0.18)', color: '#b45309' },
    waiting_docs: { bg: 'rgba(245,158,11,0.18)', color: '#b45309' },
    in_progress: { bg: 'rgba(59,130,246,0.15)', color: '#2563eb' },
    awaiting_leader: { bg: 'rgba(59,130,246,0.15)', color: '#2563eb' },
    sent_to_accounting: { bg: 'rgba(59,130,246,0.15)', color: '#2563eb' },
    approved: { bg: 'rgba(16,185,129,0.15)', color: '#059669' },
    paid: { bg: 'rgba(16,185,129,0.15)', color: '#059669' },
    offset: { bg: 'rgba(16,185,129,0.15)', color: '#059669' },
    rejected: { bg: 'rgba(239,68,68,0.15)', color: '#dc2626' },
    closed: { bg: 'rgba(107,114,128,0.15)', color: '#6b7280' },
};

const MAX_CLAIM_FILE_BYTES = 5 * 1024 * 1024;
const MANIPULATION_SIGN_OPTIONS = [
    { id: 'fragile', label: 'Хрупкое' },
    { id: 'keep_dry', label: 'Беречь от влаги' },
    { id: 'this_side_up', label: 'Верх / Не кантовать' },
    { id: 'do_not_stack', label: 'Не штабелировать' },
    { id: 'temperature_control', label: 'Температурный режим' },
    { id: 'handle_with_care', label: 'Осторожно, обращаться бережно' },
] as const;
const PACKAGING_TYPE_OPTIONS = [
    { id: 'box', label: 'Коробка' },
    { id: 'pallet', label: 'Паллет' },
    { id: 'crate', label: 'Ящик' },
    { id: 'bag', label: 'Мешок' },
    { id: 'film', label: 'Стретч-пленка' },
    { id: 'wooden_frame', label: 'Обрешетка' },
    { id: 'without_packaging', label: 'Без упаковки' },
] as const;

const MANIPULATION_SIGN_LABELS_RU: Record<string, string> = Object.fromEntries(MANIPULATION_SIGN_OPTIONS.map((o) => [o.id, o.label]));
const PACKAGING_TYPE_LABELS_RU: Record<string, string> = Object.fromEntries(PACKAGING_TYPE_OPTIONS.map((o) => [o.id, o.label]));

function mapClaimEnumToRu(values: string[], labels: Record<string, string>): string[] {
    return values.map((v) => labels[String(v).trim()] || v);
}
const FILE_PICKER_BUTTON_STYLE: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '10rem',
    height: 44,
    boxSizing: 'border-box',
    padding: '0.42rem 0.8rem',
    borderRadius: 8,
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-card, #fff)',
    cursor: 'pointer',
    fontSize: '0.82rem',
    fontWeight: 500,
};
const CLAIM_ROW_ACTION_BUTTON_STYLE: React.CSSProperties = {
    width: 110,
    height: 36,
    boxSizing: 'border-box',
    marginTop: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 0.7rem',
    whiteSpace: 'nowrap',
};

async function fileToBase64(file: File): Promise<string> {
    const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error(`Не удалось прочитать файл: ${file.name}`));
        reader.readAsDataURL(file);
    });
    const commaIdx = dataUrl.indexOf(',');
    return commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
}

function formatPhoneMask(value: string): string {
    const digitsOnly = String(value || '').replace(/\D/g, '');
    if (!digitsOnly) return '';
    let digits = digitsOnly;
    if (digits.startsWith('8')) digits = `7${digits.slice(1)}`;
    if (!digits.startsWith('7')) digits = `7${digits}`;
    digits = digits.slice(0, 11);
    const p1 = digits.slice(1, 4);
    const p2 = digits.slice(4, 7);
    const p3 = digits.slice(7, 9);
    const p4 = digits.slice(9, 11);
    let out = '+7';
    if (p1) out += ` (${p1}`;
    if (p1.length === 3) out += ')';
    if (p2) out += ` ${p2}`;
    if (p3) out += `-${p3}`;
    if (p4) out += `-${p4}`;
    return out;
}

function normalizeAcceptedCargoNomenclatureRows(rows: Record<string, unknown>[]): Array<{ key: string; barcode: string; name: string; declaredCost: string }> {
    const result: Array<{ key: string; barcode: string; name: string; declaredCost: string }> = [];
    const seen = new Set<string>();
    rows.forEach((row, idx) => {
        const barcode = String(
            row?.Package
            ?? (row as any)?.package
            ?? (row as any)?.Barcode
            ?? (row as any)?.barcode
            ?? (row as any)?.Штрихкод
            ?? ''
        ).trim();
        const skuRaw = (row as any)?.SKUs
            ?? (row as any)?.skus
            ?? (row as any)?.SKU
            ?? (row as any)?.Nomenclature
            ?? (row as any)?.Номенклатура
            ?? (row as any)?.Goods
            ?? (row as any)?.Товар
            ?? (row as any)?.Name;
        const name = (() => {
            if (Array.isArray(skuRaw)) {
                const values = skuRaw.map((it: any) => {
                    if (it == null) return '';
                    if (typeof it === 'string') return it;
                    if (typeof it === 'object') return String(it?.SKU ?? it?.sku ?? it?.Name ?? it?.Номенклатура ?? '');
                    return String(it);
                }).map((s) => String(s).trim()).filter(Boolean);
                return values.join('\n');
            }
            if (skuRaw && typeof skuRaw === 'object') {
                return String((skuRaw as any)?.SKU ?? (skuRaw as any)?.sku ?? (skuRaw as any)?.Name ?? (skuRaw as any)?.Номенклатура ?? '').trim();
            }
            return String(skuRaw ?? '').trim();
        })();
        const declaredRaw = (row as any)?.DeclaredCost
            ?? (row as any)?.declaredCost
            ?? (row as any)?.DeclaredValue
            ?? (row as any)?.declaredValue
            ?? (row as any)?.ОбъявленнаяСтоимость
            ?? (row as any)?.ОбъявлСтоимость
            ?? (row as any)?.Объявленная_стоимость
            ?? (row as any)?.InsuredValue
            ?? (row as any)?.Стоимость;
        const declaredCost = (() => {
            const value = String(declaredRaw ?? '').trim();
            if (!value) return '';
            const normalized = value.replace(/\s/g, '').replace(',', '.');
            const asNumber = Number(normalized);
            if (Number.isFinite(asNumber)) {
                return `${asNumber.toLocaleString('ru-RU')} ₽`;
            }
            return value;
        })();
        if (!barcode && !name) return;
        const dedupeKey = `${barcode}::${name}::${declaredCost}`;
        if (seen.has(dedupeKey)) return;
        seen.add(dedupeKey);
        result.push({
            key: `${barcode || 'row'}:${idx}`,
            barcode,
            name: name || '—',
            declaredCost: declaredCost || '—',
        });
    });
    return result;
}

function extractCustomerClaimPayloadFromEvents(events: any[]): {
    contactName: string;
    selectedPlaces: string[];
    manipulationSigns: string[];
    packagingTypes: string[];
} {
    if (!Array.isArray(events) || events.length === 0) {
        return { contactName: '', selectedPlaces: [], manipulationSigns: [], packagingTypes: [] };
    }
    for (let i = events.length - 1; i >= 0; i -= 1) {
        const event = events[i];
        const eventType = String(event?.eventType || '').trim().toLowerCase();
        if (eventType !== 'claim_draft_saved' && eventType !== 'claim_created') continue;
        const rawPayload = event?.payload;
        const payload = typeof rawPayload === 'string'
            ? (() => {
                try {
                    return JSON.parse(rawPayload);
                } catch {
                    return {};
                }
            })()
            : (rawPayload && typeof rawPayload === 'object' ? rawPayload : {});
        const selectedPlaces = Array.isArray((payload as any)?.selectedPlaces)
            ? (payload as any).selectedPlaces.map((v: any) => String(v || '').trim()).filter(Boolean)
            : [];
        const manipulationSigns = Array.isArray((payload as any)?.manipulationSigns)
            ? (payload as any).manipulationSigns.map((v: any) => String(v || '').trim()).filter(Boolean)
            : [];
        const packagingTypes = Array.isArray((payload as any)?.packagingTypes)
            ? (payload as any).packagingTypes.map((v: any) => String(v || '').trim()).filter(Boolean)
            : [];
        return {
            contactName: String((payload as any)?.customerContactName || '').trim(),
            selectedPlaces,
            manipulationSigns,
            packagingTypes,
        };
    }
    return { contactName: '', selectedPlaces: [], manipulationSigns: [], packagingTypes: [] };
}

type DocSectionKey = 'Счета' | 'УПД' | 'Заявки' | 'Отправки' | 'Претензии' | 'Договоры' | 'Акты сверок' | 'Тарифы';
const DOC_SECTIONS: { key: DocSectionKey; label: string }[] = [
    { key: 'Счета', label: 'Счета' },
    { key: 'УПД', label: 'УПД' },
    { key: 'Заявки', label: 'Заявки' },
    { key: 'Отправки', label: 'Отправки' },
    { key: 'Претензии', label: 'Претензии' },
    { key: 'Договоры', label: 'Договоры' },
    { key: 'Акты сверок', label: 'Акты сверок' },
    { key: 'Тарифы', label: 'Тарифы' },
];

const DOC_SECTION_TO_PERMISSION: Record<DocSectionKey, keyof AccountPermissions> = {
    'Счета': 'doc_invoices',
    'УПД': 'doc_acts',
    'Заявки': 'doc_orders',
    'Отправки': 'doc_sendings',
    'Претензии': 'doc_claims',
    'Договоры': 'doc_contracts',
    'Акты сверок': 'doc_acts_settlement',
    'Тарифы': 'doc_tariffs',
};

type DocumentsPageProps = {
    auth: AuthData;
    useServiceRequest?: boolean;
    activeInn?: string;
    searchText?: string;
    onOpenCargo?: (cargoNumber: string) => void;
    onOpenChat?: (context?: string) => void | Promise<void>;
    /** Права доступа (для зарегистрированных пользователей) */
    permissions?: AccountPermissions | null;
    /** Показывать суммы (финансовые показатели) */
    showSums?: boolean;
    /** Суперадминистратор (может менять EOR) */
    isSuperAdmin?: boolean;
};

export type EorStatus = 'entry_allowed' | 'full_inspection' | 'turnaround';

export function DocumentsPage({ auth, useServiceRequest, activeInn, searchText, onOpenCargo, onOpenChat, permissions, showSums = true, isSuperAdmin = false }: DocumentsPageProps) {
    const runtime = useAppRuntime();
    const effectiveServiceMode = useServiceRequest ?? runtime.useServiceRequest;
    const effectiveActiveInn = activeInn ?? runtime.activeInn;
    const effectiveSearchText = searchText ?? runtime.searchText;
    const initDate = () => loadDateFilterState();
    const [dateFilter, setDateFilter] = useState<DateFilter>(() => initDate()?.dateFilter ?? "месяц");
    const [customDateFrom, setCustomDateFrom] = useState(() => initDate()?.customDateFrom ?? DEFAULT_DATE_FROM);
    const [customDateTo, setCustomDateTo] = useState(() => initDate()?.customDateTo ?? DEFAULT_DATE_TO);
    const [selectedMonthForFilter, setSelectedMonthForFilter] = useState<{ year: number; month: number } | null>(() => initDate()?.selectedMonthForFilter ?? null);
    const [selectedYearForFilter, setSelectedYearForFilter] = useState<number | null>(() => initDate()?.selectedYearForFilter ?? null);
    const [selectedWeekForFilter, setSelectedWeekForFilter] = useState<string | null>(() => initDate()?.selectedWeekForFilter ?? null);
    const [isDateDropdownOpen, setIsDateDropdownOpen] = useState(false);
    const [dateDropdownMode, setDateDropdownMode] = useState<'main' | 'months' | 'years' | 'weeks'>('main');
    const [isCustomModalOpen, setIsCustomModalOpen] = useState(false);
    const [customerFilter, setCustomerFilter] = useState<string>('');
    const [orderReceiverFilter, setOrderReceiverFilter] = useState<string>('');
    const [orderSenderFilter, setOrderSenderFilter] = useState<string>('');
    const [orderRouteFilter, setOrderRouteFilter] = useState<string>('all');
    const [actCustomerFilter, setActCustomerFilter] = useState<string>('');
    const [sverkiCustomerFilter, setSverkiCustomerFilter] = useState<string>('');
    const [dogovorsCustomerFilter, setDogovorsCustomerFilter] = useState<string>('');
    const [edoStatusFilterSet, setEdoStatusFilterSet] = useState<Set<string>>(() => new Set());
    const [statusFilterSet, setStatusFilterSet] = useState<Set<string>>(() => new Set());
    const [typeFilter, setTypeFilter] = useState<'all' | 'ferry' | 'auto'>('all');
    const [routeFilter, setRouteFilter] = useState<'all' | 'MSK-KGD' | 'KGD-MSK'>('all');
    const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);
    const [isReceiverDropdownOpen, setIsReceiverDropdownOpen] = useState(false);
    const [isOrderSenderDropdownOpen, setIsOrderSenderDropdownOpen] = useState(false);
    const [isOrderRouteDropdownOpen, setIsOrderRouteDropdownOpen] = useState(false);
    const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
    const [isTypeDropdownOpen, setIsTypeDropdownOpen] = useState(false);
    const [isRouteDropdownOpen, setIsRouteDropdownOpen] = useState(false);
    const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null);
    const [selectedAct, setSelectedAct] = useState<any | null>(null);
    const [sortBy, setSortBy] = useState<'date' | null>('date');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
    const [ordersSortColumn, setOrdersSortColumn] = useState<'date' | 'number' | 'clientNumber' | 'pickupDate' | 'cargo' | 'sender' | 'receiver' | 'route' | 'customer' | 'comment'>('date');
    const [ordersSortOrder, setOrdersSortOrder] = useState<'asc' | 'desc'>('desc');
    const [ordersParcelsSortColumn, setOrdersParcelsSortColumn] = useState<'parcel' | 'cargo' | 'tmc' | 'consolidation' | 'count' | 'cost'>('parcel');
    const [ordersParcelsSortOrder, setOrdersParcelsSortOrder] = useState<'asc' | 'desc'>('asc');
    const DOCS_TABLE_MODE_KEY = 'haulz.docs.tableMode';
    const DOCS_SECTION_KEY = 'haulz.docs.section';
    const CLAIMS_PREFILL_CARGO_KEY = 'haulz.docs.claims.prefillCargoNumber';
    const [tableModeByCustomer, setTableModeByCustomer] = useState<boolean>(() => {
        try {
            const v = localStorage.getItem(DOCS_TABLE_MODE_KEY);
            return v === 'true';
        } catch { return false; }
    });
    useEffect(() => {
        try { localStorage.setItem(DOCS_TABLE_MODE_KEY, String(tableModeByCustomer)); } catch { /* ignore */ }
    }, [tableModeByCustomer]);
    const [expandedTableCustomer, setExpandedTableCustomer] = useState<string | null>(null);
    const [expandedTableActCustomer, setExpandedTableActCustomer] = useState<string | null>(null);
    const [expandedOrderRow, setExpandedOrderRow] = useState<string | null>(null);
    const [expandedSendingRow, setExpandedSendingRow] = useState<string | null>(null);
    /** Столбец EOR виден всем с правом haulz; менять значение могут только с правом eor или суперадмин */
    const showEorColumn = (permissions?.haulz === true) || isSuperAdmin;
    const canEditEor = (permissions?.eor === true) || isSuperAdmin;
    const [eorStatusMap, setEorStatusMap] = useState<Record<string, EorStatus[]>>({});
    const [selectedSendingRowKeys, setSelectedSendingRowKeys] = useState<Set<string>>(() => new Set());
    const [bulkEorMenuOpen, setBulkEorMenuOpen] = useState(false);
    const [bulkPlanDateOpen, setBulkPlanDateOpen] = useState(false);
    const [bulkPlanDateValue, setBulkPlanDateValue] = useState("");
    const [bulkSendingActionLoading, setBulkSendingActionLoading] = useState(false);
    const [bulkSendingActionError, setBulkSendingActionError] = useState<string | null>(null);
    const [bulkSendingActionInfo, setBulkSendingActionInfo] = useState<string | null>(null);
    const [selectedByCustomerSummaryKeys, setSelectedByCustomerSummaryKeys] = useState<Set<string>>(() => new Set());
    const [byCustomerPlanDateOpen, setByCustomerPlanDateOpen] = useState(false);
    const [byCustomerPlanDateValue, setByCustomerPlanDateValue] = useState("");
    const [byCustomerActionLoading, setByCustomerActionLoading] = useState(false);
    const [byCustomerActionError, setByCustomerActionError] = useState<string | null>(null);
    const [byCustomerActionInfo, setByCustomerActionInfo] = useState<string | null>(null);
    const [tariffsList, setTariffsList] = useState<{
        id: number;
        docDate: string | null;
        docNumber: string;
        customerName: string;
        customerInn: string;
        cityFrom: string;
        cityTo: string;
        transportType: string;
        isDangerous: boolean;
        isVet: boolean;
        tariff: number | null;
    }[]>([]);
    const [tariffsLoading, setTariffsLoading] = useState(false);
    const [sverkiList, setSverkiList] = useState<{
        id: number;
        docNumber: string;
        docDate: string | null;
        periodFrom: string | null;
        periodTo: string | null;
        customerName: string;
        customerInn: string;
    }[]>([]);
    const [sverkiLoading, setSverkiLoading] = useState(false);
    const [sverkiDownloadingId, setSverkiDownloadingId] = useState<number | null>(null);
    const [sverkiDownloadError, setSverkiDownloadError] = useState<string | null>(null);
    const [dogovorsList, setDogovorsList] = useState<{
        id: number;
        docNumber: string;
        docDate: string | null;
        customerName: string;
        customerInn: string;
        title: string;
    }[]>([]);
    const [dogovorsLoading, setDogovorsLoading] = useState(false);
    const [claimsList, setClaimsList] = useState<{
        id: number;
        claimNumber: string;
        cargoNumber: string;
        claimType: string;
        description: string;
        requestedAmount: number | null;
        approvedAmount: number | null;
        status: ClaimStatusKey;
        createdAt: string;
        updatedAt: string;
    }[]>([]);
    const [claimsLoading, setClaimsLoading] = useState(false);
    const [claimsStatusFilter, setClaimsStatusFilter] = useState<string>('all');
    const [claimsCreateOpen, setClaimsCreateOpen] = useState(false);
    const [claimsCreateSubmitting, setClaimsCreateSubmitting] = useState(false);
    const [claimsCreateError, setClaimsCreateError] = useState<string | null>(null);
    const [claimsCreateCargoNumber, setClaimsCreateCargoNumber] = useState('');
    const [claimsCargoDropdownOpen, setClaimsCargoDropdownOpen] = useState(false);
    const claimsCargoInputRef = useRef<HTMLDivElement>(null);
    const [claimsCreateType, setClaimsCreateType] = useState<'cargo_damage' | 'quantity_mismatch' | 'cargo_loss' | 'other'>('cargo_damage');
    const [claimsCreateDescription, setClaimsCreateDescription] = useState('');
    const [claimsCreateAmount, setClaimsCreateAmount] = useState('');
    const [claimsCreateContactName, setClaimsCreateContactName] = useState('');
    const [claimsCreatePhone, setClaimsCreatePhone] = useState('');
    const [claimsCreateEmail, setClaimsCreateEmail] = useState('');
    const [claimsCreateVideoLink, setClaimsCreateVideoLink] = useState('');
    const [claimsCreateManipulationSignIds, setClaimsCreateManipulationSignIds] = useState<string[]>([]);
    const [claimsCreateManipulationPhotoFiles, setClaimsCreateManipulationPhotoFiles] = useState<File[]>([]);
    const [claimsCreatePackagingTypeIds, setClaimsCreatePackagingTypeIds] = useState<string[]>([]);
    const [claimsCreateSelectedPlaceKeys, setClaimsCreateSelectedPlaceKeys] = useState<string[]>([]);
    const [claimsAcceptedNomenclatureLoading, setClaimsAcceptedNomenclatureLoading] = useState(false);
    const [claimsAcceptedNomenclatureError, setClaimsAcceptedNomenclatureError] = useState<string | null>(null);
    const [claimsAcceptedNomenclatureRows, setClaimsAcceptedNomenclatureRows] = useState<Array<{ key: string; barcode: string; name: string; declaredCost: string }>>([]);
    const [claimsCreatePhotoFiles, setClaimsCreatePhotoFiles] = useState<File[]>([]);
    const [claimsCreateDocumentFiles, setClaimsCreateDocumentFiles] = useState<File[]>([]);
    const [claimsEditingId, setClaimsEditingId] = useState<number | null>(null);
    const [claimsActionLoadingId, setClaimsActionLoadingId] = useState<number | null>(null);
    const [claimsReplyOpen, setClaimsReplyOpen] = useState(false);
    const [claimsReplyClaimId, setClaimsReplyClaimId] = useState<number | null>(null);
    const [claimsReplyPhotoFiles, setClaimsReplyPhotoFiles] = useState<File[]>([]);
    const [claimsReplyDocumentFiles, setClaimsReplyDocumentFiles] = useState<File[]>([]);
    const [claimsReplyVideoLink, setClaimsReplyVideoLink] = useState('');
    const [claimsReplySubmitting, setClaimsReplySubmitting] = useState(false);
    const [claimsReplyError, setClaimsReplyError] = useState<string | null>(null);
    const [claimsDetailOpen, setClaimsDetailOpen] = useState(false);
    const [claimsDetailLoading, setClaimsDetailLoading] = useState(false);
    const [claimsDetailError, setClaimsDetailError] = useState<string | null>(null);
    const [claimsDetailData, setClaimsDetailData] = useState<any | null>(null);
    const [sverkiRequests, setSverkiRequests] = useState<{
        id: number;
        customerInn: string;
        contract: string;
        periodFrom: string;
        periodTo: string;
        status: 'pending' | 'edo_sent';
        createdAt: string;
    }[]>([]);
    const [sverkiRequestsLoading, setSverkiRequestsLoading] = useState(false);
    const [sverkiOrderModalOpen, setSverkiOrderModalOpen] = useState(false);
    const [sverkiOrderContract, setSverkiOrderContract] = useState('');
    const [sverkiOrderPeriodFrom, setSverkiOrderPeriodFrom] = useState('');
    const [sverkiOrderPeriodTo, setSverkiOrderPeriodTo] = useState('');
    const [sverkiOrderSubmitting, setSverkiOrderSubmitting] = useState(false);
    const [sverkiOrderError, setSverkiOrderError] = useState<string | null>(null);
    const [tariffsCustomerFilter, setTariffsCustomerFilter] = useState<string>("");
    const [tariffsCustomerSearchQuery, setTariffsCustomerSearchQuery] = useState<string>("");
    const [tariffsRouteFilter, setTariffsRouteFilter] = useState<string>("all");
    const [tariffsTypeFilter, setTariffsTypeFilter] = useState<string>("all");
    const [tariffsSortColumn, setTariffsSortColumn] = useState<"docDate" | "docNumber" | "customerName" | "cityFrom" | "cityTo" | "transportType" | "dangerous" | "tariff">("docDate");
    const [tariffsSortOrder, setTariffsSortOrder] = useState<"asc" | "desc">("desc");
    const allowedDocSections = useMemo(() => {
        if (!permissions) return DOC_SECTIONS;
        return DOC_SECTIONS.filter(({ key }) => permissions[DOC_SECTION_TO_PERMISSION[key]] !== false);
    }, [permissions]);
    const defaultDocSection = allowedDocSections[0]?.key ?? 'Счета';
    const [docSection, setDocSection] = useState<DocSectionKey>(() => {
        try {
            const v = localStorage.getItem(DOCS_SECTION_KEY) as DocSectionKey | null;
            if (v && DOC_SECTIONS.some(({ key }) => key === v)) return v;
        } catch { /* ignore */ }
        return defaultDocSection;
    });
    useEffect(() => {
        const isAllowed = allowedDocSections.some(({ key }) => key === docSection);
        if (!isAllowed && allowedDocSections.length > 0) {
            setDocSection(defaultDocSection);
            try { localStorage.setItem(DOCS_SECTION_KEY, defaultDocSection); } catch { /* ignore */ }
        } else {
            try { localStorage.setItem(DOCS_SECTION_KEY, docSection); } catch { /* ignore */ }
        }
    }, [allowedDocSections, docSection, defaultDocSection]);
    const serviceModeForCurrentDocSection = effectiveServiceMode || docSection === 'Отправки';
    useEffect(() => {
        setExpandedOrderRow(null);
        setExpandedSendingRow(null);
    }, [docSection, dateFilter, customDateFrom, customDateTo, selectedMonthForFilter, selectedYearForFilter, selectedWeekForFilter]);
    useEffect(() => {
        if (docSection !== 'Тарифы') return;
        setTariffsLoading(true);
        const params = new URLSearchParams();
        if (!effectiveServiceMode && effectiveActiveInn) params.set('inn', effectiveActiveInn);
        fetch(`/api/tariffs${params.toString() ? `?${params.toString()}` : ''}`)
            .then((res) => res.json())
            .then((data: { tariffs?: {
                id: number;
                docDate: string | null;
                docNumber: string;
                customerName: string;
                customerInn: string;
                cityFrom: string;
                cityTo: string;
                transportType: string;
                isDangerous: boolean;
                isVet: boolean;
                tariff: number | null;
            }[] }) => {
                setTariffsList(data.tariffs || []);
            })
            .catch(() => setTariffsList([]))
            .finally(() => setTariffsLoading(false));
    }, [docSection, effectiveActiveInn, effectiveServiceMode]);
    useEffect(() => {
        if (docSection !== 'Акты сверок') return;
        setSverkiLoading(true);
        const params = new URLSearchParams();
        if (!effectiveServiceMode && effectiveActiveInn) params.set('inn', effectiveActiveInn);
        fetch(`/api/sverki${params.toString() ? `?${params.toString()}` : ''}`)
            .then((res) => res.json())
            .then((data: { sverki?: {
                id: number;
                docNumber: string;
                docDate: string | null;
                periodFrom: string | null;
                periodTo: string | null;
                customerName: string;
                customerInn: string;
            }[] }) => {
                setSverkiList(data.sverki || []);
            })
            .catch(() => setSverkiList([]))
            .finally(() => setSverkiLoading(false));
    }, [docSection, effectiveActiveInn, effectiveServiceMode]);
    useEffect(() => {
        if (docSection !== 'Договоры') return;
        setDogovorsLoading(true);
        const params = new URLSearchParams();
        if (!effectiveServiceMode && effectiveActiveInn) params.set('inn', effectiveActiveInn);
        fetch(`/api/dogovors${params.toString() ? `?${params.toString()}` : ''}`)
            .then((res) => res.json())
            .then((data: { dogovors?: {
                id: number;
                docNumber: string;
                docDate: string | null;
                customerName: string;
                customerInn: string;
                title: string;
            }[] }) => {
                setDogovorsList(data.dogovors || []);
            })
            .catch(() => setDogovorsList([]))
            .finally(() => setDogovorsLoading(false));
    }, [docSection, effectiveActiveInn, effectiveServiceMode]);
    const reloadClaims = useCallback(async () => {
        if (docSection !== 'Претензии' || !auth?.login || !auth?.password) {
            setClaimsList([]);
            return;
        }
        setClaimsLoading(true);
        const params = new URLSearchParams();
        if (claimsStatusFilter !== 'all') params.set('status', claimsStatusFilter);
        try {
            const res = await fetch(`/api/claims${params.toString() ? `?${params.toString()}` : ''}`, {
                method: 'GET',
                headers: {
                    'x-login': auth.login,
                    'x-password': auth.password,
                },
            });
            const data = await res.json().catch(() => ({}));
            setClaimsList(Array.isArray((data as any)?.claims) ? ((data as any).claims as any[]) : []);
        } catch {
            setClaimsList([]);
        } finally {
            setClaimsLoading(false);
        }
    }, [docSection, auth?.login, auth?.password, claimsStatusFilter]);
    useEffect(() => {
        reloadClaims();
    }, [reloadClaims]);
    const openClaimsCreateModal = useCallback((prefillCargoNumber?: string) => {
        setClaimsCreateError(null);
        setClaimsEditingId(null);
        setClaimsCreateCargoNumber(String(prefillCargoNumber || '').trim());
        setClaimsCreateType('cargo_damage');
        setClaimsCreateDescription('');
        setClaimsCreateAmount('');
        setClaimsCreateContactName('');
        setClaimsCreatePhone('');
        setClaimsCreateEmail(auth?.login || '');
        setClaimsCreateVideoLink('');
        setClaimsCreateManipulationSignIds([]);
        setClaimsCreateManipulationPhotoFiles([]);
        setClaimsCreatePackagingTypeIds([]);
        setClaimsCreateSelectedPlaceKeys([]);
        setClaimsCreatePhotoFiles([]);
        setClaimsCreateDocumentFiles([]);
        setClaimsCreateOpen(true);
    }, [auth?.login]);

    useEffect(() => {
        if (docSection !== 'Претензии') return;
        if (!allowedDocSections.some(({ key }) => key === 'Претензии')) return;
        let prefillCargo = '';
        try {
            prefillCargo = String(localStorage.getItem(CLAIMS_PREFILL_CARGO_KEY) || '').trim();
            if (prefillCargo) localStorage.removeItem(CLAIMS_PREFILL_CARGO_KEY);
        } catch {
            prefillCargo = '';
        }
        if (!prefillCargo) return;
        openClaimsCreateModal(prefillCargo);
    }, [docSection, allowedDocSections, openClaimsCreateModal]);

    useEffect(() => {
        if (docSection === 'Претензии') return;
        if (!allowedDocSections.some(({ key }) => key === 'Претензии')) return;
        let hasPrefill = false;
        try {
            hasPrefill = Boolean(String(localStorage.getItem(CLAIMS_PREFILL_CARGO_KEY) || '').trim());
        } catch {
            hasPrefill = false;
        }
        if (hasPrefill) setDocSection('Претензии');
    }, [docSection, allowedDocSections]);

    const openDraftEditor = useCallback(async (claimId: number) => {
        if (!auth?.login || !auth?.password) return;
        setClaimsCreateError(null);
        setClaimsCreateSubmitting(true);
        try {
            const res = await fetch(`/api/claims/${claimId}`, {
                method: 'GET',
                headers: {
                    'x-login': auth.login,
                    'x-password': auth.password,
                },
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data?.error || 'Не удалось загрузить черновик');
            const claim = (data as any)?.claim || {};
            const events = Array.isArray((data as any)?.events) ? (data as any).events as any[] : [];
            const draftPayload = [...events].reverse().find((e: any) => (
                e?.eventType === 'claim_draft_saved' || e?.eventType === 'claim_created'
            ))?.payload || {};
            setClaimsEditingId(claimId);
            setClaimsCreateCargoNumber(String(claim?.cargoNumber || ''));
            setClaimsCreateType((String(claim?.claimType || 'cargo_damage') as any));
            setClaimsCreateDescription(String(claim?.description || ''));
            setClaimsCreateAmount(claim?.requestedAmount != null ? String(claim.requestedAmount) : '');
            setClaimsCreateContactName(String(draftPayload?.customerContactName || ''));
            setClaimsCreatePhone(String(claim?.customerPhone || ''));
            setClaimsCreateEmail(String(claim?.customerEmail || auth.login || ''));
            setClaimsCreateVideoLink('');
            setClaimsCreateManipulationSignIds(Array.isArray(draftPayload?.manipulationSigns) ? draftPayload.manipulationSigns.map((x: any) => String(x)) : []);
            setClaimsCreatePackagingTypeIds(Array.isArray(draftPayload?.packagingTypes) ? draftPayload.packagingTypes.map((x: any) => String(x)) : []);
            setClaimsCreateSelectedPlaceKeys([]);
            setClaimsCreatePhotoFiles([]);
            setClaimsCreateManipulationPhotoFiles([]);
            setClaimsCreateDocumentFiles([]);
            setClaimsCreateOpen(true);
        } catch (e: any) {
            setClaimsCreateError(e?.message || 'Не удалось открыть черновик');
        } finally {
            setClaimsCreateSubmitting(false);
        }
    }, [auth?.login, auth?.password]);
    const openClaimDetailModal = useCallback(async (claimId: number) => {
        if (!auth?.login || !auth?.password) return;
        setClaimsDetailOpen(true);
        setClaimsDetailLoading(true);
        setClaimsDetailError(null);
        setClaimsDetailData(null);
        try {
            const res = await fetch(`/api/claims/${claimId}`, {
                method: 'GET',
                headers: {
                    'x-login': auth.login,
                    'x-password': auth.password,
                },
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data?.error || 'Не удалось загрузить карточку претензии');
            setClaimsDetailData(data);
        } catch (e: any) {
            setClaimsDetailError(e?.message || 'Не удалось загрузить карточку претензии');
        } finally {
            setClaimsDetailLoading(false);
        }
    }, [auth?.login, auth?.password]);
    const runClaimAction = useCallback(async (claimId: number, action: 'submit' | 'withdraw') => {
        if (!auth?.login || !auth?.password) return;
        setClaimsActionLoadingId(claimId);
        try {
            const res = await fetch(`/api/claims/${claimId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-login': auth.login,
                    'x-password': auth.password,
                },
                body: JSON.stringify({ action }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data?.error || 'Не удалось обновить статус претензии');
            await reloadClaims();
        } catch (e: any) {
            setClaimsCreateError(e?.message || 'Ошибка действия по претензии');
        } finally {
            setClaimsActionLoadingId(null);
        }
    }, [auth?.login, auth?.password, reloadClaims]);
    const openClaimReplyModal = useCallback((claimId: number) => {
        setClaimsReplyClaimId(claimId);
        setClaimsReplyPhotoFiles([]);
        setClaimsReplyDocumentFiles([]);
        setClaimsReplyVideoLink('');
        setClaimsReplyError(null);
        setClaimsReplyOpen(true);
    }, []);
    const submitClaimReplyDocuments = useCallback(async () => {
        if (!claimsReplyClaimId || !auth?.login || !auth?.password) return;
        setClaimsReplySubmitting(true);
        setClaimsReplyError(null);
        try {
            const photosPayload = await Promise.all(
                claimsReplyPhotoFiles.map(async (file) => ({
                    fileName: file.name,
                    mimeType: file.type || 'image/jpeg',
                    caption: 'Ответ на запрос документов',
                    base64: await fileToBase64(file),
                }))
            );
            const documentsPayload = await Promise.all(
                claimsReplyDocumentFiles.map(async (file) => ({
                    fileName: file.name,
                    mimeType: file.type || 'application/pdf',
                    docType: 'other' as const,
                    base64: await fileToBase64(file),
                }))
            );
            const res = await fetch(`/api/claims/${claimsReplyClaimId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-login': auth.login,
                    'x-password': auth.password,
                },
                body: JSON.stringify({
                    action: 'upload_documents',
                    photos: photosPayload,
                    documents: documentsPayload,
                    videoLinks: claimsReplyVideoLink.trim() ? [{ url: claimsReplyVideoLink.trim(), title: 'Видео по запросу документов' }] : [],
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data?.error || 'Не удалось отправить документы');
            setClaimsReplyOpen(false);
            setClaimsReplyClaimId(null);
            setClaimsReplyPhotoFiles([]);
            setClaimsReplyDocumentFiles([]);
            setClaimsReplyVideoLink('');
            await reloadClaims();
        } catch (e: any) {
            setClaimsReplyError(e?.message || 'Ошибка отправки документов');
        } finally {
            setClaimsReplySubmitting(false);
        }
    }, [claimsReplyClaimId, auth?.login, auth?.password, claimsReplyPhotoFiles, claimsReplyDocumentFiles, claimsReplyVideoLink, reloadClaims]);
    useEffect(() => {
        if (docSection !== 'Акты сверок' || !effectiveActiveInn || !auth?.login || !auth?.password) {
            setSverkiRequests([]);
            return;
        }
        setSverkiRequestsLoading(true);
        fetch(`/api/sverki-requests?inn=${encodeURIComponent(effectiveActiveInn)}`, {
            method: 'GET',
            headers: {
                'x-login': auth.login,
                'x-password': auth.password,
            },
        })
            .then((res) => res.json().catch(() => ({})))
            .then((data: { requests?: {
                id: number;
                customerInn: string;
                contract: string;
                periodFrom: string;
                periodTo: string;
                status: 'pending' | 'edo_sent';
                createdAt: string;
            }[] }) => {
                setSverkiRequests(Array.isArray(data?.requests) ? data.requests : []);
            })
            .catch(() => setSverkiRequests([]))
            .finally(() => setSverkiRequestsLoading(false));
    }, [docSection, effectiveActiveInn, auth?.login, auth?.password]);
    useEffect(() => {
        if (effectiveServiceMode) return;
        setTariffsCustomerFilter('');
        setTariffsCustomerSearchQuery('');
        setIsTariffsCustomerDropdownOpen(false);
    }, [effectiveServiceMode]);
    useEffect(() => {
        if (!showEorColumn || !auth?.login || !auth?.password) {
            setEorStatusMap({});
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const resp = await fetch('/api/sendings-eor', {
                    method: 'GET',
                    headers: {
                        'x-login': auth.login,
                        'x-password': auth.password,
                    },
                });
                if (!resp.ok) return;
                const data = await resp.json().catch(() => ({}));
                if (!cancelled && data && typeof data.map === 'object' && data.map !== null) {
                    setEorStatusMap(data.map as Record<string, EorStatus[]>);
                }
            } catch {
                // ignore DB sync errors in UI
            }
        })();
        return () => { cancelled = true; };
    }, [showEorColumn, auth?.login, auth?.password]);
    useEffect(() => {
        if (docSection !== 'Отправки') {
            setSelectedSendingRowKeys(new Set());
            setBulkEorMenuOpen(false);
            setBulkPlanDateOpen(false);
            setBulkSendingActionLoading(false);
            setBulkSendingActionError(null);
            setBulkSendingActionInfo(null);
            setSelectedByCustomerSummaryKeys(new Set());
            setByCustomerPlanDateOpen(false);
            setByCustomerPlanDateValue("");
            setByCustomerActionLoading(false);
            setByCustomerActionError(null);
            setByCustomerActionInfo(null);
        }
    }, [docSection]);
    const [tableSortColumn, setTableSortColumn] = useState<'customer' | 'sum' | 'count'>('customer');
    const [tableSortOrder, setTableSortOrder] = useState<'asc' | 'desc'>('asc');
    const [innerTableSortColumn, setInnerTableSortColumn] = useState<'number' | 'date' | 'status' | 'sum' | 'deliveryStatus' | 'route'>('date');
    const [innerTableSortOrder, setInnerTableSortOrder] = useState<'asc' | 'desc'>('desc');
    const [innerTableActSortColumn, setInnerTableActSortColumn] = useState<'number' | 'date' | 'invoice' | 'sum'>('date');
    const [innerTableActSortOrder, setInnerTableActSortOrder] = useState<'asc' | 'desc'>('desc');
    const [sendingsSortColumn, setSendingsSortColumn] = useState<'date' | 'number' | 'route' | 'type' | 'transitHours' | 'vehicle' | 'comment'>('date');
    const [sendingsSortOrder, setSendingsSortOrder] = useState<'asc' | 'desc'>('desc');
    const [sendingsDetailsView, setSendingsDetailsView] = useState<'general' | 'byCargo' | 'byCustomer'>('general');
    const [sendingsSummaryGroupBy, setSendingsSummaryGroupBy] = useState<'customer' | 'receiver'>('customer');
    const [sendingsSummarySortColumn, setSendingsSummarySortColumn] = useState<'index' | 'cargo' | 'status' | 'count' | 'volume' | 'weight' | 'paidWeight' | 'customer' | 'density'>('index');
    const [sendingsSummarySortOrder, setSendingsSummarySortOrder] = useState<'asc' | 'desc'>('asc');
    const [deliveryStatusFilterSet, setDeliveryStatusFilterSet] = useState<Set<StatusFilter>>(() => new Set());
    const [routeFilterCargo, setRouteFilterCargo] = useState<string>('all');
    const [transportFilter, setTransportFilter] = useState<string>('');
    const [transportSearchQuery, setTransportSearchQuery] = useState<string>('');
    const [isDeliveryStatusDropdownOpen, setIsDeliveryStatusDropdownOpen] = useState(false);
    const [isRouteCargoDropdownOpen, setIsRouteCargoDropdownOpen] = useState(false);
    const [isTransportDropdownOpen, setIsTransportDropdownOpen] = useState(false);
    const [isEdoStatusDropdownOpen, setIsEdoStatusDropdownOpen] = useState(false);
    const [isActCustomerDropdownOpen, setIsActCustomerDropdownOpen] = useState(false);
    const [isSverkiCustomerDropdownOpen, setIsSverkiCustomerDropdownOpen] = useState(false);
    const [isDogovorsCustomerDropdownOpen, setIsDogovorsCustomerDropdownOpen] = useState(false);
    const [isTariffsCustomerDropdownOpen, setIsTariffsCustomerDropdownOpen] = useState(false);
    const [isTariffsRouteDropdownOpen, setIsTariffsRouteDropdownOpen] = useState(false);
    const [isTariffsTypeDropdownOpen, setIsTariffsTypeDropdownOpen] = useState(false);
    const [favVersion, setFavVersion] = useState(0);
    useEffect(() => {
        setSelectedByCustomerSummaryKeys(new Set());
        setByCustomerPlanDateOpen(false);
        setByCustomerPlanDateValue("");
        setByCustomerActionLoading(false);
        setByCustomerActionError(null);
        setByCustomerActionInfo(null);
        setSendingsSummaryGroupBy('customer');
    }, [expandedSendingRow, sendingsDetailsView]);
    const deliveryStatusButtonRef = useRef<HTMLDivElement | null>(null);
    const routeCargoButtonRef = useRef<HTMLDivElement | null>(null);
    const transportButtonRef = useRef<HTMLDivElement | null>(null);
    const edoStatusButtonRef = useRef<HTMLDivElement | null>(null);
    const actCustomerButtonRef = useRef<HTMLDivElement | null>(null);
    const sverkiCustomerButtonRef = useRef<HTMLDivElement | null>(null);
    const dogovorsCustomerButtonRef = useRef<HTMLDivElement | null>(null);
    const dateButtonRef = useRef<HTMLDivElement | null>(null);
    const customerButtonRef = useRef<HTMLDivElement | null>(null);
    const receiverButtonRef = useRef<HTMLDivElement | null>(null);
    const orderSenderButtonRef = useRef<HTMLDivElement | null>(null);
    const orderRouteButtonRef = useRef<HTMLDivElement | null>(null);
    const statusButtonRef = useRef<HTMLDivElement | null>(null);
    const typeButtonRef = useRef<HTMLDivElement | null>(null);
    const routeButtonRef = useRef<HTMLDivElement | null>(null);
    const tariffsCustomerButtonRef = useRef<HTMLDivElement | null>(null);
    const tariffsRouteButtonRef = useRef<HTMLDivElement | null>(null);
    const tariffsTypeButtonRef = useRef<HTMLDivElement | null>(null);
    const monthLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const monthWasLongPressRef = useRef(false);
    const yearLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const yearWasLongPressRef = useRef(false);
    const weekLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const weekWasLongPressRef = useRef(false);

    useEffect(() => {
        saveDateFilterState({ dateFilter, customDateFrom, customDateTo, selectedMonthForFilter, selectedYearForFilter, selectedWeekForFilter });
    }, [dateFilter, customDateFrom, customDateTo, selectedMonthForFilter, selectedYearForFilter, selectedWeekForFilter]);

    const { apiDateRange, perevozkiDateRange } = useDocumentsDateRange({
        dateFilter,
        customDateFrom,
        customDateTo,
        selectedMonthForFilter,
        selectedYearForFilter,
        selectedWeekForFilter,
    });

    const {
        items,
        error,
        loading,
        actsItems,
        actsError,
        actsLoading,
        ordersItems,
        ordersError,
        ordersLoading,
        sendingsItems,
        sendingsError,
        sendingsLoading,
        perevozkiItems,
        perevozkiLoading,
    } = useDocumentsDataLoad({
        auth,
        activeInn: effectiveActiveInn,
        useServiceRequest: serviceModeForCurrentDocSection,
        apiDateRange,
        perevozkiDateRange,
    });

    // При выходе из служебного режима прячем и сбрасываем "компанийные" фильтры.
    useEffect(() => {
        if (effectiveServiceMode) return;
        setCustomerFilter('');
        setActCustomerFilter('');
        setSverkiCustomerFilter('');
        setDogovorsCustomerFilter('');
        setTransportFilter('');
        setOrderRouteFilter('all');
        setIsCustomerDropdownOpen(false);
        setIsActCustomerDropdownOpen(false);
        setIsSverkiCustomerDropdownOpen(false);
        setIsDogovorsCustomerDropdownOpen(false);
        setIsTransportDropdownOpen(false);
    }, [effectiveServiceMode]);

    /** Канонический ключ для сопоставления номера перевозки (с/без ведущих нулей) */
    const normCargoKey = useCallback((num: string | null | undefined): string => {
        if (num == null) return '';
        const s = String(num).replace(/^0000-/, '').trim().replace(/^0+/, '') || '0';
        return s;
    }, []);

    const cargoStateByNumber = useMemo(
        () => buildCargoStateByNumber(perevozkiItems || []),
        [perevozkiItems]
    );

    const cargoRouteByNumber = useMemo(
        () => buildCargoRouteByNumber(perevozkiItems || []),
        [perevozkiItems]
    );

    const cargoTransportByNumber = useMemo(() => {
        const base = buildCargoTransportByNumber(perevozkiItems || []);
        (sendingsItems || []).forEach((row: any) => {
            const transport = String(
                row?.АвтомобильCMRНаименование
                ?? row?.AutoReg
                ?? row?.autoReg
                ?? row?.AutoType
                ?? ''
            ).trim();
            if (!transport) return;
            const numbers: string[] = [];
            const addNumber = (value: unknown) => {
                const v = String(value ?? '').trim();
                if (v) numbers.push(v);
            };
            addNumber(row?.НомерПеревозки);
            addNumber(row?.CargoNumber);
            addNumber(row?.NumberPerevozki);
            addNumber(row?.ИДОтправления);
            const rawParcels = row?.Посылки ?? row?.Parcels ?? row?.parcels ?? row?.Packages ?? row?.packages;
            const parcels = Array.isArray(rawParcels)
                ? rawParcels
                : (rawParcels && typeof rawParcels === 'object'
                    ? Object.values(rawParcels as Record<string, any>)
                    : []);
            parcels.forEach((parcel: any) => {
                addNumber(parcel?.ИДОтправления);
                addNumber(parcel?.НомерПеревозки);
                addNumber(parcel?.CargoNumber);
                addNumber(parcel?.NumberPerevozki);
                const goodsRaw = parcel?.Товары;
                const goods = Array.isArray(goodsRaw)
                    ? (goodsRaw[0] ?? {})
                    : (goodsRaw && typeof goodsRaw === 'object' ? goodsRaw : null);
                if (goods && typeof goods === 'object') {
                    addNumber((goods as any)?.ИДОтправления);
                    addNumber((goods as any)?.НомерПеревозки);
                    addNumber((goods as any)?.CargoNumber);
                    addNumber((goods as any)?.NumberPerevozki);
                }
            });
            Array.from(new Set(numbers)).forEach((raw) => {
                const key = normCargoKey(raw);
                base.set(key, transport);
                if (key !== raw) base.set(raw, transport);
            });
        });
        return base;
    }, [perevozkiItems, sendingsItems, normCargoKey]);
    const normalizeTransportDisplay = useCallback((value: unknown): string => {
        const s = String(value ?? '').toUpperCase().trim();
        if (!s) return '';
        const normalizedSpaces = s.replace(/\s+/g, ' ');
        const container = normalizedSpaces.match(/([A-ZА-Я]{4})[\s\-]*([0-9]{7})$/u);
        if (container) return `${container[1]} ${container[2]}`;
        const vehicle = normalizedSpaces.match(/([A-ZА-Я][0-9]{3}[A-ZА-Я]{2})(\s*\/?\s*([0-9]{2,3}))?$/u);
        if (vehicle) {
            const base = vehicle[1];
            const region = vehicle[3] ?? '';
            if (!region) return base;
            const rawTail = vehicle[2] ?? '';
            return rawTail.includes('/') ? `${base}/${region}` : `${base}${region}`;
        }
        const looseVehicle = normalizedSpaces.match(/([A-ZА-Я])[\s\-]*([0-9]{3})[\s\-]*([A-ZА-Я]{2})(?:[\s\-]*\/?[\s\-]*([0-9]{2,3}))?$/u);
        if (looseVehicle) {
            const base = `${looseVehicle[1]}${looseVehicle[2]}${looseVehicle[3]}`;
            const region = looseVehicle[4] ?? '';
            if (!region) return base;
            return normalizedSpaces.includes('/') ? `${base}/${region}` : `${base}${region}`;
        }
        return normalizedSpaces
            .replace(/\bнаименование\s*тс\b[:\-]?\s*/giu, '')
            .replace(/\bконтейнер\b[:\-]?\s*/giu, '')
            .replace(/\s{2,}/g, ' ')
            .trim();
    }, []);
    const parseDateTimeValue = useCallback((value: unknown): Date | null => {
        const source = String(value ?? '').trim();
        if (!source) return null;
        const iso = source.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2})(?::(\d{2}))?(?::(\d{2}))?)?/);
        if (iso) {
            const year = Number(iso[1]);
            const month = Number(iso[2]) - 1;
            const day = Number(iso[3]);
            const hours = Number(iso[4] ?? 0);
            const minutes = Number(iso[5] ?? 0);
            const seconds = Number(iso[6] ?? 0);
            const date = new Date(year, month, day, hours, minutes, seconds);
            return Number.isNaN(date.getTime()) ? null : date;
        }
        const ru = source.match(/^(\d{2})\.(\d{2})\.(\d{4})(?:[ ,T](\d{2})(?::(\d{2}))?(?::(\d{2}))?)?/);
        if (ru) {
            const day = Number(ru[1]);
            const month = Number(ru[2]) - 1;
            const year = Number(ru[3]);
            const hours = Number(ru[4] ?? 0);
            const minutes = Number(ru[5] ?? 0);
            const seconds = Number(ru[6] ?? 0);
            const date = new Date(year, month, day, hours, minutes, seconds);
            return Number.isNaN(date.getTime()) ? null : date;
        }
        const fallback = new Date(source);
        return Number.isNaN(fallback.getTime()) ? null : fallback;
    }, []);
    const cargoStopDateByNumber = useMemo(() => {
        const m = new Map<string, Date>();
        (perevozkiItems || []).forEach((cargo: any) => {
            const raw = String(cargo?.Number ?? cargo?.number ?? '').replace(/^0000-/, '').trim();
            if (!raw) return;
            const statusKey = getFilterKeyByStatus(String(cargo?.State ?? cargo?.state ?? cargo?.Статус ?? ''));
            if (statusKey !== 'ready' && statusKey !== 'delivered') return;
            const stopDate = parseDateTimeValue(
                cargo?.DateVr
                ?? cargo?.DatePrih
                ?? cargo?.DateDelivery
                ?? cargo?.DeliveryDate
                ?? cargo?.ДатаДоставки
                ?? cargo?.ДатаПрибытия
                ?? cargo?.Дата
            );
            if (!stopDate) return;
            const key = normCargoKey(raw);
            const prev = m.get(key);
            if (!prev || stopDate.getTime() < prev.getTime()) m.set(key, stopDate);
            if (key !== raw) {
                const prevRaw = m.get(raw);
                if (!prevRaw || stopDate.getTime() < prevRaw.getTime()) m.set(raw, stopDate);
            }
        });
        return m;
    }, [perevozkiItems, parseDateTimeValue, normCargoKey]);
    const getSendingCargoNumbers = useCallback((row: any): string[] => {
        const numbers: string[] = [];
        const add = (value: unknown) => {
            const v = String(value ?? '').trim();
            if (v) numbers.push(v);
        };
        add(row?.НомерПеревозки);
        add(row?.CargoNumber);
        add(row?.NumberPerevozki);
        add(row?.ИДОтправления);
        const rawParcels = row?.Посылки ?? row?.Parcels ?? row?.parcels ?? row?.Packages ?? row?.packages;
        const parcels = Array.isArray(rawParcels)
            ? rawParcels
            : (rawParcels && typeof rawParcels === 'object'
                ? Object.values(rawParcels as Record<string, any>)
                : []);
        parcels.forEach((parcel: any) => {
            add(parcel?.ИДОтправления);
            add(parcel?.НомерПеревозки);
            add(parcel?.CargoNumber);
            add(parcel?.NumberPerevozki);
            const goodsRaw = parcel?.Товары;
            const goods = Array.isArray(goodsRaw)
                ? (goodsRaw[0] ?? {})
                : (goodsRaw && typeof goodsRaw === 'object' ? goodsRaw : null);
            if (goods && typeof goods === 'object') {
                add((goods as any)?.ИДОтправления);
                add((goods as any)?.НомерПеревозки);
                add((goods as any)?.CargoNumber);
                add((goods as any)?.NumberPerevozki);
            }
        });
        return Array.from(new Set(numbers));
    }, []);
    const getSendingTransitHours = useCallback((row: any): number | null => {
        const start = parseDateTimeValue(
            row?.DateOtpr
            ?? row?.DateSend
            ?? row?.DateShipment
            ?? row?.ShipmentDate
            ?? row?.ДатаОтправки
            ?? row?.ДатаОтгрузки
            ?? row?.DateDoc
            ?? row?.Date
            ?? row?.date
            ?? row?.Дата
        );
        if (!start) return null;
        const rowStatusKey = getFilterKeyByStatus(
            String(
                row?.State
                ?? row?.state
                ?? row?.Статус
                ?? row?.Status
                ?? row?.StatusName
                ?? ''
            )
        );
        const rowStopDate = parseDateTimeValue(
            row?.StatusDate
            ?? row?.DateStatus
            ?? row?.DateState
            ?? row?.UpdatedAt
            ?? row?.updated_at
            ?? row?.ДатаСтатуса
            ?? row?.ДатаИзменения
        );
        const explicitEnd = parseDateTimeValue(
            row?.DatePrih
            ?? row?.DateVr
            ?? row?.DateDelivery
            ?? row?.DeliveryDate
            ?? row?.ДатаДоставки
            ?? row?.ДатаПрибытия
        );
        const cargoNumbers = getSendingCargoNumbers(row);
        let hasStopStatus = false;
        let stopDateByCargo: Date | null = null;
        cargoNumbers.forEach((cargoNumber) => {
            const statusKey = getFilterKeyByStatus(String(cargoStateByNumber.get(normCargoKey(cargoNumber)) ?? ''));
            if (statusKey !== 'ready' && statusKey !== 'delivered') return;
            hasStopStatus = true;
            const cargoStopDate = cargoStopDateByNumber.get(normCargoKey(cargoNumber)) ?? cargoStopDateByNumber.get(cargoNumber);
            if (!cargoStopDate) return;
            if (!stopDateByCargo || cargoStopDate.getTime() < stopDateByCargo.getTime()) stopDateByCargo = cargoStopDate;
        });
        const hasReadyStatusInRow = rowStatusKey === 'ready' || rowStatusKey === 'delivered';
        const end = (hasStopStatus || hasReadyStatusInRow)
            ? (stopDateByCargo ?? explicitEnd ?? rowStopDate ?? new Date())
            : (explicitEnd ?? new Date());
        const diffMs = end.getTime() - start.getTime();
        if (!Number.isFinite(diffMs) || diffMs < 0) return null;
        return Math.round((diffMs / (1000 * 60 * 60)) * 10) / 10;
    }, [parseDateTimeValue, getSendingCargoNumbers, cargoStateByNumber, normCargoKey, cargoStopDateByNumber]);
    const getSendingPlannedArrivalDate = useCallback((row: any): Date | null => {
        try {
            const plannedKeys = [
                'ДатаПрибытияПлан', 'ДатаДоставкиПлан', 'ПланДатаПрибытия', 'ПлановаяДатаПрибытия', 'ПлановаяДатаДоставки',
                'DateArrivalPlan', 'DateDeliveryPlan', 'DeliveryDatePlan', 'PlannedDeliveryDate', 'PlanDeliveryDate',
                'DateArrival', 'PlanDate', 'DateVrPlan', 'DatePrihPlan',
            ];
            const dates: Date[] = [];
            const addDate = (value: unknown) => {
                const parsed = parseDateTimeValue(value);
                if (parsed) dates.push(parsed);
            };
            const collectFrom = (obj: any) => {
                if (!obj || typeof obj !== 'object') return;
                plannedKeys.forEach((k) => addDate(obj?.[k]));
            };

            const rawParcels = row?.Посылки ?? row?.Parcels ?? row?.parcels ?? row?.Packages ?? row?.packages;
            const parcels = Array.isArray(rawParcels)
                ? rawParcels
                : (rawParcels && typeof rawParcels === 'object'
                    ? Object.values(rawParcels as Record<string, any>)
                    : []);
            parcels.forEach((parcel: any) => {
                collectFrom(parcel);
                const goodsRaw = parcel?.Товары ?? parcel?.Goods ?? parcel?.goods;
                if (Array.isArray(goodsRaw)) {
                    goodsRaw.forEach((g) => collectFrom(g));
                } else if (goodsRaw && typeof goodsRaw === 'object') {
                    Object.values(goodsRaw as Record<string, any>).forEach((g) => collectFrom(g));
                }
            });

            if (dates.length === 0) return null;
            return dates.reduce((min, d) => (d.getTime() < min.getTime() ? d : min), dates[0]);
        } catch {
            return null;
        }
    }, [parseDateTimeValue]);
    const cargoCustomerByNumber = useMemo(() => {
        const m = new Map<string, string>();
        (perevozkiItems || []).forEach((c: any) => {
            const raw = String(c?.Number ?? c?.number ?? '').replace(/^0000-/, '').trim();
            if (!raw) return;
            const key = normCargoKey(raw);
            const customer = String(c?.Customer ?? c?.customer ?? c?.Заказчик ?? c?.Контрагент ?? c?.Contractor ?? c?.Organization ?? '').trim();
            if (!customer) return;
            m.set(key, customer);
            if (key !== raw) m.set(raw, customer);
        });
        return m;
    }, [perevozkiItems, normCargoKey]);
    const cargoReceiverByNumber = useMemo(() => {
        const m = new Map<string, string>();
        (perevozkiItems || []).forEach((c: any) => {
            const raw = String(c?.Number ?? c?.number ?? '').replace(/^0000-/, '').trim();
            if (!raw) return;
            const key = normCargoKey(raw);
            const receiver = String(c?.Получатель ?? c?.Грузополучатель ?? c?.Receiver ?? c?.receiver ?? c?.Consignee ?? '').trim();
            if (!receiver) return;
            m.set(key, receiver);
            if (key !== raw) m.set(raw, receiver);
        });
        return m;
    }, [perevozkiItems, normCargoKey]);

    const uniqueCustomers = useMemo(() => [...new Set(items.map(i => ((i.Customer ?? i.customer ?? i.Контрагент ?? i.Contractor ?? i.Organization ?? '').trim())).filter(Boolean))].sort(), [items]);
    const uniqueOrderCustomers = useMemo(
        () => [...new Set((ordersItems || []).map((i: any) => String(i?.ЗаказчикНаименование ?? i?.Заказчик ?? i?.Customer ?? i?.customer ?? i?.Контрагент ?? i?.Contractor ?? i?.Organization ?? i?.ПлательщикНаименование ?? i?.PayerName ?? '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru')),
        [ordersItems]
    );
    const uniqueOrderReceivers = useMemo(
        () => [...new Set((ordersItems || []).map((i: any) => String(i?.ПолучательНаименование ?? i?.Получатель ?? i?.ГрузополучательНаименование ?? i?.Грузополучатель ?? i?.Receiver ?? i?.receiver ?? i?.Consignee ?? '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru')),
        [ordersItems]
    );
    const uniqueOrderSenders = useMemo(
        () => [...new Set((ordersItems || []).map((i: any) => String(i?.ОтправительНаименование ?? i?.Отправитель ?? i?.ГрузоотправительНаименование ?? i?.Грузоотправитель ?? i?.Sender ?? i?.sender ?? i?.Shipper ?? i?.Consignor ?? '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru')),
        [ordersItems]
    );
    const uniqueOrderRoutes = useMemo(() => {
        const set = new Set<string>();
        (ordersItems || []).forEach((item: any) => {
            const fromRaw = String(item?.ПунктОтправкиНаименование ?? item?.ПунктОтправленияНаименование ?? item?.ПунктОтправки ?? item?.ПунктОтправления ?? item?.CitySender ?? '').trim();
            const toRaw = String(item?.ПунктНазначенияНаименование ?? item?.ПунктПолученияНаименование ?? item?.ПунктНазначения ?? item?.ПунктДоставки ?? item?.CityReceiver ?? '').trim();
            const route = [cityToCode(fromRaw) || fromRaw, cityToCode(toRaw) || toRaw].filter(Boolean).join(' – ');
            if (route) set.add(route);
        });
        return [...set].sort((a, b) => a.localeCompare(b, 'ru'));
    }, [ordersItems]);
    const uniqueSendingCustomers = useMemo(() => [...new Set((sendingsItems || []).map((i: any) => ((i.Customer ?? i.customer ?? i.Контрагент ?? i.Contractor ?? i.Organization ?? '').trim())).filter(Boolean))].sort(), [sendingsItems]);

    const uniqueActCustomers = useMemo(() => [...new Set((actsItems || []).map((a: any) => ((a.Customer ?? a.customer ?? a.Контрагент ?? a.Contractor ?? a.Organization ?? '').trim())).filter(Boolean))].sort(), [actsItems]);
    const uniqueSverkiCustomers = useMemo(
        () => [...new Set(sverkiList.map((row) => String(row.customerName || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru')),
        [sverkiList]
    );
    const uniqueDogovorsCustomers = useMemo(
        () => [...new Set(dogovorsList.map((row) => String(row.customerName || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru')),
        [dogovorsList]
    );
    const claimCargoOptions = useMemo(() => {
        const set = new Set<string>();
        (items || []).forEach((item: any) => {
            const number = String(getFirstCargoNumberFromInvoice(item) || '').trim();
            if (number) set.add(number);
        });
        (perevozkiItems || []).forEach((c: any) => {
            const raw = String(c?.Number ?? c?.number ?? '').trim();
            if (raw) set.add(raw);
        });
        return [...set].sort((a, b) => a.localeCompare(b, 'ru'));
    }, [items, perevozkiItems, getFirstCargoNumberFromInvoice]);
    const claimCargoFilteredOptions = useMemo(() => {
        const q = String(claimsCreateCargoNumber || '').trim().toLowerCase();
        if (!q) return claimCargoOptions;
        return claimCargoOptions.filter((opt) => String(opt).toLowerCase().includes(q));
    }, [claimCargoOptions, claimsCreateCargoNumber]);
    useEffect(() => {
        if (!claimsCreateOpen) setClaimsCargoDropdownOpen(false);
    }, [claimsCreateOpen]);
    useEffect(() => {
        if (!claimsCargoDropdownOpen) return;
        const handler = (e: MouseEvent) => {
            if (claimsCargoInputRef.current && !claimsCargoInputRef.current.contains(e.target as Node)) {
                setClaimsCargoDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [claimsCargoDropdownOpen]);
    const [claimsCreateCargoNumberDebounced, setClaimsCreateCargoNumberDebounced] = useState('');
    useEffect(() => {
        const q = String(claimsCreateCargoNumber || '').trim();
        if (!q) {
            setClaimsCreateCargoNumberDebounced('');
            return;
        }
        const t = setTimeout(() => setClaimsCreateCargoNumberDebounced(q), 400);
        return () => clearTimeout(t);
    }, [claimsCreateCargoNumber]);
    useEffect(() => {
        const number = String(claimsCreateCargoNumberDebounced || '').trim();
        if (!number || !auth?.login || !auth?.password) {
            setClaimsAcceptedNomenclatureRows([]);
            setClaimsAcceptedNomenclatureError(null);
            setClaimsAcceptedNomenclatureLoading(false);
            return;
        }
        let cancelled = false;
        setClaimsAcceptedNomenclatureLoading(true);
        setClaimsAcceptedNomenclatureError(null);
        const selectedCargoKey = normCargoKey(number);
        const matchedCargo = (perevozkiItems || []).find((c: any) => {
            const raw = String(c?.Number ?? c?.number ?? '').trim();
            return raw && normCargoKey(raw) === selectedCargoKey;
        });
        const cargoItem = matchedCargo || {
            Number: number,
            CitySender: '',
            CityReceiver: '',
        };
        const numberRaw = number.replace(/^0+/, '') || number;
        const numberForApi = /^\d{5,9}$/.test(numberRaw) ? numberRaw.padStart(9, '0') : number;
        fetchPerevozkaDetails(auth, numberForApi, cargoItem as any)
            .then(({ nomenclature }) => {
                if (cancelled) return;
                const normalized = normalizeAcceptedCargoNomenclatureRows(Array.isArray(nomenclature) ? nomenclature : []);
                setClaimsAcceptedNomenclatureRows(normalized);
            })
            .catch((e: any) => {
                if (cancelled) return;
                setClaimsAcceptedNomenclatureRows([]);
                setClaimsAcceptedNomenclatureError(e?.message || 'Не удалось загрузить номенклатуру принятого груза');
            })
            .finally(() => {
                if (cancelled) return;
                setClaimsAcceptedNomenclatureLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [claimsCreateCargoNumberDebounced, auth?.login, auth?.password, perevozkiItems, normCargoKey, auth]);
    const claimNomenclatureOptions = claimsAcceptedNomenclatureRows;
    useEffect(() => {
        const allowed = new Set(claimNomenclatureOptions.map((row) => row.key));
        setClaimsCreateSelectedPlaceKeys((prev) => prev.filter((k) => allowed.has(k)));
    }, [claimNomenclatureOptions]);
    useEffect(() => {
        if (claimsCreateManipulationSignIds.length === 0 && claimsCreateManipulationPhotoFiles.length > 0) {
            setClaimsCreateManipulationPhotoFiles([]);
        }
    }, [claimsCreateManipulationSignIds, claimsCreateManipulationPhotoFiles.length]);
    useEffect(() => {
        if (claimsCreateType !== 'cargo_damage') {
            if (claimsCreateManipulationSignIds.length > 0) setClaimsCreateManipulationSignIds([]);
            if (claimsCreateManipulationPhotoFiles.length > 0) setClaimsCreateManipulationPhotoFiles([]);
            if (claimsCreatePackagingTypeIds.length > 0) setClaimsCreatePackagingTypeIds([]);
        }
    }, [
        claimsCreateType,
        claimsCreateManipulationSignIds.length,
        claimsCreateManipulationPhotoFiles.length,
        claimsCreatePackagingTypeIds.length,
    ]);

    const uniqueEdoStatuses = useMemo(() => {
        const set = new Set<string>();
        [...items, ...(actsItems || [])].forEach((i: any) => {
            const s = getEdoStatus(i);
            if (s) set.add(s);
        });
        return [...set].sort();
    }, [items, actsItems]);

    const uniqueTransportVehicles = useMemo(() => {
        const set = new Set<string>();
        cargoTransportByNumber.forEach((v) => {
            const normalized = normalizeTransportDisplay(v);
            if (normalized) set.add(normalized);
        });
        return [...set].sort((a, b) => a.localeCompare(b, 'ru'));
    }, [cargoTransportByNumber, normalizeTransportDisplay]);
    const uniqueOrderTransportVehicles = useMemo(() => {
        const set = new Set<string>();
        (ordersItems || []).forEach((item: any) => {
            const v = normalizeTransportDisplay(item?.АвтомобильCMRНаименование ?? item?.AutoReg ?? item?.autoReg ?? item?.AutoType ?? '');
            if (v) set.add(v);
        });
        return [...set].sort((a, b) => a.localeCompare(b, 'ru'));
    }, [ordersItems, normalizeTransportDisplay]);
    const uniqueSendingTransportVehicles = useMemo(() => {
        const set = new Set<string>();
        (sendingsItems || []).forEach((item: any) => {
            const v = normalizeTransportDisplay(item?.АвтомобильCMRНаименование ?? item?.AutoReg ?? item?.autoReg ?? item?.AutoType ?? '');
            if (v) set.add(v);
        });
        return [...set].sort((a, b) => a.localeCompare(b, 'ru'));
    }, [sendingsItems, normalizeTransportDisplay]);
    const uniqueSendingRoutes = useMemo(() => {
        const set = new Set<string>();
        (sendingsItems || []).forEach((item: any) => {
            const from = cityToCode(item?.ПунктОтправленияГородАэропорт ?? item?.CitySender ?? item?.ГородОтправления);
            const to = cityToCode(item?.ПунктНазначенияГородАэропорт ?? item?.CityReceiver ?? item?.ГородНазначения);
            const route = [from, to].filter(Boolean).join(' – ');
            if (route) set.add(route);
        });
        return [...set].sort((a, b) => a.localeCompare(b, 'ru'));
    }, [sendingsItems]);

    const uniqueTariffsRoutes = useMemo(() => {
        const set = new Set<string>();
        const allowedRoutes = new Set(["MSK – KGD", "KGD – MSK"]);
        tariffsList.forEach((t) => {
            const from = cityToCode(t.cityFrom || '') || (t.cityFrom || '');
            const to = cityToCode(t.cityTo || '') || (t.cityTo || '');
            const route = [from, to].filter(Boolean).join(' – ');
            if (route && allowedRoutes.has(route)) set.add(route);
        });
        return [...set].sort((a, b) => a.localeCompare(b, 'ru'));
    }, [tariffsList]);

    const uniqueTariffsCustomers = useMemo(() => {
        const set = new Set<string>();
        tariffsList.forEach((t) => {
            const customer = String(t.customerName || '').trim();
            if (customer) set.add(customer);
        });
        return [...set].sort((a, b) => a.localeCompare(b, 'ru'));
    }, [tariffsList]);

    const uniqueTariffsTypes = useMemo(() => {
        const set = new Set<string>();
        tariffsList.forEach((t) => {
            const type = String(t.transportType || '').trim();
            if (type) set.add(type);
        });
        return [...set].sort((a, b) => a.localeCompare(b, 'ru'));
    }, [tariffsList]);

    const toggleInvoiceFavorite = useCallback((invNum: string | undefined) => {
        if (!invNum) return;
        try {
            const raw = typeof localStorage !== 'undefined' && localStorage.getItem('haulz.invoiceFavorites');
            const arr: string[] = raw ? JSON.parse(raw) : [];
            const set = new Set(arr);
            if (set.has(invNum)) set.delete(invNum);
            else set.add(invNum);
            localStorage.setItem('haulz.invoiceFavorites', JSON.stringify([...set]));
            setFavVersion(v => v + 1);
        } catch {}
    }, []);

    const isInvoiceFavorite = useCallback((invNum: string | undefined): boolean => {
        if (!invNum) return false;
        try {
            const raw = typeof localStorage !== 'undefined' && localStorage.getItem('haulz.invoiceFavorites');
            const arr: string[] = raw ? JSON.parse(raw) : [];
            return arr.includes(invNum);
        } catch { return false; }
    }, []);

    const filteredItems = useMemo(() => {
        return buildFilteredInvoices({
            items,
            activeInn: effectiveActiveInn,
            useServiceRequest: effectiveServiceMode,
            customerFilter,
            statusFilterSet,
            typeFilter,
            routeFilter,
            deliveryStatusFilterSet,
            routeFilterCargo,
            transportFilter,
            searchText: effectiveSearchText,
            edoStatusFilterSet,
            sortBy,
            sortOrder,
            isInvoiceFavorite,
            getFirstCargoNumberFromInvoice,
            cargoStateByNumber,
            cargoRouteByNumber,
            cargoTransportByNumber,
        });
    }, [items, effectiveActiveInn, effectiveServiceMode, customerFilter, statusFilterSet, typeFilter, routeFilter, sortBy, sortOrder, favVersion, isInvoiceFavorite, deliveryStatusFilterSet, routeFilterCargo, transportFilter, effectiveSearchText, edoStatusFilterSet, getFirstCargoNumberFromInvoice, cargoStateByNumber, cargoRouteByNumber, cargoTransportByNumber, normCargoKey]);

    const documentsSummary = useMemo(() => buildDocsSummary(filteredItems), [filteredItems]);

    const sortedActs = useMemo(() => {
        const list = [...(actsItems || [])];
        const getDate = (a: any) => (a.DateDoc ?? a.Date ?? a.date ?? '').toString();
        list.sort((a, b) => {
            const cmp = getDate(a).localeCompare(getDate(b));
            return sortOrder === 'desc' ? -cmp : cmp;
        });
        return list;
    }, [actsItems, sortOrder]);

    const filteredActs = useMemo(() => {
        return buildFilteredActs({
            sortedActs,
            activeInn: effectiveActiveInn,
            useServiceRequest: effectiveServiceMode,
            actCustomerFilter,
            searchText: effectiveSearchText,
            edoStatusFilterSet,
            transportFilter,
            getFirstCargoNumberFromInvoice,
            cargoTransportByNumber,
        });
    }, [sortedActs, effectiveActiveInn, effectiveServiceMode, actCustomerFilter, effectiveSearchText, edoStatusFilterSet, transportFilter, getFirstCargoNumberFromInvoice, cargoTransportByNumber, normCargoKey]);

    const actsSummary = useMemo(() => buildActsSummary(filteredActs), [filteredActs]);
    const filteredOrders = useMemo(() => {
        const base = buildFilteredOrders({
            items: ordersItems || [],
            activeInn: effectiveActiveInn,
            useServiceRequest: effectiveServiceMode,
            customerFilter,
            typeFilter,
            routeFilter,
            deliveryStatusFilterSet,
            routeFilterCargo,
            transportFilter: '',
            searchText: effectiveSearchText,
            sortBy,
            sortOrder,
        });
        return base.filter((i: any) => {
            if (orderReceiverFilter && String(i?.ПолучательНаименование ?? i?.Получатель ?? i?.ГрузополучательНаименование ?? i?.Грузополучатель ?? i?.Receiver ?? i?.receiver ?? i?.Consignee ?? '').trim() !== orderReceiverFilter) return false;
            if (orderSenderFilter && String(i?.ОтправительНаименование ?? i?.Отправитель ?? i?.ГрузоотправительНаименование ?? i?.Грузоотправитель ?? i?.Sender ?? i?.sender ?? i?.Shipper ?? i?.Consignor ?? '').trim() !== orderSenderFilter) return false;
            if (orderRouteFilter !== 'all') {
                const fromRaw = String(i?.ПунктОтправкиНаименование ?? i?.ПунктОтправленияНаименование ?? i?.ПунктОтправки ?? i?.ПунктОтправления ?? i?.CitySender ?? '').trim();
                const toRaw = String(i?.ПунктНазначенияНаименование ?? i?.ПунктПолученияНаименование ?? i?.ПунктНазначения ?? i?.ПунктДоставки ?? i?.CityReceiver ?? '').trim();
                const route = [cityToCode(fromRaw) || fromRaw, cityToCode(toRaw) || toRaw].filter(Boolean).join(' – ');
                if (route !== orderRouteFilter) return false;
            }
            return true;
        });
    }, [ordersItems, effectiveActiveInn, effectiveServiceMode, customerFilter, typeFilter, routeFilter, deliveryStatusFilterSet, routeFilterCargo, effectiveSearchText, sortBy, sortOrder, orderReceiverFilter, orderSenderFilter, orderRouteFilter]);
    const ordersSummary = useMemo(() => buildDocsSummary(filteredOrders), [filteredOrders]);
    const filteredSendings = useMemo(() => {
        return buildFilteredOrders({
            items: sendingsItems || [],
            activeInn: effectiveActiveInn,
            useServiceRequest: true,
            customerFilter,
            typeFilter,
            routeFilter,
            deliveryStatusFilterSet: new Set<StatusFilter>(),
            routeFilterCargo,
            transportFilter,
            searchText: effectiveSearchText,
            sortBy,
            sortOrder,
        });
    }, [sendingsItems, effectiveActiveInn, customerFilter, typeFilter, routeFilter, routeFilterCargo, transportFilter, effectiveSearchText, sortBy, sortOrder]);
    const sendingsSummary = useMemo(() => buildDocsSummary(filteredSendings), [filteredSendings]);
    const filteredTariffs = useMemo(() => {
        const placeCode = (value: string) => cityToCode(value || '') || (value || '');
        const allowedRoutes = new Set(["MSK – KGD", "KGD – MSK"]);
        const fromDate = new Date(`${apiDateRange.dateFrom}T00:00:00`);
        const toDate = new Date(`${apiDateRange.dateTo}T23:59:59`);
        const list = tariffsList.filter((t) => {
            if (t.isVet) return false;
            if (effectiveServiceMode && tariffsCustomerFilter && String(t.customerName || '').trim() !== tariffsCustomerFilter) return false;
            const route = [
                placeCode(t.cityFrom || ''),
                placeCode(t.cityTo || ''),
            ].filter(Boolean).join(' – ');
            if (!allowedRoutes.has(route)) return false;
            if (tariffsRouteFilter !== 'all' && route !== tariffsRouteFilter) return false;
            if (tariffsTypeFilter !== 'all' && String(t.transportType || '').trim() !== tariffsTypeFilter) return false;
            if (!t.docDate) return true;
            const d = new Date(t.docDate);
            return d >= fromDate && d <= toDate;
        });

        const getVal = (t: typeof tariffsList[number]) => {
            switch (tariffsSortColumn) {
                case "docDate": return t.docDate ? new Date(t.docDate).getTime() : 0;
                case "docNumber": return t.docNumber || "";
                case "customerName": return t.customerName || "";
                case "cityFrom": return placeCode(t.cityFrom || "");
                case "cityTo": return placeCode(t.cityTo || "");
                case "transportType": return t.transportType || "";
                case "dangerous": return t.isDangerous ? 1 : 0;
                case "tariff": return Number(t.tariff ?? 0);
                default: return "";
            }
        };

        const sorted = [...list].sort((a, b) => {
            const va = getVal(a);
            const vb = getVal(b);
            const cmp = typeof va === "number" && typeof vb === "number"
                ? va - vb
                : String(va).localeCompare(String(vb), 'ru', { numeric: true });
            return tariffsSortOrder === "asc" ? cmp : -cmp;
        });

        // Collapse duplicates with same tariff/type/OG/from/to.
        const seen = new Set<string>();
        const collapsed: typeof sorted = [];
        for (const t of sorted) {
            const key = [
                placeCode(t.cityFrom || ""),
                placeCode(t.cityTo || ""),
                String(t.transportType || "").trim().toLowerCase(),
                t.isDangerous ? "1" : "0",
                Number(t.tariff ?? 0).toFixed(4),
            ].join("|");
            if (seen.has(key)) continue;
            seen.add(key);
            collapsed.push(t);
        }
        return collapsed;
    }, [tariffsList, effectiveServiceMode, tariffsCustomerFilter, tariffsRouteFilter, tariffsTypeFilter, tariffsSortColumn, tariffsSortOrder, apiDateRange.dateFrom, apiDateRange.dateTo]);
    const filteredSverki = useMemo(() => {
        const fromDate = new Date(`${apiDateRange.dateFrom}T00:00:00`);
        const toDate = new Date(`${apiDateRange.dateTo}T23:59:59`);
        return sverkiList.filter((row) => {
            if (effectiveServiceMode && sverkiCustomerFilter && String(row.customerName || '').trim() !== sverkiCustomerFilter) return false;
            if (!row.docDate) return true;
            const d = new Date(row.docDate);
            return d >= fromDate && d <= toDate;
        });
    }, [sverkiList, apiDateRange.dateFrom, apiDateRange.dateTo, effectiveServiceMode, sverkiCustomerFilter]);
    const downloadSverkaFile = useCallback(async (row: { id: number; docNumber: string; docDate: string | null }) => {
        const number = String(row.docNumber || '').trim();
        const docDateRaw = row.docDate;
        const dateDoc = docDateRaw
            ? (() => {
                const d = new Date(docDateRaw);
                if (isNaN(d.getTime())) return '';
                const y = d.getFullYear();
                const m = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                return `${y}-${m}-${day}T00:00:00`;
            })()
            : '';
        if (!number || !dateDoc) return;
        setSverkiDownloadingId(row.id);
        setSverkiDownloadError(null);
        try {
            const res = await fetch('/api/download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ metod: 'АктСверки', number, dateDoc }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data?.message || data?.error || 'Не удалось получить документ');
            if (!data?.data) throw new Error('Документ не найден');
            const binary = atob(String(data.data));
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
            const blob = new Blob([bytes], { type: 'application/pdf' });
            const href = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = href;
            a.download = String(data?.name || `АктСверки_${number}.pdf`);
            a.click();
            URL.revokeObjectURL(href);
        } catch (e: unknown) {
            setSverkiDownloadError((e as Error)?.message || 'Ошибка скачивания');
        } finally {
            setSverkiDownloadingId(null);
        }
    }, []);
    const filteredDogovors = useMemo(() => {
        const fromDate = new Date(`${apiDateRange.dateFrom}T00:00:00`);
        const toDate = new Date(`${apiDateRange.dateTo}T23:59:59`);
        return dogovorsList.filter((row) => {
            if (effectiveServiceMode && dogovorsCustomerFilter && String(row.customerName || '').trim() !== dogovorsCustomerFilter) return false;
            if (!row.docDate) return true;
            const d = new Date(row.docDate);
            return d >= fromDate && d <= toDate;
        });
    }, [dogovorsList, apiDateRange.dateFrom, apiDateRange.dateTo, effectiveServiceMode, dogovorsCustomerFilter]);
    const filteredClaims = useMemo(() => {
        const fromDate = new Date(`${apiDateRange.dateFrom}T00:00:00`);
        const toDate = new Date(`${apiDateRange.dateTo}T23:59:59`);
        return claimsList.filter((row) => {
            if (!row.createdAt) return true;
            const d = new Date(row.createdAt);
            return d >= fromDate && d <= toDate;
        });
    }, [claimsList, apiDateRange.dateFrom, apiDateRange.dateTo]);
    const claimDetailStatusKey = useMemo(
        () => String(claimsDetailData?.claim?.status || 'new') as ClaimStatusKey,
        [claimsDetailData?.claim?.status]
    );
    const claimDetailStatusStyle = useMemo(
        () => CLAIM_STATUS_BADGE[claimDetailStatusKey] || CLAIM_STATUS_BADGE.new,
        [claimDetailStatusKey]
    );
    const claimCustomerPayload = useMemo(
        () => extractCustomerClaimPayloadFromEvents(Array.isArray(claimsDetailData?.events) ? claimsDetailData.events : []),
        [claimsDetailData?.events]
    );
    const latestSverkiRequest = useMemo(() => sverkiRequests[0] || null, [sverkiRequests]);
    const sverkiStatusBadge = useMemo(() => {
        if (!latestSverkiRequest) return null;
        if (latestSverkiRequest.status === 'edo_sent') {
            return { label: 'Отправлена в ЭДО', bg: 'rgba(16,185,129,0.15)', color: '#10b981' };
        }
        return { label: 'Ожидает формирования', bg: 'rgba(59,130,246,0.15)', color: '#3b82f6' };
    }, [latestSverkiRequest]);
    const getSendingStatusKey = useCallback((row: any): StatusFilter => {
        const rawParcels = row?.Посылки ?? row?.Parcels ?? row?.parcels ?? row?.Packages ?? row?.packages;
        const firstParcel = Array.isArray(rawParcels)
            ? rawParcels[0]
            : (rawParcels && typeof rawParcels === 'object'
                ? Object.values(rawParcels as Record<string, any>)[0]
                : undefined);
        const cargoNumber = String(
            row?.НомерПеревозки
            ?? row?.Перевозка
            ?? row?.CargoNumber
            ?? row?.NumberPerevozki
            ?? (firstParcel as any)?.Перевозка
            ?? ''
        ).trim();
        const cargoStatus = cargoNumber ? cargoStateByNumber.get(normCargoKey(cargoNumber)) : undefined;
        return getFilterKeyByStatus(
            String(
                cargoStatus
                ?? row?.State
                ?? row?.state
                ?? row?.Статус
                ?? row?.Status
                ?? row?.StatusName
                ?? ''
            )
        );
    }, [cargoStateByNumber, normCargoKey]);

    const groupedByCustomer = useMemo(() => {
        const map = new Map<string, { customer: string; items: any[]; sum: number }>();
        filteredItems.forEach(inv => {
            const key = (inv.Customer ?? inv.customer ?? inv.Контрагент ?? inv.Contractor ?? inv.Organization ?? '').trim() || '—';
            const v = inv.SumDoc ?? inv.Sum ?? inv.sum ?? inv.Сумма ?? inv.Amount ?? 0;
            const sum = typeof v === 'string' ? parseFloat(v) || 0 : (v || 0);
            const existing = map.get(key);
            if (existing) {
                existing.items.push(inv);
                existing.sum += sum;
            } else map.set(key, { customer: key, items: [inv], sum });
        });
        return Array.from(map.entries()).map(([, v]) => v);
    }, [filteredItems]);

    const sortedGroupedByCustomer = useMemo(() => {
        const key = (row: { customer: string; sum: number; items: any[] }) =>
            tableSortColumn === 'customer' ? (stripOoo(row.customer) || '').toLowerCase() : tableSortColumn === 'sum' ? row.sum : row.items.length;
        return [...groupedByCustomer].sort((a, b) => {
            const va = key(a);
            const vb = key(b);
            const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
            return tableSortOrder === 'asc' ? cmp : -cmp;
        });
    }, [groupedByCustomer, tableSortColumn, tableSortOrder]);

    const groupedActsByCustomer = useMemo(() => {
        const map = new Map<string, { customer: string; items: any[]; sum: number }>();
        filteredActs.forEach((act: any) => {
            const key = (act.Customer ?? act.customer ?? act.Контрагент ?? act.Contractor ?? act.Organization ?? '').trim() || '—';
            const v = act.SumDoc ?? act.Sum ?? act.sum ?? 0;
            const sum = typeof v === 'string' ? parseFloat(v) || 0 : (v || 0);
            const existing = map.get(key);
            if (existing) {
                existing.items.push(act);
                existing.sum += sum;
            } else map.set(key, { customer: key, items: [act], sum });
        });
        return Array.from(map.entries()).map(([, v]) => v);
    }, [filteredActs]);

    const sortedGroupedActsByCustomer = useMemo(() => {
        const key = (row: { customer: string; sum: number; items: any[] }) =>
            tableSortColumn === 'customer' ? (stripOoo(row.customer) || '').toLowerCase() : tableSortColumn === 'sum' ? row.sum : row.items.length;
        return [...groupedActsByCustomer].sort((a, b) => {
            const va = key(a);
            const vb = key(b);
            const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
            return tableSortOrder === 'asc' ? cmp : -cmp;
        });
    }, [groupedActsByCustomer, tableSortColumn, tableSortOrder]);
    const groupedOrdersByCustomer = useMemo(() => {
        const map = new Map<string, { customer: string; items: any[]; sum: number }>();
        filteredOrders.forEach((order: any) => {
            const key = (order.Customer ?? order.customer ?? order.Контрагент ?? order.Contractor ?? order.Organization ?? '').trim() || '—';
            const v = order.Sum ?? order.sum ?? order.Сумма ?? order.Amount ?? 0;
            const sum = typeof v === 'string' ? parseFloat(v) || 0 : (v || 0);
            const existing = map.get(key);
            if (existing) {
                existing.items.push(order);
                existing.sum += sum;
            } else map.set(key, { customer: key, items: [order], sum });
        });
        return Array.from(map.entries()).map(([, v]) => v);
    }, [filteredOrders]);
    const sortedGroupedOrdersByCustomer = useMemo(() => {
        const key = (row: { customer: string; sum: number; items: any[] }) =>
            tableSortColumn === 'customer' ? (stripOoo(row.customer) || '').toLowerCase() : tableSortColumn === 'sum' ? row.sum : row.items.length;
        return [...groupedOrdersByCustomer].sort((a, b) => {
            const va = key(a);
            const vb = key(b);
            const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
            return tableSortOrder === 'asc' ? cmp : -cmp;
        });
    }, [groupedOrdersByCustomer, tableSortColumn, tableSortOrder]);
    const groupedSendingsByCustomer = useMemo(() => {
        const map = new Map<string, { customer: string; items: any[]; sum: number }>();
        filteredSendings.forEach((sending: any) => {
            const key = (sending.Customer ?? sending.customer ?? sending.Контрагент ?? sending.Contractor ?? sending.Organization ?? '').trim() || '—';
            const v = sending.Sum ?? sending.sum ?? sending.Сумма ?? sending.Amount ?? 0;
            const sum = typeof v === 'string' ? parseFloat(v) || 0 : (v || 0);
            const existing = map.get(key);
            if (existing) {
                existing.items.push(sending);
                existing.sum += sum;
            } else map.set(key, { customer: key, items: [sending], sum });
        });
        return Array.from(map.entries()).map(([, v]) => v);
    }, [filteredSendings]);
    const sortedGroupedSendingsByCustomer = useMemo(() => {
        const key = (row: { customer: string; sum: number; items: any[] }) =>
            tableSortColumn === 'customer' ? (stripOoo(row.customer) || '').toLowerCase() : tableSortColumn === 'sum' ? row.sum : row.items.length;
        return [...groupedSendingsByCustomer].sort((a, b) => {
            const va = key(a);
            const vb = key(b);
            const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
            return tableSortOrder === 'asc' ? cmp : -cmp;
        });
    }, [groupedSendingsByCustomer, tableSortColumn, tableSortOrder]);

    const handleTableSort = (column: 'customer' | 'sum' | 'count') => {
        if (tableSortColumn === column) setTableSortOrder(o => o === 'asc' ? 'desc' : 'asc');
        else { setTableSortColumn(column); setTableSortOrder('asc'); }
    };

    const handleInnerTableSort = (column: 'number' | 'date' | 'status' | 'sum' | 'deliveryStatus' | 'route') => {
        if (innerTableSortColumn === column) setInnerTableSortOrder(o => o === 'asc' ? 'desc' : 'asc');
        else { setInnerTableSortColumn(column); setInnerTableSortOrder(column === 'date' ? 'desc' : 'asc'); }
    };

    const handleInnerTableActSort = (column: 'number' | 'date' | 'invoice' | 'sum') => {
        if (innerTableActSortColumn === column) setInnerTableActSortOrder(o => o === 'asc' ? 'desc' : 'asc');
        else { setInnerTableActSortColumn(column); setInnerTableActSortOrder(column === 'date' ? 'desc' : 'asc'); }
    };

    const sortActs = useCallback((acts: any[]) => {
        const getNum = (a: any) => (a.Number ?? a.number ?? '').toString().replace(/^0000-/, '');
        const getDate = (a: any) => (a.DateDoc ?? a.Date ?? a.date ?? '').toString();
        const getInvoice = (a: any) => (a.Invoice ?? a.invoice ?? a.Счёт ?? '').toString();
        const getSum = (a: any) => Number(a.SumDoc ?? a.Sum ?? a.sum ?? 0) || 0;
        return [...acts].sort((a, b) => {
            let cmp = 0;
            switch (innerTableActSortColumn) {
                case 'number': cmp = (getNum(a) || '').localeCompare(getNum(b) || '', undefined, { numeric: true }); break;
                case 'date': cmp = (getDate(a) || '').localeCompare(getDate(b) || ''); break;
                case 'invoice': cmp = (getInvoice(a) || '').localeCompare(getInvoice(b) || '', undefined, { numeric: true }); break;
                case 'sum': cmp = getSum(a) - getSum(b); break;
            }
            return innerTableActSortOrder === 'asc' ? cmp : -cmp;
        });
    }, [innerTableActSortColumn, innerTableActSortOrder]);

    const sortInvoices = useCallback((items: any[]) => {
        const getNum = (inv: any) => (inv.Number ?? inv.number ?? inv.Номер ?? inv.N ?? '').toString().replace(/^0000-/, '');
        const getDate = (inv: any) => (inv.DateDoc ?? inv.Date ?? inv.date ?? inv.Дата ?? '').toString();
        const getStatus = (inv: any) => normalizeInvoiceStatus(inv.Status ?? inv.State ?? inv.state ?? inv.Статус ?? inv.status ?? inv.PaymentStatus ?? '');
        const getSum = (inv: any) => Number(inv.SumDoc ?? inv.Sum ?? inv.sum ?? inv.Сумма ?? inv.Amount ?? 0) || 0;
        const getDeliveryState = (inv: any) => {
            const num = getFirstCargoNumberFromInvoice(inv);
            return (num ? cargoStateByNumber.get(normCargoKey(num)) : undefined) ?? '';
        };
        const getRoute = (inv: any) => {
            const num = getFirstCargoNumberFromInvoice(inv);
            return (num ? cargoRouteByNumber.get(normCargoKey(num)) : undefined) ?? '';
        };
        return [...items].sort((a, b) => {
            let cmp = 0;
            switch (innerTableSortColumn) {
                case 'number': cmp = (getNum(a) || '').localeCompare(getNum(b) || '', undefined, { numeric: true }); break;
                case 'date': cmp = (getDate(a) || '').localeCompare(getDate(b) || ''); break;
                case 'status': cmp = (getStatus(a) || '').localeCompare(getStatus(b) || ''); break;
                case 'sum': cmp = getSum(a) - getSum(b); break;
                case 'deliveryStatus': cmp = (getDeliveryState(a) || '').localeCompare(getDeliveryState(b) || ''); break;
                case 'route': cmp = (getRoute(a) || '').localeCompare(getRoute(b) || ''); break;
            }
            return innerTableSortOrder === 'asc' ? cmp : -cmp;
        });
    }, [innerTableSortColumn, innerTableSortOrder, getFirstCargoNumberFromInvoice, cargoStateByNumber, cargoRouteByNumber, normCargoKey]);
    const sortOrders = useCallback((items: any[]) => {
        const getNum = (row: any) => (row.Number ?? row.number ?? row.Номер ?? row.N ?? '').toString().replace(/^0000-/, '');
        const getDate = (row: any) => (row.DateZayavki ?? row.DateOtpr ?? row.DateSend ?? row.DatePrih ?? row.DateVr ?? row.DateDoc ?? row.Date ?? row.date ?? '').toString();
        const getStatus = (row: any) => normalizeStatus(row.State ?? row.state ?? row.Статус ?? '');
        const getSum = (row: any) => Number(row.Sum ?? row.sum ?? row.Сумма ?? row.Amount ?? 0) || 0;
        const getRoute = (row: any) => [cityToCode(row.CitySender), cityToCode(row.CityReceiver)].filter(Boolean).join(' – ') || '';
        return [...items].sort((a, b) => {
            let cmp = 0;
            switch (innerTableSortColumn) {
                case 'number': cmp = (getNum(a) || '').localeCompare(getNum(b) || '', undefined, { numeric: true }); break;
                case 'date': cmp = (getDate(a) || '').localeCompare(getDate(b) || ''); break;
                case 'status':
                case 'deliveryStatus': cmp = (getStatus(a) || '').localeCompare(getStatus(b) || ''); break;
                case 'sum': cmp = getSum(a) - getSum(b); break;
                case 'route': cmp = (getRoute(a) || '').localeCompare(getRoute(b) || ''); break;
            }
            return innerTableSortOrder === 'asc' ? cmp : -cmp;
        });
    }, [innerTableSortColumn, innerTableSortOrder]);
    const isRequestJournalSection = docSection === 'Заявки' || docSection === 'Отправки';
    const tableModeEffective = isRequestJournalSection ? true : tableModeByCustomer;
    const orderRowsSorted = useMemo(() => {
        const getDate = (row: any) => String(row?.Дата ?? row?.DateZayavki ?? row?.Date ?? row?.date ?? "");
        const getNumber = (row: any) => String(row?.НомерЗаявки ?? row?.Номер ?? row?.Number ?? row?.number ?? row?.N ?? "");
        const getClientNumber = (row: any) => String(row?.НомерЗаявкиКлиента ?? row?.ClientRequestNumber ?? "");
        const getPickupDate = (row: any) => String(row?.ДатаЗабораПлан ?? row?.PickupDatePlan ?? "");
        const getSender = (row: any) => String(row?.ОтправительНаименование ?? row?.Отправитель ?? row?.ГрузоотправительНаименование ?? row?.Грузоотправитель ?? row?.Sender ?? row?.sender ?? row?.Shipper ?? row?.Consignor ?? "");
        const getReceiver = (row: any) => String(row?.ПолучательНаименование ?? row?.Получатель ?? row?.ГрузополучательНаименование ?? row?.Грузополучатель ?? row?.Receiver ?? row?.receiver ?? row?.Consignee ?? "");
        const getCustomer = (row: any) => String(row?.ЗаказчикНаименование ?? row?.Заказчик ?? row?.Customer ?? row?.customer ?? row?.Контрагент ?? row?.Contractor ?? row?.Organization ?? row?.ПлательщикНаименование ?? row?.PayerName ?? "");
        const getComment = (row: any) => String(row?.Комментарий ?? row?.Comment ?? row?.Примечание ?? row?.Note ?? "");
        const getCargo = (row: any) => {
            const rawParcels = row?.Посылки ?? row?.Parcels ?? row?.parcels ?? row?.Packages ?? row?.packages;
            const firstParcel = Array.isArray(rawParcels)
                ? rawParcels[0]
                : (rawParcels && typeof rawParcels === 'object'
                    ? Object.values(rawParcels as Record<string, any>)[0]
                    : undefined);
            return String(row?.НомерПеревозки ?? row?.Перевозка ?? row?.CargoNumber ?? row?.NumberPerevozki ?? (firstParcel as any)?.Перевозка ?? "");
        };
        const getRoute = (row: any) => {
            const from = String(row?.ПунктОтправкиНаименование ?? row?.ПунктОтправленияНаименование ?? row?.ПунктОтправки ?? row?.ПунктОтправления ?? row?.CitySender ?? '').trim();
            const to = String(row?.ПунктНазначенияНаименование ?? row?.ПунктПолученияНаименование ?? row?.ПунктНазначения ?? row?.ПунктДоставки ?? row?.CityReceiver ?? '').trim();
            return [cityToCode(from) || from, cityToCode(to) || to].filter(Boolean).join(' – ');
        };
        return [...filteredOrders].sort((a, b) => {
            let cmp = 0;
            switch (ordersSortColumn) {
                case 'date': cmp = getDate(a).localeCompare(getDate(b)); break;
                case 'number': cmp = getNumber(a).localeCompare(getNumber(b), undefined, { numeric: true }); break;
                case 'clientNumber': cmp = getClientNumber(a).localeCompare(getClientNumber(b), undefined, { numeric: true }); break;
                case 'pickupDate': cmp = getPickupDate(a).localeCompare(getPickupDate(b)); break;
                case 'cargo': cmp = getCargo(a).localeCompare(getCargo(b), undefined, { numeric: true }); break;
                case 'sender': cmp = getSender(a).localeCompare(getSender(b)); break;
                case 'receiver': cmp = getReceiver(a).localeCompare(getReceiver(b)); break;
                case 'route': cmp = getRoute(a).localeCompare(getRoute(b)); break;
                case 'customer': cmp = getCustomer(a).localeCompare(getCustomer(b)); break;
                case 'comment': cmp = getComment(a).localeCompare(getComment(b)); break;
            }
            return ordersSortOrder === 'asc' ? cmp : -cmp;
        });
    }, [filteredOrders, ordersSortColumn, ordersSortOrder]);
    const sendingRowsSorted = useMemo(() => {
        const statusFilteredRows = deliveryStatusFilterSet.size > 0
            ? filteredSendings.filter((row: any) => deliveryStatusFilterSet.has(getSendingStatusKey(row)))
            : filteredSendings;
        const getDate = (row: any) => String(row?.Дата ?? row?.Date ?? row?.date ?? "");
        const getNumber = (row: any) => String(row?.Номер ?? row?.Number ?? row?.number ?? "");
        const getRoute = (row: any) => {
            const routeFrom = String(row?.ПунктОтправленияГородАэропорт ?? row?.CitySender ?? row?.ГородОтправления ?? '').trim();
            const routeTo = String(row?.ПунктНазначенияГородАэропорт ?? row?.CityReceiver ?? row?.ГородНазначения ?? '').trim();
            return [cityToCode(routeFrom), cityToCode(routeTo)].filter(Boolean).join(' – ') || [routeFrom, routeTo].filter(Boolean).join(' – ') || '';
        };
        const getType = (row: any) => {
            const vehicle = normalizeTransportDisplay(row?.АвтомобильCMRНаименование ?? row?.AutoReg ?? row?.AutoType ?? "");
            const hasPlate = /[A-ZА-Я][0-9]{3}[A-ZА-Я]{2}(?:\s*\/?\s*[0-9]{2,3})?/u.test(vehicle.toUpperCase());
            return hasPlate ? 'авто' : 'паром';
        };
        const getTransitHours = (row: any) => getSendingTransitHours(row) ?? -1;
        const getVehicle = (row: any) => normalizeTransportDisplay(row?.АвтомобильCMRНаименование ?? row?.AutoReg ?? row?.AutoType ?? "");
        const getComment = (row: any) => String(row?.Комментарий ?? row?.Comment ?? "");
        return [...statusFilteredRows].sort((a, b) => {
            let cmp = 0;
            switch (sendingsSortColumn) {
                case 'date':
                    cmp = getDate(a).localeCompare(getDate(b));
                    break;
                case 'number':
                    cmp = getNumber(a).localeCompare(getNumber(b), undefined, { numeric: true });
                    break;
                case 'route':
                    cmp = getRoute(a).localeCompare(getRoute(b));
                    break;
                case 'type':
                    cmp = getType(a).localeCompare(getType(b));
                    break;
                case 'transitHours':
                    cmp = getTransitHours(a) - getTransitHours(b);
                    break;
                case 'vehicle':
                    cmp = getVehicle(a).localeCompare(getVehicle(b));
                    break;
                case 'comment':
                    cmp = getComment(a).localeCompare(getComment(b));
                    break;
            }
            return sendingsSortOrder === 'asc' ? cmp : -cmp;
        });
    }, [filteredSendings, deliveryStatusFilterSet, getSendingStatusKey, sendingsSortColumn, sendingsSortOrder, normalizeTransportDisplay, getSendingTransitHours]);
    const sendingsInfographic = useMemo(() => {
        let ferry = 0;
        let auto = 0;
        const byRoute = new Map<string, number>();
        const statusCounts: Record<'in_transit' | 'ready' | 'delivering' | 'delivered', number> = {
            in_transit: 0,
            ready: 0,
            delivering: 0,
            delivered: 0,
        };
        sendingRowsSorted.forEach((row: any) => {
            const vehicle = normalizeTransportDisplay(row?.АвтомобильCMRНаименование ?? row?.AutoReg ?? row?.AutoType ?? "");
            const hasPlate = /[A-ZА-Я][0-9]{3}[A-ZА-Я]{2}(?:\s*\/?\s*[0-9]{2,3})?/u.test(vehicle.toUpperCase());
            if (hasPlate) auto += 1;
            else ferry += 1;
            const statusKey = getSendingStatusKey(row);
            if (statusKey === 'in_transit' || statusKey === 'ready' || statusKey === 'delivering' || statusKey === 'delivered') {
                statusCounts[statusKey] += 1;
            }
            const routeFrom = String(row?.ПунктОтправленияГородАэропорт ?? row?.CitySender ?? row?.ГородОтправления ?? '').trim();
            const routeTo = String(row?.ПунктНазначенияГородАэропорт ?? row?.CityReceiver ?? row?.ГородНазначения ?? '').trim();
            const route = [cityToCode(routeFrom), cityToCode(routeTo)].filter(Boolean).join(' – ') || [routeFrom, routeTo].filter(Boolean).join(' – ') || '—';
            byRoute.set(route, (byRoute.get(route) ?? 0) + 1);
        });
        const knownTotal = statusCounts.in_transit + statusCounts.ready + statusCounts.delivering + statusCounts.delivered;
        const total = knownTotal || 1;
        const statusBadges = [
            { key: 'in_transit', label: STATUS_MAP.in_transit, count: statusCounts.in_transit, color: '#2563eb', bg: 'rgba(37,99,235,0.12)' },
            { key: 'ready', label: STATUS_MAP.ready, count: statusCounts.ready, color: '#7c3aed', bg: 'rgba(124,58,237,0.12)' },
            { key: 'delivering', label: STATUS_MAP.delivering, count: statusCounts.delivering, color: '#d97706', bg: 'rgba(217,119,6,0.12)' },
            { key: 'delivered', label: STATUS_MAP.delivered, count: statusCounts.delivered, color: '#16a34a', bg: 'rgba(22,163,74,0.12)' },
        ]
            .filter((s) => s.count > 0)
            .map((s) => ({ ...s, percent: Math.round((s.count / total) * 1000) / 10 }));
        const routes = [...byRoute.entries()]
            .map(([route, count]) => ({ route, count }))
            .sort((a, b) => b.count - a.count || a.route.localeCompare(b.route, 'ru'));
        return { ferry, auto, routes, statusBadges };
    }, [sendingRowsSorted, normalizeTransportDisplay, getSendingStatusKey]);
    const handleSendingsSort = useCallback((column: 'date' | 'number' | 'route' | 'type' | 'transitHours' | 'vehicle' | 'comment') => {
        if (sendingsSortColumn === column) {
            setSendingsSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
            return;
        }
        setSendingsSortColumn(column);
        setSendingsSortOrder(column === 'date' ? 'desc' : 'asc');
    }, [sendingsSortColumn]);
    const handleSendingsSummarySort = useCallback((column: 'index' | 'cargo' | 'status' | 'count' | 'volume' | 'weight' | 'paidWeight' | 'customer' | 'density') => {
        if (sendingsSummarySortColumn === column) {
            setSendingsSummarySortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
            return;
        }
        setSendingsSummarySortColumn(column);
        setSendingsSummarySortOrder(column === 'index' ? 'asc' : 'desc');
    }, [sendingsSummarySortColumn]);
    const handleOrdersSort = useCallback((column: 'date' | 'number' | 'clientNumber' | 'pickupDate' | 'cargo' | 'sender' | 'receiver' | 'route' | 'customer' | 'comment') => {
        if (ordersSortColumn === column) {
            setOrdersSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
            return;
        }
        setOrdersSortColumn(column);
        setOrdersSortOrder(column === 'date' || column === 'pickupDate' ? 'desc' : 'asc');
    }, [ordersSortColumn]);
    const handleOrdersParcelsSort = useCallback((column: 'parcel' | 'cargo' | 'tmc' | 'consolidation' | 'count' | 'cost') => {
        if (ordersParcelsSortColumn === column) {
            setOrdersParcelsSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
            return;
        }
        setOrdersParcelsSortColumn(column);
        setOrdersParcelsSortOrder('asc');
    }, [ordersParcelsSortColumn]);
    const getRequestParcels = useCallback((row: any): any[] => {
        const raw = row?.Посылки ?? row?.Parcels ?? row?.parcels ?? row?.Packages ?? row?.packages;
        if (Array.isArray(raw)) return raw;
        if (typeof raw === "string" && raw.trim()) {
            try {
                const parsed = JSON.parse(raw);
                return Array.isArray(parsed) ? parsed : [];
            } catch {
                return [];
            }
        }
        return [];
    }, []);
    const getSendingRowKey = useCallback((row: any, idx: number): string => {
        const number = String(row?.Номер ?? row?.Number ?? row?.number ?? '').trim();
        return number || `${idx}`;
    }, []);
    const visibleSendingMeta = useMemo(
        () =>
            sendingRowsSorted.map((row: any, idx: number) => {
                const rawDate = row?.Дата ?? row?.Date ?? row?.date ?? '';
                const sendingNumber = String(row?.Номер ?? row?.Number ?? row?.number ?? '').trim();
                return {
                    rowKey: getSendingRowKey(row, idx),
                    sendingNumber,
                    sendingDate: rawDate ? String(rawDate) : '',
                    cargoNumbers: getSendingCargoNumbers(row),
                };
            }),
        [sendingRowsSorted, getSendingRowKey, getSendingCargoNumbers]
    );
    const selectedVisibleSendingCount = useMemo(
        () => visibleSendingMeta.reduce((acc, row) => acc + (selectedSendingRowKeys.has(row.rowKey) ? 1 : 0), 0),
        [visibleSendingMeta, selectedSendingRowKeys]
    );
    const allVisibleSendingsSelected = visibleSendingMeta.length > 0 && selectedVisibleSendingCount === visibleSendingMeta.length;
    useEffect(() => {
        if (selectedSendingRowKeys.size === 0) return;
        const visibleKeys = new Set(visibleSendingMeta.map((row) => row.rowKey));
        setSelectedSendingRowKeys((prev) => {
            const next = new Set<string>();
            prev.forEach((key) => {
                if (visibleKeys.has(key)) next.add(key);
            });
            return next.size === prev.size ? prev : next;
        });
    }, [visibleSendingMeta, selectedSendingRowKeys.size]);
    const selectedSendingRowsMeta = useMemo(
        () => visibleSendingMeta.filter((row) => selectedSendingRowKeys.has(row.rowKey)),
        [visibleSendingMeta, selectedSendingRowKeys]
    );
    const applyBulkEorStatus = useCallback(async (status: EorStatus) => {
        if (!canEditEor || selectedSendingRowsMeta.length === 0) return;
        setBulkSendingActionLoading(true);
        setBulkSendingActionError(null);
        setBulkSendingActionInfo(null);
        try {
            const settled = await Promise.allSettled(
                selectedSendingRowsMeta.map(async (row) => {
                    const resp = await fetch('/api/sendings-eor', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            login: auth?.login,
                            password: auth?.password,
                            inn: effectiveActiveInn ?? null,
                            rowKey: row.rowKey,
                            statuses: [status],
                            sendingNumber: row.sendingNumber || null,
                            sendingDate: row.sendingDate || null,
                        }),
                    });
                    if (!resp.ok) {
                        const data = await resp.json().catch(() => ({}));
                        throw new Error(String(data?.error || `HTTP ${resp.status}`));
                    }
                    return row.rowKey;
                })
            );
            const successKeys = settled
                .filter((item): item is PromiseFulfilledResult<string> => item.status === 'fulfilled')
                .map((item) => item.value);
            if (successKeys.length > 0) {
                setEorStatusMap((prev) => {
                    const next = { ...prev };
                    successKeys.forEach((rowKey) => {
                        next[rowKey] = [status];
                    });
                    return next;
                });
            }
            const failed = settled.length - successKeys.length;
            if (failed > 0) {
                setBulkSendingActionError(`EOR обновлён частично: ${successKeys.length} из ${settled.length}.`);
            } else {
                setBulkSendingActionInfo(`EOR обновлён для ${successKeys.length} отправок.`);
            }
            setBulkEorMenuOpen(false);
        } catch (e: any) {
            setBulkSendingActionError(String(e?.message || 'Не удалось обновить EOR.'));
        } finally {
            setBulkSendingActionLoading(false);
        }
    }, [canEditEor, selectedSendingRowsMeta, auth?.login, auth?.password, effectiveActiveInn]);
    const applyBulkPlanDate = useCallback(async () => {
        if (!canEditEor || selectedSendingRowsMeta.length === 0) return;
        if (!bulkPlanDateValue) {
            setBulkSendingActionError('Укажите плановую дату доставки.');
            return;
        }
        const cargoNumbers = Array.from(new Set(
            selectedSendingRowsMeta
                .flatMap((row) => {
                    const direct = String(row.sendingNumber || '').trim();
                    if (direct) return [direct];
                    // fallback only when sending number is empty
                    return row.cargoNumbers.map((v) => String(v).trim()).filter(Boolean);
                })
                .filter(Boolean)
        ));
        if (cargoNumbers.length === 0) {
            setBulkSendingActionError('По выбранным отправкам не найдены номера перевозок.');
            return;
        }
        setBulkSendingActionLoading(true);
        setBulkSendingActionError(null);
        setBulkSendingActionInfo(null);
        try {
            const resp = await fetch('/api/sendings-plan-date', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    date: bulkPlanDateValue,
                    cargoNumbers,
                }),
            });
            const data = await resp.json().catch(() => ({}));
            if (!resp.ok) {
                throw new Error(String(data?.error || `HTTP ${resp.status}`));
            }
            const updated = Number(data?.updated ?? 0);
            const requested = Number(data?.requested ?? cargoNumbers.length);
            const failed = Number(data?.failed ?? Math.max(0, requested - updated));
            const firstError = Array.isArray(data?.errors) && data.errors.length > 0
                ? String(data.errors[0]?.error || '').trim()
                : '';
            if (failed > 0) {
                setBulkSendingActionError(`Плановая дата записана частично: ${updated} из ${requested}.${firstError ? ` Причина: ${firstError}` : ''}`);
            } else {
                setBulkSendingActionInfo(`Плановая дата ${bulkPlanDateValue} записана для ${updated} перевозок.`);
            }
            setBulkPlanDateOpen(false);
        } catch (e: any) {
            setBulkSendingActionError(String(e?.message || 'Не удалось записать плановую дату.'));
        } finally {
            setBulkSendingActionLoading(false);
        }
    }, [canEditEor, selectedSendingRowsMeta, bulkPlanDateValue, auth?.login, auth?.password]);
    const getParcelSearchText = useCallback((parcel: any): string => {
        const parts: string[] = [];
        const seen = new WeakSet<object>();
        const collect = (value: unknown, depth = 0) => {
            if (value == null || depth > 8) return;
            if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
                const s = String(value).trim();
                if (s) parts.push(s);
                return;
            }
            if (Array.isArray(value)) {
                value.forEach((item) => collect(item, depth + 1));
                return;
            }
            if (typeof value === 'object') {
                const obj = value as Record<string, unknown>;
                if (seen.has(obj)) return;
                seen.add(obj);
                Object.values(obj).forEach((v) => collect(v, depth + 1));
            }
        };
        collect(parcel);
        return parts.join(' ').toLowerCase();
    }, []);
    const getSendingTransportType = useCallback((vehicleText: string): 'ferry' | 'auto' | '' => {
        const s = String(vehicleText ?? '').toUpperCase().trim();
        if (!s) return '';
        const hasPlate = /[A-ZА-Я][0-9]{3}[A-ZА-Я]{2}(?:\s*\/?\s*[0-9]{2,3})?/u.test(s);
        return hasPlate ? 'auto' : 'ferry';
    }, []);

    return (
        <div className="w-full">
            <div className="cargo-page-sticky-header">
                <Flex align="center" justify="space-between" style={{ marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <Typography.Headline style={{ fontSize: '1.25rem' }}>Документы</Typography.Headline>
                    {!isRequestJournalSection && (
                        <Flex align="center" gap="0.5rem" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                            <Typography.Body style={{ fontSize: '0.85rem', whiteSpace: 'nowrap' }}>Таблица</Typography.Body>
                            <span className="roles-switch-wrap" style={{ display: 'inline-flex' }} aria-label={tableModeByCustomer ? 'Показать карточки' : 'Показать таблицу'}>
                                <TapSwitch checked={tableModeByCustomer} onToggle={() => setTableModeByCustomer(v => !v)} />
                            </span>
                        </Flex>
                    )}
                </Flex>
                {/* Кнопки разделов: ниже «Документы», выше фильтров */}
                <div
                    className="doc-sections-row"
                    style={{
                        marginBottom: '0.75rem',
                        overflowX: 'auto',
                        WebkitOverflowScrolling: 'touch',
                        paddingBottom: '4px',
                    }}
                >
                    <Flex align="center" gap="0.5rem" style={{ flexWrap: 'nowrap', minWidth: 'min-content' }}>
                        {allowedDocSections.map(({ key, label }) => {
                            const isActive = docSection === key;
                            return (
                                <button
                                    key={key}
                                    type="button"
                                    className="doc-section-tab"
                                    onClick={() => setDocSection(key)}
                                    style={{
                                        flexShrink: 0,
                                        padding: '0.5rem 1rem',
                                        fontSize: '0.8rem',
                                        fontWeight: 600,
                                        borderRadius: 12,
                                        border: isActive ? 'none' : '1px solid var(--color-border, #e5e7eb)',
                                        background: isActive
                                            ? 'var(--color-primary-blue, #2563eb)'
                                            : 'var(--color-panel-secondary, #f3f4f6)',
                                        color: isActive ? '#fff' : 'var(--color-text-secondary, #6b7280)',
                                        cursor: 'pointer',
                                        transition: 'background 0.2s, color 0.2s, border-color 0.2s, box-shadow 0.2s',
                                        boxShadow: isActive ? '0 2px 8px rgba(37, 99, 235, 0.35)' : 'none',
                                    }}
                                    onMouseEnter={(e) => {
                                        if (!isActive) {
                                            e.currentTarget.style.background = 'var(--color-bg-hover, #e5e7eb)';
                                            e.currentTarget.style.borderColor = 'var(--color-border, #d1d5db)';
                                        }
                                    }}
                                    onMouseLeave={(e) => {
                                        if (!isActive) {
                                            e.currentTarget.style.background = 'var(--color-panel-secondary, #f3f4f6)';
                                            e.currentTarget.style.borderColor = 'var(--color-border, #e5e7eb)';
                                        }
                                    }}
                                >
                                    {label}
                                </button>
                            );
                        })}
                    </Flex>
                </div>
                {(docSection === 'Счета' || docSection === 'УПД' || docSection === 'Заявки' || docSection === 'Отправки' || docSection === 'Тарифы' || docSection === 'Акты сверок' || docSection === 'Договоры') && (
                <div className="filters-container filters-row-scroll">
                    <div className="filter-group" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>
                        {docSection !== 'Тарифы' ? (
                            <Button className="filter-button" style={{ padding: '0.5rem', minWidth: 'auto' }} onClick={() => { setSortBy('date'); setSortOrder(o => o === 'desc' ? 'asc' : 'desc'); }} title={sortOrder === 'desc' ? 'Дата по убыванию' : 'Дата по возрастанию'}>
                                {sortOrder === 'desc' ? <ArrowDown className="w-4 h-4" /> : <ArrowUp className="w-4 h-4" />}
                            </Button>
                        ) : null}
                        <div ref={dateButtonRef} style={{ display: 'inline-flex' }}>
                            <Button className="filter-button" onClick={() => { setIsDateDropdownOpen(!isDateDropdownOpen); setDateDropdownMode('main'); setIsCustomerDropdownOpen(false); setIsReceiverDropdownOpen(false); setIsActCustomerDropdownOpen(false); setIsSverkiCustomerDropdownOpen(false); setIsDogovorsCustomerDropdownOpen(false); setIsStatusDropdownOpen(false); setIsTypeDropdownOpen(false); setIsRouteDropdownOpen(false); setIsDeliveryStatusDropdownOpen(false); setIsRouteCargoDropdownOpen(false); setIsEdoStatusDropdownOpen(false); setIsTransportDropdownOpen(false); setIsTariffsCustomerDropdownOpen(false); setIsTariffsRouteDropdownOpen(false); setIsTariffsTypeDropdownOpen(false); }}>
                                Дата: {dateFilter === 'период' ? 'Период' : dateFilter === 'месяц' && selectedMonthForFilter ? `${MONTH_NAMES[selectedMonthForFilter.month - 1]} ${selectedMonthForFilter.year}` : dateFilter === 'год' && selectedYearForFilter ? `${selectedYearForFilter}` : dateFilter === 'неделя' && selectedWeekForFilter ? (() => { const r = getWeekRange(selectedWeekForFilter); return `${r.dateFrom.slice(8, 10)}.${r.dateFrom.slice(5, 7)} – ${r.dateTo.slice(8, 10)}.${r.dateTo.slice(5, 7)}`; })() : dateFilter.charAt(0).toUpperCase() + dateFilter.slice(1)} <ChevronDown className="w-4 h-4"/>
                            </Button>
                        </div>
                        <FilterDropdownPortal triggerRef={dateButtonRef} isOpen={isDateDropdownOpen} onClose={() => setIsDateDropdownOpen(false)}>
                            {dateDropdownMode === 'months' ? (
                                <>
                                    <div className="dropdown-item" onClick={() => setDateDropdownMode('main')} style={{ fontWeight: 600 }}>← Назад</div>
                                    {MONTH_NAMES.map((name, i) => (
                                        <div key={i} className="dropdown-item" onClick={() => { setDateFilter('месяц'); setSelectedMonthForFilter({ year: new Date().getFullYear(), month: i + 1 }); setIsDateDropdownOpen(false); setDateDropdownMode('main'); }}>
                                            <Typography.Body>{name} {new Date().getFullYear()}</Typography.Body>
                                        </div>
                                    ))}
                                </>
                            ) : dateDropdownMode === 'years' ? (
                                <>
                                    <div className="dropdown-item" onClick={() => setDateDropdownMode('main')} style={{ fontWeight: 600 }}>← Назад</div>
                                    {getYearsList(6).map(y => (
                                        <div key={y} className="dropdown-item" onClick={() => { setDateFilter('год'); setSelectedYearForFilter(y); setIsDateDropdownOpen(false); setDateDropdownMode('main'); }}>
                                            <Typography.Body>{y}</Typography.Body>
                                        </div>
                                    ))}
                                </>
                            ) : dateDropdownMode === 'weeks' ? (
                                <>
                                    <div className="dropdown-item" onClick={() => setDateDropdownMode('main')} style={{ fontWeight: 600 }}>← Назад</div>
                                    {getWeeksList(16).map(w => (
                                        <div key={w.monday} className="dropdown-item" onClick={() => { setDateFilter('неделя'); setSelectedWeekForFilter(w.monday); setIsDateDropdownOpen(false); setDateDropdownMode('main'); }}>
                                            <Typography.Body>{w.label}</Typography.Body>
                                        </div>
                                    ))}
                                </>
                            ) : (
                                ['сегодня', 'вчера', 'неделя', 'месяц', 'год', 'период'].map(key => {
                                    const isMonth = key === 'месяц';
                                    const isYear = key === 'год';
                                    const isWeek = key === 'неделя';
                                    const doLongPress = isMonth || isYear || isWeek;
                                    const timerRef = isMonth ? monthLongPressTimerRef : isYear ? yearLongPressTimerRef : weekLongPressTimerRef;
                                    const wasLongPressRef = isMonth ? monthWasLongPressRef : isYear ? yearWasLongPressRef : weekWasLongPressRef;
                                    const mode = isMonth ? 'months' : isYear ? 'years' : 'weeks';
                                    const title = isMonth ? 'Клик — текущий месяц; удерживайте — выбор месяца' : isYear ? 'Клик — 365 дней; удерживайте — выбор года' : isWeek ? 'Клик — предыдущая неделя; удерживайте — выбор недели (пн–вс)' : undefined;
                                    return (
                                        <div key={key} className="dropdown-item" title={title}
                                            onPointerDown={doLongPress ? () => { wasLongPressRef.current = false; timerRef.current = setTimeout(() => { timerRef.current = null; wasLongPressRef.current = true; setDateDropdownMode(mode); }, 500); } : undefined}
                                            onPointerUp={doLongPress ? () => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; } } : undefined}
                                            onPointerLeave={doLongPress ? () => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; } } : undefined}
                                            onClick={() => {
                                                if (doLongPress && wasLongPressRef.current) { wasLongPressRef.current = false; return; }
                                                if (key === 'период') {
                                                    let r: { dateFrom: string; dateTo: string };
                                                    if (dateFilter === "период") { r = { dateFrom: customDateFrom, dateTo: customDateTo }; }
                                                    else if (dateFilter === "месяц" && selectedMonthForFilter) {
                                                        const { year, month } = selectedMonthForFilter;
                                                        const pad = (n: number) => String(n).padStart(2, '0');
                                                        const lastDay = new Date(year, month, 0).getDate();
                                                        r = { dateFrom: `${year}-${pad(month)}-01`, dateTo: `${year}-${pad(month)}-${pad(lastDay)}` };
                                                    } else if (dateFilter === "год" && selectedYearForFilter) {
                                                        r = { dateFrom: `${selectedYearForFilter}-01-01`, dateTo: `${selectedYearForFilter}-12-31` };
                                                    } else if (dateFilter === "неделя" && selectedWeekForFilter) {
                                                        r = getWeekRange(selectedWeekForFilter);
                                                    } else { r = getDateRange(dateFilter); }
                                                    setCustomDateFrom(r.dateFrom);
                                                    setCustomDateTo(r.dateTo);
                                                }
                                                setDateFilter(key as DateFilter);
                                                if (key === 'месяц') setSelectedMonthForFilter(null);
                                                if (key === 'год') setSelectedYearForFilter(null);
                                                if (key === 'неделя') setSelectedWeekForFilter(null);
                                                setIsDateDropdownOpen(false);
                                                if (key === 'период') setIsCustomModalOpen(true);
                                            }}>
                                            <Typography.Body>{key === 'год' ? 'Год' : key === 'период' ? 'Период' : key.charAt(0).toUpperCase() + key.slice(1)}</Typography.Body>
                                        </div>
                                    );
                                })
                            )}
                        </FilterDropdownPortal>
                        {docSection === 'Тарифы' && (
                            <>
                                {effectiveServiceMode ? (
                                    <>
                                        <div ref={tariffsCustomerButtonRef} style={{ display: 'inline-flex' }}>
                                            <Button className="filter-button" onClick={() => {
                                                setIsTariffsCustomerDropdownOpen(!isTariffsCustomerDropdownOpen);
                                                setIsTariffsRouteDropdownOpen(false);
                                                setIsTariffsTypeDropdownOpen(false);
                                                setIsDateDropdownOpen(false);
                                            }}>
                                                Заказчик: {tariffsCustomerFilter ? stripOoo(tariffsCustomerFilter) : 'Все'} <ChevronDown className="w-4 h-4"/>
                                            </Button>
                                        </div>
                                        <FilterDropdownPortal triggerRef={tariffsCustomerButtonRef} isOpen={isTariffsCustomerDropdownOpen} onClose={() => { setIsTariffsCustomerDropdownOpen(false); setTariffsCustomerSearchQuery(''); }}>
                                            <div className="dropdown-item" style={{ padding: '0.5rem' }} onClick={(e) => e.stopPropagation()}>
                                                <input
                                                    type="text"
                                                    placeholder="Поиск заказчика..."
                                                    value={tariffsCustomerSearchQuery}
                                                    onChange={(e) => setTariffsCustomerSearchQuery(e.target.value)}
                                                    className="filter-search-input"
                                                    style={{ width: '100%', padding: '0.35rem 0.5rem', borderRadius: 6, border: '1px solid var(--color-border)', fontSize: '0.875rem', outline: 'none' }}
                                                />
                                            </div>
                                            <div className="dropdown-item" onClick={() => { setTariffsCustomerFilter(''); setIsTariffsCustomerDropdownOpen(false); setTariffsCustomerSearchQuery(''); }}><Typography.Body>Все</Typography.Body></div>
                                            {uniqueTariffsCustomers
                                                .filter((c) => !tariffsCustomerSearchQuery.trim() || c.toLowerCase().includes(tariffsCustomerSearchQuery.trim().toLowerCase()))
                                                .map((customer) => (
                                                    <div key={customer} className="dropdown-item" onClick={() => { setTariffsCustomerFilter(customer); setIsTariffsCustomerDropdownOpen(false); setTariffsCustomerSearchQuery(''); }}>
                                                        <Typography.Body>{stripOoo(customer)}</Typography.Body>
                                                    </div>
                                                ))}
                                        </FilterDropdownPortal>
                                    </>
                                ) : null}
                                <div ref={tariffsRouteButtonRef} style={{ display: 'inline-flex' }}>
                                    <Button className="filter-button" onClick={() => {
                                        setIsTariffsRouteDropdownOpen(!isTariffsRouteDropdownOpen);
                                        setIsTariffsCustomerDropdownOpen(false);
                                        setIsTariffsTypeDropdownOpen(false);
                                        setIsDateDropdownOpen(false);
                                    }}>
                                        Маршрут: {tariffsRouteFilter === 'all' ? 'Все' : tariffsRouteFilter} <ChevronDown className="w-4 h-4"/>
                                    </Button>
                                </div>
                                <FilterDropdownPortal triggerRef={tariffsRouteButtonRef} isOpen={isTariffsRouteDropdownOpen} onClose={() => setIsTariffsRouteDropdownOpen(false)}>
                                    <div className="dropdown-item" onClick={() => { setTariffsRouteFilter('all'); setIsTariffsRouteDropdownOpen(false); }}><Typography.Body>Все</Typography.Body></div>
                                    {uniqueTariffsRoutes.map((route) => (
                                        <div key={route} className="dropdown-item" onClick={() => { setTariffsRouteFilter(route); setIsTariffsRouteDropdownOpen(false); }}>
                                            <Typography.Body>{route}</Typography.Body>
                                        </div>
                                    ))}
                                </FilterDropdownPortal>
                                <div ref={tariffsTypeButtonRef} style={{ display: 'inline-flex' }}>
                                    <Button className="filter-button" onClick={() => {
                                        setIsTariffsTypeDropdownOpen(!isTariffsTypeDropdownOpen);
                                        setIsTariffsCustomerDropdownOpen(false);
                                        setIsTariffsRouteDropdownOpen(false);
                                        setIsDateDropdownOpen(false);
                                    }}>
                                        Тип: {tariffsTypeFilter === 'all' ? 'Все' : tariffsTypeFilter} <ChevronDown className="w-4 h-4"/>
                                    </Button>
                                </div>
                                <FilterDropdownPortal triggerRef={tariffsTypeButtonRef} isOpen={isTariffsTypeDropdownOpen} onClose={() => setIsTariffsTypeDropdownOpen(false)}>
                                    <div className="dropdown-item" onClick={() => { setTariffsTypeFilter('all'); setIsTariffsTypeDropdownOpen(false); }}><Typography.Body>Все</Typography.Body></div>
                                    {uniqueTariffsTypes.map((type) => (
                                        <div key={type} className="dropdown-item" onClick={() => { setTariffsTypeFilter(type); setIsTariffsTypeDropdownOpen(false); }}>
                                            <Typography.Body>{type}</Typography.Body>
                                        </div>
                                    ))}
                                </FilterDropdownPortal>
                            </>
                        )}
                        {(docSection === 'Счета' || docSection === 'Заявки') && effectiveServiceMode && (
                            <>
                                <div ref={customerButtonRef} style={{ display: 'inline-flex' }}>
                                    <Button className="filter-button" onClick={() => { setIsCustomerDropdownOpen(!isCustomerDropdownOpen); setIsDateDropdownOpen(false); setIsReceiverDropdownOpen(false); setIsOrderSenderDropdownOpen(false); setIsOrderRouteDropdownOpen(false); setIsActCustomerDropdownOpen(false); setIsStatusDropdownOpen(false); setIsTypeDropdownOpen(false); setIsRouteDropdownOpen(false); setIsDeliveryStatusDropdownOpen(false); setIsRouteCargoDropdownOpen(false); setIsEdoStatusDropdownOpen(false); setIsTransportDropdownOpen(false); }}>
                                        Заказчик: {customerFilter ? stripOoo(customerFilter) : 'Все'} <ChevronDown className="w-4 h-4"/>
                                    </Button>
                                </div>
                                <FilterDropdownPortal triggerRef={customerButtonRef} isOpen={isCustomerDropdownOpen} onClose={() => setIsCustomerDropdownOpen(false)}>
                                    <div className="dropdown-item" onClick={() => { setCustomerFilter(''); setIsCustomerDropdownOpen(false); }}><Typography.Body>Все</Typography.Body></div>
                                    {(docSection === 'Заявки' ? uniqueOrderCustomers : docSection === 'Отправки' ? uniqueSendingCustomers : uniqueCustomers).map(c => (
                                        <div key={c} className="dropdown-item" onClick={() => { setCustomerFilter(c); setIsCustomerDropdownOpen(false); }}><Typography.Body>{stripOoo(c)}</Typography.Body></div>
                                    ))}
                                </FilterDropdownPortal>
                            </>
                        )}
                        {docSection === 'Заявки' && (
                            <>
                                <div ref={receiverButtonRef} style={{ display: 'inline-flex' }}>
                                    <Button className="filter-button" onClick={() => { setIsReceiverDropdownOpen(!isReceiverDropdownOpen); setIsDateDropdownOpen(false); setIsCustomerDropdownOpen(false); setIsOrderSenderDropdownOpen(false); setIsOrderRouteDropdownOpen(false); setIsActCustomerDropdownOpen(false); setIsStatusDropdownOpen(false); setIsTypeDropdownOpen(false); setIsRouteDropdownOpen(false); setIsDeliveryStatusDropdownOpen(false); setIsRouteCargoDropdownOpen(false); setIsEdoStatusDropdownOpen(false); setIsTransportDropdownOpen(false); }}>
                                        Получатель: {orderReceiverFilter ? stripOoo(orderReceiverFilter) : 'Все'} <ChevronDown className="w-4 h-4"/>
                                    </Button>
                                </div>
                                <FilterDropdownPortal triggerRef={receiverButtonRef} isOpen={isReceiverDropdownOpen} onClose={() => setIsReceiverDropdownOpen(false)}>
                                    <div className="dropdown-item" onClick={() => { setOrderReceiverFilter(''); setIsReceiverDropdownOpen(false); }}><Typography.Body>Все</Typography.Body></div>
                                    {uniqueOrderReceivers.map((receiver) => (
                                        <div key={receiver} className="dropdown-item" onClick={() => { setOrderReceiverFilter(receiver); setIsReceiverDropdownOpen(false); }}>
                                            <Typography.Body>{stripOoo(receiver)}</Typography.Body>
                                        </div>
                                    ))}
                                </FilterDropdownPortal>
                                <div ref={orderSenderButtonRef} style={{ display: 'inline-flex' }}>
                                    <Button className="filter-button" onClick={() => { setIsOrderSenderDropdownOpen(!isOrderSenderDropdownOpen); setIsDateDropdownOpen(false); setIsCustomerDropdownOpen(false); setIsReceiverDropdownOpen(false); setIsOrderRouteDropdownOpen(false); setIsActCustomerDropdownOpen(false); setIsStatusDropdownOpen(false); setIsTypeDropdownOpen(false); setIsRouteDropdownOpen(false); setIsDeliveryStatusDropdownOpen(false); setIsRouteCargoDropdownOpen(false); setIsEdoStatusDropdownOpen(false); setIsTransportDropdownOpen(false); }}>
                                        Отправитель: {orderSenderFilter ? stripOoo(orderSenderFilter) : 'Все'} <ChevronDown className="w-4 h-4"/>
                                    </Button>
                                </div>
                                <FilterDropdownPortal triggerRef={orderSenderButtonRef} isOpen={isOrderSenderDropdownOpen} onClose={() => setIsOrderSenderDropdownOpen(false)}>
                                    <div className="dropdown-item" onClick={() => { setOrderSenderFilter(''); setIsOrderSenderDropdownOpen(false); }}><Typography.Body>Все</Typography.Body></div>
                                    {uniqueOrderSenders.map((sender) => (
                                        <div key={sender} className="dropdown-item" onClick={() => { setOrderSenderFilter(sender); setIsOrderSenderDropdownOpen(false); }}>
                                            <Typography.Body>{stripOoo(sender)}</Typography.Body>
                                        </div>
                                    ))}
                                </FilterDropdownPortal>
                                <div ref={orderRouteButtonRef} style={{ display: 'inline-flex' }}>
                                    <Button className="filter-button" onClick={() => { setIsOrderRouteDropdownOpen(!isOrderRouteDropdownOpen); setIsDateDropdownOpen(false); setIsCustomerDropdownOpen(false); setIsReceiverDropdownOpen(false); setIsOrderSenderDropdownOpen(false); setIsActCustomerDropdownOpen(false); setIsStatusDropdownOpen(false); setIsTypeDropdownOpen(false); setIsRouteDropdownOpen(false); setIsDeliveryStatusDropdownOpen(false); setIsRouteCargoDropdownOpen(false); setIsEdoStatusDropdownOpen(false); setIsTransportDropdownOpen(false); }}>
                                        Маршрут: {orderRouteFilter === 'all' ? 'Все' : orderRouteFilter} <ChevronDown className="w-4 h-4"/>
                                    </Button>
                                </div>
                                <FilterDropdownPortal triggerRef={orderRouteButtonRef} isOpen={isOrderRouteDropdownOpen} onClose={() => setIsOrderRouteDropdownOpen(false)}>
                                    <div className="dropdown-item" onClick={() => { setOrderRouteFilter('all'); setIsOrderRouteDropdownOpen(false); }}><Typography.Body>Все</Typography.Body></div>
                                    {uniqueOrderRoutes.map((route) => (
                                        <div key={route} className="dropdown-item" onClick={() => { setOrderRouteFilter(route); setIsOrderRouteDropdownOpen(false); }}>
                                            <Typography.Body>{route}</Typography.Body>
                                        </div>
                                    ))}
                                </FilterDropdownPortal>
                            </>
                        )}
                        {docSection === 'Отправки' && (
                        <>
                        <div ref={routeCargoButtonRef} style={{ display: 'inline-flex' }}>
                            <Button className="filter-button" onClick={() => { setIsRouteCargoDropdownOpen(!isRouteCargoDropdownOpen); setIsDateDropdownOpen(false); setIsCustomerDropdownOpen(false); setIsActCustomerDropdownOpen(false); setIsStatusDropdownOpen(false); setIsTypeDropdownOpen(false); setIsRouteDropdownOpen(false); setIsDeliveryStatusDropdownOpen(false); setIsEdoStatusDropdownOpen(false); setIsTransportDropdownOpen(false); }}>
                                Маршрут: {routeFilterCargo === 'all' ? 'Все' : routeFilterCargo} <ChevronDown className="w-4 h-4"/>
                            </Button>
                        </div>
                        <FilterDropdownPortal triggerRef={routeCargoButtonRef} isOpen={isRouteCargoDropdownOpen} onClose={() => setIsRouteCargoDropdownOpen(false)}>
                            <div className="dropdown-item" onClick={() => { setRouteFilterCargo('all'); setIsRouteCargoDropdownOpen(false); }}><Typography.Body>Все</Typography.Body></div>
                            {uniqueSendingRoutes.map((route) => (
                                <div key={route} className="dropdown-item" onClick={() => { setRouteFilterCargo(route); setIsRouteCargoDropdownOpen(false); }}>
                                    <Typography.Body>{route}</Typography.Body>
                                </div>
                            ))}
                        </FilterDropdownPortal>
                        <div ref={deliveryStatusButtonRef} style={{ display: 'inline-flex' }}>
                            <Button className="filter-button" onClick={() => { setIsDeliveryStatusDropdownOpen(!isDeliveryStatusDropdownOpen); setIsDateDropdownOpen(false); setIsCustomerDropdownOpen(false); setIsActCustomerDropdownOpen(false); setIsStatusDropdownOpen(false); setIsTypeDropdownOpen(false); setIsRouteDropdownOpen(false); setIsRouteCargoDropdownOpen(false); setIsEdoStatusDropdownOpen(false); setIsTransportDropdownOpen(false); }}>
                                Статус перевозки: {deliveryStatusFilterSet.size === 0 ? 'Все' : deliveryStatusFilterSet.size === 1 ? STATUS_MAP[[...deliveryStatusFilterSet][0]] : `Выбрано: ${deliveryStatusFilterSet.size}`} <ChevronDown className="w-4 h-4"/>
                            </Button>
                        </div>
                        <FilterDropdownPortal triggerRef={deliveryStatusButtonRef} isOpen={isDeliveryStatusDropdownOpen} onClose={() => setIsDeliveryStatusDropdownOpen(false)}>
                            <div className="dropdown-item" onClick={() => { setDeliveryStatusFilterSet(new Set()); setIsDeliveryStatusDropdownOpen(false); }}><Typography.Body>Все</Typography.Body></div>
                            {(Object.keys(STATUS_MAP) as StatusFilter[]).filter(k => k !== 'favorites' && k !== 'all').map(key => (
                                <div key={key} className="dropdown-item" onClick={(e) => { e.stopPropagation(); setDeliveryStatusFilterSet(prev => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; }); }} style={{ background: deliveryStatusFilterSet.has(key) ? 'var(--color-bg-hover)' : undefined }}>
                                    <Typography.Body>{STATUS_MAP[key]} {deliveryStatusFilterSet.has(key) ? '✓' : ''}</Typography.Body>
                                </div>
                            ))}
                        </FilterDropdownPortal>
                        </>
                        )}
                        {docSection === 'УПД' && effectiveServiceMode && (
                            <>
                                <div ref={actCustomerButtonRef} style={{ display: 'inline-flex' }}>
                                    <Button className="filter-button" onClick={() => { setIsActCustomerDropdownOpen(!isActCustomerDropdownOpen); setIsDateDropdownOpen(false); setIsCustomerDropdownOpen(false); setIsReceiverDropdownOpen(false); setIsStatusDropdownOpen(false); setIsTypeDropdownOpen(false); setIsRouteDropdownOpen(false); setIsDeliveryStatusDropdownOpen(false); setIsRouteCargoDropdownOpen(false); setIsEdoStatusDropdownOpen(false); setIsTransportDropdownOpen(false); }}>
                                        Заказчик: {actCustomerFilter ? stripOoo(actCustomerFilter) : 'Все'} <ChevronDown className="w-4 h-4"/>
                                    </Button>
                                </div>
                                <FilterDropdownPortal triggerRef={actCustomerButtonRef} isOpen={isActCustomerDropdownOpen} onClose={() => setIsActCustomerDropdownOpen(false)}>
                                    <div className="dropdown-item" onClick={() => { setActCustomerFilter(''); setIsActCustomerDropdownOpen(false); }}><Typography.Body>Все</Typography.Body></div>
                                    {uniqueActCustomers.map(c => (
                                        <div key={c} className="dropdown-item" onClick={() => { setActCustomerFilter(c); setIsActCustomerDropdownOpen(false); }}><Typography.Body>{stripOoo(c)}</Typography.Body></div>
                                    ))}
                                </FilterDropdownPortal>
                            </>
                        )}
                        {docSection === 'Акты сверок' && effectiveServiceMode && (
                            <>
                                <div ref={sverkiCustomerButtonRef} style={{ display: 'inline-flex' }}>
                                    <Button className="filter-button" onClick={() => { setIsSverkiCustomerDropdownOpen(!isSverkiCustomerDropdownOpen); setIsDateDropdownOpen(false); setIsCustomerDropdownOpen(false); setIsReceiverDropdownOpen(false); setIsActCustomerDropdownOpen(false); setIsStatusDropdownOpen(false); setIsTypeDropdownOpen(false); setIsRouteDropdownOpen(false); setIsDeliveryStatusDropdownOpen(false); setIsRouteCargoDropdownOpen(false); setIsEdoStatusDropdownOpen(false); setIsTransportDropdownOpen(false); }}>
                                        Заказчик: {sverkiCustomerFilter ? stripOoo(sverkiCustomerFilter) : 'Все'} <ChevronDown className="w-4 h-4"/>
                                    </Button>
                                </div>
                                <FilterDropdownPortal triggerRef={sverkiCustomerButtonRef} isOpen={isSverkiCustomerDropdownOpen} onClose={() => setIsSverkiCustomerDropdownOpen(false)}>
                                    <div className="dropdown-item" onClick={() => { setSverkiCustomerFilter(''); setIsSverkiCustomerDropdownOpen(false); }}><Typography.Body>Все</Typography.Body></div>
                                    {uniqueSverkiCustomers.map(c => (
                                        <div key={c} className="dropdown-item" onClick={() => { setSverkiCustomerFilter(c); setIsSverkiCustomerDropdownOpen(false); }}><Typography.Body>{stripOoo(c)}</Typography.Body></div>
                                    ))}
                                </FilterDropdownPortal>
                            </>
                        )}
                        {docSection === 'Договоры' && effectiveServiceMode && (
                            <>
                                <div ref={dogovorsCustomerButtonRef} style={{ display: 'inline-flex' }}>
                                    <Button className="filter-button" onClick={() => { setIsDogovorsCustomerDropdownOpen(!isDogovorsCustomerDropdownOpen); setIsDateDropdownOpen(false); setIsCustomerDropdownOpen(false); setIsReceiverDropdownOpen(false); setIsActCustomerDropdownOpen(false); setIsSverkiCustomerDropdownOpen(false); setIsStatusDropdownOpen(false); setIsTypeDropdownOpen(false); setIsRouteDropdownOpen(false); setIsDeliveryStatusDropdownOpen(false); setIsRouteCargoDropdownOpen(false); setIsEdoStatusDropdownOpen(false); setIsTransportDropdownOpen(false); }}>
                                        Заказчик: {dogovorsCustomerFilter ? stripOoo(dogovorsCustomerFilter) : 'Все'} <ChevronDown className="w-4 h-4"/>
                                    </Button>
                                </div>
                                <FilterDropdownPortal triggerRef={dogovorsCustomerButtonRef} isOpen={isDogovorsCustomerDropdownOpen} onClose={() => setIsDogovorsCustomerDropdownOpen(false)}>
                                    <div className="dropdown-item" onClick={() => { setDogovorsCustomerFilter(''); setIsDogovorsCustomerDropdownOpen(false); }}><Typography.Body>Все</Typography.Body></div>
                                    {uniqueDogovorsCustomers.map(c => (
                                        <div key={c} className="dropdown-item" onClick={() => { setDogovorsCustomerFilter(c); setIsDogovorsCustomerDropdownOpen(false); }}><Typography.Body>{stripOoo(c)}</Typography.Body></div>
                                    ))}
                                </FilterDropdownPortal>
                            </>
                        )}
                        {(docSection === 'Счета' || docSection === 'УПД') && (
                        <>
                        <div ref={edoStatusButtonRef} style={{ display: 'inline-flex' }}>
                            <Button className="filter-button" onClick={() => { setIsEdoStatusDropdownOpen(!isEdoStatusDropdownOpen); setIsDateDropdownOpen(false); setIsCustomerDropdownOpen(false); setIsActCustomerDropdownOpen(false); setIsStatusDropdownOpen(false); setIsTypeDropdownOpen(false); setIsRouteDropdownOpen(false); setIsDeliveryStatusDropdownOpen(false); setIsRouteCargoDropdownOpen(false); setIsTransportDropdownOpen(false); }}>
                                Статус ЭДО: {edoStatusFilterSet.size === 0 ? 'Все' : edoStatusFilterSet.size === 1 ? [...edoStatusFilterSet][0] : `Выбрано: ${edoStatusFilterSet.size}`} <ChevronDown className="w-4 h-4"/>
                            </Button>
                        </div>
                        <FilterDropdownPortal triggerRef={edoStatusButtonRef} isOpen={isEdoStatusDropdownOpen} onClose={() => setIsEdoStatusDropdownOpen(false)}>
                            <div className="dropdown-item" onClick={() => { setEdoStatusFilterSet(new Set()); setIsEdoStatusDropdownOpen(false); }}><Typography.Body>Все</Typography.Body></div>
                            {uniqueEdoStatuses.map(s => (
                                <div key={s} className="dropdown-item" onClick={(e) => { e.stopPropagation(); setEdoStatusFilterSet(prev => { const next = new Set(prev); if (next.has(s)) next.delete(s); else next.add(s); return next; }); }} style={{ background: edoStatusFilterSet.has(s) ? 'var(--color-bg-hover)' : undefined }}>
                                    <Typography.Body>{s} {edoStatusFilterSet.has(s) ? '✓' : ''}</Typography.Body>
                                </div>
                            ))}
                        </FilterDropdownPortal>
                        </>
                        )}
                        {(((effectiveServiceMode && docSection !== 'Заявки' && docSection !== 'Акты сверок' && docSection !== 'Договоры' && docSection !== 'Претензии') || docSection === 'Отправки') && docSection !== 'Тарифы') && (
                        <>
                        <div ref={transportButtonRef} style={{ display: 'inline-flex' }}>
                            <Button className="filter-button" onClick={() => { setIsTransportDropdownOpen(!isTransportDropdownOpen); setIsDateDropdownOpen(false); setIsCustomerDropdownOpen(false); setIsReceiverDropdownOpen(false); setIsActCustomerDropdownOpen(false); setIsStatusDropdownOpen(false); setIsTypeDropdownOpen(false); setIsRouteDropdownOpen(false); setIsDeliveryStatusDropdownOpen(false); setIsRouteCargoDropdownOpen(false); setIsEdoStatusDropdownOpen(false); }}>
                                Транспортное средство: {transportFilter || 'Все'} <ChevronDown className="w-4 h-4"/>
                            </Button>
                        </div>
                        <FilterDropdownPortal triggerRef={transportButtonRef} isOpen={isTransportDropdownOpen} onClose={() => { setIsTransportDropdownOpen(false); setTransportSearchQuery(''); }}>
                            <div className="dropdown-item" style={{ padding: '0.5rem' }} onClick={(e) => e.stopPropagation()}>
                                <input
                                    type="text"
                                    placeholder="Поиск..."
                                    value={transportSearchQuery}
                                    onChange={(e) => setTransportSearchQuery(e.target.value)}
                                    className="filter-search-input"
                                    style={{ width: '100%', padding: '0.35rem 0.5rem', borderRadius: 6, border: '1px solid var(--color-border)', fontSize: '0.875rem', outline: 'none' }}
                                />
                            </div>
                            <div className="dropdown-item" onClick={() => { setTransportFilter(''); setIsTransportDropdownOpen(false); setTransportSearchQuery(''); }}><Typography.Body>Все</Typography.Body></div>
                            {(docSection === 'Заявки' ? uniqueOrderTransportVehicles : docSection === 'Отправки' ? uniqueSendingTransportVehicles : uniqueTransportVehicles)
                                .filter(v => !transportSearchQuery.trim() || v.toLowerCase().includes(transportSearchQuery.trim().toLowerCase()))
                                .map(v => (
                                    <div key={v} className="dropdown-item" onClick={() => { setTransportFilter(v); setIsTransportDropdownOpen(false); setTransportSearchQuery(''); }}><Typography.Body>{v}</Typography.Body></div>
                                ))}
                        </FilterDropdownPortal>
                        </>
                        )}
                        {docSection === 'Счета' && (
                        <>
                        <div ref={statusButtonRef} style={{ display: 'inline-flex' }}>
                            <Button className="filter-button" onClick={() => { setIsStatusDropdownOpen(!isStatusDropdownOpen); setIsDateDropdownOpen(false); setIsCustomerDropdownOpen(false); setIsActCustomerDropdownOpen(false); setIsTypeDropdownOpen(false); setIsRouteDropdownOpen(false); setIsDeliveryStatusDropdownOpen(false); setIsRouteCargoDropdownOpen(false); setIsEdoStatusDropdownOpen(false); setIsTransportDropdownOpen(false); }}>
                                Статус счёта: {statusFilterSet.size === 0 ? 'Все' : statusFilterSet.size === 1 ? (statusFilterSet.has(INVOICE_FAVORITES_VALUE) ? 'Избранные' : [...statusFilterSet][0]) : `Выбрано: ${statusFilterSet.size}`} <ChevronDown className="w-4 h-4"/>
                            </Button>
                        </div>
                        <FilterDropdownPortal triggerRef={statusButtonRef} isOpen={isStatusDropdownOpen} onClose={() => setIsStatusDropdownOpen(false)}>
                            <div className="dropdown-item" onClick={() => { setStatusFilterSet(new Set()); setIsStatusDropdownOpen(false); }}><Typography.Body>Все</Typography.Body></div>
                            {INVOICE_STATUS_OPTIONS.map(s => (
                                <div key={s} className="dropdown-item" onClick={(e) => { e.stopPropagation(); setStatusFilterSet(prev => { const next = new Set(prev); if (next.has(s)) next.delete(s); else next.add(s); return next; }); }} style={{ background: statusFilterSet.has(s) ? 'var(--color-bg-hover)' : undefined }}>
                                    <Typography.Body>{s} {statusFilterSet.has(s) ? '✓' : ''}</Typography.Body>
                                </div>
                            ))}
                            <div className="dropdown-item" onClick={(e) => { e.stopPropagation(); setStatusFilterSet(prev => { const next = new Set(prev); if (next.has(INVOICE_FAVORITES_VALUE)) next.delete(INVOICE_FAVORITES_VALUE); else next.add(INVOICE_FAVORITES_VALUE); return next; }); }} style={{ background: statusFilterSet.has(INVOICE_FAVORITES_VALUE) ? 'var(--color-bg-hover)' : undefined }}>
                                <Typography.Body>Избранные {statusFilterSet.has(INVOICE_FAVORITES_VALUE) ? '✓' : ''}</Typography.Body>
                            </div>
                        </FilterDropdownPortal>
                        <div ref={deliveryStatusButtonRef} style={{ display: 'inline-flex' }}>
                            <Button className="filter-button" onClick={() => { setIsDeliveryStatusDropdownOpen(!isDeliveryStatusDropdownOpen); setIsDateDropdownOpen(false); setIsCustomerDropdownOpen(false); setIsActCustomerDropdownOpen(false); setIsStatusDropdownOpen(false); setIsTypeDropdownOpen(false); setIsRouteDropdownOpen(false); setIsRouteCargoDropdownOpen(false); setIsEdoStatusDropdownOpen(false); setIsTransportDropdownOpen(false); }}>
                                Статус перевозки: {deliveryStatusFilterSet.size === 0 ? 'Все' : deliveryStatusFilterSet.size === 1 ? STATUS_MAP[[...deliveryStatusFilterSet][0]] : `Выбрано: ${deliveryStatusFilterSet.size}`} <ChevronDown className="w-4 h-4"/>
                            </Button>
                        </div>
                        <FilterDropdownPortal triggerRef={deliveryStatusButtonRef} isOpen={isDeliveryStatusDropdownOpen} onClose={() => setIsDeliveryStatusDropdownOpen(false)}>
                            <div className="dropdown-item" onClick={() => { setDeliveryStatusFilterSet(new Set()); setIsDeliveryStatusDropdownOpen(false); }}><Typography.Body>Все</Typography.Body></div>
                            {(Object.keys(STATUS_MAP) as StatusFilter[]).filter(k => k !== 'favorites' && k !== 'all').map(key => (
                                <div key={key} className="dropdown-item" onClick={(e) => { e.stopPropagation(); setDeliveryStatusFilterSet(prev => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; }); }} style={{ background: deliveryStatusFilterSet.has(key) ? 'var(--color-bg-hover)' : undefined }}>
                                    <Typography.Body>{STATUS_MAP[key]} {deliveryStatusFilterSet.has(key) ? '✓' : ''}</Typography.Body>
                                </div>
                            ))}
                        </FilterDropdownPortal>
                        <div ref={routeCargoButtonRef} style={{ display: 'inline-flex' }}>
                            <Button className="filter-button" onClick={() => { setIsRouteCargoDropdownOpen(!isRouteCargoDropdownOpen); setIsDateDropdownOpen(false); setIsCustomerDropdownOpen(false); setIsActCustomerDropdownOpen(false); setIsStatusDropdownOpen(false); setIsTypeDropdownOpen(false); setIsRouteDropdownOpen(false); setIsDeliveryStatusDropdownOpen(false); setIsEdoStatusDropdownOpen(false); setIsTransportDropdownOpen(false); }}>
                                Маршрут: {routeFilterCargo === 'all' ? 'Все' : routeFilterCargo} <ChevronDown className="w-4 h-4"/>
                            </Button>
                        </div>
                        <FilterDropdownPortal triggerRef={routeCargoButtonRef} isOpen={isRouteCargoDropdownOpen} onClose={() => setIsRouteCargoDropdownOpen(false)}>
                            <div className="dropdown-item" onClick={() => { setRouteFilterCargo('all'); setIsRouteCargoDropdownOpen(false); }}><Typography.Body>Все</Typography.Body></div>
                            <div className="dropdown-item" onClick={() => { setRouteFilterCargo('MSK – KGD'); setIsRouteCargoDropdownOpen(false); }}><Typography.Body>MSK – KGD</Typography.Body></div>
                            <div className="dropdown-item" onClick={() => { setRouteFilterCargo('KGD – MSK'); setIsRouteCargoDropdownOpen(false); }}><Typography.Body>KGD – MSK</Typography.Body></div>
                        </FilterDropdownPortal>
                        </>
                        )}
                        <CustomPeriodModal
                            isOpen={isCustomModalOpen}
                            onClose={() => setIsCustomModalOpen(false)}
                            dateFrom={customDateFrom}
                            dateTo={customDateTo}
                            onApply={(f, t) => { setCustomDateFrom(f); setCustomDateTo(t); setDateFilter('период'); }}
                        />
                    </div>
                </div>
                )}
            </div>
            {docSection === 'Счета' && (
            <>
            {!loading && !error && filteredItems.length > 0 && (
                <DocumentsSummaryCard
                    sum={documentsSummary.sum}
                    count={documentsSummary.count}
                    showSums={showSums}
                />
            )}
            {(loading || !!error) && <DocumentsStateBlocks loading={loading} error={error} emptyText="" />}
            {!loading && !error && tableModeEffective && sortedGroupedByCustomer.length > 0 && (
                <div className="cargo-card" style={{ overflowX: 'auto', marginBottom: '1rem' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-hover)' }}>
                                <th style={{ padding: '0.5rem 0.4rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleTableSort('customer')} title="Сортировка">Заказчик {tableSortColumn === 'customer' && (tableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                {showSums && <th style={{ padding: '0.5rem 0.4rem', textAlign: 'right', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleTableSort('sum')} title="Сортировка">Сумма {tableSortColumn === 'sum' && (tableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>}
                                <th style={{ padding: '0.5rem 0.4rem', textAlign: 'right', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleTableSort('count')} title="Сортировка">Счетов {tableSortColumn === 'count' && (tableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedGroupedByCustomer.map((row, i) => (
                                <React.Fragment key={i}>
                                    <tr style={{ borderBottom: '1px solid var(--color-border)', cursor: 'pointer', background: expandedTableCustomer === row.customer ? 'var(--color-bg-hover)' : undefined }} onClick={() => setExpandedTableCustomer(prev => prev === row.customer ? null : row.customer)} title={expandedTableCustomer === row.customer ? 'Свернуть' : 'Показать счета'}>
                                        <td style={{ padding: '0.5rem 0.4rem', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={stripOoo(row.customer)}>{stripOoo(row.customer)}</td>
                                        {showSums && <td style={{ padding: '0.5rem 0.4rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{formatCurrency(row.sum)}</td>}
                                        <td style={{ padding: '0.5rem 0.4rem', textAlign: 'right' }}>{row.items.length}</td>
                                    </tr>
                                    {expandedTableCustomer === row.customer && (
                                        <tr key={`${i}-detail`}>
                                            <td colSpan={showSums ? 3 : 2} style={{ padding: 0, borderBottom: '1px solid var(--color-border)', verticalAlign: 'top', background: 'var(--color-bg-primary)' }}>
                                                <div style={{ padding: '0.5rem', overflowX: 'auto' }}>
                                                    <table className="doc-inner-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                                        <thead>
                                                            <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-hover)' }}>
                                                                <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleInnerTableSort('number'); }} title="Сортировка">Номер {innerTableSortColumn === 'number' && (innerTableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                                <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} className="doc-inner-table-date" onClick={(e) => { e.stopPropagation(); handleInnerTableSort('date'); }} title="Сортировка">Дата {innerTableSortColumn === 'date' && (innerTableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                                <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleInnerTableSort('status'); }} title="Сортировка">Статус {innerTableSortColumn === 'status' && (innerTableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                                <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleInnerTableSort('deliveryStatus'); }} title="Сортировка">Статус перевозки {innerTableSortColumn === 'deliveryStatus' && (innerTableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                                <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} className="doc-inner-table-route" onClick={(e) => { e.stopPropagation(); handleInnerTableSort('route'); }} title="Сортировка">Маршрут {innerTableSortColumn === 'route' && (innerTableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                                {showSums && <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleInnerTableSort('sum'); }} title="Сортировка">Сумма {innerTableSortColumn === 'sum' && (innerTableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>}
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {sortInvoices(row.items).map((inv: any, j: number) => {
                                                                const inum = inv.Number ?? inv.number ?? inv.Номер ?? inv.N ?? '';
                                                                const idt = inv.DateDoc ?? inv.Date ?? inv.date ?? inv.Дата ?? '';
                                                                const isum = inv.SumDoc ?? inv.Sum ?? inv.sum ?? inv.Сумма ?? inv.Amount ?? 0;
                                                                const ist = normalizeInvoiceStatus(inv.Status ?? inv.State ?? inv.state ?? inv.Статус ?? inv.status ?? inv.PaymentStatus ?? '');
                                                                const istBadgeStyle = ist === 'Оплачен' ? { bg: 'rgba(34, 197, 94, 0.2)', color: '#22c55e' } : ist === 'Оплачен частично' ? { bg: 'rgba(234, 179, 8, 0.2)', color: '#ca8a04' } : ist === 'Не оплачен' ? { bg: 'rgba(239, 68, 68, 0.2)', color: '#ef4444' } : { bg: 'var(--color-panel-secondary)', color: 'var(--color-text-secondary)' };
                                                                const firstCargoNum = getFirstCargoNumberFromInvoice(inv);
                                                                const deliveryState = firstCargoNum ? cargoStateByNumber.get(normCargoKey(firstCargoNum)) : undefined;
                                                                return (
                                                                    <tr key={inum || j} style={{ borderBottom: '1px solid var(--color-border)', cursor: 'pointer' }} onClick={(ev) => { ev.stopPropagation(); setSelectedInvoice(inv); }} title="Открыть счёт">
                                                                        <td style={{ padding: '0.35rem 0.3rem' }}>{formatInvoiceNumber(inum)}</td>
                                                                        <td className="doc-inner-table-date" style={{ padding: '0.35rem 0.3rem' }}><DateText value={typeof idt === 'string' ? idt : idt ? String(idt) : undefined} /></td>
                                                                        <td className="doc-inner-table-status" style={{ padding: '0.35rem 0.3rem' }}>{ist ? <span className="role-badge" style={{ fontSize: '0.7rem', fontWeight: 600, padding: '0.15rem 0.35rem', borderRadius: '999px', background: istBadgeStyle.bg, color: istBadgeStyle.color, border: '1px solid var(--color-border)', whiteSpace: 'nowrap', display: 'inline-block' }}>{ist}</span> : '—'}</td>
                                                                        <td style={{ padding: '0.35rem 0.3rem' }}>
                                                                            {perevozkiLoading ? <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--color-text-secondary)' }} /> : <StatusBadge status={deliveryState} />}
                                                                        </td>
                                                                        <td className="doc-inner-table-route" style={{ padding: '0.35rem 0.3rem' }}>
                                                                            {perevozkiLoading ? <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--color-text-secondary)' }} /> : <span className="role-badge" style={{ fontSize: '0.7rem', fontWeight: 600, padding: '0.15rem 0.35rem', borderRadius: '999px', background: 'rgba(59, 130, 246, 0.15)', color: 'var(--color-primary-blue)', border: '1px solid rgba(59, 130, 246, 0.4)', whiteSpace: 'nowrap', display: 'inline-block' }}>{(firstCargoNum ? cargoRouteByNumber.get(normCargoKey(firstCargoNum)) : null) || '—'}</span>}
                                                                        </td>
                                                                        {showSums && <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right' }}>{isum != null ? formatCurrency(isum) : '—'}</td>}
                                                                    </tr>
                                                                );
                                                            })}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            {!loading && !error && filteredItems.length > 0 && !tableModeEffective && (
                <div className="cargo-list">
                    {filteredItems.map((row, idx) => {
                        const num = row.Number ?? row.number ?? row.Номер ?? row.N ?? '';
                        const dt = row.DateDoc ?? row.Date ?? row.date ?? row.Дата ?? '';
                        const payTill = getPayTillDate(typeof dt === 'string' ? dt : dt ? String(dt) : undefined);
                        const cust = row.Customer ?? row.customer ?? row.Контрагент ?? row.Contractor ?? row.Organization ?? '';
                        const sum = row.SumDoc ?? row.Sum ?? row.sum ?? row.Сумма ?? row.Amount ?? 0;
                        const rawStatus = row.Status ?? row.State ?? row.state ?? row.Статус ?? '';
                        const st = (normalizeInvoiceStatus(rawStatus) || rawStatus) as string;
                        const badgeStyle = st === 'Оплачен' ? { bg: 'rgba(34, 197, 94, 0.2)', color: '#22c55e' } : st === 'Оплачен частично' ? { bg: 'rgba(234, 179, 8, 0.2)', color: '#ca8a04' } : st === 'Не оплачен' ? { bg: 'rgba(239, 68, 68, 0.2)', color: '#ef4444' } : { bg: 'var(--color-panel-secondary)', color: 'var(--color-text-secondary)' };
                        return (
                            <Panel key={num || idx} className="cargo-card" onClick={() => setSelectedInvoice(row)} style={{ cursor: 'pointer', marginBottom: '0.75rem', position: 'relative' }}>
                                <Flex justify="space-between" align="start" style={{ marginBottom: '0.5rem', minWidth: 0, overflow: 'hidden' }}>
                                    <Flex align="center" gap="0.5rem" style={{ flexWrap: 'wrap', flex: '0 1 auto', minWidth: 0, maxWidth: '60%' }}>
                                        <Typography.Body style={{ fontWeight: 600, fontSize: '1rem', color: badgeStyle.color }}>{formatInvoiceNumber(num)}</Typography.Body>
                                    </Flex>
                                    <Flex align="center" gap="0.5rem" style={{ flexShrink: 0 }}>
                                        <Button style={{ padding: '0.25rem', minWidth: 'auto', background: 'transparent', border: 'none', cursor: 'pointer' }} onClick={e => { e.stopPropagation(); const lines = [`Счёт: ${formatInvoiceNumber(num)}`, cust && `Заказчик: ${stripOoo(String(cust))}`, sum != null && `Сумма: ${formatCurrency(sum)}`, dt && `Дата: ${typeof dt === 'string' ? dt : String(dt)}`, payTill && `Оплата до: ${payTill}`].filter(Boolean); const text = lines.join('\n'); if (typeof navigator !== 'undefined' && (navigator as any).share) { (navigator as any).share({ title: `Счёт ${formatInvoiceNumber(num)}`, text }).catch(() => {}); } else { try { navigator.clipboard?.writeText(text); } catch {} } }} title="Поделиться"><Share2 className="w-4 h-4" style={{ color: 'var(--color-text-secondary)' }} /></Button>
                                        <Button style={{ padding: '0.25rem', minWidth: 'auto', background: 'transparent', border: 'none', cursor: 'pointer' }} onClick={e => { e.stopPropagation(); toggleInvoiceFavorite(String(num || '')); }} title={isInvoiceFavorite(String(num || '')) ? 'Удалить из избранного' : 'В избранное'}>
                                            <Heart className="w-4 h-4" style={{ fill: isInvoiceFavorite(String(num || '')) ? '#ef4444' : 'transparent', color: isInvoiceFavorite(String(num || '')) ? '#ef4444' : 'var(--color-text-secondary)' }} />
                                        </Button>
                                        <Calendar className="w-4 h-4 text-theme-secondary" />
                                        <Typography.Label className="text-theme-secondary" style={{ fontSize: '0.85rem' }}>
                                            <DateText value={typeof dt === 'string' ? dt : dt ? String(dt) : undefined} />
                                        </Typography.Label>
                                    </Flex>
                                </Flex>
                                <Flex justify="space-between" align="center" style={{ marginBottom: '0.5rem' }}>
                                    {st && <span className="role-badge" style={{ fontSize: '0.65rem', fontWeight: 600, padding: '0.15rem 0.4rem', borderRadius: '999px', background: badgeStyle.bg, color: badgeStyle.color, border: '1px solid var(--color-border)', whiteSpace: 'nowrap' }}>{st}</span>}
                                    <Typography.Body style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--color-text-primary)' }}>{sum != null ? formatCurrency(sum) : '—'}</Typography.Body>
                                </Flex>
                                <Flex justify="space-between" align="center" style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                                    <Typography.Label style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }} title={stripOoo(String(cust || ''))}>{stripOoo(String(cust || '—'))}</Typography.Label>
                                    {(row.AK === true || row.AK === 'true' || row.AK === '1' || row.AK === 1) && <Ship className="w-4 h-4" style={{ flexShrink: 0, color: 'var(--color-primary-blue)' }} title="Паром" />}
                                    {!(row?.AK === true || row?.AK === 'true' || row?.AK === '1' || row?.AK === 1) && (row.CitySender || row.CityReceiver) && (
                                        <Typography.Label style={{ fontSize: '0.85rem' }}>{[cityToCode(row.CitySender), cityToCode(row.CityReceiver)].filter(Boolean).join(' – ') || ''}</Typography.Label>
                                    )}
                                </Flex>
                                {payTill && (
                                    <Flex align="center" gap="0.35rem" style={{ fontSize: '0.8rem', color: getPayTillDateColor(payTill, st === 'Оплачен') ?? 'var(--color-text-secondary)', marginTop: '0.25rem' }}>
                                        <Typography.Label>Оплата до:</Typography.Label>
                                        <DateText value={payTill} />
                                    </Flex>
                                )}
                            </Panel>
                        );
                    })}
                </div>
            )}
            {selectedInvoice && (
                <InvoiceDetailModal
                    item={selectedInvoice}
                    isOpen={!!selectedInvoice}
                    onClose={() => setSelectedInvoice(null)}
                    onOpenCargo={(cargoNumber) => {
                        setSelectedInvoice(null);
                        setTimeout(() => onOpenCargo?.(cargoNumber), 0);
                    }}
                    auth={auth}
                    cargoStateByNumber={cargoStateByNumber}
                    cargoRouteByNumber={cargoRouteByNumber}
                    perevozkiLoading={perevozkiLoading}
                />
            )}
            {!loading && !error && filteredItems.length === 0 && (
                <Typography.Body style={{ color: 'var(--color-text-secondary)', padding: '2rem 0' }}>Нет счетов за выбранный период</Typography.Body>
            )}
            </>
            )}
            {docSection === 'УПД' && (
            <>
            {!actsLoading && !actsError && filteredActs.length > 0 && (
                <DocumentsSummaryCard
                    sum={actsSummary.sum}
                    count={actsSummary.count}
                    showSums={showSums}
                />
            )}
            {(actsLoading || !!actsError) && <DocumentsStateBlocks loading={actsLoading} error={actsError} emptyText="" />}
            {!actsLoading && !actsError && tableModeEffective && sortedGroupedActsByCustomer.length > 0 && (
                <div className="cargo-card" style={{ overflowX: 'auto', marginBottom: '1rem' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-hover)' }}>
                                <th style={{ padding: '0.5rem 0.4rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleTableSort('customer')} title="Сортировка">Заказчик {tableSortColumn === 'customer' && (tableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                {showSums && <th style={{ padding: '0.5rem 0.4rem', textAlign: 'right', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleTableSort('sum')} title="Сортировка">Сумма {tableSortColumn === 'sum' && (tableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>}
                                <th style={{ padding: '0.5rem 0.4rem', textAlign: 'right', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleTableSort('count')} title="Сортировка">УПД {tableSortColumn === 'count' && (tableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedGroupedActsByCustomer.map((row, i) => (
                                <React.Fragment key={i}>
                                    <tr style={{ borderBottom: '1px solid var(--color-border)', cursor: 'pointer', background: expandedTableActCustomer === row.customer ? 'var(--color-bg-hover)' : undefined }} onClick={() => setExpandedTableActCustomer(prev => prev === row.customer ? null : row.customer)} title={expandedTableActCustomer === row.customer ? 'Свернуть' : 'Показать УПД'}>
                                        <td style={{ padding: '0.5rem 0.4rem', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={stripOoo(row.customer)}>{stripOoo(row.customer)}</td>
                                        {showSums && <td style={{ padding: '0.5rem 0.4rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{formatCurrency(row.sum)}</td>}
                                        <td style={{ padding: '0.5rem 0.4rem', textAlign: 'right' }}>{row.items.length}</td>
                                    </tr>
                                    {expandedTableActCustomer === row.customer && (
                                        <tr key={`${i}-detail`}>
                                            <td colSpan={showSums ? 3 : 2} style={{ padding: 0, borderBottom: '1px solid var(--color-border)', verticalAlign: 'top', background: 'var(--color-bg-primary)' }}>
                                                <div style={{ padding: '0.5rem', overflowX: 'auto' }}>
                                                    <table className="doc-inner-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                                        <thead>
                                                            <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-hover)' }}>
                                                                <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleInnerTableActSort('number'); }} title="Сортировка">Номер {innerTableActSortColumn === 'number' && (innerTableActSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                                <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} className="doc-inner-table-date" onClick={(e) => { e.stopPropagation(); handleInnerTableActSort('date'); }} title="Сортировка">Дата {innerTableActSortColumn === 'date' && (innerTableActSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                                <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleInnerTableActSort('invoice'); }} title="Сортировка">Счёт {innerTableActSortColumn === 'invoice' && (innerTableActSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                                {showSums && <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleInnerTableActSort('sum'); }} title="Сортировка">Сумма {innerTableActSortColumn === 'sum' && (innerTableActSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>}
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {sortActs(row.items).map((act: any, j: number) => {
                                                                const anum = act.Number ?? act.number ?? '';
                                                                const adt = act.DateDoc ?? act.Date ?? act.date ?? '';
                                                                const ainv = act.Invoice ?? act.invoice ?? act.Счёт ?? '';
                                                                const asum = act.SumDoc ?? act.Sum ?? act.sum ?? 0;
                                                                return (
                                                                    <tr key={anum || j} style={{ borderBottom: '1px solid var(--color-border)', cursor: 'pointer' }} onClick={(ev) => { ev.stopPropagation(); setSelectedAct(act); }} title="Открыть УПД">
                                                                        <td style={{ padding: '0.35rem 0.3rem' }}>{formatInvoiceNumber(String(anum))}</td>
                                                                        <td className="doc-inner-table-date" style={{ padding: '0.35rem 0.3rem' }}><DateText value={typeof adt === 'string' ? adt : adt ? String(adt) : undefined} /></td>
                                                                        <td style={{ padding: '0.35rem 0.3rem' }}>{ainv ? formatInvoiceNumber(String(ainv)) : '—'}</td>
                                                                        {showSums && <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right' }}>{asum != null ? formatCurrency(asum) : '—'}</td>}
                                                                    </tr>
                                                                );
                                                            })}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            {!actsLoading && !actsError && filteredActs.length > 0 && !tableModeEffective && (
                <div className="cargo-list">
                    {filteredActs.map((act: any, idx: number) => {
                        const num = act.Number ?? act.number ?? '';
                        const dateDoc = act.DateDoc ?? act.Date ?? act.date ?? '';
                        const sumDoc = act.SumDoc ?? act.Sum ?? act.sum ?? 0;
                        const cust = act.Customer ?? act.customer ?? act.Контрагент ?? act.Contractor ?? act.Organization ?? '';
                        const invoiceNum = act.Invoice ?? act.invoice ?? '';
                        return (
                            <Panel key={num || idx} className="cargo-card" onClick={() => setSelectedAct(act)} style={{ cursor: 'pointer', marginBottom: '0.75rem', position: 'relative' }}>
                                <Flex justify="space-between" align="start" style={{ marginBottom: '0.5rem', minWidth: 0, overflow: 'hidden' }}>
                                    <Flex align="center" gap="0.5rem" style={{ flexWrap: 'wrap', flex: '0 1 auto', minWidth: 0, maxWidth: '60%' }}>
                                        <Typography.Body style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--color-text-primary)' }}>{formatInvoiceNumber(String(num))}</Typography.Body>
                                    </Flex>
                                    <Flex align="center" gap="0.5rem" style={{ flexShrink: 0 }}>
                                        <Button style={{ padding: '0.25rem', minWidth: 'auto', background: 'transparent', border: 'none', cursor: 'pointer' }} onClick={e => { e.stopPropagation(); const lines = [`УПД: ${formatInvoiceNumber(String(num))}`, cust && `Заказчик: ${stripOoo(String(cust))}`, sumDoc != null && `Сумма: ${formatCurrency(sumDoc)}`, dateDoc && `Дата: ${typeof dateDoc === 'string' ? dateDoc : String(dateDoc)}`, invoiceNum && `Счёт: ${formatInvoiceNumber(String(invoiceNum))}`].filter(Boolean); const text = lines.join('\n'); if (typeof navigator !== 'undefined' && (navigator as any).share) { (navigator as any).share({ title: `УПД ${formatInvoiceNumber(String(num))}`, text }).catch(() => {}); } else { try { navigator.clipboard?.writeText(text); } catch {} } }} title="Поделиться"><Share2 className="w-4 h-4" style={{ color: 'var(--color-text-secondary)' }} /></Button>
                                        <span style={{ padding: '0.25rem', display: 'flex', alignItems: 'center', color: 'var(--color-text-secondary)', opacity: 0.5 }} title="Избранное"><Heart className="w-4 h-4" /></span>
                                        <Calendar className="w-4 h-4 text-theme-secondary" />
                                        <Typography.Label className="text-theme-secondary" style={{ fontSize: '0.85rem' }}>
                                            <DateText value={typeof dateDoc === 'string' ? dateDoc : dateDoc ? String(dateDoc) : undefined} />
                                        </Typography.Label>
                                    </Flex>
                                </Flex>
                                {showSums && (
                                <Flex justify="space-between" align="center" style={{ marginBottom: '0.5rem' }}>
                                    <span />
                                    <Typography.Body style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--color-text-primary)' }}>{sumDoc != null ? formatCurrency(sumDoc) : '—'}</Typography.Body>
                                </Flex>
                                )}
                                <Flex justify="space-between" align="center" style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                                    <Typography.Label style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }} title={stripOoo(String(cust || ''))}>{stripOoo(String(cust || '—'))}</Typography.Label>
                                    {(act.AK === true || act.AK === 'true' || act.AK === '1' || act.AK === 1) && <Ship className="w-4 h-4" style={{ flexShrink: 0, color: 'var(--color-primary-blue)' }} title="Паром" />}
                                    {!(act?.AK === true || act?.AK === 'true' || act?.AK === '1' || act?.AK === 1) && (act.CitySender || act.CityReceiver) && (
                                        <Typography.Label style={{ fontSize: '0.85rem' }}>{[cityToCode(act.CitySender), cityToCode(act.CityReceiver)].filter(Boolean).join(' – ') || ''}</Typography.Label>
                                    )}
                                    {!(act?.AK === true || act?.AK === 'true' || act?.AK === '1' || act?.AK === 1) && !(act.CitySender || act.CityReceiver) && invoiceNum && (
                                        <Typography.Label style={{ fontSize: '0.85rem' }}>Счёт {formatInvoiceNumber(String(invoiceNum))}</Typography.Label>
                                    )}
                                </Flex>
                            </Panel>
                        );
                    })}
                </div>
            )}
            {!actsLoading && !actsError && filteredActs.length === 0 && (
                <Typography.Body style={{ color: 'var(--color-text-secondary)', padding: '2rem 0' }}>Нет УПД за выбранный период</Typography.Body>
            )}
            {selectedAct && (
                <ActDetailModal
                    item={selectedAct}
                    isOpen={!!selectedAct}
                    onClose={() => setSelectedAct(null)}
                    onOpenInvoice={(inv) => {
                        setSelectedAct(null);
                        setDocSection('Счета');
                        setSelectedInvoice(inv);
                    }}
                    invoices={items}
                    onOpenCargo={(cargoNumber) => {
                        setSelectedAct(null);
                        setTimeout(() => onOpenCargo?.(cargoNumber), 0);
                    }}
                    auth={auth}
                />
            )}
            </>
            )}
            {docSection === 'Заявки' && (
            <>
            {(ordersLoading || !!ordersError) && <DocumentsStateBlocks loading={ordersLoading} error={ordersError} emptyText="" />}
            {!ordersLoading && !ordersError && orderRowsSorted.length > 0 && (
                <div className="cargo-card" style={{ overflowX: 'auto', marginBottom: '1rem' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-hover)' }}>
                                <th style={{ padding: '0.5rem 0.4rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleOrdersSort('date')} title="Сортировка">Дата {ordersSortColumn === 'date' && (ordersSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                <th style={{ padding: '0.5rem 0.4rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleOrdersSort('pickupDate')} title="Сортировка">Дата забора план {ordersSortColumn === 'pickupDate' && (ordersSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                <th style={{ padding: '0.5rem 0.4rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleOrdersSort('number')} title="Сортировка">Номер заявки {ordersSortColumn === 'number' && (ordersSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                <th style={{ padding: '0.5rem 0.4rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleOrdersSort('clientNumber')} title="Сортировка">Номер заявки заказчика {ordersSortColumn === 'clientNumber' && (ordersSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                {effectiveServiceMode && <th style={{ padding: '0.5rem 0.4rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleOrdersSort('customer')} title="Сортировка">Заказчик {ordersSortColumn === 'customer' && (ordersSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>}
                                <th style={{ padding: '0.5rem 0.4rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleOrdersSort('sender')} title="Сортировка">Отправитель {ordersSortColumn === 'sender' && (ordersSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                <th style={{ padding: '0.5rem 0.4rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleOrdersSort('receiver')} title="Сортировка">Получатель {ordersSortColumn === 'receiver' && (ordersSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                <th style={{ padding: '0.5rem 0.4rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleOrdersSort('route')} title="Сортировка">Маршрут {ordersSortColumn === 'route' && (ordersSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                {effectiveServiceMode && <th style={{ padding: '0.5rem 0.4rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleOrdersSort('comment')} title="Сортировка">Комментарий {ordersSortColumn === 'comment' && (ordersSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {orderRowsSorted.map((row: any, idx: number) => {
                                const rawDate = row?.Дата ?? row?.DateZayavki ?? row?.Date ?? row?.date ?? '';
                                const requestNumber = String(row?.НомерЗаявки ?? row?.Номер ?? row?.Number ?? row?.number ?? row?.N ?? '');
                                const parcels = getRequestParcels(row);
                                const searchLower = effectiveSearchText.trim().toLowerCase();
                                const parcelMatches = searchLower ? parcels.filter((parcel: any) => getParcelSearchText(parcel).includes(searchLower)) : [];
                                const hasParcelSearchMatches = !!searchLower && parcelMatches.length > 0;
                                const parcelsToRender = hasParcelSearchMatches ? parcelMatches : parcels;
                                const sortedParcelsToRender = [...parcelsToRender].sort((a: any, b: any) => {
                                    const goodsA = Array.isArray(a?.Товары) ? (a.Товары[0] ?? {}) : (a?.Товары && typeof a.Товары === 'object' ? a.Товары : a);
                                    const goodsB = Array.isArray(b?.Товары) ? (b.Товары[0] ?? {}) : (b?.Товары && typeof b.Товары === 'object' ? b.Товары : b);
                                    const toNumber = (v: unknown) => {
                                        const n = Number(String(v ?? '').replace(',', '.'));
                                        return Number.isFinite(n) ? n : 0;
                                    };
                                    let cmp = 0;
                                    switch (ordersParcelsSortColumn) {
                                        case 'parcel':
                                            cmp = String(a?.ПосылкаНаименование ?? a?.Посылка ?? a?.ИДОтправления ?? '').localeCompare(String(b?.ПосылкаНаименование ?? b?.Посылка ?? b?.ИДОтправления ?? ''), undefined, { numeric: true });
                                            break;
                                        case 'cargo':
                                            cmp = String(a?.Перевозка ?? '').localeCompare(String(b?.Перевозка ?? ''), undefined, { numeric: true });
                                            break;
                                        case 'tmc':
                                            cmp = String(goodsA?.ТМЦ ?? '').localeCompare(String(goodsB?.ТМЦ ?? ''));
                                            break;
                                        case 'consolidation':
                                            cmp = String(goodsA?.ИДОтправления ?? '').localeCompare(String(goodsB?.ИДОтправления ?? ''), undefined, { numeric: true });
                                            break;
                                        case 'count':
                                            cmp = toNumber(goodsA?.Количество) - toNumber(goodsB?.Количество);
                                            break;
                                        case 'cost':
                                            cmp = toNumber(goodsA?.ОбъявленнаяСтоимостьТовараДляПечати ?? goodsA?.ОбъявленнаяСтоимостьТовара) - toNumber(goodsB?.ОбъявленнаяСтоимостьТовараДляПечати ?? goodsB?.ОбъявленнаяСтоимостьТовара);
                                            break;
                                    }
                                    return ordersParcelsSortOrder === 'asc' ? cmp : -cmp;
                                });
                                const cargoNumber = String(
                                    row?.НомерПеревозки ??
                                    row?.Перевозка ??
                                    row?.CargoNumber ??
                                    row?.NumberPerevozki ??
                                    parcels?.[0]?.Перевозка ??
                                    ''
                                );
                                const customer = String(row?.ЗаказчикНаименование ?? row?.Заказчик ?? row?.Customer ?? row?.customer ?? row?.Контрагент ?? row?.Contractor ?? row?.Organization ?? row?.ПлательщикНаименование ?? row?.PayerName ?? '');
                                const receiver = String(row?.ПолучательНаименование ?? row?.Получатель ?? row?.ГрузополучательНаименование ?? row?.Грузополучатель ?? row?.Receiver ?? row?.receiver ?? row?.Consignee ?? '');
                                const sender = String(row?.ОтправительНаименование ?? row?.Отправитель ?? row?.ГрузоотправительНаименование ?? row?.Грузоотправитель ?? row?.Sender ?? row?.sender ?? row?.Shipper ?? row?.Consignor ?? '');
                                const comment = String(row?.Комментарий ?? row?.Comment ?? row?.Примечание ?? row?.Note ?? '');
                                const customerRequestNumber = String(row?.НомерЗаявкиКлиента ?? row?.ClientRequestNumber ?? '');
                                const pickupDate = String(row?.ДатаЗабораПлан ?? row?.PickupDatePlan ?? '');
                                const rowKey = `${requestNumber || 'row'}-${cargoNumber || idx}`;
                                const expanded = expandedOrderRow === rowKey;
                                const senderPoint = String(row?.ПунктОтправкиНаименование ?? row?.ПунктОтправки ?? row?.ПунктОтправления ?? row?.АдресОтправки ?? row?.SenderPoint ?? '');
                                const destinationPoint = String(row?.ПунктНазначенияНаименование ?? row?.ПунктНазначения ?? row?.ПунктДоставки ?? row?.ReceiverPoint ?? row?.DestinationPoint ?? '');
                                const route = [cityToCode(senderPoint) || senderPoint, cityToCode(destinationPoint) || destinationPoint].filter(Boolean).join(' – ') || '—';
                                return (
                                    <React.Fragment key={rowKey}>
                                        <tr
                                            style={{ borderBottom: '1px solid var(--color-border)', cursor: 'pointer', background: expanded ? 'var(--color-bg-hover)' : undefined }}
                                            onClick={() => setExpandedOrderRow((prev) => (prev === rowKey ? null : rowKey))}
                                            title={expanded ? 'Свернуть' : 'Показать детали заявки'}
                                        >
                                            <td style={{ padding: '0.5rem 0.4rem', whiteSpace: 'nowrap' }}><DateText value={rawDate ? String(rawDate) : undefined} /></td>
                                            <td style={{ padding: '0.5rem 0.4rem', whiteSpace: 'nowrap' }}><DateText value={pickupDate || undefined} /></td>
                                            <td style={{ padding: '0.5rem 0.4rem', whiteSpace: 'nowrap' }}>{requestNumber ? formatInvoiceNumber(requestNumber) : '—'}</td>
                                            <td style={{ padding: '0.5rem 0.4rem', whiteSpace: 'nowrap' }}>{customerRequestNumber || '—'}</td>
                                            {effectiveServiceMode && (
                                                <td
                                                    style={{
                                                        padding: '0.5rem 0.4rem',
                                                        maxWidth: 220,
                                                        verticalAlign: 'top',
                                                    }}
                                                    title={stripOoo(customer) || '—'}
                                                >
                                                    <div
                                                        style={{
                                                            overflow: 'hidden',
                                                            display: '-webkit-box',
                                                            WebkitLineClamp: 2,
                                                            WebkitBoxOrient: 'vertical',
                                                        }}
                                                    >
                                                        {stripOoo(customer) || '—'}
                                                    </div>
                                                </td>
                                            )}
                                            <td
                                                style={{
                                                    padding: '0.5rem 0.4rem',
                                                    maxWidth: 220,
                                                    verticalAlign: 'top',
                                                }}
                                                title={stripOoo(sender) || '—'}
                                            >
                                                <div
                                                    style={{
                                                        overflow: 'hidden',
                                                        display: '-webkit-box',
                                                        WebkitLineClamp: 2,
                                                        WebkitBoxOrient: 'vertical',
                                                    }}
                                                >
                                                    {stripOoo(sender) || '—'}
                                                </div>
                                            </td>
                                            <td
                                                style={{
                                                    padding: '0.5rem 0.4rem',
                                                    maxWidth: 220,
                                                    verticalAlign: 'top',
                                                }}
                                                title={stripOoo(receiver) || '—'}
                                            >
                                                <div
                                                    style={{
                                                        overflow: 'hidden',
                                                        display: '-webkit-box',
                                                        WebkitLineClamp: 2,
                                                        WebkitBoxOrient: 'vertical',
                                                    }}
                                                >
                                                    {stripOoo(receiver) || '—'}
                                                </div>
                                            </td>
                                            <td style={{ padding: '0.5rem 0.4rem' }}>
                                                <span className="role-badge" style={{ fontSize: '0.7rem', fontWeight: 600, padding: '0.15rem 0.35rem', borderRadius: '999px', background: 'rgba(59, 130, 246, 0.15)', color: 'var(--color-primary-blue)', border: '1px solid rgba(59, 130, 246, 0.4)', whiteSpace: 'nowrap', display: 'inline-block' }}>
                                                    {route}
                                                </span>
                                            </td>
                                            {effectiveServiceMode && <td style={{ padding: '0.5rem 0.4rem' }}>{comment || '—'}</td>}
                                        </tr>
                                        {expanded && (
                                            <tr>
                                                <td colSpan={effectiveServiceMode ? 9 : 7} style={{ padding: 0, borderBottom: '1px solid var(--color-border)', verticalAlign: 'top', background: 'var(--color-bg-primary)' }}>
                                                    <div style={{ padding: '0.75rem', borderBottom: '1px solid var(--color-border)' }}>
                                                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(170px, 220px) 1fr', gap: '0.35rem 0.75rem', fontSize: '0.85rem' }}>
                                                            <Typography.Body style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>Заказчик:</Typography.Body>
                                                            <Typography.Body>{customer || '—'}</Typography.Body>
                                                            <Typography.Body style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>Пункт отправки:</Typography.Body>
                                                            <Typography.Body>{senderPoint || '—'}</Typography.Body>
                                                            <Typography.Body style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>Отправитель:</Typography.Body>
                                                            <Typography.Body>{sender || '—'}</Typography.Body>
                                                            <Typography.Body style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>Пункт назначения:</Typography.Body>
                                                            <Typography.Body>{destinationPoint || '—'}</Typography.Body>
                                                            <Typography.Body style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>Получатель:</Typography.Body>
                                                            <Typography.Body>{receiver || '—'}</Typography.Body>
                                                        </div>
                                                    </div>
                                                    <div style={{ padding: '0.5rem', overflowX: 'auto' }}>
                                                        {parcelsToRender.length === 0 ? (
                                                            <Typography.Body style={{ color: 'var(--color-text-secondary)', padding: '0.5rem 0.25rem' }}>Нет данных по посылкам</Typography.Body>
                                                        ) : (
                                                            <>
                                                            <table className="doc-inner-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                                                <thead>
                                                                    <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-hover)' }}>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleOrdersParcelsSort('parcel'); }} title="Сортировка">Посылка {ordersParcelsSortColumn === 'parcel' && (ordersParcelsSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleOrdersParcelsSort('cargo'); }} title="Сортировка">Консолидация {ordersParcelsSortColumn === 'cargo' && (ordersParcelsSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleOrdersParcelsSort('tmc'); }} title="Сортировка">Номенклатура {ordersParcelsSortColumn === 'tmc' && (ordersParcelsSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleOrdersParcelsSort('consolidation'); }} title="Сортировка">Консолидация {ordersParcelsSortColumn === 'consolidation' && (ordersParcelsSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleOrdersParcelsSort('count'); }} title="Сортировка">Кол-во {ordersParcelsSortColumn === 'count' && (ordersParcelsSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleOrdersParcelsSort('cost'); }} title="Сортировка">Стоимость {ordersParcelsSortColumn === 'cost' && (ordersParcelsSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {sortedParcelsToRender.map((parcel: any, parcelIdx: number) => {
                                                                        const goodsRaw = parcel?.Товары;
                                                                        const goods = Array.isArray(goodsRaw)
                                                                            ? (goodsRaw[0] ?? {})
                                                                            : (goodsRaw && typeof goodsRaw === 'object' ? goodsRaw : parcel);
                                                                        return (
                                                                            <tr
                                                                                key={`${rowKey}-parcel-${parcel?.Посылка ?? parcelIdx}`}
                                                                                style={{
                                                                                    borderBottom: '1px solid var(--color-border)',
                                                                                    background: hasParcelSearchMatches ? 'rgba(37, 99, 235, 0.08)' : undefined,
                                                                                }}
                                                                            >
                                                                                <td style={{ padding: '0.35rem 0.3rem', whiteSpace: 'nowrap' }}>{parcel?.ПосылкаНаименование ?? parcel?.Посылка ?? parcel?.ИДОтправления ?? '—'}</td>
                                                                                <td style={{ padding: '0.35rem 0.3rem', whiteSpace: 'nowrap' }}>{parcel?.Перевозка ?? '—'}</td>
                                                                                <td style={{ padding: '0.35rem 0.3rem' }}>{goods?.ТМЦ ?? '—'}</td>
                                                                                <td style={{ padding: '0.35rem 0.3rem', whiteSpace: 'nowrap' }}>{goods?.ИДОтправления ?? '—'}</td>
                                                                                <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{goods?.Количество ?? '—'}</td>
                                                                                <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{goods?.ОбъявленнаяСтоимостьТовараДляПечати ?? goods?.ОбъявленнаяСтоимостьТовара ?? '—'}</td>
                                                                            </tr>
                                                                        );
                                                                    })}
                                                                </tbody>
                                                            </table>
                                                            </>
                                                        )}
                                                    </div>
                                            </td>
                                        </tr>
                                    )}
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
            {!ordersLoading && !ordersError && orderRowsSorted.length === 0 && (
                <Typography.Body style={{ color: 'var(--color-text-secondary)', padding: '2rem 0' }}>Нет заявок за выбранный период</Typography.Body>
            )}
            </>
            )}
            {docSection === 'Отправки' && (
            <>
            {(sendingsLoading || !!sendingsError) && <DocumentsStateBlocks loading={sendingsLoading} error={sendingsError} emptyText="" />}
            {!sendingsLoading && !sendingsError && sendingRowsSorted.length > 0 && (
                <>
                <div className="cargo-card" style={{ padding: '0.6rem 0.75rem', marginBottom: '0.5rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <div style={{ display: 'flex', flexWrap: 'nowrap', gap: '0.35rem', overflowX: 'auto', whiteSpace: 'nowrap' }}>
                        <span className="role-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', padding: '0.15rem 0.45rem', borderRadius: '999px', background: 'rgba(37,99,235,0.12)', color: 'var(--color-primary-blue)', border: '1px solid rgba(37,99,235,0.35)', flex: '0 0 auto' }}>
                            <Ship className="w-3 h-3" /> {sendingsInfographic.ferry}
                        </span>
                        <span className="role-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', padding: '0.15rem 0.45rem', borderRadius: '999px', background: 'rgba(17,24,39,0.08)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)', flex: '0 0 auto' }}>
                            <Truck className="w-3 h-3" /> {sendingsInfographic.auto}
                        </span>
                        {sendingsInfographic.routes.map((item) => (
                            <span key={item.route} className="role-badge" style={{ fontSize: '0.72rem', padding: '0.12rem 0.42rem', borderRadius: '999px', background: 'var(--color-bg-hover)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)', whiteSpace: 'nowrap', flex: '0 0 auto' }}>
                                {item.route}: {item.count}
                            </span>
                        ))}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'nowrap', gap: '0.35rem', overflowX: 'auto', whiteSpace: 'nowrap' }}>
                        {sendingsInfographic.statusBadges.map((item) => {
                            const isActive = deliveryStatusFilterSet.has(item.key as StatusFilter);
                            return (
                                <button
                                    key={item.key}
                                    type="button"
                                    className="role-badge"
                                    onClick={() => {
                                        setDeliveryStatusFilterSet((prev) => {
                                            if (prev.size === 1 && prev.has(item.key as StatusFilter)) return new Set<StatusFilter>();
                                            return new Set<StatusFilter>([item.key as StatusFilter]);
                                        });
                                    }}
                                    style={{
                                        fontSize: '0.72rem',
                                        padding: '0.12rem 0.42rem',
                                        borderRadius: '999px',
                                        background: item.bg,
                                        color: item.color,
                                        border: isActive ? `1px solid ${item.color}` : '1px solid var(--color-border)',
                                        whiteSpace: 'nowrap',
                                        flex: '0 0 auto',
                                        cursor: 'pointer',
                                        opacity: isActive || deliveryStatusFilterSet.size === 0 ? 1 : 0.75,
                                    }}
                                >
                                    {item.label}: {item.percent}% ({item.count})
                                </button>
                            );
                        })}
                    </div>
                    </div>
                </div>
                {canEditEor && (
                    <div className="cargo-card sendings-bulk-actions-sticky" style={{ padding: '0.6rem 0.75rem', marginBottom: '0.5rem', overflow: 'visible' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap' }}>
                            <Typography.Body style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>
                                Выбрано отправок: {selectedVisibleSendingCount}
                            </Typography.Body>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', position: 'relative' }}>
                                <Button
                                    type="button"
                                    className="filter-button"
                                    disabled={bulkSendingActionLoading || selectedVisibleSendingCount === 0}
                                    onClick={() => {
                                        setBulkPlanDateOpen(false);
                                        setBulkEorMenuOpen((prev) => !prev);
                                    }}
                                    style={{ minWidth: 'auto', padding: '0.35rem 0.6rem' }}
                                >
                                    {bulkSendingActionLoading ? <Loader2 className="w-4 h-4 animate-spin" style={{ marginRight: 4 }} /> : null}
                                    EOR
                                </Button>
                                {bulkEorMenuOpen && (
                                    <div
                                        style={{
                                            position: 'absolute',
                                            top: 'calc(100% + 6px)',
                                            left: 0,
                                            zIndex: 12000,
                                            minWidth: 190,
                                            border: '1px solid var(--color-border)',
                                            borderRadius: 8,
                                            background: 'var(--color-bg-card)',
                                            boxShadow: '0 6px 18px rgba(0, 0, 0, 0.16)',
                                            padding: '0.35rem',
                                        }}
                                    >
                                        <button type="button" className="filter-button" style={{ width: '100%', justifyContent: 'flex-start', marginBottom: '0.25rem' }} onClick={() => applyBulkEorStatus('entry_allowed')}>Въезд разрешен</button>
                                        <button type="button" className="filter-button" style={{ width: '100%', justifyContent: 'flex-start', marginBottom: '0.25rem' }} onClick={() => applyBulkEorStatus('full_inspection')}>Полный досмотр</button>
                                        <button type="button" className="filter-button" style={{ width: '100%', justifyContent: 'flex-start' }} onClick={() => applyBulkEorStatus('turnaround')}>Разворот</button>
                                    </div>
                                )}
                            </div>
                        </div>
                        {(bulkSendingActionError || bulkSendingActionInfo) && (
                            <Typography.Body style={{ marginTop: '0.35rem', fontSize: '0.78rem', color: bulkSendingActionError ? 'var(--color-error)' : 'var(--color-text-secondary)' }}>
                                {bulkSendingActionError || bulkSendingActionInfo}
                            </Typography.Body>
                        )}
                    </div>
                )}
                <div className="cargo-card" style={{ overflowX: 'auto', marginBottom: '1rem' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-hover)' }}>
                                {canEditEor && (
                                    <th style={{ padding: '0.5rem 0.35rem', textAlign: 'center', width: 34 }}>
                                        <input
                                            type="checkbox"
                                            checked={allVisibleSendingsSelected}
                                            onChange={(e) => {
                                                const checked = e.target.checked;
                                                setSelectedSendingRowKeys(() => (checked ? new Set(visibleSendingMeta.map((row) => row.rowKey)) : new Set()));
                                            }}
                                            aria-label="Выбрать все отправки"
                                        />
                                    </th>
                                )}
                                <th style={{ padding: '0.5rem 0.4rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSendingsSort('date')} title="Сортировка">Дата {sendingsSortColumn === 'date' && (sendingsSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                <th style={{ padding: '0.5rem 0.4rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSendingsSort('number')} title="Сортировка">Номер {sendingsSortColumn === 'number' && (sendingsSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                <th style={{ padding: '0.5rem 0.4rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSendingsSort('route')} title="Сортировка">Маршрут {sendingsSortColumn === 'route' && (sendingsSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                <th style={{ padding: '0.5rem 0.4rem', textAlign: 'center', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSendingsSort('type')} title="Сортировка">Тип {sendingsSortColumn === 'type' && (sendingsSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                <th style={{ padding: '0.5rem 0.4rem', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSendingsSort('transitHours')} title="Сортировка">В пути, ч {sendingsSortColumn === 'transitHours' && (sendingsSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                <th style={{ padding: '0.5rem 0.4rem', textAlign: 'left', fontWeight: 600 }}>Статус доставки</th>
                                <th style={{ padding: '0.5rem 0.4rem', textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap' }}>Плановая дата прибытия</th>
                                <th style={{ padding: '0.5rem 0.4rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSendingsSort('vehicle')} title="Сортировка">Транспортное средство {sendingsSortColumn === 'vehicle' && (sendingsSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                <th style={{ padding: '0.5rem 0.4rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSendingsSort('comment')} title="Сортировка">Комментарий {sendingsSortColumn === 'comment' && (sendingsSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                {showEorColumn && <th style={{ padding: '0.5rem 0.4rem', textAlign: 'left', fontWeight: 600 }} title="Exit of Records (Запись о выходе)">EOR</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {sendingRowsSorted.map((row: any, idx: number) => {
                                const rawDate = row?.Дата ?? row?.Date ?? row?.date ?? '';
                                const number = String(row?.Номер ?? row?.Number ?? row?.number ?? '');
                                const vehicle = normalizeTransportDisplay(row?.АвтомобильCMRНаименование ?? row?.AutoReg ?? row?.AutoType ?? '');
                                const comment = String(row?.Комментарий ?? row?.Comment ?? '');
                                const eor = String(row?.EOR ?? row?.ЗаписьОВыходе ?? row?.ExitOfRecords ?? '').trim();
                                const rowKey = getSendingRowKey(row, idx);
                                const eorStatuses = (() => {
                                    const withNormalized = (raw: string) => {
                                        const base = String(raw ?? '').trim();
                                        if (!base) return [] as string[];
                                        const compact = base.replace(/\D+/g, '');
                                        return compact && compact !== base ? [base, compact] : [base];
                                    };
                                    const candidates = [
                                        ...withNormalized(rowKey),
                                        ...withNormalized(number),
                                        ...withNormalized(String(row?.ИДОтправления ?? '').trim()),
                                    ];
                                    for (const candidate of Array.from(new Set(candidates))) {
                                        const statuses = eorStatusMap[candidate];
                                        if (Array.isArray(statuses) && statuses.length > 0) return statuses;
                                    }
                                    return [] as EorStatus[];
                                })();
                                const parcels = getRequestParcels(row);
                                const searchLower = effectiveSearchText.trim().toLowerCase();
                                const parcelMatches = searchLower ? parcels.filter((parcel: any) => getParcelSearchText(parcel).includes(searchLower)) : [];
                                const hasParcelSearchMatches = !!searchLower && parcelMatches.length > 0;
                                const parcelsToRender = hasParcelSearchMatches ? parcelMatches : parcels;
                                const transportType = getSendingTransportType(vehicle);
                                const sendingStatusKey = getSendingStatusKey(row);
                                const sendingStatusLabel = sendingStatusKey === 'all' ? '' : STATUS_MAP[sendingStatusKey];
                                const transitHours = getSendingTransitHours(row);
                                const transitDays = transitHours == null ? null : Math.round((transitHours / 24) * 10) / 10;
                                const plannedArrivalDate = getSendingPlannedArrivalDate(row);
                                const routeFrom = String(row?.ПунктОтправленияГородАэропорт ?? row?.CitySender ?? row?.ГородОтправления ?? '').trim();
                                const routeTo = String(row?.ПунктНазначенияГородАэропорт ?? row?.CityReceiver ?? row?.ГородНазначения ?? '').trim();
                                const route = [cityToCode(routeFrom), cityToCode(routeTo)].filter(Boolean).join(' – ') || [routeFrom, routeTo].filter(Boolean).join(' – ') || '—';
                                const expanded = expandedSendingRow === rowKey;
                                return (
                                    <React.Fragment key={rowKey}>
                                        <tr
                                            style={{ borderBottom: '1px solid var(--color-border)', cursor: 'pointer', background: expanded ? 'var(--color-bg-hover)' : undefined }}
                                            onClick={() => setExpandedSendingRow((prev) => (prev === rowKey ? null : rowKey))}
                                            title={expanded ? 'Свернуть посылки' : 'Показать посылки'}
                                        >
                                            {canEditEor && (
                                                <td style={{ padding: '0.5rem 0.35rem', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedSendingRowKeys.has(rowKey)}
                                                        onChange={(e) => {
                                                            const checked = e.target.checked;
                                                            setSelectedSendingRowKeys((prev) => {
                                                                const next = new Set(prev);
                                                                if (checked) next.add(rowKey);
                                                                else next.delete(rowKey);
                                                                return next;
                                                            });
                                                        }}
                                                        aria-label={`Выбрать отправку ${number || rowKey}`}
                                                    />
                                                </td>
                                            )}
                                            <td style={{ padding: '0.5rem 0.4rem', whiteSpace: 'nowrap' }}><DateText value={rawDate ? String(rawDate) : undefined} /></td>
                                            <td style={{ padding: '0.5rem 0.4rem', whiteSpace: 'nowrap' }}>{number ? formatInvoiceNumber(number) : '—'}</td>
                                            <td style={{ padding: '0.5rem 0.4rem' }}>
                                                <span className="role-badge" style={{ fontSize: '0.7rem', fontWeight: 600, padding: '0.15rem 0.35rem', borderRadius: '999px', background: 'rgba(59, 130, 246, 0.15)', color: 'var(--color-primary-blue)', border: '1px solid rgba(59, 130, 246, 0.4)', whiteSpace: 'nowrap', display: 'inline-block' }}>
                                                    {route}
                                                </span>
                                            </td>
                                            <td style={{ padding: '0.5rem 0.4rem', textAlign: 'center' }}>
                                                {transportType === 'ferry' ? (
                                                    <Ship className="w-4 h-4" style={{ color: 'var(--color-primary-blue)', display: 'inline-block' }} title="Паром" />
                                                ) : transportType === 'auto' ? (
                                                    <Truck className="w-4 h-4" style={{ color: 'var(--color-text-secondary)', display: 'inline-block' }} title="Авто" />
                                                ) : '—'}
                                            </td>
                                            <td style={{ padding: '0.5rem 0.4rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                {transitHours == null ? '—' : (
                                                    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.15 }}>
                                                        <span style={sendingStatusKey === 'ready' ? { color: '#16a34a', fontWeight: 600 } : undefined}>
                                                            {Number.isInteger(transitHours) ? transitHours : transitHours.toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ч
                                                        </span>
                                                        <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.75rem' }}>
                                                            {(transitDays != null && Number.isInteger(transitDays) ? transitDays : (transitDays ?? 0).toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 }))} д
                                                        </span>
                                                    </div>
                                                )}
                                            </td>
                                            <td style={{ padding: '0.5rem 0.4rem', whiteSpace: 'nowrap' }}>
                                                {sendingStatusLabel ? <StatusBadge status={sendingStatusLabel} /> : '—'}
                                            </td>
                                            <td style={{ padding: '0.5rem 0.4rem', whiteSpace: 'nowrap' }}>
                                                {plannedArrivalDate ? <DateText value={plannedArrivalDate.toISOString()} /> : '—'}
                                            </td>
                                            <td style={{ padding: '0.5rem 0.4rem' }}>{vehicle || '—'}</td>
                                            <td style={{ padding: '0.5rem 0.4rem' }}>{comment || '—'}</td>
                                            {showEorColumn && (
                                                <td style={{ padding: '0.5rem 0.4rem', verticalAlign: 'middle' }} title="Exit of Records (Запись о выходе)">
                                                    {eorStatuses.length > 0 ? (
                                                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                                                            {eorStatuses.includes('entry_allowed') && (
                                                                <span title="Въезд разрешен"><Flag className="w-4 h-4" style={{ color: '#003399', display: 'inline-block' }} /></span>
                                                            )}
                                                            {eorStatuses.includes('full_inspection') && (
                                                                <span title="Полный досмотр"><ClipboardList className="w-4 h-4" style={{ color: 'var(--color-text-primary)', display: 'inline-block' }} /></span>
                                                            )}
                                                            {eorStatuses.includes('turnaround') && (
                                                                <span title="Разворот" style={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
                                                                    <RotateCcw className="w-4 h-4" style={{ color: 'var(--color-text-primary)', flexShrink: 0 }} />
                                                                    <Truck className="w-3.5 h-3.5" style={{ color: 'var(--color-text-secondary)', flexShrink: 0 }} />
                                                                </span>
                                                            )}
                                                        </div>
                                                    ) : eor ? (
                                                        eor
                                                    ) : (
                                                        '—'
                                                    )}
                                                </td>
                                            )}
                                        </tr>
                                        {expanded && (
                                            <tr>
                                                <td colSpan={(showEorColumn ? 9 : 8) + (canEditEor ? 1 : 0)} style={{ padding: 0, borderBottom: '1px solid var(--color-border)', verticalAlign: 'top', background: 'var(--color-bg-primary)' }}>
                                                    <div style={{ padding: '0.5rem', overflowX: 'auto' }}>
                                                        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                                            <Button
                                                                className="filter-button"
                                                                style={{ padding: '0.35rem 0.6rem', minWidth: 'auto', background: sendingsDetailsView === 'general' ? 'var(--color-primary-blue, #2563eb)' : undefined, color: sendingsDetailsView === 'general' ? '#fff' : undefined }}
                                                                onClick={(e) => { e.stopPropagation(); setSendingsDetailsView('general'); }}
                                                            >
                                                                Общий
                                                            </Button>
                                                            <Button
                                                                className="filter-button"
                                                                style={{ padding: '0.35rem 0.6rem', minWidth: 'auto', background: sendingsDetailsView === 'byCargo' ? 'var(--color-primary-blue, #2563eb)' : undefined, color: sendingsDetailsView === 'byCargo' ? '#fff' : undefined }}
                                                                onClick={(e) => { e.stopPropagation(); setSendingsDetailsView('byCargo'); }}
                                                            >
                                                                По перевозкам
                                                            </Button>
                                                            <Button
                                                                className="filter-button"
                                                                style={{ padding: '0.35rem 0.6rem', minWidth: 'auto', background: sendingsDetailsView === 'byCustomer' && sendingsSummaryGroupBy === 'customer' ? 'var(--color-primary-blue, #2563eb)' : undefined, color: sendingsDetailsView === 'byCustomer' && sendingsSummaryGroupBy === 'customer' ? '#fff' : undefined }}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setSendingsDetailsView('byCustomer');
                                                                    setSendingsSummaryGroupBy('customer');
                                                                    setSendingsSummarySortColumn('customer');
                                                                    setSendingsSummarySortOrder('asc');
                                                                }}
                                                            >
                                                                По заказчику
                                                            </Button>
                                                            <Button
                                                                className="filter-button"
                                                                style={{ padding: '0.35rem 0.6rem', minWidth: 'auto', background: sendingsDetailsView === 'byCustomer' && sendingsSummaryGroupBy === 'receiver' ? 'var(--color-primary-blue, #2563eb)' : undefined, color: sendingsDetailsView === 'byCustomer' && sendingsSummaryGroupBy === 'receiver' ? '#fff' : undefined }}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setSendingsDetailsView('byCustomer');
                                                                    setSendingsSummaryGroupBy('receiver');
                                                                    setSendingsSummarySortColumn('customer');
                                                                    setSendingsSummarySortOrder('asc');
                                                                }}
                                                            >
                                                                По получателю
                                                            </Button>
                                                        </div>
                                                        {parcelsToRender.length === 0 ? (
                                                            <Typography.Body style={{ color: 'var(--color-text-secondary)', padding: '0.5rem 0.25rem' }}>Нет данных по посылкам</Typography.Body>
                                                        ) : sendingsDetailsView === 'general' ? (
                                                            <table className="doc-inner-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                                                <thead>
                                                                    <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-hover)' }}>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>№ пп</th>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600 }}>Перевозка</th>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600 }}>Посылка</th>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600 }}>Консолидация</th>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600 }}>Вес</th>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600 }}>Объем</th>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600 }}>Платный вес</th>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600 }}>Номенклатура</th>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>Кол-во</th>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600 }}>Стоимость</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {parcelsToRender.map((parcel: any, parcelIdx: number) => {
                                                                        const goodsRaw = parcel?.Товары;
                                                                        const goods = Array.isArray(goodsRaw) ? goodsRaw[0] : (goodsRaw && typeof goodsRaw === 'object' ? goodsRaw : {});
                                                                        return (
                                                                            <tr
                                                                                key={`${rowKey}-parcel-${parcel?.Посылка ?? parcelIdx}`}
                                                                                style={{
                                                                                    borderBottom: '1px solid var(--color-border)',
                                                                                    background: hasParcelSearchMatches ? 'rgba(37, 99, 235, 0.08)' : undefined,
                                                                                }}
                                                                            >
                                                                                <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{parcelIdx + 1}</td>
                                                                                <td style={{ padding: '0.35rem 0.3rem', whiteSpace: 'nowrap' }}>{goods?.ИДОтправления ?? '—'}</td>
                                                                                <td style={{ padding: '0.35rem 0.3rem', whiteSpace: 'nowrap' }}>{parcel?.ПосылкаНаименование ?? '—'}</td>
                                                                                <td style={{ padding: '0.35rem 0.3rem', whiteSpace: 'nowrap' }}>{parcel?.Перевозка ?? '—'}</td>
                                                                                <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{parcel?.ВесДляОтчета ?? '—'}</td>
                                                                                <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{parcel?.ОбъемДляОтчета ?? '—'}</td>
                                                                                <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{parcel?.ПлатныйВес ?? '—'}</td>
                                                                                <td style={{ padding: '0.35rem 0.3rem' }}>{goods?.ТМЦ ?? '—'}</td>
                                                                                <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{goods?.Количество ?? '—'}</td>
                                                                                <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{goods?.ОбъявленнаяСтоимостьТовараДляПечати ?? goods?.ОбъявленнаяСтоимостьТовара ?? '—'}</td>
                                                                            </tr>
                                                                        );
                                                                    })}
                                                                </tbody>
                                                            </table>
                                                        ) : sendingsDetailsView === 'byCargo' ? (
                                                            <table className="doc-inner-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                                                <thead>
                                                                    <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-hover)' }}>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSendingsSummarySort('index')} title="Сортировка">№ пп {sendingsSummarySortColumn === 'index' && (sendingsSummarySortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSendingsSummarySort('cargo')} title="Сортировка">Консолидация {sendingsSummarySortColumn === 'cargo' && (sendingsSummarySortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSendingsSummarySort('status')} title="Сортировка">Статус {sendingsSummarySortColumn === 'status' && (sendingsSummarySortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSendingsSummarySort('count')} title="Сортировка">Кол-во {sendingsSummarySortColumn === 'count' && (sendingsSummarySortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSendingsSummarySort('volume')} title="Сортировка">Объем {sendingsSummarySortColumn === 'volume' && (sendingsSummarySortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSendingsSummarySort('weight')} title="Сортировка">Вес {sendingsSummarySortColumn === 'weight' && (sendingsSummarySortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSendingsSummarySort('paidWeight')} title="Сортировка">Платный вес {sendingsSummarySortColumn === 'paidWeight' && (sendingsSummarySortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSendingsSummarySort('customer')} title="Сортировка">Заказчик {sendingsSummarySortColumn === 'customer' && (sendingsSummarySortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {(() => {
                                                                        const toNumber = (v: unknown) => {
                                                                            const raw = String(v ?? '').trim().replace(',', '.');
                                                                            const n = Number(raw);
                                                                            return Number.isFinite(n) ? n : 0;
                                                                        };
                                                                        const formatNum = (n: number) => {
                                                                            if (!Number.isFinite(n)) return '—';
                                                                            const fixed = n.toFixed(3);
                                                                            return fixed.replace(/\.?0+$/, '');
                                                                        };
                                                                        const byCargo = new Map<string, { cargo: string; status: string; count: number; volume: number; weight: number; paidWeight: number }>();
                                                                        parcelsToRender.forEach((parcel: any) => {
                                                                            const cargo = String(parcel?.Перевозка ?? '').trim() || '—';
                                                                            const prev = byCargo.get(cargo) ?? { cargo, status: '', count: 0, volume: 0, weight: 0, paidWeight: 0 };
                                                                            prev.count += 1;
                                                                            prev.volume += toNumber(parcel?.ОбъемДляОтчета);
                                                                            prev.weight += toNumber(parcel?.ВесДляОтчета);
                                                                            prev.paidWeight += toNumber(parcel?.ПлатныйВес);
                                                                            if (!prev.status || prev.status === '-') {
                                                                                const state = cargo !== '—' ? String(cargoStateByNumber.get(normCargoKey(cargo)) ?? '') : '';
                                                                                prev.status = state || prev.status;
                                                                            }
                                                                            byCargo.set(cargo, prev);
                                                                        });
                                                                        const summaryRows = Array.from(byCargo.values()).map((summary, index) => {
                                                                            const cargoKey = normCargoKey(summary.cargo);
                                                                            const sendingCustomer = cargoCustomerByNumber.get(cargoKey)
                                                                                || String(row?.Заказчик ?? row?.Customer ?? row?.customer ?? row?.Контрагент ?? row?.Contractor ?? row?.Organization ?? '');
                                                                            return { ...summary, status: normalizeStatus(summary.status || ''), customer: sendingCustomer, _index: index + 1 };
                                                                        });
                                                                        const sortedSummaryRows = [...summaryRows].sort((a, b) => {
                                                                            let cmp = 0;
                                                                            switch (sendingsSummarySortColumn) {
                                                                                case 'index':
                                                                                    cmp = a._index - b._index;
                                                                                    break;
                                                                                case 'cargo':
                                                                                    cmp = a.cargo.localeCompare(b.cargo, undefined, { numeric: true });
                                                                                    break;
                                                                                case 'status':
                                                                                    cmp = String(a.status || '').localeCompare(String(b.status || ''), 'ru');
                                                                                    break;
                                                                                case 'count':
                                                                                    cmp = a.count - b.count;
                                                                                    break;
                                                                                case 'volume':
                                                                                    cmp = a.volume - b.volume;
                                                                                    break;
                                                                                case 'weight':
                                                                                    cmp = a.weight - b.weight;
                                                                                    break;
                                                                                case 'paidWeight':
                                                                                    cmp = a.paidWeight - b.paidWeight;
                                                                                    break;
                                                                                case 'density': {
                                                                                    const dA = a.volume > 0 ? a.weight / a.volume : -Infinity;
                                                                                    const dB = b.volume > 0 ? b.weight / b.volume : -Infinity;
                                                                                    cmp = dA - dB;
                                                                                    break;
                                                                                }
                                                                                case 'customer':
                                                                                    cmp = String(a.customer || '').localeCompare(String(b.customer || ''));
                                                                                    break;
                                                                            }
                                                                            return sendingsSummarySortOrder === 'asc' ? cmp : -cmp;
                                                                        });
                                                                        const totals = summaryRows.reduce(
                                                                            (acc, s) => {
                                                                                acc.count += s.count;
                                                                                acc.volume += s.volume;
                                                                                acc.weight += s.weight;
                                                                                acc.paidWeight += s.paidWeight;
                                                                                return acc;
                                                                            },
                                                                            { count: 0, volume: 0, weight: 0, paidWeight: 0 }
                                                                        );
                                                                        return (
                                                                            <>
                                                                                {sortedSummaryRows.map((summary, parcelIdx: number) => {
                                                                                    return (
                                                                                        <tr
                                                                                            key={`${rowKey}-summary-${summary.cargo}-${parcelIdx}`}
                                                                                            style={{
                                                                                                borderBottom: '1px solid var(--color-border)',
                                                                                                background: hasParcelSearchMatches ? 'rgba(37, 99, 235, 0.08)' : undefined,
                                                                                            }}
                                                                                        >
                                                                                            <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{parcelIdx + 1}</td>
                                                                                            <td style={{ padding: '0.35rem 0.3rem', whiteSpace: 'nowrap' }}>
                                                                                                {summary.cargo && summary.cargo !== '—' ? (
                                                                                                    <button
                                                                                                        type="button"
                                                                                                        style={{ border: 'none', background: 'transparent', padding: 0, color: 'var(--color-primary-blue)', cursor: 'pointer', textDecoration: 'underline' }}
                                                                                                        onClick={(e) => { e.stopPropagation(); onOpenCargo?.(String(summary.cargo)); }}
                                                                                                        title="Открыть перевозку в Грузах"
                                                                                                    >
                                                                                                        {summary.cargo}
                                                                                                    </button>
                                                                                                ) : '—'}
                                                                                            </td>
                                                                                            <td style={{ padding: '0.35rem 0.3rem' }}><StatusBadge status={summary.status || '—'} /></td>
                                                                                            <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{summary.count}</td>
                                                                                            <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{formatNum(summary.volume)}</td>
                                                                                            <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{formatNum(summary.weight)}</td>
                                                                                            <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{formatNum(summary.paidWeight)}</td>
                                                                                            <td style={{ padding: '0.35rem 0.3rem' }}>{stripOoo(summary.customer) || '—'}</td>
                                                                                        </tr>
                                                                                    );
                                                                                })}
                                                                                <tr style={{ borderTop: '2px solid var(--color-border)', background: 'var(--color-bg-hover)' }}>
                                                                                    <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 700 }} colSpan={3}>Итого</td>
                                                                                    <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 700 }}>{totals.count}</td>
                                                                                    <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 700 }}>{formatNum(totals.volume)}</td>
                                                                                    <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 700 }}>{formatNum(totals.weight)}</td>
                                                                                    <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 700 }}>{formatNum(totals.paidWeight)}</td>
                                                                                    <td style={{ padding: '0.35rem 0.3rem', fontWeight: 700 }}>—</td>
                                                                                </tr>
                                                                            </>
                                                                        );
                                                                    })()}
                                                                </tbody>
                                                            </table>
                                                        ) : (
                                                            <>
                                                            {(() => {
                                                                const toNumber = (v: unknown) => {
                                                                    const raw = String(v ?? '').trim().replace(',', '.');
                                                                    const n = Number(raw);
                                                                    return Number.isFinite(n) ? n : 0;
                                                                };
                                                                const rowDefaultCustomer = String(row?.Заказчик ?? row?.Customer ?? row?.customer ?? row?.Контрагент ?? row?.Contractor ?? row?.Organization ?? '').trim() || '—';
                                                                const rowDefaultReceiver = String(row?.Получатель ?? row?.Грузополучатель ?? row?.Receiver ?? row?.receiver ?? row?.Consignee ?? '').trim() || '—';
                                                                const byCounterparty = new Map<string, { party: string; count: number; volume: number; weight: number; paidWeight: number; cargoNumbers: Set<string> }>();
                                                                parcelsToRender.forEach((parcel: any) => {
                                                                    const cargo = String(parcel?.Перевозка ?? '').trim();
                                                                    const customerFromParcel = String(parcel?.ЗаказчикНаименование ?? parcel?.Заказчик ?? parcel?.Customer ?? parcel?.customer ?? '').trim();
                                                                    const customerFromCargo = cargo ? String(cargoCustomerByNumber.get(normCargoKey(cargo)) ?? '').trim() : '';
                                                                    const receiverFromParcel = String(parcel?.ПолучательНаименование ?? parcel?.Получатель ?? parcel?.ГрузополучательНаименование ?? parcel?.Грузополучатель ?? parcel?.Receiver ?? parcel?.receiver ?? parcel?.Consignee ?? '').trim();
                                                                    const receiverFromCargo = cargo ? String(cargoReceiverByNumber.get(normCargoKey(cargo)) ?? '').trim() : '';
                                                                    const party = sendingsSummaryGroupBy === 'receiver'
                                                                        ? (receiverFromParcel || receiverFromCargo || rowDefaultReceiver)
                                                                        : (customerFromParcel || customerFromCargo || rowDefaultCustomer);
                                                                    const prev = byCounterparty.get(party) ?? { party, count: 0, volume: 0, weight: 0, paidWeight: 0, cargoNumbers: new Set<string>() };
                                                                    prev.count += 1;
                                                                    prev.volume += toNumber(parcel?.ОбъемДляОтчета);
                                                                    prev.weight += toNumber(parcel?.ВесДляОтчета);
                                                                    prev.paidWeight += toNumber(parcel?.ПлатныйВес);
                                                                    if (cargo) prev.cargoNumbers.add(cargo);
                                                                    byCounterparty.set(party, prev);
                                                                });
                                                                const summaryRows = Array.from(byCounterparty.values()).map((summary, index) => ({
                                                                    ...summary,
                                                                    _index: index + 1,
                                                                    selectionKey: `${rowKey}::${summary.party}`,
                                                                    cargoNumbers: Array.from(summary.cargoNumbers),
                                                                }));
                                                                const selectedSummaryRows = summaryRows.filter((summary) => selectedByCustomerSummaryKeys.has(summary.selectionKey));
                                                                const selectedByCustomerCount = selectedSummaryRows.length;
                                                                return (
                                                                    <>
                                                                        {canEditEor && (
                                                                            <div className="cargo-card" style={{ padding: '0.45rem 0.6rem', marginBottom: '0.5rem', overflow: 'visible', position: 'sticky', top: 0, zIndex: 10, background: 'var(--color-bg-primary)' }}>
                                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap' }}>
                                                                                    <Typography.Body style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                                                                                        Выбрано {sendingsSummaryGroupBy === 'receiver' ? 'получателей' : 'заказчиков'}: {selectedByCustomerCount}
                                                                                    </Typography.Body>
                                                                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', position: 'relative' }}>
                                                                                        <Button
                                                                                            type="button"
                                                                                            className="filter-button"
                                                                                            disabled={byCustomerActionLoading || selectedByCustomerCount === 0}
                                                                                            onClick={() => setByCustomerPlanDateOpen((prev) => !prev)}
                                                                                            style={{ minWidth: 'auto', padding: '0.35rem 0.6rem' }}
                                                                                        >
                                                                                            {byCustomerActionLoading ? <Loader2 className="w-4 h-4 animate-spin" style={{ marginRight: 4 }} /> : null}
                                                                                            Плановая дата
                                                                                        </Button>
                                                                                        {byCustomerPlanDateOpen && (
                                                                                            <div
                                                                                                style={{
                                                                                                    position: 'absolute',
                                                                                                    top: 'calc(100% + 6px)',
                                                                                                    left: 0,
                                                                                                    zIndex: 12000,
                                                                                                    minWidth: 220,
                                                                                                    border: '1px solid var(--color-border)',
                                                                                                    borderRadius: 8,
                                                                                                    background: 'var(--color-bg-card)',
                                                                                                    boxShadow: '0 6px 18px rgba(0, 0, 0, 0.16)',
                                                                                                    padding: '0.5rem',
                                                                                                    display: 'flex',
                                                                                                    flexDirection: 'column',
                                                                                                    gap: '0.4rem',
                                                                                                }}
                                                                                            >
                                                                                                <input
                                                                                                    type="date"
                                                                                                    value={byCustomerPlanDateValue}
                                                                                                    onChange={(e) => setByCustomerPlanDateValue(e.target.value)}
                                                                                                    className="admin-form-input"
                                                                                                />
                                                                                                <Button
                                                                                                    type="button"
                                                                                                    className="button-primary"
                                                                                                    style={{ minWidth: 'auto', padding: '0.35rem 0.55rem' }}
                                                                                                    disabled={byCustomerActionLoading || !byCustomerPlanDateValue}
                                                                                                    onClick={async () => {
                                                                                                        if (!byCustomerPlanDateValue) {
                                                                                                            setByCustomerActionError('Укажите плановую дату доставки.');
                                                                                                            return;
                                                                                                        }
                                                                                                        const cargoNumbers = Array.from(new Set(
                                                                                                            selectedSummaryRows
                                                                                                                .flatMap((summary) => summary.cargoNumbers.map((cargo) => String(cargo).trim()))
                                                                                                                .filter(Boolean)
                                                                                                        ));
                                                                                                        if (cargoNumbers.length === 0) {
                                                                                                            setByCustomerActionError(sendingsSummaryGroupBy === 'receiver' ? 'По выбранным получателям не найдены номера перевозок.' : 'По выбранным заказчикам не найдены номера перевозок.');
                                                                                                            return;
                                                                                                        }
                                                                                                        setByCustomerActionLoading(true);
                                                                                                        setByCustomerActionError(null);
                                                                                                        setByCustomerActionInfo(null);
                                                                                                        try {
                                                                                                            const resp = await fetch('/api/sendings-plan-date', {
                                                                                                                method: 'POST',
                                                                                                                headers: { 'Content-Type': 'application/json' },
                                                                                                                body: JSON.stringify({
                                                                                                                    date: byCustomerPlanDateValue,
                                                                                                                    cargoNumbers,
                                                                                                                }),
                                                                                                            });
                                                                                                            const data = await resp.json().catch(() => ({}));
                                                                                                            if (!resp.ok) {
                                                                                                                throw new Error(String(data?.error || `HTTP ${resp.status}`));
                                                                                                            }
                                                                                                            const updated = Number(data?.updated ?? 0);
                                                                                                            const requested = Number(data?.requested ?? cargoNumbers.length);
                                                                                                            const failed = Number(data?.failed ?? Math.max(0, requested - updated));
                                                                                                            const firstError = Array.isArray(data?.errors) && data.errors.length > 0
                                                                                                                ? String(data.errors[0]?.error || '').trim()
                                                                                                                : '';
                                                                                                            if (failed > 0) {
                                                                                                                setByCustomerActionError(`Плановая дата записана частично: ${updated} из ${requested}.${firstError ? ` Причина: ${firstError}` : ''}`);
                                                                                                            } else {
                                                                                                                setByCustomerActionInfo(`Плановая дата ${byCustomerPlanDateValue} записана для ${updated} перевозок.`);
                                                                                                            }
                                                                                                            setByCustomerPlanDateOpen(false);
                                                                                                        } catch (e: any) {
                                                                                                            setByCustomerActionError(String(e?.message || 'Не удалось записать плановую дату.'));
                                                                                                        } finally {
                                                                                                            setByCustomerActionLoading(false);
                                                                                                        }
                                                                                                    }}
                                                                                                >
                                                                                                    Записать
                                                                                                </Button>
                                                                                            </div>
                                                                                        )}
                                                                                    </div>
                                                                                </div>
                                                                                {(byCustomerActionError || byCustomerActionInfo) && (
                                                                                    <Typography.Body style={{ marginTop: '0.35rem', fontSize: '0.78rem', color: byCustomerActionError ? 'var(--color-error)' : 'var(--color-text-secondary)' }}>
                                                                                        {byCustomerActionError || byCustomerActionInfo}
                                                                                    </Typography.Body>
                                                                                )}
                                                                            </div>
                                                                        )}
                                                                    </>
                                                                );
                                                            })()}
                                                            <table className="doc-inner-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                                                <thead>
                                                                    <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-hover)' }}>
                                                                        {canEditEor && (
                                                                            <th style={{ padding: '0.35rem 0.25rem', textAlign: 'center', width: 30 }}>
                                                                                <input
                                                                                    type="checkbox"
                                                                                    checked={(() => {
                                                                                        const rowDefaultCustomer = String(row?.Заказчик ?? row?.Customer ?? row?.customer ?? row?.Контрагент ?? row?.Contractor ?? row?.Organization ?? '').trim() || '—';
                                                                                        const rowDefaultReceiver = String(row?.Получатель ?? row?.Грузополучатель ?? row?.Receiver ?? row?.receiver ?? row?.Consignee ?? '').trim() || '—';
                                                                                        const parties = new Set<string>();
                                                                                        parcelsToRender.forEach((parcel: any) => {
                                                                                            const cargo = String(parcel?.Перевозка ?? '').trim();
                                                                                            const customerFromParcel = String(parcel?.ЗаказчикНаименование ?? parcel?.Заказчик ?? parcel?.Customer ?? parcel?.customer ?? '').trim();
                                                                                            const customerFromCargo = cargo ? String(cargoCustomerByNumber.get(normCargoKey(cargo)) ?? '').trim() : '';
                                                                                            const receiverFromParcel = String(parcel?.ПолучательНаименование ?? parcel?.Получатель ?? parcel?.ГрузополучательНаименование ?? parcel?.Грузополучатель ?? parcel?.Receiver ?? parcel?.receiver ?? parcel?.Consignee ?? '').trim();
                                                                                            const receiverFromCargo = cargo ? String(cargoReceiverByNumber.get(normCargoKey(cargo)) ?? '').trim() : '';
                                                                                            const party = sendingsSummaryGroupBy === 'receiver'
                                                                                                ? (receiverFromParcel || receiverFromCargo || rowDefaultReceiver)
                                                                                                : (customerFromParcel || customerFromCargo || rowDefaultCustomer);
                                                                                            parties.add(`${rowKey}::${party}`);
                                                                                        });
                                                                                        if (parties.size === 0) return false;
                                                                                        for (const key of parties) {
                                                                                            if (!selectedByCustomerSummaryKeys.has(key)) return false;
                                                                                        }
                                                                                        return true;
                                                                                    })()}
                                                                                    onChange={(e) => {
                                                                                        const checked = e.target.checked;
                                                                                        const rowDefaultCustomer = String(row?.Заказчик ?? row?.Customer ?? row?.customer ?? row?.Контрагент ?? row?.Contractor ?? row?.Organization ?? '').trim() || '—';
                                                                                        const rowDefaultReceiver = String(row?.Получатель ?? row?.Грузополучатель ?? row?.Receiver ?? row?.receiver ?? row?.Consignee ?? '').trim() || '—';
                                                                                        const keys = new Set<string>();
                                                                                        parcelsToRender.forEach((parcel: any) => {
                                                                                            const cargo = String(parcel?.Перевозка ?? '').trim();
                                                                                            const customerFromParcel = String(parcel?.ЗаказчикНаименование ?? parcel?.Заказчик ?? parcel?.Customer ?? parcel?.customer ?? '').trim();
                                                                                            const customerFromCargo = cargo ? String(cargoCustomerByNumber.get(normCargoKey(cargo)) ?? '').trim() : '';
                                                                                            const receiverFromParcel = String(parcel?.ПолучательНаименование ?? parcel?.Получатель ?? parcel?.ГрузополучательНаименование ?? parcel?.Грузополучатель ?? parcel?.Receiver ?? parcel?.receiver ?? parcel?.Consignee ?? '').trim();
                                                                                            const receiverFromCargo = cargo ? String(cargoReceiverByNumber.get(normCargoKey(cargo)) ?? '').trim() : '';
                                                                                            const party = sendingsSummaryGroupBy === 'receiver'
                                                                                                ? (receiverFromParcel || receiverFromCargo || rowDefaultReceiver)
                                                                                                : (customerFromParcel || customerFromCargo || rowDefaultCustomer);
                                                                                            keys.add(`${rowKey}::${party}`);
                                                                                        });
                                                                                        setSelectedByCustomerSummaryKeys((prev) => {
                                                                                            const next = new Set(prev);
                                                                                            keys.forEach((key) => {
                                                                                                if (checked) next.add(key);
                                                                                                else next.delete(key);
                                                                                            });
                                                                                            return next;
                                                                                        });
                                                                                    }}
                                                                                    aria-label={sendingsSummaryGroupBy === 'receiver' ? 'Выбрать всех получателей' : 'Выбрать всех заказчиков'}
                                                                                />
                                                                            </th>
                                                                        )}
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSendingsSummarySort('index')} title="Сортировка">№ пп {sendingsSummarySortColumn === 'index' && (sendingsSummarySortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSendingsSummarySort('customer')} title="Сортировка">{sendingsSummaryGroupBy === 'receiver' ? 'Получатель' : 'Заказчик'} {sendingsSummarySortColumn === 'customer' && (sendingsSummarySortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSendingsSummarySort('count')} title="Сортировка">Кол-во {sendingsSummarySortColumn === 'count' && (sendingsSummarySortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSendingsSummarySort('volume')} title="Сортировка">Объем {sendingsSummarySortColumn === 'volume' && (sendingsSummarySortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSendingsSummarySort('weight')} title="Сортировка">Вес {sendingsSummarySortColumn === 'weight' && (sendingsSummarySortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSendingsSummarySort('paidWeight')} title="Сортировка">Платный вес {sendingsSummarySortColumn === 'paidWeight' && (sendingsSummarySortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSendingsSummarySort('density')} title="Сортировка">Плотность {sendingsSummarySortColumn === 'density' && (sendingsSummarySortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {(() => {
                                                                        const toNumber = (v: unknown) => {
                                                                            const raw = String(v ?? '').trim().replace(',', '.');
                                                                            const n = Number(raw);
                                                                            return Number.isFinite(n) ? n : 0;
                                                                        };
                                                                        const formatNum = (n: number) => {
                                                                            if (!Number.isFinite(n)) return '—';
                                                                            const fixed = n.toFixed(3);
                                                                            return fixed.replace(/\.?0+$/, '');
                                                                        };
                                                                        const densityOf = (weight: number, volume: number) => {
                                                                            if (!Number.isFinite(weight) || !Number.isFinite(volume) || volume <= 0) return '—';
                                                                            return formatNum(weight / volume);
                                                                        };
                                                                        const densityColor = (weight: number, volume: number) => {
                                                                            if (!Number.isFinite(weight) || !Number.isFinite(volume) || volume <= 0) return 'var(--color-text-secondary)';
                                                                            const density = weight / volume;
                                                                            if (density >= 180 && density <= 220) return '#16a34a';
                                                                            if ((density >= 150 && density < 180) || (density > 220 && density <= 260)) return '#ca8a04';
                                                                            return '#dc2626';
                                                                        };
                                                                        const rowDefaultCustomer = String(row?.Заказчик ?? row?.Customer ?? row?.customer ?? row?.Контрагент ?? row?.Contractor ?? row?.Organization ?? '').trim() || '—';
                                                                        const rowDefaultReceiver = String(row?.Получатель ?? row?.Грузополучатель ?? row?.Receiver ?? row?.receiver ?? row?.Consignee ?? '').trim() || '—';
                                                                        const byCounterparty = new Map<string, { party: string; count: number; volume: number; weight: number; paidWeight: number; cargoNumbers: Set<string> }>();
                                                                        parcelsToRender.forEach((parcel: any) => {
                                                                            const cargo = String(parcel?.Перевозка ?? '').trim();
                                                                            const customerFromParcel = String(parcel?.ЗаказчикНаименование ?? parcel?.Заказчик ?? parcel?.Customer ?? parcel?.customer ?? '').trim();
                                                                            const customerFromCargo = cargo ? String(cargoCustomerByNumber.get(normCargoKey(cargo)) ?? '').trim() : '';
                                                                            const receiverFromParcel = String(parcel?.ПолучательНаименование ?? parcel?.Получатель ?? parcel?.ГрузополучательНаименование ?? parcel?.Грузополучатель ?? parcel?.Receiver ?? parcel?.receiver ?? parcel?.Consignee ?? '').trim();
                                                                            const receiverFromCargo = cargo ? String(cargoReceiverByNumber.get(normCargoKey(cargo)) ?? '').trim() : '';
                                                                            const party = sendingsSummaryGroupBy === 'receiver'
                                                                                ? (receiverFromParcel || receiverFromCargo || rowDefaultReceiver)
                                                                                : (customerFromParcel || customerFromCargo || rowDefaultCustomer);
                                                                            const prev = byCounterparty.get(party) ?? { party, count: 0, volume: 0, weight: 0, paidWeight: 0, cargoNumbers: new Set<string>() };
                                                                            prev.count += 1;
                                                                            prev.volume += toNumber(parcel?.ОбъемДляОтчета);
                                                                            prev.weight += toNumber(parcel?.ВесДляОтчета);
                                                                            prev.paidWeight += toNumber(parcel?.ПлатныйВес);
                                                                            if (cargo) prev.cargoNumbers.add(cargo);
                                                                            byCounterparty.set(party, prev);
                                                                        });
                                                                        const summaryRows = Array.from(byCounterparty.values()).map((summary, index) => ({
                                                                            ...summary,
                                                                            _index: index + 1,
                                                                            selectionKey: `${rowKey}::${summary.party}`,
                                                                            cargoNumbers: Array.from(summary.cargoNumbers),
                                                                        }));
                                                                        const sortedSummaryRows = [...summaryRows].sort((a, b) => {
                                                                            let cmp = 0;
                                                                            switch (sendingsSummarySortColumn) {
                                                                                case 'index':
                                                                                    cmp = a._index - b._index;
                                                                                    break;
                                                                                case 'count':
                                                                                    cmp = a.count - b.count;
                                                                                    break;
                                                                                case 'volume':
                                                                                    cmp = a.volume - b.volume;
                                                                                    break;
                                                                                case 'weight':
                                                                                    cmp = a.weight - b.weight;
                                                                                    break;
                                                                                case 'paidWeight':
                                                                                    cmp = a.paidWeight - b.paidWeight;
                                                                                    break;
                                                                                case 'density': {
                                                                                    const dA = a.volume > 0 ? a.weight / a.volume : -Infinity;
                                                                                    const dB = b.volume > 0 ? b.weight / b.volume : -Infinity;
                                                                                    cmp = dA - dB;
                                                                                    break;
                                                                                }
                                                                                case 'cargo':
                                                                                case 'customer':
                                                                                    cmp = String(a.party || '').localeCompare(String(b.party || ''));
                                                                                    break;
                                                                            }
                                                                            return sendingsSummarySortOrder === 'asc' ? cmp : -cmp;
                                                                        });
                                                                        const totals = summaryRows.reduce(
                                                                            (acc, s) => {
                                                                                acc.count += s.count;
                                                                                acc.volume += s.volume;
                                                                                acc.weight += s.weight;
                                                                                acc.paidWeight += s.paidWeight;
                                                                                return acc;
                                                                            },
                                                                            { count: 0, volume: 0, weight: 0, paidWeight: 0 }
                                                                        );
                                                                        const stickyTotalsCellBase: React.CSSProperties = {
                                                                            padding: '0.35rem 0.3rem',
                                                                            position: 'sticky',
                                                                            bottom: 0,
                                                                            background: 'var(--color-bg-hover)',
                                                                            fontWeight: 700,
                                                                            borderTop: '2px solid var(--color-border)',
                                                                            zIndex: 3,
                                                                        };
                                                                        return (
                                                                            <>
                                                                                {sortedSummaryRows.map((summary, parcelIdx: number) => (
                                                                                    <tr
                                                                                        key={`${rowKey}-summary-customer-${summary.party}-${parcelIdx}`}
                                                                                        style={{
                                                                                            borderBottom: '1px solid var(--color-border)',
                                                                                            background: hasParcelSearchMatches ? 'rgba(37, 99, 235, 0.08)' : undefined,
                                                                                        }}
                                                                                    >
                                                                                        {canEditEor && (
                                                                                            <td style={{ padding: '0.35rem 0.25rem', textAlign: 'center' }}>
                                                                                                <input
                                                                                                    type="checkbox"
                                                                                                    checked={selectedByCustomerSummaryKeys.has(summary.selectionKey)}
                                                                                                    onChange={(e) => {
                                                                                                        const checked = e.target.checked;
                                                                                                        setSelectedByCustomerSummaryKeys((prev) => {
                                                                                                            const next = new Set(prev);
                                                                                                            if (checked) next.add(summary.selectionKey);
                                                                                                            else next.delete(summary.selectionKey);
                                                                                                            return next;
                                                                                                        });
                                                                                                    }}
                                                                                                    aria-label={`Выбрать ${sendingsSummaryGroupBy === 'receiver' ? 'получателя' : 'заказчика'} ${summary.party || parcelIdx + 1}`}
                                                                                                />
                                                                                            </td>
                                                                                        )}
                                                                                        <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{parcelIdx + 1}</td>
                                                                                        <td style={{ padding: '0.35rem 0.3rem' }}>{stripOoo(summary.party) || '—'}</td>
                                                                                        <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{summary.count}</td>
                                                                                        <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{formatNum(summary.volume)}</td>
                                                                                        <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{formatNum(summary.weight)}</td>
                                                                                        <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{formatNum(summary.paidWeight)}</td>
                                                                                        <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap', color: densityColor(summary.weight, summary.volume), fontWeight: 600 }}>{densityOf(summary.weight, summary.volume)}</td>
                                                                                    </tr>
                                                                                ))}
                                                                                <tr>
                                                                                    {canEditEor && <td style={stickyTotalsCellBase} />}
                                                                                    <td style={{ ...stickyTotalsCellBase, textAlign: 'right' }} colSpan={2}>Итого</td>
                                                                                    <td style={{ ...stickyTotalsCellBase, textAlign: 'right', whiteSpace: 'nowrap' }}>{totals.count}</td>
                                                                                    <td style={{ ...stickyTotalsCellBase, textAlign: 'right', whiteSpace: 'nowrap' }}>{formatNum(totals.volume)}</td>
                                                                                    <td style={{ ...stickyTotalsCellBase, textAlign: 'right', whiteSpace: 'nowrap' }}>{formatNum(totals.weight)}</td>
                                                                                    <td style={{ ...stickyTotalsCellBase, textAlign: 'right', whiteSpace: 'nowrap' }}>{formatNum(totals.paidWeight)}</td>
                                                                                    <td style={{ ...stickyTotalsCellBase, textAlign: 'right', whiteSpace: 'nowrap', color: densityColor(totals.weight, totals.volume) }}>{densityOf(totals.weight, totals.volume)}</td>
                                                                                </tr>
                                                                            </>
                                                                        );
                                                                    })()}
                                                                </tbody>
                                                            </table>
                                                            <Typography.Label
                                                                style={{
                                                                    display: 'block',
                                                                    marginTop: '0.5rem',
                                                                    fontSize: '0.75rem',
                                                                    color: 'var(--color-text-secondary)',
                                                                }}
                                                            >
                                                                Плотность (идеал 200):{' '}
                                                                <span style={{ color: '#16a34a', fontWeight: 600 }}>зелёный 180-220</span>,{' '}
                                                                <span style={{ color: '#ca8a04', fontWeight: 600 }}>жёлтый 150-179 / 221-260</span>,{' '}
                                                                <span style={{ color: '#dc2626', fontWeight: 600 }}>красный &lt;150 / &gt;260</span>
                                                            </Typography.Label>
                                                            </>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                </>
            )}
            {!sendingsLoading && !sendingsError && sendingRowsSorted.length === 0 && (
                <Typography.Body style={{ color: 'var(--color-text-secondary)', padding: '2rem 0' }}>Нет отправок за выбранный период</Typography.Body>
            )}
            </>
            )}
            {docSection === 'Тарифы' && (
                <>
                    {tariffsLoading ? (
                        <Flex align="center" gap="0.5rem" style={{ padding: '2rem 0' }}>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <Typography.Body>Загрузка тарифов...</Typography.Body>
                        </Flex>
                    ) : filteredTariffs.length === 0 ? (
                        <Typography.Body style={{ color: 'var(--color-text-secondary)', padding: '2rem 0' }}>Нет данных по тарифам</Typography.Body>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                                <thead>
                                    <tr style={{ background: 'var(--color-bg-hover)', borderBottom: '1px solid var(--color-border)' }}>
                                        <th
                                            style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer' }}
                                            onClick={() => { setTariffsSortColumn('docDate'); setTariffsSortOrder((o) => tariffsSortColumn === 'docDate' ? (o === 'asc' ? 'desc' : 'asc') : 'desc'); }}
                                        >
                                            Дата {tariffsSortColumn === 'docDate' ? (tariffsSortOrder === 'asc' ? '↑' : '↓') : ''}
                                        </th>
                                        <th
                                            style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer' }}
                                            onClick={() => { setTariffsSortColumn('docNumber'); setTariffsSortOrder((o) => tariffsSortColumn === 'docNumber' ? (o === 'asc' ? 'desc' : 'asc') : 'asc'); }}
                                        >
                                            Номер {tariffsSortColumn === 'docNumber' ? (tariffsSortOrder === 'asc' ? '↑' : '↓') : ''}
                                        </th>
                                        {effectiveServiceMode ? (
                                            <th
                                                style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer' }}
                                                onClick={() => { setTariffsSortColumn('customerName'); setTariffsSortOrder((o) => tariffsSortColumn === 'customerName' ? (o === 'asc' ? 'desc' : 'asc') : 'asc'); }}
                                            >
                                                Заказчик {tariffsSortColumn === 'customerName' ? (tariffsSortOrder === 'asc' ? '↑' : '↓') : ''}
                                            </th>
                                        ) : null}
                                        <th
                                            style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer' }}
                                            onClick={() => { setTariffsSortColumn('cityFrom'); setTariffsSortOrder((o) => tariffsSortColumn === 'cityFrom' ? (o === 'asc' ? 'desc' : 'asc') : 'asc'); }}
                                        >
                                            Место отправления {tariffsSortColumn === 'cityFrom' ? (tariffsSortOrder === 'asc' ? '↑' : '↓') : ''}
                                        </th>
                                        <th
                                            style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer' }}
                                            onClick={() => { setTariffsSortColumn('cityTo'); setTariffsSortOrder((o) => tariffsSortColumn === 'cityTo' ? (o === 'asc' ? 'desc' : 'asc') : 'asc'); }}
                                        >
                                            Место назначения {tariffsSortColumn === 'cityTo' ? (tariffsSortOrder === 'asc' ? '↑' : '↓') : ''}
                                        </th>
                                        <th
                                            style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer' }}
                                            onClick={() => { setTariffsSortColumn('transportType'); setTariffsSortOrder((o) => tariffsSortColumn === 'transportType' ? (o === 'asc' ? 'desc' : 'asc') : 'asc'); }}
                                        >
                                            Тип {tariffsSortColumn === 'transportType' ? (tariffsSortOrder === 'asc' ? '↑' : '↓') : ''}
                                        </th>
                                        <th
                                            style={{ padding: '0.5rem 0.75rem', textAlign: 'center', fontWeight: 600, cursor: 'pointer' }}
                                            onClick={() => { setTariffsSortColumn('dangerous'); setTariffsSortOrder((o) => tariffsSortColumn === 'dangerous' ? (o === 'asc' ? 'desc' : 'asc') : 'asc'); }}
                                        >
                                            Опасный груз {tariffsSortColumn === 'dangerous' ? (tariffsSortOrder === 'asc' ? '↑' : '↓') : ''}
                                        </th>
                                        <th
                                            style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontWeight: 600, cursor: 'pointer' }}
                                            onClick={() => { setTariffsSortColumn('tariff'); setTariffsSortOrder((o) => tariffsSortColumn === 'tariff' ? (o === 'asc' ? 'desc' : 'asc') : 'desc'); }}
                                        >
                                            Тариф {tariffsSortColumn === 'tariff' ? (tariffsSortOrder === 'asc' ? '↑' : '↓') : ''}
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredTariffs.map((t) => (
                                        <tr key={t.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                            <td style={{ padding: '0.5rem 0.75rem', whiteSpace: 'nowrap' }}><DateText value={t.docDate || undefined} /></td>
                                            <td style={{ padding: '0.5rem 0.75rem', whiteSpace: 'nowrap' }}>{t.docNumber || '—'}</td>
                                            {effectiveServiceMode ? <td style={{ padding: '0.5rem 0.75rem' }}>{t.customerName || '—'}</td> : null}
                                            <td style={{ padding: '0.5rem 0.75rem' }}>
                                                {(() => {
                                                    const fromCode = cityToCode(t.cityFrom || '') || t.cityFrom || '';
                                                    return fromCode ? (
                                                        <span style={{
                                                            display: 'inline-block',
                                                            padding: '0.2rem 0.45rem',
                                                            borderRadius: 999,
                                                            background: 'var(--color-bg-hover)',
                                                            border: '1px solid var(--color-border)',
                                                            fontWeight: 600,
                                                            fontSize: '0.78rem',
                                                            lineHeight: 1.2,
                                                            letterSpacing: '0.02em',
                                                        }}>
                                                            {fromCode}
                                                        </span>
                                                    ) : '—';
                                                })()}
                                            </td>
                                            <td style={{ padding: '0.5rem 0.75rem' }}>
                                                {(() => {
                                                    const toCode = cityToCode(t.cityTo || '') || t.cityTo || '';
                                                    return toCode ? (
                                                        <span style={{
                                                            display: 'inline-block',
                                                            padding: '0.2rem 0.45rem',
                                                            borderRadius: 999,
                                                            background: 'var(--color-bg-hover)',
                                                            border: '1px solid var(--color-border)',
                                                            fontWeight: 600,
                                                            fontSize: '0.78rem',
                                                            lineHeight: 1.2,
                                                            letterSpacing: '0.02em',
                                                        }}>
                                                            {toCode}
                                                        </span>
                                                    ) : '—';
                                                })()}
                                            </td>
                                            <td style={{ padding: '0.5rem 0.75rem' }}>{t.transportType || '—'}</td>
                                            <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center' }}>{t.isDangerous ? 'Да' : 'Нет'}</td>
                                            <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                {t.tariff != null ? formatCurrency(Number(t.tariff)) : '—'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            )}
            {docSection === 'Акты сверок' && (
                <>
                    <Flex align="center" gap="0.6rem" wrap="wrap" style={{ marginBottom: '0.75rem' }}>
                        <Button
                            className="button-primary"
                            disabled={!effectiveActiveInn || !auth?.login || !auth?.password}
                            onClick={() => {
                                setSverkiOrderError(null);
                                setSverkiOrderContract('');
                                setSverkiOrderPeriodFrom(apiDateRange.dateFrom);
                                setSverkiOrderPeriodTo(apiDateRange.dateTo);
                                setSverkiOrderModalOpen(true);
                            }}
                        >
                            Заказать Акт сверки
                        </Button>
                        {sverkiRequestsLoading ? (
                            <Typography.Body style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>Проверяем статус...</Typography.Body>
                        ) : sverkiStatusBadge ? (
                            <span style={{ fontSize: '0.78rem', padding: '0.2rem 0.5rem', borderRadius: 999, fontWeight: 600, background: sverkiStatusBadge.bg, color: sverkiStatusBadge.color }}>
                                {sverkiStatusBadge.label}
                            </span>
                        ) : null}
                    </Flex>
                    <div style={{ marginBottom: '0.9rem' }}>
                        <Typography.Body style={{ fontWeight: 600, marginBottom: '0.45rem' }}>
                            Заказанные акты сверки
                        </Typography.Body>
                        {sverkiRequestsLoading ? (
                            <Typography.Body style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)' }}>
                                Загрузка заявок...
                            </Typography.Body>
                        ) : sverkiRequests.length === 0 ? (
                            <Typography.Body style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)' }}>
                                Заявок пока нет
                            </Typography.Body>
                        ) : (
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                    <thead>
                                        <tr style={{ background: 'var(--color-bg-hover)', borderBottom: '1px solid var(--color-border)' }}>
                                            <th style={{ padding: '0.45rem 0.65rem', textAlign: 'left', fontWeight: 600 }}>Договор</th>
                                            <th style={{ padding: '0.45rem 0.65rem', textAlign: 'left', fontWeight: 600 }}>Период с</th>
                                            <th style={{ padding: '0.45rem 0.65rem', textAlign: 'left', fontWeight: 600 }}>Период по</th>
                                            <th style={{ padding: '0.45rem 0.65rem', textAlign: 'left', fontWeight: 600 }}>Создана</th>
                                            <th style={{ padding: '0.45rem 0.65rem', textAlign: 'left', fontWeight: 600 }}>Статус</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {sverkiRequests.map((req) => {
                                            const sent = req.status === 'edo_sent';
                                            return (
                                                <tr key={req.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                                    <td style={{ padding: '0.45rem 0.65rem' }}>{req.contract || '—'}</td>
                                                    <td style={{ padding: '0.45rem 0.65rem', whiteSpace: 'nowrap' }}><DateText value={req.periodFrom || undefined} /></td>
                                                    <td style={{ padding: '0.45rem 0.65rem', whiteSpace: 'nowrap' }}><DateText value={req.periodTo || undefined} /></td>
                                                    <td style={{ padding: '0.45rem 0.65rem', whiteSpace: 'nowrap' }}><DateText value={req.createdAt || undefined} /></td>
                                                    <td style={{ padding: '0.45rem 0.65rem' }}>
                                                        <span style={{
                                                            fontSize: '0.74rem',
                                                            padding: '0.14rem 0.45rem',
                                                            borderRadius: 999,
                                                            fontWeight: 600,
                                                            background: sent ? 'rgba(16,185,129,0.15)' : 'rgba(59,130,246,0.15)',
                                                            color: sent ? '#10b981' : '#3b82f6',
                                                            whiteSpace: 'nowrap',
                                                        }}>
                                                            {sent ? 'Отправлена в ЭДО' : 'Ожидает формирования'}
                                                        </span>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                    {sverkiLoading ? (
                        <Flex align="center" gap="0.5rem" style={{ padding: '2rem 0' }}>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <Typography.Body>Загрузка актов сверок...</Typography.Body>
                        </Flex>
                    ) : filteredSverki.length === 0 ? (
                        <Typography.Body style={{ color: 'var(--color-text-secondary)', padding: '2rem 0' }}>Нет данных по актам сверок</Typography.Body>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                                <thead>
                                    <tr style={{ background: 'var(--color-bg-hover)', borderBottom: '1px solid var(--color-border)' }}>
                                        <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: 600 }}>Номер</th>
                                        <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: 600 }}>Дата</th>
                                        <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: 600 }}>Период с</th>
                                        <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: 600 }}>Период по</th>
                                        {effectiveServiceMode ? <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: 600 }}>Контрагент</th> : null}
                                        <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontWeight: 600 }}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredSverki.map((row) => {
                                        const number = String(row.docNumber || '').trim();
                                        const hasDownload = number && row.docDate;
                                        const isDownloading = sverkiDownloadingId === row.id;
                                        return (
                                            <tr key={row.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                                <td style={{ padding: '0.5rem 0.75rem', whiteSpace: 'nowrap' }}>{row.docNumber || '—'}</td>
                                                <td style={{ padding: '0.5rem 0.75rem', whiteSpace: 'nowrap' }}><DateText value={row.docDate || undefined} /></td>
                                                <td style={{ padding: '0.5rem 0.75rem', whiteSpace: 'nowrap' }}><DateText value={row.periodFrom || undefined} /></td>
                                                <td style={{ padding: '0.5rem 0.75rem', whiteSpace: 'nowrap' }}><DateText value={row.periodTo || undefined} /></td>
                                                {effectiveServiceMode ? <td style={{ padding: '0.5rem 0.75rem' }}>{row.customerName || '—'}</td> : null}
                                                <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>
                                                    {hasDownload ? (
                                                        <button
                                                            type="button"
                                                            className="button-primary"
                                                            style={{ fontSize: '0.8rem', padding: '0.25rem 0.5rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                                                            disabled={isDownloading}
                                                            onClick={() => downloadSverkaFile(row)}
                                                        >
                                                            {isDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                                                            Скачать
                                                        </button>
                                                    ) : (
                                                        '—'
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                    {sverkiDownloadError && (
                        <Typography.Body style={{ marginTop: '0.5rem', fontSize: '0.82rem', color: '#ef4444' }}>
                            {sverkiDownloadError}
                        </Typography.Body>
                    )}
                </>
            )}
            {docSection === 'Договоры' && (
                <>
                    {dogovorsLoading ? (
                        <Flex align="center" gap="0.5rem" style={{ padding: '2rem 0' }}>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <Typography.Body>Загрузка договоров...</Typography.Body>
                        </Flex>
                    ) : filteredDogovors.length === 0 ? (
                        <Typography.Body style={{ color: 'var(--color-text-secondary)', padding: '2rem 0' }}>Нет данных по договорам</Typography.Body>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                                <thead>
                                    <tr style={{ background: 'var(--color-bg-hover)', borderBottom: '1px solid var(--color-border)' }}>
                                        <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: 600 }}>Номер</th>
                                        <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: 600 }}>Дата</th>
                                        {effectiveServiceMode ? <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: 600 }}>Контрагент</th> : null}
                                        <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: 600 }}>Наименование</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredDogovors.map((row) => (
                                        <tr key={row.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                            <td style={{ padding: '0.5rem 0.75rem', whiteSpace: 'nowrap' }}>{row.docNumber || '—'}</td>
                                            <td style={{ padding: '0.5rem 0.75rem', whiteSpace: 'nowrap' }}><DateText value={row.docDate || undefined} /></td>
                                            {effectiveServiceMode ? <td style={{ padding: '0.5rem 0.75rem' }}>{row.customerName || '—'}</td> : null}
                                            <td style={{ padding: '0.5rem 0.75rem' }}>{row.title || '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            )}
            {docSection === 'Претензии' && (
                <>
                    <Flex align="center" gap="0.6rem" wrap="wrap" style={{ marginBottom: '0.75rem' }}>
                        <Button
                            className="button-primary"
                            onClick={() => {
                                openClaimsCreateModal();
                            }}
                            disabled={!auth?.login || !auth?.password}
                        >
                            + Создать претензию
                        </Button>
                        <select
                            className="admin-form-input"
                            value={claimsStatusFilter}
                            onChange={(e) => setClaimsStatusFilter(e.target.value)}
                            style={{ maxWidth: 260, padding: '0.45rem 0.55rem' }}
                        >
                            <option value="all">Все статусы</option>
                            {Object.entries(CLAIM_STATUS_LABELS).map(([value, label]) => (
                                <option key={value} value={value}>{label}</option>
                            ))}
                        </select>
                    </Flex>
                    {claimsLoading ? (
                        <Flex align="center" gap="0.5rem" style={{ padding: '2rem 0' }}>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <Typography.Body>Загрузка претензий...</Typography.Body>
                        </Flex>
                    ) : filteredClaims.length === 0 ? (
                        <Typography.Body style={{ color: 'var(--color-text-secondary)', padding: '2rem 0' }}>Претензий пока нет</Typography.Body>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                                <thead>
                                    <tr style={{ background: 'var(--color-bg-hover)', borderBottom: '1px solid var(--color-border)' }}>
                                        <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: 600 }}>Номер</th>
                                        <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: 600 }}>Дата</th>
                                        <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: 600 }}>Перевозка</th>
                                        <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: 600 }}>Статус</th>
                                        <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: 600 }}>Суть</th>
                                        <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontWeight: 600 }}>Сумма</th>
                                        <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontWeight: 600 }}>Действия</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredClaims.map((row) => {
                                        const status = (row.status || 'new') as ClaimStatusKey;
                                        const statusStyle = CLAIM_STATUS_BADGE[status] || CLAIM_STATUS_BADGE.new;
                                        return (
                                            <tr key={row.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                                <td style={{ padding: '0.5rem 0.75rem', whiteSpace: 'nowrap' }}>{row.claimNumber || `#${row.id}`}</td>
                                                <td style={{ padding: '0.5rem 0.75rem', whiteSpace: 'nowrap' }}><DateText value={row.createdAt || undefined} /></td>
                                                <td style={{ padding: '0.5rem 0.75rem', whiteSpace: 'nowrap' }}>{row.cargoNumber || '—'}</td>
                                                <td style={{ padding: '0.5rem 0.75rem' }}>
                                                    <span style={{ fontSize: '0.75rem', padding: '0.18rem 0.45rem', borderRadius: 999, fontWeight: 600, background: statusStyle.bg, color: statusStyle.color, whiteSpace: 'nowrap' }}>
                                                        {CLAIM_STATUS_LABELS[status] || status}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '0.5rem 0.75rem' }}>{row.description || '—'}</td>
                                                <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                    {row.requestedAmount != null ? formatCurrency(Number(row.requestedAmount)) : '—'}
                                                </td>
                                                <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                    <Flex gap="0.35rem" justify="flex-end" wrap="wrap">
                                                        <Button
                                                            type="button"
                                                            className="filter-button"
                                                            onClick={() => openClaimDetailModal(row.id)}
                                                            disabled={claimsActionLoadingId === row.id || claimsCreateSubmitting}
                                                            style={CLAIM_ROW_ACTION_BUTTON_STYLE}
                                                        >
                                                            Открыть
                                                        </Button>
                                                        {status === 'draft' ? (
                                                            <>
                                                                <Button
                                                                    type="button"
                                                                    className="filter-button"
                                                                    onClick={() => openDraftEditor(row.id)}
                                                                    disabled={claimsActionLoadingId === row.id || claimsCreateSubmitting}
                                                                    style={CLAIM_ROW_ACTION_BUTTON_STYLE}
                                                                >
                                                                    Изменить
                                                                </Button>
                                                                <Button
                                                                    type="button"
                                                                    className="button-primary"
                                                                    onClick={() => runClaimAction(row.id, 'submit')}
                                                                    disabled={claimsActionLoadingId === row.id}
                                                                    style={CLAIM_ROW_ACTION_BUTTON_STYLE}
                                                                >
                                                                    {claimsActionLoadingId === row.id ? '...' : 'Отправить'}
                                                                </Button>
                                                            </>
                                                        ) : (
                                                            <>
                                                                {status === 'waiting_docs' && (
                                                                    <Button
                                                                        type="button"
                                                                        className="button-primary"
                                                                        onClick={() => openClaimReplyModal(row.id)}
                                                                        disabled={claimsActionLoadingId === row.id || claimsReplySubmitting}
                                                                        style={{ minWidth: 170, height: 36 }}
                                                                    >
                                                                        Ответить документами
                                                                    </Button>
                                                                )}
                                                                <Button
                                                                    type="button"
                                                                    className="filter-button"
                                                                    onClick={() => runClaimAction(row.id, 'withdraw')}
                                                                    disabled={
                                                                        claimsActionLoadingId === row.id
                                                                        || ['paid', 'offset', 'closed'].includes(status)
                                                                    }
                                                                    style={CLAIM_ROW_ACTION_BUTTON_STYLE}
                                                                >
                                                                    {claimsActionLoadingId === row.id ? '...' : 'Отозвать'}
                                                                </Button>
                                                            </>
                                                        )}
                                                    </Flex>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            )}
            {docSection !== 'Счета' && docSection !== 'УПД' && docSection !== 'Заявки' && docSection !== 'Отправки' && docSection !== 'Тарифы' && docSection !== 'Акты сверок' && docSection !== 'Договоры' && docSection !== 'Претензии' && (
                <Typography.Body style={{ color: 'var(--color-text-secondary)', padding: '2rem 0', fontSize: '0.9rem' }}>
                    Раздел «{docSection}» в разработке.
                </Typography.Body>
            )}
            {claimsDetailOpen && (
                <div
                    style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    onClick={() => !claimsDetailLoading && setClaimsDetailOpen(false)}
                >
                    <div
                        style={{ width: 'min(94vw, 760px)', maxHeight: '90vh', overflowY: 'auto', borderRadius: 12, background: 'var(--color-bg-card, #fff)', padding: '1rem' }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <Flex align="center" justify="space-between" style={{ marginBottom: '0.6rem' }}>
                            <Typography.Body style={{ fontWeight: 700 }}>
                                {claimsDetailData?.claim?.claimNumber ? `Претензия ${claimsDetailData.claim.claimNumber}` : 'Карточка претензии'}
                            </Typography.Body>
                            <Button type="button" className="filter-button" onClick={() => setClaimsDetailOpen(false)}>Закрыть</Button>
                        </Flex>
                        {claimsDetailLoading ? (
                            <Flex align="center" gap="0.45rem" style={{ padding: '1rem 0' }}>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <Typography.Body>Загрузка карточки...</Typography.Body>
                            </Flex>
                        ) : claimsDetailError ? (
                            <Typography.Body style={{ color: '#ef4444', fontSize: '0.84rem' }}>{claimsDetailError}</Typography.Body>
                        ) : !claimsDetailData?.claim ? (
                            <Typography.Body style={{ color: 'var(--color-text-secondary)', fontSize: '0.84rem' }}>Данные претензии не найдены</Typography.Body>
                        ) : (
                            <div style={{ display: 'grid', gap: '0.55rem' }}>
                                <div style={{ border: '1px solid var(--color-border)', borderRadius: 10, padding: '0.6rem' }}>
                                    <Typography.Body style={{ fontWeight: 600, marginBottom: '0.35rem' }}>Данные заказчика и претензии</Typography.Body>
                                    <div style={{ display: 'grid', gap: '0.25rem' }}>
                                        <Typography.Body style={{ fontSize: '0.82rem' }}><strong>Перевозка:</strong> {String(claimsDetailData.claim.cargoNumber || '—')}</Typography.Body>
                                        <Typography.Body style={{ fontSize: '0.82rem' }}><strong>Тип претензии:</strong> {String(claimsDetailData.claim.claimType || '—')}</Typography.Body>
                                        <Typography.Body style={{ fontSize: '0.82rem' }}><strong>Описание:</strong> {String(claimsDetailData.claim.description || '—')}</Typography.Body>
                                        <Typography.Body style={{ fontSize: '0.82rem' }}><strong>Сумма требования:</strong> {claimsDetailData.claim.requestedAmount != null ? formatCurrency(Number(claimsDetailData.claim.requestedAmount)) : '—'}</Typography.Body>
                                        <Typography.Body style={{ fontSize: '0.82rem' }}><strong>Контактное лицо:</strong> {claimCustomerPayload.contactName || '—'}</Typography.Body>
                                        <Typography.Body style={{ fontSize: '0.82rem' }}><strong>Телефон:</strong> {String(claimsDetailData.claim.customerPhone || '—')}</Typography.Body>
                                        <Typography.Body style={{ fontSize: '0.82rem' }}><strong>Email:</strong> {String(claimsDetailData.claim.customerEmail || '—')}</Typography.Body>
                                        <Typography.Body style={{ fontSize: '0.82rem' }}>
                                            <strong>Номера мест:</strong> {claimCustomerPayload.selectedPlaces.length > 0 ? claimCustomerPayload.selectedPlaces.join(', ') : '—'}
                                        </Typography.Body>
                                        <Typography.Body style={{ fontSize: '0.82rem' }}>
                                            <strong>Манипуляционные знаки:</strong> {claimCustomerPayload.manipulationSigns.length > 0 ? mapClaimEnumToRu(claimCustomerPayload.manipulationSigns, MANIPULATION_SIGN_LABELS_RU).join(', ') : '—'}
                                        </Typography.Body>
                                        <Typography.Body style={{ fontSize: '0.82rem' }}>
                                            <strong>Упаковка:</strong> {claimCustomerPayload.packagingTypes.length > 0 ? mapClaimEnumToRu(claimCustomerPayload.packagingTypes, PACKAGING_TYPE_LABELS_RU).join(', ') : '—'}
                                        </Typography.Body>
                                    </div>
                                </div>
                                <div style={{ border: '1px solid var(--color-border)', borderRadius: 10, padding: '0.6rem' }}>
                                    <Typography.Body style={{ fontWeight: 600, marginBottom: '0.4rem' }}>Ответ HAULZ</Typography.Body>
                                    <div style={{ display: 'grid', gap: '0.25rem' }}>
                                        <Typography.Body style={{ fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                                            <strong>Статус:</strong>
                                            <span style={{ fontSize: '0.74rem', padding: '0.16rem 0.45rem', borderRadius: 999, fontWeight: 600, background: claimDetailStatusStyle.bg, color: claimDetailStatusStyle.color, whiteSpace: 'nowrap' }}>
                                                {CLAIM_STATUS_LABELS[claimDetailStatusKey] || String(claimsDetailData.claim.status || '—')}
                                            </span>
                                        </Typography.Body>
                                        <Typography.Body style={{ fontSize: '0.82rem' }}><strong>Ответ менеджера:</strong> {String(claimsDetailData.claim.managerNote || '—')}</Typography.Body>
                                        <Typography.Body style={{ fontSize: '0.82rem' }}><strong>Ответ руководителя:</strong> {String(claimsDetailData.claim.leaderComment || '—')}</Typography.Body>
                                        <Typography.Body style={{ fontSize: '0.82rem' }}><strong>Комментарий бухгалтерии:</strong> {String(claimsDetailData.claim.accountingNote || '—')}</Typography.Body>
                                    </div>

                                    <div style={{ marginTop: '0.55rem' }}>
                                        <Typography.Body style={{ fontWeight: 600, fontSize: '0.82rem', marginBottom: '0.25rem', display: 'block' }}>Резолюции HAULZ</Typography.Body>
                                        {Array.isArray(claimsDetailData.events) && claimsDetailData.events.filter((ev: any) => {
                                            const role = String(ev?.actorRole || '').toLowerCase();
                                            const eventType = String(ev?.eventType || '').toLowerCase();
                                            if (!['manager', 'leader', 'accountant', 'admin'].includes(role)) return false;
                                            return ['status_changed', 'claim_updated', 'documents_uploaded', 'manager_decision', 'leader_decision', 'accounting_decision'].includes(eventType);
                                        }).length > 0 ? (
                                            <div style={{ display: 'grid', gap: '0.3rem' }}>
                                                {claimsDetailData.events
                                                    .filter((ev: any) => {
                                                        const role = String(ev?.actorRole || '').toLowerCase();
                                                        const eventType = String(ev?.eventType || '').toLowerCase();
                                                        if (!['manager', 'leader', 'accountant', 'admin'].includes(role)) return false;
                                                        return ['status_changed', 'claim_updated', 'documents_uploaded', 'manager_decision', 'leader_decision', 'accounting_decision'].includes(eventType);
                                                    })
                                                    .map((ev: any) => {
                                                        const role = String(ev?.actorRole || '').toLowerCase();
                                                        const roleLabel = role === 'leader' ? 'Руководитель' : role === 'manager' ? 'Менеджер' : role === 'accountant' ? 'Бухгалтерия' : 'HAULZ';
                                                        const eventType = String(ev?.eventType || '').toLowerCase();
                                                        const eventLabel = eventType === 'status_changed'
                                                            ? `Изменен статус${ev?.toStatus ? `: ${String(ev.toStatus)}` : ''}`
                                                            : eventType === 'documents_uploaded'
                                                                ? 'Добавлены вложения'
                                                                : eventType === 'claim_updated'
                                                                    ? 'Обновлена карточка'
                                                                    : 'Резолюция';
                                                        return (
                                                            <div key={`resolution-${ev.id}`} style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: '0.35rem 0.45rem' }}>
                                                                <Typography.Body style={{ fontSize: '0.74rem', color: 'var(--color-text-secondary)' }}>
                                                                    {roleLabel} · <DateText value={ev?.createdAt || undefined} />
                                                                </Typography.Body>
                                                                <Typography.Body style={{ fontSize: '0.8rem' }}>{eventLabel}</Typography.Body>
                                                            </div>
                                                        );
                                                    })}
                                            </div>
                                        ) : (
                                            <Typography.Body style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                                                Резолюций от HAULZ пока нет.
                                            </Typography.Body>
                                        )}
                                    </div>

                                    <div style={{ marginTop: '0.55rem' }}>
                                        <Typography.Body style={{ fontWeight: 600, fontSize: '0.82rem', marginBottom: '0.25rem', display: 'block' }}>Прикрепленные файлы</Typography.Body>
                                        <Typography.Body style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                                            Фото: {Array.isArray(claimsDetailData.photos) ? claimsDetailData.photos.length : 0} | PDF: {Array.isArray(claimsDetailData.documents) ? claimsDetailData.documents.length : 0} | Видео: {Array.isArray(claimsDetailData.videoLinks) ? claimsDetailData.videoLinks.length : 0}
                                        </Typography.Body>
                                        {Array.isArray(claimsDetailData.photos) && claimsDetailData.photos.length > 0 && (
                                            <div style={{ marginTop: '0.45rem' }}>
                                                <Typography.Body style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', marginBottom: '0.25rem' }}>Фото</Typography.Body>
                                                <Flex gap="0.45rem" wrap="wrap">
                                                    {claimsDetailData.photos.slice(0, 16).map((p: any) => {
                                                        const mime = String(p?.mimeType || 'image/jpeg');
                                                        const src = p?.base64 ? `data:${mime};base64,${p.base64}` : '';
                                                        const fileName = String(p?.fileName || p?.caption || `photo-${p?.id || 'file'}.jpg`);
                                                        return (
                                                            <div key={p.id} style={{ display: 'grid', gap: '0.2rem', width: 90 }}>
                                                                <a href={src || '#'} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                                                                    <img
                                                                        src={src}
                                                                        alt={String(p?.caption || p?.fileName || 'Фото')}
                                                                        style={{ width: 86, height: 86, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--color-border)' }}
                                                                    />
                                                                </a>
                                                                <a href={src || '#'} download={fileName} style={{ fontSize: '0.68rem', color: 'var(--color-primary-blue)', textDecoration: 'none' }}>Скачать</a>
                                                            </div>
                                                        );
                                                    })}
                                                </Flex>
                                            </div>
                                        )}
                                        {Array.isArray(claimsDetailData.documents) && claimsDetailData.documents.length > 0 && (
                                            <div style={{ marginTop: '0.45rem' }}>
                                                <Typography.Body style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', marginBottom: '0.25rem' }}>PDF</Typography.Body>
                                                <Flex gap="0.35rem" wrap="wrap">
                                                    {claimsDetailData.documents.map((d: any) => {
                                                        const mime = String(d?.mimeType || 'application/pdf');
                                                        const href = d?.base64 ? `data:${mime};base64,${d.base64}` : '#';
                                                        return (
                                                            <a
                                                                key={d.id}
                                                                href={href}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                style={{ border: '1px solid var(--color-border)', borderRadius: 999, padding: '0.14rem 0.45rem', textDecoration: 'none', fontSize: '0.74rem', color: 'var(--color-primary-blue)' }}
                                                            >
                                                                {String(d?.fileName || `Документ #${d.id}`)}
                                                            </a>
                                                        );
                                                    })}
                                                </Flex>
                                            </div>
                                        )}
                                        {Array.isArray(claimsDetailData.videoLinks) && claimsDetailData.videoLinks.length > 0 && (
                                            <div style={{ marginTop: '0.45rem' }}>
                                                <Typography.Body style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', marginBottom: '0.25rem' }}>Видео-ссылки</Typography.Body>
                                                <div style={{ display: 'grid', gap: '0.25rem' }}>
                                                    {claimsDetailData.videoLinks.map((v: any) => (
                                                        <a key={v.id} href={String(v?.url || '#')} target="_blank" rel="noreferrer" style={{ fontSize: '0.78rem', color: 'var(--color-primary-blue)' }}>
                                                            {String(v?.title || 'Видео')}
                                                        </a>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    <div style={{ marginTop: '0.55rem' }}>
                                        <Typography.Body style={{ fontWeight: 600, fontSize: '0.82rem', marginBottom: '0.25rem', display: 'block' }}>Дополнительные ответы менеджера и руководителя</Typography.Body>
                                        {Array.isArray(claimsDetailData.comments) && claimsDetailData.comments.filter((c: any) => ['manager', 'leader'].includes(String(c?.authorRole || ''))).length > 0 ? (
                                            <div style={{ display: 'grid', gap: '0.3rem' }}>
                                                {claimsDetailData.comments
                                                    .filter((c: any) => ['manager', 'leader'].includes(String(c?.authorRole || '')))
                                                    .map((c: any) => (
                                                        <div key={c.id} style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: '0.35rem 0.45rem' }}>
                                                            <Typography.Body style={{ fontSize: '0.74rem', color: 'var(--color-text-secondary)' }}>
                                                                {String(c?.authorRole || '') === 'leader' ? 'Руководитель' : 'Менеджер'} · <DateText value={c?.createdAt || undefined} />
                                                            </Typography.Body>
                                                            <Typography.Body style={{ fontSize: '0.82rem' }}>{String(c?.commentText || '')}</Typography.Body>
                                                        </div>
                                                    ))}
                                            </div>
                                        ) : (
                                            <Typography.Body style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>Дополнительных комментариев от менеджера/руководителя пока нет.</Typography.Body>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
            {claimsReplyOpen && (
                <div
                    style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    onClick={() => !claimsReplySubmitting && setClaimsReplyOpen(false)}
                >
                    <div
                        style={{ width: 'min(92vw, 640px)', maxHeight: '90vh', overflowY: 'auto', borderRadius: 12, background: 'var(--color-bg-card, #fff)', padding: '1rem' }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <Typography.Body style={{ fontWeight: 700, marginBottom: '0.55rem' }}>
                            Ответ на запрос документов
                        </Typography.Body>
                        <Typography.Body style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', marginBottom: '0.6rem' }}>
                            Приложите документы и/или фото по запросу менеджера.
                        </Typography.Body>
                        <div style={{ display: 'grid', gap: '0.55rem' }}>
                            <div>
                                <Typography.Body style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', marginBottom: '0.2rem' }}>
                                    Фото (до 10 файлов, до 5MB каждый)
                                </Typography.Body>
                                <input
                                    id="claims-reply-photos"
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    onChange={(e) => setClaimsReplyPhotoFiles(Array.from(e.target.files || []))}
                                    style={{ display: 'none' }}
                                />
                                <Flex align="center" gap="0.45rem" wrap="wrap">
                                    <label htmlFor="claims-reply-photos" style={FILE_PICKER_BUTTON_STYLE}>Выбрать фото</label>
                                    <Typography.Body style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                                        {claimsReplyPhotoFiles.length > 0 ? `Выбрано: ${claimsReplyPhotoFiles.length}` : 'Файлы не выбраны'}
                                    </Typography.Body>
                                </Flex>
                            </div>
                            <div>
                                <Typography.Body style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', marginBottom: '0.2rem' }}>
                                    PDF документы (до 5MB каждый)
                                </Typography.Body>
                                <input
                                    id="claims-reply-documents"
                                    type="file"
                                    accept="application/pdf"
                                    multiple
                                    onChange={(e) => setClaimsReplyDocumentFiles(Array.from(e.target.files || []))}
                                    style={{ display: 'none' }}
                                />
                                <Flex align="center" gap="0.45rem" wrap="wrap">
                                    <label htmlFor="claims-reply-documents" style={FILE_PICKER_BUTTON_STYLE}>Выбрать PDF</label>
                                    <Typography.Body style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                                        {claimsReplyDocumentFiles.length > 0 ? `Выбрано: ${claimsReplyDocumentFiles.length}` : 'Файлы не выбраны'}
                                    </Typography.Body>
                                </Flex>
                            </div>
                            <div>
                                <Typography.Body style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', marginBottom: '0.2rem' }}>
                                    Видео-ссылка (опционально)
                                </Typography.Body>
                                <input
                                    type="url"
                                    className="admin-form-input"
                                    placeholder="https://..."
                                    value={claimsReplyVideoLink}
                                    onChange={(e) => setClaimsReplyVideoLink(e.target.value)}
                                    style={{ width: '100%', padding: '0.45rem' }}
                                />
                            </div>
                        </div>
                        {claimsReplyError ? (
                            <Typography.Body style={{ color: '#ef4444', fontSize: '0.78rem', marginTop: '0.6rem' }}>
                                {claimsReplyError}
                            </Typography.Body>
                        ) : null}
                        <Flex justify="flex-end" gap="0.45rem" wrap="nowrap" style={{ marginTop: '0.7rem', flexWrap: 'nowrap' }}>
                            <Button className="filter-button" disabled={claimsReplySubmitting} onClick={() => setClaimsReplyOpen(false)} style={{ flexShrink: 0 }}>
                                Отмена
                            </Button>
                            <Button className="button-primary" disabled={claimsReplySubmitting} onClick={submitClaimReplyDocuments} style={{ flexShrink: 0 }}>
                                {claimsReplySubmitting ? 'Отправка...' : 'Отправить документы'}
                            </Button>
                        </Flex>
                    </div>
                </div>
            )}
            {claimsCreateOpen && (
                <div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(0,0,0,0.45)',
                        zIndex: 1000,
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'center',
                        overflowY: 'auto',
                        WebkitOverflowScrolling: 'touch',
                        padding: '1rem 0.5rem',
                    }}
                    onClick={() => {
                        if (claimsCreateSubmitting) return;
                        setClaimsCreateOpen(false);
                        setClaimsEditingId(null);
                    }}
                >
                    <div
                        style={{
                            width: '100%',
                            maxWidth: 560,
                            borderRadius: 12,
                            background: 'var(--color-bg-card, #fff)',
                            padding: '1rem',
                            maxHeight: 'calc(100vh - 2rem)',
                            overflowY: 'auto',
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <Typography.Body style={{ fontWeight: 600, marginBottom: '0.75rem' }}>
                            {claimsEditingId ? `Черновик претензии #${claimsEditingId}` : 'Новая претензия'}
                        </Typography.Body>
                        <div style={{ display: 'grid', gap: '0.55rem', marginBottom: '0.75rem' }}>
                            <div ref={claimsCargoInputRef} style={{ position: 'relative' }}>
                                <Typography.Body style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', marginBottom: '0.2rem' }}>Номер перевозки</Typography.Body>
                                <div
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        border: '1px solid var(--color-border)',
                                        borderRadius: 8,
                                        background: 'var(--color-bg-card, #fff)',
                                    }}
                                >
                                    <input
                                        type="text"
                                        className="admin-form-input"
                                        placeholder="Начните вводить или выберите номер перевозки"
                                        value={claimsCreateCargoNumber}
                                        onChange={(e) => setClaimsCreateCargoNumber(e.target.value)}
                                        onFocus={() => setClaimsCargoDropdownOpen(true)}
                                        onClick={() => setClaimsCargoDropdownOpen(true)}
                                        style={{ flex: 1, padding: '0.45rem', border: 'none', background: 'transparent' }}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setClaimsCargoDropdownOpen((v) => !v)}
                                        style={{
                                            padding: '0.35rem 0.5rem',
                                            border: 'none',
                                            background: 'none',
                                            cursor: 'pointer',
                                            color: 'var(--color-text-secondary)',
                                        }}
                                        title={claimsCargoDropdownOpen ? 'Свернуть список' : 'Показать список'}
                                    >
                                        <ChevronDown className="w-4 h-4" style={{ transform: claimsCargoDropdownOpen ? 'rotate(180deg)' : undefined, transition: 'transform 0.2s' }} />
                                    </button>
                                </div>
                                {claimsCargoDropdownOpen && (
                                    <div
                                        style={{
                                            position: 'absolute',
                                            top: '100%',
                                            left: 0,
                                            right: 0,
                                            marginTop: 2,
                                            maxHeight: 220,
                                            overflowY: 'auto',
                                            background: 'var(--color-bg-card, #fff)',
                                            border: '1px solid var(--color-border)',
                                            borderRadius: 8,
                                            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                                            zIndex: 1100,
                                        }}
                                    >
                                        {claimCargoFilteredOptions.length === 0 ? (
                                            <div style={{ padding: '0.6rem 0.75rem', fontSize: '0.82rem', color: 'var(--color-text-secondary)' }}>
                                                Нет совпадений
                                            </div>
                                        ) : (
                                            claimCargoFilteredOptions.map((opt) => (
                                                <button
                                                    key={opt}
                                                    type="button"
                                                    onClick={() => {
                                                        setClaimsCreateCargoNumber(opt);
                                                        setClaimsCargoDropdownOpen(false);
                                                    }}
                                                    style={{
                                                        display: 'block',
                                                        width: '100%',
                                                        padding: '0.45rem 0.75rem',
                                                        textAlign: 'left',
                                                        border: 'none',
                                                        background: 'none',
                                                        cursor: 'pointer',
                                                        fontSize: '0.9rem',
                                                    }}
                                                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-bg-hover, #f3f4f6)'; }}
                                                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
                                                >
                                                    {opt}
                                                </button>
                                            ))
                                        )}
                                    </div>
                                )}
                            </div>
                            <div>
                                <Typography.Body style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', marginBottom: '0.2rem' }}>Тип претензии</Typography.Body>
                                <select
                                    className="admin-form-input"
                                    value={claimsCreateType}
                                    onChange={(e) => setClaimsCreateType(e.target.value as any)}
                                    style={{ width: '100%', padding: '0.45rem' }}
                                >
                                    <option value="cargo_damage">Повреждение груза</option>
                                    <option value="quantity_mismatch">Недовоз</option>
                                    <option value="other">Прочее</option>
                                </select>
                            </div>
                            <div>
                                <Typography.Body style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', marginBottom: '0.2rem' }}>
                                    Укажите номера мест
                                </Typography.Body>
                                <details style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: '0.45rem 0.55rem' }}>
                                    <summary style={{ cursor: 'pointer', fontSize: '0.84rem', fontWeight: 500 }}>
                                        Номенклатура принятого груза
                                    </summary>
                                    {claimsAcceptedNomenclatureLoading ? (
                                        <Typography.Body style={{ marginTop: '0.45rem', fontSize: '0.76rem', color: 'var(--color-text-secondary)' }}>
                                            Загрузка номенклатуры...
                                        </Typography.Body>
                                    ) : claimsAcceptedNomenclatureError ? (
                                        <Typography.Body style={{ marginTop: '0.45rem', fontSize: '0.76rem', color: '#ef4444' }}>
                                            {claimsAcceptedNomenclatureError}
                                        </Typography.Body>
                                    ) : claimNomenclatureOptions.length === 0 ? (
                                        <Typography.Body style={{ marginTop: '0.45rem', fontSize: '0.76rem', color: 'var(--color-text-secondary)' }}>
                                            Для выбранной перевозки нет данных по номенклатуре принятого груза.
                                        </Typography.Body>
                                    ) : (
                                        <div style={{ marginTop: '0.45rem', maxHeight: 220, overflowY: 'auto' }}>
                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                                                <thead>
                                                    <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                                                        <th style={{ textAlign: 'left', padding: '0.25rem', width: 34 }}>#</th>
                                                        <th style={{ textAlign: 'left', padding: '0.25rem', whiteSpace: 'nowrap' }}>Штрихкод</th>
                                                        <th style={{ textAlign: 'left', padding: '0.25rem' }}>Номенклатура</th>
                                                        <th style={{ textAlign: 'left', padding: '0.25rem', whiteSpace: 'nowrap' }}>Объявленная стоимость</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {claimNomenclatureOptions.map((row) => {
                                                        const checked = claimsCreateSelectedPlaceKeys.includes(row.key);
                                                        return (
                                                            <tr key={row.key} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                                                <td style={{ padding: '0.25rem' }}>
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={checked}
                                                                        onChange={(e) => {
                                                                            setClaimsCreateSelectedPlaceKeys((prev) => {
                                                                                if (e.target.checked) return prev.includes(row.key) ? prev : [...prev, row.key];
                                                                                return prev.filter((k) => k !== row.key);
                                                                            });
                                                                        }}
                                                                    />
                                                                </td>
                                                                <td style={{ padding: '0.25rem', whiteSpace: 'nowrap' }}>{row.barcode || '—'}</td>
                                                                <td style={{ padding: '0.25rem' }}>{row.name}</td>
                                                                <td style={{ padding: '0.25rem', whiteSpace: 'nowrap' }}>{row.declaredCost}</td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </details>
                            </div>
                            {claimsCreateType === 'cargo_damage' ? (
                                <>
                                    <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: '0.55rem' }}>
                                        <Typography.Body style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', marginBottom: '0.35rem' }}>
                                            Наличие манипуляционных знаков
                                        </Typography.Body>
                                        <div style={{ display: 'grid', gap: '0.35rem' }}>
                                            {MANIPULATION_SIGN_OPTIONS.map((sign) => {
                                                const checked = claimsCreateManipulationSignIds.includes(sign.id);
                                                return (
                                                    <Flex key={sign.id} align="center" justify="space-between" style={{ gap: '0.5rem' }}>
                                                        <Typography.Body style={{ fontSize: '0.82rem' }}>{sign.label}</Typography.Body>
                                                        <TapSwitch
                                                            checked={checked}
                                                            onToggle={() => {
                                                                setClaimsCreateManipulationSignIds((prev) => (
                                                                    prev.includes(sign.id)
                                                                        ? prev.filter((id) => id !== sign.id)
                                                                        : [...prev, sign.id]
                                                                ));
                                                            }}
                                                        />
                                                    </Flex>
                                                );
                                            })}
                                        </div>
                                        {claimsCreateManipulationSignIds.length > 0 ? (
                                            <div style={{ marginTop: '0.5rem' }}>
                                                <Typography.Body style={{ fontSize: '0.76rem', color: 'var(--color-text-secondary)', marginBottom: '0.2rem' }}>
                                                    Фото манипуляционных знаков (до 5MB каждый)
                                                </Typography.Body>
                                                <input
                                                    id="claims-manipulation-photos"
                                                    type="file"
                                                    accept="image/*"
                                                    multiple
                                                    onChange={(e) => {
                                                        const files = Array.from(e.target.files || []);
                                                        setClaimsCreateManipulationPhotoFiles(files);
                                                        if (files.some((f) => f.size > MAX_CLAIM_FILE_BYTES)) {
                                                            setClaimsCreateError('Размер одного фото не должен превышать 5MB');
                                                        } else {
                                                            setClaimsCreateError(null);
                                                        }
                                                    }}
                                                    style={{ display: 'none' }}
                                                />
                                                <Flex align="center" gap="0.45rem" wrap="wrap">
                                                    <label htmlFor="claims-manipulation-photos" style={FILE_PICKER_BUTTON_STYLE}>
                                                        Выбрать фото
                                                    </label>
                                                    <Typography.Body style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                                                        {claimsCreateManipulationPhotoFiles.length > 0
                                                            ? `Выбрано: ${claimsCreateManipulationPhotoFiles.length}`
                                                            : 'Файлы не выбраны'}
                                                    </Typography.Body>
                                                </Flex>
                                                {claimsCreateManipulationPhotoFiles.length > 0 ? (
                                                    <Typography.Body style={{ fontSize: '0.74rem', color: 'var(--color-text-secondary)', marginTop: '0.2rem' }}>
                                                        Выбрано фото: {claimsCreateManipulationPhotoFiles.map((f) => f.name).join(', ')}
                                                    </Typography.Body>
                                                ) : null}
                                            </div>
                                        ) : null}
                                    </div>
                                    <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: '0.55rem' }}>
                                        <Typography.Body style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', marginBottom: '0.35rem' }}>
                                            Упаковка
                                        </Typography.Body>
                                        <div style={{ display: 'grid', gap: '0.35rem' }}>
                                            {PACKAGING_TYPE_OPTIONS.map((pack) => {
                                                const checked = claimsCreatePackagingTypeIds.includes(pack.id);
                                                return (
                                                    <Flex key={pack.id} align="center" justify="space-between" style={{ gap: '0.5rem' }}>
                                                        <Typography.Body style={{ fontSize: '0.82rem' }}>{pack.label}</Typography.Body>
                                                        <TapSwitch
                                                            checked={checked}
                                                            onToggle={() => {
                                                                setClaimsCreatePackagingTypeIds((prev) => (
                                                                    prev.includes(pack.id)
                                                                        ? prev.filter((id) => id !== pack.id)
                                                                        : [...prev, pack.id]
                                                                ));
                                                            }}
                                                        />
                                                    </Flex>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </>
                            ) : null}
                            <div>
                                <Typography.Body style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', marginBottom: '0.2rem' }}>Описание</Typography.Body>
                                <textarea
                                    className="admin-form-input"
                                    placeholder="Опишите суть претензии, расчет суммы и обстоятельства"
                                    value={claimsCreateDescription}
                                    onChange={(e) => setClaimsCreateDescription(e.target.value)}
                                    style={{ width: '100%', minHeight: 90, padding: '0.45rem' }}
                                />
                            </div>
                            <Flex gap="0.5rem" wrap="wrap">
                                <div style={{ flex: '1 1 180px' }}>
                                    <Typography.Body style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', marginBottom: '0.2rem' }}>Сумма требования, ₽</Typography.Body>
                                    <input
                                        type="number"
                                        className="admin-form-input"
                                        value={claimsCreateAmount}
                                        onChange={(e) => setClaimsCreateAmount(e.target.value)}
                                        style={{ width: '100%', padding: '0.45rem' }}
                                    />
                                </div>
                            </Flex>
                            <div>
                                <Typography.Body style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', marginBottom: '0.2rem' }}>Ссылка на видео (опционально)</Typography.Body>
                                <input
                                    type="url"
                                    className="admin-form-input"
                                    placeholder="https://..."
                                    value={claimsCreateVideoLink}
                                    onChange={(e) => setClaimsCreateVideoLink(e.target.value)}
                                    style={{ width: '100%', padding: '0.45rem' }}
                                />
                            </div>
                            <div>
                                <Typography.Body style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', marginBottom: '0.2rem' }}>
                                    Фото (до 10 файлов, до 5MB каждый)
                                </Typography.Body>
                                <input
                                    id="claims-photos"
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    onChange={(e) => {
                                        const files = Array.from(e.target.files || []);
                                        setClaimsCreatePhotoFiles(files);
                                        if (files.length > 10) {
                                            setClaimsCreateError('Можно прикрепить не более 10 фото');
                                        } else if (files.some((f) => f.size > MAX_CLAIM_FILE_BYTES)) {
                                            setClaimsCreateError('Размер одного фото не должен превышать 5MB');
                                        } else {
                                            setClaimsCreateError(null);
                                        }
                                    }}
                                    style={{ display: 'none' }}
                                />
                                <Flex align="center" gap="0.45rem" wrap="wrap">
                                    <label htmlFor="claims-photos" style={FILE_PICKER_BUTTON_STYLE}>
                                        Выбрать фото
                                    </label>
                                    <Typography.Body style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                                        {claimsCreatePhotoFiles.length > 0
                                            ? `Выбрано: ${claimsCreatePhotoFiles.length}`
                                            : 'Файлы не выбраны'}
                                    </Typography.Body>
                                </Flex>
                                {claimsCreatePhotoFiles.length > 0 ? (
                                    <div style={{ marginTop: '0.25rem', display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                                        {claimsCreatePhotoFiles.map((file, idx) => (
                                            <span
                                                key={`${file.name}-${idx}`}
                                                style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '0.3rem',
                                                    padding: '0.15rem 0.4rem',
                                                    borderRadius: 8,
                                                    border: '1px solid var(--color-border)',
                                                    background: 'var(--color-bg-hover)',
                                                    fontSize: '0.72rem',
                                                    color: 'var(--color-text-secondary)',
                                                }}
                                            >
                                                {file.name}
                                                <button
                                                    type="button"
                                                    onClick={() => setClaimsCreatePhotoFiles((prev) => prev.filter((_, i) => i !== idx))}
                                                    style={{ border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', padding: 0, lineHeight: 1 }}
                                                    aria-label={`Удалить ${file.name}`}
                                                >
                                                    ×
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                ) : null}
                            </div>
                            <div>
                                <Typography.Body style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', marginBottom: '0.2rem' }}>
                                    PDF документы (до 5MB каждый)
                                </Typography.Body>
                                <input
                                    id="claims-documents"
                                    type="file"
                                    accept="application/pdf"
                                    multiple
                                    onChange={(e) => {
                                        const files = Array.from(e.target.files || []);
                                        setClaimsCreateDocumentFiles(files);
                                        if (files.some((f) => f.size > MAX_CLAIM_FILE_BYTES)) {
                                            setClaimsCreateError('Размер одного PDF не должен превышать 5MB');
                                        } else {
                                            setClaimsCreateError(null);
                                        }
                                    }}
                                    style={{ display: 'none' }}
                                />
                                <Flex align="center" gap="0.45rem" wrap="wrap">
                                    <label htmlFor="claims-documents" style={FILE_PICKER_BUTTON_STYLE}>
                                        Выбрать PDF
                                    </label>
                                    <Typography.Body style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                                        {claimsCreateDocumentFiles.length > 0
                                            ? `Выбрано: ${claimsCreateDocumentFiles.length}`
                                            : 'Файлы не выбраны'}
                                    </Typography.Body>
                                </Flex>
                                {claimsCreateDocumentFiles.length > 0 ? (
                                    <div style={{ marginTop: '0.25rem', display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                                        {claimsCreateDocumentFiles.map((file, idx) => (
                                            <span
                                                key={`${file.name}-${idx}`}
                                                style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '0.3rem',
                                                    padding: '0.15rem 0.4rem',
                                                    borderRadius: 8,
                                                    border: '1px solid var(--color-border)',
                                                    background: 'var(--color-bg-hover)',
                                                    fontSize: '0.72rem',
                                                    color: 'var(--color-text-secondary)',
                                                }}
                                            >
                                                {file.name}
                                                <button
                                                    type="button"
                                                    onClick={() => setClaimsCreateDocumentFiles((prev) => prev.filter((_, i) => i !== idx))}
                                                    style={{ border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', padding: 0, lineHeight: 1 }}
                                                    aria-label={`Удалить ${file.name}`}
                                                >
                                                    ×
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                ) : null}
                            </div>
                            <div>
                                <Typography.Body style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', marginBottom: '0.2rem' }}>Контакты</Typography.Body>
                                <Flex gap="0.5rem" wrap="wrap" style={{ marginBottom: '0.5rem' }}>
                                    <div style={{ flex: '1 1 260px' }}>
                                        <input
                                            type="text"
                                            className="admin-form-input"
                                            placeholder="ФИО контактного лица"
                                            value={claimsCreateContactName}
                                            onChange={(e) => setClaimsCreateContactName(e.target.value)}
                                            style={{ width: '100%', padding: '0.45rem' }}
                                        />
                                    </div>
                                </Flex>
                                <Flex gap="0.5rem" wrap="wrap">
                                    <div style={{ flex: '1 1 180px' }}>
                                        <input
                                            type="tel"
                                            inputMode="tel"
                                            className="admin-form-input"
                                            placeholder="+7 (___) ___-__-__"
                                            value={claimsCreatePhone}
                                            onChange={(e) => setClaimsCreatePhone(formatPhoneMask(e.target.value))}
                                            style={{ width: '100%', padding: '0.45rem' }}
                                        />
                                    </div>
                                    <div style={{ flex: '1 1 220px' }}>
                                        <input
                                            type="email"
                                            className="admin-form-input"
                                            placeholder="Email"
                                            value={claimsCreateEmail}
                                            onChange={(e) => setClaimsCreateEmail(e.target.value)}
                                            style={{ width: '100%', padding: '0.45rem' }}
                                        />
                                    </div>
                                </Flex>
                            </div>
                        </div>
                        {claimsCreateError ? (
                            <Typography.Body style={{ color: '#ef4444', fontSize: '0.78rem', marginBottom: '0.6rem' }}>
                                {claimsCreateError}
                            </Typography.Body>
                        ) : null}
                        <Flex justify="flex-end" gap="0.45rem" align="center" wrap="nowrap" style={{ flexWrap: 'nowrap' }}>
                            <Button
                                className="filter-button"
                                disabled={claimsCreateSubmitting}
                                style={{ height: 40, minWidth: 120, padding: '0 0.7rem', flexShrink: 0 }}
                                onClick={() => {
                                    setClaimsCreateOpen(false);
                                    setClaimsEditingId(null);
                                }}
                            >
                                Отмена
                            </Button>
                            <Button
                                className="button-primary"
                                disabled={claimsCreateSubmitting}
                                style={{ height: 40, minWidth: 120, padding: '0 0.7rem', flexShrink: 0 }}
                                onClick={async () => {
                                    if (!auth?.login || !auth?.password) {
                                        setClaimsCreateError('Не удалось определить авторизацию');
                                        return;
                                    }
                                    if (!claimsCreateCargoNumber.trim() || !claimsCreateDescription.trim()) {
                                        setClaimsCreateError('Заполните номер перевозки и описание');
                                        return;
                                    }
                                    const amount = Number(claimsCreateAmount || 0);
                                    if (!Number.isFinite(amount) || amount < 0) {
                                        setClaimsCreateError('Некорректная сумма требования');
                                        return;
                                    }
                                    const totalPhotoFiles = claimsCreatePhotoFiles.length + claimsCreateManipulationPhotoFiles.length;
                                    if (totalPhotoFiles > 10) {
                                        setClaimsCreateError('Можно прикрепить не более 10 фото');
                                        return;
                                    }
                                    if (claimsCreatePhotoFiles.some((f) => f.size > MAX_CLAIM_FILE_BYTES)) {
                                        setClaimsCreateError('Размер одного фото не должен превышать 5MB');
                                        return;
                                    }
                                    if (claimsCreateManipulationPhotoFiles.some((f) => f.size > MAX_CLAIM_FILE_BYTES)) {
                                        setClaimsCreateError('Размер одного фото не должен превышать 5MB');
                                        return;
                                    }
                                    if (claimsCreateDocumentFiles.some((f) => f.size > MAX_CLAIM_FILE_BYTES)) {
                                        setClaimsCreateError('Размер одного PDF не должен превышать 5MB');
                                        return;
                                    }
                                    setClaimsCreateSubmitting(true);
                                    setClaimsCreateError(null);
                                    try {
                                        const photosPayload = await Promise.all(
                                            claimsCreatePhotoFiles.map(async (file) => ({
                                                fileName: file.name,
                                                mimeType: file.type || 'image/jpeg',
                                                base64: await fileToBase64(file),
                                            }))
                                        );
                                        const manipulationPhotosPayload = await Promise.all(
                                            claimsCreateManipulationPhotoFiles.map(async (file) => ({
                                                fileName: file.name,
                                                mimeType: file.type || 'image/jpeg',
                                                caption: `Манипуляционные знаки: ${claimsCreateManipulationSignIds
                                                    .map((id) => MANIPULATION_SIGN_OPTIONS.find((s) => s.id === id)?.label || id)
                                                    .join(', ')}`,
                                                base64: await fileToBase64(file),
                                            }))
                                        );
                                        const documentsPayload = await Promise.all(
                                            claimsCreateDocumentFiles.map(async (file) => ({
                                                fileName: file.name,
                                                mimeType: file.type || 'application/pdf',
                                                docType: 'other' as const,
                                                base64: await fileToBase64(file),
                                            }))
                                        );
                                        const selectedPlacesPayload = claimNomenclatureOptions
                                            .filter((row) => claimsCreateSelectedPlaceKeys.includes(row.key))
                                            .map((row) => ({
                                                placeNumber: row.barcode || null,
                                                name: row.name,
                                                sourceDoc: 'accepted_cargo',
                                            }));
                                        const bodyPayload = {
                                            cargoNumber: claimsCreateCargoNumber.trim(),
                                            claimType: claimsCreateType,
                                            description: claimsCreateDescription.trim(),
                                            requestedAmount: amount,
                                            customerContactName: claimsCreateContactName.trim(),
                                            customerPhone: claimsCreatePhone.trim(),
                                            customerEmail: claimsCreateEmail.trim(),
                                            customerInn: effectiveActiveInn || undefined,
                                            photos: [...photosPayload, ...manipulationPhotosPayload],
                                            documents: documentsPayload,
                                            selectedPlaces: selectedPlacesPayload,
                                            manipulationSigns: claimsCreateManipulationSignIds,
                                            packagingTypes: claimsCreatePackagingTypeIds,
                                            videoLinks: claimsCreateVideoLink.trim() ? [{ url: claimsCreateVideoLink.trim(), title: 'Видео от клиента' }] : [],
                                        };
                                        const isEditDraft = !!claimsEditingId;
                                        const resp = await fetch(isEditDraft ? `/api/claims/${claimsEditingId}` : '/api/claims', {
                                            method: 'POST',
                                            headers: {
                                                'Content-Type': 'application/json',
                                                'x-login': auth.login,
                                                'x-password': auth.password,
                                            },
                                            body: JSON.stringify(
                                                isEditDraft
                                                    ? { action: 'update_draft', ...bodyPayload }
                                                    : bodyPayload
                                            ),
                                        });
                                        const data = await resp.json().catch(() => ({}));
                                        if (!resp.ok) throw new Error(data?.error || (isEditDraft ? 'Не удалось сохранить черновик' : 'Не удалось создать претензию'));
                                        setClaimsCreateOpen(false);
                                        setClaimsEditingId(null);
                                        await reloadClaims();
                                    } catch (e: any) {
                                        setClaimsCreateError(e?.message || (claimsEditingId ? 'Ошибка сохранения черновика' : 'Ошибка создания претензии'));
                                    } finally {
                                        setClaimsCreateSubmitting(false);
                                    }
                                }}
                            >
                                {claimsCreateSubmitting
                                    ? (claimsEditingId ? 'Сохранение...' : 'Создание...')
                                    : (claimsEditingId ? 'Сохранить черновик' : 'Создать черновик')}
                            </Button>
                        </Flex>
                    </div>
                </div>
            )}
            {sverkiOrderModalOpen && (
                <div
                    style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    onClick={() => !sverkiOrderSubmitting && setSverkiOrderModalOpen(false)}
                >
                    <div
                        style={{ width: '92%', maxWidth: 460, borderRadius: 12, background: 'var(--color-bg-card, #fff)', padding: '1rem' }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <Typography.Body style={{ fontWeight: 600, marginBottom: '0.75rem' }}>Заказать Акт сверки</Typography.Body>
                        <div style={{ display: 'grid', gap: '0.55rem', marginBottom: '0.75rem' }}>
                            <div>
                                <Typography.Body style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', marginBottom: '0.2rem' }}>Период с</Typography.Body>
                                <input
                                    type="date"
                                    className="admin-form-input"
                                    value={sverkiOrderPeriodFrom}
                                    onChange={(e) => setSverkiOrderPeriodFrom(e.target.value)}
                                    style={{ width: '100%', padding: '0.45rem' }}
                                />
                            </div>
                            <div>
                                <Typography.Body style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', marginBottom: '0.2rem' }}>Период по</Typography.Body>
                                <input
                                    type="date"
                                    className="admin-form-input"
                                    value={sverkiOrderPeriodTo}
                                    onChange={(e) => setSverkiOrderPeriodTo(e.target.value)}
                                    style={{ width: '100%', padding: '0.45rem' }}
                                />
                            </div>
                            <div>
                                <Typography.Body style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', marginBottom: '0.2rem' }}>Договор</Typography.Body>
                                <input
                                    type="text"
                                    className="admin-form-input"
                                    placeholder="Номер или название договора"
                                    value={sverkiOrderContract}
                                    onChange={(e) => setSverkiOrderContract(e.target.value)}
                                    style={{ width: '100%', padding: '0.45rem' }}
                                />
                            </div>
                        </div>
                        {sverkiOrderError ? (
                            <Typography.Body style={{ color: '#ef4444', fontSize: '0.78rem', marginBottom: '0.6rem' }}>
                                {sverkiOrderError}
                            </Typography.Body>
                        ) : null}
                        <Flex justify="flex-end" gap="0.45rem" wrap="nowrap" style={{ flexWrap: 'nowrap' }}>
                            <Button
                                className="filter-button"
                                disabled={sverkiOrderSubmitting}
                                onClick={() => setSverkiOrderModalOpen(false)}
                                style={{ flexShrink: 0 }}
                            >
                                Отмена
                            </Button>
                            <Button
                                className="button-primary"
                                disabled={sverkiOrderSubmitting}
                                style={{ flexShrink: 0 }}
                                onClick={async () => {
                                    if (!effectiveActiveInn || !auth?.login || !auth?.password) {
                                        setSverkiOrderError('Не удалось определить ИНН или авторизацию');
                                        return;
                                    }
                                    if (!sverkiOrderPeriodFrom || !sverkiOrderPeriodTo || !sverkiOrderContract.trim()) {
                                        setSverkiOrderError('Заполните период и договор');
                                        return;
                                    }
                                    setSverkiOrderSubmitting(true);
                                    setSverkiOrderError(null);
                                    try {
                                        const resp = await fetch('/api/sverki-requests', {
                                            method: 'POST',
                                            headers: {
                                                'Content-Type': 'application/json',
                                                'x-login': auth.login,
                                                'x-password': auth.password,
                                            },
                                            body: JSON.stringify({
                                                customerInn: effectiveActiveInn,
                                                periodFrom: sverkiOrderPeriodFrom,
                                                periodTo: sverkiOrderPeriodTo,
                                                contract: sverkiOrderContract.trim(),
                                            }),
                                        });
                                        const data = await resp.json().catch(() => ({}));
                                        if (!resp.ok) throw new Error(data?.error || 'Не удалось создать заявку');
                                        setSverkiOrderModalOpen(false);
                                        setSverkiRequests((prev) => {
                                            const row = data?.request;
                                            if (!row) return prev;
                                            return [row, ...prev];
                                        });
                                    } catch (e: any) {
                                        setSverkiOrderError(e?.message || 'Не удалось создать заявку');
                                    } finally {
                                        setSverkiOrderSubmitting(false);
                                    }
                                }}
                            >
                                {sverkiOrderSubmitting ? 'Заказываем...' : 'Заказать'}
                            </Button>
                        </Flex>
                    </div>
                </div>
            )}
        </div>
    );
}
