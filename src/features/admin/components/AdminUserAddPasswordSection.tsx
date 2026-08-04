import { Button, Flex, Typography, Input } from "@maxhub/max-ui";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import type { AdminUserRegistrationState } from "../hooks/useAdminUserRegistration";

type Props = {
  registration: AdminUserRegistrationState;
};

export function AdminUserAddPasswordSection({ registration }: Props) {
  const {
    formSendEmail,
    setFormSendEmail,
    formPassword,
    setFormPassword,
    formPasswordVisible,
    setFormPasswordVisible,
    formSubmitting,
    formResult,
    formEmailError,
  } = registration;

  return (
    <>
      <div style={{ marginBottom: "1rem" }}>
        <Flex align="center">
          <input
            type="checkbox"
            checked={formSendEmail}
            onChange={(e) => {
              const checked = e.target.checked;
              setFormSendEmail(checked);
              if (checked) setFormPassword("");
            }}
            id="sendEmail"
          />
          <label htmlFor="sendEmail" style={{ marginLeft: "0.5rem", fontSize: "0.9rem" }}>Отправить пароль на email</label>
        </Flex>
      </div>
      {!formSendEmail && (
        <div style={{ marginBottom: "var(--element-gap, 1rem)" }}>
          <label htmlFor="form-password" style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.85rem", color: "var(--color-text-primary)" }}>Пароль</label>
          <div className="password-input-container" style={{ position: "relative" }}>
            <Input
              id="form-password"
              className="admin-form-input password"
              type={formPasswordVisible ? "text" : "password"}
              value={formPassword}
              onChange={(e) => setFormPassword(e.target.value)}
              placeholder="Минимум 8 символов, буквы и цифры"
              style={{ width: "100%" }}
              minLength={8}
              autoComplete="new-password"
            />
            <button
              type="button"
              className="toggle-password-visibility"
              onClick={() => setFormPasswordVisible((prev) => !prev)}
              aria-label={formPasswordVisible ? "Скрыть пароль" : "Показать пароль"}
            >
              {formPasswordVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <Typography.Body style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", marginTop: "0.25rem" }}>
            Минимум 8 символов, обязательно буквы и цифры. Простые пароли (123, password и т.п.) запрещены.
          </Typography.Body>
        </div>
      )}
      {formResult?.password && (
        <Typography.Body style={{ marginBottom: "1rem", color: "var(--color-success-status)", fontSize: "0.9rem" }}>
          Пароль: {formResult.password}
          {formResult.emailSent ? " (отправлен на email)" : " — сохраните, email не отправлен"}
        </Typography.Body>
      )}
      <Button type="submit" className="filter-button" disabled={formSubmitting || !!formEmailError}>
        {formSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Зарегистрировать"}
      </Button>
    </>
  );
}
