CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE users (
 id uuid PRIMARY KEY, email text UNIQUE NOT NULL, password_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sessions (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL
);
CREATE TABLE auth_attempts (bucket text PRIMARY KEY, count int NOT NULL DEFAULT 0, reset_at timestamptz NOT NULL);
CREATE TABLE oauth_states (
 state_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 session_hash text NOT NULL REFERENCES sessions(token_hash) ON DELETE CASCADE,
 provider text NOT NULL, verifier text NOT NULL, expires_at timestamptz NOT NULL
);
CREATE TABLE settings (
 user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 api_key text, key_version int NOT NULL DEFAULT 1, model text NOT NULL DEFAULT '',
 ai_consent boolean NOT NULL DEFAULT false,
 scan_budget numeric NOT NULL DEFAULT 1 CHECK(scan_budget > 0 AND scan_budget <= 100),
 monthly_budget numeric NOT NULL DEFAULT 10 CHECK(monthly_budget > 0 AND monthly_budget <= 1000)
);
CREATE TABLE accounts (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 provider text NOT NULL CHECK(provider IN ('gmail','outlook','tonline','yahoo','proton')),
 email text NOT NULL, secret text, status text NOT NULL DEFAULT 'connected',
 created_at timestamptz NOT NULL DEFAULT now(), last_scan_at timestamptz,
 UNIQUE(user_id,id), UNIQUE(user_id,provider,email)
);
CREATE TABLE messages (
 id uuid PRIMARY KEY, user_id uuid NOT NULL, account_id uuid NOT NULL,
 remote_id text NOT NULL, folder text NOT NULL, sender text NOT NULL,
 subject text NOT NULL, received_at timestamptz NOT NULL, size int NOT NULL DEFAULT 0,
 is_read boolean NOT NULL DEFAULT false, flagged boolean NOT NULL DEFAULT false,
 has_attachments boolean NOT NULL DEFAULT false, list_id text,
 category text NOT NULL DEFAULT 'unclassified', recommendation text NOT NULL DEFAULT 'review',
 reason text NOT NULL DEFAULT '', protected boolean NOT NULL DEFAULT false,
 state text NOT NULL DEFAULT 'active', version int NOT NULL DEFAULT 1,
 analyzed_at timestamptz, unsubscribe_url text, unsubscribe_verified boolean NOT NULL DEFAULT false,
 unsubscribe_status text NOT NULL DEFAULT 'none', restore_data jsonb,
 updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(user_id,account_id) REFERENCES accounts(user_id,id) ON DELETE CASCADE,
 UNIQUE(user_id,id), UNIQUE(account_id,remote_id)
);
CREATE INDEX messages_owner ON messages(user_id,account_id,received_at DESC);
CREATE TABLE rules (
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 sender text NOT NULL, PRIMARY KEY(user_id,sender)
);
CREATE TABLE scans (
 id uuid PRIMARY KEY, user_id uuid NOT NULL, account_id uuid NOT NULL,
 status text NOT NULL DEFAULT 'queued', mode text NOT NULL, days int NOT NULL, max_messages int NOT NULL,
 processed int NOT NULL DEFAULT 0, total int NOT NULL DEFAULT 0,
 error text, created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
 FOREIGN KEY(user_id,account_id) REFERENCES accounts(user_id,id) ON DELETE CASCADE,
 UNIQUE(user_id,id)
);
CREATE UNIQUE INDEX one_scan_per_account ON scans(account_id) WHERE status IN ('queued','running','waiting_connector');
CREATE TABLE plans (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN ('trash','restore','unsubscribe')),
 digest text NOT NULL, status text NOT NULL DEFAULT 'proposed',
 expires_at timestamptz NOT NULL DEFAULT now() + interval '15 minutes',
 approved_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,id)
);
CREATE TABLE action_items (
 id uuid PRIMARY KEY, user_id uuid NOT NULL, plan_id uuid NOT NULL, message_id uuid NOT NULL,
 message_version int NOT NULL, status text NOT NULL DEFAULT 'pending', error text,
 result jsonb, started_at timestamptz, completed_at timestamptz,
 FOREIGN KEY(user_id,plan_id) REFERENCES plans(user_id,id) ON DELETE CASCADE,
 FOREIGN KEY(user_id,message_id) REFERENCES messages(user_id,id) ON DELETE CASCADE,
 UNIQUE(plan_id,message_id), UNIQUE(user_id,id)
);
CREATE TABLE jobs (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 kind text NOT NULL, ref_id uuid NOT NULL, status text NOT NULL DEFAULT 'queued',
 locked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 error text, UNIQUE(kind,ref_id)
);
CREATE INDEX jobs_queue ON jobs(created_at) WHERE status='queued';
CREATE TABLE usage_events (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 scan_id uuid NOT NULL, model text NOT NULL, key_version int NOT NULL,
 reserved numeric NOT NULL, cost numeric, input_tokens int, output_tokens int,
 status text NOT NULL DEFAULT 'reserved', created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(user_id,scan_id) REFERENCES scans(user_id,id) ON DELETE CASCADE
);
CREATE TABLE events (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 kind text NOT NULL, summary text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
-- Device authentication needs a global hash lookup; secrets are never returned by the dashboard.
CREATE TABLE devices (
 id uuid PRIMARY KEY, user_id uuid NOT NULL, account_id uuid NOT NULL,
 token_hash text UNIQUE NOT NULL, signing_key text NOT NULL,
 last_seen timestamptz, revoked boolean NOT NULL DEFAULT false,
 FOREIGN KEY(user_id,account_id) REFERENCES accounts(user_id,id) ON DELETE CASCADE,
 UNIQUE(user_id,id)
);
CREATE TABLE connector_tasks (
 id uuid PRIMARY KEY, user_id uuid NOT NULL, device_id uuid NOT NULL,
 kind text NOT NULL, payload jsonb NOT NULL, result text,
 status text NOT NULL DEFAULT 'queued', expires_at timestamptz NOT NULL,
 FOREIGN KEY(user_id,device_id) REFERENCES devices(user_id,id) ON DELETE CASCADE,
 UNIQUE(user_id,id)
);
-- The connection owner must be allowed to SET ROLE, but all tenant work runs as this restricted role.
DO $$ BEGIN
 IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='smc_tenant') THEN CREATE ROLE smc_tenant NOLOGIN NOBYPASSRLS; END IF;
 EXECUTE format('GRANT smc_tenant TO %I', current_user);
END $$;
GRANT USAGE ON SCHEMA public TO smc_tenant;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['settings','accounts','messages','rules','scans','plans','action_items','jobs','usage_events','events','connector_tasks'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY tenant ON %I USING (user_id = nullif(current_setting(''app.user_id'',true),'''')::uuid) WITH CHECK (user_id = nullif(current_setting(''app.user_id'',true),'''')::uuid)',t);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON %I TO smc_tenant',t);
 END LOOP;
END $$;
