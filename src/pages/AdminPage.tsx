import React, { useState, useEffect, useCallback } from "react";
import { Button, Flex, Panel, Typography, Input } from "@maxhub/max-ui";
import { ArrowLeft, Users, Mail, Loader2, Plus, Settings, LogOut } from "lucide-react";
import { TapSwitch } from "../components/TapSwitch";
import { CustomerPickModal, type CustomerItem } from "../components/modals/CustomerPickModal";


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
  { key: "service_mode", label: "Служебный режим" },
] as const;

type AdminPageProps = {
  adminToken: string;
  onBack: () => void;
  onLogout?: () => void;
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

function UserRow({
  user,
  adminToken,
  onToggleActive,
}: {
  user: User;
  adminToken: string;
  onToggleActive: () => Promise<void>;
}) {
  const [loading, setLoading] = useState(false);
  const handleToggle = async () => {
    setLoading(true);
    try {
      await onToggleActive();
    } finally {
      setLoading(false);
    }
  };
  return (
    <div
      style={{
        padding: "0.75rem",
        border: "1px solid var(--color-border)",
        borderRadius: "8px",
        background: user.active ? "var(--color-bg-hover)" : "var(--color-bg-input)",
        opacity: user.active ? 1 : 0.85,
      }}
    >
      <Flex justify="space-between" align="flex-start" wrap="wrap" gap="0.5rem">
        <div style={{ flex: 1, minWidth: 0 }}>
          <Typography.Body style={{ fontWeight: 600 }}>{user.company_name || user.login}</Typography.Body>
          <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>
            {user.login} · {user.access_all_inns ? "все ИНН" : `ИНН ${user.inn}`} · {user.financial_access ? "Фин. да" : "Фин. нет"}
          </Typography.Body>
        </div>
        <Flex align="center" gap="0.5rem" style={{ flexShrink: 0 }}>
          <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>Профиль</Typography.Body>
          <span onClick={(e) => e.stopPropagation()} style={{ cursor: loading ? "wait" : "pointer" }}>
            <TapSwitch checked={user.active} onToggle={handleToggle} />
          </span>
        </Flex>
      </Flex>
    </div>
  );
}

export function AdminPage({ adminToken, onBack, onLogout }: AdminPageProps) {
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
    service_mode: false,
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

  const [customerPickModalOpen, setCustomerPickModalOpen] = useState(false);

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
    setError(null);
    try {
      const res = await fetch("/api/admin-email-settings", {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data?.error as string) || "Ошибка загрузки настроек почты");
        return;
      }
      setEmailHost(data.smtp_host || "");
      setEmailPort(String(data.smtp_port ?? ""));
      setEmailUser(data.smtp_user || "");
      setEmailFrom(data.from_email || "");
      setEmailFromName(data.from_name || "HAULZ");
    } catch (e: unknown) {
      setError((e as Error)?.message || "Ошибка загрузки настроек почты");
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
      setCustomerPickModalOpen(false);
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
    setError(null);
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
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data?.error as string) || "Ошибка сохранения");
      setEmailPassword("");
      setError(null);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setEmailSaving(false);
    }
  };

  const togglePerm = (key: string) => {
    setFormPermissions((p) => ({ ...p, [key]: !p[key] }));
  };

  const fetchCustomersForModal = useCallback(
    async (query: string): Promise<CustomerItem[]> => {
      const res = await fetch(
        `/api/admin-customers-search?q=${encodeURIComponent(query)}&limit=200`,
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data?.error as string) || "Ошибка загрузки справочника");
      return data.customers || [];
    },
    [adminToken]
  );

  const selectCustomer = (c: CustomerItem) => {
    setFormInn(c.inn);
    setFormName(c.customer_name || c.inn);
    if (c.email) setFormEmail(c.email);
  };

  const clearCustomerSelection = () => {
    setFormInn("");
    setFormName("");
  };

  return (
    <div className="w-full">
      <Flex align="center" justify="space-between" style={{ marginBottom: "1rem", gap: "0.75rem", flexWrap: "wrap" }}>
        <Flex align="center" gap="0.75rem">
          <Button className="filter-button" onClick={onBack} style={{ padding: "0.5rem" }}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <Typography.Headline style={{ fontSize: "1.25rem" }}>CMS</Typography.Headline>
        </Flex>
        {onLogout && (
          <Button className="filter-button" onClick={onLogout} style={{ padding: "0.5rem 0.75rem" }}>
            <LogOut className="w-4 h-4" style={{ marginRight: "0.35rem" }} />
            Выход
          </Button>
        )}
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
                <UserRow
                  key={u.id}
                  user={u}
                  adminToken={adminToken}
                  onToggleActive={async () => {
                    const next = !u.active;
                    try {
                      const res = await fetch(`/api/admin-user-update?id=${u.id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
                        body: JSON.stringify({ active: next }),
                      });
                      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "Ошибка");
                      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, active: next } : x)));
                    } catch (e: unknown) {
                      setError((e as Error)?.message || "Ошибка обновления");
                    }
                  }}
                />
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
            <div style={{ marginBottom: "1rem" }}>
              <Typography.Body style={{ marginBottom: "0.25rem", fontSize: "0.85rem" }}>Заказчик (из справочника)</Typography.Body>
              {formAccessAllInns ? (
                <Typography.Body style={{ fontSize: "0.9rem", color: "var(--color-text-secondary)" }}>Доступ ко всем заказчикам — выбор не требуется</Typography.Body>
              ) : (
                <Flex gap="0.5rem" align="center" wrap="wrap">
                  <div
                    style={{
                      flex: 1,
                      minWidth: 120,
                      padding: "0.75rem",
                      background: "var(--color-bg-input)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 8,
                      color: formInn ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                      fontSize: "0.9rem",
                    }}
                  >
                    {formInn
                      ? `${formInn}${formName ? ` · ${formName}` : ""}${formEmail ? ` · ${formEmail}` : ""}`
                      : "Не выбран"}
                  </div>
                  <Button
                    className="filter-button"
                    type="button"
                    onClick={() => setCustomerPickModalOpen(true)}
                    style={{ flexShrink: 0 }}
                  >
                    Подбор
                  </Button>
                  {formInn && (
                    <Button
                      className="filter-button"
                      type="button"
                      onClick={clearCustomerSelection}
                      style={{ padding: "0.25rem 0.5rem", fontSize: "0.8rem" }}
                    >
                      Очистить
                    </Button>
                  )}
                </Flex>
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

      <CustomerPickModal
        isOpen={customerPickModalOpen}
        onClose={() => setCustomerPickModalOpen(false)}
        onSelect={(c) => {
          selectCustomer(c);
          setCustomerPickModalOpen(false);
        }}
        fetchCustomers={fetchCustomersForModal}
      />
    </div>
  );
}
