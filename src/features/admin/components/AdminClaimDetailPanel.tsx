import { Button, Flex, Typography, Input } from "@maxhub/max-ui";
import { Loader2, Download } from "lucide-react";
import {
  CLAIM_STATUS_LABELS_RU,
  CLAIM_EVENT_TYPE_LABELS_RU,
  CLAIM_MANIPULATION_SIGN_LABELS_RU,
  CLAIM_PACKAGING_TYPE_LABELS_RU,
  mapClaimEnumValuesToRu,
} from "../lib/claimConstants";
import type { AdminClaimsState } from "../hooks/useAdminClaims";

export type AdminClaimDetailPanelProps = {
  isSuperAdmin: boolean;
  claims: AdminClaimsState;
};

export function AdminClaimDetailPanel({ isSuperAdmin, claims }: AdminClaimDetailPanelProps) {
  const {
    adminClaimDetailId,
    setAdminClaimDetailId,
    adminClaimDetailLoading,
    adminClaimDetail,
    adminClaimsUpdatingId,
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
    updateAdminClaimStatus,
    deleteAdminClaim,
    downloadClaimCargoDoc,
    uploadAdminClaimDocuments,
  } = claims;

  if (!adminClaimDetailId) return null;

  return (
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
  );
}
