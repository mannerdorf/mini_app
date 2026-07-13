import { AnimatePresence, motion } from "motion/react";
import { Typography } from "@maxhub/max-ui";
import {
  DocumentsEdoMonitorGroupedTable,
  DocumentsEdoMonitorSummaryTiles,
  DocumentsEdoCardsList,
  DocumentsInvoiceCardsList,
  DocumentsStateBlocks,
} from "../views/documentsViewBlocks";
import { InvoiceDetailModal } from "../invoices/InvoiceDetailModal";
import { cargoModeSwitchMotion } from "../../../pages/cargoMotion";
import type { AuthData } from "../../../types";

type Props = {
  active: boolean;
  auth: AuthData;
  loading: boolean;
  error: string | null;
  perevozkiLoading: boolean;
  documentsServiceSaasUi: boolean;
  tableModeFlatDirect: boolean;
  tableModeEffective: boolean;
  docsMotionEnabled: boolean;
  showCustomerColumn: boolean;
  filteredEdoItems: any[];
  edoCargoCardItems: any[];
  mergedInvoicesEdoTotals: ReturnType<typeof import("../../../lib/edoStatus").aggregateInvoiceEdoDocStats>;
  documentsSummary: { sum: number; count: number };
  sortedGroupedByCustomer: { customer: string; items: any[]; sum: number }[];
  expandedTableCustomer: string | null;
  setExpandedTableCustomer: React.Dispatch<React.SetStateAction<string | null>>;
  tableSortColumn: "customer" | "sum" | "count";
  tableSortOrder: "asc" | "desc";
  handleTableSort: (column: "customer" | "sum" | "count") => void;
  edoPartnerInns: Set<string>;
  selectedInvoice: any | null;
  setSelectedInvoice: (inv: any | null) => void;
  isInvoiceFavorite: (invNum: string | undefined) => boolean;
  toggleInvoiceFavorite: (invNum: string | undefined) => void;
  cargoStateByNumber: Map<string, string>;
  cargoRouteByNumber: Map<string, string>;
  cargoSumPaidByNumber: Map<string, number>;
  onOpenCargo?: (cargoNumber: string) => void;
};

export function DocumentsEdoSection({
  active,
  auth,
  loading,
  error,
  perevozkiLoading,
  documentsServiceSaasUi,
  tableModeFlatDirect,
  tableModeEffective,
  docsMotionEnabled,
  showCustomerColumn,
  filteredEdoItems,
  edoCargoCardItems,
  mergedInvoicesEdoTotals,
  documentsSummary,
  sortedGroupedByCustomer,
  expandedTableCustomer,
  setExpandedTableCustomer,
  tableSortColumn,
  tableSortOrder,
  handleTableSort,
  edoPartnerInns,
  selectedInvoice,
  setSelectedInvoice,
  isInvoiceFavorite,
  toggleInvoiceFavorite,
  cargoStateByNumber,
  cargoRouteByNumber,
  cargoSumPaidByNumber,
  onOpenCargo,
}: Props) {
  if (!active) return null;

  return (
    <motion.div className="documents-summary-section-body">
      {(loading || !!error) && <DocumentsStateBlocks loading={loading} error={error} emptyText="" />}
      <AnimatePresence mode="wait">
        {!loading && !error && (edoCargoCardItems.length > 0 || filteredEdoItems.length > 0) ? (
          tableModeFlatDirect && filteredEdoItems.length > 0 ? (
            <motion.div
              key="docs-edo-monitor-flat"
              className="documents-table-offset-desktop"
              {...(docsMotionEnabled ? cargoModeSwitchMotion : { initial: false })}
            >
              <DocumentsEdoMonitorSummaryTiles
                totals={mergedInvoicesEdoTotals}
                invoicesCount={documentsSummary.count}
                saasAnalytics={documentsServiceSaasUi}
              />
              <DocumentsEdoMonitorGroupedTable
                flatDirectItems={filteredEdoItems}
                rows={[]}
                totals={mergedInvoicesEdoTotals}
                invoicesCount={documentsSummary.count}
                expandedCustomer={null}
                onToggleCustomer={() => {}}
                onOpenInvoice={setSelectedInvoice}
                sortColumn="count"
                sortOrder={tableSortOrder}
                onSort={handleTableSort}
                docsMotionEnabled={docsMotionEnabled}
                showCustomerColumn={false}
                edoPartnerInns={edoPartnerInns}
              />
            </motion.div>
          ) : tableModeEffective ? (
            <motion.div
              key="docs-edo-monitor-table"
              className="documents-table-offset-desktop"
              {...(docsMotionEnabled ? cargoModeSwitchMotion : { initial: false })}
            >
              <DocumentsEdoMonitorSummaryTiles
                className="documents-edo-summary-tiles--table-companion"
                totals={mergedInvoicesEdoTotals}
                invoicesCount={documentsSummary.count}
                saasAnalytics={documentsServiceSaasUi}
              />
              <DocumentsEdoMonitorGroupedTable
                rows={
                  sortedGroupedByCustomer.length > 0
                    ? sortedGroupedByCustomer
                    : [{ customer: "—", items: filteredEdoItems, sum: documentsSummary.sum }]
                }
                totals={mergedInvoicesEdoTotals}
                invoicesCount={documentsSummary.count}
                expandedCustomer={expandedTableCustomer}
                onToggleCustomer={(customer) =>
                  setExpandedTableCustomer((prev) => (prev === customer ? null : customer))
                }
                onOpenInvoice={setSelectedInvoice}
                sortColumn={tableSortColumn === "sum" ? "sum" : tableSortColumn === "count" ? "count" : "customer"}
                sortOrder={tableSortOrder}
                onSort={handleTableSort}
                docsMotionEnabled={docsMotionEnabled}
                showCustomerColumn={showCustomerColumn}
                edoPartnerInns={edoPartnerInns}
              />
            </motion.div>
          ) : edoCargoCardItems.length > 0 ? (
            <motion.div
              key="docs-edo-cards"
              className="documents-cards-offset-desktop"
              {...(docsMotionEnabled ? cargoModeSwitchMotion : { initial: false })}
            >
              <DocumentsEdoCardsList
                items={edoCargoCardItems}
                onOpenInvoice={setSelectedInvoice}
                onOpenCargo={onOpenCargo}
                isInvoiceFavorite={isInvoiceFavorite}
                onToggleInvoiceFavorite={toggleInvoiceFavorite}
                docsMotionEnabled={docsMotionEnabled}
                edoPartnerInns={edoPartnerInns}
              />
            </motion.div>
          ) : (
            <motion.div
              key="docs-edo-invoice-fallback"
              className="documents-cards-offset-desktop"
              {...(docsMotionEnabled ? cargoModeSwitchMotion : { initial: false })}
            >
              <DocumentsInvoiceCardsList
                items={filteredEdoItems}
                onOpenInvoice={setSelectedInvoice}
                isInvoiceFavorite={isInvoiceFavorite}
                onToggleInvoiceFavorite={toggleInvoiceFavorite}
                docsMotionEnabled={docsMotionEnabled}
                showEdoCornerBadges
                edoPartnerInns={edoPartnerInns}
              />
            </motion.div>
          )
        ) : null}
      </AnimatePresence>
      {selectedInvoice && (
        <InvoiceDetailModal
          item={selectedInvoice}
          isOpen={!!selectedInvoice}
          onClose={() => setSelectedInvoice(null)}
          onOpenCargo={(cargoNumber) => onOpenCargo?.(cargoNumber)}
          auth={auth}
          cargoStateByNumber={cargoStateByNumber}
          cargoRouteByNumber={cargoRouteByNumber}
          cargoSumPaidByNumber={cargoSumPaidByNumber}
          perevozkiLoading={perevozkiLoading}
          isFavorite={isInvoiceFavorite(String(selectedInvoice?.Number ?? selectedInvoice?.number ?? ""))}
          onToggleFavorite={() =>
            toggleInvoiceFavorite(String(selectedInvoice?.Number ?? selectedInvoice?.number ?? ""))
          }
        />
      )}
      {!loading && !error && filteredEdoItems.length === 0 && (
        <Typography.Body className="text-empty-state documents-summary-empty-state">
          Нет счетов за выбранный период
        </Typography.Body>
      )}
    </motion.div>
  );
}
