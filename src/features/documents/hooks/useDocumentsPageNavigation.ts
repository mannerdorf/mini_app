import { useCallback, useEffect, useMemo, useState } from "react";
import type { AccountPermissions } from "../../../types";
import {
    DOC_SECTIONS,
    DOC_SECTION_TO_PERMISSION,
    type DocSectionKey,
} from "../documentsSectionConstants";

import { hasTableModePreference, readTableModePreference } from "../../../lib/tableModePreference";

const DOCS_TABLE_MODE_KEY = "haulz.docs.tableMode";
const DOCS_SECTION_KEY = "haulz.docs.section";
const DOCS_NEW_ORDER_KEY = "haulz.docs.orders.newFormOpen";

export type UseDocumentsPageNavigationParams = {
    permissions?: AccountPermissions | null;
    showCustomerColumn: boolean;
    effectiveServiceMode: boolean;
};

export function useDocumentsPageNavigation({
    permissions,
    showCustomerColumn,
    effectiveServiceMode,
}: UseDocumentsPageNavigationParams) {
    const readDocumentsNewOrderOpen = useCallback((): boolean => {
        try {
            const url = new URL(window.location.href);
            if (url.searchParams.get("newOrder") === "1") return true;
            return window.localStorage.getItem(DOCS_NEW_ORDER_KEY) === "1";
        } catch {
            return false;
        }
    }, []);

    const persistDocumentsNewOrderOpen = useCallback((open: boolean) => {
        try {
            const url = new URL(window.location.href);
            if (open) {
                url.searchParams.set("newOrder", "1");
                url.searchParams.set("section", "Заявки");
                window.localStorage.setItem(DOCS_NEW_ORDER_KEY, "1");
                window.localStorage.setItem(DOCS_SECTION_KEY, "Заявки");
            } else {
                url.searchParams.delete("newOrder");
                window.localStorage.removeItem(DOCS_NEW_ORDER_KEY);
            }
            window.history.replaceState(null, "", url.toString());
        } catch {
            /* ignore */
        }
    }, []);

    const [tableModeByCustomer, setTableModeByCustomer] = useState<boolean>(() =>
        readTableModePreference(DOCS_TABLE_MODE_KEY),
    );

    useEffect(() => {
        if (!effectiveServiceMode) return;
        if (!hasTableModePreference(DOCS_TABLE_MODE_KEY)) {
            setTableModeByCustomer(true);
        }
    }, [effectiveServiceMode]);

    useEffect(() => {
        try {
            localStorage.setItem(DOCS_TABLE_MODE_KEY, String(tableModeByCustomer));
        } catch {
            /* ignore */
        }
    }, [tableModeByCustomer]);

    const tableModeGroupedByCustomer = tableModeByCustomer && showCustomerColumn && effectiveServiceMode;
    const tableModeFlatDirect = tableModeByCustomer && effectiveServiceMode && !tableModeGroupedByCustomer;
    const tableModeEffective = tableModeByCustomer && effectiveServiceMode;

    const [documentsOrderFormOpen, setDocumentsOrderFormOpen] = useState(() => readDocumentsNewOrderOpen());

    const setDocumentsOrderFormOpenPersist = useCallback((open: boolean) => {
        setDocumentsOrderFormOpen(open);
        persistDocumentsNewOrderOpen(open);
    }, [persistDocumentsNewOrderOpen]);

    const allowedDocSections = useMemo(() => {
        const sendingsAllowed =
            effectiveServiceMode &&
            (!permissions || (permissions.doc_sendings === true && permissions.haulz === true));
        return DOC_SECTIONS.filter(({ key }) => {
            if (key === "ЭДО") return true;
            if (key === "Отправки") return sendingsAllowed;
            if (!permissions) return true;
            if (key === "Претензии") return permissions.doc_claims === true;
            return permissions[DOC_SECTION_TO_PERMISSION[key]] !== false;
        });
    }, [permissions, effectiveServiceMode]);

    const defaultDocSection = allowedDocSections[0]?.key ?? "ЭДО";

    const [docSection, setDocSection] = useState<DocSectionKey>(() => {
        try {
            const url = new URL(window.location.href);
            const fromUrl = url.searchParams.get("section")?.trim();
            if (fromUrl && DOC_SECTIONS.some(({ key }) => key === fromUrl)) {
                return fromUrl as DocSectionKey;
            }
            const v = localStorage.getItem(DOCS_SECTION_KEY) as DocSectionKey | null;
            if (v && DOC_SECTIONS.some(({ key }) => key === v)) return v;
        } catch {
            /* ignore */
        }
        return defaultDocSection;
    });

    const syncDocSectionUrl = useCallback((section: DocSectionKey) => {
        try {
            const url = new URL(window.location.href);
            url.searchParams.set("section", section);
            window.history.replaceState(null, "", url.toString());
        } catch {
            /* ignore */
        }
    }, []);

    const selectDocSection = useCallback(
        (section: DocSectionKey) => {
            setDocSection(section);
            syncDocSectionUrl(section);
        },
        [syncDocSectionUrl],
    );

    useEffect(() => {
        const isAllowed = allowedDocSections.some(({ key }) => key === docSection);
        if (!isAllowed && allowedDocSections.length > 0) {
            setDocSection(defaultDocSection);
            try {
                localStorage.setItem(DOCS_SECTION_KEY, defaultDocSection);
            } catch {
                /* ignore */
            }
        } else {
            try {
                localStorage.setItem(DOCS_SECTION_KEY, docSection);
            } catch {
                /* ignore */
            }
        }
    }, [allowedDocSections, docSection, defaultDocSection]);

    const serviceModeForCurrentDocSection = effectiveServiceMode;

    return {
        docSection,
        setDocSection: selectDocSection,
        allowedDocSections,
        tableModeByCustomer,
        setTableModeByCustomer,
        tableModeGroupedByCustomer,
        tableModeFlatDirect,
        tableModeEffective,
        documentsOrderFormOpen,
        setDocumentsOrderFormOpenPersist,
        serviceModeForCurrentDocSection,
    };
}
