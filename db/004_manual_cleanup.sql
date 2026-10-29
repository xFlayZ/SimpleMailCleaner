ALTER TABLE plans ADD COLUMN manual_selection boolean NOT NULL DEFAULT false;
ALTER TABLE plans ADD COLUMN selection jsonb;
ALTER TABLE plans ADD COLUMN execution_expires_at timestamptz;
