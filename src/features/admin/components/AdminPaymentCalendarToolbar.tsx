import React from "react";
import { Button, Flex, Input, Typography } from "@maxhub/max-ui";
import { Loader2 } from "lucide-react";
import { PAYMENT_DAYS_OPTIONS, PAYMENT_WEEKDAY_LABELS } from "../lib/paymentCalendarConstants";
import type { AdminPaymentCalendarState } from "../hooks/useAdminPaymentCalendar";

type Props = Pick<
  AdminPaymentCalendarState,
  | "search"
  | "setSearch"
  | "customerLoading"
  | "fetchCustomers"
  | "loading"
  | "daysInput"
  | "setDaysInput"
  | "saving"
  | "selectedInns"
  | "bulkWeekdays"
  | "customerList"
  | "toggleSelectAllInns"
  | "applyBulkDays"
  | "applyBulkWeekdays"
  | "toggleBulkWeekday"
>;

export function AdminPaymentCalendarToolbar({
  search,
  setSearch,
  customerLoading,
  fetchCustomers,
  loading,
  daysInput,
  setDaysInput,
  saving,
  selectedInns,
  bulkWeekdays,
  customerList,
  toggleSelectAllInns,
  applyBulkDays,
  applyBulkWeekdays,
  toggleBulkWeekday,
}: Props) {
  return (
    <>
      <Typography.Body style={{ fontWeight: 600, marginBottom: "0.5rem" }}>Платёжный календарь</Typography.Body>
      <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginBottom: "1rem" }}>
        Срок оплаты — в календарных днях с момента выставления счёта. Можно задать платёжные дни недели (например вторник и четверг): при наступлении срока оплата планируется на первый из этих дней. Если платёжные дни не заданы — на первый рабочий день.
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
              <Typography.Body>Загрузка условий...</Typography.Body>
            </Flex>
          ) : null}
          <Flex gap="0.75rem" align="center" wrap="wrap" style={{ marginBottom: "0.75rem" }}>
            <label htmlFor="payment-calendar-days" style={{ fontSize: "0.9rem", whiteSpace: "nowrap" }}>Срок оплаты (календарных дней с момента выставления счёта):</label>
            <input
              id="payment-calendar-days"
              type="number"
              min={0}
              max={365}
              value={daysInput}
              onChange={(e) => setDaysInput(e.target.value)}
              className="admin-form-input"
              style={{ width: "5rem", padding: "0.35rem 0.5rem" }}
              aria-label="Срок в календарных днях (не день недели)"
            />
            <Flex gap="0.25rem" wrap="wrap" align="center">
              {PAYMENT_DAYS_OPTIONS.filter((d) => d > 0).map((d) => (
                <Button
                  key={d}
                  type="button"
                  className="filter-button"
                  style={{ padding: "0.25rem 0.5rem", minWidth: "2.5rem" }}
                  onClick={() => setDaysInput(String(d))}
                >
                  {d}
                </Button>
              ))}
            </Flex>
            <Button
              type="button"
              className="button-primary"
              disabled={saving || selectedInns.size === 0}
              onClick={() => void applyBulkDays()}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" style={{ marginRight: "0.35rem" }} /> : null}
              Применить к выбранным ({selectedInns.size})
            </Button>
          </Flex>
          <Flex align="center" gap="0.5rem" style={{ marginBottom: "0.5rem" }}>
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
          <Flex gap="0.5rem" align="center" wrap="wrap" style={{ marginBottom: "0.5rem" }}>
            <Typography.Body style={{ fontSize: "0.9rem" }}>Платежные дни недели (при наступлении срока — первый из этих дней):</Typography.Body>
            {PAYMENT_WEEKDAY_LABELS.map(({ value, label }) => (
              <label key={value} style={{ display: "flex", alignItems: "center", gap: "0.25rem", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={bulkWeekdays.includes(value)}
                  onChange={() => toggleBulkWeekday(value)}
                />
                <span>{label}</span>
              </label>
            ))}
            <Button
              type="button"
              className="filter-button"
              disabled={saving || selectedInns.size === 0 || bulkWeekdays.length === 0}
              onClick={() => void applyBulkWeekdays()}
            >
              Применить к выбранным
            </Button>
          </Flex>
    </>
  );
}
