import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Flex } from "@maxhub/max-ui";
import { HaulzDispatchSummary } from "./HaulzDispatchSummary";
import * as dateUtils from "../lib/dateUtils";
import type { CargoItem } from "../types";
import type { KeyedMutator } from "swr";

const MONTH_NAMES = dateUtils.MONTH_NAMES;

/**
 * Сводка «Выдача грузов» для CMS: те же плитки, что в приложении, данные из кэша перевозок (как у суперадмина).
 */
export function AdminHaulzDispatchSection({ adminToken }: { adminToken: string }) {
  const [period, setPeriod] = useState(() => {
    const n = new Date();
    return { year: n.getFullYear(), month: n.getMonth() + 1 };
  });

  const dateRange = useMemo(() => {
    const { year, month } = period;
    const lastDay = new Date(year, month, 0).getDate();
    return {
      dateFrom: `${year}-${String(month).padStart(2, "0")}-01`,
      dateTo: `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
    };
  }, [period.month, period.year]);

  const yearOptions = useMemo(() => {
    const nowYear = new Date().getFullYear();
    const years = new Set<number>([nowYear - 2, nowYear - 1, nowYear, nowYear + 1, period.year]);
    return Array.from(years).sort((a, b) => b - a);
  }, [period.year]);

  const [items, setItems] = useState<CargoItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadItems = useCallback(async (): Promise<CargoItem[]> => {
    if (!adminToken) return [];
    const res = await fetch("/api/perevozki", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        adminToken,
        dateFrom: dateRange.dateFrom,
        dateTo: dateRange.dateTo,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = typeof (data as { error?: string })?.error === "string" ? (data as { error: string }).error : "Ошибка загрузки перевозок";
      throw new Error(msg);
    }
    if (Array.isArray(data)) return data as CargoItem[];
    const rawItems = (data as { items?: CargoItem[] })?.items;
    return Array.isArray(rawItems) ? rawItems : [];
  }, [adminToken, dateRange.dateFrom, dateRange.dateTo]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadItems()
      .then((list) => {
        if (!cancelled) setItems(list);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError((e as Error)?.message || "Ошибка загрузки");
          setItems([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadItems]);

  const mutatePerevozki = useCallback(
    (async (data?: CargoItem[], opts?: { revalidate?: boolean }) => {
      if (Array.isArray(data)) {
        setItems(data);
        return data;
      }
      if (opts?.revalidate === false) return items;
      try {
        const list = await loadItems();
        setItems(list);
        return list;
      } catch {
        return undefined;
      }
    }) as KeyedMutator<CargoItem[]>,
    [items, loadItems]
  );

  return (
    <div>
      <Flex align="center" gap="0.5rem" wrap="wrap" style={{ marginBottom: "0.75rem" }}>
        <select
          className="admin-form-input"
          value={period.month}
          onChange={(e) => {
            const month = Number(e.target.value);
            if (!Number.isFinite(month) || month < 1 || month > 12) return;
            setPeriod((prev) => ({ ...prev, month }));
          }}
          style={{ padding: "0 0.5rem", minWidth: "10rem" }}
          aria-label="Месяц выборки перевозок"
        >
          {MONTH_NAMES.map((name, idx) => (
            <option key={`admin-haulz-month-${idx + 1}`} value={idx + 1}>
              {name.charAt(0).toUpperCase() + name.slice(1)}
            </option>
          ))}
        </select>
        <select
          className="admin-form-input"
          value={period.year}
          onChange={(e) => {
            const year = Number(e.target.value);
            if (!Number.isFinite(year)) return;
            setPeriod((prev) => ({ ...prev, year }));
          }}
          style={{ padding: "0 0.5rem", minWidth: "6.5rem" }}
          aria-label="Год выборки перевозок"
        >
          {yearOptions.map((year) => (
            <option key={`admin-haulz-year-${year}`} value={year}>
              {year}
            </option>
          ))}
        </select>
      </Flex>

      <HaulzDispatchSummary
        auth={{ login: "", password: "" }}
        useServiceRequest
        onOpenCargo={() => {}}
        perevozkiItems={items}
        perevozkiLoading={loading}
        perevozkiError={error}
        perevozkiMutate={mutatePerevozki}
        showRefreshButton
        title="Выдача грузов"
        subtitle="Плитки и таблица по кэшу перевозок за выбранный месяц (без учётных данных 1С). Раскрытие таймлайна статусов в админке не поддерживается."
      />
    </div>
  );
}
