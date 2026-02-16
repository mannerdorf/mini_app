import type { CargoItem } from "../types";
import type { StatusFilter } from "../types";
import {
  isReceivedInfoStatus,
  getPaymentFilterKey,
  getFilterKeyByStatus,
} from "../lib/statusUtils";
import { cityToCode, formatCurrency } from "../lib/formatUtils";
import { formatDate } from "../lib/dateUtils";

type CargoStatusFilterKey = Exclude<StatusFilter, "all" | "favorites">;

export type CargoFilterPipelineParams = {
  items: CargoItem[];
  searchText: string;
  statusFilterSet: Set<CargoStatusFilterKey>;
  senderFilter: string;
  receiverFilter: string;
  useServiceRequest: boolean;
  billStatusFilterSet: Set<
    "paid" | "unpaid" | "partial" | "cancelled" | "unknown"
  >;
  typeFilterSet: Set<"ferry" | "auto">;
  routeFilterSet: Set<"MSK-KGD" | "KGD-MSK">;
  sortBy: "datePrih" | "dateVr" | null;
  sortOrder: "asc" | "desc";
};

const parseDateSafe = (dateString: string | undefined): number | null => {
  if (!dateString) return null;

  const str = String(dateString).trim();
  if (!str || str === "-" || str === "") return null;

  try {
    const cleanStr = str.split("T")[0].trim();
    let date = new Date(cleanStr);
    if (!isNaN(date.getTime())) return date.getTime();

    const dotParts = cleanStr.split(".");
    if (dotParts.length === 3) {
      const day = parseInt(dotParts[0], 10);
      const month = parseInt(dotParts[1], 10) - 1;
      const year = parseInt(dotParts[2], 10);
      if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
        date = new Date(year, month, day);
        if (!isNaN(date.getTime())) return date.getTime();
      }
    }

    const slashParts = cleanStr.split("/");
    if (slashParts.length === 3) {
      const day = parseInt(slashParts[0], 10);
      const month = parseInt(slashParts[1], 10) - 1;
      const year = parseInt(slashParts[2], 10);
      if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
        date = new Date(year, month, day);
        if (!isNaN(date.getTime())) return date.getTime();
      }
    }

    const dashParts = cleanStr.split("-");
    if (dashParts.length === 3 && dashParts[0].length <= 2) {
      const day = parseInt(dashParts[0], 10);
      const month = parseInt(dashParts[1], 10) - 1;
      const year = parseInt(dashParts[2], 10);
      if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
        date = new Date(year, month, day);
        if (!isNaN(date.getTime())) return date.getTime();
      }
    }
  } catch {
    return null;
  }

  return null;
};

export function buildFilteredCargoItems(
  params: CargoFilterPipelineParams
): CargoItem[] {
  const {
    items,
    searchText,
    statusFilterSet,
    senderFilter,
    receiverFilter,
    useServiceRequest,
    billStatusFilterSet,
    typeFilterSet,
    routeFilterSet,
    sortBy,
    sortOrder,
  } = params;

  let res = items.filter((i) => !isReceivedInfoStatus(i.State));

  if (searchText) {
    const lower = searchText.toLowerCase();
    const searchable = (i: CargoItem) =>
      [
        i.Number,
        i.State,
        i.Sender,
        i.Customer,
        i.Receiver ?? (i as { receiver?: string }).receiver,
        formatDate(i.DatePrih),
        formatCurrency(i.Sum),
        String(i.PW),
        String(i.Mest),
        String((i as { Order?: string }).Order ?? ""),
        cityToCode(i.CitySender),
        cityToCode(i.CityReceiver),
        i.StateBill,
      ].join(" ");
    res = res.filter((i) => searchable(i).toLowerCase().includes(lower));
  }

  if (statusFilterSet.size > 0) {
    res = res.filter((i) =>
      statusFilterSet.has(getFilterKeyByStatus(i.State) as CargoStatusFilterKey)
    );
  }

  if (senderFilter) {
    res = res.filter((i) => (i.Sender ?? "").trim() === senderFilter);
  }
  if (receiverFilter) {
    res = res.filter(
      (i) =>
        (i.Receiver ?? (i as { receiver?: string }).receiver ?? "").trim() ===
        receiverFilter
    );
  }
  if (useServiceRequest && billStatusFilterSet.size > 0) {
    res = res.filter((i) => billStatusFilterSet.has(getPaymentFilterKey(i.StateBill)));
  }
  if (typeFilterSet.size > 0) {
    res = res.filter((i) => {
      const isFerry =
        i?.AK === true || i?.AK === "true" || i?.AK === "1" || i?.AK === 1;
      return (
        (typeFilterSet.has("ferry") && isFerry) ||
        (typeFilterSet.has("auto") && !isFerry)
      );
    });
  }
  if (routeFilterSet.size > 0) {
    res = res.filter((i) => {
      const mskKgd =
        cityToCode(i.CitySender) === "MSK" && cityToCode(i.CityReceiver) === "KGD";
      const kgdMsk =
        cityToCode(i.CitySender) === "KGD" && cityToCode(i.CityReceiver) === "MSK";
      return (
        (routeFilterSet.has("MSK-KGD") && mskKgd) ||
        (routeFilterSet.has("KGD-MSK") && kgdMsk)
      );
    });
  }

  if (sortBy) {
    res = [...res].sort((a, b) => {
      let timestampA: number | null = null;
      let timestampB: number | null = null;

      if (sortBy === "datePrih") {
        timestampA = parseDateSafe(a.DatePrih);
        timestampB = parseDateSafe(b.DatePrih);
      } else if (sortBy === "dateVr") {
        timestampA = parseDateSafe(a.DateVr);
        timestampB = parseDateSafe(b.DateVr);
      }

      if (timestampA === null && timestampB === null) return 0;
      if (timestampA === null) return 1;
      if (timestampB === null) return -1;

      const diff = timestampA - timestampB;
      if (diff === 0) return 0;
      return sortOrder === "asc" ? diff : -diff;
    });
  }

  return res;
}

export function buildCargoSummary(filteredItems: CargoItem[]) {
  const totalSum = filteredItems.reduce((acc, item) => {
    const sum = typeof item.Sum === "string" ? parseFloat(item.Sum) || 0 : item.Sum || 0;
    return acc + sum;
  }, 0);

  const totalMest = filteredItems.reduce((acc, item) => {
    const mest = typeof item.Mest === "string" ? parseFloat(item.Mest) || 0 : item.Mest || 0;
    return acc + mest;
  }, 0);

  const totalPW = filteredItems.reduce((acc, item) => {
    const pw = typeof item.PW === "string" ? parseFloat(item.PW) || 0 : item.PW || 0;
    return acc + pw;
  }, 0);

  const totalW = filteredItems.reduce((acc, item) => {
    const w = typeof item.W === "string" ? parseFloat(item.W) || 0 : item.W || 0;
    return acc + w;
  }, 0);

  const totalValue = filteredItems.reduce((acc, item) => {
    const v = typeof item.Value === "string" ? parseFloat(item.Value) || 0 : item.Value || 0;
    return acc + v;
  }, 0);

  return { sum: totalSum, mest: totalMest, pw: totalPW, w: totalW, vol: totalValue };
}

export type CargoGroupedRow = {
  customer: string;
  items: CargoItem[];
  sum: number;
  mest: number;
  pw: number;
  w: number;
  vol: number;
};

export function buildGroupedByCustomer(filteredItems: CargoItem[]): CargoGroupedRow[] {
  const map = new Map<string, CargoGroupedRow>();

  filteredItems.forEach((item) => {
    const key = (item.Customer ?? (item as { customer?: string }).customer ?? "").trim() || "—";
    const existing = map.get(key);
    const sum = typeof item.Sum === "string" ? parseFloat(item.Sum) || 0 : item.Sum || 0;
    const mest = typeof item.Mest === "string" ? parseFloat(item.Mest) || 0 : item.Mest || 0;
    const pw = typeof item.PW === "string" ? parseFloat(item.PW) || 0 : item.PW || 0;
    const w = typeof item.W === "string" ? parseFloat(item.W) || 0 : item.W || 0;
    const vol = typeof item.Value === "string" ? parseFloat(item.Value) || 0 : item.Value || 0;

    if (existing) {
      existing.items.push(item);
      existing.sum += sum;
      existing.mest += mest;
      existing.pw += pw;
      existing.w += w;
      existing.vol += vol;
    } else {
      map.set(key, { customer: key, items: [item], sum, mest, pw, w, vol });
    }
  });

  return Array.from(map.values());
}

export function sortGroupedByCustomer(
  groupedByCustomer: CargoGroupedRow[],
  tableSortColumn: "customer" | "sum" | "mest" | "pw" | "w" | "vol" | "count",
  tableSortOrder: "asc" | "desc",
  normalizeCustomer: (value: string) => string
) {
  const keyOf = (row: CargoGroupedRow) => {
    switch (tableSortColumn) {
      case "customer":
        return (normalizeCustomer(row.customer) || "").toLowerCase();
      case "sum":
        return row.sum;
      case "mest":
        return row.mest;
      case "pw":
        return row.pw;
      case "w":
        return row.w;
      case "vol":
        return row.vol;
      case "count":
        return row.items.length;
      default:
        return (normalizeCustomer(row.customer) || "").toLowerCase();
    }
  };

  return [...groupedByCustomer].sort((a, b) => {
    const va = keyOf(a);
    const vb = keyOf(b);
    const cmp =
      typeof va === "number" && typeof vb === "number"
        ? va - vb
        : String(va).localeCompare(String(vb));
    return tableSortOrder === "asc" ? cmp : -cmp;
  });
}
