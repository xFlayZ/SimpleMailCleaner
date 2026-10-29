ALTER TABLE settings ADD COLUMN IF NOT EXISTS activity_paused boolean NOT NULL DEFAULT false;
