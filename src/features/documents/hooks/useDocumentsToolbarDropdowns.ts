import { useCallback } from "react";
import type { DocumentsCatalogsState } from "./useDocumentsCatalogs";
import type { DocumentsPageFiltersState } from "./useDocumentsPageFilters";

export type UseDocumentsToolbarDropdownsParams = {
    filters: Pick<
        DocumentsPageFiltersState,
        | "setIsDateDropdownOpen"
        | "setIsCustomerDropdownOpen"
        | "setIsActCustomerDropdownOpen"
        | "setIsBillStatusDropdownOpen"
        | "setIsRouteDropdownOpen"
        | "setIsEdoStatusDropdownOpen"
        | "setIsTransportDropdownOpen"
        | "setIsTypeDropdownOpen"
        | "setIsDeliveryStatusDropdownOpen"
        | "setIsRouteCargoDropdownOpen"
    >;
    catalogs: Pick<
        DocumentsCatalogsState,
        "ordersCatalog" | "edoCatalog" | "claimsCatalog" | "tariffsCatalog" | "sverkiCatalog" | "dogovorsCatalog"
    >;
};

/** Закрывает выпадающие фильтры тулбара «Документы» (кроме «Отправок»). */
export function useDocumentsToolbarDropdowns({ filters, catalogs }: UseDocumentsToolbarDropdownsParams) {
    const {
        setIsDateDropdownOpen,
        setIsCustomerDropdownOpen,
        setIsActCustomerDropdownOpen,
        setIsBillStatusDropdownOpen,
        setIsRouteDropdownOpen,
        setIsEdoStatusDropdownOpen,
        setIsTransportDropdownOpen,
        setIsTypeDropdownOpen,
        setIsDeliveryStatusDropdownOpen,
        setIsRouteCargoDropdownOpen,
    } = filters;

    const { ordersCatalog, edoCatalog, claimsCatalog, tariffsCatalog, sverkiCatalog, dogovorsCatalog } = catalogs;

    const closeDocumentsToolbarDropdownsExceptSendings = useCallback(() => {
        setIsDateDropdownOpen(false);
        setIsCustomerDropdownOpen(false);
        ordersCatalog.setIsReceiverDropdownOpen(false);
        ordersCatalog.setIsOrderSenderDropdownOpen(false);
        ordersCatalog.setIsOrderRouteDropdownOpen(false);
        setIsActCustomerDropdownOpen(false);
        setIsBillStatusDropdownOpen(false);
        setIsRouteDropdownOpen(false);
        setIsEdoStatusDropdownOpen(false);
        setIsTransportDropdownOpen(false);
        edoCatalog.setIsEdoCounterpartyDropdownOpen(false);
        claimsCatalog.closeClaimsDropdowns();
        tariffsCatalog.closeTariffsDropdowns();
        sverkiCatalog.closeSverkiDropdowns();
        dogovorsCatalog.closeDogovorsDropdowns();
    }, [
        ordersCatalog,
        edoCatalog,
        claimsCatalog,
        tariffsCatalog,
        sverkiCatalog,
        dogovorsCatalog,
        setIsDateDropdownOpen,
        setIsCustomerDropdownOpen,
        setIsActCustomerDropdownOpen,
        setIsBillStatusDropdownOpen,
        setIsRouteDropdownOpen,
        setIsEdoStatusDropdownOpen,
        setIsTransportDropdownOpen,
    ]);

    const closeDocumentsToolbarDropdownsForTransport = useCallback(() => {
        setIsDateDropdownOpen(false);
        setIsCustomerDropdownOpen(false);
        ordersCatalog.setIsReceiverDropdownOpen(false);
        setIsActCustomerDropdownOpen(false);
        setIsTypeDropdownOpen(false);
        setIsRouteDropdownOpen(false);
        setIsDeliveryStatusDropdownOpen(false);
        setIsRouteCargoDropdownOpen(false);
        setIsEdoStatusDropdownOpen(false);
    }, [
        ordersCatalog,
        setIsDateDropdownOpen,
        setIsCustomerDropdownOpen,
        setIsActCustomerDropdownOpen,
        setIsTypeDropdownOpen,
        setIsRouteDropdownOpen,
        setIsDeliveryStatusDropdownOpen,
        setIsRouteCargoDropdownOpen,
        setIsEdoStatusDropdownOpen,
    ]);

    return {
        closeDocumentsToolbarDropdownsExceptSendings,
        closeDocumentsToolbarDropdownsForTransport,
    };
}
