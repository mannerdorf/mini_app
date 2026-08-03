import type { AuthData, CargoItem, CustomerOption, StatusFilter } from "../../../types";

export type DashboardPageProps = {
    auth: AuthData;
    onClose: () => void;
    onOpenCargoFilters: (filters: { status?: StatusFilter; search?: string }) => void;
    showSums?: boolean;
    useServiceRequest?: boolean;
    hasAnalytics?: boolean;
    hasDashboard?: boolean;
    /** Доступ к разделу HAULZ в профиле — виджет «Баланс по субконто». */
    hasHaulz?: boolean;
    /** Компании аккаунта — для баланса по субконто на главной. */
    customers?: CustomerOption[];
    /** Stagger + spring по блокам (только при глобальном SaaS-стиле). */
    saasDashboardMotion?: boolean;
    onOpenCargo?: (cargoNumber: string, prefetchedItem?: CargoItem) => void;
    onOpenInvoice?: (invoice: Record<string, unknown>) => void;
    onOpenDocumentsEdo?: () => void;
    onOpenDocumentsInvoices?: () => void;
};
