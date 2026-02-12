import React, { useState, useEffect, useCallback } from "react";
import { Button, Flex, Typography, Input } from "@maxhub/max-ui";
import { X, Loader2 } from "lucide-react";

export type CustomerItem = { inn: string; customer_name: string; email: string };

type CustomerPickModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (c: CustomerItem) => void;
  fetchCustomers: (query: string) => Promise<CustomerItem[]>;
};

export function CustomerPickModal({ isOpen, onClose, onSelect, fetchCustomers }: CustomerPickModalProps) {
  const [search, setSearch] = useState("");
  const [list, setList] = useState<CustomerItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (q: string) => {
      setLoading(true);
      setError(null);
      try {
        const customers = await fetchCustomers(q);
        setList(customers);
      } catch (e) {
        setError((e as Error)?.message || "Ошибка загрузки");
        setList([]);
      } finally {
        setLoading(false);
      }
    },
    [fetchCustomers]
  );

  useEffect(() => {
    if (isOpen) {
      setSearch("");
      load("");
    }
  }, [isOpen, load]);

  useEffect(() => {
    if (!isOpen) return;
    const delay = search.length >= 2 ? 300 : 0;
    const t = setTimeout(() => load(search), delay);
    return () => clearTimeout(t);
  }, [search, isOpen, load]);

  if (!isOpen) return null;

  const handleSelect = (c: CustomerItem) => {
    onSelect(c);
  };

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{ zIndex: 10000 }}
    >
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: "520px", width: "95vw", maxHeight: "80vh", display: "flex", flexDirection: "column" }}
      >
        <div className="modal-header" style={{ flexShrink: 0 }}>
          <Typography.Headline>Подбор заказчика</Typography.Headline>
          <Button className="modal-close-button" onClick={onClose} aria-label="Закрыть">
            <X size={20} />
          </Button>
        </div>
        <div style={{ padding: "0 1rem", flexShrink: 0 }}>
          <Input
            className="admin-form-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по ИНН или наименованию"
            style={{ width: "100%", marginBottom: "0.75rem" }}
          />
        </div>
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            minHeight: 200,
            borderTop: "1px solid var(--color-border)",
          }}
        >
          {loading ? (
            <Flex align="center" justify="center" style={{ padding: "2rem" }}>
              <Loader2 className="animate-spin" size={24} style={{ color: "var(--color-text-secondary)" }} />
            </Flex>
          ) : error ? (
            <Typography.Body style={{ padding: "1rem", color: "var(--color-error)" }}>{error}</Typography.Body>
          ) : list.length === 0 ? (
            <Typography.Body style={{ padding: "1rem", color: "var(--color-text-secondary)" }}>
              {search.length >= 2 ? "Нет совпадений" : "Справочник пуст. Проверьте крон refresh-cache и таблицу cache_customers."}
            </Typography.Body>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
              <thead>
                <tr style={{ background: "var(--color-bg-hover)", borderBottom: "1px solid var(--color-border)" }}>
                  <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>N</th>
                  <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>Заказчик</th>
                </tr>
              </thead>
              <tbody>
                {list.map((c, i) => (
                  <tr
                    key={c.inn}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleSelect(c)}
                    onKeyDown={(e) => e.key === "Enter" && handleSelect(c)}
                    style={{
                      cursor: "pointer",
                      borderBottom: "1px solid var(--color-border)",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "var(--color-bg-hover)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <td style={{ padding: "0.5rem 0.75rem", width: 40 }}>{i + 1}</td>
                    <td style={{ padding: "0.5rem 0.75rem" }}>
                      <Typography.Body>
                        <span style={{ fontWeight: 600 }}>{c.inn}</span>
                        {" · "}
                        {c.customer_name}
                        {c.email ? ` · ${c.email}` : ""}
                      </Typography.Body>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="modal-footer" style={{ flexShrink: 0 }}>
          <Button className="filter-button" onClick={onClose}>
            Закрыть
          </Button>
        </div>
      </div>
    </div>
  );
}
