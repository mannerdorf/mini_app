import React from "react";
import { AnimatePresence, motion } from "motion/react";
import { Button, Flex, Panel, Typography } from "@maxhub/max-ui";
import { Heart, Loader2, Share2 } from "lucide-react";
import { DateText } from "../../../components/ui/DateText";
import { formatCurrency, stripOoo } from "../../../lib/formatUtils";
import type { TariffRow } from "../../../api/client/documents";
import {
  DocumentsRouteBadge,
  DocumentsToolbarBelowSticky,
  formatTariffRouteLabel,
  TariffTransportTypeIcon,
} from "../views/documentsViewBlocks";
import { shareDocumentLines } from "./useDocFavorites";
import type { TariffsSortColumn } from "./useDocumentsTariffs";

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
  tariffsLoading: boolean;
  filteredTariffs: TariffRow[];
  tariffsSortColumn: TariffsSortColumn;
  tariffsSortOrder: "asc" | "desc";
  setTariffsSortColumn: React.Dispatch<React.SetStateAction<TariffsSortColumn>>;
  setTariffsSortOrder: React.Dispatch<React.SetStateAction<"asc" | "desc">>;
  isDocFavorite: (category: string, id: string | number) => boolean;
  toggleDocFavorite: (category: string, id: string | number) => void;
};

export function DocumentsTariffsSection({
  active,
  effectiveServiceMode,
  tableModeEffective,
  docsMotionEnabled,
  cargoModeSwitchMotion,
  tariffsLoading,
  filteredTariffs,
  tariffsSortColumn,
  tariffsSortOrder,
  setTariffsSortColumn,
  setTariffsSortOrder,
  isDocFavorite,
  toggleDocFavorite,
}: Props) {
  if (!active) return null;

  return (
    <DocumentsToolbarBelowSticky>
      {tariffsLoading ? (
        <Flex align="center" gap="0.5rem" className="documents-section-empty-state documents-tariffs-empty-state">
          <Loader2 className="w-4 h-4 animate-spin" />
          <Typography.Body>Загрузка тарифов...</Typography.Body>
        </Flex>
      ) : filteredTariffs.length === 0 ? (
        <Typography.Body className="text-empty-state documents-section-empty-state documents-tariffs-empty-state">
          Нет данных по тарифам
        </Typography.Body>
      ) : (
        <AnimatePresence mode="wait">
          {tableModeEffective ? (
            <motion.div
              key="docs-tariffs-table"
              className="documents-table-offset-desktop"
              {...(docsMotionEnabled ? cargoModeSwitchMotion : { initial: false })}
            >
              <div className="doc-section-table-wrap" style={{ overflowX: "auto" }}>
                <table className="doc-tariffs-table doc-table-header-inline" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
                  <thead>
                    <tr style={{ background: "var(--color-bg-hover)", borderBottom: "1px solid var(--color-border)" }}>
                      <th
                        style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600, cursor: "pointer" }}
                        onClick={() => {
                          setTariffsSortColumn("docDate");
                          setTariffsSortOrder((o) => (tariffsSortColumn === "docDate" ? (o === "asc" ? "desc" : "asc") : "desc"));
                        }}
                      >
                        Дата {tariffsSortColumn === "docDate" ? (tariffsSortOrder === "asc" ? "↑" : "↓") : ""}
                      </th>
                      <th
                        style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600, cursor: "pointer" }}
                        onClick={() => {
                          setTariffsSortColumn("docNumber");
                          setTariffsSortOrder((o) => (tariffsSortColumn === "docNumber" ? (o === "asc" ? "desc" : "asc") : "asc"));
                        }}
                      >
                        Номер {tariffsSortColumn === "docNumber" ? (tariffsSortOrder === "asc" ? "↑" : "↓") : ""}
                      </th>
                      {effectiveServiceMode ? (
                        <th
                          style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600, cursor: "pointer" }}
                          onClick={() => {
                            setTariffsSortColumn("customerName");
                            setTariffsSortOrder((o) => (tariffsSortColumn === "customerName" ? (o === "asc" ? "desc" : "asc") : "asc"));
                          }}
                        >
                          Заказчик {tariffsSortColumn === "customerName" ? (tariffsSortOrder === "asc" ? "↑" : "↓") : ""}
                        </th>
                      ) : null}
                      <th
                        style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600, cursor: "pointer" }}
                        onClick={() => {
                          setTariffsSortColumn("route");
                          setTariffsSortOrder((o) => (tariffsSortColumn === "route" ? (o === "asc" ? "desc" : "asc") : "asc"));
                        }}
                      >
                        Маршрут {tariffsSortColumn === "route" ? (tariffsSortOrder === "asc" ? "↑" : "↓") : ""}
                      </th>
                      <th
                        style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600, cursor: "pointer" }}
                        onClick={() => {
                          setTariffsSortColumn("transportType");
                          setTariffsSortOrder((o) => (tariffsSortColumn === "transportType" ? (o === "asc" ? "desc" : "asc") : "asc"));
                        }}
                      >
                        Тип {tariffsSortColumn === "transportType" ? (tariffsSortOrder === "asc" ? "↑" : "↓") : ""}
                      </th>
                      <th
                        style={{ padding: "0.5rem 0.75rem", textAlign: "center", fontWeight: 600, cursor: "pointer" }}
                        onClick={() => {
                          setTariffsSortColumn("dangerous");
                          setTariffsSortOrder((o) => (tariffsSortColumn === "dangerous" ? (o === "asc" ? "desc" : "asc") : "asc"));
                        }}
                      >
                        Опасный груз {tariffsSortColumn === "dangerous" ? (tariffsSortOrder === "asc" ? "↑" : "↓") : ""}
                      </th>
                      <th
                        style={{ padding: "0.5rem 0.75rem", textAlign: "right", fontWeight: 600, cursor: "pointer" }}
                        onClick={() => {
                          setTariffsSortColumn("tariff");
                          setTariffsSortOrder((o) => (tariffsSortColumn === "tariff" ? (o === "asc" ? "desc" : "asc") : "desc"));
                        }}
                      >
                        Тариф {tariffsSortColumn === "tariff" ? (tariffsSortOrder === "asc" ? "↑" : "↓") : ""}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTariffs.map((t) => (
                      <tr key={t.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                        <td style={{ padding: "0.5rem 0.75rem", whiteSpace: "nowrap" }}>
                          <DateText value={t.docDate || undefined} />
                        </td>
                        <td style={{ padding: "0.5rem 0.75rem", whiteSpace: "nowrap" }}>{t.docNumber || "—"}</td>
                        {effectiveServiceMode ? (
                          <td style={{ padding: "0.5rem 0.75rem" }}>{stripOoo(t.customerName) || "—"}</td>
                        ) : null}
                        <td style={{ padding: "0.5rem 0.75rem" }}>
                          {(() => {
                            const route = formatTariffRouteLabel(t.cityFrom, t.cityTo);
                            return route ? <DocumentsRouteBadge>{route}</DocumentsRouteBadge> : "—";
                          })()}
                        </td>
                        <td style={{ padding: "0.5rem 0.75rem", textAlign: "center" }}>
                          <TariffTransportTypeIcon transportType={t.transportType} />
                        </td>
                        <td style={{ padding: "0.5rem 0.75rem", textAlign: "center" }}>{t.isDangerous ? "Да" : "Нет"}</td>
                        <td style={{ padding: "0.5rem 0.75rem", textAlign: "right", whiteSpace: "nowrap" }}>
                          {t.tariff != null ? formatCurrency(Number(t.tariff)) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="docs-tariffs-cards"
              className="documents-cards-offset-desktop"
              {...(docsMotionEnabled ? cargoModeSwitchMotion : { initial: false })}
            >
              <div className="cargo-list">
                {filteredTariffs.map((t) => {
                  const favorite = isDocFavorite("tariffs", t.id);
                  const route = formatTariffRouteLabel(t.cityFrom, t.cityTo) || "—";
                  const shareLines = [
                    `Тариф: ${t.docNumber || "—"}`,
                    t.docDate ? `Дата: ${t.docDate}` : "",
                    effectiveServiceMode ? `Заказчик: ${stripOoo(t.customerName) || "—"}` : "",
                    `Маршрут: ${route}`,
                    `Тип: ${t.transportType || "—"}`,
                    `Опасный груз: ${t.isDangerous ? "Да" : "Нет"}`,
                    t.tariff != null ? `Тариф: ${formatCurrency(Number(t.tariff))}` : "",
                  ].filter(Boolean);
                  return (
                    <Panel key={t.id} className="cargo-card" style={{ marginBottom: "0.75rem" }}>
                      <Flex justify="space-between" align="start" style={{ marginBottom: "0.45rem" }}>
                        <Typography.Body style={{ fontWeight: 600, fontSize: "1rem" }}>{t.docNumber || "—"}</Typography.Body>
                        <Flex align="center" gap="0.5rem" style={{ flexShrink: 0 }}>
                          <Button
                            style={{ padding: "0.25rem", minWidth: "auto", background: "transparent", border: "none", cursor: "pointer" }}
                            onClick={() => shareDocumentLines(`Тариф ${t.docNumber || ""}`, shareLines)}
                            title="Поделиться"
                          >
                            <Share2 className="w-4 h-4" style={{ color: "var(--color-text-secondary)" }} />
                          </Button>
                          <Button
                            style={{ padding: "0.25rem", minWidth: "auto", background: "transparent", border: "none", cursor: "pointer" }}
                            onClick={() => toggleDocFavorite("tariffs", t.id)}
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
                            <DateText value={t.docDate || undefined} />
                          </Typography.Label>
                        </Flex>
                      </Flex>
                      <Flex justify="space-between" align="center" style={{ marginBottom: "0.35rem" }}>
                        <DocumentsRouteBadge>{route}</DocumentsRouteBadge>
                        <Typography.Body style={{ fontWeight: 600, fontSize: "1rem" }}>
                          {t.tariff != null ? formatCurrency(Number(t.tariff)) : "—"}
                        </Typography.Body>
                      </Flex>
                      <Flex justify="space-between" align="center" style={{ fontSize: "0.84rem", color: "var(--color-text-secondary)" }}>
                        <TariffTransportTypeIcon transportType={t.transportType} size={18} />
                        <Typography.Label>{t.isDangerous ? "Опасный груз" : "Не опасный"}</Typography.Label>
                      </Flex>
                      {effectiveServiceMode && (
                        <Typography.Label style={{ marginTop: "0.25rem", fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>
                          Заказчик: {stripOoo(t.customerName) || "—"}
                        </Typography.Label>
                      )}
                    </Panel>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </DocumentsToolbarBelowSticky>
  );
}
