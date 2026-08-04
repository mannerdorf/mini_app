import React from "react";
import { Button, Flex, Typography } from "@maxhub/max-ui";
import { Loader2, Download } from "lucide-react";
import { claimSectionStyle } from "../lib/adminClaimStatusStyles";
import type { AdminClaimsState } from "../hooks/useAdminClaims";

type Detail = NonNullable<AdminClaimsState["adminClaimDetail"]>;

export function AdminClaimDetailResponseSection({ detail, claims }: { detail: Detail; claims: AdminClaimsState }) {
  const {
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
    adminClaimNoteDraft,
    setAdminClaimNoteDraft,
    adminLeaderCommentDraft,
    setAdminLeaderCommentDraft,
    adminClaimDocDownloading,
    adminClaimDocError,
    uploadAdminClaimDocuments,
    downloadClaimCargoDoc,
  } = claims;

  return (
    <div style={claimSectionStyle}>
      <Typography.Body style={{ fontWeight: 600, marginBottom: "0.45rem" }}>Ответ заказчику</Typography.Body>
      <Typography.Body style={{ fontSize: "0.82rem" }}>
        Фото: {Array.isArray(detail.photos) ? detail.photos.length : 0} |
        PDF: {Array.isArray(detail.documents) ? detail.documents.length : 0} |
        Видео-ссылки: {Array.isArray(detail.videoLinks) ? detail.videoLinks.length : 0}
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
          <Button type="button" className="filter-button" onClick={uploadAdminClaimDocuments} disabled={adminClaimAttachSubmitting}>
            {adminClaimAttachSubmitting ? "Отправка..." : "Ответить"}
          </Button>
        </Flex>
      </div>
      {Array.isArray(detail.photos) && detail.photos.length > 0 && (
        <div style={{ marginTop: "0.45rem" }}>
          <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)", marginBottom: "0.25rem" }}>Фото</Typography.Body>
          <Flex gap="0.45rem" wrap="wrap">
            {detail.photos.slice(0, 12).map((p: { id?: number; mimeType?: string; base64?: string; fileName?: string; caption?: string }) => {
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
      {Array.isArray(detail.documents) && detail.documents.length > 0 && (
        <div style={{ marginTop: "0.55rem" }}>
          <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)", marginBottom: "0.25rem" }}>PDF</Typography.Body>
          <Flex gap="0.35rem" wrap="wrap">
            {detail.documents.map((d: { id?: number; mimeType?: string; base64?: string; fileName?: string }) => {
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
      {Array.isArray(detail.videoLinks) && detail.videoLinks.length > 0 && (
        <div style={{ marginTop: "0.55rem" }}>
          <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)", marginBottom: "0.25rem" }}>Видео-ссылки</Typography.Body>
          <div style={{ display: "grid", gap: "0.2rem" }}>
            {detail.videoLinks.map((v: { id?: number; title?: string; url?: string }) => (
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
  );
}
