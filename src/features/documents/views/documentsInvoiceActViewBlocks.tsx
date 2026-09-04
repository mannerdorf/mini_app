import React, { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Button, Flex, Panel, Typography } from "@maxhub/max-ui";
import { ArrowDown, ArrowUp, Check, ChevronDown, ChevronUp, Copy, Heart, Loader2, AlertTriangle, Share2, Ship, Truck } from "lucide-react";
import { invoiceDocSum } from "../../../../lib/invoiceAmounts.js";
import { cityToCode, formatCurrency, formatInvoiceNumber, normalizeInvoiceStatus, stripOoo } from "../../../lib/formatUtils";
import { ClickableCargoNumber, ClickableInvoiceNumber } from "../../../components/ui/EntityLinks";
import { getPayTillDate, getPayTillDateColor } from "../../../lib/dateUtils";
import {
  aggregateInvoiceEdoDocStats,
  edoCardBadgeSurfaceStyle,
  edoTableCellTextStyle,
  formatEdoSignedRatio,
  getEdoCardCompactLabel,
  getEdoCardDisplayLabel,
  getEdoTableDisplayLabel,
  getInvoiceEdoInfoByDocLabel,
  INVOICE_EDO_MERGED_COLUMNS,
  type EdoStatusInfo,
  type InvoiceEdoDocAgg,
  type InvoiceEdoMergedDocLabel,
} from "../../../lib/edoStatus";
import { DateText } from "../../../components/ui/DateText";
import { AppBadge } from "../../../components/shared/AppBadge";
import { RouteBadge, CargoTransportTypeIcon, formatRouteLabel } from "../../../components/shared/CargoTableDisplay";
import { StatusBadge } from "../../../components/shared/StatusBadges";
import { getSumColorByPaymentStatus } from "../../../lib/statusUtils";
import { cargoExpandMotionProps, cargoListContainerVariants, cargoTableGroupRowVariants, documentsListItemVariants } from "../../../pages/cargoMotion";
import { findInvoiceLinkedToAct, getItemInn, type DocsSummaryTotals, type EdoCargoCardItem } from "../lib/documentsPipeline";
import { innIsEdoPartner } from "../../../lib/edoCounterpartyStatus";
import { DocumentsEdoCardBadge, DocumentsEdoPartnerBadge } from "./documentsEdoViewBlocks";
function invoicePaymentBadgeStyle(st: string): { bg: string; color: string } {
  if (st === "Оплачен") return { bg: "rgba(34, 197, 94, 0.2)", color: "#22c55e" };
  if (st === "Оплачен частично") return { bg: "rgba(234, 179, 8, 0.2)", color: "#ca8a04" };
  if (st === "Не оплачен") return { bg: "rgba(239, 68, 68, 0.2)", color: "#ef4444" };
  return { bg: "var(--color-panel-secondary)", color: "var(--color-text-secondary)" };
}

export type DocumentsInvoiceCardProps = {
  row: any;
  onOpen: () => void;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  /** Бейджи ЭДО в правом нижнем углу (плитки «Счета» / «ЭДО»). */
  showEdoCornerBadges?: boolean;
  edoPartnerInns?: ReadonlySet<string>;
};

export function DocumentsInvoiceCard({
  row,
  onOpen,
  isFavorite,
  onToggleFavorite,
  showEdoCornerBadges = false,
  edoPartnerInns,
}: DocumentsInvoiceCardProps) {
  const num = row.Number ?? row.number ?? row.Номер ?? row.N ?? "";
  const dt = row.DateDoc ?? row.Date ?? row.date ?? row.Дата ?? "";
  const payTill = getPayTillDate(typeof dt === "string" ? dt : dt ? String(dt) : undefined);
  const cust = row.Customer ?? row.customer ?? row.Контрагент ?? row.Contractor ?? row.Organization ?? "";
  const sum = invoiceDocSum(row);
  const rawStatus = row.Status ?? row.State ?? row.state ?? row.Статус ?? "";
  const st = (normalizeInvoiceStatus(rawStatus) || rawStatus) as string;
  const badgeStyle = invoicePaymentBadgeStyle(st);
  const isFerry = row.AK === true || row.AK === "true" || row.AK === "1" || row.AK === 1;

  const onShare = (e: React.MouseEvent) => {
    e.stopPropagation();
    const lines = [
      `Счёт: ${formatInvoiceNumber(num)}`,
      cust && `Заказчик: ${stripOoo(String(cust))}`,
      sum != null && `Сумма: ${formatCurrency(sum)}`,
      dt && `Дата: ${typeof dt === "string" ? dt : String(dt)}`,
      payTill && `Оплата до: ${payTill}`,
    ].filter(Boolean);
    const text = lines.join("\n");
    if (typeof navigator !== "undefined" && (navigator as Navigator & { share?: (d: ShareData) => Promise<void> }).share) {
      void (navigator as Navigator & { share: (d: ShareData) => Promise<void> })
        .share({ title: `Счёт ${formatInvoiceNumber(num)}`, text })
        .catch(() => {});
    } else {
      try {
        void navigator.clipboard?.writeText(text);
      } catch {
        /* ignore */
      }
    }
  };

  return (
    <Panel
      className="cargo-card documents-invoice-card"
      onClick={onOpen}
      style={{
        cursor: "pointer",
        marginBottom: "0.75rem",
        position: "relative",
      }}
    >
      <Flex justify="space-between" align="start" style={{ marginBottom: "0.5rem", minWidth: 0, overflow: "visible" }}>
        <Flex align="center" gap="0.5rem" style={{ flexWrap: "wrap", flex: "0 1 auto", minWidth: 0, maxWidth: "60%" }}>
          <Typography.Body style={{ fontWeight: 600, fontSize: "1rem", color: badgeStyle.color }}>
            {formatInvoiceNumber(num)}
          </Typography.Body>
        </Flex>
        <Flex align="center" gap="0.5rem" style={{ flexShrink: 0 }}>
          <Button
            style={{ padding: "0.25rem", minWidth: "auto", background: "transparent", border: "none", cursor: "pointer" }}
            onClick={onShare}
            title="Поделиться"
          >
            <Share2 className="w-4 h-4" style={{ color: "var(--color-text-secondary)" }} />
          </Button>
          <Button
            style={{ padding: "0.25rem", minWidth: "auto", background: "transparent", border: "none", cursor: "pointer" }}
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite();
            }}
            title={isFavorite ? "Удалить из избранного" : "В избранное"}
          >
            <Heart
              className="w-4 h-4"
              style={{
                fill: isFavorite ? "#ef4444" : "transparent",
                color: isFavorite ? "#ef4444" : "var(--color-text-secondary)",
              }}
            />
          </Button>
          <Typography.Label className="text-theme-secondary" style={{ fontSize: "0.85rem" }}>
            <DateText value={typeof dt === "string" ? dt : dt ? String(dt) : undefined} />
          </Typography.Label>
        </Flex>
      </Flex>
      <Flex justify="space-between" align="center" style={{ marginBottom: "0.5rem" }}>
        <Flex align="center" gap="0.35rem" style={{ minWidth: 0 }}>
          {st ? (
            <AppBadge tone="neutral" style={{ background: badgeStyle.bg, color: badgeStyle.color }}>
              {st}
            </AppBadge>
          ) : null}
        </Flex>
        <Typography.Body style={{ fontWeight: 600, fontSize: "1rem", color: "var(--color-text-primary)" }}>
          {sum != null ? formatCurrency(sum) : "—"}
        </Typography.Body>
      </Flex>
      <Flex
        justify="space-between"
        align="center"
        className="documents-invoice-card__route-row"
        style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}
      >
        <Flex align="center" gap="0.35rem" wrap="wrap" className="documents-invoice-card__route-row-left" style={{ minWidth: 0, flex: "1 1 auto" }}>
          <Typography.Label
            style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}
            title={stripOoo(String(cust || ""))}
          >
            {stripOoo(String(cust || "—"))}
          </Typography.Label>
          {innIsEdoPartner(edoPartnerInns, getItemInn(row)) ? <DocumentsEdoPartnerBadge /> : null}
          <CargoTransportTypeIcon ak={row.AK} />
        </Flex>
        {(row.CitySender || row.CityReceiver) ? (
          <RouteBadge route={formatRouteLabel(row.CitySender, row.CityReceiver)} className="documents-invoice-card__route-badge" />
        ) : null}
      </Flex>
      {payTill && (
        <Flex
          align="center"
          gap="0.35rem"
          style={{
            fontSize: "0.8rem",
            color: getPayTillDateColor(payTill, st === "Оплачен") ?? "var(--color-text-secondary)",
            marginTop: "0.25rem",
          }}
        >
          <Typography.Label>Оплата до:</Typography.Label>
          <DateText value={payTill} />
        </Flex>
      )}
      {showEdoCornerBadges ? (
        <Flex
          className="documents-invoice-card__edo-badges"
          gap="0.25rem"
          wrap="wrap"
          justify="flex-start"
          style={{ width: "100%", marginTop: "0.4rem", pointerEvents: "none" }}
        >
          {INVOICE_EDO_MERGED_COLUMNS.map((k) => (
            <DocumentsEdoCardBadge key={k} docLabel={k} compact info={getInvoiceEdoInfoByDocLabel(row, k)} />
          ))}
        </Flex>
      ) : null}
    </Panel>
  );
}

function actEdoSource(act: any, invoices: any[] | null | undefined): any {
  return findInvoiceLinkedToAct(act, invoices) ?? act;
}

export type DocumentsActCardProps = {
  act: any;
  invoices?: any[] | null;
  onOpen: () => void;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  showSums?: boolean;
  showEdoBadges?: boolean;
};

/** Плитка УПД — тот же каркас, что у счёта, бейджи ЭДО из связанного счёта. */
export function DocumentsActCard({
  act,
  invoices,
  onOpen,
  isFavorite,
  onToggleFavorite,
  showSums = true,
  showEdoBadges = true,
}: DocumentsActCardProps) {
  const num = act.Number ?? act.number ?? "";
  const dateDoc = act.DateDoc ?? act.Date ?? act.date ?? "";
  const sumDoc = act.SumDoc ?? act.Sum ?? act.sum ?? 0;
  const cust = act.Customer ?? act.customer ?? act.Контрагент ?? act.Contractor ?? act.Organization ?? "";
  const invoiceNum = act.Invoice ?? act.invoice ?? "";
  const isFerry = act.AK === true || act.AK === "true" || act.AK === "1" || act.AK === 1;
  const edoSource = actEdoSource(act, invoices);

  const onShare = (e: React.MouseEvent) => {
    e.stopPropagation();
    const lines = [
      `УПД: ${formatInvoiceNumber(String(num))}`,
      cust && `Заказчик: ${stripOoo(String(cust))}`,
      sumDoc != null && `Сумма: ${formatCurrency(sumDoc)}`,
      dateDoc && `Дата: ${typeof dateDoc === "string" ? dateDoc : String(dateDoc)}`,
      invoiceNum && `Счёт: ${formatInvoiceNumber(String(invoiceNum))}`,
    ].filter(Boolean);
    const text = lines.join("\n");
    if (typeof navigator !== "undefined" && (navigator as Navigator & { share?: (d: ShareData) => Promise<void> }).share) {
      void (navigator as Navigator & { share: (d: ShareData) => Promise<void> })
        .share({ title: `УПД ${formatInvoiceNumber(String(num))}`, text })
        .catch(() => {});
    } else {
      try {
        void navigator.clipboard?.writeText(text);
      } catch {
        /* ignore */
      }
    }
  };

  return (
    <Panel
      className="cargo-card documents-invoice-card documents-act-card"
      onClick={onOpen}
      style={{ cursor: "pointer", marginBottom: "0.75rem", position: "relative" }}
      title="Открыть УПД"
    >
      <Flex justify="space-between" align="start" style={{ marginBottom: "0.5rem", minWidth: 0, overflow: "visible" }}>
        <Flex align="center" gap="0.5rem" style={{ flexWrap: "wrap", flex: "0 1 auto", minWidth: 0, maxWidth: "60%" }}>
          <Typography.Body style={{ fontWeight: 600, fontSize: "1rem", color: "var(--color-text-primary)" }}>
            {formatInvoiceNumber(String(num))}
          </Typography.Body>
        </Flex>
        <Flex align="center" gap="0.5rem" style={{ flexShrink: 0 }}>
          <Button
            style={{ padding: "0.25rem", minWidth: "auto", background: "transparent", border: "none", cursor: "pointer" }}
            onClick={onShare}
            title="Поделиться"
          >
            <Share2 className="w-4 h-4" style={{ color: "var(--color-text-secondary)" }} />
          </Button>
          <Button
            style={{ padding: "0.25rem", minWidth: "auto", background: "transparent", border: "none", cursor: "pointer" }}
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite();
            }}
            title={isFavorite ? "Удалить из избранного" : "В избранное"}
          >
            <Heart
              className="w-4 h-4"
              style={{
                fill: isFavorite ? "#ef4444" : "transparent",
                color: isFavorite ? "#ef4444" : "var(--color-text-secondary)",
              }}
            />
          </Button>
          <Typography.Label className="text-theme-secondary" style={{ fontSize: "0.85rem" }}>
            <DateText value={typeof dateDoc === "string" ? dateDoc : dateDoc ? String(dateDoc) : undefined} />
          </Typography.Label>
        </Flex>
      </Flex>
      {showSums ? (
        <Flex justify="space-between" align="center" style={{ marginBottom: "0.5rem" }}>
          <span />
          <Typography.Body style={{ fontWeight: 600, fontSize: "1rem", color: "var(--color-text-primary)" }}>
            {sumDoc != null ? formatCurrency(sumDoc) : "—"}
          </Typography.Body>
        </Flex>
      ) : null}
      <Flex
        justify="space-between"
        align="center"
        className="documents-invoice-card__route-row"
        style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", marginBottom: showEdoBadges ? "0.4rem" : 0 }}
      >
        <Flex align="center" gap="0.35rem" wrap="wrap" className="documents-invoice-card__route-row-left" style={{ minWidth: 0, flex: "1 1 auto" }}>
          <Typography.Label
            style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}
            title={stripOoo(String(cust || ""))}
          >
            {stripOoo(String(cust || "—"))}
          </Typography.Label>
          <CargoTransportTypeIcon ak={act.AK} />
        </Flex>
        {(act.CitySender || act.CityReceiver) ? (
          <RouteBadge route={formatRouteLabel(act.CitySender, act.CityReceiver)} className="documents-invoice-card__route-badge" />
        ) : invoiceNum ? (
          <Typography.Label style={{ fontSize: "0.85rem", flexShrink: 0 }}>Счёт {formatInvoiceNumber(String(invoiceNum))}</Typography.Label>
        ) : null}
      </Flex>
      {showEdoBadges ? (
        <Flex
          className="documents-invoice-card__edo-badges"
          gap="0.25rem"
          wrap="wrap"
          justify="flex-start"
          style={{ width: "100%", marginTop: "0.1rem", pointerEvents: "none" }}
        >
          {INVOICE_EDO_MERGED_COLUMNS.map((k) => (
            <DocumentsEdoCardBadge key={k} docLabel={k} compact info={getInvoiceEdoInfoByDocLabel(edoSource, k)} />
          ))}
        </Flex>
      ) : null}
    </Panel>
  );
}

export type DocumentsActCardsListProps = {
  acts: any[];
  invoices?: any[] | null;
  onOpenAct: (act: any) => void;
  isActFavorite: (num: string) => boolean;
  onToggleActFavorite: (num: string) => void;
  docsMotionEnabled?: boolean;
  showSums?: boolean;
  showEdoBadges?: boolean;
};

/** Список плиток УПД — тот же вид, что в разделе «Счета» (с бейджами ЭДО). */
export function DocumentsActCardsList({
  acts,
  invoices,
  onOpenAct,
  isActFavorite,
  onToggleActFavorite,
  docsMotionEnabled = false,
  showSums = true,
  showEdoBadges = true,
}: DocumentsActCardsListProps) {
  return (
    <motion.div
      className="cargo-list"
      variants={docsMotionEnabled ? cargoListContainerVariants : undefined}
      initial={docsMotionEnabled ? "hidden" : false}
      animate={docsMotionEnabled ? "visible" : undefined}
    >
      {acts.map((act, idx) => {
        const num = String(act.Number ?? act.number ?? "");
        return (
          <motion.div
            key={num || idx}
            variants={docsMotionEnabled ? documentsListItemVariants : undefined}
            initial={docsMotionEnabled ? "hidden" : false}
            animate={docsMotionEnabled ? "visible" : undefined}
          >
            <DocumentsActCard
              act={act}
              invoices={invoices}
              onOpen={() => onOpenAct(act)}
              isFavorite={isActFavorite(num)}
              onToggleFavorite={() => onToggleActFavorite(num)}
              showSums={showSums}
              showEdoBadges={showEdoBadges}
            />
          </motion.div>
        );
      })}
    </motion.div>
  );
}

export type DocumentsEdoCargoCardProps = {
  item: EdoCargoCardItem;
  onOpen: () => void;
  onOpenCargo?: (cargoNumber: string) => void;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  edoPartnerInns?: ReadonlySet<string>;
};

/** Плитка перевозки в разделе «ЭДО» — тот же каркас, что у счёта, статусы ЭДО в теле карточки. */
export function DocumentsEdoCargoCard({ item, onOpen, onOpenCargo, isFavorite, onToggleFavorite, edoPartnerInns }: DocumentsEdoCargoCardProps) {
  const { cargoNumber, invoice, cargo } = item;
  const invNum = invoice.Number ?? invoice.number ?? invoice.Номер ?? invoice.N ?? "";
  const dt = cargo?.DatePrih ?? invoice.DateDoc ?? invoice.Date ?? invoice.date ?? invoice.Дата ?? "";
  const cust =
    cargo?.Customer ??
    cargo?.customer ??
    invoice.Customer ??
    invoice.customer ??
    invoice.Контрагент ??
    invoice.Contractor ??
    invoice.Organization ??
    "";
  const sum = invoiceDocSum(invoice);
  const rawStatus = invoice.Status ?? invoice.State ?? invoice.state ?? invoice.Статус ?? "";
  const st = (normalizeInvoiceStatus(rawStatus) || rawStatus) as string;
  const badgeStyle = invoicePaymentBadgeStyle(st);
  const transportSource = (cargo ?? { AK: invoice.AK }) as { AK?: unknown };
  const routeFromCargo = [cityToCode(cargo?.CitySender), cityToCode(cargo?.CityReceiver)].filter(Boolean).join(" – ");
  const routeFromInvoice = [cityToCode(invoice.CitySender), cityToCode(invoice.CityReceiver)].filter(Boolean).join(" – ");
  const route = routeFromCargo || routeFromInvoice;

  const onShare = (e: React.MouseEvent) => {
    e.stopPropagation();
    const lines = [
      `Перевозка: ${formatInvoiceNumber(cargoNumber)}`,
      invNum && `Счёт: ${formatInvoiceNumber(String(invNum))}`,
      cust && `Заказчик: ${stripOoo(String(cust))}`,
      cargo?.State && `Статус: ${String(cargo.State)}`,
      sum != null && `Сумма: ${formatCurrency(sum)}`,
      dt && `Дата: ${typeof dt === "string" ? dt : String(dt)}`,
      route && `Маршрут: ${route}`,
    ].filter(Boolean);
    const text = lines.join("\n");
    if (typeof navigator !== "undefined" && (navigator as Navigator & { share?: (d: ShareData) => Promise<void> }).share) {
      void (navigator as Navigator & { share: (d: ShareData) => Promise<void> })
        .share({ title: `Перевозка ${formatInvoiceNumber(cargoNumber)}`, text })
        .catch(() => {});
    } else {
      try {
        void navigator.clipboard?.writeText(text);
      } catch {
        /* ignore */
      }
    }
  };

  return (
    <Panel
      className="cargo-card documents-invoice-card documents-edo-cargo-card"
      onClick={onOpen}
      style={{ cursor: "pointer", marginBottom: "0.75rem", position: "relative" }}
      title="Открыть счёт"
    >
      <Flex justify="space-between" align="start" style={{ marginBottom: "0.5rem", minWidth: 0, overflow: "visible" }}>
        <Flex align="center" gap="0.5rem" style={{ flexWrap: "wrap", flex: "0 1 auto", minWidth: 0, maxWidth: "60%" }}>
          <ClickableCargoNumber
            number={cargoNumber}
            onOpen={onOpenCargo}
            style={{ fontWeight: 600, fontSize: "1rem", color: "var(--color-text-primary)" }}
          />
        </Flex>
        <Flex align="center" gap="0.5rem" style={{ flexShrink: 0 }}>
          <Button
            style={{ padding: "0.25rem", minWidth: "auto", background: "transparent", border: "none", cursor: "pointer" }}
            onClick={onShare}
            title="Поделиться"
          >
            <Share2 className="w-4 h-4" style={{ color: "var(--color-text-secondary)" }} />
          </Button>
          <Button
            style={{ padding: "0.25rem", minWidth: "auto", background: "transparent", border: "none", cursor: "pointer" }}
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite();
            }}
            title={isFavorite ? "Удалить из избранного" : "В избранное"}
          >
            <Heart
              className="w-4 h-4"
              style={{
                fill: isFavorite ? "#ef4444" : "transparent",
                color: isFavorite ? "#ef4444" : "var(--color-text-secondary)",
              }}
            />
          </Button>
          <Typography.Label className="text-theme-secondary" style={{ fontSize: "0.85rem" }}>
            <DateText value={typeof dt === "string" ? dt : dt ? String(dt) : undefined} />
          </Typography.Label>
        </Flex>
      </Flex>
      <Flex justify="space-between" align="center" style={{ marginBottom: "0.5rem", gap: "0.35rem", flexWrap: "wrap" }}>
        <Flex align="center" gap="0.35rem" wrap="wrap" className="documents-invoice-card__status-badges" style={{ minWidth: 0 }}>
          {cargo?.State != null ? <StatusBadge status={cargo.State} /> : null}
          {st ? (
            <AppBadge tone="neutral" style={{ background: badgeStyle.bg, color: badgeStyle.color }}>
              {st}
            </AppBadge>
          ) : null}
        </Flex>
        <Typography.Body style={{ fontWeight: 600, fontSize: "1rem", color: "var(--color-text-primary)", flexShrink: 0 }}>
          {sum != null ? formatCurrency(sum) : "—"}
        </Typography.Body>
      </Flex>
      <Flex
        justify="space-between"
        align="center"
        className="documents-invoice-card__route-row"
        style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", marginBottom: "0.45rem" }}
      >
        <Flex align="center" gap="0.35rem" wrap="wrap" className="documents-invoice-card__route-row-left" style={{ minWidth: 0, flex: "1 1 auto" }}>
          <Typography.Label
            style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}
            title={stripOoo(String(cust || ""))}
          >
            {stripOoo(String(cust || "—"))}
          </Typography.Label>
          {innIsEdoPartner(edoPartnerInns, getItemInn(invoice) || getItemInn(cargo)) ? <DocumentsEdoPartnerBadge /> : null}
          <CargoTransportTypeIcon item={transportSource} />
        </Flex>
        {route ? <RouteBadge route={route} className="documents-invoice-card__route-badge" /> : null}
      </Flex>
      {invNum ? (
        <Typography.Label style={{ display: "block", fontSize: "0.78rem", color: "var(--color-text-secondary)", marginBottom: "0.4rem" }}>
          Счёт:{" "}
          <ClickableInvoiceNumber number={String(invNum)} invoice={invoice} onOpen={(_inv) => onOpen()} />
        </Typography.Label>
      ) : null}
      <Flex className="documents-edo-cargo-card__edo-badges" gap="0.35rem" wrap="wrap">
        {INVOICE_EDO_MERGED_COLUMNS.map((k) => (
          <DocumentsEdoCardBadge key={k} docLabel={k} compact info={getInvoiceEdoInfoByDocLabel(invoice, k)} />
        ))}
      </Flex>
    </Panel>
  );
}

export type DocumentsEdoCardsListProps = {
  items: EdoCargoCardItem[];
  onOpenInvoice: (inv: any) => void;
  onOpenCargo?: (cargoNumber: string) => void;
  isInvoiceFavorite: (num: string) => boolean;
  onToggleInvoiceFavorite: (num: string) => void;
  docsMotionEnabled?: boolean;
  edoPartnerInns?: ReadonlySet<string>;
};

/** Список плиток ЭДО: 1 карточка = 1 перевозка. */
export function DocumentsEdoCardsList({
  items,
  onOpenInvoice,
  onOpenCargo,
  isInvoiceFavorite,
  onToggleInvoiceFavorite,
  docsMotionEnabled = false,
  edoPartnerInns,
}: DocumentsEdoCardsListProps) {
  return (
    <motion.div
      className="cargo-list"
      variants={docsMotionEnabled ? cargoListContainerVariants : undefined}
      initial={docsMotionEnabled ? "hidden" : false}
      animate={docsMotionEnabled ? "visible" : undefined}
    >
      {items.map((item, idx) => {
        const invNum = String(item.invoice.Number ?? item.invoice.number ?? item.invoice.Номер ?? item.invoice.N ?? "");
        return (
          <motion.div
            key={`${item.cargoKey}-${idx}`}
            variants={docsMotionEnabled ? documentsListItemVariants : undefined}
            initial={docsMotionEnabled ? "hidden" : false}
            animate={docsMotionEnabled ? "visible" : undefined}
          >
            <DocumentsEdoCargoCard
              item={item}
              onOpen={() => onOpenInvoice(item.invoice)}
              onOpenCargo={onOpenCargo}
              isFavorite={isInvoiceFavorite(invNum)}
              onToggleFavorite={() => onToggleInvoiceFavorite(invNum)}
              edoPartnerInns={edoPartnerInns}
            />
          </motion.div>
        );
      })}
    </motion.div>
  );
}

export type DocumentsInvoiceCardsListProps = {
  items: any[];
  onOpenInvoice: (inv: any) => void;
  isInvoiceFavorite: (num: string) => boolean;
  onToggleInvoiceFavorite: (num: string) => void;
  docsMotionEnabled?: boolean;
  showEdoCornerBadges?: boolean;
  edoPartnerInns?: ReadonlySet<string>;
};

/** Список плиток счетов — тот же вид, что в разделе «Счета». */
export function DocumentsInvoiceCardsList({
  items,
  onOpenInvoice,
  isInvoiceFavorite,
  onToggleInvoiceFavorite,
  docsMotionEnabled = false,
  showEdoCornerBadges = false,
  edoPartnerInns,
}: DocumentsInvoiceCardsListProps) {
  return (
    <>
      <motion.div
        className="cargo-list"
        variants={docsMotionEnabled ? cargoListContainerVariants : undefined}
        initial={docsMotionEnabled ? "hidden" : false}
        animate={docsMotionEnabled ? "visible" : undefined}
      >
        {items.map((row, idx) => {
          const num = String(row.Number ?? row.number ?? row.Номер ?? row.N ?? "");
          return (
            <motion.div
              key={num || idx}
              variants={docsMotionEnabled ? documentsListItemVariants : undefined}
              initial={docsMotionEnabled ? "hidden" : false}
              animate={docsMotionEnabled ? "visible" : undefined}
            >
              <DocumentsInvoiceCard
                row={row}
                onOpen={() => onOpenInvoice(row)}
                isFavorite={isInvoiceFavorite(num)}
                onToggleFavorite={() => onToggleInvoiceFavorite(num)}
                showEdoCornerBadges={showEdoCornerBadges}
                edoPartnerInns={edoPartnerInns}
              />
            </motion.div>
          );
        })}
      </motion.div>
    </>
  );
}

type SummaryProps = {
  summary: DocsSummaryTotals;
  showSums: boolean;
  useServiceRequest: boolean;
  /** Визуал KPI-плиток в духе SaaS analytics (зарегистрированный пользователь + служебный режим). */
  saasAnalytics?: boolean;
  /** Одна компания в табличном режиме: все итоги в плитках, без строки «Итого» в таблице. */
  expandedMetrics?: boolean;
};
