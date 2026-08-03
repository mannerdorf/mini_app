import { useState, useEffect, useCallback } from "react";
import { fetchAdminClaims, fetchAdminClaimDetail, postAdminClaimUpdate } from "../../../api/client/admin/claims";
import { downloadBase64File } from "../../../utils";
import { fileToBase64 } from "../../documents/claims/claimFormUtils";
import {
  normalizePlaceKey,
  extractPlaceNumberFromLabel,
  extractPerevozkaNomenclatureRows,
  pickFirstNumericField,
} from "../lib/claimDamageCalc";
import type { UseAdminEmployeeDirectoryReturn } from "./useAdminEmployeeDirectory";

export type AdminClaimListItem = {
  id: number;
  claimNumber: string;
  customerCompanyName: string;
  customerInn: string;
  cargoNumber: string;
  description: string;
  requestedAmount: number | null;
  approvedAmount: number | null;
  status: string;
  daysInWork: number;
  createdAt: string;
};

export type UseAdminClaimsParams = {
  adminToken: string;
  isSuperAdmin: boolean;
  onError: (msg: string | null) => void;
  employeeDir: UseAdminEmployeeDirectoryReturn;
};

export function useAdminClaims({
  adminToken,
  isSuperAdmin,
  onError,
  employeeDir,
}: UseAdminClaimsParams) {
  const [adminClaims, setAdminClaims] = useState<{
    id: number;
    claimNumber: string;
    customerCompanyName: string;
    customerInn: string;
    cargoNumber: string;
    description: string;
    requestedAmount: number | null;
    approvedAmount: number | null;
    status: string;
    daysInWork: number;
    createdAt: string;
  }[]>([]);
  const [adminClaimsLoading, setAdminClaimsLoading] = useState(false);
  const [adminClaimsStatusFilter, setAdminClaimsStatusFilter] = useState<string>("");
  const [adminClaimsSearch, setAdminClaimsSearch] = useState<string>("");
  const [adminClaimsUpdatingId, setAdminClaimsUpdatingId] = useState<number | null>(null);
  const [adminClaimsView, setAdminClaimsView] = useState<"new" | "in_progress" | "all">("all");
  const [adminClaimsKpi, setAdminClaimsKpi] = useState<{ activeCount: number; overdueCount: number; requestedSum: number; approvedSum: number } | null>(null);
  const [adminClaimsChart, setAdminClaimsChart] = useState<{ day: string; count: number }[]>([]);
  const [adminClaimDetailId, setAdminClaimDetailId] = useState<number | null>(null);
  const [adminClaimDetailReloadTick, setAdminClaimDetailReloadTick] = useState(0);
  const [adminClaimDetailLoading, setAdminClaimDetailLoading] = useState(false);
  const [adminClaimDetail, setAdminClaimDetail] = useState<any | null>(null);
  const [adminClaimNoteDraft, setAdminClaimNoteDraft] = useState("");
  const [adminLeaderCommentDraft, setAdminLeaderCommentDraft] = useState("");
  const [adminClaimApprovedAmountDraft, setAdminClaimApprovedAmountDraft] = useState("");
  const [adminClaimMaxDamageAmount, setAdminClaimMaxDamageAmount] = useState<number | null>(null);
  const [adminClaimMaxDamageLoading, setAdminClaimMaxDamageLoading] = useState(false);
  const [adminClaimDocDownloading, setAdminClaimDocDownloading] = useState<"" | "ЭР" | "АПП">("");
  const [adminClaimDocError, setAdminClaimDocError] = useState<string>("");
  const [adminDelegateOpen, setAdminDelegateOpen] = useState(false);
  const [adminDelegateLogin, setAdminDelegateLogin] = useState("");
  const [adminDelegateComment, setAdminDelegateComment] = useState("");
  const [adminRequestDocsOpen, setAdminRequestDocsOpen] = useState(false);
  const [adminRequestDocUPD, setAdminRequestDocUPD] = useState(false);
  const [adminRequestDocTTN, setAdminRequestDocTTN] = useState(false);
  const [adminRequestDocsComment, setAdminRequestDocsComment] = useState("");
  const [adminClaimAttachRole, setAdminClaimAttachRole] = useState<"manager" | "leader">("manager");
  const [adminClaimAttachPhotoFiles, setAdminClaimAttachPhotoFiles] = useState<File[]>([]);
  const [adminClaimAttachDocumentFiles, setAdminClaimAttachDocumentFiles] = useState<File[]>([]);
  const [adminClaimAttachVideoLink, setAdminClaimAttachVideoLink] = useState("");
  const [adminClaimAttachSubmitting, setAdminClaimAttachSubmitting] = useState(false);
  const [adminClaimAttachError, setAdminClaimAttachError] = useState("");

  const reloadAdminClaims = useCallback(async () => {
    if (!adminToken || !isSuperAdmin) {
      setAdminClaims([]);
      return;
    }
    setAdminClaimsLoading(true);
    try {
      const viewStatus = adminClaimsView === "new"
        ? "new"
        : adminClaimsView === "in_progress"
          ? "in_progress"
          : "";
      const effectiveStatus = adminClaimsStatusFilter || viewStatus;
      const data = await fetchAdminClaims(adminToken, {
        status: effectiveStatus || undefined,
        q: adminClaimsSearch,
      });
      setAdminClaims(data.claims);
      setAdminClaimsKpi(data.kpi);
      setAdminClaimsChart(data.chart);
    } catch {
      setAdminClaims([]);
      setAdminClaimsKpi(null);
      setAdminClaimsChart([]);
    } finally {
      setAdminClaimsLoading(false);
    }
  }, [adminToken, isSuperAdmin, adminClaimsStatusFilter, adminClaimsSearch, adminClaimsView]);


  const updateAdminClaimStatus = useCallback(async (
    id: number,
    status: string,
    approvedAmount?: number | null,
    extras?: { expertLogin?: string; managerNote?: string; leaderComment?: string; accountantLogin?: string; internalComment?: string }
  ) => {
    if (!adminToken) return;
    setAdminClaimsUpdatingId(id);
    try {
      await postAdminClaimUpdate(adminToken, {
        claimId: id,
        status,
        approvedAmount: approvedAmount != null ? approvedAmount : undefined,
        expertLogin: extras?.expertLogin || undefined,
        managerNote: extras?.managerNote || undefined,
        leaderComment: extras?.leaderComment || undefined,
        accountantLogin: extras?.accountantLogin || undefined,
        internalComment: extras?.internalComment || undefined,
        enqueuePush: true,
      });
      reloadAdminClaims();
    } catch (e: unknown) {
      onError((e as Error)?.message || "Ошибка обновления претензии");
    } finally {
      setAdminClaimsUpdatingId(null);
    }
  }, [adminToken, reloadAdminClaims]);
  const deleteAdminClaim = useCallback(async (id: number) => {
    if (!adminToken) return;
    const confirmed = typeof window !== "undefined" ? window.confirm("Удалить претензию? Действие нельзя отменить.") : true;
    if (!confirmed) return;
    setAdminClaimsUpdatingId(id);
    try {
      await postAdminClaimUpdate(adminToken, {
        action: "delete",
        claimId: id,
      });
      if (adminClaimDetailId === id) setAdminClaimDetailId(null);
      reloadAdminClaims();
    } catch (e: unknown) {
      onError((e as Error)?.message || "Ошибка удаления претензии");
    } finally {
      setAdminClaimsUpdatingId(null);
    }
  }, [adminToken, reloadAdminClaims, adminClaimDetailId]);
  const downloadClaimCargoDoc = useCallback(async (method: "ЭР" | "АПП") => {
    const cargoNumber = String(adminClaimDetail?.claim?.cargoNumber || "").trim();
    if (!cargoNumber) {
      setAdminClaimDocError("Не указан номер перевозки");
      return;
    }
    setAdminClaimDocError("");
    setAdminClaimDocDownloading(method);
    try {
      const res = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          metod: method,
          number: cargoNumber,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || data?.error || `Не удалось получить ${method}`);
      if (!data?.data) throw new Error(`Документ ${method} не найден`);
      await downloadBase64File({
        data: String(data.data),
        name: data?.name || `${method}_${cargoNumber}.pdf`,
        isHtml: Boolean(data?.isHtml),
      });
    } catch (e: unknown) {
      setAdminClaimDocError((e as Error)?.message || `Ошибка скачивания ${method}`);
    } finally {
      setAdminClaimDocDownloading("");
    }
  }, [adminClaimDetail?.claim?.cargoNumber]);
  const uploadAdminClaimDocuments = useCallback(async () => {
    if (!adminToken || !adminClaimDetail?.claim?.id) return;
    const video = adminClaimAttachVideoLink.trim();
    const comment = adminClaimAttachRole === "leader" ? adminLeaderCommentDraft.trim() : adminClaimNoteDraft.trim();
    const hasAttach = adminClaimAttachPhotoFiles.length > 0 || adminClaimAttachDocumentFiles.length > 0 || !!video;
    if (!hasAttach && !comment) {
      setAdminClaimAttachError("Добавьте комментарий или хотя бы один файл/видео-ссылку");
      return;
    }
    setAdminClaimAttachSubmitting(true);
    setAdminClaimAttachError("");
    const maxFileSize = 5 * 1024 * 1024;
    const oversizedPhoto = adminClaimAttachPhotoFiles.find((f) => f.size > maxFileSize);
    const oversizedDoc = adminClaimAttachDocumentFiles.find((f) => f.size > maxFileSize);
    if (oversizedPhoto) {
      setAdminClaimAttachError(`Файл «${oversizedPhoto.name}» превышает лимит 5 МБ`);
      setAdminClaimAttachSubmitting(false);
      return;
    }
    if (oversizedDoc) {
      setAdminClaimAttachError(`Документ «${oversizedDoc.name}» превышает лимит 5 МБ`);
      setAdminClaimAttachSubmitting(false);
      return;
    }
    try {
      const photosPayload = await Promise.all(
        adminClaimAttachPhotoFiles.map(async (file) => ({
          fileName: file.name,
          mimeType: file.type || "image/jpeg",
          caption: "",
          base64: await fileToBase64(file),
        }))
      );
      const documentsPayload = await Promise.all(
        adminClaimAttachDocumentFiles.map(async (file) => ({
          fileName: file.name,
          mimeType: file.type || "application/pdf",
          docType: "other" as const,
          base64: await fileToBase64(file),
        }))
      );
      const videoLinksPayload = video ? [{ url: video, title: adminClaimAttachRole === "leader" ? "Видео от руководителя" : "Видео от менеджера" }] : [];
      await postAdminClaimUpdate(adminToken, {
        action: "upload_documents",
        claimId: Number(adminClaimDetail.claim.id),
        actorRole: adminClaimAttachRole,
        photos: photosPayload,
        documents: documentsPayload,
        videoLinks: videoLinksPayload,
        managerNote: adminClaimAttachRole === "manager" ? adminClaimNoteDraft.trim() : undefined,
        leaderComment: adminClaimAttachRole === "leader" ? adminLeaderCommentDraft.trim() : undefined,
        enqueuePush: false,
      });
      setAdminClaimAttachPhotoFiles([]);
      setAdminClaimAttachDocumentFiles([]);
      setAdminClaimAttachVideoLink("");
      if (adminClaimAttachRole === "leader") setAdminLeaderCommentDraft("");
      else setAdminClaimNoteDraft("");
      setAdminClaimDetailReloadTick((v) => v + 1);
    } catch (e: unknown) {
      setAdminClaimAttachError((e as Error)?.message || "Ошибка прикрепления файлов");
    } finally {
      setAdminClaimAttachSubmitting(false);
    }
  }, [
    adminToken,
    adminClaimDetail?.claim?.id,
    adminClaimAttachRole,
    adminClaimNoteDraft,
    adminLeaderCommentDraft,
    adminClaimAttachPhotoFiles,
    adminClaimAttachDocumentFiles,
    adminClaimAttachVideoLink,
  ]);

  useEffect(() => {
    if (!adminClaimDetailId || !adminToken) {
      setAdminClaimDetail(null);
      setAdminClaimMaxDamageAmount(null);
      setAdminClaimMaxDamageLoading(false);
      return;
    }
    let cancelled = false;
    setAdminClaimDetailLoading(true);
    fetchAdminClaimDetail(adminToken, adminClaimDetailId)
      .then((data) => {
        if (cancelled) return;
        setAdminClaimDetail(data || null);
        const claim = (data as { claim?: Record<string, unknown> })?.claim || {};
        setAdminClaimNoteDraft(String(claim?.managerNote || ""));
        setAdminLeaderCommentDraft(String(claim?.leaderComment || ""));
        setAdminClaimApprovedAmountDraft(claim?.approvedAmount != null ? String(claim.approvedAmount) : "");
        setAdminDelegateOpen(false);
        setAdminDelegateLogin(String(claim?.expertLogin || ""));
        setAdminDelegateComment("");
        setAdminRequestDocsOpen(false);
        setAdminRequestDocUPD(false);
        setAdminRequestDocTTN(false);
        setAdminRequestDocsComment("");
        setAdminClaimAttachRole("manager");
        setAdminClaimAttachPhotoFiles([]);
        setAdminClaimAttachDocumentFiles([]);
        setAdminClaimAttachVideoLink("");
        setAdminClaimAttachError("");
        setAdminClaimDocError("");
        setAdminClaimDocDownloading("");
        if (claim?.id && String(claim?.status || "") === "new") {
          setAdminClaimDetail((prev: any) => ({ ...prev, claim: { ...prev?.claim, status: "in_progress" } }));
          updateAdminClaimStatus(
            Number(claim.id),
            "in_progress",
            Number(claim?.approvedAmount || 0),
            { expertLogin: String(claim?.expertLogin || "").trim(), managerNote: String(claim?.managerNote || "").trim() }
          );
        }
      })
      .catch(() => {
        if (cancelled) return;
        setAdminClaimDetail(null);
      })
      .finally(() => {
        if (cancelled) return;
        setAdminClaimDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [adminClaimDetailId, adminToken, updateAdminClaimStatus, adminClaimDetailReloadTick]);

  useEffect(() => {
    const cargoNumber = String(adminClaimDetail?.claim?.cargoNumber || "").trim();
    const selectedPlacesRaw = Array.isArray(adminClaimDetail?.customerPayload?.selectedPlaces)
      ? adminClaimDetail.customerPayload.selectedPlaces
      : [];
    const selectedPlaceKeys = selectedPlacesRaw
      .map((value: unknown) => normalizePlaceKey(extractPlaceNumberFromLabel(value)))
      .filter(Boolean);
    if (!cargoNumber || selectedPlaceKeys.length === 0) {
      setAdminClaimMaxDamageAmount(0);
      setAdminClaimMaxDamageLoading(false);
      return;
    }
    let cancelled = false;
    setAdminClaimMaxDamageLoading(true);
    fetch("/api/getperevozka", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ number: cargoNumber }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((data as any)?.error || `Ошибка ${res.status}`);
        return data;
      })
      .then((data) => {
        if (cancelled) return;
        const rows = extractPerevozkaNomenclatureRows(data);
        const selectedSet = new Set(selectedPlaceKeys);
        const rootTariff = pickFirstNumericField(data, ["Tariff", "tariff", "Rate", "rate", "Тариф", "Ставка"]);
        let selectedCostSum = 0;
        let selectedPaidWeightSum = 0;
        let matchedTariff = rootTariff;
        rows.forEach((row: any) => {
          const placeRaw = row?.Package
            ?? row?.package
            ?? row?.Barcode
            ?? row?.barcode
            ?? row?.Штрихкод
            ?? row?.НомерМеста
            ?? row?.PlaceNumber;
          const placeKey = normalizePlaceKey(placeRaw);
          if (!placeKey || !selectedSet.has(placeKey)) return;
          const placeCost = pickFirstNumericField(row, [
            "DeclaredCost",
            "declaredCost",
            "DeclaredValue",
            "declaredValue",
            "ОбъявленнаяСтоимость",
            "ОбъявлСтоимость",
            "Стоимость",
            "Cost",
            "Price",
          ]);
          const paidWeight = pickFirstNumericField(row, [
            "PaidWeight",
            "paidWeight",
            "ChargeableWeight",
            "chargeableWeight",
            "ПлатныйВес",
            "ВесПлатный",
            "WeightPaid",
            "weightPaid",
          ]);
          const rowTariff = pickFirstNumericField(row, ["Tariff", "tariff", "Rate", "rate", "Тариф", "Ставка"]);
          if (rowTariff > 0) matchedTariff = rowTariff;
          selectedCostSum += placeCost;
          selectedPaidWeightSum += paidWeight;
        });
        const total = selectedCostSum + selectedPaidWeightSum * matchedTariff;
        setAdminClaimMaxDamageAmount(Number.isFinite(total) ? Math.max(0, total) : 0);
      })
      .catch(() => {
        if (cancelled) return;
        setAdminClaimMaxDamageAmount(null);
      })
      .finally(() => {
        if (cancelled) return;
        setAdminClaimMaxDamageLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [adminClaimDetail?.claim?.cargoNumber, adminClaimDetail?.customerPayload?.selectedPlaces]);

  useEffect(() => {
    if (isSuperAdmin) {
      employeeDir.fetch();
    }
  }, [isSuperAdmin, employeeDir.fetch]);

  useEffect(() => {
    if (isSuperAdmin) reloadAdminClaims();
  }, [isSuperAdmin, reloadAdminClaims]);

  return {
    adminClaims,
    adminClaimsLoading,
    adminClaimsStatusFilter,
    setAdminClaimsStatusFilter,
    adminClaimsSearch,
    setAdminClaimsSearch,
    adminClaimsUpdatingId,
    adminClaimsView,
    setAdminClaimsView,
    adminClaimsKpi,
    adminClaimsChart,
    adminClaimDetailId,
    setAdminClaimDetailId,
    adminClaimDetailLoading,
    adminClaimDetail,
    adminClaimNoteDraft,
    setAdminClaimNoteDraft,
    adminLeaderCommentDraft,
    setAdminLeaderCommentDraft,
    adminClaimApprovedAmountDraft,
    setAdminClaimApprovedAmountDraft,
    adminClaimMaxDamageAmount,
    adminClaimMaxDamageLoading,
    adminClaimDocDownloading,
    adminClaimDocError,
    setAdminClaimDocError,
    adminDelegateOpen,
    setAdminDelegateOpen,
    adminDelegateLogin,
    setAdminDelegateLogin,
    adminDelegateComment,
    setAdminDelegateComment,
    adminRequestDocsOpen,
    setAdminRequestDocsOpen,
    adminRequestDocUPD,
    setAdminRequestDocUPD,
    adminRequestDocTTN,
    setAdminRequestDocTTN,
    adminRequestDocsComment,
    setAdminRequestDocsComment,
    adminClaimAttachRole,
    setAdminClaimAttachRole,
    adminClaimAttachPhotoFiles,
    setAdminClaimAttachPhotoFiles,
    adminClaimAttachDocumentFiles,
    setAdminClaimAttachDocumentFiles,
    adminClaimAttachVideoLink,
    setAdminClaimAttachVideoLink,
    adminClaimAttachSubmitting,
    adminClaimAttachError,
    setAdminClaimAttachError,
    reloadAdminClaims,
    updateAdminClaimStatus,
    deleteAdminClaim,
    downloadClaimCargoDoc,
    uploadAdminClaimDocuments,
  };
}

export type AdminClaimsState = ReturnType<typeof useAdminClaims>;
