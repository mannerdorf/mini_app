import React from "react";
import { AnimatePresence, motion } from "motion/react";
import { Button, Flex, Panel, Typography } from "@maxhub/max-ui";
import { Download, Heart, Loader2, Share2 } from "lucide-react";
import type { SverkiRequestRow } from "../../../api/client/documents";
import { DateText } from "../../../components/ui/DateText";
import { stripOoo } from "../../../lib/formatUtils";
import { getCachedDocumentEdoInfo } from "../../../lib/edoStatus";
import {
  DocumentsEdoCardBadge,
  DocumentsEdoTableStatus,
  DocumentsToolbarBelowSticky,
} from "../views/documentsViewBlocks";
import { shareDocumentLines } from "./useDocFavorites";
import type { SverkiRow } from "./useDocumentsSverki";
import { SverkiOrderModal } from "./SverkiOrderModal";

type MotionProps = {
  initial?: false | object;
  animate?: object;
  exit?: object;
  transition?: object;
};

type Props = {
  active: boolean;
  effectiveServiceMode: boolean;
  tableModeEffective: boolean;
  docsMotionEnabled: boolean;
  cargoModeSwitchMotion: MotionProps;
  sverkiRequestsLoading: boolean;
  sverkiRequests: SverkiRequestRow[];
  sverkiLoading: boolean;
  filteredSverki: SverkiRow[];
  sverkiDownloadingId: number | null;
  sverkiDownloadError: string | null;
  downloadSverkaFile: (row: { id: number; docNumber: string; docDate: string | null }) => void;
  isDocFavorite: (category: string, id: string | number) => boolean;
  toggleDocFavorite: (category: string, id: string | number) => void;
  sverkiOrderModalOpen: boolean;
  setSverkiOrderModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  sverkiOrderContract: string;
  setSverkiOrderContract: React.Dispatch<React.SetStateAction<string>>;
  sverkiOrderContractOptions: string[];
  sverkiOrderContractsLoading: boolean;
  sverkiOrderPeriodFrom: string;
  setSverkiOrderPeriodFrom: React.Dispatch<React.SetStateAction<string>>;
  sverkiOrderPeriodTo: string;
  setSverkiOrderPeriodTo: React.Dispatch<React.SetStateAction<string>>;
  sverkiOrderSubmitting: boolean;
  sverkiOrderError: string | null;
  submitSverkiOrder: () => void;
};

export function DocumentsSverkiSection({
  active,
  effectiveServiceMode,
  tableModeEffective,
  docsMotionEnabled,
  cargoModeSwitchMotion,
  sverkiRequestsLoading,
  sverkiRequests,
  sverkiLoading,
  filteredSverki,
  sverkiDownloadingId,
  sverkiDownloadError,
  downloadSverkaFile,
  isDocFavorite,
  toggleDocFavorite,
  sverkiOrderModalOpen,
  setSverkiOrderModalOpen,
  sverkiOrderContract,
  setSverkiOrderContract,
  sverkiOrderContractOptions,
  sverkiOrderContractsLoading,
  sverkiOrderPeriodFrom,
  setSverkiOrderPeriodFrom,
  sverkiOrderPeriodTo,
  setSverkiOrderPeriodTo,
  sverkiOrderSubmitting,
  sverkiOrderError,
  submitSverkiOrder,
}: Props) {
  if (!active) return null;

  return (
    <>
      <DocumentsToolbarBelowSticky>
        <div>
          {sverkiRequestsLoading ? (
            <Typography.Body
              className="text-empty-state documents-section-empty-state documents-sverki-empty-state"
              style={{ fontSize: "0.82rem", color: "var(--color-text-secondary)" }}
            >
              Загрузка заявок...
            </Typography.Body>
          ) : sverkiRequests.length === 0 ? (
            <Typography.Body
              className="text-empty-state documents-section-empty-state documents-sverki-empty-state"
              style={{ fontSize: "0.82rem", color: "var(--color-text-secondary)" }}
            >
              Заявок пока нет
            </Typography.Body>
          ) : (
            <AnimatePresence mode="wait">
              {tableModeEffective ? (
                <motion.div
                  key="docs-sverki-req-table"
                  className="documents-table-offset-desktop"
                  {...(docsMotionEnabled ? cargoModeSwitchMotion : { initial: false })}
                >
                  <div className="doc-section-table-wrap" style={{ overflowX: "auto" }}>
                    <table className="doc-section-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                      <thead>
                        <tr style={{ background: "var(--color-bg-hover)", borderBottom: "1px solid var(--color-border)" }}>
                          <th style={{ padding: "0.45rem 0.65rem", textAlign: "left", fontWeight: 600 }}>Договор</th>
                          <th style={{ padding: "0.45rem 0.65rem", textAlign: "left", fontWeight: 600 }}>Период с</th>
                          <th style={{ padding: "0.45rem 0.65rem", textAlign: "left", fontWeight: 600 }}>Период по</th>
                          <th style={{ padding: "0.45rem 0.65rem", textAlign: "left", fontWeight: 600 }}>Создана</th>
                          <th style={{ padding: "0.45rem 0.65rem", textAlign: "left", fontWeight: 600 }}>Статус</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sverkiRequests.map((req) => {
                          const sent = req.status === "edo_sent";
                          return (
                            <tr key={req.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                              <td style={{ padding: "0.45rem 0.65rem" }}>{req.contract || "—"}</td>
                              <td style={{ padding: "0.45rem 0.65rem", whiteSpace: "nowrap" }}>
                                <DateText value={req.periodFrom || undefined} />
                              </td>
                              <td style={{ padding: "0.45rem 0.65rem", whiteSpace: "nowrap" }}>
                                <DateText value={req.periodTo || undefined} />
                              </td>
                              <td style={{ padding: "0.45rem 0.65rem", whiteSpace: "nowrap" }}>
                                <DateText value={req.createdAt || undefined} />
                              </td>
                              <td style={{ padding: "0.45rem 0.65rem" }}>
                                <span
                                  style={{
                                    fontSize: "0.74rem",
                                    padding: "0.14rem 0.45rem",
                                    borderRadius: 999,
                                    fontWeight: 600,
                                    background: sent ? "rgba(16,185,129,0.15)" : "rgba(59,130,246,0.15)",
                                    color: sent ? "#10b981" : "#3b82f6",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {sent ? "Отправлена в ЭДО" : "Ожидает формирования"}
                                </span>
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
                  key="docs-sverki-req-cards"
                  className="documents-cards-offset-desktop"
                  {...(docsMotionEnabled ? cargoModeSwitchMotion : { initial: false })}
                >
                  <div className="cargo-list">
                    {sverkiRequests.map((req) => {
                      const sent = req.status === "edo_sent";
                      const favorite = isDocFavorite("reconciliation", `request-${req.id}`);
                      const shareLines = [
                        `Заявка на акт сверки #${req.id}`,
                        `Договор: ${req.contract || "—"}`,
                        req.periodFrom ? `Период с: ${req.periodFrom}` : "",
                        req.periodTo ? `Период по: ${req.periodTo}` : "",
                        req.createdAt ? `Создана: ${req.createdAt}` : "",
                        `Статус: ${sent ? "Отправлена в ЭДО" : "Ожидает формирования"}`,
                      ].filter(Boolean);
                      return (
                        <Panel key={req.id} className="cargo-card" style={{ marginBottom: "0.6rem" }}>
                          <Flex justify="space-between" align="start" style={{ marginBottom: "0.4rem" }}>
                            <Typography.Body style={{ fontWeight: 600, fontSize: "0.95rem" }}>
                              Договор: {req.contract || "—"}
                            </Typography.Body>
                            <Flex align="center" gap="0.5rem" style={{ flexShrink: 0 }}>
                              <Button
                                style={{ padding: "0.25rem", minWidth: "auto", background: "transparent", border: "none", cursor: "pointer" }}
                                onClick={() => shareDocumentLines(`Акт сверки #${req.id}`, shareLines)}
                                title="Поделиться"
                              >
                                <Share2 className="w-4 h-4" style={{ color: "var(--color-text-secondary)" }} />
                              </Button>
                              <Button
                                style={{ padding: "0.25rem", minWidth: "auto", background: "transparent", border: "none", cursor: "pointer" }}
                                onClick={() => toggleDocFavorite("reconciliation", `request-${req.id}`)}
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
                            </Flex>
                          </Flex>
                          <Flex justify="space-between" align="center" style={{ marginBottom: "0.35rem", fontSize: "0.82rem", color: "var(--color-text-secondary)" }}>
                            <Typography.Label>
                              С: <DateText value={req.periodFrom || undefined} />
                            </Typography.Label>
                            <Typography.Label>
                              По: <DateText value={req.periodTo || undefined} />
                            </Typography.Label>
                          </Flex>
                          <Flex justify="space-between" align="center">
                            <Typography.Label style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>
                              <DateText value={req.createdAt || undefined} />
                            </Typography.Label>
                            <span
                              style={{
                                fontSize: "0.74rem",
                                padding: "0.14rem 0.45rem",
                                borderRadius: 999,
                                fontWeight: 600,
                                background: sent ? "rgba(16,185,129,0.15)" : "rgba(59,130,246,0.15)",
                                color: sent ? "#10b981" : "#3b82f6",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {sent ? "Отправлена в ЭДО" : "Ожидает формирования"}
                            </span>
                          </Flex>
                        </Panel>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </div>
        {sverkiLoading ? (
          <Flex align="center" gap="0.5rem" className="documents-section-empty-state documents-sverki-empty-state">
            <Loader2 className="w-4 h-4 animate-spin" />
            <Typography.Body>Загрузка актов сверок...</Typography.Body>
          </Flex>
        ) : filteredSverki.length === 0 ? (
          <Typography.Body
            className="text-empty-state documents-section-empty-state documents-sverki-empty-state"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Нет данных по актам сверок
          </Typography.Body>
        ) : (
          <AnimatePresence mode="wait">
            {tableModeEffective ? (
              <motion.div
                key="docs-sverki-table"
                className="documents-table-offset-desktop"
                {...(docsMotionEnabled ? cargoModeSwitchMotion : { initial: false })}
              >
                <div className="doc-contracts-table-offset-desktop">
                  <div className="doc-section-table-wrap" style={{ overflowX: "auto" }}>
                    <table className="doc-section-table doc-table-header-inline" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
                      <thead>
                        <tr style={{ background: "var(--color-bg-hover)", borderBottom: "1px solid var(--color-border)" }}>
                          <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>Номер</th>
                          <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>Дата</th>
                          <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>Период с</th>
                          <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>Период по</th>
                          {effectiveServiceMode ? (
                            <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>Контрагент</th>
                          ) : null}
                          <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>ЭДО</th>
                          <th style={{ padding: "0.5rem 0.75rem", textAlign: "right", fontWeight: 600 }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredSverki.map((row) => {
                          const number = String(row.docNumber || "").trim();
                          const hasDownload = number && row.docDate;
                          const isDownloading = sverkiDownloadingId === row.id;
                          const edoInfo = getCachedDocumentEdoInfo(row);
                          return (
                            <tr key={row.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                              <td style={{ padding: "0.5rem 0.75rem", whiteSpace: "nowrap" }}>{row.docNumber || "—"}</td>
                              <td style={{ padding: "0.5rem 0.75rem", whiteSpace: "nowrap" }}>
                                <DateText value={row.docDate || undefined} />
                              </td>
                              <td style={{ padding: "0.5rem 0.75rem", whiteSpace: "nowrap" }}>
                                <DateText value={row.periodFrom || undefined} />
                              </td>
                              <td style={{ padding: "0.5rem 0.75rem", whiteSpace: "nowrap" }}>
                                <DateText value={row.periodTo || undefined} />
                              </td>
                              {effectiveServiceMode ? (
                                <td style={{ padding: "0.5rem 0.75rem" }}>{stripOoo(row.customerName) || "—"}</td>
                              ) : null}
                              <td style={{ padding: "0.5rem 0.75rem", whiteSpace: "nowrap" }}>
                                <DocumentsEdoTableStatus info={edoInfo} />
                              </td>
                              <td style={{ padding: "0.5rem 0.75rem", textAlign: "right" }}>
                                {hasDownload ? (
                                  <button
                                    type="button"
                                    className="button-primary"
                                    style={{ fontSize: "0.8rem", padding: "0.25rem 0.5rem", display: "inline-flex", alignItems: "center", gap: "0.25rem" }}
                                    disabled={isDownloading}
                                    onClick={() => downloadSverkaFile(row)}
                                  >
                                    {isDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                                    Скачать
                                  </button>
                                ) : (
                                  "—"
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="docs-sverki-cards"
                className="documents-cards-offset-desktop"
                {...(docsMotionEnabled ? cargoModeSwitchMotion : { initial: false })}
              >
                <div className="cargo-list">
                  {filteredSverki.map((row) => {
                    const number = String(row.docNumber || "").trim();
                    const hasDownload = number && row.docDate;
                    const isDownloading = sverkiDownloadingId === row.id;
                    const edoInfo = getCachedDocumentEdoInfo(row);
                    const favorite = isDocFavorite("reconciliation", `act-${row.id}`);
                    const shareLines = [
                      `Акт сверки: ${row.docNumber || "—"}`,
                      row.docDate ? `Дата: ${row.docDate}` : "",
                      row.periodFrom ? `Период с: ${row.periodFrom}` : "",
                      row.periodTo ? `Период по: ${row.periodTo}` : "",
                      effectiveServiceMode ? `Контрагент: ${stripOoo(row.customerName) || "—"}` : "",
                      edoInfo.raw ? `ЭДО: ${edoInfo.label}` : "",
                    ].filter(Boolean);
                    return (
                      <Panel key={row.id} className="cargo-card" style={{ marginBottom: "0.75rem" }}>
                        <Flex justify="space-between" align="start" style={{ marginBottom: "0.45rem" }}>
                          <Typography.Body style={{ fontWeight: 600, fontSize: "1rem" }}>{row.docNumber || "—"}</Typography.Body>
                          <Flex align="center" gap="0.5rem" style={{ flexShrink: 0 }}>
                            <DocumentsEdoCardBadge info={edoInfo} />
                            <Button
                              style={{ padding: "0.25rem", minWidth: "auto", background: "transparent", border: "none", cursor: "pointer" }}
                              onClick={() => shareDocumentLines(`Акт сверки ${row.docNumber || ""}`, shareLines)}
                              title="Поделиться"
                            >
                              <Share2 className="w-4 h-4" style={{ color: "var(--color-text-secondary)" }} />
                            </Button>
                            <Button
                              style={{ padding: "0.25rem", minWidth: "auto", background: "transparent", border: "none", cursor: "pointer" }}
                              onClick={() => toggleDocFavorite("reconciliation", `act-${row.id}`)}
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
                              <DateText value={row.docDate || undefined} />
                            </Typography.Label>
                          </Flex>
                        </Flex>
                        <Flex justify="space-between" align="center" style={{ fontSize: "0.84rem", color: "var(--color-text-secondary)", marginBottom: "0.35rem" }}>
                          <Typography.Label>
                            С: <DateText value={row.periodFrom || undefined} />
                          </Typography.Label>
                          <Typography.Label>
                            По: <DateText value={row.periodTo || undefined} />
                          </Typography.Label>
                        </Flex>
                        {effectiveServiceMode && (
                          <Typography.Label style={{ marginBottom: "0.45rem", fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>
                            Контрагент: {stripOoo(row.customerName) || "—"}
                          </Typography.Label>
                        )}
                        <Flex justify="flex-end">
                          {hasDownload ? (
                            <button
                              type="button"
                              className="button-primary"
                              style={{ fontSize: "0.8rem", padding: "0.25rem 0.5rem", display: "inline-flex", alignItems: "center", gap: "0.25rem" }}
                              disabled={isDownloading}
                              onClick={() => downloadSverkaFile(row)}
                            >
                              {isDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                              Скачать
                            </button>
                          ) : (
                            <Typography.Label style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>—</Typography.Label>
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
        {sverkiDownloadError && (
          <Typography.Body style={{ marginTop: "0.5rem", fontSize: "0.82rem", color: "#ef4444" }}>
            {sverkiDownloadError}
          </Typography.Body>
        )}
      </DocumentsToolbarBelowSticky>
      <SverkiOrderModal
        open={sverkiOrderModalOpen}
        submitting={sverkiOrderSubmitting}
        error={sverkiOrderError}
        periodFrom={sverkiOrderPeriodFrom}
        periodTo={sverkiOrderPeriodTo}
        contract={sverkiOrderContract}
        contractOptions={sverkiOrderContractOptions}
        contractsLoading={sverkiOrderContractsLoading}
        onClose={() => setSverkiOrderModalOpen(false)}
        onPeriodFromChange={setSverkiOrderPeriodFrom}
        onPeriodToChange={setSverkiOrderPeriodTo}
        onContractChange={setSverkiOrderContract}
        onSubmit={submitSverkiOrder}
      />
    </>
  );
}
