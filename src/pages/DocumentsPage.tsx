import React from "react";
import { Flex, Typography } from "@maxhub/max-ui";
import { TapSwitch } from "../components/TapSwitch";
import { DocumentsInvoicesSection } from "../features/documents/invoices";
import { DocumentsActsSection } from "../features/documents/acts";
import { DocumentsEdoSection } from "../features/documents/edo";
import { DocumentsOrdersSection } from "../features/documents/orders";
import {
    DocumentsTariffsSection,
    DocumentsSverkiSection,
    DocumentsDogovorsSection,
} from "../features/documents/catalogs";
import { DocumentsOrderForm } from "../features/documents/orders";
import { DocumentsSendingsSection } from "../features/documents/sendings";
import { DocumentsClaimsSection } from "../features/documents/claims";
import { DocumentsPageToolbar } from "../features/documents";
import { DocumentsSectionTabs } from "../features/documents/DocumentsSectionTabs";
import { useDocumentsPageState, type DocumentsPageProps } from "./useDocumentsPageState";

export type { DocumentsPageProps };

export function DocumentsPage(props: DocumentsPageProps) {
    const page = useDocumentsPageState(props);

    return (
        <div className={`w-full documents-page${page.documentsServiceSaasUi ? " documents-page--saas-analytics" : ""}${(page.docSection === 'Счета' || page.docSection === 'УПД') ? " documents-page--with-summary-sections" : ""}${page.docSection === 'ЭДО' ? " documents-page--with-edo-section" : ""}${page.docSection === 'Заявки' ? " documents-page--with-orders-section" : ""}${page.docSection === 'Отправки' ? " documents-page--with-sendings-section" : ""}${page.docSection === 'Тарифы' ? " documents-page--with-tariffs-section" : ""}${page.docSection === 'Договоры' ? " documents-page--with-contracts-section" : ""}${page.docSection === 'Акты сверок' ? " documents-page--with-sverki-section" : ""}`} style={{ minWidth: 0, maxWidth: '100%' }}>
            <div className="cargo-page-sticky-header documents-page-sticky-header">
                <Flex align="center" justify="space-between" style={{ marginBottom: '0.3rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <Typography.Headline className="text-page-title">Документы</Typography.Headline>
                    {page.effectiveServiceMode ? (
                        <Flex align="center" gap="0.5rem" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                            <Typography.Body style={{ fontSize: '0.85rem', whiteSpace: 'nowrap' }}>Таблица</Typography.Body>
                            <span className="roles-switch-wrap" style={{ display: 'inline-flex' }} aria-label={page.tableModeByCustomer ? 'Показать карточки' : 'Показать таблицу'}>
                                <TapSwitch checked={page.tableModeByCustomer} onToggle={() => page.setTableModeByCustomer(v => !v)} />
                            </span>
                        </Flex>
                    ) : null}
                </Flex>
                <div className="documents-sticky-body">
                    <DocumentsSectionTabs
                        allowedDocSections={page.allowedDocSections}
                        docSection={page.docSection}
                        onSelectSection={page.setDocSection}
                    />
                    <DocumentsPageToolbar
                        docSection={page.docSection}
                        effectiveServiceMode={page.effectiveServiceMode}
                        dateFilterProps={page.toolbarProps.dateFilterProps}
                        catalogToolbars={page.toolbarProps.catalogToolbars}
                        summaryProps={page.toolbarProps.summaryProps}
                        actionBars={page.toolbarProps.actionBars}
                        closeDocumentsToolbarDropdownsExceptSendings={page.closeDocumentsToolbarDropdownsExceptSendings}
                        closeDocumentsToolbarDropdownsForTransport={page.closeDocumentsToolbarDropdownsForTransport}
                    />
                </div>
            </div>
            <DocumentsInvoicesSection
                active={page.docSection === 'Счета'}
                auth={page.auth}
                loading={page.loading}
                error={page.error}
                perevozkiLoading={page.perevozkiLoading}
                effectiveServiceMode={page.effectiveServiceMode}
                tableModeGroupedByCustomer={page.tableModeGroupedByCustomer}
                tableModeFlatDirect={page.tableModeFlatDirect}
                tableModeEffective={page.tableModeEffective}
                docsMotionEnabled={page.docsMotionEnabled}
                showCustomerColumn={page.showCustomerColumn}
                showSums={page.showSums}
                groupedCustomerTableColSpan={page.groupedCustomerTableColSpan}
                filteredItems={page.invoicesCatalog.filteredInvoiceItems}
                documentsSummary={page.invoicesCatalog.documentsSummary}
                sortedGroupedByCustomer={page.invoicesCatalog.sortedGroupedByCustomer}
                expandedTableCustomer={page.invoicesCatalog.expandedTableCustomer}
                setExpandedTableCustomer={page.invoicesCatalog.setExpandedTableCustomer}
                tableSortColumn={page.tableSortColumn}
                tableSortOrder={page.tableSortOrder}
                handleTableSort={page.handleTableSort}
                innerTableSortColumn={page.innerTableSortColumn}
                innerTableSortOrder={page.innerTableSortOrder}
                handleInnerTableSort={page.handleInnerTableSort}
                sortInvoices={page.invoicesCatalog.sortInvoices}
                cargoStateByNumber={page.cargoStateByNumber}
                cargoRouteByNumber={page.cargoRouteByNumber}
                cargoSumPaidByNumber={page.cargoSumPaidByNumber}
                normCargoKey={page.normCargoKey}
                isInvoiceFavorite={page.invoicesCatalog.isInvoiceFavorite}
                toggleInvoiceFavorite={page.invoicesCatalog.toggleInvoiceFavorite}
                selectedInvoice={page.invoicesCatalog.selectedInvoice}
                setSelectedInvoice={page.invoicesCatalog.setSelectedInvoice}
                onOpenCargo={page.onOpenCargo}
            />
            {page.docSection === 'ЭДО' && (
                <DocumentsEdoSection
                    active={page.docSection === 'ЭДО'}
                    auth={page.auth}
                    loading={page.loading}
                    error={page.error}
                    perevozkiLoading={page.perevozkiLoading}
                    documentsServiceSaasUi={page.documentsServiceSaasUi}
                    tableModeFlatDirect={page.tableModeFlatDirect}
                    tableModeEffective={page.tableModeEffective}
                    docsMotionEnabled={page.docsMotionEnabled}
                    showCustomerColumn={page.showCustomerColumn}
                    filteredEdoItems={page.edoCatalog.filteredEdoItems}
                    edoCargoCardItems={page.edoCatalog.edoCargoCardItems}
                    mergedInvoicesEdoTotals={page.edoCatalog.mergedInvoicesEdoTotals}
                    documentsSummary={page.edoDocumentsSummary}
                    sortedGroupedByCustomer={page.edoCatalog.sortedGroupedByCustomer}
                    expandedTableCustomer={page.edoCatalog.expandedTableCustomer}
                    setExpandedTableCustomer={page.edoCatalog.setExpandedTableCustomer}
                    tableSortColumn={page.tableSortColumn}
                    tableSortOrder={page.tableSortOrder}
                    handleTableSort={page.handleTableSort}
                    edoPartnerInns={page.edoCatalog.edoPartnerInns}
                    selectedInvoice={page.invoicesCatalog.selectedInvoice}
                    setSelectedInvoice={page.invoicesCatalog.setSelectedInvoice}
                    isInvoiceFavorite={page.invoicesCatalog.isInvoiceFavorite}
                    toggleInvoiceFavorite={page.invoicesCatalog.toggleInvoiceFavorite}
                    cargoStateByNumber={page.cargoStateByNumber}
                    cargoRouteByNumber={page.cargoRouteByNumber}
                    cargoSumPaidByNumber={page.cargoSumPaidByNumber}
                    onOpenCargo={page.onOpenCargo}
                />
            )}
            {page.docSection === 'УПД' && (
                <DocumentsActsSection
                    active={page.docSection === 'УПД'}
                    auth={page.auth}
                    actsLoading={page.actsLoading}
                    actsError={page.actsError}
                    perevozkiLoading={page.perevozkiLoading}
                    effectiveServiceMode={page.effectiveServiceMode}
                    tableModeGroupedByCustomer={page.tableModeGroupedByCustomer}
                    tableModeFlatDirect={page.tableModeFlatDirect}
                    tableModeEffective={page.tableModeEffective}
                    docsMotionEnabled={page.docsMotionEnabled}
                    showCustomerColumn={page.showCustomerColumn}
                    showSums={page.showSums}
                    groupedCustomerTableColSpan={page.groupedCustomerTableColSpan}
                    filteredActs={page.actsCatalog.filteredActs}
                    actsSummary={page.actsCatalog.actsSummary}
                    sortedGroupedActsByCustomer={page.actsCatalog.sortedGroupedActsByCustomer}
                    expandedTableActCustomer={page.actsCatalog.expandedTableActCustomer}
                    setExpandedTableActCustomer={page.actsCatalog.setExpandedTableActCustomer}
                    tableSortColumn={page.tableSortColumn}
                    tableSortOrder={page.tableSortOrder}
                    handleTableSort={page.handleTableSort}
                    innerTableActSortColumn={page.actsCatalog.innerTableActSortColumn}
                    innerTableActSortOrder={page.actsCatalog.innerTableActSortOrder}
                    handleInnerTableActSort={page.actsCatalog.handleInnerTableActSort}
                    sortActs={page.actsCatalog.sortActs}
                    items={page.items}
                    cargoStateByNumber={page.cargoStateByNumber}
                    cargoRouteByNumber={page.cargoRouteByNumber}
                    normCargoKey={page.normCargoKey}
                    isInvoiceFavorite={page.invoicesCatalog.isInvoiceFavorite}
                    toggleInvoiceFavorite={page.invoicesCatalog.toggleInvoiceFavorite}
                    selectedAct={page.actsCatalog.selectedAct}
                    setSelectedAct={page.actsCatalog.setSelectedAct}
                    onOpenInvoice={(inv) => { page.actsCatalog.setSelectedAct(null); page.setDocSection('Счета'); page.invoicesCatalog.setSelectedInvoice(inv); }}
                    onNavigateToInvoices={() => page.setDocSection('Счета')}
                    onOpenCargo={page.onOpenCargo}
                />
            )}
            {page.docSection === 'Заявки' && (
                <>
                    {page.documentsOrderFormOpen && (page.effectiveActiveInn || page.activeCustomerName) ? (
                        <DocumentsOrderForm
                            auth={page.auth}
                            activeInn={page.effectiveActiveInn}
                            activeCustomerName={page.activeCustomerName}
                            onBack={() => page.setDocumentsOrderFormOpenPersist(false)}
                            onSuccess={() => {
                                page.setDocumentsOrderFormOpenPersist(false);
                                void page.mutateOrders(undefined, { revalidate: true });
                            }}
                        />
                    ) : (
                        <DocumentsOrdersSection
                            active={page.docSection === 'Заявки' && !page.documentsOrderFormOpen}
                            ordersLoading={page.ordersLoading}
                            ordersError={page.ordersError}
                            tableModeEffective={page.tableModeEffective}
                            docsMotionEnabled={page.docsMotionEnabled}
                            effectiveServiceMode={page.effectiveServiceMode}
                            effectiveSearchText={page.effectiveSearchText}
                            orderRowsSorted={page.ordersCatalog.orderRowsSorted}
                            ordersSortColumn={page.ordersCatalog.ordersSortColumn}
                            ordersSortOrder={page.ordersCatalog.ordersSortOrder}
                            ordersParcelsSortColumn={page.ordersCatalog.ordersParcelsSortColumn}
                            ordersParcelsSortOrder={page.ordersCatalog.ordersParcelsSortOrder}
                            handleOrdersSort={page.ordersCatalog.handleOrdersSort}
                            handleOrdersParcelsSort={page.ordersCatalog.handleOrdersParcelsSort}
                            expandedOrderRow={page.ordersCatalog.expandedOrderRow}
                            setExpandedOrderRow={page.ordersCatalog.setExpandedOrderRow}
                            onOpenCargo={page.onOpenCargo}
                            onDeletePendingOrder={page.ordersCatalog.handleDeletePendingOrder}
                            deletingPendingOrderId={page.ordersCatalog.deletingPendingOrderId}
                            deleteOrderError={page.ordersCatalog.deleteOrderError}
                        />
                    )}
                </>
            )}
            <DocumentsSendingsSection
                active={page.docSection === 'Отправки'}
                hasAnalytics={page.hasAnalytics}
                showSums={page.showSums}
                tableModeEffective={page.tableModeEffective}
                deliveryStatusFilterSet={page.deliveryStatusFilterSet}
                setDeliveryStatusFilterSet={page.setDeliveryStatusFilterSet}
                {...page.sendingsPage}
            />
            <DocumentsTariffsSection
                active={page.docSection === 'Тарифы'}
                effectiveServiceMode={page.effectiveServiceMode}
                tableModeEffective={page.tableModeEffective}
                docsMotionEnabled={page.docsMotionEnabled}
                cargoModeSwitchMotion={page.cargoModeSwitchMotion}
                tariffsLoading={page.tariffsCatalog.tariffsLoading}
                filteredTariffs={page.tariffsCatalog.filteredTariffs}
                tariffsSortColumn={page.tariffsCatalog.tariffsSortColumn}
                tariffsSortOrder={page.tariffsCatalog.tariffsSortOrder}
                setTariffsSortColumn={page.tariffsCatalog.setTariffsSortColumn}
                setTariffsSortOrder={page.tariffsCatalog.setTariffsSortOrder}
                isDocFavorite={page.isDocFavorite}
                toggleDocFavorite={page.toggleDocFavorite}
            />
            <DocumentsSverkiSection
                active={page.docSection === 'Акты сверок'}
                effectiveServiceMode={page.effectiveServiceMode}
                tableModeEffective={page.tableModeEffective}
                docsMotionEnabled={page.docsMotionEnabled}
                cargoModeSwitchMotion={page.cargoModeSwitchMotion}
                sverkiRequestsLoading={page.sverkiCatalog.sverkiRequestsLoading}
                sverkiRequests={page.sverkiCatalog.sverkiRequests}
                sverkiLoading={page.sverkiCatalog.sverkiLoading}
                filteredSverki={page.sverkiCatalog.filteredSverki}
                sverkiDownloadingId={page.sverkiCatalog.sverkiDownloadingId}
                sverkiDownloadError={page.sverkiCatalog.sverkiDownloadError}
                downloadSverkaFile={page.sverkiCatalog.downloadSverkaFile}
                isDocFavorite={page.isDocFavorite}
                toggleDocFavorite={page.toggleDocFavorite}
                sverkiOrderModalOpen={page.sverkiCatalog.sverkiOrderModalOpen}
                setSverkiOrderModalOpen={page.sverkiCatalog.setSverkiOrderModalOpen}
                sverkiOrderContract={page.sverkiCatalog.sverkiOrderContract}
                setSverkiOrderContract={page.sverkiCatalog.setSverkiOrderContract}
                sverkiOrderContractOptions={page.sverkiCatalog.sverkiOrderContractOptions}
                sverkiOrderContractsLoading={page.sverkiCatalog.sverkiOrderContractsLoading}
                sverkiOrderPeriodFrom={page.sverkiCatalog.sverkiOrderPeriodFrom}
                setSverkiOrderPeriodFrom={page.sverkiCatalog.setSverkiOrderPeriodFrom}
                sverkiOrderPeriodTo={page.sverkiCatalog.sverkiOrderPeriodTo}
                setSverkiOrderPeriodTo={page.sverkiCatalog.setSverkiOrderPeriodTo}
                sverkiOrderSubmitting={page.sverkiCatalog.sverkiOrderSubmitting}
                sverkiOrderError={page.sverkiCatalog.sverkiOrderError}
                submitSverkiOrder={page.sverkiCatalog.submitSverkiOrder}
            />
            <DocumentsDogovorsSection
                active={page.docSection === 'Договоры'}
                effectiveServiceMode={page.effectiveServiceMode}
                tableModeEffective={page.tableModeEffective}
                docsMotionEnabled={page.docsMotionEnabled}
                cargoModeSwitchMotion={page.cargoModeSwitchMotion}
                dogovorsLoading={page.dogovorsCatalog.dogovorsLoading}
                filteredDogovors={page.dogovorsCatalog.filteredDogovors}
                dogovorsDownloadingId={page.dogovorsCatalog.dogovorsDownloadingId}
                dogovorsDownloadError={page.dogovorsCatalog.dogovorsDownloadError}
                downloadDogovorFile={page.dogovorsCatalog.downloadDogovorFile}
                isDocFavorite={page.isDocFavorite}
                toggleDocFavorite={page.toggleDocFavorite}
            />
            <DocumentsClaimsSection
                active={page.docSection === 'Претензии'}
                auth={page.auth}
                effectiveActiveInn={page.effectiveActiveInn}
                effectiveServiceMode={page.effectiveServiceMode}
                tableModeEffective={page.tableModeEffective}
                docsMotionEnabled={page.docsMotionEnabled}
                cargoModeSwitchMotion={page.cargoModeSwitchMotion}
                claimsLoading={page.claimsCatalog.claimsLoading}
                filteredClaims={page.claimsCatalog.filteredClaims}
                claimsActionLoadingId={page.claimsCatalog.claimsActionLoadingId}
                claimsModalBusy={page.claimsCatalog.claimsModalBusy}
                claimsReplySubmitting={page.claimsCatalog.claimsReplySubmitting}
                onOpenCargo={page.onOpenCargo}
                openClaimDetailModal={page.claimsCatalog.openClaimDetailModal}
                openDraftEditor={page.claimsCatalog.openDraftEditor}
                runClaimAction={page.claimsCatalog.runClaimAction}
                openClaimReplyModal={page.claimsCatalog.openClaimReplyModal}
                isDocFavorite={page.isDocFavorite}
                toggleDocFavorite={page.toggleDocFavorite}
                claimsCreateOpen={page.claimsCatalog.claimsCreateOpen}
                setClaimsCreateOpen={page.claimsCatalog.setClaimsCreateOpen}
                claimsEditingId={page.claimsCatalog.claimsEditingId}
                setClaimsEditingId={page.claimsCatalog.setClaimsEditingId}
                claimsCreatePrefill={page.claimsCatalog.claimsCreatePrefill}
                setClaimsModalBusy={page.claimsCatalog.setClaimsModalBusy}
                reloadClaims={page.claimsCatalog.reloadClaims}
                claimCargoOptions={page.claimsCatalog.claimCargoOptions}
                perevozkiItems={page.perevozkiItems}
                normCargoKey={page.normCargoKey}
                claimsDetailOpen={page.claimsCatalog.claimsDetailOpen}
                setClaimsDetailOpen={page.claimsCatalog.setClaimsDetailOpen}
                claimsDetailLoading={page.claimsCatalog.claimsDetailLoading}
                claimsDetailError={page.claimsCatalog.claimsDetailError}
                claimsDetailData={page.claimsCatalog.claimsDetailData}
                claimDetailStatusKey={page.claimsCatalog.claimDetailStatusKey}
                claimDetailStatusStyle={page.claimsCatalog.claimDetailStatusStyle}
                claimCustomerPayload={page.claimsCatalog.claimCustomerPayload}
                claimsReplyOpen={page.claimsCatalog.claimsReplyOpen}
                setClaimsReplyOpen={page.claimsCatalog.setClaimsReplyOpen}
                claimsReplyPhotoFiles={page.claimsCatalog.claimsReplyPhotoFiles}
                setClaimsReplyPhotoFiles={page.claimsCatalog.setClaimsReplyPhotoFiles}
                claimsReplyDocumentFiles={page.claimsCatalog.claimsReplyDocumentFiles}
                setClaimsReplyDocumentFiles={page.claimsCatalog.setClaimsReplyDocumentFiles}
                claimsReplyVideoLink={page.claimsCatalog.claimsReplyVideoLink}
                setClaimsReplyVideoLink={page.claimsCatalog.setClaimsReplyVideoLink}
                claimsReplyError={page.claimsCatalog.claimsReplyError}
                submitClaimReplyDocuments={page.claimsCatalog.submitClaimReplyDocuments}
            />
            {page.docSection !== 'Счета' && page.docSection !== 'ЭДО' && page.docSection !== 'УПД' && page.docSection !== 'Заявки' && page.docSection !== 'Отправки' && page.docSection !== 'Тарифы' && page.docSection !== 'Акты сверок' && page.docSection !== 'Договоры' && page.docSection !== 'Претензии' && (
                <Typography.Body style={{ color: 'var(--color-text-secondary)', padding: '2rem 0', fontSize: '0.9rem' }}>
                    Раздел «{page.docSection}» в разработке.
                </Typography.Body>
            )}
        </div>
    );
}
