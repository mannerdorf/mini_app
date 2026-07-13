import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Button, Flex, Panel, Typography, Input } from "@maxhub/max-ui";
import { Loader2, ChevronDown, ChevronUp } from "lucide-react";
import {
  fetchAdminPaymentCalendar,
  saveAdminPaymentCalendar,
} from "../../../api/client/admin/scheduling";
import { searchAdminCustomers } from "../../../api/client/admin/customers";
import { PAYMENT_DAYS_OPTIONS, PAYMENT_WEEKDAY_LABELS } from "../lib/paymentCalendarConstants";

type AdminPaymentCalendarTabProps = {
  adminToken: string;
  onError: (msg: string | null) => void;
};

export function AdminPaymentCalendarTab({ adminToken, onError }: AdminPaymentCalendarTabProps) {
  const [paymentCalendarItems, setPaymentCalendarItems] = useState<{ inn: string; customer_name: string | null; days_to_pay: number; payment_weekdays: number[] }[]>([]);
  const [paymentCalendarLoading, setPaymentCalendarLoading] = useState(false);
  const [paymentCalendarSearch, setPaymentCalendarSearch] = useState("");
  const [paymentCalendarCustomerList, setPaymentCalendarCustomerList] = useState<{ inn: string; customer_name: string; email: string }[]>([]);
  const [paymentCalendarCustomerLoading, setPaymentCalendarCustomerLoading] = useState(false);
  const [paymentCalendarSelectedInns, setPaymentCalendarSelectedInns] = useState<Set<string>>(new Set());
  const [paymentCalendarDaysInput, setPaymentCalendarDaysInput] = useState<string>("14");
  const [paymentCalendarSaving, setPaymentCalendarSaving] = useState(false);
  const [paymentCalendarSavingInn, setPaymentCalendarSavingInn] = useState<string | null>(null);
  const [paymentCalendarBulkWeekdays, setPaymentCalendarBulkWeekdays] = useState<number[]>([]);
  const [paymentCalendarSortColumn, setPaymentCalendarSortColumn] = useState<"inn" | "customer_name" | "days_to_pay" | null>(null);
  const [paymentCalendarSortDir, setPaymentCalendarSortDir] = useState<"asc" | "desc">("asc");

  const paymentCalendarCustomerListSorted = useMemo(() => {
    const withDays = paymentCalendarCustomerList.map((c) => {
      const item = paymentCalendarItems.find((x) => x.inn === c.inn);
      return {
        ...c,
        days: item?.days_to_pay ?? null,
        payment_weekdays: item?.payment_weekdays ?? [],
      };
    });
    if (!paymentCalendarSortColumn) return withDays;
    return [...withDays].sort((a, b) => {
      let va: string | number | null;
      let vb: string | number | null;
      if (paymentCalendarSortColumn === "inn") {
        va = a.inn;
        vb = b.inn;
      } else if (paymentCalendarSortColumn === "customer_name") {
        va = a.customer_name || "";
        vb = b.customer_name || "";
      } else {
        va = a.days ?? -1;
        vb = b.days ?? -1;
      }
      const cmp = String(va).localeCompare(String(vb), undefined, { numeric: true });
      return paymentCalendarSortDir === "asc" ? cmp : -cmp;
    });
  }, [paymentCalendarCustomerList, paymentCalendarItems, paymentCalendarSortColumn, paymentCalendarSortDir]);
  const paymentCalendarItemsSorted = useMemo(() => {
    if (!paymentCalendarSortColumn) return paymentCalendarItems;
    return [...paymentCalendarItems].sort((a, b) => {
      let va: string | number;
      let vb: string | number;
      if (paymentCalendarSortColumn === "inn") {
        va = a.inn;
        vb = b.inn;
      } else if (paymentCalendarSortColumn === "customer_name") {
        va = a.customer_name || "";
        vb = b.customer_name || "";
      } else {
        va = a.days_to_pay;
        vb = b.days_to_pay;
      }
      const cmp = String(va).localeCompare(String(vb), undefined, { numeric: true });
      return paymentCalendarSortDir === "asc" ? cmp : -cmp;
    });
  }, [paymentCalendarItems, paymentCalendarSortColumn, paymentCalendarSortDir]);


  const fetchPaymentCalendar = useCallback(() => {
    if (!adminToken) return;
    setPaymentCalendarLoading(true);
    fetchAdminPaymentCalendar(adminToken)
      .then(setPaymentCalendarItems)
      .catch(() => setPaymentCalendarItems([]))
      .finally(() => setPaymentCalendarLoading(false));
  }, [adminToken]);

  const fetchPaymentCalendarCustomers = useCallback(() => {
    if (!adminToken) return;
    setPaymentCalendarCustomerLoading(true);
    searchAdminCustomers(adminToken, { q: paymentCalendarSearch, limit: 500 })
      .then(setPaymentCalendarCustomerList)
      .catch(() => setPaymentCalendarCustomerList([]))
      .finally(() => setPaymentCalendarCustomerLoading(false));
  }, [adminToken, paymentCalendarSearch]);

  useEffect(() => {
    fetchPaymentCalendar();
  }, [fetchPaymentCalendar]);

  useEffect(() => {
    fetchPaymentCalendarCustomers();
  }, [fetchPaymentCalendarCustomers]);

  return (
    <Panel className="cargo-card" style={{ padding: "var(--pad-card, 1rem)" }}>
          <Typography.Body style={{ fontWeight: 600, marginBottom: "0.5rem" }}>Платёжный календарь</Typography.Body>
          <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginBottom: "1rem" }}>
            Срок оплаты — в календарных днях с момента выставления счёта. Можно задать платёжные дни недели (например вторник и четверг): при наступлении срока оплата планируется на первый из этих дней. Если платёжные дни не заданы — на первый рабочий день.
          </Typography.Body>
          <Flex gap="0.5rem" align="center" wrap="wrap" style={{ marginBottom: "0.75rem" }}>
            <Input
              type="text"
              placeholder="Поиск по ИНН или наименованию..."
              value={paymentCalendarSearch}
              onChange={(e) => setPaymentCalendarSearch(e.target.value)}
              className="admin-form-input"
              style={{ maxWidth: "22rem" }}
              aria-label="Поиск заказчиков"
            />
            <Button type="button" className="filter-button" onClick={() => fetchPaymentCalendarCustomers()} disabled={paymentCalendarCustomerLoading}>
              {paymentCalendarCustomerLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Найти"}
            </Button>
          </Flex>
          {paymentCalendarLoading ? (
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
              value={paymentCalendarDaysInput}
              onChange={(e) => setPaymentCalendarDaysInput(e.target.value)}
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
                  onClick={() => setPaymentCalendarDaysInput(String(d))}
                >
                  {d}
                </Button>
              ))}
            </Flex>
            <Button
              type="button"
              className="button-primary"
              disabled={paymentCalendarSaving || paymentCalendarSelectedInns.size === 0}
              onClick={async () => {
                const days = Math.max(0, Math.min(365, parseInt(paymentCalendarDaysInput, 10) || 0));
                if (paymentCalendarSelectedInns.size === 0) return;
                setPaymentCalendarSaving(true);
                onError(null);
                try {
                  await saveAdminPaymentCalendar(adminToken, { inns: Array.from(paymentCalendarSelectedInns), days_to_pay: days });
                  fetchPaymentCalendar();
                  setPaymentCalendarSelectedInns(new Set());
                } catch (e: unknown) {
                  onError((e as Error)?.message || "Ошибка");
                } finally {
                  setPaymentCalendarSaving(false);
                }
              }}
            >
              {paymentCalendarSaving ? <Loader2 className="w-4 h-4 animate-spin" style={{ marginRight: "0.35rem" }} /> : null}
              Применить к выбранным ({paymentCalendarSelectedInns.size})
            </Button>
          </Flex>
          <Flex align="center" gap="0.5rem" style={{ marginBottom: "0.5rem" }}>
            <Button
              type="button"
              className="filter-button"
              onClick={() => {
                const inns = paymentCalendarCustomerList.map((c) => c.inn);
                const allSelected = inns.length > 0 && inns.every((inn) => paymentCalendarSelectedInns.has(inn));
                if (allSelected) {
                  setPaymentCalendarSelectedInns((prev) => {
                    const next = new Set(prev);
                    inns.forEach((inn) => next.delete(inn));
                    return next;
                  });
                } else {
                  setPaymentCalendarSelectedInns((prev) => new Set([...prev, ...inns]));
                }
              }}
              disabled={paymentCalendarCustomerList.length === 0}
            >
              {paymentCalendarCustomerList.length > 0 && paymentCalendarCustomerList.every((c) => paymentCalendarSelectedInns.has(c.inn))
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
                  checked={paymentCalendarBulkWeekdays.includes(value)}
                  onChange={() => {
                    setPaymentCalendarBulkWeekdays((prev) =>
                      prev.includes(value) ? prev.filter((d) => d !== value) : [...prev, value].sort((a, b) => a - b)
                    );
                  }}
                />
                <span>{label}</span>
              </label>
            ))}
            <Button
              type="button"
              className="filter-button"
              disabled={paymentCalendarSaving || paymentCalendarSelectedInns.size === 0 || paymentCalendarBulkWeekdays.length === 0}
              onClick={async () => {
                if (paymentCalendarSelectedInns.size === 0 || paymentCalendarBulkWeekdays.length === 0) return;
                setPaymentCalendarSaving(true);
                onError(null);
                try {
                  await saveAdminPaymentCalendar(adminToken, {
                    inns: Array.from(paymentCalendarSelectedInns),
                    payment_weekdays: paymentCalendarBulkWeekdays,
                  });
                  setPaymentCalendarItems((prev) => {
                    const next = new Map(prev.map((p) => [p.inn, { ...p }]));
                    for (const inn of paymentCalendarSelectedInns) {
                      const cur = next.get(inn);
                      next.set(inn, {
                        inn,
                        customer_name: cur?.customer_name ?? null,
                        days_to_pay: cur?.days_to_pay ?? 0,
                        payment_weekdays: [...paymentCalendarBulkWeekdays],
                      });
                    }
                    return Array.from(next.values());
                  });
                  fetchPaymentCalendar();
                } catch (e: unknown) {
                  onError((e as Error)?.message || "Ошибка");
                } finally {
                  setPaymentCalendarSaving(false);
                }
              }}
            >
              Применить к выбранным
            </Button>
          </Flex>
          <div style={{ overflowX: "auto", maxHeight: "50vh", overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
              <thead>
                <tr style={{ background: "var(--color-bg-hover)", borderBottom: "1px solid var(--color-border)" }}>
                  <th style={{ padding: "0.4rem 0.5rem", width: 40, textAlign: "left" }} />
                  <th
                    style={{ padding: "0.4rem 0.5rem", textAlign: "left", fontWeight: 600, cursor: "pointer", userSelect: "none" }}
                    onClick={() => {
                      setPaymentCalendarSortColumn((prev) => (prev === "inn" ? prev : "inn"));
                      setPaymentCalendarSortDir((prev) => (paymentCalendarSortColumn === "inn" ? (prev === "asc" ? "desc" : "asc") : "asc"));
                    }}
                    title="Сортировка по ИНН"
                  >
                    ИНН {paymentCalendarSortColumn === "inn" ? (paymentCalendarSortDir === "asc" ? <ChevronUp className="w-4 h-4 inline-block ml-0.5" style={{ verticalAlign: "middle" }} /> : <ChevronDown className="w-4 h-4 inline-block ml-0.5" style={{ verticalAlign: "middle" }} />) : null}
                  </th>
                  <th
                    style={{ padding: "0.4rem 0.5rem", textAlign: "left", fontWeight: 600, cursor: "pointer", userSelect: "none" }}
                    onClick={() => {
                      setPaymentCalendarSortColumn((prev) => (prev === "customer_name" ? prev : "customer_name"));
                      setPaymentCalendarSortDir((prev) => (paymentCalendarSortColumn === "customer_name" ? (prev === "asc" ? "desc" : "asc") : "asc"));
                    }}
                    title="Сортировка по наименованию"
                  >
                    Наименование {paymentCalendarSortColumn === "customer_name" ? (paymentCalendarSortDir === "asc" ? <ChevronUp className="w-4 h-4 inline-block ml-0.5" style={{ verticalAlign: "middle" }} /> : <ChevronDown className="w-4 h-4 inline-block ml-0.5" style={{ verticalAlign: "middle" }} />) : null}
                  </th>
                  <th
                    style={{ padding: "0.4rem 0.5rem", textAlign: "right", fontWeight: 600, cursor: "pointer", userSelect: "none" }}
                    onClick={() => {
                      setPaymentCalendarSortColumn((prev) => (prev === "days_to_pay" ? prev : "days_to_pay"));
                      setPaymentCalendarSortDir((prev) => (paymentCalendarSortColumn === "days_to_pay" ? (prev === "asc" ? "desc" : "asc") : "asc"));
                    }}
                    title="Сортировка по сроку (календарных дней)"
                  >
                    Срок (дней) {paymentCalendarSortColumn === "days_to_pay" ? (paymentCalendarSortDir === "asc" ? <ChevronUp className="w-4 h-4 inline-block ml-0.5" style={{ verticalAlign: "middle" }} /> : <ChevronDown className="w-4 h-4 inline-block ml-0.5" style={{ verticalAlign: "middle" }} />) : null}
                  </th>
                  <th style={{ padding: "0.4rem 0.5rem", textAlign: "left", fontWeight: 600 }}>Платежные дни</th>
                </tr>
              </thead>
              <tbody>
                {paymentCalendarCustomerListSorted.map((c) => {
                  const currentDays = c.days != null ? Number(c.days) : 0;
                  const currentWeekdays = c.payment_weekdays ?? [];
                  const selected = paymentCalendarSelectedInns.has(c.inn);
                  const saving = paymentCalendarSavingInn === c.inn;
                  const options = [...new Set([...PAYMENT_DAYS_OPTIONS, currentDays].filter((d) => d >= 0 && d <= 365))].sort((a, b) => a - b);
                  return (
                    <tr key={c.inn} style={{ borderBottom: "1px solid var(--color-border)" }}>
                      <td style={{ padding: "0.4rem 0.5rem" }}>
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => {
                            setPaymentCalendarSelectedInns((prev) => {
                              const next = new Set(prev);
                              if (next.has(c.inn)) next.delete(c.inn);
                              else next.add(c.inn);
                              return next;
                            });
                          }}
                          aria-label={`Выбрать ${c.customer_name || c.inn}`}
                        />
                      </td>
                      <td style={{ padding: "0.4rem 0.5rem" }}>{c.inn}</td>
                      <td style={{ padding: "0.4rem 0.5rem" }}>{c.customer_name || "—"}</td>
                      <td style={{ padding: "0.4rem 0.5rem", textAlign: "right" }}>
                        {saving ? (
                          <Loader2 className="w-4 h-4 animate-spin" style={{ display: "inline-block", verticalAlign: "middle" }} />
                        ) : (
                          <select
                            className="admin-form-input"
                            value={currentDays}
                            style={{ minWidth: "4rem", padding: "0.25rem 0.35rem", fontSize: "0.9rem" }}
                            aria-label={`Срок оплаты в календарных днях для ${c.customer_name || c.inn}`}
                            onChange={async (e) => {
                              const val = Math.max(0, Math.min(365, parseInt(e.target.value, 10) || 0));
                              setPaymentCalendarSavingInn(c.inn);
                              onError(null);
                              try {
                                await saveAdminPaymentCalendar(adminToken, { inn: c.inn, days_to_pay: val });
                                fetchPaymentCalendar();
                              } catch (err: unknown) {
                                onError((err as Error)?.message || "Ошибка");
                              } finally {
                                setPaymentCalendarSavingInn(null);
                              }
                            }}
                          >
                            {options.map((d) => (
                              <option key={d} value={d}>{d === 0 ? "—" : d}</option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td style={{ padding: "0.4rem 0.5rem" }}>
                        {saving ? null : (
                          <Flex gap="0.2rem" wrap="wrap">
                            {PAYMENT_WEEKDAY_LABELS.map(({ value, label }) => (
                              <label key={value} style={{ display: "inline-flex", alignItems: "center", cursor: "pointer", fontSize: "0.8rem" }} title={label}>
                                <input
                                  type="checkbox"
                                  checked={currentWeekdays.includes(value)}
                                  onChange={async () => {
                                    const next = currentWeekdays.includes(value)
                                      ? currentWeekdays.filter((d) => d !== value)
                                      : [...currentWeekdays, value].sort((a, b) => a - b);
                                    setPaymentCalendarSavingInn(c.inn);
                                    onError(null);
                                    try {
                                      await saveAdminPaymentCalendar(adminToken, { inn: c.inn, payment_weekdays: next });
                                      fetchPaymentCalendar();
                                    } catch (err: unknown) {
                                      onError((err as Error)?.message || "Ошибка");
                                    } finally {
                                      setPaymentCalendarSavingInn(null);
                                    }
                                  }}
                                />
                                <span>{label}</span>
                              </label>
                            ))}
                          </Flex>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {paymentCalendarCustomerList.length === 0 && !paymentCalendarCustomerLoading && (
            <Typography.Body style={{ color: "var(--color-text-secondary)", marginTop: "0.5rem" }}>
              Введите поиск и нажмите «Найти» или загрузится список заказчиков из справочника.
            </Typography.Body>
          )}

          {paymentCalendarItems.length > 0 && (
            <>
              <Typography.Body style={{ fontWeight: 600, marginTop: "1.5rem", marginBottom: "0.5rem" }}>Заданные условия оплаты</Typography.Body>
              <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginBottom: "0.5rem" }}>
                Выберите строки и нажмите «Применить к выбранным», чтобы изменить срок для нескольких заказчиков.
              </Typography.Body>
              <Flex align="center" gap="0.5rem" style={{ marginBottom: "0.5rem", marginTop: "0.5rem" }}>
                <Button
                  type="button"
                  className="filter-button"
                  onClick={() => {
                    const inns = paymentCalendarItems.map((c) => c.inn);
                    const allSelected = inns.length > 0 && inns.every((inn) => paymentCalendarSelectedInns.has(inn));
                    if (allSelected) {
                      setPaymentCalendarSelectedInns((prev) => {
                        const next = new Set(prev);
                        inns.forEach((inn) => next.delete(inn));
                        return next;
                      });
                    } else {
                      setPaymentCalendarSelectedInns((prev) => new Set([...prev, ...inns]));
                    }
                  }}
                >
                  {paymentCalendarItems.every((c) => paymentCalendarSelectedInns.has(c.inn)) ? "Снять выделение" : "Выделить все"}
                </Button>
              </Flex>
              <div style={{ overflowX: "auto", maxHeight: "40vh", overflowY: "auto", marginTop: "0.5rem" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
                  <thead>
                    <tr style={{ background: "var(--color-bg-hover)", borderBottom: "1px solid var(--color-border)" }}>
                      <th style={{ padding: "0.4rem 0.5rem", width: 40, textAlign: "left" }} />
                      <th
                        style={{ padding: "0.4rem 0.5rem", textAlign: "left", fontWeight: 600, cursor: "pointer", userSelect: "none" }}
                        onClick={() => {
                          setPaymentCalendarSortColumn((prev) => (prev === "inn" ? prev : "inn"));
                          setPaymentCalendarSortDir((prev) => (paymentCalendarSortColumn === "inn" ? (prev === "asc" ? "desc" : "asc") : "asc"));
                        }}
                        title="Сортировка по ИНН"
                      >
                        ИНН {paymentCalendarSortColumn === "inn" ? (paymentCalendarSortDir === "asc" ? <ChevronUp className="w-4 h-4 inline-block ml-0.5" style={{ verticalAlign: "middle" }} /> : <ChevronDown className="w-4 h-4 inline-block ml-0.5" style={{ verticalAlign: "middle" }} />) : null}
                      </th>
                      <th
                        style={{ padding: "0.4rem 0.5rem", textAlign: "left", fontWeight: 600, cursor: "pointer", userSelect: "none" }}
                        onClick={() => {
                          setPaymentCalendarSortColumn((prev) => (prev === "customer_name" ? prev : "customer_name"));
                          setPaymentCalendarSortDir((prev) => (paymentCalendarSortColumn === "customer_name" ? (prev === "asc" ? "desc" : "asc") : "asc"));
                        }}
                        title="Сортировка по наименованию"
                      >
                        Наименование {paymentCalendarSortColumn === "customer_name" ? (paymentCalendarSortDir === "asc" ? <ChevronUp className="w-4 h-4 inline-block ml-0.5" style={{ verticalAlign: "middle" }} /> : <ChevronDown className="w-4 h-4 inline-block ml-0.5" style={{ verticalAlign: "middle" }} />) : null}
                      </th>
                      <th
                        style={{ padding: "0.4rem 0.5rem", textAlign: "right", fontWeight: 600, cursor: "pointer", userSelect: "none" }}
                        onClick={() => {
                          setPaymentCalendarSortColumn((prev) => (prev === "days_to_pay" ? prev : "days_to_pay"));
                          setPaymentCalendarSortDir((prev) => (paymentCalendarSortColumn === "days_to_pay" ? (prev === "asc" ? "desc" : "asc") : "asc"));
                        }}
                        title="Сортировка по сроку (календарных дней)"
                      >
                        Срок (дней) {paymentCalendarSortColumn === "days_to_pay" ? (paymentCalendarSortDir === "asc" ? <ChevronUp className="w-4 h-4 inline-block ml-0.5" style={{ verticalAlign: "middle" }} /> : <ChevronDown className="w-4 h-4 inline-block ml-0.5" style={{ verticalAlign: "middle" }} />) : null}
                      </th>
                      <th style={{ padding: "0.4rem 0.5rem", textAlign: "left", fontWeight: 600 }}>Платежные дни</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paymentCalendarItemsSorted.map((c) => {
                      const selected = paymentCalendarSelectedInns.has(c.inn);
                      const weekdays = (c.payment_weekdays ?? []).filter((d) => d >= 1 && d <= 5);
                      const weekdaysLabel = weekdays.length > 0
                        ? weekdays.sort((a, b) => a - b).map((d) => PAYMENT_WEEKDAY_LABELS.find((w) => w.value === d)?.label ?? d).join(", ")
                        : "—";
                      return (
                        <tr key={c.inn} style={{ borderBottom: "1px solid var(--color-border)" }}>
                          <td style={{ padding: "0.4rem 0.5rem" }}>
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => {
                                setPaymentCalendarSelectedInns((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(c.inn)) next.delete(c.inn);
                                  else next.add(c.inn);
                                  return next;
                                });
                              }}
                              aria-label={`Выбрать ${c.customer_name || c.inn}`}
                            />
                          </td>
                          <td style={{ padding: "0.4rem 0.5rem" }}>{c.inn}</td>
                          <td style={{ padding: "0.4rem 0.5rem" }}>{c.customer_name || "—"}</td>
                          <td style={{ padding: "0.4rem 0.5rem", textAlign: "right", color: "var(--color-text-secondary)" }}>{c.days_to_pay}</td>
                          <td style={{ padding: "0.4rem 0.5rem", color: "var(--color-text-secondary)", fontSize: "0.85rem" }}>{weekdaysLabel}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

    </Panel>
  );
}
