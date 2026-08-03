import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchAdminPaymentCalendar,
  saveAdminPaymentCalendar,
} from "../../../api/client/admin/scheduling";
import { searchAdminCustomers } from "../../../api/client/admin/customers";

export type PaymentCalendarItem = {
  inn: string;
  customer_name: string | null;
  days_to_pay: number;
  payment_weekdays: number[];
};

export type PaymentCalendarCustomer = {
  inn: string;
  customer_name: string;
  email: string;
};

export type PaymentCalendarSortColumn = "inn" | "customer_name" | "days_to_pay" | null;

type UseAdminPaymentCalendarParams = {
  adminToken: string;
  onError: (msg: string | null) => void;
};

function sortPaymentRows<T extends { inn: string; customer_name?: string | null; days_to_pay?: number; days?: number | null }>(
  rows: T[],
  column: PaymentCalendarSortColumn,
  dir: "asc" | "desc",
  daysKey: "days_to_pay" | "days",
): T[] {
  if (!column) return rows;
  return [...rows].sort((a, b) => {
    let va: string | number | null;
    let vb: string | number | null;
    if (column === "inn") {
      va = a.inn;
      vb = b.inn;
    } else if (column === "customer_name") {
      va = a.customer_name || "";
      vb = b.customer_name || "";
    } else {
      va = daysKey === "days_to_pay" ? (a.days_to_pay ?? -1) : (a.days ?? -1);
      vb = daysKey === "days_to_pay" ? (b.days_to_pay ?? -1) : (b.days ?? -1);
    }
    const cmp = String(va).localeCompare(String(vb), undefined, { numeric: true });
    return dir === "asc" ? cmp : -cmp;
  });
}

export function useAdminPaymentCalendar({ adminToken, onError }: UseAdminPaymentCalendarParams) {
  const [items, setItems] = useState<PaymentCalendarItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [customerList, setCustomerList] = useState<PaymentCalendarCustomer[]>([]);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [selectedInns, setSelectedInns] = useState<Set<string>>(new Set());
  const [daysInput, setDaysInput] = useState("14");
  const [saving, setSaving] = useState(false);
  const [savingInn, setSavingInn] = useState<string | null>(null);
  const [bulkWeekdays, setBulkWeekdays] = useState<number[]>([]);
  const [sortColumn, setSortColumn] = useState<PaymentCalendarSortColumn>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const customerListSorted = useMemo(() => {
    const withDays = customerList.map((c) => {
      const item = items.find((x) => x.inn === c.inn);
      return {
        ...c,
        days: item?.days_to_pay ?? null,
        payment_weekdays: item?.payment_weekdays ?? [],
      };
    });
    return sortPaymentRows(withDays, sortColumn, sortDir, "days");
  }, [customerList, items, sortColumn, sortDir]);

  const itemsSorted = useMemo(
    () => sortPaymentRows(items, sortColumn, sortDir, "days_to_pay"),
    [items, sortColumn, sortDir],
  );

  const fetchCalendar = useCallback(() => {
    if (!adminToken) return;
    setLoading(true);
    fetchAdminPaymentCalendar(adminToken)
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [adminToken]);

  const fetchCustomers = useCallback(() => {
    if (!adminToken) return;
    setCustomerLoading(true);
    searchAdminCustomers(adminToken, { q: search, limit: 500 })
      .then(setCustomerList)
      .catch(() => setCustomerList([]))
      .finally(() => setCustomerLoading(false));
  }, [adminToken, search]);

  useEffect(() => {
    fetchCalendar();
  }, [fetchCalendar]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  const toggleSort = useCallback((column: Exclude<PaymentCalendarSortColumn, null>) => {
    setSortDir((prev) => (sortColumn === column ? (prev === "asc" ? "desc" : "asc") : "asc"));
    setSortColumn(column);
  }, [sortColumn]);

  const toggleInnSelection = useCallback((inn: string) => {
    setSelectedInns((prev) => {
      const next = new Set(prev);
      if (next.has(inn)) next.delete(inn);
      else next.add(inn);
      return next;
    });
  }, []);

  const toggleSelectAllInns = useCallback((inns: string[]) => {
    setSelectedInns((prev) => {
      const allSelected = inns.length > 0 && inns.every((inn) => prev.has(inn));
      if (allSelected) {
        const next = new Set(prev);
        inns.forEach((inn) => next.delete(inn));
        return next;
      }
      return new Set([...prev, ...inns]);
    });
  }, []);

  const applyBulkDays = useCallback(async () => {
    const days = Math.max(0, Math.min(365, parseInt(daysInput, 10) || 0));
    if (selectedInns.size === 0) return;
    setSaving(true);
    onError(null);
    try {
      await saveAdminPaymentCalendar(adminToken, { inns: Array.from(selectedInns), days_to_pay: days });
      fetchCalendar();
      setSelectedInns(new Set());
    } catch (e: unknown) {
      onError((e as Error)?.message || "Ошибка");
    } finally {
      setSaving(false);
    }
  }, [adminToken, daysInput, fetchCalendar, onError, selectedInns]);

  const applyBulkWeekdays = useCallback(async () => {
    if (selectedInns.size === 0 || bulkWeekdays.length === 0) return;
    setSaving(true);
    onError(null);
    try {
      await saveAdminPaymentCalendar(adminToken, {
        inns: Array.from(selectedInns),
        payment_weekdays: bulkWeekdays,
      });
      setItems((prev) => {
        const next = new Map(prev.map((p) => [p.inn, { ...p }]));
        for (const inn of selectedInns) {
          const cur = next.get(inn);
          next.set(inn, {
            inn,
            customer_name: cur?.customer_name ?? null,
            days_to_pay: cur?.days_to_pay ?? 0,
            payment_weekdays: [...bulkWeekdays],
          });
        }
        return Array.from(next.values());
      });
      fetchCalendar();
    } catch (e: unknown) {
      onError((e as Error)?.message || "Ошибка");
    } finally {
      setSaving(false);
    }
  }, [adminToken, bulkWeekdays, fetchCalendar, onError, selectedInns]);

  const saveCustomerDays = useCallback(async (inn: string, days: number) => {
    setSavingInn(inn);
    onError(null);
    try {
      await saveAdminPaymentCalendar(adminToken, { inn, days_to_pay: days });
      fetchCalendar();
    } catch (e: unknown) {
      onError((e as Error)?.message || "Ошибка");
    } finally {
      setSavingInn(null);
    }
  }, [adminToken, fetchCalendar, onError]);

  const saveCustomerWeekdays = useCallback(async (inn: string, weekdays: number[]) => {
    setSavingInn(inn);
    onError(null);
    try {
      await saveAdminPaymentCalendar(adminToken, { inn, payment_weekdays: weekdays });
      fetchCalendar();
    } catch (e: unknown) {
      onError((e as Error)?.message || "Ошибка");
    } finally {
      setSavingInn(null);
    }
  }, [adminToken, fetchCalendar, onError]);

  const toggleBulkWeekday = useCallback((value: number) => {
    setBulkWeekdays((prev) =>
      prev.includes(value) ? prev.filter((d) => d !== value) : [...prev, value].sort((a, b) => a - b),
    );
  }, []);

  return {
    items,
    loading,
    search,
    setSearch,
    customerList,
    customerLoading,
    customerListSorted,
    itemsSorted,
    selectedInns,
    daysInput,
    setDaysInput,
    saving,
    savingInn,
    bulkWeekdays,
    sortColumn,
    sortDir,
    fetchCustomers,
    toggleSort,
    toggleInnSelection,
    toggleSelectAllInns,
    applyBulkDays,
    applyBulkWeekdays,
    saveCustomerDays,
    saveCustomerWeekdays,
    toggleBulkWeekday,
  };
}

export type AdminPaymentCalendarState = ReturnType<typeof useAdminPaymentCalendar>;
