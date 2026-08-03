import React from "react";
import { Button, Flex, Typography } from "@maxhub/max-ui";
import { ChevronDown, ChevronUp, ChevronsUpDown, Loader2 } from "lucide-react";
import type { AdminCustomersState } from "../hooks/useAdminCustomers";

type Props = Pick<
  AdminCustomersState,
  | "loading"
  | "list"
  | "search"
  | "showOnlyWithoutEmail"
  | "sorted"
  | "sortBy"
  | "sortOrder"
  | "toggleSort"
  | "registeringInn"
  | "registerCustomer"
  | "isCustomerRegistered"
>;

const thStyle: React.CSSProperties = { padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600, cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" };
const thClass = "sortable-th";

export function AdminCustomersTable({
  loading,
  list,
  search,
  showOnlyWithoutEmail,
  sorted,
  sortBy,
  sortOrder,
  toggleSort,
  registeringInn,
  registerCustomer,
  isCustomerRegistered,
}: Props) {
  return (
    <>
      {loading ? (
        <Flex align="center" gap="0.5rem">
          <Loader2 className="w-4 h-4 animate-spin" />
          <Typography.Body>Загрузка...</Typography.Body>
        </Flex>
      ) : list.length === 0 ? (
        <Typography.Body style={{ color: "var(--color-text-secondary)" }}>
          {search.trim().length >= 2 ? "Нет совпадений" : "Справочник пуст"}
        </Typography.Body>
      ) : (
        <>
          <div style={{ overflowX: "auto", maxHeight: "60vh", overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
              <thead>
                <tr style={{ background: "var(--color-bg-hover)", borderBottom: "1px solid var(--color-border)" }}>
                  <th className={thClass} style={thStyle} onClick={() => toggleSort("inn")} role="columnheader" aria-sort={sortBy === "inn" ? (sortOrder === "asc" ? "ascending" : "descending") : undefined} title="Нажмите для сортировки">
                    ИНН {sortBy === "inn" ? (sortOrder === "asc" ? <ChevronUp size={14} style={{ verticalAlign: "middle", marginLeft: 2 }} /> : <ChevronDown size={14} style={{ verticalAlign: "middle", marginLeft: 2 }} />) : <ChevronsUpDown size={14} style={{ verticalAlign: "middle", marginLeft: 2, opacity: 0.5 }} />}
                  </th>
                  <th className={thClass} style={thStyle} onClick={() => toggleSort("customer_name")} role="columnheader" aria-sort={sortBy === "customer_name" ? (sortOrder === "asc" ? "ascending" : "descending") : undefined} title="Нажмите для сортировки">
                    Наименование {sortBy === "customer_name" ? (sortOrder === "asc" ? <ChevronUp size={14} style={{ verticalAlign: "middle", marginLeft: 2 }} /> : <ChevronDown size={14} style={{ verticalAlign: "middle", marginLeft: 2 }} />) : <ChevronsUpDown size={14} style={{ verticalAlign: "middle", marginLeft: 2, opacity: 0.5 }} />}
                  </th>
                  <th className={thClass} style={thStyle} onClick={() => toggleSort("email")} role="columnheader" aria-sort={sortBy === "email" ? (sortOrder === "asc" ? "ascending" : "descending") : undefined} title="Нажмите для сортировки">
                    Email {sortBy === "email" ? (sortOrder === "asc" ? <ChevronUp size={14} style={{ verticalAlign: "middle", marginLeft: 2 }} /> : <ChevronDown size={14} style={{ verticalAlign: "middle", marginLeft: 2 }} />) : <ChevronsUpDown size={14} style={{ verticalAlign: "middle", marginLeft: 2, opacity: 0.5 }} />}
                  </th>
                  <th style={{ ...thStyle, cursor: "default", minWidth: "10rem" }}>Действия</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((c) => {
                  const hasEmail = !!(c.email && String(c.email).trim());
                  const isRegistered = isCustomerRegistered(c);
                  const canRegister = hasEmail && !isRegistered;
                  const isRegistering = registeringInn === c.inn;
                  return (
                    <tr key={c.inn} style={{ borderBottom: "1px solid var(--color-border)" }}>
                      <td style={{ padding: "0.5rem 0.75rem" }}>{c.inn}</td>
                      <td style={{ padding: "0.5rem 0.75rem" }}>{c.customer_name || "—"}</td>
                      <td style={{ padding: "0.5rem 0.75rem", color: "var(--color-text-secondary)" }}>{c.email || "—"}</td>
                      <td style={{ padding: "0.5rem 0.75rem" }}>
                        {canRegister ? (
                          <Button
                            type="button"
                            className="filter-button"
                            style={{ padding: "0.35rem 0.6rem", fontSize: "0.8rem" }}
                            disabled={isRegistering}
                            onClick={() => void registerCustomer(c)}
                          >
                            {isRegistering ? <Loader2 className="w-4 h-4 animate-spin" style={{ verticalAlign: "middle", marginRight: "0.25rem" }} /> : null}
                            Зарегистрировать
                          </Button>
                        ) : isRegistered ? (
                          <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>В списке пользователей</Typography.Body>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Typography.Body style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", marginTop: "0.5rem" }}>
            Записей: {sorted.length}{showOnlyWithoutEmail && sorted.length !== list.length ? ` (из ${list.length})` : ""}
          </Typography.Body>
        </>
      )}
    </>
  );
}
