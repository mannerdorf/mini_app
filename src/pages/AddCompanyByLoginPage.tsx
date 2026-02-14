import React, { FormEvent, useState } from "react";
import { Button, Flex, Input, Panel, Switch, Typography } from "@maxhub/max-ui";
import { ArrowLeft, Eye, EyeOff, Loader2, User as UserIcon } from "lucide-react";

type AddCompanyByLoginPageProps = {
  onBack: () => void;
  onAddAccount: (login: string, password: string) => Promise<void>;
  onSuccess: () => void;
};

function resolveChecked(value: boolean | "on" | "off" | undefined): boolean {
  if (typeof value === "boolean") return value;
  if (value === "on") return true;
  return false;
}

export function AddCompanyByLoginPage({ onBack, onAddAccount, onSuccess }: AddCompanyByLoginPageProps) {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agreeOffer, setAgreeOffer] = useState(true);
  const [agreePersonal, setAgreePersonal] = useState(true);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!login || !password) {
      setError("Введите логин и пароль");
      return;
    }

    if (!agreeOffer || !agreePersonal) {
      setError("Подтвердите согласие с условиями");
      return;
    }

    try {
      setLoading(true);
      await onAddAccount(login, password);
      onSuccess();
    } catch (err: unknown) {
      setError((err as Error)?.message || "Ошибка при добавлении аккаунта");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full">
      <Flex align="center" style={{ marginBottom: "1rem", gap: "0.75rem" }}>
        <Button className="filter-button" onClick={onBack} style={{ padding: "0.5rem" }} aria-label="Назад">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <Typography.Headline style={{ fontSize: "1.25rem" }}>Введите логин и пароль</Typography.Headline>
      </Flex>

      <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
        <div
          style={{
            width: "60px",
            height: "60px",
            borderRadius: "50%",
            backgroundColor: "var(--color-bg-card)",
            border: "1px solid var(--color-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 1rem",
          }}
        >
          <UserIcon className="w-6 h-6" style={{ color: "var(--color-primary)" }} />
        </div>
        <Typography.Headline style={{ marginBottom: "0.5rem", fontSize: "1.1rem" }}>
          Введите логин и пароль
        </Typography.Headline>
        <Typography.Body
          style={{
            fontSize: "0.9rem",
            color: "var(--color-text-secondary)",
            display: "block",
            marginTop: "0.5rem",
          }}
        >
          Используйте ваши учетные данные для доступа к перевозкам
        </Typography.Body>
      </div>

      <Panel className="cargo-card" style={{ padding: "1rem" }}>
        <form onSubmit={handleSubmit}>
          <div className="field form-row-same-height" style={{ marginBottom: "1rem" }}>
            <label htmlFor="add-company-login-input" className="visually-hidden">
              Логин (email)
            </label>
            <Input
              id="add-company-login-input"
              className="login-input"
              type="text"
              placeholder="Логин (email)"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              autoComplete="username"
              style={{ fontSize: "0.9rem" }}
              aria-label="Логин (email)"
            />
          </div>
          <div className="field form-row-same-height" style={{ marginBottom: "1rem" }}>
            <label htmlFor="add-company-password-input" className="visually-hidden">
              Пароль
            </label>
            <div className="password-input-container">
              <Input
                id="add-company-password-input"
                className="login-input password"
                type={showPassword ? "text" : "password"}
                placeholder="Пароль"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                style={{ paddingRight: "3rem", fontSize: "0.9rem" }}
                aria-label="Пароль"
              />
              <Button
                type="button"
                className="toggle-password-visibility"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
            </div>
          </div>
          <label className="checkbox-row switch-wrapper" style={{ marginBottom: "1rem", fontSize: "0.85rem" }}>
            <Typography.Body style={{ fontSize: "0.85rem" }}>
              Согласие с{" "}
              <a href="#" onClick={(e) => e.preventDefault()}>
                публичной офертой
              </a>
            </Typography.Body>
            <Switch
              checked={agreeOffer}
              onCheckedChange={(value) => setAgreeOffer(resolveChecked(value))}
              onChange={(event) => setAgreeOffer(resolveChecked(event))}
            />
          </label>
          <label className="checkbox-row switch-wrapper" style={{ marginBottom: "1rem", fontSize: "0.85rem" }}>
            <Typography.Body style={{ fontSize: "0.85rem" }}>
              Согласие на{" "}
              <a href="#" onClick={(e) => e.preventDefault()}>
                обработку данных
              </a>
            </Typography.Body>
            <Switch
              checked={agreePersonal}
              onCheckedChange={(value) => setAgreePersonal(resolveChecked(value))}
              onChange={(event) => setAgreePersonal(resolveChecked(event))}
            />
          </label>
          {error && (
            <Typography.Body className="login-error" style={{ marginBottom: "1rem", fontSize: "0.9rem" }}>
              {error}
            </Typography.Body>
          )}
          <Button
            className="button-primary"
            type="submit"
            disabled={loading}
            style={{ width: "100%", marginBottom: "0.75rem", fontSize: "0.9rem", padding: "0.75rem" }}
          >
            {loading ? <Loader2 className="animate-spin w-4 h-4" /> : "Подтвердить"}
          </Button>
          <Button
            type="button"
            className="filter-button"
            onClick={onBack}
            style={{ width: "100%", fontSize: "0.9rem", padding: "0.75rem" }}
          >
            Отмена
          </Button>
        </form>
      </Panel>
    </div>
  );
}
