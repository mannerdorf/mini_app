import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Button, Flex, Panel, Typography, Input } from "@maxhub/max-ui";
import { Loader2 } from "lucide-react";
import {
  fetchAdminWorkSchedule,
  saveAdminWorkSchedule,
} from "../../../api/client/admin/scheduling";
import { searchAdminCustomers } from "../../../api/client/admin/customers";
import { WORK_SCHEDULE_WEEKDAY_LABELS } from "../lib/workScheduleConstants";

type AdminWorkScheduleTabProps = {
  adminToken: string;
  onError: (msg: string | null) => void;
};

export function AdminWorkScheduleTab({ adminToken, onError }: AdminWorkScheduleTabProps) {
  const [workScheduleItems, setWorkScheduleItems] = useState<{ inn: string; customer_name: string | null; days_of_week: number[]; work_start: string; work_end: string }[]>([]);
  const [workScheduleLoading, setWorkScheduleLoading] = useState(false);
  const [workScheduleSearch, setWorkScheduleSearch] = useState("");
  const [workScheduleCustomerList, setWorkScheduleCustomerList] = useState<{ inn: string; customer_name: string; email: string }[]>([]);
  const [workScheduleCustomerLoading, setWorkScheduleCustomerLoading] = useState(false);
  const [workScheduleSelectedInns, setWorkScheduleSelectedInns] = useState<Set<string>>(new Set());
  const [workScheduleBulkWeekdays, setWorkScheduleBulkWeekdays] = useState<number[]>([]);
  const [workScheduleBulkStart, setWorkScheduleBulkStart] = useState<string>("09:00");
  const [workScheduleBulkEnd, setWorkScheduleBulkEnd] = useState<string>("18:00");
  const [workScheduleSaving, setWorkScheduleSaving] = useState(false);
  const [workScheduleSavingInn, setWorkScheduleSavingInn] = useState<string | null>(null);

  const workScheduleCustomerListSorted = useMemo(() => {
    const withSchedule = workScheduleCustomerList.map((c) => {
      const item = workScheduleItems.find((x) => x.inn === c.inn);
      return {
        ...c,
        days_of_week: item?.days_of_week ?? [1, 2, 3, 4, 5],
        work_start: item?.work_start ?? "09:00",
        work_end: item?.work_end ?? "18:00",
      };
    });
    return withSchedule;
  }, [workScheduleCustomerList, workScheduleItems]);


  const fetchWorkSchedule = useCallback(() => {
    if (!adminToken) return;
    setWorkScheduleLoading(true);
    fetchAdminWorkSchedule(adminToken)
      .then(setWorkScheduleItems)
      .catch(() => setWorkScheduleItems([]))
      .finally(() => setWorkScheduleLoading(false));
  }, [adminToken]);

  const fetchWorkScheduleCustomers = useCallback(() => {
    if (!adminToken) return;
    setWorkScheduleCustomerLoading(true);
    searchAdminCustomers(adminToken, { q: workScheduleSearch, limit: 500 })
      .then(setWorkScheduleCustomerList)
      .catch(() => setWorkScheduleCustomerList([]))
      .finally(() => setWorkScheduleCustomerLoading(false));
  }, [adminToken, workScheduleSearch]);

  useEffect(() => {
    fetchWorkSchedule();
  }, [fetchWorkSchedule]);

  useEffect(() => {
    fetchWorkScheduleCustomers();
  }, [fetchWorkScheduleCustomers]);

  return (
    <Panel className="cargo-card" style={{ padding: "var(--pad-card, 1rem)" }}>
          <Typography.Body style={{ fontWeight: 600, marginBottom: "0.5rem" }}>График работы</Typography.Body>
          <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginBottom: "1rem" }}>
            Рабочие дни и часы заказчика для расчёта SLA. По умолчанию Пн–Пт 09:00–18:00.
          </Typography.Body>
          <Flex gap="0.5rem" align="center" wrap="wrap" style={{ marginBottom: "0.75rem" }}>
            <Input
              type="text"
              placeholder="Поиск по ИНН или наименованию..."
              value={workScheduleSearch}
              onChange={(e) => setWorkScheduleSearch(e.target.value)}
              className="admin-form-input"
              style={{ maxWidth: "22rem" }}
              aria-label="Поиск заказчиков"
            />
            <Button type="button" className="filter-button" onClick={() => fetchWorkScheduleCustomers()} disabled={workScheduleCustomerLoading}>
              {workScheduleCustomerLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Найти"}
            </Button>
          </Flex>
          {workScheduleLoading ? (
            <Flex align="center" gap="0.5rem" style={{ marginBottom: "0.75rem" }}>
              <Loader2 className="w-4 h-4 animate-spin" />
              <Typography.Body>Загрузка графиков...</Typography.Body>
            </Flex>
          ) : null}
          <Flex gap="0.5rem" align="center" wrap="wrap" style={{ marginBottom: "0.5rem" }}>
            <Button
              type="button"
              className="filter-button"
              onClick={() => {
                const inns = workScheduleCustomerList.map((c) => c.inn);
                const allSelected = inns.length > 0 && inns.every((inn) => workScheduleSelectedInns.has(inn));
                if (allSelected) {
                  setWorkScheduleSelectedInns((prev) => {
                    const next = new Set(prev);
                    inns.forEach((inn) => next.delete(inn));
                    return next;
                  });
                } else {
                  setWorkScheduleSelectedInns((prev) => new Set([...prev, ...inns]));
                }
              }}
              disabled={workScheduleCustomerList.length === 0}
            >
              {workScheduleCustomerList.length > 0 && workScheduleCustomerList.every((c) => workScheduleSelectedInns.has(c.inn))
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
                  checked={workScheduleBulkWeekdays.includes(value)}
                  onChange={() => {
                    setWorkScheduleBulkWeekdays((prev) =>
                      prev.includes(value) ? prev.filter((d) => d !== value) : [...prev, value].sort((a, b) => a - b)
                    );
                  }}
                />
                <span>{label}</span>
              </label>
            ))}
            <label htmlFor="work-schedule-bulk-start" style={{ fontSize: "0.9rem", whiteSpace: "nowrap" }}>С:</label>
            <input
              id="work-schedule-bulk-start"
              type="time"
              value={workScheduleBulkStart}
              onChange={(e) => setWorkScheduleBulkStart(e.target.value)}
              className="admin-form-input"
              style={{ padding: "0.35rem 0.5rem" }}
            />
            <label htmlFor="work-schedule-bulk-end" style={{ fontSize: "0.9rem", whiteSpace: "nowrap" }}>До:</label>
            <input
              id="work-schedule-bulk-end"
              type="time"
              value={workScheduleBulkEnd}
              onChange={(e) => setWorkScheduleBulkEnd(e.target.value)}
              className="admin-form-input"
              style={{ padding: "0.35rem 0.5rem" }}
            />
            <Button
              type="button"
              className="button-primary"
              disabled={workScheduleSaving || workScheduleSelectedInns.size === 0}
              onClick={async () => {
                if (workScheduleSelectedInns.size === 0) return;
                setWorkScheduleSaving(true);
                onError(null);
                try {
                  const body: { inns: string[]; days_of_week?: number[]; work_start?: string; work_end?: string } = {
                    inns: Array.from(workScheduleSelectedInns),
                  };
                  if (workScheduleBulkWeekdays.length > 0) body.days_of_week = workScheduleBulkWeekdays;
                  if (workScheduleBulkStart) body.work_start = workScheduleBulkStart;
                  if (workScheduleBulkEnd) body.work_end = workScheduleBulkEnd;
                  if (!body.days_of_week && !body.work_start && !body.work_end) {
                    onError("Выберите дни недели и/или укажите часы работы");
                    return;
                  }
                  await saveAdminWorkSchedule(adminToken, body);
                  fetchWorkSchedule();
                  setWorkScheduleSelectedInns(new Set());
                } catch (e: unknown) {
                  onError((e as Error)?.message || "Ошибка");
                } finally {
                  setWorkScheduleSaving(false);
                }
              }}
            >
              {workScheduleSaving ? <Loader2 className="w-4 h-4 animate-spin" style={{ marginRight: "0.35rem" }} /> : null}
              Применить к выбранным ({workScheduleSelectedInns.size})
            </Button>
          </Flex>
          <div style={{ overflowX: "auto", maxHeight: "50vh", overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
              <thead>
                <tr style={{ background: "var(--color-bg-hover)", borderBottom: "1px solid var(--color-border)" }}>
                  <th style={{ padding: "0.4rem 0.5rem", width: 40, textAlign: "left" }} />
                  <th style={{ padding: "0.4rem 0.5rem", textAlign: "left", fontWeight: 600 }}>ИНН</th>
                  <th style={{ padding: "0.4rem 0.5rem", textAlign: "left", fontWeight: 600 }}>Наименование</th>
                  <th style={{ padding: "0.4rem 0.5rem", textAlign: "left", fontWeight: 600 }}>Рабочие дни</th>
                  <th style={{ padding: "0.4rem 0.5rem", textAlign: "left", fontWeight: 600 }}>С</th>
                  <th style={{ padding: "0.4rem 0.5rem", textAlign: "left", fontWeight: 600 }}>До</th>
                </tr>
              </thead>
              <tbody>
                {workScheduleCustomerListSorted.map((c) => {
                  const currentWeekdays = c.days_of_week ?? [1, 2, 3, 4, 5];
                  const currentStart = c.work_start ?? "09:00";
                  const currentEnd = c.work_end ?? "18:00";
                  const selected = workScheduleSelectedInns.has(c.inn);
                  const saving = workScheduleSavingInn === c.inn;
                  return (
                    <tr key={c.inn} style={{ borderBottom: "1px solid var(--color-border)" }}>
                      <td style={{ padding: "0.4rem 0.5rem" }}>
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => {
                            setWorkScheduleSelectedInns((prev) => {
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
                      <td style={{ padding: "0.4rem 0.5rem" }}>
                        {saving ? (
                          <Loader2 className="w-4 h-4 animate-spin" style={{ display: "inline-block", verticalAlign: "middle" }} />
                        ) : (
                          <Flex gap="0.2rem" wrap="wrap">
                            {WORK_SCHEDULE_WEEKDAY_LABELS.map(({ value, label }) => (
                              <label key={value} style={{ display: "inline-flex", alignItems: "center", cursor: "pointer", fontSize: "0.8rem" }} title={label}>
                                <input
                                  type="checkbox"
                                  checked={currentWeekdays.includes(value)}
                                  onChange={async () => {
                                    const next = currentWeekdays.includes(value)
                                      ? currentWeekdays.filter((d) => d !== value)
                                      : [...currentWeekdays, value].sort((a, b) => a - b);
                                    setWorkScheduleSavingInn(c.inn);
                                    onError(null);
                                    try {
                                      await saveAdminWorkSchedule(adminToken, { inn: c.inn, days_of_week: next });
                                      fetchWorkSchedule();
                                    } catch (err: unknown) {
                                      onError((err as Error)?.message || "Ошибка");
                                    } finally {
                                      setWorkScheduleSavingInn(null);
                                    }
                                  }}
                                />
                                <span>{label}</span>
                              </label>
                            ))}
                          </Flex>
                        )}
                      </td>
                      <td style={{ padding: "0.4rem 0.5rem" }}>
                        {saving ? null : (
                          <input
                            type="time"
                            value={currentStart}
                            onChange={async (e) => {
                              const val = e.target.value;
                              setWorkScheduleSavingInn(c.inn);
                              onError(null);
                              try {
                                await saveAdminWorkSchedule(adminToken, { inn: c.inn, work_start: val });
                                fetchWorkSchedule();
                              } catch (err: unknown) {
                                onError((err as Error)?.message || "Ошибка");
                              } finally {
                                setWorkScheduleSavingInn(null);
                              }
                            }}
                            className="admin-form-input"
                            style={{ padding: "0.25rem 0.35rem", fontSize: "0.9rem" }}
                          />
                        )}
                      </td>
                      <td style={{ padding: "0.4rem 0.5rem" }}>
                        {saving ? null : (
                          <input
                            type="time"
                            value={currentEnd}
                            onChange={async (e) => {
                              const val = e.target.value;
                              setWorkScheduleSavingInn(c.inn);
                              onError(null);
                              try {
                                await saveAdminWorkSchedule(adminToken, { inn: c.inn, work_end: val });
                                fetchWorkSchedule();
                              } catch (err: unknown) {
                                onError((err as Error)?.message || "Ошибка");
                              } finally {
                                setWorkScheduleSavingInn(null);
                              }
                            }}
                            className="admin-form-input"
                            style={{ padding: "0.25rem 0.35rem", fontSize: "0.9rem" }}
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {workScheduleCustomerList.length === 0 && !workScheduleCustomerLoading && (
            <Typography.Body style={{ color: "var(--color-text-secondary)", marginTop: "0.5rem" }}>
              Введите поиск и нажмите «Найти» или загрузится список заказчиков из справочника.
            </Typography.Body>
          )}
          {workScheduleItems.length > 0 && (
            <>
              <Typography.Body style={{ fontWeight: 600, marginTop: "1.5rem", marginBottom: "0.5rem" }}>Заданные графики работы</Typography.Body>
              <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginBottom: "0.5rem" }}>
                Список заказчиков с настроенным графиком.
              </Typography.Body>
              <div style={{ overflowX: "auto", maxHeight: "40vh", overflowY: "auto", marginTop: "0.5rem" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
                  <thead>
                    <tr style={{ background: "var(--color-bg-hover)", borderBottom: "1px solid var(--color-border)" }}>
                      <th style={{ padding: "0.4rem 0.5rem", textAlign: "left", fontWeight: 600 }}>ИНН</th>
                      <th style={{ padding: "0.4rem 0.5rem", textAlign: "left", fontWeight: 600 }}>Наименование</th>
                      <th style={{ padding: "0.4rem 0.5rem", textAlign: "left", fontWeight: 600 }}>Рабочие дни</th>
                      <th style={{ padding: "0.4rem 0.5rem", textAlign: "left", fontWeight: 600 }}>Часы</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workScheduleItems.map((c) => {
                      const weekdays = (c.days_of_week ?? []).filter((d) => d >= 1 && d <= 7);
                      const weekdaysLabel = weekdays.length > 0
                        ? weekdays.sort((a, b) => a - b).map((d) => WORK_SCHEDULE_WEEKDAY_LABELS.find((w) => w.value === d)?.label ?? d).join(", ")
                        : "—";
                      return (
                        <tr key={c.inn} style={{ borderBottom: "1px solid var(--color-border)" }}>
                          <td style={{ padding: "0.4rem 0.5rem" }}>{c.inn}</td>
                          <td style={{ padding: "0.4rem 0.5rem" }}>{c.customer_name || "—"}</td>
                          <td style={{ padding: "0.4rem 0.5rem", color: "var(--color-text-secondary)" }}>{weekdaysLabel}</td>
                          <td style={{ padding: "0.4rem 0.5rem", color: "var(--color-text-secondary)" }}>{c.work_start || "09:00"}–{c.work_end || "18:00"}</td>
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
