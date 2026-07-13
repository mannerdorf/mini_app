import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchClaimsList,
  fetchClaimById,
  postClaimAction,
} from "../../../api/client/documents";
import { computeDocumentsApiDateRange } from "../../../pages/useDocumentsDateRange";
import type { AuthData, DateFilter } from "../../../types";
import { getFirstCargoNumberFromInvoice } from "../lib/documentsPipeline";
import { CLAIMS_PREFILL_CARGO_KEY } from "./claimFormConstants";
import {
  extractCustomerClaimPayloadFromEvents,
  fileToBase64,
} from "./claimFormUtils";
import {
  CLAIM_STATUS_BADGE,
  type ClaimStatusKey,
} from "./claimStatusConstants";

export type ClaimListRow = {
  id: number;
  claimNumber: string;
  cargoNumber: string;
  claimType: string;
  description: string;
  requestedAmount: number | null;
  approvedAmount: number | null;
  status: ClaimStatusKey;
  customerCompanyName?: string;
  createdAt: string;
  updatedAt: string;
};

type DocSectionKey = string;

type AllowedSection = { key: DocSectionKey };

type UseDocumentsClaimsInput = {
  active: boolean;
  auth: AuthData;
  effectiveActiveInn?: string;
  effectiveServiceMode: boolean;
  sortOrder: "asc" | "desc";
  dateFilter: DateFilter;
  customDateFrom: string;
  customDateTo: string;
  selectedMonthForFilter: number;
  selectedYearForFilter: number;
  selectedWeekForFilter: string;
  allowedDocSections: AllowedSection[];
  onNavigateToClaims?: () => void;
  items: any[];
  perevozkiItems: any[];
};

export function useDocumentsClaims({
  active,
  auth,
  effectiveActiveInn,
  effectiveServiceMode,
  sortOrder,
  dateFilter,
  customDateFrom,
  customDateTo,
  selectedMonthForFilter,
  selectedYearForFilter,
  selectedWeekForFilter,
  allowedDocSections,
  onNavigateToClaims,
  items,
  perevozkiItems,
}: UseDocumentsClaimsInput) {
  const [claimsList, setClaimsList] = useState<ClaimListRow[]>([]);
  const claimsRequestIdRef = useRef(0);
  const [claimsLoading, setClaimsLoading] = useState(false);
  const [claimsStatusFilter, setClaimsStatusFilter] = useState<string>("all");
  const [claimsCustomerFilter, setClaimsCustomerFilter] = useState<string>("");
  const [claimsCreateOpen, setClaimsCreateOpen] = useState(false);
  const [claimsCreatePrefill, setClaimsCreatePrefill] = useState("");
  const [claimsModalBusy, setClaimsModalBusy] = useState(false);
  const [claimsEditingId, setClaimsEditingId] = useState<number | null>(null);
  const [claimsActionLoadingId, setClaimsActionLoadingId] = useState<number | null>(null);
  const [claimsReplyOpen, setClaimsReplyOpen] = useState(false);
  const [claimsReplyClaimId, setClaimsReplyClaimId] = useState<number | null>(null);
  const [claimsReplyPhotoFiles, setClaimsReplyPhotoFiles] = useState<File[]>([]);
  const [claimsReplyDocumentFiles, setClaimsReplyDocumentFiles] = useState<File[]>([]);
  const [claimsReplyVideoLink, setClaimsReplyVideoLink] = useState("");
  const [claimsReplySubmitting, setClaimsReplySubmitting] = useState(false);
  const [claimsReplyError, setClaimsReplyError] = useState<string | null>(null);
  const [claimsDetailOpen, setClaimsDetailOpen] = useState(false);
  const [claimsDetailLoading, setClaimsDetailLoading] = useState(false);
  const [claimsDetailError, setClaimsDetailError] = useState<string | null>(null);
  const [claimsDetailData, setClaimsDetailData] = useState<any | null>(null);
  const [isClaimsStatusDropdownOpen, setIsClaimsStatusDropdownOpen] = useState(false);
  const [isClaimsCustomerDropdownOpen, setIsClaimsCustomerDropdownOpen] = useState(false);

  const reloadClaims = useCallback(async () => {
    const requestId = ++claimsRequestIdRef.current;
    if (!active || !auth?.login || !auth?.password) {
      setClaimsLoading(false);
      setClaimsList([]);
      return;
    }
    setClaimsLoading(true);
    const claimsDateRange = computeDocumentsApiDateRange({
      dateFilter,
      customDateFrom,
      customDateTo,
      selectedMonthForFilter,
      selectedYearForFilter,
      selectedWeekForFilter,
    });
    const selectedInn = String(effectiveActiveInn || auth?.inn || "").trim();
    try {
      const list = await fetchClaimsList(
        { login: auth.login, password: auth.password, inn: selectedInn },
        {
          status: claimsStatusFilter,
          dateFrom: claimsDateRange.dateFrom,
          dateTo: claimsDateRange.dateTo,
          inn: selectedInn,
        }
      );
      if (requestId === claimsRequestIdRef.current) {
        setClaimsList(list as ClaimListRow[]);
      }
    } catch {
      if (requestId === claimsRequestIdRef.current) {
        setClaimsList([]);
      }
    } finally {
      if (requestId === claimsRequestIdRef.current) {
        setClaimsLoading(false);
      }
    }
  }, [
    active,
    auth?.login,
    auth?.password,
    auth?.inn,
    claimsStatusFilter,
    effectiveActiveInn,
    dateFilter,
    customDateFrom,
    customDateTo,
    selectedMonthForFilter,
    selectedYearForFilter,
    selectedWeekForFilter,
  ]);

  useEffect(() => {
    reloadClaims();
  }, [reloadClaims]);

  const openClaimsCreateModal = useCallback((prefillCargoNumber?: string) => {
    setClaimsEditingId(null);
    setClaimsCreatePrefill(String(prefillCargoNumber || "").trim());
    setClaimsCreateOpen(true);
  }, []);

  useEffect(() => {
    if (!active) return;
    if (!allowedDocSections.some(({ key }) => key === "Претензии")) return;
    let prefillCargo = "";
    try {
      prefillCargo = String(localStorage.getItem(CLAIMS_PREFILL_CARGO_KEY) || "").trim();
      if (prefillCargo) localStorage.removeItem(CLAIMS_PREFILL_CARGO_KEY);
    } catch {
      prefillCargo = "";
    }
    if (!prefillCargo) return;
    openClaimsCreateModal(prefillCargo);
  }, [active, allowedDocSections, openClaimsCreateModal]);

  useEffect(() => {
    if (active) return;
    if (!allowedDocSections.some(({ key }) => key === "Претензии")) return;
    let hasPrefill = false;
    try {
      hasPrefill = Boolean(String(localStorage.getItem(CLAIMS_PREFILL_CARGO_KEY) || "").trim());
    } catch {
      hasPrefill = false;
    }
    if (hasPrefill) onNavigateToClaims?.();
  }, [active, allowedDocSections, onNavigateToClaims]);

  useEffect(() => {
    if (effectiveServiceMode) return;
    setClaimsCustomerFilter("");
    setIsClaimsCustomerDropdownOpen(false);
  }, [effectiveServiceMode]);

  const openDraftEditor = useCallback((claimId: number) => {
    setClaimsEditingId(claimId);
    setClaimsCreatePrefill("");
    setClaimsCreateOpen(true);
  }, []);

  const openClaimDetailModal = useCallback(
    async (claimId: number) => {
      if (!auth?.login || !auth?.password) return;
      setClaimsDetailOpen(true);
      setClaimsDetailLoading(true);
      setClaimsDetailError(null);
      setClaimsDetailData(null);
      try {
        const claimAuth = {
          login: auth.login,
          password: auth.password,
          inn: String(effectiveActiveInn || auth?.inn || "").trim(),
        };
        const { ok, data } = await fetchClaimById(claimAuth, claimId);
        if (!ok) throw new Error((data as { error?: string })?.error || "Не удалось загрузить карточку претензии");
        setClaimsDetailData(data);
      } catch (e: any) {
        setClaimsDetailError(e?.message || "Не удалось загрузить карточку претензии");
      } finally {
        setClaimsDetailLoading(false);
      }
    },
    [auth?.login, auth?.password, auth?.inn, effectiveActiveInn]
  );

  const runClaimAction = useCallback(
    async (claimId: number, action: "submit" | "withdraw") => {
      if (!auth?.login || !auth?.password) return;
      setClaimsActionLoadingId(claimId);
      try {
        const claimAuth = {
          login: auth.login,
          password: auth.password,
          inn: String(effectiveActiveInn || auth?.inn || "").trim(),
        };
        const { ok, data } = await postClaimAction(claimAuth, claimId, { action });
        if (!ok) throw new Error((data as { error?: string })?.error || "Не удалось обновить статус претензии");
        await reloadClaims();
      } catch (e: any) {
        console.error(e?.message || "Ошибка действия по претензии");
      } finally {
        setClaimsActionLoadingId(null);
      }
    },
    [auth?.login, auth?.password, auth?.inn, effectiveActiveInn, reloadClaims]
  );

  const openClaimReplyModal = useCallback((claimId: number) => {
    setClaimsReplyClaimId(claimId);
    setClaimsReplyPhotoFiles([]);
    setClaimsReplyDocumentFiles([]);
    setClaimsReplyVideoLink("");
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
          mimeType: file.type || "image/jpeg",
          caption: "Ответ на запрос документов",
          base64: await fileToBase64(file),
        }))
      );
      const documentsPayload = await Promise.all(
        claimsReplyDocumentFiles.map(async (file) => ({
          fileName: file.name,
          mimeType: file.type || "application/pdf",
          docType: "other" as const,
          base64: await fileToBase64(file),
        }))
      );
      const claimAuth = {
        login: auth.login,
        password: auth.password,
        inn: String(effectiveActiveInn || auth?.inn || "").trim(),
      };
      const { ok, data } = await postClaimAction(claimAuth, claimsReplyClaimId, {
        action: "upload_documents",
        photos: photosPayload,
        documents: documentsPayload,
        videoLinks: claimsReplyVideoLink.trim()
          ? [{ url: claimsReplyVideoLink.trim(), title: "Видео по запросу документов" }]
          : [],
      });
      if (!ok) throw new Error((data as { error?: string })?.error || "Не удалось отправить документы");
      setClaimsReplyOpen(false);
      setClaimsReplyClaimId(null);
      setClaimsReplyPhotoFiles([]);
      setClaimsReplyDocumentFiles([]);
      setClaimsReplyVideoLink("");
      await reloadClaims();
    } catch (e: any) {
      setClaimsReplyError(e?.message || "Ошибка отправки документов");
    } finally {
      setClaimsReplySubmitting(false);
    }
  }, [
    claimsReplyClaimId,
    auth?.login,
    auth?.password,
    auth?.inn,
    effectiveActiveInn,
    claimsReplyPhotoFiles,
    claimsReplyDocumentFiles,
    claimsReplyVideoLink,
    reloadClaims,
  ]);

  const uniqueClaimsCustomers = useMemo(
    () =>
      [...new Set(claimsList.map((row) => String(row.customerCompanyName || "").trim()).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, "ru")
      ),
    [claimsList]
  );

  const filteredClaims = useMemo(() => {
    let rows = claimsList;
    if (effectiveServiceMode && claimsCustomerFilter) {
      rows = rows.filter((row) => String(row.customerCompanyName || "").trim() === claimsCustomerFilter);
    }
    return [...rows].sort((a, b) => {
      const da = new Date(a.createdAt || 0).getTime();
      const db = new Date(b.createdAt || 0).getTime();
      return sortOrder === "asc" ? da - db : db - da;
    });
  }, [claimsList, effectiveServiceMode, claimsCustomerFilter, sortOrder]);

  const claimDetailStatusKey = useMemo(
    () => String(claimsDetailData?.claim?.status || "new") as ClaimStatusKey,
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

  const claimCargoOptions = useMemo(() => {
    const set = new Set<string>();
    (items || []).forEach((item: any) => {
      const number = String(getFirstCargoNumberFromInvoice(item) || "").trim();
      if (number) set.add(number);
    });
    (perevozkiItems || []).forEach((c: any) => {
      const raw = String(c?.Number ?? c?.number ?? "").trim();
      if (raw) set.add(raw);
    });
    return [...set].sort((a, b) => a.localeCompare(b, "ru"));
  }, [items, perevozkiItems]);

  const closeClaimsDropdowns = useCallback(() => {
    setIsClaimsCustomerDropdownOpen(false);
    setIsClaimsStatusDropdownOpen(false);
  }, []);

  return {
    claimsList,
    claimsLoading,
    claimsStatusFilter,
    setClaimsStatusFilter,
    claimsCustomerFilter,
    setClaimsCustomerFilter,
    uniqueClaimsCustomers,
    filteredClaims,
    isClaimsStatusDropdownOpen,
    setIsClaimsStatusDropdownOpen,
    isClaimsCustomerDropdownOpen,
    setIsClaimsCustomerDropdownOpen,
    closeClaimsDropdowns,
    reloadClaims,
    openClaimsCreateModal,
    claimsCreateOpen,
    setClaimsCreateOpen,
    claimsCreatePrefill,
    claimsModalBusy,
    setClaimsModalBusy,
    claimsEditingId,
    setClaimsEditingId,
    claimsActionLoadingId,
    openDraftEditor,
    openClaimDetailModal,
    runClaimAction,
    claimsReplyOpen,
    setClaimsReplyOpen,
    claimsReplyClaimId,
    claimsReplyPhotoFiles,
    setClaimsReplyPhotoFiles,
    claimsReplyDocumentFiles,
    setClaimsReplyDocumentFiles,
    claimsReplyVideoLink,
    setClaimsReplyVideoLink,
    claimsReplySubmitting,
    claimsReplyError,
    openClaimReplyModal,
    submitClaimReplyDocuments,
    claimsDetailOpen,
    setClaimsDetailOpen,
    claimsDetailLoading,
    claimsDetailError,
    claimsDetailData,
    claimDetailStatusKey,
    claimDetailStatusStyle,
    claimCustomerPayload,
    claimCargoOptions,
  };
}
