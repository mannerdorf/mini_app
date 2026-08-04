import { Button, Typography } from "@maxhub/max-ui";
import { Trash2 } from "lucide-react";
import type { AdminUserRegistrationState } from "../hooks/useAdminUserRegistration";

type Props = {
  customerDirectoryMap: Record<string, string>;
  registration: AdminUserRegistrationState;
};

export function AdminUserAddCustomerSection({ customerDirectoryMap, registration }: Props) {
  const {
    formAccessAllInns,
    formPermissions,
    selectedCustomers,
    setCustomerPickModalOpen,
    removeSelectedCustomer,
    clearCustomerSelection,
  } = registration;

  return (
    <div style={{ marginBottom: "1rem" }}>
      <Typography.Body style={{ marginBottom: "0.25rem", fontSize: "0.85rem" }}>Заказчик</Typography.Body>
      {(formAccessAllInns || formPermissions.service_mode) ? (
        <Typography.Body style={{ fontSize: "0.9rem", color: "var(--color-text-secondary)" }}>
          Служебный режим — выбор заказчика не требуется
        </Typography.Body>
      ) : (
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <div
            role="button"
            tabIndex={0}
            onClick={() => setCustomerPickModalOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setCustomerPickModalOpen(true);
              }
            }}
            style={{
              flex: 1,
              minHeight: 160,
              maxHeight: 260,
              padding: "0.75rem",
              background: "var(--color-bg-input)",
              border: "1px solid var(--color-border)",
              borderRadius: 8,
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: "0.5rem",
              cursor: "pointer",
            }}
            aria-label="Выбрать заказчика"
          >
            {selectedCustomers.length === 0 ? (
              <Typography.Body style={{ color: "var(--color-text-secondary)" }}>Не выбран</Typography.Body>
            ) : (
              selectedCustomers.map((cust) => (
                <div
                  key={cust.inn}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "0.35rem 0.5rem",
                    borderRadius: 6,
                    background: "var(--color-bg-hover)",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <Typography.Body style={{ fontWeight: 600, fontSize: "0.85rem" }}>
                      {(customerDirectoryMap[cust.inn] || cust.customer_name || cust.inn)}
                      {(customerDirectoryMap[cust.inn] || cust.customer_name) ? ` · ${cust.inn}` : ""}
                    </Typography.Body>
                    {cust.email && (
                      <Typography.Body style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)" }}>
                        {cust.email}
                      </Typography.Body>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); removeSelectedCustomer(cust.inn); }}
                    style={{
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                      color: "var(--color-text-secondary)",
                    }}
                    aria-label="Удалить заказчика"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              ))
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <Button className="filter-button" type="button" onClick={() => setCustomerPickModalOpen(true)}>
              Подбор
            </Button>
            {selectedCustomers.length > 0 && (
              <Button
                className="filter-button"
                type="button"
                onClick={clearCustomerSelection}
                style={{ padding: "0.4rem 0.75rem", fontSize: "0.8rem" }}
              >
                Очистить
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
