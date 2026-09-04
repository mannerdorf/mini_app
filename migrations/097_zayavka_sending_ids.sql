-- Кэш выданных ИДОтправления (16 символов) для загрузки заявок в 1С.
CREATE TABLE IF NOT EXISTS zayavka_sending_ids (
  id bigserial PRIMARY KEY,
  customer_inn text NOT NULL,
  sending_id char(16) NOT NULL,
  nomer_zayavki text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT zayavka_sending_ids_sending_id_key UNIQUE (sending_id)
);

CREATE INDEX IF NOT EXISTS zayavka_sending_ids_customer_inn_idx
  ON zayavka_sending_ids (customer_inn);
