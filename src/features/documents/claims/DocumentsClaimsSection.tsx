import React from "react";
import { AnimatePresence, motion } from "motion/react";
import { Button, Flex, Panel, Typography } from "@maxhub/max-ui";
import { Heart, Loader2, Share2 } from "lucide-react";
import { DateText } from "../../../components/ui/DateText";
import { formatCurrency } from "../../../lib/formatUtils";
import { ClickableCargoNumber } from "../../../components/ui/EntityLinks";
import { DocumentsToolbarBelowSticky } from "../views/documentsViewBlocks";
import { ClaimsCreateModal } from "./ClaimsCreateModal";
import { ClaimsDetailPanel } from "./ClaimsDetailPanel";
import { ClaimsReplyModal } from "./ClaimsReplyModal";
import { CLAIM_ROW_ACTION_BUTTON_STYLE } from "./claimFormConstants";
import {
  CLAIM_STATUS_BADGE,
  CLAIM_STATUS_LABELS,
  type ClaimStatusKey,
} from "./claimStatusConstants";
import type { ClaimListRow } from "./useDocumentsClaims";
import type { AuthData } from "../../../types";

type MotionProps = {
  initial?: false | object;
  animate?: object;
  exit?: object;
  transition?: object;
};

type Props = {
  active: boolean;
  auth: AuthData;
  effectiveActiveInn?: string;
  effectiveServiceMode: boolean;
  tableModeEffective: boolean;
  docsMotionEnabled: boolean;
  cargoModeSwitchMotion: MotionProps;
  claimsLoading: boolean;
  filteredClaims: ClaimListRow[];
  claimsActionLoadingId: number | null;
  claimsModalBusy: boolean;
  claimsReplySubmitting: boolean;
  onOpenCargo?: (cargoNumber: string) => void;
  openClaimDetailModal: (claimId: number) => void;
  openDraftEditor: (claimId: number) => void;
  runClaimAction: (claimId: number, action: "submit" | "withdraw") => void;
  openClaimReplyModal: (claimId: number) => void;
  isDocFavorite: (category: string, id: string | number) => boolean;
  toggleDocFavorite: (category: string, id: string | number) => void;
  claimsCreateOpen: boolean;
  setClaimsCreateOpen: (open: boolean) => void;
  claimsEditingId: number | null;
  setClaimsEditingId: (id: number | null) => void;
  claimsCreatePrefill: string;
  setClaimsModalBusy: (busy: boolean) => void;
  reloadClaims: () => void;
  claimCargoOptions: string[];
  perevozkiItems: any[];
  normCargoKey: (raw: string) => string;
  claimsDetailOpen: boolean;
  setClaimsDetailOpen: (open: boolean) => void;
  claimsDetailLoading: boolean;
  claimsDetailError: string | null;
  claimsDetailData: any | null;
  claimDetailStatusKey: ClaimStatusKey;
  claimDetailStatusStyle: { bg: string; color: string };
  claimCustomerPayload: {
    contactName: string;
    selectedPlaces: string[];
    manipulationSigns: string[];
    packagingTypes: string[];
  };
  claimsReplyOpen: boolean;
  setClaimsReplyOpen: (open: boolean) => void;
  claimsReplyPhotoFiles: File[];
  setClaimsReplyPhotoFiles: (files: File[]) => void;
  claimsReplyDocumentFiles: File[];
  setClaimsReplyDocumentFiles: (files: File[]) => void;
  claimsReplyVideoLink: string;
  setClaimsReplyVideoLink: (value: string) => void;
  claimsReplyError: string | null;
  submitClaimReplyDocuments: () => void;
};

export function DocumentsClaimsSection({
  active,
  auth,
  effectiveActiveInn,
  effectiveServiceMode,
  tableModeEffective,
  docsMotionEnabled,
  cargoModeSwitchMotion,
  claimsLoading,
  filteredClaims,
  claimsActionLoadingId,
  claimsModalBusy,
  claimsReplySubmitting,
  onOpenCargo,
  openClaimDetailModal,
  openDraftEditor,
  runClaimAction,
  openClaimReplyModal,
  isDocFavorite,
  toggleDocFavorite,
  claimsCreateOpen,
  setClaimsCreateOpen,
  claimsEditingId,
  setClaimsEditingId,
  claimsCreatePrefill,
  setClaimsModalBusy,
  reloadClaims,
  claimCargoOptions,
  perevozkiItems,
  normCargoKey,
  claimsDetailOpen,
  setClaimsDetailOpen,
  claimsDetailLoading,
  claimsDetailError,
  claimsDetailData,
  claimDetailStatusKey,
  claimDetailStatusStyle,
  claimCustomerPayload,
  claimsReplyOpen,
  setClaimsReplyOpen,
  claimsReplyPhotoFiles,
  setClaimsReplyPhotoFiles,
  claimsReplyDocumentFiles,
  setClaimsReplyDocumentFiles,
  claimsReplyVideoLink,
  setClaimsReplyVideoLink,
  claimsReplyError,
  submitClaimReplyDocuments,
}: Props) {
  if (!active) return null;

  return (
    <>
      <DocumentsToolbarBelowSticky>
        {claimsLoading ? (
          <Flex align="center" gap="0.5rem" className="documents-section-empty-state">
            <Loader2 className="w-4 h-4 animate-spin" />
            <Typography.Body>Загрузка претензий...</Typography.Body>
          </Flex>
        ) : filteredClaims.length === 0 ? (
          <Typography.Body
            className="text-empty-state documents-section-empty-state documents-claims-empty-state"
            style={{ fontSize: "0.82rem", color: "var(--color-text-secondary)" }}
          >
            Претензий пока нет
          </Typography.Body>
        ) : (
          <AnimatePresence mode="wait">
            {tableModeEffective ? (
              <motion.div
                key="docs-claims-table"
                className="documents-table-offset-desktop"
                {...(docsMotionEnabled ? cargoModeSwitchMotion : { initial: false })}
              >
                <div className="doc-section-table-wrap" style={{ overflowX: "auto" }}>
                  <table className="doc-section-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
                    <thead>
                      <tr style={{ background: "var(--color-bg-hover)", borderBottom: "1px solid var(--color-border)" }}>
                        <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>Номер</th>
                        <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>Дата</th>
                        <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>Перевозка</th>
                        <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>Статус</th>
                        <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>Суть</th>
                        <th style={{ padding: "0.5rem 0.75rem", textAlign: "right", fontWeight: 600 }}>Сумма</th>
                        <th style={{ padding: "0.5rem 0.75rem", textAlign: "right", fontWeight: 600 }}>Действия</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredClaims.map((row) => {
                        const status = (row.status || "new") as ClaimStatusKey;
                        const statusStyle = CLAIM_STATUS_BADGE[status] || CLAIM_STATUS_BADGE.new;
                        return (
                          <tr key={row.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                            <td style={{ padding: "0.5rem 0.75rem", whiteSpace: "nowrap" }}>{row.claimNumber || `#${row.id}`}</td>
                            <td style={{ padding: "0.5rem 0.75rem", whiteSpace: "nowrap" }}>
                              <DateText value={row.createdAt || undefined} />
                            </td>
                            <td style={{ padding: "0.5rem 0.75rem", whiteSpace: "nowrap" }}>
                              <ClickableCargoNumber number={row.cargoNumber} onOpen={onOpenCargo} />
                            </td>
                            <td style={{ padding: "0.5rem 0.75rem" }}>
                              <span
                                style={{
                                  fontSize: "0.75rem",
                                  padding: "0.18rem 0.45rem",
                                  borderRadius: 999,
                                  fontWeight: 600,
                                  background: statusStyle.bg,
                                  color: statusStyle.color,
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {CLAIM_STATUS_LABELS[status] || status}
                              </span>
                            </td>
                            <td style={{ padding: "0.5rem 0.75rem" }}>{row.description || "—"}</td>
                            <td style={{ padding: "0.5rem 0.75rem", textAlign: "right", whiteSpace: "nowrap" }}>
                              {row.requestedAmount != null ? formatCurrency(Number(row.requestedAmount)) : "—"}
                            </td>
                            <td style={{ padding: "0.5rem 0.75rem", textAlign: "right", whiteSpace: "nowrap" }}>
                              <Flex gap="0.35rem" justify="flex-end" wrap="wrap">
                                <Button
                                  type="button"
                                  className="filter-button"
                                  onClick={() => openClaimDetailModal(row.id)}
                                  disabled={claimsActionLoadingId === row.id || claimsModalBusy}
                                  style={CLAIM_ROW_ACTION_BUTTON_STYLE}
                                >
                                  Открыть
                                </Button>
                                {status === "draft" ? (
                                  <>
                                    <Button
                                      type="button"
                                      className="filter-button"
                                      onClick={() => openDraftEditor(row.id)}
                                      disabled={claimsActionLoadingId === row.id || claimsModalBusy}
                                      style={CLAIM_ROW_ACTION_BUTTON_STYLE}
                                    >
                                      Изменить
                                    </Button>
                                    <Button
                                      type="button"
                                      className="button-primary"
                                      onClick={() => runClaimAction(row.id, "submit")}
                                      disabled={claimsActionLoadingId === row.id}
                                      style={CLAIM_ROW_ACTION_BUTTON_STYLE}
                                    >
                                      {claimsActionLoadingId === row.id ? "..." : "Отправить"}
                                    </Button>
                                  </>
                                ) : (
                                  <>
                                    {status === "waiting_docs" && (
                                      <Button
                                        type="button"
                                        className="button-primary"
                                        onClick={() => openClaimReplyModal(row.id)}
                                        disabled={claimsActionLoadingId === row.id || claimsReplySubmitting}
                                        style={{ minWidth: 170, height: 36 }}
                                      >
                                        Ответить документами
                                      </Button>
                                    )}
                                    <Button
                                      type="button"
                                      className="filter-button"
                                      onClick={() => runClaimAction(row.id, "withdraw")}
                                      disabled={
                                        claimsActionLoadingId === row.id || ["paid", "offset", "closed"].includes(status)
                                      }
                                      style={CLAIM_ROW_ACTION_BUTTON_STYLE}
                                    >
                                      {claimsActionLoadingId === row.id ? "..." : "Отозвать"}
                                    </Button>
                                  </>
                                )}
                              </Flex>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="docs-claims-cards"
                className="documents-cards-offset-desktop"
                {...(docsMotionEnabled ? cargoModeSwitchMotion : { initial: false })}
              >
                <div className="cargo-list">
                  {filteredClaims.map((row) => {
                    const status = (row.status || "new") as ClaimStatusKey;
                    const statusStyle = CLAIM_STATUS_BADGE[status] || CLAIM_STATUS_BADGE.new;
                    const favorite = isDocFavorite("claims", row.id);
                    const shareLines = [
                      `Претензия: ${row.claimNumber || `#${row.id}`}`,
                      row.createdAt ? `Дата: ${row.createdAt}` : "",
                      `Перевозка: ${row.cargoNumber || "—"}`,
                      `Статус: ${CLAIM_STATUS_LABELS[status] || status}`,
                      `Суть: ${row.description || "—"}`,
                      row.requestedAmount != null ? `Сумма: ${formatCurrency(Number(row.requestedAmount))}` : "",
                    ].filter(Boolean);
                    return (
                      <Panel key={row.id} className="cargo-card" style={{ marginBottom: "0.75rem" }}>
                        <Flex justify="space-between" align="start" style={{ marginBottom: "0.45rem" }}>
                          <Typography.Body style={{ fontWeight: 600, fontSize: "1rem" }}>
                            {row.claimNumber || `#${row.id}`}
                          </Typography.Body>
                          <Flex align="center" gap="0.5rem" style={{ flexShrink: 0 }}>
                            <Button
                              style={{
                                padding: "0.25rem",
                                minWidth: "auto",
                                background: "transparent",
                                border: "none",
                                cursor: "pointer",
                              }}
                              onClick={() => {
                                const text = shareLines.join("\n");
                                if (typeof navigator !== "undefined" && (navigator as any).share) {
                                  (navigator as any)
                                    .share({ title: `Претензия ${row.claimNumber || `#${row.id}`}`, text })
                                    .catch(() => {});
                                } else {
                                  try {
                                    navigator.clipboard?.writeText(text);
                                  } catch {}
                                }
                              }}
                              title="Поделиться"
                            >
                              <Share2 className="w-4 h-4" style={{ color: "var(--color-text-secondary)" }} />
                            </Button>
                            <Button
                              style={{
                                padding: "0.25rem",
                                minWidth: "auto",
                                background: "transparent",
                                border: "none",
                                cursor: "pointer",
                              }}
                              onClick={() => toggleDocFavorite("claims", row.id)}
                              title={favorite ? "Удалить из избранного" : "В избранное"}
                            >
                              <Heart
                                className="w-4 h-4"
                                style={{
                                  fill: favorite ? "#ef4444" : "transparent",
                                  color: favorite ? "#ef4444" : "var(--color-text-secondary)",
                                }}
                              />
                            </Button>
                            <Typography.Label className="text-theme-secondary" style={{ fontSize: "0.85rem" }}>
                              <DateText value={row.createdAt || undefined} />
                            </Typography.Label>
                          </Flex>
                        </Flex>
                        <Flex justify="space-between" align="center" style={{ marginBottom: "0.4rem" }}>
                          <Typography.Label style={{ fontSize: "0.84rem", color: "var(--color-text-secondary)" }}>
                            Перевозка: {row.cargoNumber || "—"}
                          </Typography.Label>
                          <span
                            style={{
                              fontSize: "0.75rem",
                              padding: "0.18rem 0.45rem",
                              borderRadius: 999,
                              fontWeight: 600,
                              background: statusStyle.bg,
                              color: statusStyle.color,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {CLAIM_STATUS_LABELS[status] || status}
                          </span>
                        </Flex>
                        <Typography.Body style={{ fontSize: "0.86rem", marginBottom: "0.45rem" }}>
                          {row.description || "—"}
                        </Typography.Body>
                        <Flex justify="space-between" align="center" style={{ marginBottom: "0.55rem" }}>
                          <Typography.Label style={{ color: "var(--color-text-secondary)", fontSize: "0.82rem" }}>
                            Сумма
                          </Typography.Label>
                          <Typography.Body style={{ fontWeight: 600, fontSize: "1rem" }}>
                            {row.requestedAmount != null ? formatCurrency(Number(row.requestedAmount)) : "—"}
                          </Typography.Body>
                        </Flex>
                        <Flex gap="0.35rem" justify="flex-end" wrap="wrap">
                          <Button
                            type="button"
                            className="filter-button"
                            onClick={() => openClaimDetailModal(row.id)}
                            disabled={claimsActionLoadingId === row.id || claimsModalBusy}
                            style={CLAIM_ROW_ACTION_BUTTON_STYLE}
                          >
                            Открыть
                          </Button>
                          {status === "draft" ? (
                            <>
                              <Button
                                type="button"
                                className="filter-button"
                                onClick={() => openDraftEditor(row.id)}
                                disabled={claimsActionLoadingId === row.id || claimsModalBusy}
                                style={CLAIM_ROW_ACTION_BUTTON_STYLE}
                              >
                                Изменить
                              </Button>
                              <Button
                                type="button"
                                className="button-primary"
                                onClick={() => runClaimAction(row.id, "submit")}
                                disabled={claimsActionLoadingId === row.id}
                                style={CLAIM_ROW_ACTION_BUTTON_STYLE}
                              >
                                {claimsActionLoadingId === row.id ? "..." : "Отправить"}
                              </Button>
                            </>
                          ) : (
                            <>
                              {status === "waiting_docs" && (
                                <Button
                                  type="button"
                                  className="button-primary"
                                  onClick={() => openClaimReplyModal(row.id)}
                                  disabled={claimsActionLoadingId === row.id || claimsReplySubmitting}
                                  style={{ minWidth: 170, height: 36 }}
                                >
                                  Ответить документами
                                </Button>
                              )}
                              <Button
                                type="button"
                                className="filter-button"
                                onClick={() => runClaimAction(row.id, "withdraw")}
                                disabled={claimsActionLoadingId === row.id || ["paid", "offset", "closed"].includes(status)}
                                style={CLAIM_ROW_ACTION_BUTTON_STYLE}
                              >
                                {claimsActionLoadingId === row.id ? "..." : "Отозвать"}
                              </Button>
                            </>
                          )}
                        </Flex>
                      </Panel>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </DocumentsToolbarBelowSticky>

      <ClaimsDetailPanel
        open={claimsDetailOpen}
        loading={claimsDetailLoading}
        error={claimsDetailError}
        data={claimsDetailData}
        statusKey={claimDetailStatusKey}
        statusStyle={claimDetailStatusStyle}
        customerPayload={claimCustomerPayload}
        onClose={() => setClaimsDetailOpen(false)}
      />
      <ClaimsReplyModal
        open={claimsReplyOpen}
        submitting={claimsReplySubmitting}
        error={claimsReplyError}
        photoFiles={claimsReplyPhotoFiles}
        documentFiles={claimsReplyDocumentFiles}
        videoLink={claimsReplyVideoLink}
        onClose={() => setClaimsReplyOpen(false)}
        onSubmit={submitClaimReplyDocuments}
        onPhotoFilesChange={setClaimsReplyPhotoFiles}
        onDocumentFilesChange={setClaimsReplyDocumentFiles}
        onVideoLinkChange={setClaimsReplyVideoLink}
      />
      <ClaimsCreateModal
        isOpen={claimsCreateOpen}
        editingId={claimsEditingId}
        prefillCargoNumber={claimsCreatePrefill}
        onClose={() => {
          setClaimsCreateOpen(false);
          setClaimsEditingId(null);
        }}
        onSaved={reloadClaims}
        onBusyChange={setClaimsModalBusy}
        auth={auth}
        effectiveActiveInn={effectiveActiveInn}
        claimCargoOptions={claimCargoOptions}
        perevozkiItems={perevozkiItems}
        normCargoKey={normCargoKey}
      />
    </>
  );
}
