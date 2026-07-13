import React from "react";
import { AnimatePresence, motion } from "motion/react";
import { Button, Flex, Panel, Typography } from "@maxhub/max-ui";
import { Download, Heart, Loader2, Share2 } from "lucide-react";
import { DateText } from "../../../components/ui/DateText";
import { stripOoo } from "../../../lib/formatUtils";
import { getCachedDocumentEdoInfo } from "../../../lib/edoStatus";
import {
  DocumentsEdoCardBadge,
  DocumentsEdoTableStatus,
  DocumentsToolbarBelowSticky,
} from "../views/documentsViewBlocks";
import { shareDocumentLines } from "./useDocFavorites";
import type { DogovorRow } from "./useDocumentsDogovors";

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
  dogovorsLoading: boolean;
  filteredDogovors: DogovorRow[];
  dogovorsDownloadingId: number | null;
  dogovorsDownloadError: string | null;
  downloadDogovorFile: (row: { id: number; docNumber: string; docDate: string | null; customerInn: string }) => void;
  isDocFavorite: (category: string, id: string | number) => boolean;
  toggleDocFavorite: (category: string, id: string | number) => void;
};

export function DocumentsDogovorsSection({
  active,
  effectiveServiceMode,
  tableModeEffective,
  docsMotionEnabled,
  cargoModeSwitchMotion,
  dogovorsLoading,
  filteredDogovors,
  dogovorsDownloadingId,
  dogovorsDownloadError,
  downloadDogovorFile,
  isDocFavorite,
  toggleDocFavorite,
}: Props) {
  if (!active) return null;

  return (
    <div className="doc-section-content">
      <DocumentsToolbarBelowSticky>
        {dogovorsLoading ? (
          <Flex align="center" gap="0.5rem" className="documents-section-empty-state documents-contracts-empty-state">
            <Loader2 className="w-4 h-4 animate-spin" />
            <Typography.Body>Загрузка договоров...</Typography.Body>
          </Flex>
        ) : filteredDogovors.length === 0 ? (
          <Typography.Body
            className="text-empty-state documents-section-empty-state documents-contracts-empty-state"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Нет данных по договорам
          </Typography.Body>
        ) : (
          <AnimatePresence mode="wait">
            {tableModeEffective ? (
              <motion.div
                key="docs-dog-table"
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
                          {effectiveServiceMode ? (
                            <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>Контрагент</th>
                          ) : null}
                          <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>Наименование</th>
                          <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>ЭДО</th>
                          <th style={{ padding: "0.5rem 0.75rem", textAlign: "right", fontWeight: 600 }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredDogovors.map((row) => {
                          const hasDownload = row.docNumber && row.docDate && row.customerInn;
                          const isDownloading = dogovorsDownloadingId === row.id;
                          const edoInfo = getCachedDocumentEdoInfo(row);
                          return (
                            <tr key={row.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                              <td style={{ padding: "0.5rem 0.75rem", whiteSpace: "nowrap" }}>{row.docNumber || "—"}</td>
                              <td style={{ padding: "0.5rem 0.75rem", whiteSpace: "nowrap" }}>
                                <DateText value={row.docDate || undefined} />
                              </td>
                              {effectiveServiceMode ? (
                                <td style={{ padding: "0.5rem 0.75rem" }}>{stripOoo(row.customerName) || "—"}</td>
                              ) : null}
                              <td style={{ padding: "0.5rem 0.75rem" }}>{row.title || "—"}</td>
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
                                    onClick={() => downloadDogovorFile(row)}
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
                key="docs-dog-cards"
                className="documents-cards-offset-desktop"
                {...(docsMotionEnabled ? cargoModeSwitchMotion : { initial: false })}
              >
                <div className="cargo-list">
                  {filteredDogovors.map((row) => {
                    const hasDownload = row.docNumber && row.docDate && row.customerInn;
                    const isDownloading = dogovorsDownloadingId === row.id;
                    const edoInfo = getCachedDocumentEdoInfo(row);
                    const favorite = isDocFavorite("contracts", row.id);
                    const shareLines = [
                      `Договор: ${row.docNumber || "—"}`,
                      row.docDate ? `Дата: ${row.docDate}` : "",
                      effectiveServiceMode ? `Контрагент: ${stripOoo(row.customerName) || "—"}` : "",
                      `Наименование: ${row.title || "—"}`,
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
                              onClick={() => shareDocumentLines(`Договор ${row.docNumber || ""}`, shareLines)}
                              title="Поделиться"
                            >
                              <Share2 className="w-4 h-4" style={{ color: "var(--color-text-secondary)" }} />
                            </Button>
                            <Button
                              style={{ padding: "0.25rem", minWidth: "auto", background: "transparent", border: "none", cursor: "pointer" }}
                              onClick={() => toggleDocFavorite("contracts", row.id)}
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
                        {effectiveServiceMode && (
                          <Typography.Label style={{ marginBottom: "0.35rem", fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>
                            Контрагент: {stripOoo(row.customerName) || "—"}
                          </Typography.Label>
                        )}
                        <Typography.Body style={{ marginBottom: "0.45rem", fontSize: "0.9rem" }}>{row.title || "—"}</Typography.Body>
                        <Flex justify="flex-end">
                          {hasDownload ? (
                            <button
                              type="button"
                              className="button-primary"
                              style={{ fontSize: "0.8rem", padding: "0.25rem 0.5rem", display: "inline-flex", alignItems: "center", gap: "0.25rem" }}
                              disabled={isDownloading}
                              onClick={() => downloadDogovorFile(row)}
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
        {dogovorsDownloadError && (
          <Typography.Body style={{ marginTop: "0.5rem", fontSize: "0.82rem", color: "#ef4444" }}>
            {dogovorsDownloadError}
          </Typography.Body>
        )}
      </DocumentsToolbarBelowSticky>
    </div>
  );
}
