import React, { useState, useEffect, useCallback, useRef } from "react";
import { Button, Flex, Panel, Typography, Input } from "@maxhub/max-ui";
import { ArrowLeft, Users, Mail, Loader2, Plus, Settings } from "lucide-react";

type CustomerSuggestion = { inn: string; customer_name: string; email: string };

const PERMISSION_KEYS = [
  { key: "cms_access", label: "Доступ в CMS" },
  { key: "cargo", label: "Грузы" },
  { key: "doc_invoices", label: "Счета" },
  { key: "doc_acts", label: "УПД" },
  { key: "doc_orders", label: "Заявки" },
  { key: "doc_claims", label: "Претензии" },
  { key: "doc_contracts", label: "Договоры" },
  { key: "doc_acts_settlement", label: "Акты сверок" },
  { key: "doc_tariffs", label: "Тарифы" },
  { key: "chat", label: "Чат" },
] as const;

type AdminPageProps = {
  adminToken: string;
  onBack: () => void;
};

type User = {
  id: number;
  login: string;
  inn: string;
  company_name: string;
  permissions: Record<string, boolean>;
  financial_access: boolean;
  access_all_inns?: boolean;
  active: boolean;
  created_at: string;
};

export function AdminPage({ adminToken, onBack }: AdminPageProps) {
  const [tab, setTab] = useState<"users" | "add" | "email">("users");
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formAccessAllInns, setFormAccessAllInns] = useState(false);
  const [formInn, setFormInn] = useState("");
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPermissions, setFormPermissions] = useState<Record<string, boolean>>({
    cms_access: false,
    cargo: true,
    doc_invoices: true,
    doc_acts: true,
    doc_orders: false,
    doc_claims: false,
    doc_contracts: false,
    doc_acts_settlement: false,
    doc_tariffs: false,
    chat: true,
  });
  const [formFinancial, setFormFinancial] = useState(true);
  const [formSendEmail, setFormSendEmail] = useState(true);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formResult, setFormResult] = useState<{ password?: string; emailSent?: boolean } | null>(null);

  const [emailHost, setEmailHost] = useState("");
  const [emailPort, setEmailPort] = useState("");
  const [emailUser, setEmailUser] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [emailFrom, setEmailFrom] = useState("");
  const [emailFromName, setEmailFromName] = useState("HAULZ");
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailTestLoading, setEmailTestLoading] = useState(false);
  const [emailTestResult, setEmailTestResult] = useState<{ ok: boolean; message?: string; error?: string } | null>(null);

  const [customersSuggestions, setCustomersSuggestions] = useState<CustomerSuggestion[]>([]);
  const [customersSearchLoading, setCustomersSearchLoading] = useState(false);
  const [customersDropdownOpen, setCustomersDropdownOpen] = useState(false);
  const [customerSearchQuery, setCustomerSearchQuery] = useState("");
  const customersSearchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const customerSelectRef = useRef<HTMLDivElement>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin-users", {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (!res.ok) throw new Error("Ошибка загрузки");
      const data = await res.json();
      setUsers(data.users || []);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [adminToken]);

  const fetchEmailSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/admin-email-settings", {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setEmailHost(data.smtp_host || "");
      setEmailPort(String(data.smtp_port || ""));
      setEmailUser(data.smtp_user || "");
      setEmailFrom(data.from_email || "");
      setEmailFromName(data.from_name || "HAULZ");
    } catch {
      //
    }
  }, [adminToken]);

  useEffect(() => {
    if (tab === "users") fetchUsers();
    if (tab === "email") fetchEmailSettings();
  }, [tab, fetchUsers, fetchEmailSettings]);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormSubmitting(true);
    setFormResult(null);
    try {
      const res = await fetch("/api/admin-register-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          inn: formInn.trim(),
          company_name: formName.trim(),
          email: formEmail.trim(),
          send_email: formSendEmail,
          permissions: formPermissions,
          financial_access: formFinancial,
          access_all_inns: formAccessAllInns,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Ошибка");
      setFormResult({ password: data.password, emailSent: data.emailSent });
      setFormInn("");
      setFormName("");
      setFormEmail("");
      setCustomerSearchQuery("");
      setCustomersDropdownOpen(false);
      setCustomersSuggestions([]);
      fetchUsers();
      setTab("users");
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleSaveEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailSaving(true);
    try {
      const res = await fetch("/api/admin-email-settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          smtp_host: emailHost.trim() || undefined,
          smtp_port: emailPort ? parseInt(emailPort, 10) : undefined,
          smtp_user: emailUser.trim() || undefined,
          smtp_password: emailPassword.trim() || undefined,
          from_email: emailFrom.trim() || undefined,
          from_name: emailFromName.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error("Ошибка сохранения");
      setEmailPassword("");
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setEmailSaving(false);
    }
  };

  const togglePerm = (key: string) => {
    setFormPermissions((p) => ({ ...p, [key]: !p[key] }));
  };

  const loadCustomersFromDirectory = useCallback(
    async (query: string) => {
      setCustomersSearchLoading(true);
      try {
        const res = await fetch(
          `/api/admin-customers-search?q=${encodeURIComponent(query)}&limit=100`,
          { headers: { Authorization: `Bearer ${adminToken}` } }
        );
        if (!res.ok) return;
        const data = await res.json();
        setCustomersSuggestions(data.customers || []);
        setCustomersDropdownOpen(true);
      } catch {
        setCustomersSuggestions([]);
      } finally {
        setCustomersSearchLoading(false);
      }
    },
    [adminToken]
  );

  const onCustomerSearchChange = (value: string) => {
    if (formAccessAllInns) return;
    setCustomerSearchQuery(value);
    if (customersSearchRef.current) clearTimeout(customersSearchRef.current);
    customersSearchRef.current = setTimeout(() => loadCustomersFromDirectory(value.trim()), 250);
  };

  const selectCustomer = (c: CustomerSuggestion) => {
    setFormInn(c.inn);
    setFormName(c.customer_name || c.inn);
    if (c.email) setFormEmail(c.email);
    setCustomersDropdownOpen(false);
    setCustomersSuggestions([]);
    setCustomerSearchQuery("");
  };

  const clearCustomerSelection = () => {
    setFormInn("");
    setFormName("");
    setCustomersDropdownOpen(false);
    setCustomersSuggestions([]);
    setCustomerSearchQuery("");
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (customerSelectRef.current && !customerSelectRef.current.contains(e.target as Node)) {
        setCustomersDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="w-full">
      <Flex align="center" style={{ marginBottom: "1rem", gap: "0.75rem" }}>
        <Button className="filter-button" onClick={onBack} style={{ padding: "0.5rem" }}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <Typography.Headline style={{ fontSize: "1.25rem" }}>CMS</Typography.Headline>
      </Flex>

      <Flex gap="0.5rem" style={{ marginBottom: "1rem", flexWrap: "wrap" }}>
        <Button
          className="filter-button"
          style={{ background: tab === "users" ? "var(--color-primary-blue)" : undefined, color: tab === "users" ? "white" : undefined }}
          onClick={() => setTab("users")}
        >
          <Users className="w-4 h-4" style={{ marginRight: "0.35rem" }} />
          Пользователи
        </Button>
        <Button
          className="filter-button"
          style={{ background: tab === "add" ? "var(--color-primary-blue)" : undefined, color: tab === "add" ? "white" : undefined }}
          onClick={() => setTab("add")}
        >
          <Plus className="w-4 h-4" style={{ marginRight: "0.35rem" }} />
          Регистрация
        </Button>
        <Button
          className="filter-button"
          style={{ background: tab === "email" ? "var(--color-primary-blue)" : undefined, color: tab === "email" ? "white" : undefined }}
          onClick={() => setTab("email")}
        >
          <Settings className="w-4 h-4" style={{ marginRight: "0.35rem" }} />
          Почта
        </Button>
      </Flex>

      {error && (
        <Typography.Body style={{ color: "var(--color-error)", marginBottom: "1rem", fontSize: "0.9rem" }}>{error}</Typography.Body>
      )}

      {tab === "users" && (
        <Panel className="cargo-card" style={{ padding: "1rem" }}>
          {loading ? (
            <Flex align="center" gap="0.5rem">
              <Loader2 className="w-4 h-4 animate-spin" />
              <Typography.Body>Загрузка...</Typography.Body>
            </Flex>
          ) : users.length === 0 ? (
            <Typography.Body style={{ color: "var(--color-text-secondary)" }}>Нет зарегистрированных пользователей</Typography.Body>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {users.map((u) => (
                <div
                  key={u.id}
                  style={{
                    padding: "0.75rem",
                    border: "1px solid var(--color-border)",
                    borderRadius: "8px",
                    background: "var(--color-bg-hover)",
                  }}
                >
                  <Typography.Body style={{ fontWeight: 600 }}>{u.company_name || u.login}</Typography.Body>
                  <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>
                    {u.login} · {u.access_all_inns ? "все ИНН" : `ИНН ${u.inn}`} · {u.financial_access ? "Фин. да" : "Фин. нет"}
                  </Typography.Body>
                </div>
              ))}
            </div>
          )}
        </Panel>
      )}

      {tab === "add" && (
        <Panel className="cargo-card" style={{ padding: "1rem" }}>
          <form onSubmit={handleAddUser}>
            <div style={{ marginBottom: "1rem" }}>
              <Flex align="center" style={{ marginBottom: "0.5rem" }}>
                <input
                  type="checkbox"
                  checked={formAccessAllInns}
                  onChange={(e) => {
                    const v = e.target.checked;
                    setFormAccessAllInns(v);
                    if (v) clearCustomerSelection();
                  }}
                  id="accessAllInns"
                />
                <label htmlFor="accessAllInns" style={{ marginLeft: "0.5rem", fontSize: "0.9rem" }}>Доступ ко всем заказчикам (ко всем ИНН)</label>
              </Flex>
            </div>
            <div ref={customerSelectRef} style={{ marginBottom: "1rem", position: "relative" }}>
              <Typography.Body style={{ marginBottom: "0.25rem", fontSize: "0.85rem" }}>Заказчик (из справочника)</Typography.Body>
              {formAccessAllInns ? (
                <Typography.Body style={{ fontSize: "0.9rem", color: "var(--color-text-secondary)" }}>Доступ ко всем заказчикам — выбор не требуется</Typography.Body>
              ) : formInn ? (
                <div
                  style={{
                    padding: "0.75rem",
                    background: "var(--color-bg-input)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Typography.Body style={{ fontWeight: 500 }}>{formInn} · {formName}</Typography.Body>
                  <Button className="filter-button" type="button" onClick={clearCustomerSelection} style={{ padding: "0.25rem 0.5rem", fontSize: "0.8rem" }}>
                    Изменить
                  </Button>
                </div>
              ) : (
                <>
                  <Input
                    className="admin-form-input"
                    value={customerSearchQuery}
                    onChange={(e) => onCustomerSearchChange(e.target.value)}
                    onFocus={() => !customersDropdownOpen && loadCustomersFromDirectory(customerSearchQuery.trim())}
                    placeholder="Выберите заказчика: введите ИНН или наименование для поиска"
                    style={{ width: "100%" }}
                  />
                  {customersDropdownOpen && (customersSuggestions.length > 0 || customersSearchLoading) && (
                    <div
                      style={{
                        position: "absolute",
                        top: "100%",
                        left: 0,
                        right: 0,
                        marginTop: 2,
                        maxHeight: 260,
                        overflowY: "auto",
                        background: "var(--color-bg-card)",
                        border: "1px solid var(--color-border)",
                        borderRadius: 8,
                        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                        zIndex: 100,
                      }}
                    >
                      {customersSearchLoading ? (
                        <div style={{ padding: "0.75rem", color: "var(--color-text-secondary)", fontSize: "0.85rem" }}>Загрузка справочника...</div>
                      ) : customersSuggestions.length === 0 ? (
                        <div style={{ padding: "0.75rem", color: "var(--color-text-secondary)", fontSize: "0.85rem" }}>Нет совпадений. Справочник обновляется по крону каждые 15 мин.</div>
                      ) : (
                        customersSuggestions.map((c) => (
                          <div
                            key={c.inn}
                            role="button"
                            tabIndex={0}
                            onClick={() => selectCustomer(c)}
                            onKeyDown={(e) => e.key === "Enter" && selectCustomer(c)}
                            style={{
                              padding: "0.5rem 0.75rem",
                              cursor: "pointer",
                              fontSize: "0.9rem",
                              borderBottom: "1px solid var(--color-border)",
                            }}
                          >
                            <Typography.Body style={{ fontSize: "0.9rem" }}>
                              <span style={{ fontWeight: 600 }}>{c.inn}</span>
                              {" · "}
                              {c.customer_name}
                              {c.email ? (
                                <>
                                  {" · "}
                                  {c.email}
                                </>
                              ) : null}
                            </Typography.Body>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
            <div style={{ marginBottom: "1rem" }}>
              <Typography.Body style={{ marginBottom: "0.25rem", fontSize: "0.85rem" }}>Email (логин)</Typography.Body>
              <Input className="admin-form-input" type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} placeholder="user@example.com" required style={{ width: "100%" }} />
            </div>
            <div style={{ marginBottom: "1rem" }}>
              <Flex align="center" style={{ marginBottom: "0.5rem" }}>
                <input type="checkbox" checked={formFinancial} onChange={(e) => setFormFinancial(e.target.checked)} id="fin" />
                <label htmlFor="fin" style={{ marginLeft: "0.5rem", fontSize: "0.9rem" }}>Финансовые показатели</label>
              </Flex>
            </div>
            <div style={{ marginBottom: "1rem" }}>
              <Typography.Body style={{ marginBottom: "0.5rem", fontSize: "0.85rem" }}>Разделы</Typography.Body>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                {PERMISSION_KEYS.map(({ key, label }) => (
                  <Flex key={key} align="center" style={{ minWidth: "120px" }}>
                    <input type="checkbox" checked={!!formPermissions[key]} onChange={() => togglePerm(key)} id={`perm-${key}`} />
                    <label htmlFor={`perm-${key}`} style={{ marginLeft: "0.35rem", fontSize: "0.8rem" }}>{label}</label>
                  </Flex>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: "1rem" }}>
              <Flex align="center">
                <input type="checkbox" checked={formSendEmail} onChange={(e) => setFormSendEmail(e.target.checked)} id="sendEmail" />
                <label htmlFor="sendEmail" style={{ marginLeft: "0.5rem", fontSize: "0.9rem" }}>Отправить пароль на email</label>
              </Flex>
            </div>
            {formResult?.password && (
              <Typography.Body style={{ marginBottom: "1rem", color: "var(--color-success-status)", fontSize: "0.9rem" }}>
                Пароль: {formResult.password}
                {formResult.emailSent ? " (отправлен на email)" : " — сохраните, email не отправлен"}
              </Typography.Body>
            )}
            <Button type="submit" className="filter-button" disabled={formSubmitting}>
              {formSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Зарегистрировать"}
            </Button>
          </form>
        </Panel>
      )}

      {tab === "email" && (
        <Panel className="cargo-card" style={{ padding: "1rem" }}>
          <form onSubmit={handleSaveEmail}>
            <div style={{ marginBottom: "1rem" }}>
              <Typography.Body style={{ marginBottom: "0.25rem", fontSize: "0.85rem" }}>SMTP хост</Typography.Body>
              <Input className="admin-form-input" value={emailHost} onChange={(e) => setEmailHost(e.target.value)} placeholder="smtp.example.com" style={{ width: "100%" }} />
            </div>
            <div style={{ marginBottom: "1rem" }}>
              <Typography.Body style={{ marginBottom: "0.25rem", fontSize: "0.85rem" }}>SMTP порт</Typography.Body>
              <Input className="admin-form-input" type="number" value={emailPort} onChange={(e) => setEmailPort(e.target.value)} placeholder="587" style={{ width: "100%" }} />
            </div>
            <div style={{ marginBottom: "1rem" }}>
              <Typography.Body style={{ marginBottom: "0.25rem", fontSize: "0.85rem" }}>SMTP пользователь</Typography.Body>
              <Input className="admin-form-input" value={emailUser} onChange={(e) => setEmailUser(e.target.value)} placeholder="user@example.com" style={{ width: "100%" }} />
            </div>
            <div style={{ marginBottom: "1rem" }}>
              <Typography.Body style={{ marginBottom: "0.25rem", fontSize: "0.85rem" }}>SMTP пароль</Typography.Body>
              <Input className="admin-form-input" type="password" value={emailPassword} onChange={(e) => setEmailPassword(e.target.value)} placeholder="••••••••" autoComplete="new-password" style={{ width: "100%" }} />
              <Typography.Body style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", marginTop: "0.25rem" }}>Оставьте пустым, чтобы не менять</Typography.Body>
            </div>
            <div style={{ marginBottom: "1rem" }}>
              <Typography.Body style={{ marginBottom: "0.25rem", fontSize: "0.85rem" }}>От кого (email)</Typography.Body>
              <Input className="admin-form-input" type="email" value={emailFrom} onChange={(e) => setEmailFrom(e.target.value)} placeholder="noreply@haulz.ru" style={{ width: "100%" }} />
            </div>
            <div style={{ marginBottom: "1rem" }}>
              <Typography.Body style={{ marginBottom: "0.25rem", fontSize: "0.85rem" }}>От кого (имя)</Typography.Body>
              <Input className="admin-form-input" value={emailFromName} onChange={(e) => setEmailFromName(e.target.value)} placeholder="HAULZ" style={{ width: "100%" }} />
            </div>
            <Flex gap="0.5rem" style={{ flexWrap: "wrap" }}>
              <Button type="submit" className="filter-button" disabled={emailSaving}>
                {emailSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Сохранить"}
              </Button>
              <Button
                type="button"
                className="filter-button"
                disabled={emailTestLoading || !emailHost.trim()}
                onClick={async () => {
                  setEmailTestResult(null);
                  setEmailTestLoading(true);
                  try {
                    const res = await fetch("/api/admin-email-test", {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${adminToken}`,
                      },
                      body: JSON.stringify({
                        smtp_host: emailHost.trim(),
                        smtp_port: emailPort ? parseInt(emailPort, 10) : 587,
                        smtp_user: emailUser.trim() || undefined,
                        smtp_password: emailPassword.trim() || undefined,
                      }),
                    });
                    const data = await res.json();
                    setEmailTestResult({ ok: data.ok, message: data.message, error: data.error });
                  } catch (e: unknown) {
                    setEmailTestResult({ ok: false, error: (e as Error).message || "Ошибка запроса" });
                  } finally {
                    setEmailTestLoading(false);
                  }
                }}
              >
                {emailTestLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Тест"}
              </Button>
            </Flex>
            {emailTestResult && (
              <Typography.Body
                style={{
                  marginTop: "0.75rem",
                  fontSize: "0.9rem",
                  color: emailTestResult.ok ? "var(--color-success-status)" : "var(--color-error)",
                }}
              >
                {emailTestResult.ok ? "✓ " + (emailTestResult.message || "Подключение успешно") : "✗ " + (emailTestResult.error || "Ошибка")}
              </Typography.Body>
            )}
          </form>
        </Panel>
      )}
    </div>
  );
}
