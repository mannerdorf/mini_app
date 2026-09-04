import React from "react";
import { AnimatePresence, motion } from "motion/react";
import { Typography } from "@maxhub/max-ui";
import { ArrowDown, ArrowUp, Loader2 } from "lucide-react";
import { DateText } from "../../../components/ui/DateText";
import { formatCurrency, formatInvoiceNumber, normalizeInvoiceStatus, stripOoo } from "../../../lib/formatUtils";
import { ClickableInvoiceNumber } from "../../../components/ui/EntityLinks";
import { invoiceBalance, invoiceDocSum, invoiceSumPaid } from "../../../lib/invoiceAmounts.js";
import { StatusBadge } from "../../../components/shared/StatusBadges";
import {
  DocumentsInvoiceFinanceHeadCells,
  DocumentsInvoiceFinanceCells,
  DocumentsInvoiceCardsList,
  DocumentsStateBlocks,
  DocumentsRouteBadge,
  DocumentsInvoiceTableBadges,
} from "../views/documentsViewBlocks";
import { getFirstCargoNumberFromInvoice } from "../lib/documentsPipeline";
import { InvoiceDetailModal } from "./InvoiceDetailModal";
import {
  cargoExpandMotionProps,
  cargoModeSwitchMotion,
  cargoTableGroupRowVariants,
} from "../../../pages/cargoMotion";
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
  loading: boolean;
  error: string | null;
  perevozkiLoading: boolean;
  effectiveServiceMode: boolean;
  tableModeGroupedByCustomer: boolean;
  tableModeFlatDirect: boolean;
  tableModeEffective: boolean;
  docsMotionEnabled: boolean;
  showCustomerColumn: boolean;
  showSums: boolean;
  groupedCustomerTableColSpan: number;
  filteredItems: any[];
  documentsSummary: { sum: number; count: number };
  sortedGroupedByCustomer: { customer: string; items: any[]; sum: number }[];
  expandedTableCustomer: string | null;
  setExpandedTableCustomer: React.Dispatch<React.SetStateAction<string | null>>;
  tableSortColumn: "customer" | "sum" | "count";
  tableSortOrder: "asc" | "desc";
  handleTableSort: (column: "customer" | "sum" | "count") => void;
  innerTableSortColumn: "number" | "date" | "status" | "sum" | "paid" | "balance" | "deliveryStatus" | "route";
  innerTableSortOrder: "asc" | "desc";
  handleInnerTableSort: (column: "number" | "date" | "status" | "sum" | "paid" | "balance" | "deliveryStatus" | "route") => void;
  sortInvoices: (items: any[]) => any[];
  cargoStateByNumber: Map<string, string>;
  cargoRouteByNumber: Map<string, string>;
  cargoSumPaidByNumber: Map<string, number>;
  normCargoKey: (raw: string) => string;
  isInvoiceFavorite: (invNum: string | undefined) => boolean;
  toggleInvoiceFavorite: (invNum: string | undefined) => void;
  selectedInvoice: any | null;
  setSelectedInvoice: (inv: any | null) => void;
  onOpenCargo?: (cargoNumber: string) => void;
};

export function DocumentsInvoicesSection({
  active,
  auth,
  loading,
  error,
  perevozkiLoading,
  effectiveServiceMode,
  tableModeGroupedByCustomer,
  tableModeFlatDirect,
  tableModeEffective,
  docsMotionEnabled,
  showCustomerColumn,
  showSums,
  groupedCustomerTableColSpan,
  filteredItems,
  documentsSummary,
  sortedGroupedByCustomer,
  expandedTableCustomer,
  setExpandedTableCustomer,
  tableSortColumn,
  tableSortOrder,
  handleTableSort,
  innerTableSortColumn,
  innerTableSortOrder,
  handleInnerTableSort,
  sortInvoices,
  cargoStateByNumber,
  cargoRouteByNumber,
  cargoSumPaidByNumber,
  normCargoKey,
  isInvoiceFavorite,
  toggleInvoiceFavorite,
  selectedInvoice,
  setSelectedInvoice,
  onOpenCargo,
}: Props) {
  if (!active) return null;

  return (
    <motion.div className="documents-summary-section-body">
    {(loading || !!error) && <DocumentsStateBlocks loading={loading} error={error} emptyText="" />}
    <AnimatePresence mode="wait">
    {!loading && !error && tableModeGroupedByCustomer && sortedGroupedByCustomer.length > 0 ? (
        <motion.div key="docs-inv-g" className="documents-table-offset-desktop" {...(docsMotionEnabled ? cargoModeSwitchMotion : { initial: false })}>
        <div className="cargo-card cargo-customer-table-wrap" style={{ marginBottom: '1rem' }}>
            <table className="cargo-customer-table documents-grouped-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                    <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-hover)' }}>
                        {showCustomerColumn && <th className="cargo-customer-table__col-customer customer-col" style={{ padding: '0.5rem 0.4rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleTableSort('customer')} title="Сортировка">Заказчик {tableSortColumn === 'customer' && (tableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>}
                        {showSums && <th className="cargo-customer-table__col-sum" style={{ padding: '0.5rem 0.4rem', textAlign: 'right', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleTableSort('sum')} title="Сортировка">Сумма {tableSortColumn === 'sum' && (tableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>}
                        <th className="cargo-customer-table__col-count" style={{ padding: '0.5rem 0.4rem', textAlign: 'right', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleTableSort('count')} title="Сортировка"><span className="cargo-customer-table__head-long">Счетов</span><span className="cargo-customer-table__head-short">Сч.</span> {tableSortColumn === 'count' && (tableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                    </tr>
                </thead>
                <tbody>
                    {sortedGroupedByCustomer.map((row, i) => {
                        return (
                        <React.Fragment key={i}>
                            <motion.tr
                                custom={i}
                                variants={docsMotionEnabled ? cargoTableGroupRowVariants : undefined}
                                initial={docsMotionEnabled ? "initial" : false}
                                animate={docsMotionEnabled ? "animate" : undefined}
                                style={{ borderBottom: '1px solid var(--color-border)', cursor: 'pointer', background: expandedTableCustomer === row.customer ? 'var(--color-bg-hover)' : undefined }}
                                onClick={() => setExpandedTableCustomer(prev => prev === row.customer ? null : row.customer)}
                                title={expandedTableCustomer === row.customer ? 'Свернуть' : 'Показать счета'}
                            >
                                {showCustomerColumn && <td className="cargo-customer-table__col-customer customer-col" style={{ padding: '0.5rem 0.4rem', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={stripOoo(row.customer)}>{stripOoo(row.customer)}</td>}
                                {showSums && <td className="cargo-customer-table__col-sum" style={{ padding: '0.5rem 0.4rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{formatCurrency(row.sum, true)}</td>}
                                <td className="cargo-customer-table__col-count" style={{ padding: '0.5rem 0.4rem', textAlign: 'right' }}>{row.items.length}</td>
                            </motion.tr>
                            {expandedTableCustomer === row.customer && (
                                <tr key={`${i}-detail`}>
                                    <td colSpan={groupedCustomerTableColSpan} style={{ padding: 0, borderBottom: '1px solid var(--color-border)', verticalAlign: 'top', background: 'var(--color-bg-primary)' }}>
                                        <motion.div {...(docsMotionEnabled ? cargoExpandMotionProps : { initial: false })} className="cargo-inner-table-wrap doc-inner-table-wrap" style={{ padding: '0.5rem' }}>
                                            <table className="doc-inner-table cargo-inner-table documents-invoices-inner-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                                <thead>
                                                    <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-hover)' }}>
                                                        <th className="cargo-inner-table__col-number" style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleInnerTableSort('number'); }} title="Сортировка"><span className="cargo-inner-table__head-long">Номер</span><span className="cargo-inner-table__head-short">№</span> {innerTableSortColumn === 'number' && (innerTableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3 cargo-inner-table__sort-icon" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3 cargo-inner-table__sort-icon" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                        <th className="cargo-inner-table__col-date doc-inner-table-date" style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleInnerTableSort('date'); }} title="Сортировка"><span className="cargo-inner-table__head-long">Дата</span><span className="cargo-inner-table__head-short">Дата</span> {innerTableSortColumn === 'date' && (innerTableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3 cargo-inner-table__sort-icon" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3 cargo-inner-table__sort-icon" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                        <th className="cargo-inner-table__col-status doc-inner-table-status" style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleInnerTableSort('status'); }} title="Сортировка"><span className="cargo-inner-table__head-long">Статус</span><span className="cargo-inner-table__head-short">Ст.</span> {innerTableSortColumn === 'status' && (innerTableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3 cargo-inner-table__sort-icon" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3 cargo-inner-table__sort-icon" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                        <th className="cargo-inner-table__col-delivery doc-inner-table-delivery cargo-inner-table__col-delivery--desktop" style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleInnerTableSort('deliveryStatus'); }} title="Сортировка"><span className="cargo-inner-table__head-long">Статус перевозки</span><span className="cargo-inner-table__head-short">Пер.</span> {innerTableSortColumn === 'deliveryStatus' && (innerTableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3 cargo-inner-table__sort-icon" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3 cargo-inner-table__sort-icon" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                        <th className="cargo-inner-table__col-route doc-inner-table-route cargo-inner-table__col-route--desktop" style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleInnerTableSort('route'); }} title="Сортировка"><span className="cargo-inner-table__head-long">Маршрут</span><span className="cargo-inner-table__head-short">Мар.</span> {innerTableSortColumn === 'route' && (innerTableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3 cargo-inner-table__sort-icon" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3 cargo-inner-table__sort-icon" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                        {showSums && (
                                                            <DocumentsInvoiceFinanceHeadCells
                                                                withSort
                                                                sortColumn={innerTableSortColumn}
                                                                sortOrder={innerTableSortOrder}
                                                                onSort={handleInnerTableSort}
                                                            />
                                                        )}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {sortInvoices(row.items).map((inv: any, j: number) => {
                                                        const inum = inv.Number ?? inv.number ?? inv.Номер ?? inv.N ?? '';
                                                        const idt = inv.DateDoc ?? inv.Date ?? inv.date ?? inv.Дата ?? '';
                                                        const isum = invoiceDocSum(inv);
                                                        const ipaid = invoiceSumPaid(inv, cargoSumPaidByNumber, getFirstCargoNumberFromInvoice);
                                                        const ibalance = invoiceBalance(inv, cargoSumPaidByNumber, getFirstCargoNumberFromInvoice);
                                                        const ipayState = String(inv.StateBill ?? inv.Status ?? inv.State ?? inv.state ?? inv.Статус ?? inv.status ?? inv.PaymentStatus ?? '');
                                                        const ist = normalizeInvoiceStatus(inv.Status ?? inv.State ?? inv.state ?? inv.Статус ?? inv.status ?? inv.PaymentStatus ?? '');
                                                        const istBadgeStyle = ist === 'Оплачен' ? { bg: 'rgba(34, 197, 94, 0.2)', color: '#22c55e' } : ist === 'Оплачен частично' ? { bg: 'rgba(234, 179, 8, 0.2)', color: '#ca8a04' } : ist === 'Не оплачен' ? { bg: 'rgba(239, 68, 68, 0.2)', color: '#ef4444' } : { bg: 'var(--color-panel-secondary)', color: 'var(--color-text-secondary)' };
                                                        const firstCargoNum = getFirstCargoNumberFromInvoice(inv);
                                                        const deliveryState = firstCargoNum ? cargoStateByNumber.get(normCargoKey(firstCargoNum)) : undefined;
                                                        return (
                                                            <tr key={inum || j} style={{ borderBottom: '1px solid var(--color-border)', cursor: 'pointer' }} onClick={(ev) => { ev.stopPropagation(); setSelectedInvoice(inv); }} title="Открыть счёт">
                                                                <td className="cargo-inner-table__col-number" style={{ padding: '0.35rem 0.3rem' }}>
                                                                    <div className="documents-invoice-table-badges-anchor">
                                                                        <span className="cargo-inner-table__number">{formatInvoiceNumber(inum)}</span>
                                                                        <DocumentsInvoiceTableBadges
                                                                            billStatus={ist || undefined}
                                                                            billBadgeStyle={istBadgeStyle}
                                                                            deliveryState={deliveryState}
                                                                            routeLabel={(firstCargoNum ? cargoRouteByNumber.get(normCargoKey(firstCargoNum)) : null) || undefined}
                                                                            perevozkiLoading={perevozkiLoading}
                                                                        />
                                                                    </div>
                                                                </td>
                                                                <td className="cargo-inner-table__col-date doc-inner-table-date" style={{ padding: '0.35rem 0.3rem' }}><DateText value={typeof idt === 'string' ? idt : idt ? String(idt) : undefined} omitYear /></td>
                                                                <td className="cargo-inner-table__col-status doc-inner-table-status" style={{ padding: '0.35rem 0.3rem' }} aria-hidden />
                                                                <td className="cargo-inner-table__col-delivery doc-inner-table-delivery cargo-inner-table__col-delivery--desktop" style={{ padding: '0.35rem 0.3rem' }}>
                                                                    {perevozkiLoading ? <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--color-text-secondary)' }} /> : <StatusBadge status={deliveryState} />}
                                                                </td>
                                                                <td className="cargo-inner-table__col-route doc-inner-table-route cargo-inner-table__col-route--desktop" style={{ padding: '0.35rem 0.3rem' }}>
                                                                    {perevozkiLoading ? <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--color-text-secondary)' }} /> : <DocumentsRouteBadge>{(firstCargoNum ? cargoRouteByNumber.get(normCargoKey(firstCargoNum)) : null) || '—'}</DocumentsRouteBadge>}
                                                                </td>
                                                                {showSums && (
                                                                    <DocumentsInvoiceFinanceCells
                                                                        sum={isum}
                                                                        paid={ipaid}
                                                                        balance={ibalance}
                                                                        payState={ipayState}
                                                                    />
                                                                )}
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </motion.div>
                                    </td>
                                </tr>
                            )}
                        </React.Fragment>
                    );})}
                </tbody>
                <tfoot>
                    <tr style={{ borderTop: '1px solid var(--color-border)', background: 'var(--color-bg-hover)' }}>
                        {showCustomerColumn ? (
                            <td className="cargo-customer-table__col-customer customer-col" style={{ padding: '0.5rem 0.4rem', fontWeight: 700 }}>Итого</td>
                        ) : (
                            <td style={{ padding: '0.5rem 0.4rem', fontWeight: 700 }}>Итого</td>
                        )}
                        {showSums && <td className="cargo-customer-table__col-sum" style={{ padding: '0.5rem 0.4rem', textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap' }}>{formatCurrency(documentsSummary.sum, true)}</td>}
                        <td className="cargo-customer-table__col-count" style={{ padding: '0.5rem 0.4rem', textAlign: 'right', fontWeight: 700 }}>{documentsSummary.count}</td>
                    </tr>
                </tfoot>
            </table>
        </div>
        </motion.div>
    ) : !loading && !error && tableModeFlatDirect && filteredItems.length > 0 ? (
        <motion.div key="docs-inv-flat-direct" className="documents-table-offset-desktop" {...(docsMotionEnabled ? cargoModeSwitchMotion : { initial: false })}>
        <div className="cargo-card cargo-customer-table-wrap" style={{ marginBottom: '1rem' }}>
            <table className="cargo-inner-table documents-invoices-inner-table documents-invoices-flat-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                    <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-hover)' }}>
                        <th className="cargo-inner-table__col-number" style={{ padding: '0.5rem 0.4rem', textAlign: 'left', fontWeight: 600 }}><span className="cargo-inner-table__head-long">Номер</span><span className="cargo-inner-table__head-short">№</span></th>
                        <th className="cargo-inner-table__col-date" style={{ padding: '0.5rem 0.4rem', textAlign: 'left', fontWeight: 600 }}>Дата</th>
                        <th className="cargo-inner-table__col-status" style={{ padding: '0.5rem 0.4rem', textAlign: 'left', fontWeight: 600 }}><span className="cargo-inner-table__head-long">Статус</span><span className="cargo-inner-table__head-short">Ст.</span></th>
                        <th className="cargo-inner-table__col-delivery doc-inner-table-delivery cargo-inner-table__col-delivery--desktop" style={{ padding: '0.5rem 0.4rem', textAlign: 'left', fontWeight: 600 }}><span className="cargo-inner-table__head-long">Статус перевозки</span><span className="cargo-inner-table__head-short">Пер.</span></th>
                        <th className="cargo-inner-table__col-route cargo-inner-table__col-route--desktop" style={{ padding: '0.5rem 0.4rem', textAlign: 'left', fontWeight: 600 }}><span className="cargo-inner-table__head-long">Маршрут</span><span className="cargo-inner-table__head-short">Мар.</span></th>
                        {showSums && <DocumentsInvoiceFinanceHeadCells padding="0.5rem 0.4rem" />}
                    </tr>
                </thead>
                <tbody>
                    {sortInvoices(filteredItems).map((inv: any, i: number) => {
                        const inum = inv.Number ?? inv.number ?? inv.Номер ?? inv.N ?? '';
                        const idt = inv.DateDoc ?? inv.Date ?? inv.date ?? inv.Дата ?? '';
                        const isum = invoiceDocSum(inv);
                        const ipaid = invoiceSumPaid(inv, cargoSumPaidByNumber, getFirstCargoNumberFromInvoice);
                        const ibalance = invoiceBalance(inv, cargoSumPaidByNumber, getFirstCargoNumberFromInvoice);
                        const ipayState = String(inv.StateBill ?? inv.Status ?? inv.State ?? inv.state ?? inv.Статус ?? inv.status ?? inv.PaymentStatus ?? '');
                        const ist = normalizeInvoiceStatus(inv.Status ?? inv.State ?? inv.state ?? inv.Статус ?? inv.status ?? inv.PaymentStatus ?? '');
                        const istBadgeStyle = ist === 'Оплачен' ? { bg: 'rgba(34, 197, 94, 0.2)', color: '#22c55e' } : ist === 'Оплачен частично' ? { bg: 'rgba(234, 179, 8, 0.2)', color: '#ca8a04' } : ist === 'Не оплачен' ? { bg: 'rgba(239, 68, 68, 0.2)', color: '#ef4444' } : { bg: 'var(--color-panel-secondary)', color: 'var(--color-text-secondary)' };
                        const firstCargoNum = getFirstCargoNumberFromInvoice(inv);
                        const deliveryState = firstCargoNum ? cargoStateByNumber.get(normCargoKey(firstCargoNum)) : undefined;
                        return (
                            <tr key={inum || i} style={{ borderBottom: '1px solid var(--color-border)', cursor: 'pointer' }} onClick={() => setSelectedInvoice(inv)} title="Открыть счёт">
                                <td className="cargo-inner-table__col-number" style={{ padding: '0.5rem 0.4rem' }}>
                                    <div className="documents-invoice-table-badges-anchor">
                                        <ClickableInvoiceNumber number={String(inum)} invoice={inv} onOpen={setSelectedInvoice} />
                                        <DocumentsInvoiceTableBadges
                                            billStatus={ist || undefined}
                                            billBadgeStyle={istBadgeStyle}
                                            deliveryState={deliveryState}
                                            routeLabel={(firstCargoNum ? cargoRouteByNumber.get(normCargoKey(firstCargoNum)) : null) || undefined}
                                            perevozkiLoading={perevozkiLoading}
                                        />
                                    </div>
                                </td>
                                <td className="cargo-inner-table__col-date" style={{ padding: '0.5rem 0.4rem' }}><DateText value={typeof idt === 'string' ? idt : idt ? String(idt) : undefined} omitYear /></td>
                                <td className="cargo-inner-table__col-status" style={{ padding: '0.5rem 0.4rem' }} aria-hidden />
                                <td className="cargo-inner-table__col-delivery doc-inner-table-delivery cargo-inner-table__col-delivery--desktop" style={{ padding: '0.5rem 0.4rem' }}>
                                    {perevozkiLoading ? <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--color-text-secondary)' }} /> : <StatusBadge status={deliveryState} />}
                                </td>
                                <td className="cargo-inner-table__col-route cargo-inner-table__col-route--desktop" style={{ padding: '0.5rem 0.4rem' }}>
                                    {perevozkiLoading ? <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--color-text-secondary)' }} /> : <DocumentsRouteBadge>{(firstCargoNum ? cargoRouteByNumber.get(normCargoKey(firstCargoNum)) : null) || '—'}</DocumentsRouteBadge>}
                                </td>
                                {showSums && (
                                    <DocumentsInvoiceFinanceCells
                                        sum={isum}
                                        paid={ipaid}
                                        balance={ibalance}
                                        payState={ipayState}
                                        padding="0.5rem 0.4rem"
                                    />
                                )}
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
        </motion.div>
    ) : !loading && !error && tableModeEffective && effectiveServiceMode && filteredItems.length > 0 && sortedGroupedByCustomer.length === 0 ? (
        <motion.div key="docs-inv-f" className="documents-table-offset-desktop" {...(docsMotionEnabled ? cargoModeSwitchMotion : { initial: false })}>
        <div className="cargo-card cargo-customer-table-wrap" style={{ marginBottom: '1rem' }}>
            <table className="cargo-inner-table documents-invoices-inner-table documents-invoices-flat-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                    <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-hover)' }}>
                        <th className="cargo-inner-table__col-number" style={{ padding: '0.5rem 0.4rem', textAlign: 'left', fontWeight: 600 }}><span className="cargo-inner-table__head-long">Номер</span><span className="cargo-inner-table__head-short">№</span></th>
                        <th className="cargo-inner-table__col-date" style={{ padding: '0.5rem 0.4rem', textAlign: 'left', fontWeight: 600 }}>Дата</th>
                        <th className="cargo-inner-table__col-status" style={{ padding: '0.5rem 0.4rem', textAlign: 'left', fontWeight: 600 }}><span className="cargo-inner-table__head-long">Статус</span><span className="cargo-inner-table__head-short">Ст.</span></th>
                        <th className="cargo-inner-table__col-delivery doc-inner-table-delivery cargo-inner-table__col-delivery--desktop" style={{ padding: '0.5rem 0.4rem', textAlign: 'left', fontWeight: 600 }}><span className="cargo-inner-table__head-long">Статус перевозки</span><span className="cargo-inner-table__head-short">Пер.</span></th>
                        <th className="cargo-inner-table__col-route cargo-inner-table__col-route--desktop" style={{ padding: '0.5rem 0.4rem', textAlign: 'left', fontWeight: 600 }}><span className="cargo-inner-table__head-long">Маршрут</span><span className="cargo-inner-table__head-short">Мар.</span></th>
                        {showSums && <DocumentsInvoiceFinanceHeadCells padding="0.5rem 0.4rem" />}
                    </tr>
                </thead>
                <tbody>
                    {sortInvoices(filteredItems).map((inv: any, i: number) => {
                        const inum = inv.Number ?? inv.number ?? inv.Номер ?? inv.N ?? '';
                        const idt = inv.DateDoc ?? inv.Date ?? inv.date ?? inv.Дата ?? '';
                        const isum = invoiceDocSum(inv);
                        const ipaid = invoiceSumPaid(inv, cargoSumPaidByNumber, getFirstCargoNumberFromInvoice);
                        const ibalance = invoiceBalance(inv, cargoSumPaidByNumber, getFirstCargoNumberFromInvoice);
                        const ipayState = String(inv.StateBill ?? inv.Status ?? inv.State ?? inv.state ?? inv.Статус ?? inv.status ?? inv.PaymentStatus ?? '');
                        const ist = normalizeInvoiceStatus(inv.Status ?? inv.State ?? inv.state ?? inv.Статус ?? inv.status ?? inv.PaymentStatus ?? '');
                        const istBadgeStyle = ist === 'Оплачен' ? { bg: 'rgba(34, 197, 94, 0.2)', color: '#22c55e' } : ist === 'Оплачен частично' ? { bg: 'rgba(234, 179, 8, 0.2)', color: '#ca8a04' } : ist === 'Не оплачен' ? { bg: 'rgba(239, 68, 68, 0.2)', color: '#ef4444' } : { bg: 'var(--color-panel-secondary)', color: 'var(--color-text-secondary)' };
                        const firstCargoNum = getFirstCargoNumberFromInvoice(inv);
                        const deliveryState = firstCargoNum ? cargoStateByNumber.get(normCargoKey(firstCargoNum)) : undefined;
                        return (
                            <tr key={inum || i} style={{ borderBottom: '1px solid var(--color-border)', cursor: 'pointer' }} onClick={() => setSelectedInvoice(inv)} title="Открыть счёт">
                                <td className="cargo-inner-table__col-number" style={{ padding: '0.5rem 0.4rem' }}>
                                    <div className="documents-invoice-table-badges-anchor">
                                        <ClickableInvoiceNumber number={String(inum)} invoice={inv} onOpen={setSelectedInvoice} />
                                        <DocumentsInvoiceTableBadges
                                            billStatus={ist || undefined}
                                            billBadgeStyle={istBadgeStyle}
                                            deliveryState={deliveryState}
                                            routeLabel={(firstCargoNum ? cargoRouteByNumber.get(normCargoKey(firstCargoNum)) : null) || undefined}
                                            perevozkiLoading={perevozkiLoading}
                                        />
                                    </div>
                                </td>
                                <td className="cargo-inner-table__col-date" style={{ padding: '0.5rem 0.4rem' }}><DateText value={typeof idt === 'string' ? idt : idt ? String(idt) : undefined} omitYear /></td>
                                <td className="cargo-inner-table__col-status" style={{ padding: '0.5rem 0.4rem' }} aria-hidden />
                                <td className="cargo-inner-table__col-delivery doc-inner-table-delivery cargo-inner-table__col-delivery--desktop" style={{ padding: '0.5rem 0.4rem' }}>
                                    {perevozkiLoading ? <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--color-text-secondary)' }} /> : <StatusBadge status={deliveryState} />}
                                </td>
                                <td className="cargo-inner-table__col-route cargo-inner-table__col-route--desktop" style={{ padding: '0.5rem 0.4rem' }}>
                                    {perevozkiLoading ? <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--color-text-secondary)' }} /> : <DocumentsRouteBadge>{(firstCargoNum ? cargoRouteByNumber.get(normCargoKey(firstCargoNum)) : null) || '—'}</DocumentsRouteBadge>}
                                </td>
                                {showSums && (
                                    <DocumentsInvoiceFinanceCells
                                        sum={isum}
                                        paid={ipaid}
                                        balance={ibalance}
                                        payState={ipayState}
                                        padding="0.5rem 0.4rem"
                                    />
                                )}
                            </tr>
                        );
                    })}
                </tbody>
                <tfoot>
                    <tr style={{ borderTop: '1px solid var(--color-border)', background: 'var(--color-bg-hover)' }}>
                        <td colSpan={showSums ? 5 : 4} style={{ padding: '0.5rem 0.4rem', fontWeight: 700 }}>Итого</td>
                        {showSums && <td style={{ padding: '0.5rem 0.4rem', textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap' }}>{formatCurrency(documentsSummary.sum)}</td>}
                        {showSums && <td style={{ padding: '0.5rem 0.4rem', textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap' }}>—</td>}
                        {showSums && <td style={{ padding: '0.5rem 0.4rem', textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap' }}>—</td>}
                    </tr>
                </tfoot>
            </table>
        </div>
        </motion.div>
    ) : !loading && !error && filteredItems.length > 0 && !tableModeEffective ? (
        <motion.div key="docs-inv-c" className="documents-cards-offset-desktop" {...(docsMotionEnabled ? cargoModeSwitchMotion : { initial: false })}>
            <DocumentsInvoiceCardsList
                items={filteredItems}
                onOpenInvoice={setSelectedInvoice}
                isInvoiceFavorite={isInvoiceFavorite}
                onToggleInvoiceFavorite={toggleInvoiceFavorite}
                docsMotionEnabled={docsMotionEnabled}
                showEdoCornerBadges
            />
        </motion.div>
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
    {!loading && !error && filteredItems.length === 0 && (
        <Typography.Body className="text-empty-state documents-summary-empty-state">Нет счетов за выбранный период</Typography.Body>
    )}
    </motion.div>
  );
}
