-- История ставок начисления сотрудника по дате вступления в силу.

CREATE TABLE IF NOT EXISTS employee_accrual_rate_history (
  id bigserial PRIMARY KEY,
  employee_id bigint NOT NULL REFERENCES registered_users(id) ON DELETE CASCADE,
  effective_from date NOT NULL,
  accrual_rate numeric(12, 2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, effective_from)
);

CREATE INDEX IF NOT EXISTS employee_accrual_rate_history_emp_from_idx
  ON employee_accrual_rate_history(employee_id, effective_from DESC);

-- Первичная запись: дата из created_at (МСК), чтобы прошлые периоды считались по старой ставке из справочника.
INSERT INTO employee_accrual_rate_history (employee_id, effective_from, accrual_rate)
SELECT ru.id,
       (coalesce(ru.created_at, now()) AT TIME ZONE 'Europe/Moscow')::date,
       ru.accrual_rate
FROM registered_users ru
WHERE ru.accrual_rate IS NOT NULL
ON CONFLICT (employee_id, effective_from) DO NOTHING;
