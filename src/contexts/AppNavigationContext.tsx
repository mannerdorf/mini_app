import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "./AuthContext";
import { useAppShell } from "./AppShellContext";
import { getWebApp } from "../webApp";
import { postGetPerevozkaJson } from "../api/client/perevozkiClient";
import { buildCargoItemFromGetPerevozkaResponse, normalizePrefetchedCargoItem } from "../lib/parseGetPerevozkaResponse";
import { formatPerevozkaNumberForApi, hasPerevozkaCargoFields } from "../lib/perevozkaNumber";
import { CargoDetailsModal } from "../components/modals/CargoDetailsModal";
import { InvoiceDetailModal } from "../components/modals/InvoiceDetailModal";
import { ActDetailModal } from "../features/documents/acts";
import type { CargoItem, StatusFilter } from "../types";

export type AppNavigationContextValue = {
  contextCargoNumber: string | null;
  setContextCargoNumber: (value: string | null) => void;
  aisOpenWithMmsi: string | null;
  setAisOpenWithMmsi: (value: string | null) => void;
  openCargoWithFilters: (filters: { status?: StatusFilter; search?: string }) => void;
  openCargoFromChat: (cargoNumber: string) => void;
  openCargoFromDocuments: (cargoNumber: string) => void;
  openCargoInPlace: (cargoNumber: string, prefetchedOrInn?: CargoItem | string, inn?: string) => void;
  openInvoiceInPlace: (invoice: Record<string, unknown>) => void;
  openActInPlace: (act: Record<string, unknown>) => void;
  openClaimFromCargo: (cargoNumber: string) => void;
  openDocumentsWithSection: (section: string) => void;
  openAisWithMmsi: (mmsi: string) => void;
};

const AppNavigationContext = createContext<AppNavigationContextValue | null>(null);

export function useAppNavigation(): AppNavigationContextValue {
  const ctx = useContext(AppNavigationContext);
  if (!ctx) {
    throw new Error("useAppNavigation must be used within AppNavigationProvider");
  }
  return ctx;
}

type ProviderProps = {
  children: React.ReactNode;
  setSearchText: React.Dispatch<React.SetStateAction<string>>;
  useServiceRequest: boolean;
};

export function AppNavigationProvider({ children, setSearchText, useServiceRequest }: ProviderProps) {
  const { activeAccount } = useAuth();
  const { setActiveTab } = useAppShell();

  const [contextCargoNumber, setContextCargoNumber] = useState<string | null>(null);
  const [aisOpenWithMmsi, setAisOpenWithMmsi] = useState<string | null>(null);
  const [overlayCargoNumber, setOverlayCargoNumber] = useState<string | null>(null);
  const [overlayCargoItem, setOverlayCargoItem] = useState<CargoItem | null>(null);
  const [overlayCargoLoading, setOverlayCargoLoading] = useState(false);
  const [overlayCargoNotFound, setOverlayCargoNotFound] = useState(false);
  const [overlayCargoSource, setOverlayCargoSource] = useState<"fetch" | "prefetch">("fetch");
  const [overlayCargoInn, setOverlayCargoInn] = useState<string | null>(null);
  const [overlayInvoice, setOverlayInvoice] = useState<Record<string, unknown> | null>(null);
  const [overlayAct, setOverlayAct] = useState<Record<string, unknown> | null>(null);
  const [overlayFavVersion, setOverlayFavVersion] = useState(0);

  const applySearch = useCallback(
    (text: string) => {
      const normalized = text.toLowerCase().trim();
      setSearchText(normalized);
    },
    [setSearchText],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const webApp = getWebApp();
    if (!webApp) return;

    const param =
      (webApp as { startParam?: string }).startParam ||
      (webApp as { initDataUnsafe?: { start_param?: string } }).initDataUnsafe?.start_param ||
      new URLSearchParams(window.location.search).get("start_param") ||
      new URLSearchParams(window.location.search).get("startapp");

    if (!param) return;

    console.log("📱 Start param:", param);

    const openCargoByNumber = (number: string) => {
      setContextCargoNumber(number);
      setActiveTab("cargo");
    };

    if (param.startsWith("invoice_")) {
      openCargoByNumber(param.replace("invoice_", ""));
    } else if (param.startsWith("upd_")) {
      openCargoByNumber(param.replace("upd_", ""));
    } else if (param.startsWith("delivery_")) {
      openCargoByNumber(param.replace("delivery_", ""));
    } else if (param.startsWith("haulz_n_")) {
      const parts = param.split("_");
      const number = parts[2];
      if (number) openCargoByNumber(number);
    }
  }, [setActiveTab]);

  useEffect(() => {
    if (!overlayCargoNumber || !activeAccount?.login || !activeAccount?.password) {
      if (!overlayCargoNumber) {
        setOverlayCargoItem(null);
        setOverlayCargoInn(null);
        setOverlayCargoNotFound(false);
        setOverlayCargoSource("fetch");
      }
      return;
    }
    if (overlayCargoSource === "prefetch") {
      setOverlayCargoLoading(false);
      return;
    }
    let cancelled = false;
    setOverlayCargoLoading(true);
    setOverlayCargoNotFound(false);
    const inn = overlayCargoInn ?? activeAccount.activeCustomerInn ?? activeAccount.customers?.[0]?.inn ?? undefined;
    const numberForApi = formatPerevozkaNumberForApi(overlayCargoNumber);
    postGetPerevozkaJson({
      login: activeAccount.login,
      password: activeAccount.password,
      number: numberForApi,
      ...(inn ? { inn } : {}),
      ...(activeAccount.isRegisteredUser ? { isRegisteredUser: true } : {}),
    })
      .then((data) => {
        if (cancelled) return;
        const item = buildCargoItemFromGetPerevozkaResponse(data, overlayCargoNumber);
        if (!item) {
          setOverlayCargoItem(null);
          setOverlayCargoNotFound(true);
          return;
        }
        setOverlayCargoItem(item);
        setOverlayCargoNotFound(false);
      })
      .catch(() => {
        if (!cancelled) {
          setOverlayCargoItem(null);
          setOverlayCargoNotFound(true);
        }
      })
      .finally(() => {
        if (!cancelled) setOverlayCargoLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    overlayCargoNumber,
    overlayCargoInn,
    overlayCargoSource,
    activeAccount?.login,
    activeAccount?.password,
    activeAccount?.activeCustomerInn,
    activeAccount?.customers,
    activeAccount?.isRegisteredUser,
  ]);

  const openCargoFromChat = useCallback(
    (cargoNumber: string) => {
      if (!cargoNumber) return;
      const num = String(cargoNumber).trim();
      applySearch(num);
      setContextCargoNumber(num);
      setActiveTab("cargo");
    },
    [applySearch, setActiveTab],
  );

  const openCargoFromDocuments = useCallback(
    (cargoNumber: string) => {
      if (!cargoNumber) return;
      const num = String(cargoNumber).trim();
      try {
        window.localStorage.setItem("haulz.cargo.tableMode", "true");
      } catch {
        // ignore storage errors
      }
      applySearch(num);
      setContextCargoNumber(num);
      setActiveTab("cargo");
    },
    [applySearch, setActiveTab],
  );

  const openClaimFromCargo = useCallback(
    (cargoNumber: string) => {
      const number = String(cargoNumber || "").trim();
      if (!number) return;
      try {
        window.localStorage.setItem("haulz.docs.claims.prefillCargoNumber", number);
      } catch {
        // ignore storage errors
      }
      setActiveTab("docs");
    },
    [setActiveTab],
  );

  const openDocumentsWithSection = useCallback(
    (section: string) => {
      try {
        window.localStorage.setItem("haulz.docs.section", section);
      } catch {
        // ignore
      }
      setActiveTab("docs");
    },
    [setActiveTab],
  );

  const openAisWithMmsi = useCallback(
    (mmsi: string) => {
      if (!mmsi || mmsi.replace(/\D/g, "").length !== 9) return;
      setAisOpenWithMmsi(mmsi);
      setActiveTab("profile");
    },
    [setActiveTab],
  );

  const openCargoInPlace = useCallback((cargoNumber: string, prefetchedOrInn?: CargoItem | string, inn?: string) => {
    if (!cargoNumber) return;
    let prefetched: CargoItem | undefined;
    let innArg = inn;
    if (prefetchedOrInn && typeof prefetchedOrInn === "object" && !Array.isArray(prefetchedOrInn)) {
      prefetched = prefetchedOrInn;
    } else if (typeof prefetchedOrInn === "string") {
      innArg = prefetchedOrInn;
    }
    setOverlayCargoNumber(cargoNumber);
    setOverlayCargoInn(innArg ?? null);
    setOverlayCargoNotFound(false);
    if (prefetched && hasPerevozkaCargoFields(prefetched as Record<string, unknown>)) {
      setOverlayCargoSource("prefetch");
      setOverlayCargoItem(normalizePrefetchedCargoItem(prefetched, cargoNumber));
      setOverlayCargoLoading(false);
      return;
    }
    setOverlayCargoSource("fetch");
    setOverlayCargoItem(null);
  }, []);

  const openInvoiceInPlace = useCallback((invoice: Record<string, unknown>) => {
    if (!invoice || typeof invoice !== "object") return;
    setOverlayInvoice(invoice);
  }, []);

  const openActInPlace = useCallback((act: Record<string, unknown>) => {
    if (!act || typeof act !== "object") return;
    setOverlayAct(act);
  }, []);

  const openCargoWithFilters = useCallback(
    (filters: { status?: StatusFilter; search?: string }) => {
      if (filters.search) {
        applySearch(filters.search);
      }
      setActiveTab("cargo");
    },
    [applySearch, setActiveTab],
  );

  const value = useMemo<AppNavigationContextValue>(
    () => ({
      contextCargoNumber,
      setContextCargoNumber,
      aisOpenWithMmsi,
      setAisOpenWithMmsi,
      openCargoWithFilters,
      openCargoFromChat,
      openCargoFromDocuments,
      openCargoInPlace,
      openInvoiceInPlace,
      openActInPlace,
      openClaimFromCargo,
      openDocumentsWithSection,
      openAisWithMmsi,
    }),
    [
      contextCargoNumber,
      aisOpenWithMmsi,
      openCargoWithFilters,
      openCargoFromChat,
      openCargoFromDocuments,
      openCargoInPlace,
      openInvoiceInPlace,
      openActInPlace,
      openClaimFromCargo,
      openDocumentsWithSection,
      openAisWithMmsi,
    ],
  );

  const docOverlayZIndex = overlayCargoItem ? 10001 : undefined;

  const closeCargoOverlay = () => {
    setOverlayCargoNumber(null);
    setOverlayCargoItem(null);
    setOverlayCargoInn(null);
    setOverlayCargoNotFound(false);
    setOverlayCargoSource("fetch");
  };

  return (
    <AppNavigationContext.Provider value={value}>
      {children}
      {overlayInvoice && activeAccount && (
        <div
          style={
            docOverlayZIndex != null
              ? { position: "fixed", inset: 0, zIndex: docOverlayZIndex }
              : undefined
          }
        >
          <InvoiceDetailModal
            item={overlayInvoice}
            isOpen
            onClose={() => setOverlayInvoice(null)}
            onOpenCargo={(cargoNumber) => openCargoInPlace(cargoNumber)}
            auth={{
              login: activeAccount.login,
              password: activeAccount.password,
              inn: activeAccount.activeCustomerInn ?? undefined,
              ...(activeAccount.isRegisteredUser ? { isRegisteredUser: true } : {}),
            }}
          />
        </div>
      )}
      {overlayAct && activeAccount && (
        <div
          style={
            docOverlayZIndex != null
              ? { position: "fixed", inset: 0, zIndex: docOverlayZIndex }
              : undefined
          }
        >
          <ActDetailModal
            item={overlayAct}
            isOpen
            onClose={() => setOverlayAct(null)}
            onOpenInvoice={(inv) => openInvoiceInPlace(inv)}
            onOpenCargo={(cargoNumber) => openCargoInPlace(cargoNumber)}
            auth={{
              login: activeAccount.login,
              password: activeAccount.password,
              inn: activeAccount.activeCustomerInn ?? undefined,
              ...(activeAccount.isRegisteredUser ? { isRegisteredUser: true } : {}),
            }}
          />
        </div>
      )}
      {overlayCargoNumber && activeAccount && (
        overlayCargoLoading ? (
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 10000,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(0,0,0,0.4)",
            }}
            onClick={closeCargoOverlay}
          >
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: "var(--color-primary)" }} />
          </div>
        ) : overlayCargoNotFound ? (
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 10000,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(0,0,0,0.4)",
            }}
            onClick={closeCargoOverlay}
          >
            <div
              role="dialog"
              aria-labelledby="cargo-not-found-title"
              style={{
                background: "var(--color-bg-card, #fff)",
                borderRadius: 12,
                padding: "1.25rem 1.5rem",
                maxWidth: 320,
                width: "calc(100% - 2rem)",
                boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <p id="cargo-not-found-title" style={{ margin: "0 0 1rem", fontWeight: 600, fontSize: "1rem" }}>
                Перевозка не найдена
              </p>
              <p style={{ margin: "0 0 1rem", color: "var(--color-text-secondary)", fontSize: "0.875rem" }}>
                {overlayCargoNumber ? `№ ${overlayCargoNumber}` : "Проверьте номер перевозки и попробуйте снова."}
              </p>
              <button
                type="button"
                onClick={closeCargoOverlay}
                style={{
                  width: "100%",
                  padding: "0.5rem 1rem",
                  borderRadius: 8,
                  border: "none",
                  background: "var(--color-primary, #3b82f6)",
                  color: "#fff",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Закрыть
              </button>
            </div>
          </div>
        ) : overlayCargoItem ? (
          <div style={{ position: "fixed", inset: 0, zIndex: 10000 }}>
            <CargoDetailsModal
              item={overlayCargoItem}
              isOpen
              onClose={closeCargoOverlay}
              auth={{
                login: activeAccount.login,
                password: activeAccount.password,
                inn: (overlayCargoInn ?? activeAccount.activeCustomerInn ?? undefined) || undefined,
                ...(activeAccount.isRegisteredUser ? { isRegisteredUser: true } : {}),
              }}
              onOpenChat={undefined}
              showSums={activeAccount?.isRegisteredUser ? (activeAccount.financialAccess ?? true) : true}
              useServiceRequest={useServiceRequest}
              isFavorite={(n) => {
                try {
                  const raw = localStorage.getItem("haulz.favorites");
                  const arr = raw ? JSON.parse(raw) : [];
                  return arr.includes(n);
                } catch {
                  return false;
                }
              }}
              onToggleFavorite={(n) => {
                if (!n) return;
                try {
                  const raw = localStorage.getItem("haulz.favorites");
                  const arr = raw ? JSON.parse(raw) : [];
                  const set = new Set(arr);
                  if (set.has(n)) set.delete(n);
                  else set.add(n);
                  localStorage.setItem("haulz.favorites", JSON.stringify([...set]));
                  setOverlayFavVersion((v) => v + 1);
                } catch {
                  /* ignore */
                }
              }}
              onOpenInvoice={openInvoiceInPlace}
              onOpenAct={openActInPlace}
            />
          </div>
        ) : null
      )}
    </AppNavigationContext.Provider>
  );
}
