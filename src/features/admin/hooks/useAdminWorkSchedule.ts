import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchAdminWorkSchedule,
  saveAdminWorkSchedule,
} from "../../../api/client/admin/scheduling";
import { searchAdminCustomers } from "../../../api/client/admin/customers";

export type WorkScheduleItem = {
  inn: string;
  customer_name: string | null;
  days_of_week: number[];
  work_start: string;
  work_end: string;
};

export type WorkScheduleCustomerRow = {
  inn: string;
  customer_name: string;
  email: string;
  days_of_week: number[];
  work_start: string;
  work_end: string;
};

type Params = {
  adminToken: string;
  onError: (msg: string | null) => void;
};

export function useAdminWorkSchedule({ adminToken, onError }: Params) {
  const [items, setItems] = useState<WorkScheduleItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [customerList, setCustomerList] = useState<{ inn: string; customer_name: string; email: string }[]>([]);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [selectedInns, setSelectedInns] = useState<Set<string>>(new Set());
  const [bulkWeekdays, setBulkWeekdays] = useState<number[]>([]);
  const [bulkStart, setBulkStart] = useState("09:00");
  const [bulkEnd, setBulkEnd] = useState("18:00");
  const [saving, setSaving] = useState(false);
  const [savingInn, setSavingInn] = useState<string | null>(null);

  const customerListSorted = useMemo<WorkScheduleCustomerRow[]>(() => {
    return customerList.map((c) => {
      const item = items.find((x) => x.inn === c.inn);
      return {
        ...c,
        days_of_week: item?.days_of_week ?? [1, 2, 3, 4, 5],
        work_start: item?.work_start ?? "09:00",
        work_end: item?.work_end ?? "18:00",
      };
    });
  }, [customerList, items]);

  const fetchSchedule = useCallback(() => {
    if (!adminToken) return;
    setLoading(true);
    fetchAdminWorkSchedule(adminToken)
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
    fetchSchedule();
  }, [fetchSchedule]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

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

  const toggleBulkWeekday = useCallback((value: number) => {
    setBulkWeekdays((prev) =>
      prev.includes(value) ? prev.filter((d) => d !== value) : [...prev, value].sort((a, b) => a - b),
    );
  }, []);

  const applyBulkSchedule = useCallback(async () => {
    if (selectedInns.size === 0) return;
    setSaving(true);
    onError(null);
    try {
      const body: { inns: string[]; days_of_week?: number[]; work_start?: string; work_end?: string } = {
        inns: Array.from(selectedInns),
      };
      if (bulkWeekdays.length > 0) body.days_of_week = bulkWeekdays;
      if (bulkStart) body.work_start = bulkStart;
      if (bulkEnd) body.work_end = bulkEnd;
      if (!body.days_of_week && !body.work_start && !body.work_end) {
        onError("Выберите дни недели и/или укажите часы работы");
        return;
      }
      await saveAdminWorkSchedule(adminToken, body);
      fetchSchedule();
      setSelectedInns(new Set());
    } catch (e: unknown) {
      onError((e as Error)?.message || "Ошибка");
    } finally {
      setSaving(false);
    }
  }, [adminToken, bulkEnd, bulkStart, bulkWeekdays, fetchSchedule, onError, selectedInns]);

  const saveCustomerWeekdays = useCallback(async (inn: string, weekdays: number[]) => {
    setSavingInn(inn);
    onError(null);
    try {
      await saveAdminWorkSchedule(adminToken, { inn, days_of_week: weekdays });
      fetchSchedule();
    } catch (e: unknown) {
      onError((e as Error)?.message || "Ошибка");
    } finally {
      setSavingInn(null);
    }
  }, [adminToken, fetchSchedule, onError]);

  const saveCustomerStart = useCallback(async (inn: string, workStart: string) => {
    setSavingInn(inn);
    onError(null);
    try {
      await saveAdminWorkSchedule(adminToken, { inn, work_start: workStart });
      fetchSchedule();
    } catch (e: unknown) {
      onError((e as Error)?.message || "Ошибка");
    } finally {
      setSavingInn(null);
    }
  }, [adminToken, fetchSchedule, onError]);

  const saveCustomerEnd = useCallback(async (inn: string, workEnd: string) => {
    setSavingInn(inn);
    onError(null);
    try {
      await saveAdminWorkSchedule(adminToken, { inn, work_end: workEnd });
      fetchSchedule();
    } catch (e: unknown) {
      onError((e as Error)?.message || "Ошибка");
    } finally {
      setSavingInn(null);
    }
  }, [adminToken, fetchSchedule, onError]);

  return {
    items,
    loading,
    search,
    setSearch,
    customerList,
    customerLoading,
    customerListSorted,
    selectedInns,
    bulkWeekdays,
    bulkStart,
    setBulkStart,
    bulkEnd,
    setBulkEnd,
    saving,
    savingInn,
    fetchCustomers,
    toggleInnSelection,
    toggleSelectAllInns,
    toggleBulkWeekday,
    applyBulkSchedule,
    saveCustomerWeekdays,
    saveCustomerStart,
    saveCustomerEnd,
  };
}

export type AdminWorkScheduleState = ReturnType<typeof useAdminWorkSchedule>;
