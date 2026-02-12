import React, { useState, useEffect, useCallback } from "react";
import { Button, Flex, Panel, Typography, Input } from "@maxhub/max-ui";
import { ArrowLeft, Users, Mail, Loader2, Plus, Settings } from "lucide-react";

const PERMISSION_KEYS = [
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
  active: boolean;
  created_at: string;
};

export function AdminPage({ adminToken, onBack }: AdminPageProps) {
  const [tab, setTab] = useState<"users" | "add" | "email">("users");
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formInn, setFormInn] = useState("");
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPermissions, setFormPermissions] = useState<Record<string, boolean>>({
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
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Ошибка");
      setFormResult({ password: data.password, emailSent: data.emailSent });
      setFormInn("");
      setFormName("");
      setFormEmail("");
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

  return (
    <div className="w-full">
      <Flex align="center" style={{ marginBottom: "1rem", gap: "0.75rem" }}>
        <Button className="filter-button" onClick={onBack} style={{ padding: "0.5rem" }}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <Typography.Headline style={{ fontSize: "1.25rem" }}>Админка</Typography.Headline>
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
                    {u.login} · ИНН {u.inn} · {u.financial_access ? "Фин. да" : "Фин. нет"}
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
              <Typography.Body style={{ marginBottom: "0.25rem", fontSize: "0.85rem" }}>ИНН</Typography.Body>
              <Input value={formInn} onChange={(e) => setFormInn(e.target.value)} placeholder="10 или 12 цифр" required style={{ width: "100%" }} />
            </div>
            <div style={{ marginBottom: "1rem" }}>
              <Typography.Body style={{ marginBottom: "0.25rem", fontSize: "0.85rem" }}>Наименование</Typography.Body>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="ООО Ромашка" style={{ width: "100%" }} />
            </div>
            <div style={{ marginBottom: "1rem" }}>
              <Typography.Body style={{ marginBottom: "0.25rem", fontSize: "0.85rem" }}>Email (логин)</Typography.Body>
              <Input type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} placeholder="user@example.com" required style={{ width: "100%" }} />
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
              <Input value={emailHost} onChange={(e) => setEmailHost(e.target.value)} placeholder="smtp.example.com" style={{ width: "100%" }} />
            </div>
            <div style={{ marginBottom: "1rem" }}>
              <Typography.Body style={{ marginBottom: "0.25rem", fontSize: "0.85rem" }}>SMTP порт</Typography.Body>
              <Input type="number" value={emailPort} onChange={(e) => setEmailPort(e.target.value)} placeholder="587" style={{ width: "100%" }} />
            </div>
            <div style={{ marginBottom: "1rem" }}>
              <Typography.Body style={{ marginBottom: "0.25rem", fontSize: "0.85rem" }}>SMTP пользователь</Typography.Body>
              <Input value={emailUser} onChange={(e) => setEmailUser(e.target.value)} placeholder="user@example.com" style={{ width: "100%" }} />
            </div>
            <div style={{ marginBottom: "1rem" }}>
              <Typography.Body style={{ marginBottom: "0.25rem", fontSize: "0.85rem" }}>SMTP пароль</Typography.Body>
              <Input type="password" value={emailPassword} onChange={(e) => setEmailPassword(e.target.value)} placeholder="••••••••" autoComplete="new-password" style={{ width: "100%" }} />
              <Typography.Body style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", marginTop: "0.25rem" }}>Оставьте пустым, чтобы не менять</Typography.Body>
            </div>
            <div style={{ marginBottom: "1rem" }}>
              <Typography.Body style={{ marginBottom: "0.25rem", fontSize: "0.85rem" }}>От кого (email)</Typography.Body>
              <Input type="email" value={emailFrom} onChange={(e) => setEmailFrom(e.target.value)} placeholder="noreply@haulz.ru" style={{ width: "100%" }} />
            </div>
            <div style={{ marginBottom: "1rem" }}>
              <Typography.Body style={{ marginBottom: "0.25rem", fontSize: "0.85rem" }}>От кого (имя)</Typography.Body>
              <Input value={emailFromName} onChange={(e) => setEmailFromName(e.target.value)} placeholder="HAULZ" style={{ width: "100%" }} />
            </div>
            <Button type="submit" className="filter-button" disabled={emailSaving}>
              {emailSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Сохранить"}
            </Button>
          </form>
        </Panel>
      )}
    </div>
  );
}
