import { Typography, Input } from "@maxhub/max-ui";
import type { AdminUserRegistrationState } from "../hooks/useAdminUserRegistration";

type Props = {
  registration: AdminUserRegistrationState;
};

export function AdminUserAddEmailField({ registration }: Props) {
  const { formEmail, setFormEmail, formEmailError } = registration;

  return (
    <div style={{ marginBottom: "var(--element-gap, 1rem)" }}>
      <label htmlFor="form-email" style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.85rem", color: "var(--color-text-primary)" }}>Email</label>
      <Input
        id="form-email"
        className="admin-form-input"
        type="email"
        value={formEmail}
        onChange={(e) => setFormEmail(e.target.value)}
        placeholder="user@example.com"
        required
        style={{ width: "100%" }}
      />
      {formEmailError && (
        <Typography.Body style={{ color: "var(--color-error)", fontSize: "0.78rem", marginTop: "0.25rem" }}>
          {formEmailError}
        </Typography.Body>
      )}
    </div>
  );
}
