-- Выключенные паромы сохраняют существующие привязки, но недоступны для новых назначений.
ALTER TABLE ferries ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
