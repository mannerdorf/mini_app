import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchTariffs, type TariffRow } from "../../../api/client/documents";
import { cityToCode } from "../../../lib/formatUtils";
import { formatTariffRouteLabel } from "../views/documentsViewBlocks";

export type TariffsSortColumn =
  | "docDate"
  | "docNumber"
  | "customerName"
  | "route"
  | "transportType"
  | "dangerous"
  | "tariff";

type UseDocumentsTariffsInput = {
  active: boolean;
  effectiveActiveInn?: string;
  effectiveServiceMode: boolean;
};

export function useDocumentsTariffs({
  active,
  effectiveActiveInn,
  effectiveServiceMode,
}: UseDocumentsTariffsInput) {
  const [tariffsList, setTariffsList] = useState<TariffRow[]>([]);
  const [tariffsLoading, setTariffsLoading] = useState(false);
  const [tariffsCustomerFilter, setTariffsCustomerFilter] = useState<string>("");
  const [tariffsCustomerSearchQuery, setTariffsCustomerSearchQuery] = useState<string>("");
  const [tariffsRouteFilter, setTariffsRouteFilter] = useState<string>("all");
  const [tariffsTypeFilter, setTariffsTypeFilter] = useState<string>("all");
  const [tariffsSortColumn, setTariffsSortColumn] = useState<TariffsSortColumn>("docDate");
  const [tariffsSortOrder, setTariffsSortOrder] = useState<"asc" | "desc">("desc");
  const [isTariffsCustomerDropdownOpen, setIsTariffsCustomerDropdownOpen] = useState(false);
  const [isTariffsRouteDropdownOpen, setIsTariffsRouteDropdownOpen] = useState(false);
  const [isTariffsTypeDropdownOpen, setIsTariffsTypeDropdownOpen] = useState(false);

  useEffect(() => {
    if (!active) return;
    setTariffsLoading(true);
    const scope = { inn: effectiveActiveInn, serviceMode: effectiveServiceMode };
    fetchTariffs(scope)
      .then(setTariffsList)
      .finally(() => setTariffsLoading(false));
  }, [active, effectiveActiveInn, effectiveServiceMode]);

  useEffect(() => {
    if (effectiveServiceMode) return;
    setTariffsCustomerFilter("");
    setTariffsCustomerSearchQuery("");
    setIsTariffsCustomerDropdownOpen(false);
  }, [effectiveServiceMode]);

  const filteredTariffs = useMemo(() => {
    const placeCode = (value: string) => cityToCode(value || "") || value || "";
    const allowedRoutes = new Set(["MSK – KGD", "KGD – MSK"]);
    const list = tariffsList.filter((t) => {
      if (t.isVet) return false;
      if (effectiveServiceMode && tariffsCustomerFilter && String(t.customerName || "").trim() !== tariffsCustomerFilter) {
        return false;
      }
      const route = formatTariffRouteLabel(t.cityFrom, t.cityTo);
      if (!allowedRoutes.has(route)) return false;
      if (tariffsRouteFilter !== "all" && route !== tariffsRouteFilter) return false;
      if (tariffsTypeFilter !== "all" && String(t.transportType || "").trim() !== tariffsTypeFilter) return false;
      return true;
    });

    const getVal = (t: TariffRow) => {
      switch (tariffsSortColumn) {
        case "docDate":
          return t.docDate ? new Date(t.docDate).getTime() : 0;
        case "docNumber":
          return t.docNumber || "";
        case "customerName":
          return t.customerName || "";
        case "route":
          return formatTariffRouteLabel(t.cityFrom, t.cityTo);
        case "transportType":
          return t.transportType || "";
        case "dangerous":
          return t.isDangerous ? 1 : 0;
        case "tariff":
          return Number(t.tariff ?? 0);
        default:
          return "";
      }
    };

    const sorted = [...list].sort((a, b) => {
      const va = getVal(a);
      const vb = getVal(b);
      const cmp =
        typeof va === "number" && typeof vb === "number"
          ? va - vb
          : String(va).localeCompare(String(vb), "ru", { numeric: true });
      return tariffsSortOrder === "asc" ? cmp : -cmp;
    });

    const seen = new Set<string>();
    const collapsed: TariffRow[] = [];
    for (const t of sorted) {
      const key = [
        placeCode(t.cityFrom || ""),
        placeCode(t.cityTo || ""),
        String(t.transportType || "").trim().toLowerCase(),
        t.isDangerous ? "1" : "0",
        Number(t.tariff ?? 0).toFixed(4),
      ].join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      collapsed.push(t);
    }
    return collapsed;
  }, [
    tariffsList,
    effectiveServiceMode,
    tariffsCustomerFilter,
    tariffsRouteFilter,
    tariffsTypeFilter,
    tariffsSortColumn,
    tariffsSortOrder,
  ]);

  const uniqueTariffsCustomers = useMemo(
    () =>
      [...new Set(tariffsList.map((t) => String(t.customerName || "").trim()).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, "ru")
      ),
    [tariffsList]
  );

  const uniqueTariffsRoutes = useMemo(() => {
    const allowedRoutes = new Set(["MSK – KGD", "KGD – MSK"]);
    const set = new Set<string>();
    tariffsList.forEach((t) => {
      if (t.isVet) return;
      const route = formatTariffRouteLabel(t.cityFrom, t.cityTo);
      if (allowedRoutes.has(route)) set.add(route);
    });
    return [...set].sort((a, b) => a.localeCompare(b, "ru"));
  }, [tariffsList]);

  const uniqueTariffsTypes = useMemo(() => {
    const set = new Set<string>();
    tariffsList.forEach((t) => {
      if (t.isVet) return;
      const type = String(t.transportType || "").trim();
      if (type) set.add(type);
    });
    return [...set].sort((a, b) => a.localeCompare(b, "ru"));
  }, [tariffsList]);

  const closeTariffsDropdowns = useCallback(() => {
    setIsTariffsCustomerDropdownOpen(false);
    setIsTariffsRouteDropdownOpen(false);
    setIsTariffsTypeDropdownOpen(false);
  }, []);

  return {
    tariffsList,
    tariffsLoading,
    filteredTariffs,
    uniqueTariffsCustomers,
    uniqueTariffsRoutes,
    uniqueTariffsTypes,
    tariffsCustomerFilter,
    setTariffsCustomerFilter,
    tariffsCustomerSearchQuery,
    setTariffsCustomerSearchQuery,
    tariffsRouteFilter,
    setTariffsRouteFilter,
    tariffsTypeFilter,
    setTariffsTypeFilter,
    tariffsSortColumn,
    setTariffsSortColumn,
    tariffsSortOrder,
    setTariffsSortOrder,
    isTariffsCustomerDropdownOpen,
    setIsTariffsCustomerDropdownOpen,
    isTariffsRouteDropdownOpen,
    setIsTariffsRouteDropdownOpen,
    isTariffsTypeDropdownOpen,
    setIsTariffsTypeDropdownOpen,
    closeTariffsDropdowns,
  };
}
