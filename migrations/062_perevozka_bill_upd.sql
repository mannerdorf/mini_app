-- Номер счёта и номер УПД по перевозке (подмешиваются в ответ API /api/perevozki и /api/getperevozka).
-- cargo_number — как в выдаче 1С (часто с ведущими нулями); для поиска API пробует варианты номера.

CREATE TABLE IF NOT EXISTS perevozka_bill_upd (
  cargo_number text PRIMARY KEY,
  bill_number text,
  upd_number text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS perevozka_bill_upd_updated_at_idx ON perevozka_bill_upd (updated_at);
