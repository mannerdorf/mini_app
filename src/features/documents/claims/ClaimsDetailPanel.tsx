import React from "react";
import { Button, Flex, Typography } from "@maxhub/max-ui";
import { Loader2 } from "lucide-react";
import { DateText } from "../../../components/ui/DateText";
import { formatCurrency } from "../../../lib/formatUtils";
import {
  CLAIM_STATUS_LABELS,
  type ClaimStatusKey,
} from "./claimStatusConstants";
import {
  MANIPULATION_SIGN_LABELS_RU,
  PACKAGING_TYPE_LABELS_RU,
} from "./claimFormConstants";
import { mapClaimEnumToRu } from "./claimFormUtils";

type Props = {
  open: boolean;
  loading: boolean;
  error: string | null;
  data: any | null;
  statusKey: ClaimStatusKey;
  statusStyle: { bg: string; color: string };
  customerPayload: {
    contactName: string;
    selectedPlaces: string[];
    manipulationSigns: string[];
    packagingTypes: string[];
  };
  onClose: () => void;
};

export function ClaimsDetailPanel({
  open,
  loading,
  error,
  data,
  statusKey,
  statusStyle,
  customerPayload,
  onClose,
}: Props) {
  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={() => !loading && onClose()}
    >
      <div
        style={{
          width: "min(94vw, 760px)",
          maxHeight: "90vh",
          overflowY: "auto",
          borderRadius: 12,
          background: "var(--color-bg-card, #fff)",
          padding: "1rem",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <Flex align="center" justify="space-between" style={{ marginBottom: "0.6rem" }}>
          <Typography.Body style={{ fontWeight: 700 }}>
            {data?.claim?.claimNumber ? `Претензия ${data.claim.claimNumber}` : "Карточка претензии"}
          </Typography.Body>
          <Button type="button" className="filter-button" onClick={onClose}>
            Закрыть
          </Button>
        </Flex>
        {loading ? (
          <Flex align="center" gap="0.45rem" style={{ padding: "1rem 0" }}>
            <Loader2 className="w-4 h-4 animate-spin" />
            <Typography.Body>Загрузка карточки...</Typography.Body>
          </Flex>
        ) : error ? (
          <Typography.Body style={{ color: "#ef4444", fontSize: "0.84rem" }}>{error}</Typography.Body>
        ) : !data?.claim ? (
          <Typography.Body style={{ color: "var(--color-text-secondary)", fontSize: "0.84rem" }}>
            Данные претензии не найдены
          </Typography.Body>
        ) : (
          <div style={{ display: "grid", gap: "0.55rem" }}>
            <div style={{ border: "1px solid var(--color-border)", borderRadius: 10, padding: "0.6rem" }}>
              <Typography.Body style={{ fontWeight: 600, marginBottom: "0.35rem" }}>
                Данные заказчика и претензии
              </Typography.Body>
              <div style={{ display: "grid", gap: "0.25rem" }}>
                <Typography.Body style={{ fontSize: "0.82rem" }}>
                  <strong>Перевозка:</strong> {String(data.claim.cargoNumber || "—")}
                </Typography.Body>
                <Typography.Body style={{ fontSize: "0.82rem" }}>
                  <strong>Тип претензии:</strong> {String(data.claim.claimType || "—")}
                </Typography.Body>
                <Typography.Body style={{ fontSize: "0.82rem" }}>
                  <strong>Описание:</strong> {String(data.claim.description || "—")}
                </Typography.Body>
                <Typography.Body style={{ fontSize: "0.82rem" }}>
                  <strong>Сумма требования:</strong>{" "}
                  {data.claim.requestedAmount != null ? formatCurrency(Number(data.claim.requestedAmount)) : "—"}
                </Typography.Body>
                <Typography.Body style={{ fontSize: "0.82rem" }}>
                  <strong>Контактное лицо:</strong> {customerPayload.contactName || "—"}
                </Typography.Body>
                <Typography.Body style={{ fontSize: "0.82rem" }}>
                  <strong>Телефон:</strong> {String(data.claim.customerPhone || "—")}
                </Typography.Body>
                <Typography.Body style={{ fontSize: "0.82rem" }}>
                  <strong>Email:</strong> {String(data.claim.customerEmail || "—")}
                </Typography.Body>
                <Typography.Body style={{ fontSize: "0.82rem" }}>
                  <strong>Номера мест:</strong>{" "}
                  {customerPayload.selectedPlaces.length > 0 ? customerPayload.selectedPlaces.join(", ") : "—"}
                </Typography.Body>
                <Typography.Body style={{ fontSize: "0.82rem" }}>
                  <strong>Манипуляционные знаки:</strong>{" "}
                  {customerPayload.manipulationSigns.length > 0
                    ? mapClaimEnumToRu(customerPayload.manipulationSigns, MANIPULATION_SIGN_LABELS_RU).join(", ")
                    : "—"}
                </Typography.Body>
                <Typography.Body style={{ fontSize: "0.82rem" }}>
                  <strong>Упаковка:</strong>{" "}
                  {customerPayload.packagingTypes.length > 0
                    ? mapClaimEnumToRu(customerPayload.packagingTypes, PACKAGING_TYPE_LABELS_RU).join(", ")
                    : "—"}
                </Typography.Body>
              </div>
            </div>
            <div style={{ border: "1px solid var(--color-border)", borderRadius: 10, padding: "0.6rem" }}>
              <Typography.Body style={{ fontWeight: 600, marginBottom: "0.4rem" }}>Ответ HAULZ</Typography.Body>
              <div style={{ display: "grid", gap: "0.25rem" }}>
                <Typography.Body
                  style={{ fontSize: "0.82rem", display: "flex", alignItems: "center", gap: "0.35rem", flexWrap: "wrap" }}
                >
                  <strong>Статус:</strong>
                  <span
                    style={{
                      fontSize: "0.74rem",
                      padding: "0.16rem 0.45rem",
                      borderRadius: 999,
                      fontWeight: 600,
                      background: statusStyle.bg,
                      color: statusStyle.color,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {CLAIM_STATUS_LABELS[statusKey] || String(data.claim.status || "—")}
                  </span>
                </Typography.Body>
                <Typography.Body style={{ fontSize: "0.82rem" }}>
                  <strong>Ответ менеджера:</strong> {String(data.claim.managerNote || "—")}
                </Typography.Body>
                <Typography.Body style={{ fontSize: "0.82rem" }}>
                  <strong>Ответ руководителя:</strong> {String(data.claim.leaderComment || "—")}
                </Typography.Body>
                <Typography.Body style={{ fontSize: "0.82rem" }}>
                  <strong>Комментарий бухгалтерии:</strong> {String(data.claim.accountingNote || "—")}
                </Typography.Body>
              </div>

              <div style={{ marginTop: "0.55rem" }}>
                <Typography.Body style={{ fontWeight: 600, fontSize: "0.82rem", marginBottom: "0.25rem", display: "block" }}>
                  Прикрепленные файлы
                </Typography.Body>
                <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>
                  Фото: {Array.isArray(data.photos) ? data.photos.length : 0} | PDF:{" "}
                  {Array.isArray(data.documents) ? data.documents.length : 0} | Видео:{" "}
                  {Array.isArray(data.videoLinks) ? data.videoLinks.length : 0}
                </Typography.Body>
                {Array.isArray(data.photos) && data.photos.length > 0 && (
                  <div style={{ marginTop: "0.45rem" }}>
                    <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)", marginBottom: "0.25rem" }}>
                      Фото
                    </Typography.Body>
                    <Flex gap="0.45rem" wrap="wrap">
                      {data.photos.slice(0, 16).map((p: any) => {
                        const mime = String(p?.mimeType || "image/jpeg");
                        const src = p?.base64 ? `data:${mime};base64,${p.base64}` : "";
                        const fileName = String(p?.fileName || p?.caption || `photo-${p?.id || "file"}.jpg`);
                        return (
                          <div key={p.id} style={{ display: "grid", gap: "0.2rem", width: 90 }}>
                            <a href={src || "#"} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
                              <img
                                src={src}
                                alt={String(p?.caption || p?.fileName || "Фото")}
                                style={{
                                  width: 86,
                                  height: 86,
                                  objectFit: "cover",
                                  borderRadius: 8,
                                  border: "1px solid var(--color-border)",
                                }}
                              />
                            </a>
                            <a
                              href={src || "#"}
                              download={fileName}
                              style={{ fontSize: "0.68rem", color: "var(--color-primary-blue)", textDecoration: "none" }}
                            >
                              Скачать
                            </a>
                          </div>
                        );
                      })}
                    </Flex>
                  </div>
                )}
                {Array.isArray(data.documents) && data.documents.length > 0 && (
                  <div style={{ marginTop: "0.45rem" }}>
                    <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)", marginBottom: "0.25rem" }}>
                      PDF
                    </Typography.Body>
                    <Flex gap="0.35rem" wrap="wrap">
                      {data.documents.map((d: any) => {
                        const mime = String(d?.mimeType || "application/pdf");
                        const href = d?.base64 ? `data:${mime};base64,${d.base64}` : "#";
                        return (
                          <a
                            key={d.id}
                            href={href}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              border: "1px solid var(--color-border)",
                              borderRadius: 999,
                              padding: "0.14rem 0.45rem",
                              textDecoration: "none",
                              fontSize: "0.74rem",
                              color: "var(--color-primary-blue)",
                            }}
                          >
                            {String(d?.fileName || `Документ #${d.id}`)}
                          </a>
                        );
                      })}
                    </Flex>
                  </div>
                )}
                {Array.isArray(data.videoLinks) && data.videoLinks.length > 0 && (
                  <div style={{ marginTop: "0.45rem" }}>
                    <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)", marginBottom: "0.25rem" }}>
                      Видео-ссылки
                    </Typography.Body>
                    <div style={{ display: "grid", gap: "0.25rem" }}>
                      {data.videoLinks.map((v: any) => (
                        <a
                          key={v.id}
                          href={String(v?.url || "#")}
                          target="_blank"
                          rel="noreferrer"
                          style={{ fontSize: "0.78rem", color: "var(--color-primary-blue)" }}
                        >
                          {String(v?.title || "Видео")}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div style={{ marginTop: "0.55rem" }}>
                <Typography.Body style={{ fontWeight: 600, fontSize: "0.82rem", marginBottom: "0.25rem", display: "block" }}>
                  Дополнительные ответы менеджера и руководителя
                </Typography.Body>
                {Array.isArray(data.comments) &&
                data.comments.filter((c: any) => ["manager", "leader"].includes(String(c?.authorRole || ""))).length > 0 ? (
                  <div style={{ display: "grid", gap: "0.3rem" }}>
                    {data.comments
                      .filter((c: any) => ["manager", "leader"].includes(String(c?.authorRole || "")))
                      .map((c: any) => (
                        <div key={c.id} style={{ border: "1px solid var(--color-border)", borderRadius: 8, padding: "0.35rem 0.45rem" }}>
                          <Typography.Body style={{ fontSize: "0.74rem", color: "var(--color-text-secondary)" }}>
                            {String(c?.authorRole || "") === "leader" ? "Руководитель" : "Менеджер"} ·{" "}
                            <DateText value={c?.createdAt || undefined} />
                          </Typography.Body>
                          <Typography.Body style={{ fontSize: "0.82rem" }}>{String(c?.commentText || "")}</Typography.Body>
                        </div>
                      ))}
                  </div>
                ) : (
                  <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>
                    Дополнительных комментариев от менеджера/руководителя пока нет.
                  </Typography.Body>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
