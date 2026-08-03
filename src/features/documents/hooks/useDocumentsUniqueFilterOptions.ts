import { useMemo } from "react";
import {
    collectUniqueCachedDocumentEdoLabels,
    collectUniqueInvoiceEdoTableLabels,
} from "../../../lib/edoStatus";
import { getActUpdEdoInfo } from "../lib/documentsPipeline";
import type { CargoItem } from "../../../types";
import type { DocSectionKey } from "../documentsSectionConstants";
import type { DocumentsCatalogsState } from "./useDocumentsCatalogs";

export type UseDocumentsUniqueFilterOptionsParams = {
    docSection: DocSectionKey;
    items: CargoItem[];
    actsItems: CargoItem[];
    dogovorsList: DocumentsCatalogsState["dogovorsCatalog"]["dogovorsList"];
    sverkiList: DocumentsCatalogsState["sverkiCatalog"]["sverkiList"];
};

/** Уникальные значения для фильтров тулбара (контрагенты, статусы ЭДО). */
export function useDocumentsUniqueFilterOptions({
    docSection,
    items,
    actsItems,
    dogovorsList,
    sverkiList,
}: UseDocumentsUniqueFilterOptionsParams) {
    const uniqueCustomers = useMemo(
        () =>
            [...new Set(items.map((i) => ((i.Customer ?? i.customer ?? i.Контрагент ?? i.Contractor ?? i.Organization ?? "").trim())).filter(Boolean))].sort(),
        [items],
    );

    const uniqueEdoStatuses = useMemo(() => {
        if (docSection === "Счета" || docSection === "ЭДО") {
            return collectUniqueInvoiceEdoTableLabels(items);
        }
        if (docSection === "Договоры") {
            return collectUniqueCachedDocumentEdoLabels(dogovorsList);
        }
        if (docSection === "Акты сверок") {
            return collectUniqueCachedDocumentEdoLabels(sverkiList);
        }
        const set = new Set<string>();
        if (docSection === "УПД") {
            (actsItems || []).forEach((a: CargoItem) => {
                const edo = getActUpdEdoInfo(a, items);
                if (edo.raw) set.add(edo.label);
            });
        }
        return [...set].sort((a, b) => a.localeCompare(b, "ru"));
    }, [docSection, items, actsItems, dogovorsList, sverkiList]);

    return { uniqueCustomers, uniqueEdoStatuses };
}
