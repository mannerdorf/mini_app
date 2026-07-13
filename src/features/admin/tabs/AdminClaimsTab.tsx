import React, { useState, useEffect, useCallback } from "react";
import { Button, Flex, Panel, Typography, Input } from "@maxhub/max-ui";
import { Loader2, Download } from "lucide-react";
import { fetchAdminClaims, fetchAdminClaimDetail, postAdminClaimUpdate } from "../../../api/client/admin/claims";
import { downloadBase64File } from "../../../utils";
import { fileToBase64 } from "../../../features/documents/claims/claimFormUtils";
import {
  CLAIMS_FILTER_CONTROL_HEIGHT,
  CLAIM_STATUS_LABELS_RU,
  CLAIM_EVENT_TYPE_LABELS_RU,
  CLAIM_MANIPULATION_SIGN_LABELS_RU,
  CLAIM_PACKAGING_TYPE_LABELS_RU,
  mapClaimEnumValuesToRu,
} from "../lib/claimConstants";
import {
  normalizePlaceKey,
  extractPlaceNumberFromLabel,
  extractPerevozkaNomenclatureRows,
  pickFirstNumericField,
} from "../lib/claimDamageCalc";
import type { useAdminEmployeeDirectory } from "../hooks/useAdminEmployeeDirectory";

type EmployeeDir = ReturnType<typeof useAdminEmployeeDirectory>;

export type AdminClaimsTabProps = {
  adminToken: string;
  isSuperAdmin: boolean;
  onError: (msg: string | null) => void;
  employeeDir: EmployeeDir;
  variant?: "accounting" | "standalone";
};

export function AdminClaimsTab({
  adminToken,
  isSuperAdmin,
  onError,
  employeeDir,
  variant = "accounting",
}: AdminClaimsTabProps) {
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

  return (
    <>
      <Panel className="cargo-card" style={{ padding: "var(--pad-card, 1rem)", marginTop: variant === "accounting" ? "1rem" : undefined }}>
          <Typography.Body style={{ fontWeight: 600, marginBottom: "0.5rem" }}>
            {variant === "accounting" ? "Претензии (финансовый контур)" : "Претензии (менеджер / руководитель)"}
          </Typography.Body>
          <Flex gap="0.5rem" wrap="wrap" style={{ marginBottom: "0.75rem" }}>
            <Button
              type="button"
              className="filter-button"
              style={{
                background: adminClaimsView === "new" ? "var(--color-primary-blue)" : undefined,
                color: adminClaimsView === "new" ? "white" : undefined,
                height: CLAIMS_FILTER_CONTROL_HEIGHT,
                minWidth: 68,
                padding: "0 0.7rem",
              }}
              onClick={() => { setAdminClaimsView("new"); setAdminClaimsStatusFilter(""); }}
            >
              Новые
            </Button>
            <Button
              type="button"
              className="filter-button"
              style={{
                background: adminClaimsView === "in_progress" ? "var(--color-primary-blue)" : undefined,
                color: adminClaimsView === "in_progress" ? "white" : undefined,
                height: CLAIMS_FILTER_CONTROL_HEIGHT,
                minWidth: 82,
                padding: "0 0.7rem",
              }}
              onClick={() => { setAdminClaimsView("in_progress"); setAdminClaimsStatusFilter(""); }}
            >
              В работе
            </Button>
            <Button
              type="button"
              className="filter-button"
              style={{
                background: adminClaimsView === "all" ? "var(--color-primary-blue)" : undefined,
                color: adminClaimsView === "all" ? "white" : undefined,
                height: CLAIMS_FILTER_CONTROL_HEIGHT,
                minWidth: 56,
                padding: "0 0.7rem",
              }}
              onClick={() => setAdminClaimsView("all")}
            >
              Все
            </Button>
          </Flex>
          {adminClaimsKpi && (
            <Flex gap="0.5rem" wrap="wrap" style={{ marginBottom: "0.75rem" }}>
              <div className="cargo-card" style={{ padding: "0 0.65rem", minWidth: 130, minHeight: CLAIMS_FILTER_CONTROL_HEIGHT, display: "flex", alignItems: "center" }}>
                <Typography.Body style={{ fontSize: "0.76rem", color: "var(--color-text-secondary)" }}>
                  Активные: <strong style={{ color: "var(--color-text-primary)" }}>{Number(adminClaimsKpi.activeCount || 0)}</strong>
                </Typography.Body>
              </div>
              <div className="cargo-card" style={{ padding: "0 0.65rem", minWidth: 130, minHeight: CLAIMS_FILTER_CONTROL_HEIGHT, display: "flex", alignItems: "center" }}>
                <Typography.Body style={{ fontSize: "0.76rem", color: "var(--color-text-secondary)" }}>
                  Просроченные: <strong style={{ color: Number(adminClaimsKpi.overdueCount || 0) > 0 ? "#ef4444" : "var(--color-text-primary)" }}>{Number(adminClaimsKpi.overdueCount || 0)}</strong>
                </Typography.Body>
              </div>
              <div className="cargo-card" style={{ padding: "0 0.65rem", minWidth: 170, minHeight: CLAIMS_FILTER_CONTROL_HEIGHT, display: "flex", alignItems: "center" }}>
                <Typography.Body style={{ fontSize: "0.76rem", color: "var(--color-text-secondary)" }}>
                  Сумма требований: <strong style={{ color: "var(--color-text-primary)" }}>{Number(adminClaimsKpi.requestedSum || 0).toLocaleString("ru-RU")} ₽</strong>
                </Typography.Body>
              </div>
              <div className="cargo-card" style={{ padding: "0 0.65rem", minWidth: 190, minHeight: CLAIMS_FILTER_CONTROL_HEIGHT, display: "flex", alignItems: "center" }}>
                <Typography.Body style={{ fontSize: "0.76rem", color: "var(--color-text-secondary)" }}>
                  Сумма одобренных: <strong style={{ color: "var(--color-text-primary)" }}>{Number(adminClaimsKpi.approvedSum || 0).toLocaleString("ru-RU")} ₽</strong>
                </Typography.Body>
              </div>
            </Flex>
          )}
          {adminClaimsChart.length > 0 && (
            <div style={{ marginBottom: "0.75rem", border: "1px solid var(--color-border)", borderRadius: 10, padding: "0.6rem 0.7rem" }}>
              <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)", marginBottom: "0.3rem" }}>
                Динамика за 30 дней
              </Typography.Body>
              <Flex gap="0.4rem" wrap="wrap">
                {adminClaimsChart.slice(-14).map((p) => (
                  <span key={p.day} style={{ fontSize: "0.72rem", padding: "0.12rem 0.42rem", borderRadius: 999, background: "var(--color-bg-hover)", border: "1px solid var(--color-border)" }}>
                    {String(p.day).slice(5)}: {Number(p.count || 0)}
                  </span>
                ))}
              </Flex>
            </div>
          )}
          <Flex gap="0.5rem" wrap="wrap" align="center" style={{ marginBottom: "0.75rem" }}>
            <Input
              type="text"
              className="admin-form-input"
              placeholder="Поиск: номер претензии / перевозка / заказчик"
              value={adminClaimsSearch}
              onChange={(e) => setAdminClaimsSearch(e.target.value)}
              style={{ minWidth: 280, maxWidth: 420, height: CLAIMS_FILTER_CONTROL_HEIGHT, padding: "0 0.55rem", boxSizing: "border-box" }}
            />
            <select
              className="admin-form-input"
              value={adminClaimsStatusFilter}
              onChange={(e) => { setAdminClaimsView("all"); setAdminClaimsStatusFilter(e.target.value); }}
              style={{ padding: "0 0.5rem", height: CLAIMS_FILTER_CONTROL_HEIGHT, minWidth: 210, boxSizing: "border-box" }}
            >
              <option value="">Все статусы</option>
              <option value="new">Новая</option>
              <option value="under_review">На рассмотрении</option>
              <option value="waiting_docs">Ожидает документы</option>
              <option value="in_progress">В работе</option>
              <option value="awaiting_leader">Ожидает решения руководителя</option>
              <option value="sent_to_accounting">Передана в бухгалтерию</option>
              <option value="approved">Удовлетворена</option>
              <option value="paid">Выплачено</option>
              <option value="offset">Зачтено</option>
              <option value="rejected">Отказ</option>
            </select>
            <Button
              type="button"
              className="filter-button"
              style={{ height: CLAIMS_FILTER_CONTROL_HEIGHT, minWidth: 92, padding: "0 0.65rem" }}
              onClick={() => reloadAdminClaims()}
              disabled={adminClaimsLoading}
            >
              {adminClaimsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Обновить"}
            </Button>
          </Flex>
          {adminClaimsLoading ? (
            <Flex align="center" gap="0.5rem">
              <Loader2 className="w-4 h-4 animate-spin" />
              <Typography.Body>Загрузка претензий...</Typography.Body>
            </Flex>
          ) : adminClaims.length === 0 ? (
            <Typography.Body style={{ fontSize: "0.82rem", color: "var(--color-text-secondary)" }}>
              Претензий не найдено
            </Typography.Body>
          ) : (
            <div style={{ maxHeight: 360, overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                <thead>
                  <tr style={{ background: "var(--color-bg-hover)", borderBottom: "1px solid var(--color-border)" }}>
                    <th style={{ textAlign: "left", padding: "6px 8px" }}>Претензия</th>
                    <th style={{ textAlign: "left", padding: "6px 8px" }}>Заказчик</th>
                    <th style={{ textAlign: "left", padding: "6px 8px" }}>Перевозка</th>
                    <th style={{ textAlign: "left", padding: "6px 8px" }}>Сумма</th>
                    <th style={{ textAlign: "left", padding: "6px 8px" }}>Статус</th>
                    <th style={{ textAlign: "left", padding: "6px 8px" }}>Дней</th>
                    <th style={{ textAlign: "left", padding: "6px 8px" }}>Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {adminClaims.map((c) => (
                    <tr key={c.id} style={{ borderBottom: "1px solid var(--color-border)", cursor: "pointer" }} onClick={() => setAdminClaimDetailId(c.id)}>
                      <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{c.claimNumber || `#${c.id}`}</td>
                      <td style={{ padding: "6px 8px" }}>{c.customerCompanyName || c.customerInn || "—"}</td>
                      <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{c.cargoNumber || "—"}</td>
                      <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>
                        {c.approvedAmount != null ? `${Number(c.approvedAmount).toLocaleString("ru-RU")} ₽` : c.requestedAmount != null ? `${Number(c.requestedAmount).toLocaleString("ru-RU")} ₽` : "—"}
                      </td>
                      <td style={{ padding: "6px 8px" }}>
                        <span
                          className="role-badge"
                          style={{
                            fontSize: "0.7rem",
                            fontWeight: 600,
                            padding: "0.15rem 0.35rem",
                            borderRadius: "999px",
                            background: c.status === "rejected"
                              ? "rgba(239, 68, 68, 0.2)"
                              : c.status === "approved" || c.status === "paid" || c.status === "offset"
                                ? "rgba(34, 197, 94, 0.2)"
                                : "rgba(59, 130, 246, 0.15)",
                            color: c.status === "rejected"
                              ? "#ef4444"
                              : c.status === "approved" || c.status === "paid" || c.status === "offset"
                                ? "#22c55e"
                                : "var(--color-primary-blue)",
                            border: "1px solid var(--color-border)",
                            whiteSpace: "nowrap",
                            display: "inline-block",
                          }}
                        >
                          {CLAIM_STATUS_LABELS_RU[String(c.status || "")] || c.status || "—"}
                        </span>
                      </td>
                      <td style={{ padding: "6px 8px", whiteSpace: "nowrap", color: c.daysInWork > 10 ? "#ef4444" : undefined }}>{c.daysInWork}</td>
                      <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>
                        <Flex gap="0.25rem" wrap="wrap">
                          {(c.status === "approved" || c.status === "sent_to_accounting") && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); updateAdminClaimStatus(c.id, "paid", c.approvedAmount); }}
                              disabled={adminClaimsUpdatingId === c.id}
                              style={{ fontSize: "0.68rem", padding: "0.2rem 0.45rem", borderRadius: 6, border: "1px solid #8b5cf6", background: "transparent", color: "#8b5cf6", cursor: "pointer" }}
                            >
                              Оплачено
                            </button>
                          )}
                          {(c.status === "approved" || c.status === "sent_to_accounting") && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); updateAdminClaimStatus(c.id, "offset", c.approvedAmount); }}
                              disabled={adminClaimsUpdatingId === c.id}
                              style={{ fontSize: "0.68rem", padding: "0.2rem 0.45rem", borderRadius: 6, border: "1px solid #10b981", background: "transparent", color: "#10b981", cursor: "pointer" }}
                            >
                              Зачтено
                            </button>
                          )}
                          {c.status !== "rejected" && c.status !== "paid" && c.status !== "offset" && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); updateAdminClaimStatus(c.id, "rejected"); }}
                              disabled={adminClaimsUpdatingId === c.id}
                              style={{ fontSize: "0.68rem", padding: "0.2rem 0.45rem", borderRadius: 6, border: "1px solid #ef4444", background: "transparent", color: "#ef4444", cursor: "pointer" }}
                            >
                              Отказ
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); deleteAdminClaim(c.id); }}
                            disabled={adminClaimsUpdatingId === c.id}
                            style={{ fontSize: "0.68rem", padding: "0.2rem 0.45rem", borderRadius: 6, border: "1px solid #b91c1c", background: "transparent", color: "#b91c1c", cursor: "pointer" }}
                          >
                            Удалить
                          </button>
                        </Flex>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

      {adminClaimDetailId && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setAdminClaimDetailId(null)}
        >
          <div
            style={{ width: "94%", maxWidth: 820, maxHeight: "90vh", overflowY: "auto", borderRadius: 12, background: "var(--color-bg-card, #fff)", padding: "1rem" }}
            onClick={(e) => e.stopPropagation()}
          >
            <Flex align="center" justify="space-between" style={{ marginBottom: "0.65rem" }}>
              <Typography.Body style={{ fontWeight: 700 }}>
                Претензия {adminClaimDetail?.claim?.claimNumber || `#${adminClaimDetailId}`}
              </Typography.Body>
              <Flex gap="0.45rem" align="center">
                {isSuperAdmin && adminClaimDetail?.claim?.id && (
                  <Button
                    type="button"
                    className="filter-button"
                    style={{ borderColor: "#b91c1c", color: "#b91c1c" }}
                    onClick={() => deleteAdminClaim(Number(adminClaimDetail.claim.id))}
                    disabled={adminClaimsUpdatingId === Number(adminClaimDetail.claim.id)}
                  >
                    Удалить
                  </Button>
                )}
                <Button type="button" className="filter-button" onClick={() => setAdminClaimDetailId(null)}>Закрыть</Button>
              </Flex>
            </Flex>
            {adminClaimDetailLoading ? (
              <Flex align="center" gap="0.5rem">
                <Loader2 className="w-4 h-4 animate-spin" />
                <Typography.Body>Загрузка карточки...</Typography.Body>
              </Flex>
            ) : !adminClaimDetail?.claim ? (
              <Typography.Body style={{ color: "var(--color-text-secondary)" }}>Данные не загружены</Typography.Body>
            ) : (
              <>
                <div style={{ marginBottom: "0.75rem", border: "1px solid var(--color-border)", borderRadius: 10, padding: "0.65rem" }}>
                  <Typography.Body style={{ fontWeight: 600, marginBottom: "0.35rem" }}>Данные клиента и претензии</Typography.Body>
                  <div style={{ display: "grid", gap: "0.28rem" }}>
                    <Typography.Body style={{ fontSize: "0.85rem", display: "block" }}>
                      <strong>Заказчик:</strong> {adminClaimDetail.claim.customerCompanyName || "—"} ({adminClaimDetail.claim.customerInn || "—"})
                    </Typography.Body>
                    <Typography.Body style={{ fontSize: "0.85rem", display: "block" }}>
                      <strong>Контакты:</strong> {adminClaimDetail.claim.customerPhone || "—"} | {adminClaimDetail.claim.customerEmail || "—"}
                    </Typography.Body>
                    <Typography.Body style={{ fontSize: "0.85rem", display: "block" }}>
                      <strong>Перевозка:</strong>{" "}
                      {adminClaimDetail.claim.cargoNumber ? (
                        <a
                          href={`/?tab=docs&section=${encodeURIComponent("Заявки")}&search=${encodeURIComponent(String(adminClaimDetail.claim.cargoNumber || ""))}`}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: "var(--color-primary-blue)", textDecoration: "underline", fontWeight: 600 }}
                        >
                          {adminClaimDetail.claim.cargoNumber}
                        </a>
                      ) : "—"}
                    </Typography.Body>
                    <Typography.Body style={{ fontSize: "0.85rem", display: "block" }}>
                      <strong>Тип претензии:</strong> {String(adminClaimDetail?.claimTypeLabel || "—")}
                    </Typography.Body>
                    <Typography.Body style={{ fontSize: "0.85rem", display: "block" }}>
                      <strong>Статус:</strong>{" "}
                      <span
                        style={{
                          display: "inline-block",
                          fontSize: "0.75rem",
                          padding: "0.2rem 0.5rem",
                          borderRadius: 999,
                          fontWeight: 600,
                          ...((): { background: string; color: string } => {
                            const s = String(adminClaimDetail.claim.status || "");
                            const map: Record<string, { bg: string; color: string }> = {
                              draft: { bg: "rgba(148,163,184,0.2)", color: "#64748b" },
                              new: { bg: "rgba(59,130,246,0.15)", color: "#2563eb" },
                              under_review: { bg: "rgba(59,130,246,0.15)", color: "#2563eb" },
                              waiting_docs: { bg: "rgba(245,158,11,0.2)", color: "#d97706" },
                              in_progress: { bg: "rgba(59,130,246,0.2)", color: "#1d4ed8" },
                              awaiting_leader: { bg: "rgba(139,92,246,0.2)", color: "#7c3aed" },
                              sent_to_accounting: { bg: "rgba(6,182,212,0.2)", color: "#0891b2" },
                              approved: { bg: "rgba(34,197,94,0.2)", color: "#16a34a" },
                              rejected: { bg: "rgba(239,68,68,0.2)", color: "#dc2626" },
                              paid: { bg: "rgba(34,197,94,0.2)", color: "#16a34a" },
                              offset: { bg: "rgba(34,197,94,0.15)", color: "#15803d" },
                              closed: { bg: "rgba(148,163,184,0.2)", color: "#64748b" },
                            };
                            const v = map[s] ?? map.draft;
                            return { background: v.bg, color: v.color };
                          })(),
                          whiteSpace: "nowrap",
                        }}
                      >
                        {CLAIM_STATUS_LABELS_RU[String(adminClaimDetail.claim.status || "")] || adminClaimDetail.claim.status || "—"}
                      </span>
                    </Typography.Body>
                    <Typography.Body style={{ fontSize: "0.85rem", display: "block" }}>
                      <strong>Описание:</strong> {adminClaimDetail.claim.description || "—"}
                    </Typography.Body>
                  </div>
                  {!!adminClaimDetail?.customerPayload && (
                    <div style={{ marginTop: "0.45rem", borderTop: "1px dashed var(--color-border)", paddingTop: "0.45rem" }}>
                      <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)", marginBottom: "0.2rem" }}>
                        Данные от заказчика
                      </Typography.Body>
                      <div style={{ display: "grid", gap: "0.2rem" }}>
                        <Typography.Body style={{ fontSize: "0.82rem", display: "block" }}>
                          <strong>Контактное лицо:</strong> {String(adminClaimDetail.customerPayload?.contactName || "—")}
                        </Typography.Body>
                        <Typography.Body style={{ fontSize: "0.82rem", display: "block" }}>
                          <strong>Номера мест:</strong> {Array.isArray(adminClaimDetail.customerPayload?.selectedPlaces) && adminClaimDetail.customerPayload.selectedPlaces.length > 0
                            ? adminClaimDetail.customerPayload.selectedPlaces.join(", ")
                            : "—"}
                        </Typography.Body>
                        <Typography.Body style={{ fontSize: "0.82rem", display: "block" }}>
                          <strong>Манипуляционные знаки:</strong> {Array.isArray(adminClaimDetail.customerPayload?.manipulationSigns) && adminClaimDetail.customerPayload.manipulationSigns.length > 0
                            ? mapClaimEnumValuesToRu(adminClaimDetail.customerPayload.manipulationSigns, CLAIM_MANIPULATION_SIGN_LABELS_RU).join(", ")
                            : "—"}
                        </Typography.Body>
                        <Typography.Body style={{ fontSize: "0.82rem", display: "block" }}>
                          <strong>Упаковка:</strong> {Array.isArray(adminClaimDetail.customerPayload?.packagingTypes) && adminClaimDetail.customerPayload.packagingTypes.length > 0
                            ? mapClaimEnumValuesToRu(adminClaimDetail.customerPayload.packagingTypes, CLAIM_PACKAGING_TYPE_LABELS_RU).join(", ")
                            : "—"}
                        </Typography.Body>
                      </div>
                    </div>
                  )}
                </div>

                <div style={{ marginBottom: "0.75rem", border: "1px solid var(--color-border)", borderRadius: 10, padding: "0.65rem" }}>
                  <Typography.Body style={{ fontWeight: 600, marginBottom: "0.45rem" }}>Ответ заказчику</Typography.Body>
                  <Typography.Body style={{ fontSize: "0.82rem" }}>
                    Фото: {Array.isArray(adminClaimDetail.photos) ? adminClaimDetail.photos.length : 0} |
                    PDF: {Array.isArray(adminClaimDetail.documents) ? adminClaimDetail.documents.length : 0} |
                    Видео-ссылки: {Array.isArray(adminClaimDetail.videoLinks) ? adminClaimDetail.videoLinks.length : 0}
                  </Typography.Body>
                  <div style={{ marginTop: "0.55rem", border: "1px dashed var(--color-border)", borderRadius: 8, padding: "0.55rem" }}>
                    <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)", marginBottom: "0.35rem" }}>
                      Комментарий и вложения от лица менеджера/руководителя
                    </Typography.Body>
                    <Flex gap="0.45rem" wrap="wrap" align="center" style={{ marginBottom: "0.4rem" }}>
                      <select
                        className="admin-form-input"
                        value={adminClaimAttachRole}
                        onChange={(e) => setAdminClaimAttachRole(e.target.value === "leader" ? "leader" : "manager")}
                        style={{ minWidth: 190, padding: "0.35rem 0.45rem" }}
                      >
                        <option value="manager">От имени менеджера</option>
                        <option value="leader">От имени руководителя</option>
                      </select>
                    </Flex>
                    <textarea
                      className="admin-form-input"
                      rows={3}
                      placeholder={adminClaimAttachRole === "leader" ? "Комментарий руководителя для заказчика" : "Комментарий менеджера для заказчика"}
                      value={adminClaimAttachRole === "leader" ? adminLeaderCommentDraft : adminClaimNoteDraft}
                      onChange={(e) => {
                        if (adminClaimAttachRole === "leader") setAdminLeaderCommentDraft(e.target.value);
                        else setAdminClaimNoteDraft(e.target.value);
                      }}
                      style={{ width: "100%", marginBottom: "0.45rem" }}
                    />
                    <Flex gap="0.45rem" wrap="wrap" align="center" style={{ marginBottom: "0.4rem" }}>
                      <label
                        className="filter-button"
                        style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", fontSize: "0.78rem", cursor: "pointer", padding: "0.35rem 0.6rem", margin: 0 }}
                      >
                        <input
                          type="file"
                          accept="image/*,.pdf,application/pdf"
                          multiple
                          style={{ width: 0, height: 0, opacity: 0, position: "absolute" }}
                          onChange={(e) => {
                            const files = Array.from(e.target.files || []);
                            const photos = files.filter((f) => f.type.startsWith("image/"));
                            const pdfs = files.filter((f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name));
                            setAdminClaimAttachPhotoFiles(photos);
                            setAdminClaimAttachDocumentFiles(pdfs);
                            e.target.value = "";
                          }}
                        />
                        Выбрать файлы
                      </label>
                      <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)" }}>
                        {adminClaimAttachPhotoFiles.length === 0 && adminClaimAttachDocumentFiles.length === 0
                          ? "Файл не выбран"
                          : `Фото: ${adminClaimAttachPhotoFiles.length} · PDF: ${adminClaimAttachDocumentFiles.length}`}
                      </Typography.Body>
                    </Flex>
                    <input
                      className="admin-form-input"
                      type="url"
                      placeholder="Ссылка на видео (опционально)"
                      value={adminClaimAttachVideoLink}
                      onChange={(e) => setAdminClaimAttachVideoLink(e.target.value)}
                      style={{ width: "100%", marginBottom: "0.4rem" }}
                    />
                    {adminClaimAttachError && (
                      <Typography.Body style={{ fontSize: "0.76rem", color: "#b91c1c", marginBottom: "0.35rem" }}>
                        {adminClaimAttachError}
                      </Typography.Body>
                    )}
                    <Flex justify="flex-end">
                      <Button
                        type="button"
                        className="filter-button"
                        onClick={uploadAdminClaimDocuments}
                        disabled={adminClaimAttachSubmitting}
                      >
                        {adminClaimAttachSubmitting ? "Отправка..." : "Ответить"}
                      </Button>
                    </Flex>
                  </div>
                  {Array.isArray(adminClaimDetail.photos) && adminClaimDetail.photos.length > 0 && (
                    <div style={{ marginTop: "0.45rem" }}>
                      <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)", marginBottom: "0.25rem" }}>Фото</Typography.Body>
                      <Flex gap="0.45rem" wrap="wrap">
                        {adminClaimDetail.photos.slice(0, 12).map((p: any) => {
                          const mime = String(p?.mimeType || "image/jpeg");
                          const src = p?.base64 ? `data:${mime};base64,${p.base64}` : "";
                          const fileName = String(p?.fileName || p?.caption || `photo-${p?.id || "file"}.jpg`);
                          return (
                            <div key={p.id} style={{ display: "grid", gap: "0.25rem", width: 96 }}>
                              <a href={src || "#"} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
                                <img
                                  src={src}
                                  alt={String(p?.caption || p?.fileName || "Фото")}
                                  style={{ width: 88, height: 88, objectFit: "cover", borderRadius: 8, border: "1px solid var(--color-border)", background: "var(--color-bg-hover)" }}
                                />
                              </a>
                              <Flex gap="0.2rem" wrap="wrap">
                                <a href={src || "#"} target="_blank" rel="noreferrer" style={{ fontSize: "0.68rem", color: "var(--color-primary-blue)", textDecoration: "none" }}>Открыть</a>
                                <a href={src || "#"} download={fileName} style={{ fontSize: "0.68rem", color: "var(--color-primary-blue)", textDecoration: "none" }}>Скачать</a>
                              </Flex>
                            </div>
                          );
                        })}
                      </Flex>
                    </div>
                  )}
                  {Array.isArray(adminClaimDetail.documents) && adminClaimDetail.documents.length > 0 && (
                    <div style={{ marginTop: "0.55rem" }}>
                      <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)", marginBottom: "0.25rem" }}>PDF</Typography.Body>
                      <Flex gap="0.35rem" wrap="wrap">
                        {adminClaimDetail.documents.map((d: any) => {
                          const mime = String(d?.mimeType || "application/pdf");
                          const href = d?.base64 ? `data:${mime};base64,${d.base64}` : "#";
                          return (
                            <Flex key={d.id} gap="0.3rem" align="center" wrap="wrap" style={{ border: "1px solid var(--color-border)", borderRadius: 999, padding: "0.14rem 0.45rem", background: "var(--color-bg-hover)" }}>
                              <Typography.Body style={{ fontSize: "0.74rem" }}>{String(d?.fileName || "Документ")}</Typography.Body>
                              <a href={href} target="_blank" rel="noreferrer" style={{ fontSize: "0.7rem", color: "var(--color-primary-blue)", textDecoration: "none" }}>Открыть</a>
                              <a href={href} download={String(d?.fileName || "document.pdf")} style={{ fontSize: "0.7rem", color: "var(--color-primary-blue)", textDecoration: "none" }}>Скачать</a>
                            </Flex>
                          );
                        })}
                      </Flex>
                    </div>
                  )}
                  {Array.isArray(adminClaimDetail.videoLinks) && adminClaimDetail.videoLinks.length > 0 && (
                    <div style={{ marginTop: "0.55rem" }}>
                      <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)", marginBottom: "0.25rem" }}>Видео-ссылки</Typography.Body>
                      <div style={{ display: "grid", gap: "0.2rem" }}>
                        {adminClaimDetail.videoLinks.map((v: any) => (
                          <Flex key={v.id} gap="0.35rem" align="center" wrap="wrap">
                            <Typography.Body style={{ fontSize: "0.78rem" }}>{String(v?.title || "Видео")}</Typography.Body>
                            <a href={String(v?.url || "#")} target="_blank" rel="noreferrer" style={{ fontSize: "0.78rem", color: "var(--color-primary-blue)" }}>
                              Открыть
                            </a>
                          </Flex>
                        ))}
                      </div>
                    </div>
                  )}
                  <div style={{ marginTop: "0.6rem", borderTop: "1px dashed var(--color-border)", paddingTop: "0.5rem" }}>
                    <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)", marginBottom: "0.3rem" }}>
                      Документы по перевозке
                    </Typography.Body>
                    <Flex gap="0.4rem" wrap="wrap">
                      <Button
                        type="button"
                        className="filter-button"
                        disabled={adminClaimDocDownloading !== ""}
                        onClick={() => downloadClaimCargoDoc("АПП")}
                        style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}
                      >
                        {adminClaimDocDownloading === "АПП" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                        Скачать АПП
                      </Button>
                      <Button
                        type="button"
                        className="filter-button"
                        disabled={adminClaimDocDownloading !== ""}
                        onClick={() => downloadClaimCargoDoc("ЭР")}
                        style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}
                      >
                        {adminClaimDocDownloading === "ЭР" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                        Скачать ЭР
                      </Button>
                    </Flex>
                    {adminClaimDocError ? (
                      <Typography.Body style={{ fontSize: "0.74rem", color: "#ef4444", marginTop: "0.3rem" }}>
                        {adminClaimDocError}
                      </Typography.Body>
                    ) : null}
                  </div>
                </div>

                {!isSuperAdmin && (
                <div style={{ marginBottom: "0.75rem", border: "1px solid var(--color-border)", borderRadius: 10, padding: "0.65rem" }}>
                  <Typography.Body style={{ fontWeight: 600, marginBottom: "0.45rem" }}>Решение</Typography.Body>
                  <Typography.Body style={{ fontSize: "0.82rem", color: "var(--color-text-secondary)", marginBottom: "0.45rem" }}>
                    Максимальная сумма ущерба: {adminClaimMaxDamageLoading
                      ? "расчет..."
                      : adminClaimMaxDamageAmount == null
                        ? "— рублей"
                        : `${Number(adminClaimMaxDamageAmount).toLocaleString("ru-RU")} рублей`}
                  </Typography.Body>
                  <Flex gap="0.45rem" wrap="wrap" align="center">
                    <Input
                      type="number"
                      className="admin-form-input"
                      placeholder="Одобренная сумма"
                      value={adminClaimApprovedAmountDraft}
                      onChange={(e) => setAdminClaimApprovedAmountDraft(e.target.value)}
                      style={{ maxWidth: 220, height: 44, boxSizing: "border-box" }}
                    />
                    <Button
                      type="button"
                      className="filter-button"
                      style={{ background: "#10b981", color: "white", height: 44, minWidth: 220 }}
                      onClick={() => updateAdminClaimStatus(
                        adminClaimDetail.claim.id,
                        "approved",
                        Number(adminClaimApprovedAmountDraft || 0),
                        { managerNote: adminClaimNoteDraft.trim(), leaderComment: adminLeaderCommentDraft.trim() }
                      )}
                      disabled={adminClaimsUpdatingId === adminClaimDetail.claim.id}
                    >
                      Утвердить решение
                    </Button>
                    <Button
                      type="button"
                      className="filter-button"
                      style={{ background: "#ef4444", color: "white", height: 44, minWidth: 160 }}
                      onClick={() => updateAdminClaimStatus(
                        adminClaimDetail.claim.id,
                        "rejected",
                        Number(adminClaimApprovedAmountDraft || 0),
                        { managerNote: adminClaimNoteDraft.trim(), leaderComment: adminLeaderCommentDraft.trim() }
                      )}
                      disabled={adminClaimsUpdatingId === adminClaimDetail.claim.id}
                    >
                      Отказать
                    </Button>
                  </Flex>
                </div>
                )}

                <div style={{ marginBottom: "0.75rem", border: "1px solid var(--color-border)", borderRadius: 10, padding: "0.65rem" }}>
                  <Typography.Body style={{ fontWeight: 600, marginBottom: "0.45rem" }}>Резолюция руководителя</Typography.Body>
                  <textarea
                    className="admin-form-input"
                    rows={2}
                    placeholder="Комментарий руководителя"
                    value={adminLeaderCommentDraft}
                    onChange={(e) => setAdminLeaderCommentDraft(e.target.value)}
                    style={{ width: "100%", marginBottom: "0.45rem" }}
                  />
                  <div style={{ marginBottom: "0.45rem" }}>
                    <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)", marginBottom: "0.2rem" }}>Удовлетворённая сумма</Typography.Body>
                    <input
                      type="number"
                      className="admin-form-input"
                      placeholder="0"
                      min={0}
                      step={0.01}
                      value={adminClaimApprovedAmountDraft}
                      onChange={(e) => setAdminClaimApprovedAmountDraft(e.target.value)}
                      style={{ width: "100%", maxWidth: 200, padding: "0.35rem 0.45rem" }}
                    />
                  </div>
                  <Flex gap="0.45rem" wrap="wrap" align="center">
                    <Button
                      type="button"
                      className="filter-button"
                      style={{ background: "#10b981", color: "white" }}
                      onClick={() => updateAdminClaimStatus(
                        adminClaimDetail.claim.id,
                        "approved",
                        Number(adminClaimApprovedAmountDraft || 0),
                        { leaderComment: adminLeaderCommentDraft.trim() }
                      )}
                      disabled={adminClaimsUpdatingId === adminClaimDetail.claim.id}
                    >
                      Удовлетворить
                    </Button>
                    <Button
                      type="button"
                      className="filter-button"
                      style={{ background: "#f59e0b", color: "white" }}
                      onClick={() => updateAdminClaimStatus(
                        adminClaimDetail.claim.id,
                        "approved",
                        Number(adminClaimApprovedAmountDraft || 0),
                        { leaderComment: adminLeaderCommentDraft.trim() }
                      )}
                      disabled={adminClaimsUpdatingId === adminClaimDetail.claim.id}
                    >
                      Удовлетворить частично
                    </Button>
                    <Button
                      type="button"
                      className="filter-button"
                      style={{ background: "#ef4444", color: "white" }}
                      onClick={() => updateAdminClaimStatus(
                        adminClaimDetail.claim.id,
                        "rejected",
                        0,
                        { leaderComment: adminLeaderCommentDraft.trim() }
                      )}
                      disabled={adminClaimsUpdatingId === adminClaimDetail.claim.id}
                    >
                      Отказать
                    </Button>
                  </Flex>
                </div>

                <div style={{ border: "1px solid var(--color-border)", borderRadius: 10, padding: "0.65rem" }}>
                  <Typography.Body style={{ fontWeight: 600, marginBottom: "0.45rem" }}>Хронология</Typography.Body>
                  {Array.isArray(adminClaimDetail.events) && adminClaimDetail.events.length > 0 ? (
                    <div style={{ display: "grid", gap: "0.4rem" }}>
                      {adminClaimDetail.events.slice(-20).reverse().map((ev: any) => {
                        const eventKey = String(ev.eventType || "").toLowerCase();
                        const eventLabel = CLAIM_EVENT_TYPE_LABELS_RU[eventKey] || ev.eventType || "—";
                        const statusKey = String(ev.toStatus || "").toLowerCase();
                        const statusLabel = ev.toStatus ? (CLAIM_STATUS_LABELS_RU[statusKey] || ev.toStatus) : null;
                        const statusBadgeBg = statusLabel ? ((): string => {
                          const map: Record<string, string> = {
                            draft: "rgba(148,163,184,0.2)", new: "rgba(59,130,246,0.15)", in_progress: "rgba(59,130,246,0.2)",
                            waiting_docs: "rgba(245,158,11,0.2)", approved: "rgba(34,197,94,0.2)", rejected: "rgba(239,68,68,0.2)",
                            paid: "rgba(34,197,94,0.2)", closed: "rgba(148,163,184,0.2)",
                          };
                          return map[statusKey] ?? "rgba(148,163,184,0.2)";
                        })() : "";
                        const statusBadgeColor = statusLabel ? ((): string => {
                          const map: Record<string, string> = {
                            draft: "#64748b", new: "#2563eb", in_progress: "#1d4ed8", waiting_docs: "#d97706",
                            approved: "#16a34a", rejected: "#dc2626", paid: "#16a34a", closed: "#64748b",
                          };
                          return map[statusKey] ?? "#64748b";
                        })() : "";
                        return (
                          <Typography.Body key={ev.id} style={{ fontSize: "0.8rem", display: "flex", alignItems: "center", gap: "0.35rem", flexWrap: "wrap" }}>
                            <span style={{ color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}>
                              {new Date(ev.createdAt).toLocaleString("ru-RU")}
                            </span>
                            <span
                              style={{
                                display: "inline-block",
                                fontSize: "0.7rem",
                                padding: "0.15rem 0.4rem",
                                borderRadius: 999,
                                fontWeight: 600,
                                background: "rgba(59,130,246,0.12)",
                                color: "#2563eb",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {eventLabel}
                            </span>
                            {statusLabel ? (
                              <span
                                style={{
                                  display: "inline-block",
                                  fontSize: "0.7rem",
                                  padding: "0.15rem 0.4rem",
                                  borderRadius: 999,
                                  fontWeight: 600,
                                  background: statusBadgeBg,
                                  color: statusBadgeColor,
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {statusLabel}
                              </span>
                            ) : null}
                          </Typography.Body>
                        );
                      })}
                    </div>
                  ) : (
                    <Typography.Body style={{ fontSize: "0.82rem", color: "var(--color-text-secondary)" }}>Событий пока нет</Typography.Body>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
