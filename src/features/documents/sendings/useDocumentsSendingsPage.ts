import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { buildCargoDepartureByNumber } from "../../../lib/transitDateTime";
import { getFilterKeyByStatus } from "../../../lib/statusUtils";
import type { SanctionCheckResult } from "../../../lib/sanctions";
import type { AccountPermissions, AuthData, CargoItem, DateFilter } from "../../../types";
import type { CargoStatusFilterKey, RouteFilterKey, TypeFilterKey } from "../../../lib/sharedListFilters";
import { useSendingsSortState } from "./useSendingsSortState";
import { useSendingsBaseFilter } from "./useSendingsBaseFilter";
import { useSendingsListPipeline } from "./useSendingsListPipeline";
import { useSendingsServerSync } from "./useSendingsServerSync";
import { useSendingsBulkActions } from "./useSendingsBulkActions";
import { useSendingsFerryActions } from "./useSendingsFerryActions";
import { useSendingsSectionProps } from "./useSendingsSectionProps";
import {
  useSendingsRowRuntime,
  useSendingsStatusKeyResolver,
  useSendingsVisibleMeta,
} from "./useSendingsRowRuntime";
import { getSendingSanctionResult } from "./sendingsParcelHelpers";
import type { EorStatus } from "./sendingsTypes";
import type { SendingsSectionProps } from "./SendingsSection";

export type UseDocumentsSendingsPageInput = {
  active: boolean;
  auth: AuthData;
  effectiveActiveInn?: string;
  effectiveServiceMode: boolean;
  showCustomerColumn: boolean;
  showSums: boolean;
  hasAnalytics: boolean;
  isSuperAdmin: boolean;
  permissions?: AccountPermissions | null;
  sendingsItems: any[];
  sendingsLoading: boolean;
  sendingsError: string | null;
  perevozkiItems: any[];
  cargoStateByNumber: Map<string, string>;
  cargoSumByNumber: Map<string, number>;
  normCargoKey: (num: string | null | undefined) => string;
  apiDateRange: { dateFrom: string; dateTo: string };
  customerFilter: string;
  effectiveSearchText: string;
  sortBy: "date" | null;
  sortOrder: "asc" | "desc";
  transportFilter: string;
  setTransportFilter: Dispatch<SetStateAction<string>>;
  transportLinkedCargoNumbers: Set<string> | undefined;
  typeFilterSet: Set<TypeFilterKey>;
  routeFilterSet: Set<RouteFilterKey>;
  deliveryStatusFilterSet: Set<CargoStatusFilterKey>;
  tableModeEffective: boolean;
  docsMotionEnabled: boolean;
  cargoModeSwitchMotion: SendingsSectionProps["cargoModeSwitchMotion"];
  onOpenCargo?: (cargoNumber: string, prefetchedItem?: CargoItem) => void;
  onOpenAisWithMmsi?: (mmsi: string) => void;
  dateFilter: DateFilter;
  customDateFrom: string;
  customDateTo: string;
  selectedMonthForFilter: { year: number; month: number } | null;
  selectedYearForFilter: number | null;
  selectedWeekForFilter: string | null;
};

export function useDocumentsSendingsPage(input: UseDocumentsSendingsPageInput) {
  const {
    active,
    auth,
    effectiveActiveInn,
    effectiveServiceMode,
    showCustomerColumn,
    showSums,
    hasAnalytics,
    isSuperAdmin,
    permissions,
    sendingsItems,
    sendingsLoading,
    sendingsError,
    perevozkiItems,
    cargoStateByNumber,
    cargoSumByNumber,
    normCargoKey,
    apiDateRange,
    customerFilter,
    effectiveSearchText,
    sortBy,
    sortOrder,
    transportFilter,
    setTransportFilter,
    transportLinkedCargoNumbers,
    typeFilterSet,
    routeFilterSet,
    deliveryStatusFilterSet,
    tableModeEffective,
    docsMotionEnabled,
    cargoModeSwitchMotion,
    onOpenCargo,
    onOpenAisWithMmsi,
    dateFilter,
    customDateFrom,
    customDateTo,
    selectedMonthForFilter,
    selectedYearForFilter,
    selectedWeekForFilter,
  } = input;

  const [expandedSendingRow, setExpandedSendingRow] = useState<string | null>(null);
  const [sendingsSummaryCollapsed, setSendingsSummaryCollapsed] = useState(false);
  const [sendingsDetailsView, setSendingsDetailsView] = useState<"general" | "byCargo" | "byCustomer">("general");
  const [sendingsSummaryGroupBy, setSendingsSummaryGroupBy] = useState<"customer" | "receiver">("customer");
  const [eorStatusMap, setEorStatusMap] = useState<Record<string, EorStatus[]>>({});
  const [sendingSanctionMap, setSendingSanctionMap] = useState<Record<string, SanctionCheckResult>>({});
  const [ferriesList, setFerriesList] = useState<{ id: number; name: string; mmsi: string }[]>([]);
  const [sendingsFerryMap, setSendingsFerryMap] = useState<
    Record<string, { ferry_id: number; ferry_name: string; eta: string | null }>
  >({});
  const [ferryEtaLoadingByRow, setFerryEtaLoadingByRow] = useState<Record<string, boolean>>({});

  const showEorColumn = (permissions?.haulz === true) || isSuperAdmin;
  const canEditEor = (permissions?.eor === true) || isSuperAdmin;
  const canEditPlanDate = canEditEor || (permissions?.supervisor === true);
  const canRunSanctionsCheck = hasAnalytics === true;
  const canSelectSendingRows = canEditPlanDate || canRunSanctionsCheck;

  const {
    sendingsSortColumn,
    sendingsSortOrder,
    sendingsSummarySortColumn,
    sendingsSummarySortOrder,
    handleSendingsSort,
    handleSendingsSummarySort,
  } = useSendingsSortState();

  useEffect(() => {
    setExpandedSendingRow(null);
  }, [
    active,
    dateFilter,
    customDateFrom,
    customDateTo,
    selectedMonthForFilter,
    selectedYearForFilter,
    selectedWeekForFilter,
  ]);

  const normalizeTransportDisplay = useCallback((value: unknown): string => {
    const s = String(value ?? "").toUpperCase().trim();
    if (!s) return "";
    const normalizedSpaces = s.replace(/\s+/g, " ");
    const container = normalizedSpaces.match(/([A-ZА-Я]{4})[\s\-]*([0-9]{7})$/u);
    if (container) return `${container[1]} ${container[2]}`;
    const vehicle = normalizedSpaces.match(/([A-ZА-Я][0-9]{3}[A-ZА-Я]{2})(\s*\/?\s*([0-9]{2,3}))?$/u);
    if (vehicle) {
      const base = vehicle[1];
      const region = vehicle[3] ?? "";
      if (!region) return base;
      return `${base}${region}`;
    }
    const looseVehicle = normalizedSpaces.match(
      /([A-ZА-Я])[\s\-]*([0-9]{3})[\s\-]*([A-ZА-Я]{2})(?:[\s\-]*\/?[\s\-]*([0-9]{2,3}))?$/u,
    );
    if (looseVehicle) {
      const base = `${looseVehicle[1]}${looseVehicle[2]}${looseVehicle[3]}`;
      const region = looseVehicle[4] ?? "";
      if (!region) return base;
      return `${base}${region}`;
    }
    return normalizedSpaces
      .replace(/\bнаименование\s*тс\b[:\-]?\s*/giu, "")
      .replace(/\bконтейнер\b[:\-]?\s*/giu, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  }, []);

  const parseDateTimeValue = useCallback((value: unknown): Date | null => {
    const source = String(value ?? "").trim();
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
      const raw = String(
        cargo?.Number ??
          cargo?.number ??
          cargo?.Номер ??
          cargo?.НомерПеревозки ??
          cargo?.CargoNumber ??
          cargo?.NumberPerevozki ??
          "",
      )
        .replace(/^0000-/, "")
        .trim();
      if (!raw) return;
      const statusKey = getFilterKeyByStatus(
        String(cargo?.State ?? cargo?.state ?? cargo?.Статус ?? cargo?.Status ?? ""),
      );
      if (statusKey !== "ready" && statusKey !== "delivered") return;
      const stopDate = parseDateTimeValue(
        cargo?.StatusDate ??
          cargo?.DateStatus ??
          cargo?.DateState ??
          cargo?.UpdatedAt ??
          cargo?.updated_at ??
          cargo?.ДатаСтатуса ??
          cargo?.ДатаИзменения ??
          cargo?.DateVr ??
          cargo?.DatePrih ??
          cargo?.DateDelivery ??
          cargo?.DeliveryDate ??
          cargo?.ДатаДоставки ??
          cargo?.ДатаПрибытия ??
          cargo?.Дата,
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

  const cargoDepartureByNumber = useMemo(
    () => buildCargoDepartureByNumber(perevozkiItems || [], normCargoKey),
    [perevozkiItems, normCargoKey],
  );

  const cargoPlanDateByNumber = useMemo(() => {
    const m = new Map<string, Date>();
    const plannedKeys = [
      "DateArrival",
      "PlannedDeliveryDate",
      "PlanDeliveryDate",
      "DateDeliveryPlan",
      "ПлановаяДатаДоставки",
      "ПланДатаДоставки",
      "ПлановаяДата",
      "PlanDate",
      "ДатаПрибытияПлан",
      "ДатаДоставкиПлан",
      "ПланДатаПрибытия",
      "ПлановаяДатаПрибытия",
      "DateVrPlan",
      "DatePrihPlan",
      "ДатаПлан",
    ];
    (perevozkiItems || []).forEach((c: any) => {
      const raw = String(
        c?.Number ??
          c?.number ??
          c?.Номер ??
          c?.НомерПеревозки ??
          c?.CargoNumber ??
          c?.NumberPerevozki ??
          "",
      )
        .replace(/^0000-/, "")
        .trim();
      if (!raw) return;
      let date: Date | null = null;
      for (const k of plannedKeys) {
        const v = c?.[k];
        const parsed = parseDateTimeValue(v);
        if (parsed) {
          date = date ? (parsed.getTime() < date.getTime() ? parsed : date) : parsed;
        }
      }
      if (date && date.getFullYear() >= 1990) {
        const key = normCargoKey(raw);
        const prev = m.get(key);
        if (!prev || date.getTime() < prev.getTime()) m.set(key, date);
        if (key !== raw) {
          const prevRaw = m.get(raw);
          if (!prevRaw || date.getTime() < prevRaw.getTime()) m.set(raw, date);
        }
      }
    });
    return m;
  }, [perevozkiItems, parseDateTimeValue, normCargoKey]);

  const sendingPlanDateBySendingId = useMemo(() => {
    const m = new Map<string, Date>();
    const plannedKeys = [
      "DateArrival",
      "PlannedDeliveryDate",
      "PlanDeliveryDate",
      "DateDeliveryPlan",
      "ПлановаяДатаДоставки",
      "ПланДатаДоставки",
      "ПлановаяДата",
      "PlanDate",
      "ДатаПрибытияПлан",
      "ДатаДоставкиПлан",
      "ПланДатаПрибытия",
      "ПлановаяДатаПрибытия",
      "DateVrPlan",
      "DatePrihPlan",
      "ДатаПлан",
    ];
    const addForId = (id: string, date: Date) => {
      if (!id || !date || date.getFullYear() < 1990) return;
      const key = normCargoKey(id);
      const prev = m.get(key);
      if (!prev || date.getTime() < prev.getTime()) m.set(key, date);
    };
    (perevozkiItems || []).forEach((c: any) => {
      let date: Date | null = null;
      for (const k of plannedKeys) {
        const v = c?.[k];
        const parsed = parseDateTimeValue(v);
        if (parsed) date = date ? (parsed.getTime() < date.getTime() ? parsed : date) : parsed;
      }
      if (!date || date.getFullYear() < 1990) return;
      const sendingIds = [
        c?.ИДОтправления ??
          c?.IdOtpravleniya ??
          c?.SendingId ??
          c?.Отправка ??
          c?.ОтправкаНаименование,
        c?.Number ?? c?.number ?? c?.Номер ?? c?.НомерПеревозки ?? c?.CargoNumber ?? c?.NumberPerevozki,
      ].filter((v) => v != null && String(v).trim());
      sendingIds.forEach((id) => addForId(String(id).trim(), date!));
    });
    return m;
  }, [perevozkiItems, parseDateTimeValue, normCargoKey]);

  const getSendingStatusKey = useSendingsStatusKeyResolver({ cargoStateByNumber, normCargoKey });

  const cargoCustomerByNumber = useMemo(() => {
    const m = new Map<string, string>();
    (perevozkiItems || []).forEach((c: any) => {
      const raw = String(c?.Number ?? c?.number ?? "")
        .replace(/^0000-/, "")
        .trim();
      if (!raw) return;
      const key = normCargoKey(raw);
      const customer = String(
        c?.Customer ?? c?.customer ?? c?.Заказчик ?? c?.Контрагент ?? c?.Contractor ?? c?.Organization ?? "",
      ).trim();
      if (!customer) return;
      m.set(key, customer);
      if (key !== raw) m.set(raw, customer);
    });
    return m;
  }, [perevozkiItems, normCargoKey]);

  const cargoReceiverByNumber = useMemo(() => {
    const m = new Map<string, string>();
    (perevozkiItems || []).forEach((c: any) => {
      const raw = String(c?.Number ?? c?.number ?? "")
        .replace(/^0000-/, "")
        .trim();
      if (!raw) return;
      const key = normCargoKey(raw);
      const receiver = String(
        c?.Получатель ?? c?.Грузополучатель ?? c?.Receiver ?? c?.receiver ?? c?.Consignee ?? "",
      ).trim();
      if (!receiver) return;
      m.set(key, receiver);
      if (key !== raw) m.set(raw, receiver);
    });
    return m;
  }, [perevozkiItems, normCargoKey]);

  const uniqueSendingCustomers = useMemo(
    () =>
      [
        ...new Set(
          (sendingsItems || [])
            .map((i: any) =>
              (i.Customer ?? i.customer ?? i.Контрагент ?? i.Contractor ?? i.Organization ?? "").trim(),
            )
            .filter(Boolean),
        ),
      ].sort(),
    [sendingsItems],
  );

  const { transportOptionsCurrentSection, filteredSendings } = useSendingsBaseFilter({
    sendingsItems: sendingsItems || [],
    sendingsLoading,
    effectiveActiveInn,
    customerFilter,
    typeFilterSet,
    routeFilterSet,
    effectiveSearchText,
    sortBy,
    sortOrder,
    normalizeTransportDisplay,
    dateFrom: apiDateRange.dateFrom,
    dateTo: apiDateRange.dateTo,
    transportFilter,
    transportLinkedCargoNumbers,
    setTransportFilter,
  });

  const sendingsRowRuntime = useSendingsRowRuntime({
    filteredSendings,
    normCargoKey,
    parseDateTimeValue,
    normalizeTransportDisplay,
    cargoStateByNumber,
    cargoStopDateByNumber,
    cargoDepartureByNumber,
    cargoPlanDateByNumber,
    sendingPlanDateBySendingId,
  });
  const { getSendingTransitHours, getSendingTransitIsFinal } = sendingsRowRuntime;

  const {
    sendingRowsSorted,
    sendingsInfographic,
    sendingsTableTotals,
    sendingsRepeatedVehicleTotals,
    sendingsVehicleGrandTotals,
  } = useSendingsListPipeline({
    filteredSendings,
    deliveryStatusFilterSet,
    getSendingStatusKey,
    sendingsSortColumn,
    sendingsSortOrder,
    normalizeTransportDisplay,
    getSendingTransitHours,
    cargoSumByNumber,
    hasAnalytics,
  });

  const sendingsInitialLoading = sendingsLoading && (sendingsItems?.length ?? 0) === 0;
  const visibleSendingMeta = useSendingsVisibleMeta(sendingRowsSorted);

  const {
    selectedSendingRowKeys,
    setSelectedSendingRowKeys,
    bulkEorMenuOpen,
    setBulkEorMenuOpen,
    bulkPlanDateOpen,
    setBulkPlanDateOpen,
    bulkPlanDateValue,
    setBulkPlanDateValue,
    bulkSendingActionLoading,
    bulkSendingActionError,
    bulkSendingActionInfo,
    selectedByCustomerSummaryKeys,
    setSelectedByCustomerSummaryKeys,
    byCustomerPlanDateOpen,
    setByCustomerPlanDateOpen,
    byCustomerPlanDateValue,
    setByCustomerPlanDateValue,
    byCustomerActionLoading,
    setByCustomerActionLoading,
    byCustomerActionError,
    setByCustomerActionError,
    byCustomerActionInfo,
    setByCustomerActionInfo,
    expandedByCustomerKey,
    setExpandedByCustomerKey,
    selectedVisibleSendingCount,
    allVisibleSendingsSelected,
    applyBulkSanctionsCheck,
    applyBulkEorStatus,
    applyBulkPlanDate,
    applyByCustomerPlanDate,
    resetBulkUiState,
  } = useSendingsBulkActions({
    visibleSendingMeta,
    canRunSanctionsCheck,
    canEditEor,
    canEditPlanDate,
    getSendingSanctionResult,
    setEorStatusMap,
    setSendingSanctionMap,
    auth,
    effectiveActiveInn,
  });

  const {
    sendingsFerryActionError,
    getSendingsFerryEntry,
    handleFerrySelect,
    resetFerryUiState,
  } = useSendingsFerryActions({
    auth,
    ferriesList,
    sendingsFerryMap,
    setSendingsFerryMap,
    setFerryEtaLoadingByRow,
    effectiveActiveInn,
  });

  const resetSendingsUiState = useCallback(() => {
    resetBulkUiState();
    resetFerryUiState();
  }, [resetBulkUiState, resetFerryUiState]);

  useSendingsServerSync({
    docSection: active ? "Отправки" : "",
    showEorColumn,
    auth,
    setEorStatusMap,
    setFerriesList,
    setSendingsFerryMap,
    resetSendingsUiState,
  });

  useEffect(() => {
    setSelectedByCustomerSummaryKeys(new Set());
    setExpandedByCustomerKey(null);
    setByCustomerPlanDateOpen(false);
    setByCustomerPlanDateValue("");
    setByCustomerActionLoading(false);
    setByCustomerActionError(null);
    setByCustomerActionInfo(null);
    setSendingsSummaryGroupBy("customer");
  }, [expandedSendingRow, sendingsDetailsView, setSelectedByCustomerSummaryKeys, setExpandedByCustomerKey, setByCustomerPlanDateOpen, setByCustomerPlanDateValue, setByCustomerActionLoading, setByCustomerActionError, setByCustomerActionInfo]);

  const sendingsSectionProps = useSendingsSectionProps({
    tableModeEffective,
    docsMotionEnabled,
    cargoModeSwitchMotion,
    canSelectSendingRows,
    allVisibleSendingsSelected,
    visibleSendingMeta,
    setSelectedSendingRowKeys,
    selectedSendingRowKeys,
    handleSendingsSort,
    sendingsSortColumn,
    sendingsSortOrder,
    hasAnalytics,
    showSums,
    showEorColumn,
    canEditEor,
    canEditPlanDate,
    canRunSanctionsCheck,
    sendingRowsSorted,
    sendingsRowRuntime,
    normalizeTransportDisplay,
    effectiveSearchText,
    expandedSendingRow,
    setExpandedSendingRow,
    cargoSumByNumber,
    sendingSanctionMap,
    eorStatusMap,
    ferriesList,
    sendingsFerryMap,
    ferryEtaLoadingByRow,
    handleFerrySelect,
    effectiveActiveInn,
    getSendingsFerryEntry,
    onOpenAisWithMmsi,
    onOpenCargo,
    perevozkiItems,
    sendingsDetailsView,
    setSendingsDetailsView,
    sendingsSummaryGroupBy,
    setSendingsSummaryGroupBy,
    sendingsSummarySortColumn,
    sendingsSummarySortOrder,
    handleSendingsSummarySort,
    cargoStateByNumber,
    cargoPlanDateByNumber,
    cargoReceiverByNumber,
    cargoCustomerByNumber,
    showCustomerColumn,
    effectiveServiceMode,
    selectedByCustomerSummaryKeys,
    setSelectedByCustomerSummaryKeys,
    expandedByCustomerKey,
    setExpandedByCustomerKey,
    byCustomerPlanDateOpen,
    setByCustomerPlanDateOpen,
    byCustomerPlanDateValue,
    setByCustomerPlanDateValue,
    byCustomerActionLoading,
    setByCustomerActionLoading,
    byCustomerActionError,
    setByCustomerActionError,
    byCustomerActionInfo,
    setByCustomerActionInfo,
    selectedVisibleSendingCount,
    bulkSendingActionLoading,
    bulkEorMenuOpen,
    setBulkEorMenuOpen,
    bulkPlanDateOpen,
    setBulkPlanDateOpen,
    bulkPlanDateValue,
    setBulkPlanDateValue,
    bulkSendingActionError,
    bulkSendingActionInfo,
    applyBulkEorStatus,
    applyBulkPlanDate,
    applyBulkSanctionsCheck,
    auth,
    applyByCustomerPlanDate,
  });

  return {
    transportOptionsCurrentSection,
    uniqueSendingCustomers,
    sendingsInitialLoading,
    sendingsError,
    sendingsLoading,
    sendingRowsSorted,
    sendingsInfographic,
    sendingsTableTotals,
    sendingsRepeatedVehicleTotals,
    sendingsVehicleGrandTotals,
    sendingsSectionProps,
    sendingsSummaryCollapsed,
    setSendingsSummaryCollapsed,
    canEditEor,
    canEditPlanDate,
    canRunSanctionsCheck,
    selectedVisibleSendingCount,
    bulkSendingActionLoading,
    bulkEorMenuOpen,
    setBulkEorMenuOpen,
    bulkPlanDateOpen,
    setBulkPlanDateOpen,
    bulkPlanDateValue,
    setBulkPlanDateValue,
    bulkSendingActionError,
    bulkSendingActionInfo,
    applyBulkEorStatus,
    applyBulkPlanDate,
    applyBulkSanctionsCheck,
    sendingsFerryActionError,
  };
}
