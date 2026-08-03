import React from "react";
import { Flex, Typography } from "@maxhub/max-ui";
import { Loader2 } from "lucide-react";
import { formatDisplayDate } from "../../../lib/dateUtils";
import type { AdminExpenseRequestsState } from "../hooks/useAdminExpenseRequests";

type Props = Pick<
  AdminExpenseRequestsState,
  | "sverkiRequests"
  | "sverkiRequestsLoading"
  | "sverkiRequestsUpdatingId"
  | "markSverkiRequestAsSent"
  | "deleteSverkiRequest"
>;

export function AdminExpenseSverkiPanel({
  sverkiRequests,
  sverkiRequestsLoading,
  sverkiRequestsUpdatingId,
  markSverkiRequestAsSent,
  deleteSverkiRequest,
}: Props) {
  return (
    <div style={{ marginBottom: "1rem", border: "1px solid var(--color-border)", borderRadius: 10, padding: "0.75rem" }}>
      <Typography.Body style={{ fontWeight: 600, marginBottom: "0.55rem" }}>Акты сверок — заявки на формирование</Typography.Body>
      {sverkiRequestsLoading ? (
        <Flex align="center" gap="0.5rem" style={{ marginBottom: "0.5rem" }}>
          <Loader2 className="w-4 h-4 animate-spin" />
          <Typography.Body style={{ fontSize: "0.82rem" }}>Загрузка заявок...</Typography.Body>
        </Flex>
      ) : sverkiRequests.length === 0 ? (
        <Typography.Body style={{ fontSize: "0.82rem", color: "var(--color-text-secondary)" }}>Заявок пока нет</Typography.Body>
      ) : (
        <div style={{ maxHeight: 260, overflowY: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
            <thead>
              <tr style={{ background: "var(--color-bg-hover)", borderBottom: "1px solid var(--color-border)" }}>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>Создано</th>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>Логин</th>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>ИНН</th>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>Договор</th>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>Период</th>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>Статус</th>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>Действие</th>
              </tr>
            </thead>
            <tbody>
              {sverkiRequests.map((r) => {
                const isPending = r.status === "pending";
                return (
                  <tr key={r.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                    <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{formatDisplayDate(r.createdAt)}</td>
                    <td style={{ padding: "6px 8px" }}>{r.login || "—"}</td>
                    <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{r.customerInn || "—"}</td>
                    <td style={{ padding: "6px 8px" }}>{r.contract || "—"}</td>
                    <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>
                      {formatDisplayDate(r.periodFrom)} - {formatDisplayDate(r.periodTo)}
                    </td>
                    <td style={{ padding: "6px 8px" }}>
                      <span style={{
                        fontSize: "0.7rem",
                        padding: "0.15rem 0.45rem",
                        borderRadius: 999,
                        fontWeight: 600,
                        background: isPending ? "rgba(59,130,246,0.15)" : "rgba(16,185,129,0.15)",
                        color: isPending ? "#3b82f6" : "#10b981",
                        whiteSpace: "nowrap",
                      }}>
                        {isPending ? "Ожидает формирования" : "Отправлена в ЭДО"}
                      </span>
                    </td>
                    <td style={{ padding: "6px 8px" }}>
                      <Flex gap="0.35rem" wrap="wrap">
                        {isPending && (
                          <button
                            type="button"
                            onClick={() => markSverkiRequestAsSent(r.id)}
                            disabled={sverkiRequestsUpdatingId === r.id}
                            style={{ fontSize: "0.68rem", padding: "0.2rem 0.45rem", borderRadius: 6, border: "1px solid #2563eb", background: "transparent", color: "#2563eb", cursor: "pointer" }}
                          >
                            {sverkiRequestsUpdatingId === r.id ? "..." : "Сформировано"}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => deleteSverkiRequest(r.id)}
                          disabled={sverkiRequestsUpdatingId === r.id}
                          style={{ fontSize: "0.68rem", padding: "0.2rem 0.45rem", borderRadius: 6, border: "1px solid #b91c1c", background: "transparent", color: "#b91c1c", cursor: "pointer" }}
                        >
                          Удалить
                        </button>
                      </Flex>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
