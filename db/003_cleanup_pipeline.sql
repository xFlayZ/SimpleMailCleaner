ALTER TABLE messages ADD COLUMN newsletter_signal boolean NOT NULL DEFAULT false;
ALTER TABLE messages ADD COLUMN decision_source text;
ALTER TABLE messages ADD COLUMN decision_confidence text;
CREATE INDEX messages_review_page ON messages(user_id,state,received_at DESC,id);
CREATE INDEX messages_sender ON messages(user_id,sender);
CREATE INDEX messages_category ON messages(user_id,category,recommendation);

CREATE TABLE review_profiles (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 name text NOT NULL, config jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,id), UNIQUE(user_id,name)
);
CREATE TABLE review_runs (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 status text NOT NULL DEFAULT 'preview', config jsonb NOT NULL, filters jsonb NOT NULL,
 model text, model_price jsonb, key_version int, snapshot_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '15 minutes',
 total int NOT NULL, processed int NOT NULL DEFAULT 0, changed int NOT NULL DEFAULT 0,
 skipped int NOT NULL DEFAULT 0, stats jsonb NOT NULL DEFAULT '{}',
 estimated_low numeric NOT NULL DEFAULT 0, estimated_high numeric NOT NULL DEFAULT 0,
 error text, approved_at timestamptz, completed_at timestamptz,
 UNIQUE(user_id,id)
);
CREATE TABLE review_targets (
 user_id uuid NOT NULL, run_id uuid NOT NULL, message_id uuid NOT NULL,
 message_version int NOT NULL, status text NOT NULL DEFAULT 'pending',
 PRIMARY KEY(run_id,message_id),
 FOREIGN KEY(user_id,run_id) REFERENCES review_runs(user_id,id) ON DELETE CASCADE,
 FOREIGN KEY(user_id,message_id) REFERENCES messages(user_id,id) ON DELETE CASCADE
);
CREATE TABLE pattern_cache (
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 fingerprint text NOT NULL, model text NOT NULL, result jsonb NOT NULL,
 expires_at timestamptz NOT NULL DEFAULT now()+interval '30 days',
 PRIMARY KEY(user_id,fingerprint,model)
);
CREATE TABLE ai_batches (
 id uuid PRIMARY KEY, user_id uuid NOT NULL, run_id uuid NOT NULL,
 remote_id text, status text NOT NULL DEFAULT 'prepared',
 payload text NOT NULL, result text, usage_id uuid NOT NULL,
 cleanup_status text NOT NULL DEFAULT 'pending', next_poll_at timestamptz,
 error text, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(user_id,run_id) REFERENCES review_runs(user_id,id) ON DELETE CASCADE,
 UNIQUE(user_id,id)
);
ALTER TABLE usage_events ALTER COLUMN scan_id DROP NOT NULL;
ALTER TABLE usage_events ADD COLUMN review_run_id uuid;
ALTER TABLE usage_events ADD CONSTRAINT usage_review_fk FOREIGN KEY(user_id,review_run_id) REFERENCES review_runs(user_id,id) ON DELETE CASCADE;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['review_profiles','review_runs','review_targets','pattern_cache','ai_batches'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY tenant ON %I USING (user_id = nullif(current_setting(''app.user_id'',true),'''')::uuid) WITH CHECK (user_id = nullif(current_setting(''app.user_id'',true),'''')::uuid)',t);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON %I TO smc_tenant',t);
 END LOOP;
END $$;
