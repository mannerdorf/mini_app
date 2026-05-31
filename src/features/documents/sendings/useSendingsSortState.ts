import { useCallback, useState } from "react";

export type SendingsSortColumn =
  | "date"
  | "number"
  | "route"
  | "type"
  | "transitHours"
  | "vehicle"
  | "comment"
  | "paidWeight"
  | "cost"
  | "declaredCost";

export type SendingsSummarySortColumn =
  | "index"
  | "cargo"
  | "status"
  | "count"
  | "volume"
  | "weight"
  | "paidWeight"
  | "customer"
  | "density";

export function useSendingsSortState() {
  const [sendingsSortColumn, setSendingsSortColumn] = useState<SendingsSortColumn>("date");
  const [sendingsSortOrder, setSendingsSortOrder] = useState<"asc" | "desc">("desc");
  const [sendingsSummarySortColumn, setSendingsSummarySortColumn] =
    useState<SendingsSummarySortColumn>("index");
  const [sendingsSummarySortOrder, setSendingsSummarySortOrder] = useState<"asc" | "desc">("asc");

  const handleSendingsSort = useCallback(
    (column: SendingsSortColumn) => {
      if (sendingsSortColumn === column) {
        setSendingsSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
        return;
      }
      setSendingsSortColumn(column);
      setSendingsSortOrder(column === "date" ? "desc" : "asc");
    },
    [sendingsSortColumn],
  );

  const handleSendingsSummarySort = useCallback(
    (column: SendingsSummarySortColumn) => {
      if (sendingsSummarySortColumn === column) {
        setSendingsSummarySortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
        return;
      }
      setSendingsSummarySortColumn(column);
      setSendingsSummarySortOrder(column === "index" ? "asc" : "desc");
    },
    [sendingsSummarySortColumn],
  );

  return {
    sendingsSortColumn,
    sendingsSortOrder,
    sendingsSummarySortColumn,
    sendingsSummarySortOrder,
    handleSendingsSort,
    handleSendingsSummarySort,
  };
}
