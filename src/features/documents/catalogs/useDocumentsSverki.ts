import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchDogovorContractLabels,
  fetchSverki,
  fetchSverkiRequests,
  postSverkiRequest,
  type SverkiRequestRow,
} from "../../../api/client/documents";
import { cachedDocumentMatchesEdoStatusFilter } from "../../../lib/edoStatus";
import { downloadDocumentDirect } from "../../../lib/downloadDocumentDirect";
import type { AuthData } from "../../../types";

export type SverkiRow = {
  id: number;
  docNumber: string;
  docDate: string | null;
  periodFrom: string | null;
  periodTo: string | null;
  customerName: string;
  customerInn: string;
  edoStatus?: string | null;
  data?: Record<string, unknown> | null;
};

type ApiDateRange = {
  dateFrom: string;
  dateTo: string;
};

type UseDocumentsSverkiInput = {
  active: boolean;
  auth: AuthData;
  effectiveActiveInn?: string;
  effectiveServiceMode: boolean;
  apiDateRange: ApiDateRange;
  edoStatusFilterSet: Set<string>;
};

export function useDocumentsSverki({
  active,
  auth,
  effectiveActiveInn,
  effectiveServiceMode,
  apiDateRange,
  edoStatusFilterSet,
}: UseDocumentsSverkiInput) {
  const [sverkiList, setSverkiList] = useState<SverkiRow[]>([]);
  const [sverkiLoading, setSverkiLoading] = useState(false);
  const [sverkiDownloadingId, setSverkiDownloadingId] = useState<number | null>(null);
  const [sverkiDownloadError, setSverkiDownloadError] = useState<string | null>(null);
  const [sverkiCustomerFilter, setSverkiCustomerFilter] = useState<string>("");
  const [isSverkiCustomerDropdownOpen, setIsSverkiCustomerDropdownOpen] = useState(false);
  const [sverkiRequests, setSverkiRequests] = useState<SverkiRequestRow[]>([]);
  const [sverkiRequestsLoading, setSverkiRequestsLoading] = useState(false);
  const [sverkiOrderModalOpen, setSverkiOrderModalOpen] = useState(false);
  const [sverkiOrderContract, setSverkiOrderContract] = useState("");
  const [sverkiOrderContractOptions, setSverkiOrderContractOptions] = useState<string[]>([]);
  const [sverkiOrderContractsLoading, setSverkiOrderContractsLoading] = useState(false);
  const [sverkiOrderPeriodFrom, setSverkiOrderPeriodFrom] = useState("");
  const [sverkiOrderPeriodTo, setSverkiOrderPeriodTo] = useState("");
  const [sverkiOrderSubmitting, setSverkiOrderSubmitting] = useState(false);
  const [sverkiOrderError, setSverkiOrderError] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return;
    setSverkiLoading(true);
    const scope = { inn: effectiveActiveInn, serviceMode: effectiveServiceMode };
    fetchSverki(scope)
      .then((result) => setSverkiList(result.list as SverkiRow[]))
      .finally(() => setSverkiLoading(false));
  }, [active, effectiveActiveInn, effectiveServiceMode]);

  useEffect(() => {
    if (!active || !effectiveActiveInn || !auth?.login || !auth?.password) {
      setSverkiRequests([]);
      return;
    }
    setSverkiRequestsLoading(true);
    fetchSverkiRequests({ login: auth.login, password: auth.password }, effectiveActiveInn)
      .then(setSverkiRequests)
      .catch(() => setSverkiRequests([]))
      .finally(() => setSverkiRequestsLoading(false));
  }, [active, effectiveActiveInn, auth?.login, auth?.password]);

  useEffect(() => {
    if (effectiveServiceMode) return;
    setSverkiCustomerFilter("");
    setIsSverkiCustomerDropdownOpen(false);
  }, [effectiveServiceMode]);

  const uniqueSverkiCustomers = useMemo(
    () =>
      [...new Set(sverkiList.map((row) => String(row.customerName || "").trim()).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, "ru")
      ),
    [sverkiList]
  );

  const filteredSverki = useMemo(() => {
    const fromDate = new Date(`${apiDateRange.dateFrom}T00:00:00`);
    const toDate = new Date(`${apiDateRange.dateTo}T23:59:59`);
    return sverkiList.filter((row) => {
      if (effectiveServiceMode && sverkiCustomerFilter && String(row.customerName || "").trim() !== sverkiCustomerFilter) {
        return false;
      }
      if (!cachedDocumentMatchesEdoStatusFilter(row, edoStatusFilterSet)) return false;
      if (!row.docDate) return true;
      const d = new Date(row.docDate);
      return d >= fromDate && d <= toDate;
    });
  }, [sverkiList, apiDateRange.dateFrom, apiDateRange.dateTo, effectiveServiceMode, sverkiCustomerFilter, edoStatusFilterSet]);

  const downloadSverkaFile = useCallback(async (row: { id: number; docNumber: string; docDate: string | null }) => {
    const number = String(row.docNumber || "").trim();
    const docDateRaw = row.docDate;
    const dateDoc = docDateRaw
      ? (() => {
          const d = new Date(docDateRaw);
          if (isNaN(d.getTime())) return "";
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, "0");
          const day = String(d.getDate()).padStart(2, "0");
          return `${y}-${m}-${day}T00:00:00`;
        })()
      : "";
    if (!number || !dateDoc) return;
    setSverkiDownloadingId(row.id);
    setSverkiDownloadError(null);
    try {
      await downloadDocumentDirect(auth, { metod: "АктСверки", number, dateDoc });
    } catch (e: unknown) {
      setSverkiDownloadError((e as Error)?.message || "Ошибка скачивания");
    } finally {
      setSverkiDownloadingId(null);
    }
  }, [auth]);

  const loadSverkiOrderContracts = useCallback(async () => {
    if (!effectiveActiveInn) {
      setSverkiOrderContractOptions([]);
      setSverkiOrderContract("");
      return;
    }
    setSverkiOrderContractsLoading(true);
    try {
      const options = await fetchDogovorContractLabels(String(effectiveActiveInn));
      setSverkiOrderContractOptions(options);
      setSverkiOrderContract((prev) => (prev && options.includes(prev) ? prev : options[0] || ""));
    } catch {
      setSverkiOrderContractOptions([]);
      setSverkiOrderContract("");
    } finally {
      setSverkiOrderContractsLoading(false);
    }
  }, [effectiveActiveInn]);

  const openSverkiOrderModal = useCallback(() => {
    setSverkiOrderError(null);
    setSverkiOrderContract("");
    setSverkiOrderContractOptions([]);
    const now = new Date();
    const year = now.getFullYear();
    const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
    const quarterEndMonth = quarterStartMonth + 2;
    const pad = (n: number) => String(n).padStart(2, "0");
    const quarterLastDay = new Date(year, quarterEndMonth + 1, 0).getDate();
    setSverkiOrderPeriodFrom(`${year}-${pad(quarterStartMonth + 1)}-01`);
    setSverkiOrderPeriodTo(`${year}-${pad(quarterEndMonth + 1)}-${pad(quarterLastDay)}`);
    setSverkiOrderModalOpen(true);
    void loadSverkiOrderContracts();
  }, [loadSverkiOrderContracts]);

  const submitSverkiOrder = useCallback(async () => {
    if (!effectiveActiveInn || !auth?.login || !auth?.password) {
      setSverkiOrderError("Не удалось определить ИНН или авторизацию");
      return;
    }
    if (!sverkiOrderPeriodFrom || !sverkiOrderPeriodTo || !sverkiOrderContract.trim()) {
      setSverkiOrderError("Заполните период и выберите договор");
      return;
    }
    setSverkiOrderSubmitting(true);
    setSverkiOrderError(null);
    try {
      const data = await postSverkiRequest(
        { login: auth.login, password: auth.password },
        {
          customerInn: effectiveActiveInn,
          periodFrom: sverkiOrderPeriodFrom,
          periodTo: sverkiOrderPeriodTo,
          contract: sverkiOrderContract.trim(),
        }
      );
      setSverkiOrderModalOpen(false);
      setSverkiRequests((prev) => {
        const row = data?.request;
        if (!row) return prev;
        return [row, ...prev];
      });
    } catch (e: unknown) {
      setSverkiOrderError((e as Error)?.message || "Не удалось создать заявку");
    } finally {
      setSverkiOrderSubmitting(false);
    }
  }, [
    auth?.login,
    auth?.password,
    effectiveActiveInn,
    sverkiOrderContract,
    sverkiOrderPeriodFrom,
    sverkiOrderPeriodTo,
  ]);

  const closeSverkiDropdowns = useCallback(() => {
    setIsSverkiCustomerDropdownOpen(false);
  }, []);

  return {
    sverkiList,
    sverkiLoading,
    sverkiDownloadingId,
    sverkiDownloadError,
    sverkiCustomerFilter,
    setSverkiCustomerFilter,
    filteredSverki,
    uniqueSverkiCustomers,
    downloadSverkaFile,
    sverkiRequests,
    sverkiRequestsLoading,
    sverkiOrderModalOpen,
    setSverkiOrderModalOpen,
    sverkiOrderContract,
    setSverkiOrderContract,
    sverkiOrderContractOptions,
    sverkiOrderContractsLoading,
    sverkiOrderPeriodFrom,
    setSverkiOrderPeriodFrom,
    sverkiOrderPeriodTo,
    setSverkiOrderPeriodTo,
    sverkiOrderSubmitting,
    sverkiOrderError,
    openSverkiOrderModal,
    submitSverkiOrder,
    isSverkiCustomerDropdownOpen,
    setIsSverkiCustomerDropdownOpen,
    closeSverkiDropdowns,
  };
}
