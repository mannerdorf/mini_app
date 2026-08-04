import { useState, useEffect, useCallback } from "react";
import { fetchAdminClaimDetail, postAdminClaimUpdate } from "../../../api/client/admin/claims";
import { downloadAdminDocument } from "../../../api/client/admin/catalogs";
import { downloadBase64File } from "../../../utils";
import { fileToBase64 } from "../../documents/claims/claimFormUtils";
import { fetchAdminClaimMaxDamageAmount } from "../lib/adminClaimMaxDamage";

type Params = {
  adminToken: string;
  adminClaimDetailId: number | null;
  setAdminClaimsUpdatingId: (id: number | null) => void;
  reloadAdminClaims: () => Promise<void>;
  onError: (msg: string | null) => void;
  onDeleteDetail: () => void;
};

export function useAdminClaimDetail({
  adminToken,
  adminClaimDetailId,
  setAdminClaimsUpdatingId,
  reloadAdminClaims,
  onError,
  onDeleteDetail,
}: Params) {
  const [adminClaimDetailReloadTick, setAdminClaimDetailReloadTick] = useState(0);
  const [adminClaimDetailLoading, setAdminClaimDetailLoading] = useState(false);
  const [adminClaimDetail, setAdminClaimDetail] = useState<Record<string, unknown> | null>(null);
  const [adminClaimNoteDraft, setAdminClaimNoteDraft] = useState("");
  const [adminLeaderCommentDraft, setAdminLeaderCommentDraft] = useState("");
  const [adminClaimApprovedAmountDraft, setAdminClaimApprovedAmountDraft] = useState("");
  const [adminClaimMaxDamageAmount, setAdminClaimMaxDamageAmount] = useState<number | null>(null);
  const [adminClaimMaxDamageLoading, setAdminClaimMaxDamageLoading] = useState(false);
  const [adminClaimDocDownloading, setAdminClaimDocDownloading] = useState<"" | "ЭР" | "АПП">("");
  const [adminClaimDocError, setAdminClaimDocError] = useState("");
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

  const updateAdminClaimStatus = useCallback(async (
    id: number,
    status: string,
    approvedAmount?: number | null,
    extras?: { expertLogin?: string; managerNote?: string; leaderComment?: string; accountantLogin?: string; internalComment?: string },
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
      await reloadAdminClaims();
    } catch (e: unknown) {
      onError((e as Error)?.message || "Ошибка обновления претензии");
    } finally {
      setAdminClaimsUpdatingId(null);
    }
  }, [adminToken, reloadAdminClaims, onError, setAdminClaimsUpdatingId]);

  const deleteAdminClaim = useCallback(async (id: number) => {
    if (!adminToken) return;
    const confirmed = typeof window !== "undefined" ? window.confirm("Удалить претензию? Действие нельзя отменить.") : true;
    if (!confirmed) return;
    setAdminClaimsUpdatingId(id);
    try {
      await postAdminClaimUpdate(adminToken, { action: "delete", claimId: id });
      if (adminClaimDetailId === id) onDeleteDetail();
      await reloadAdminClaims();
    } catch (e: unknown) {
      onError((e as Error)?.message || "Ошибка удаления претензии");
    } finally {
      setAdminClaimsUpdatingId(null);
    }
  }, [adminToken, reloadAdminClaims, adminClaimDetailId, onError, setAdminClaimsUpdatingId, onDeleteDetail]);

  const downloadClaimCargoDoc = useCallback(async (method: "ЭР" | "АПП") => {
    const claim = adminClaimDetail?.claim as { cargoNumber?: string } | undefined;
    const cargoNumber = String(claim?.cargoNumber || "").trim();
    if (!cargoNumber) {
      setAdminClaimDocError("Не указан номер перевозки");
      return;
    }
    setAdminClaimDocError("");
    setAdminClaimDocDownloading(method);
    try {
      const doc = await downloadAdminDocument({ metod: method, number: cargoNumber });
      await downloadBase64File({
        data: doc.data,
        name: doc.name || `${method}_${cargoNumber}.pdf`,
        isHtml: Boolean(doc.isHtml),
      });
    } catch (e: unknown) {
      setAdminClaimDocError((e as Error)?.message || `Ошибка скачивания ${method}`);
    } finally {
      setAdminClaimDocDownloading("");
    }
  }, [adminClaimDetail?.claim]);

  const uploadAdminClaimDocuments = useCallback(async () => {
    const claim = adminClaimDetail?.claim as { id?: number } | undefined;
    if (!adminToken || !claim?.id) return;
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
        })),
      );
      const documentsPayload = await Promise.all(
        adminClaimAttachDocumentFiles.map(async (file) => ({
          fileName: file.name,
          mimeType: file.type || "application/pdf",
          docType: "other" as const,
          base64: await fileToBase64(file),
        })),
      );
      const videoLinksPayload = video ? [{ url: video, title: adminClaimAttachRole === "leader" ? "Видео от руководителя" : "Видео от менеджера" }] : [];
      await postAdminClaimUpdate(adminToken, {
        action: "upload_documents",
        claimId: Number(claim.id),
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
    adminClaimDetail?.claim,
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
          setAdminClaimDetail((prev) => ({ ...prev, claim: { ...(prev?.claim as object), status: "in_progress" } }));
          void updateAdminClaimStatus(
            Number(claim.id),
            "in_progress",
            Number(claim?.approvedAmount || 0),
            { expertLogin: String(claim?.expertLogin || "").trim(), managerNote: String(claim?.managerNote || "").trim() },
          );
        }
      })
      .catch(() => {
        if (!cancelled) setAdminClaimDetail(null);
      })
      .finally(() => {
        if (!cancelled) setAdminClaimDetailLoading(false);
      });
    return () => { cancelled = true; };
  }, [adminClaimDetailId, adminToken, updateAdminClaimStatus, adminClaimDetailReloadTick]);

  useEffect(() => {
    const claim = adminClaimDetail?.claim as { cargoNumber?: string } | undefined;
    const customerPayload = adminClaimDetail?.customerPayload as { selectedPlaces?: unknown[] } | undefined;
    const cargoNumber = String(claim?.cargoNumber || "").trim();
    const selectedPlacesRaw = Array.isArray(customerPayload?.selectedPlaces) ? customerPayload.selectedPlaces : [];
    if (!cargoNumber || selectedPlacesRaw.length === 0) {
      setAdminClaimMaxDamageAmount(0);
      setAdminClaimMaxDamageLoading(false);
      return;
    }
    let cancelled = false;
    setAdminClaimMaxDamageLoading(true);
    fetchAdminClaimMaxDamageAmount(cargoNumber, selectedPlacesRaw)
      .then((total) => {
        if (!cancelled) setAdminClaimMaxDamageAmount(total);
      })
      .catch(() => {
        if (!cancelled) setAdminClaimMaxDamageAmount(null);
      })
      .finally(() => {
        if (!cancelled) setAdminClaimMaxDamageLoading(false);
      });
    return () => { cancelled = true; };
  }, [adminClaimDetail?.claim, adminClaimDetail?.customerPayload]);

  return {
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
    updateAdminClaimStatus,
    deleteAdminClaim,
    downloadClaimCargoDoc,
    uploadAdminClaimDocuments,
  };
}

export type AdminClaimDetailState = ReturnType<typeof useAdminClaimDetail>;
