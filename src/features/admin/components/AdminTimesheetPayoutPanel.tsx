import React from "react";
import { Button, Flex, Typography } from "@maxhub/max-ui";
import type { EmployeeDirectoryRow } from "../types/adminUsers";
import type { AdminTimesheetState } from "../hooks/useAdminTimesheet";
import type { TimesheetEmployeeStats } from "../lib/adminTimesheetRowStats";

export type AdminTimesheetPayoutPanelProps = {
  emp: EmployeeDirectoryRow;
  stats: TimesheetEmployeeStats;
  isSuperAdmin: boolean;
  ts: AdminTimesheetState;
};

export function AdminTimesheetPayoutPanel({ emp, stats, isSuperAdmin, ts }: AdminTimesheetPayoutPanelProps) {
  const {
    timesheetPayoutSavingEmployeeId,
    timesheetPayoutEditingId,
    timesheetPayoutEditingEmployeeId,
    timesheetPayoutEditDate,
    setTimesheetPayoutEditDate,
    timesheetPayoutEditAmount,
    setTimesheetPayoutEditAmount,
    timesheetPayoutActionLoadingId,
    setTimesheetPayoutEditingId,
    setTimesheetPayoutEditingEmployeeId,
    createTimesheetPayout,
    updateTimesheetPayout,
    deleteTimesheetPayout,
  } = ts;

  const { totalColumnCount, markedDaysCount, totalMoneyToPay, employeePayouts } = stats;
  const showTaxColumns = emp.cooperation_type === "ip" || emp.cooperation_type === "self_employed";

  return (
    <tr>
      <td colSpan={totalColumnCount} style={{ padding: "0.55rem", borderBottom: "1px solid var(--color-border)", background: "var(--color-bg-hover)" }}>
        <Flex align="center" justify="space-between" wrap="wrap" gap="0.5rem" style={{ marginBottom: "0.45rem" }}>
          <div>
            <Typography.Body style={{ fontSize: "0.82rem", fontWeight: 600 }}>
              Выплаты сотрудника
            </Typography.Body>
            <Typography.Body style={{ display: "block", fontSize: "0.74rem", color: "var(--color-text-secondary)", marginTop: "0.12rem" }}>
              Отметьте дни в строке табеля (жёлтая подсветка), затем нажмите «+ Новая выплата».
            </Typography.Body>
          </div>
          <Flex align="center" gap="0.45rem" wrap="wrap">
            <Typography.Body style={{ fontSize: "0.76rem", color: "var(--color-text-secondary)" }}>
              Дней к выплате: {markedDaysCount} · Сумма: {Number(totalMoneyToPay.toFixed(2)).toLocaleString("ru-RU")} ₽
            </Typography.Body>
            <Button
              type="button"
              className="filter-button"
              disabled={timesheetPayoutSavingEmployeeId === emp.id || markedDaysCount === 0 || Number(totalMoneyToPay) <= 0}
              onClick={() => void createTimesheetPayout(emp.id)}
              style={{ padding: "0.35rem 0.6rem" }}
            >
              {timesheetPayoutSavingEmployeeId === emp.id ? "Выплата..." : "+ Новая выплата"}
            </Button>
          </Flex>
        </Flex>
        {employeePayouts.length === 0 ? (
          <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)" }}>
            Выплат пока нет.
          </Typography.Body>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "0.28rem 0.35rem", borderBottom: "1px solid var(--color-border)" }}>Дата выплаты</th>
                  <th style={{ textAlign: "left", padding: "0.28rem 0.35rem", borderBottom: "1px solid var(--color-border)" }}>За период</th>
                  <th style={{ textAlign: "right", padding: "0.28rem 0.35rem", borderBottom: "1px solid var(--color-border)" }}>Сумма</th>
                  {showTaxColumns ? (
                    <th style={{ textAlign: "right", padding: "0.28rem 0.35rem", borderBottom: "1px solid var(--color-border)" }}>Налог</th>
                  ) : null}
                  {showTaxColumns ? (
                    <th style={{ textAlign: "right", padding: "0.28rem 0.35rem", borderBottom: "1px solid var(--color-border)" }}>Сумма с налогом</th>
                  ) : null}
                  {isSuperAdmin ? (
                    <th style={{ textAlign: "right", padding: "0.28rem 0.35rem", borderBottom: "1px solid var(--color-border)" }}>Действия</th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {employeePayouts.map((payout) => {
                  const isEditing = timesheetPayoutEditingId === payout.id && timesheetPayoutEditingEmployeeId === emp.id;
                  const isActionLoading = timesheetPayoutActionLoadingId === payout.id;
                  const editAmountNumber = Number(String(timesheetPayoutEditAmount || "").replace(",", "."));
                  const previewTax = Number.isFinite(editAmountNumber) && editAmountNumber >= 0
                    ? ((payout.cooperationType === "ip" || payout.cooperationType === "self_employed")
                        ? Number((editAmountNumber / 0.94 - editAmountNumber).toFixed(2))
                        : 0)
                    : Number(payout.taxAmount || 0);
                  return (
                    <tr key={`timesheet-payout-row-${payout.id}`}>
                      <td style={{ padding: "0.28rem 0.35rem", borderBottom: "1px solid var(--color-border)" }}>
                        {isEditing ? (
                          <input
                            type="date"
                            className="admin-form-input"
                            value={timesheetPayoutEditDate}
                            onChange={(e) => setTimesheetPayoutEditDate(e.target.value)}
                            style={{ minWidth: "8.6rem", padding: "0.2rem 0.3rem" }}
                          />
                        ) : (
                          payout.payoutDate
                        )}
                      </td>
                      <td style={{ padding: "0.28rem 0.35rem", borderBottom: "1px solid var(--color-border)" }}>
                        {payout.periodFrom} — {payout.periodTo}
                      </td>
                      <td style={{ padding: "0.28rem 0.35rem", borderBottom: "1px solid var(--color-border)", textAlign: "right", fontWeight: 600 }}>
                        {isEditing ? (
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            className="admin-form-input"
                            value={timesheetPayoutEditAmount}
                            onChange={(e) => setTimesheetPayoutEditAmount(e.target.value)}
                            style={{ width: "7.2rem", textAlign: "right", padding: "0.2rem 0.3rem" }}
                          />
                        ) : (
                          `${Number(payout.amount || 0).toLocaleString("ru-RU")} ₽`
                        )}
                      </td>
                      {showTaxColumns ? (
                        <td style={{ padding: "0.28rem 0.35rem", borderBottom: "1px solid var(--color-border)", textAlign: "right", fontWeight: 600, color: "#b45309" }}>
                          {isEditing
                            ? `${Number(previewTax || 0).toLocaleString("ru-RU")} ₽`
                            : `${Number(payout.taxAmount || 0).toLocaleString("ru-RU")} ₽`}
                        </td>
                      ) : null}
                      {showTaxColumns ? (
                        <td style={{ padding: "0.28rem 0.35rem", borderBottom: "1px solid var(--color-border)", textAlign: "right", fontWeight: 700, color: "#92400e" }}>
                          {isEditing
                            ? `${Number((Number.isFinite(editAmountNumber) ? editAmountNumber + Number(previewTax || 0) : Number(payout.amount || 0) + Number(payout.taxAmount || 0))).toLocaleString("ru-RU")} ₽`
                            : `${Number(Number(payout.amount || 0) + Number(payout.taxAmount || 0)).toLocaleString("ru-RU")} ₽`}
                        </td>
                      ) : null}
                      {isSuperAdmin ? (
                        <td style={{ padding: "0.28rem 0.35rem", borderBottom: "1px solid var(--color-border)", textAlign: "right" }}>
                          {isEditing ? (
                            <Flex align="center" justify="flex-end" gap="0.3rem">
                              <Button
                                type="button"
                                className="filter-button"
                                disabled={isActionLoading}
                                onClick={() => void updateTimesheetPayout(emp.id, payout.id, timesheetPayoutEditDate, timesheetPayoutEditAmount)}
                                style={{ padding: "0.2rem 0.45rem" }}
                              >
                                {isActionLoading ? "Сохранение..." : "Сохранить"}
                              </Button>
                              <Button
                                type="button"
                                className="filter-button"
                                disabled={isActionLoading}
                                onClick={() => {
                                  setTimesheetPayoutEditingId(null);
                                  setTimesheetPayoutEditingEmployeeId(null);
                                  setTimesheetPayoutEditDate("");
                                  setTimesheetPayoutEditAmount("");
                                }}
                                style={{ padding: "0.2rem 0.45rem" }}
                              >
                                Отмена
                              </Button>
                            </Flex>
                          ) : (
                            <Flex align="center" justify="flex-end" gap="0.3rem">
                              <Button
                                type="button"
                                className="filter-button"
                                disabled={timesheetPayoutActionLoadingId !== null}
                                onClick={() => {
                                  setTimesheetPayoutEditingId(payout.id);
                                  setTimesheetPayoutEditingEmployeeId(emp.id);
                                  setTimesheetPayoutEditDate(payout.payoutDate || "");
                                  setTimesheetPayoutEditAmount(String(Number(payout.amount || 0)));
                                }}
                                style={{ padding: "0.2rem 0.45rem" }}
                              >
                                Изменить
                              </Button>
                              <Button
                                type="button"
                                className="filter-button"
                                disabled={timesheetPayoutActionLoadingId !== null}
                                onClick={() => void deleteTimesheetPayout(emp.id, payout.id)}
                                style={{ padding: "0.2rem 0.45rem", borderColor: "#dc2626", color: "#b91c1c" }}
                              >
                                Удалить
                              </Button>
                            </Flex>
                          )}
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </td>
    </tr>
  );
}
