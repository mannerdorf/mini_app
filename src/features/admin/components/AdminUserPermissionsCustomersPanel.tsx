import { Button, Typography } from "@maxhub/max-ui";
import { Trash2 } from "lucide-react";
import type { AdminUserEditorState } from "../hooks/useAdminUserEditor";

type Props = {
  customerDirectoryMap: Record<string, string>;
  editor: AdminUserEditorState;
};

export function AdminUserPermissionsCustomersPanel({ customerDirectoryMap, editor }: Props) {
  const { editorPermissions, editorAccessAllInns, editorCustomers, setEditorCustomers, setEditorCustomerPickOpen } = editor;

  if (editorPermissions.service_mode || editorAccessAllInns) return null;

  return (
    <div style={{ marginBottom: "1rem" }}>
      <Typography.Body style={{ marginBottom: "0.25rem", fontSize: "0.85rem" }}>Заказчик</Typography.Body>
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "flex-start" }}>
        <div
          role="button"
          tabIndex={0}
          onClick={() => setEditorCustomerPickOpen(true)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setEditorCustomerPickOpen(true); } }}
          style={{
            flex: 1,
            minHeight: 80,
            maxHeight: 160,
            padding: "0.5rem 0.75rem",
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
          {editorCustomers.length === 0 ? (
            <Typography.Body style={{ color: "var(--color-text-secondary)" }}>Не выбран</Typography.Body>
          ) : (
            editorCustomers.map((cust) => (
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
                <Typography.Body style={{ fontWeight: 600, fontSize: "0.85rem" }}>
                  {(customerDirectoryMap[cust.inn] || cust.customer_name || cust.inn)}
                  {customerDirectoryMap[cust.inn] || cust.customer_name ? ` · ${cust.inn}` : ""}
                </Typography.Body>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setEditorCustomers((prev) => prev.filter((c) => c.inn !== cust.inn)); }}
                  style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}
                  aria-label="Удалить заказчика"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <Button type="button" className="filter-button" onClick={() => setEditorCustomerPickOpen(true)}>Подбор</Button>
          {editorCustomers.length > 0 && (
            <Button type="button" className="filter-button" style={{ padding: "0.4rem 0.75rem", fontSize: "0.8rem" }} onClick={() => setEditorCustomers([])}>
              Очистить
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
