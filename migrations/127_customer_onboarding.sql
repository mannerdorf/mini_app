BEGIN;
CREATE TABLE IF NOT EXISTS customer_onboarding (
  login text PRIMARY KEY,
  inn text NOT NULL,
  customer_name text NOT NULL,
  user_id bigint NOT NULL REFERENCES registered_users(id),
  password_cipher text,
  initial_password_hash text NOT NULL,
  lk_done boolean NOT NULL DEFAULT false,
  email_done boolean NOT NULL DEFAULT false,
  needs_review boolean NOT NULL DEFAULT false,
  last_error text,
  attempts integer NOT NULL DEFAULT 0,
  next_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz,
  token text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customer_onboarding_due ON customer_onboarding(next_at)
  WHERE NOT needs_review AND (NOT lk_done OR NOT email_done);
-- Recover old auto-created users without changing their password or silently resending invitations.
INSERT INTO customer_onboarding(login,inn,customer_name,user_id,initial_password_hash,lk_done,email_done,needs_review,last_error)
SELECT lower(trim(u.login)),u.inn,coalesce(u.company_name,''),u.id,u.password_hash,
  EXISTS(SELECT 1 FROM admin_audit_log a WHERE a.target_id=u.id::text AND a.action='integration_sendlk_sent'),
  EXISTS(SELECT 1 FROM admin_audit_log a WHERE a.target_id=u.id::text AND a.action='email_delivery_registration_sent'),
  NOT EXISTS(SELECT 1 FROM admin_audit_log a WHERE a.target_id=u.id::text AND a.action='email_delivery_registration_sent'),
  'Незавершённая прежняя регистрация: проверьте приглашение и передачу в 1С'
FROM registered_users u
WHERE coalesce(trim(u.inn),'')<>'' AND EXISTS(SELECT 1 FROM admin_audit_log a WHERE a.target_id=u.id::text AND a.action='auto_user_register')
 AND (NOT EXISTS(SELECT 1 FROM admin_audit_log a WHERE a.target_id=u.id::text AND a.action='integration_sendlk_sent')
 OR NOT EXISTS(SELECT 1 FROM admin_audit_log a WHERE a.target_id=u.id::text AND a.action='email_delivery_registration_sent'))
ON CONFLICT(login) DO NOTHING;
COMMIT;
