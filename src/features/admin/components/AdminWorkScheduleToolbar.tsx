import React from "react";
import { Button, Flex, Input, Typography } from "@maxhub/max-ui";
import { Loader2 } from "lucide-react";
import { WORK_SCHEDULE_WEEKDAY_LABELS } from "../lib/workScheduleConstants";
import type { AdminWorkScheduleState } from "../hooks/useAdminWorkSchedule";

type Props = Pick<
  AdminWorkScheduleState,
  | "search"
  | "setSearch"
  | "customerLoading"
  | "fetchCustomers"
  | "loading"
  | "customerList"
  | "selectedInns"
  | "bulkWeekdays"
  | "bulkStart"
  | "setBulkStart"
  | "bulkEnd"
  | "setBulkEnd"
  | "saving"
  | "toggleSelectAllInns"
  | "toggleBulkWeekday"
  | "applyBulkSchedule"
>;

export function AdminWorkScheduleToolbar({
  search,
  setSearch,
  customerLoading,
  fetchCustomers,
  loading,
  customerList,
  selectedInns,
  bulkWeekdays,
  bulkStart,
  setBulkStart,
  bulkEnd,
  setBulkEnd,
  saving,
  toggleSelectAllInns,
  toggleBulkWeekday,
  applyBulkSchedule,
}: Props) {
  return (
    <>
      <Typography.Body style={{ fontWeight: 600, marginBottom: "0.5rem" }}>График работы</Typography.Body>
      <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginBottom: "1rem" }}>
        Рабочие дни и часы заказчика для расчёта SLA. По умолчанию Пн–Пт 09:00–18:00.
      </Typography.Body>
      <Flex gap="0.5rem" align="center" wrap="wrap" style={{ marginBottom: "0.75rem" }}>
        <Input
          type="text"
          placeholder="Поиск по ИНН или наименованию..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="admin-form-input"
          style={{ maxWidth: "22rem" }}
          aria-label="Поиск заказчиков"
        />
        <Button type="button" className="filter-button" onClick={() => fetchCustomers()} disabled={customerLoading}>
          {customerLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Найти"}
        </Button>
      </Flex>
      {loading ? (
        <Flex align="center" gap="0.5rem" style={{ marginBottom: "0.75rem" }}>
          <Loader2 className="w-4 h-4 animate-spin" />
          <Typography.Body>Загрузка графиков...</Typography.Body>
        </Flex>
      ) : null}
      <Flex gap="0.5rem" align="center" wrap="wrap" style={{ marginBottom: "0.5rem" }}>
        <Button
          type="button"
          className="filter-button"
          onClick={() => toggleSelectAllInns(customerList.map((c) => c.inn))}
          disabled={customerList.length === 0}
        >
          {customerList.length > 0 && customerList.every((c) => selectedInns.has(c.inn))
            ? "Снять выделение"
            : "Выделить все"}
        </Button>
      </Flex>
      <Flex gap="0.5rem" align="center" wrap="wrap" style={{ marginBottom: "0.75rem" }}>
        <Typography.Body style={{ fontSize: "0.9rem" }}>Рабочие дни:</Typography.Body>
        {WORK_SCHEDULE_WEEKDAY_LABELS.map(({ value, label }) => (
          <label key={value} style={{ display: "flex", alignItems: "center", gap: "0.25rem", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={bulkWeekdays.includes(value)}
              onChange={() => toggleBulkWeekday(value)}
            />
            <span>{label}</span>
          </label>
        ))}
        <label htmlFor="work-schedule-bulk-start" style={{ fontSize: "0.9rem", whiteSpace: "nowrap" }}>С:</label>
        <input
          id="work-schedule-bulk-start"
          type="time"
          value={bulkStart}
          onChange={(e) => setBulkStart(e.target.value)}
          className="admin-form-input"
          style={{ padding: "0.35rem 0.5rem" }}
        />
        <label htmlFor="work-schedule-bulk-end" style={{ fontSize: "0.9rem", whiteSpace: "nowrap" }}>До:</label>
        <input
          id="work-schedule-bulk-end"
          type="time"
          value={bulkEnd}
          onChange={(e) => setBulkEnd(e.target.value)}
          className="admin-form-input"
          style={{ padding: "0.35rem 0.5rem" }}
        />
        <Button
          type="button"
          className="button-primary"
          disabled={saving || selectedInns.size === 0}
          onClick={() => void applyBulkSchedule()}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" style={{ marginRight: "0.35rem" }} /> : null}
          Применить к выбранным ({selectedInns.size})
        </Button>
      </Flex>
    </>
  );
}
