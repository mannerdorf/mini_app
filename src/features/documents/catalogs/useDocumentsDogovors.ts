import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchDogovors,
} from "../../../api/client/documents";
import { cachedDocumentMatchesEdoStatusFilter } from "../../../lib/edoStatus";
import { downloadDocumentDirect } from "../../../lib/downloadDocumentDirect";

export type DogovorRow = {
  id: number;
  docNumber: string;
  docDate: string | null;
  customerName: string;
  customerInn: string;
  title: string;
  edoStatus?: string | null;
  data?: Record<string, unknown> | null;
};

type UseDocumentsDogovorsInput = {
  active: boolean;
  effectiveActiveInn?: string;
  effectiveServiceMode: boolean;
  edoStatusFilterSet: Set<string>;
};

export function useDocumentsDogovors({
  active,
  effectiveActiveInn,
  effectiveServiceMode,
  edoStatusFilterSet,
}: UseDocumentsDogovorsInput) {
  const [dogovorsList, setDogovorsList] = useState<DogovorRow[]>([]);
  const [dogovorsLoading, setDogovorsLoading] = useState(false);
  const [dogovorsDownloadingId, setDogovorsDownloadingId] = useState<number | null>(null);
  const [dogovorsDownloadError, setDogovorsDownloadError] = useState<string | null>(null);
  const [dogovorsCustomerFilter, setDogovorsCustomerFilter] = useState<string>("");
  const [isDogovorsCustomerDropdownOpen, setIsDogovorsCustomerDropdownOpen] = useState(false);

  useEffect(() => {
    if (!active) return;
    setDogovorsLoading(true);
    const scope = { inn: effectiveActiveInn, serviceMode: effectiveServiceMode };
    fetchDogovors<DogovorRow>(scope)
      .then(setDogovorsList)
      .finally(() => setDogovorsLoading(false));
  }, [active, effectiveActiveInn, effectiveServiceMode]);

  useEffect(() => {
    if (effectiveServiceMode) return;
    setDogovorsCustomerFilter("");
    setIsDogovorsCustomerDropdownOpen(false);
  }, [effectiveServiceMode]);

  const uniqueDogovorsCustomers = useMemo(
    () =>
      [...new Set(dogovorsList.map((row) => String(row.customerName || "").trim()).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, "ru")
      ),
    [dogovorsList]
  );

  const filteredDogovors = useMemo(() => {
    return dogovorsList.filter((row) => {
      if (effectiveServiceMode && dogovorsCustomerFilter && String(row.customerName || "").trim() !== dogovorsCustomerFilter) {
        return false;
      }
      if (!cachedDocumentMatchesEdoStatusFilter(row, edoStatusFilterSet)) return false;
      return true;
    });
  }, [dogovorsList, effectiveServiceMode, dogovorsCustomerFilter, edoStatusFilterSet]);

  const downloadDogovorFile = useCallback(async (row: { id: number; docNumber: string; docDate: string | null; customerInn: string }) => {
    const number = String(row.docNumber || "").trim();
    const docDateRaw = row.docDate;
    const dateDog = docDateRaw
      ? (() => {
          const d = new Date(docDateRaw);
          if (isNaN(d.getTime())) return "";
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, "0");
          const day = String(d.getDate()).padStart(2, "0");
          return `${y}-${m}-${day}T00:00:00`;
        })()
      : "";
    const inn = String(row.customerInn || "").trim();
    if (!number || !dateDog || !inn) return;
    setDogovorsDownloadingId(row.id);
    setDogovorsDownloadError(null);
    try {
      await downloadDocumentDirect(null, { metod: "Договор", number, dateDog, inn });
    } catch (e: unknown) {
      setDogovorsDownloadError((e as Error)?.message || "Ошибка скачивания");
    } finally {
      setDogovorsDownloadingId(null);
    }
  }, []);

  const closeDogovorsDropdowns = useCallback(() => {
    setIsDogovorsCustomerDropdownOpen(false);
  }, []);

  return {
    dogovorsList,
    dogovorsLoading,
    dogovorsDownloadingId,
    dogovorsDownloadError,
    dogovorsCustomerFilter,
    setDogovorsCustomerFilter,
    filteredDogovors,
    uniqueDogovorsCustomers,
    downloadDogovorFile,
    isDogovorsCustomerDropdownOpen,
    setIsDogovorsCustomerDropdownOpen,
    closeDogovorsDropdowns,
  };
}
