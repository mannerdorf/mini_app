import React from "react";
import { Button, Flex, Typography } from "@maxhub/max-ui";
import {
  CLAIM_STATUS_LABELS_RU,
  CLAIM_MANIPULATION_SIGN_LABELS_RU,
  CLAIM_PACKAGING_TYPE_LABELS_RU,
  mapClaimEnumValuesToRu,
} from "../lib/claimConstants";
import { getClaimStatusBadgeStyle, claimSectionStyle } from "../lib/adminClaimStatusStyles";
import type { AdminClaimsState } from "../hooks/useAdminClaims";

type Detail = NonNullable<AdminClaimsState["adminClaimDetail"]>;

export function AdminClaimDetailInfoSection({ detail }: { detail: Detail }) {
  const claim = detail.claim!;
  const statusStyle = getClaimStatusBadgeStyle(String(claim.status || ""));

  return (
    <div style={claimSectionStyle}>
      <Typography.Body style={{ fontWeight: 600, marginBottom: "0.35rem" }}>Данные клиента и претензии</Typography.Body>
      <div style={{ display: "grid", gap: "0.28rem" }}>
        <Typography.Body style={{ fontSize: "0.85rem", display: "block" }}>
          <strong>Заказчик:</strong> {claim.customerCompanyName || "—"} ({claim.customerInn || "—"})
        </Typography.Body>
        <Typography.Body style={{ fontSize: "0.85rem", display: "block" }}>
          <strong>Контакты:</strong> {claim.customerPhone || "—"} | {claim.customerEmail || "—"}
        </Typography.Body>
        <Typography.Body style={{ fontSize: "0.85rem", display: "block" }}>
          <strong>Перевозка:</strong>{" "}
          {claim.cargoNumber ? (
            <a
              href={`/?tab=docs&section=${encodeURIComponent("Заявки")}&search=${encodeURIComponent(String(claim.cargoNumber || ""))}`}
              target="_blank"
              rel="noreferrer"
              style={{ color: "var(--color-primary-blue)", textDecoration: "underline", fontWeight: 600 }}
            >
              {claim.cargoNumber}
            </a>
          ) : "—"}
        </Typography.Body>
        <Typography.Body style={{ fontSize: "0.85rem", display: "block" }}>
          <strong>Тип претензии:</strong> {String(detail.claimTypeLabel || "—")}
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
              background: statusStyle.background,
              color: statusStyle.color,
              whiteSpace: "nowrap",
            }}
          >
            {CLAIM_STATUS_LABELS_RU[String(claim.status || "")] || claim.status || "—"}
          </span>
        </Typography.Body>
        <Typography.Body style={{ fontSize: "0.85rem", display: "block" }}>
          <strong>Описание:</strong> {claim.description || "—"}
        </Typography.Body>
      </div>
      {!!detail.customerPayload && (
        <div style={{ marginTop: "0.45rem", borderTop: "1px dashed var(--color-border)", paddingTop: "0.45rem" }}>
          <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)", marginBottom: "0.2rem" }}>
            Данные от заказчика
          </Typography.Body>
          <div style={{ display: "grid", gap: "0.2rem" }}>
            <Typography.Body style={{ fontSize: "0.82rem", display: "block" }}>
              <strong>Контактное лицо:</strong> {String(detail.customerPayload?.contactName || "—")}
            </Typography.Body>
            <Typography.Body style={{ fontSize: "0.82rem", display: "block" }}>
              <strong>Номера мест:</strong> {Array.isArray(detail.customerPayload?.selectedPlaces) && detail.customerPayload.selectedPlaces.length > 0
                ? detail.customerPayload.selectedPlaces.join(", ")
                : "—"}
            </Typography.Body>
            <Typography.Body style={{ fontSize: "0.82rem", display: "block" }}>
              <strong>Манипуляционные знаки:</strong> {Array.isArray(detail.customerPayload?.manipulationSigns) && detail.customerPayload.manipulationSigns.length > 0
                ? mapClaimEnumValuesToRu(detail.customerPayload.manipulationSigns, CLAIM_MANIPULATION_SIGN_LABELS_RU).join(", ")
                : "—"}
            </Typography.Body>
            <Typography.Body style={{ fontSize: "0.82rem", display: "block" }}>
              <strong>Упаковка:</strong> {Array.isArray(detail.customerPayload?.packagingTypes) && detail.customerPayload.packagingTypes.length > 0
                ? mapClaimEnumValuesToRu(detail.customerPayload.packagingTypes, CLAIM_PACKAGING_TYPE_LABELS_RU).join(", ")
                : "—"}
            </Typography.Body>
          </div>
        </div>
      )}
    </div>
  );
}
