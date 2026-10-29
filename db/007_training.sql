CREATE TABLE training_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 account_id uuid NOT NULL, size int NOT NULL CHECK(size IN (10,20,50)), cursor int NOT NULL DEFAULT 0,
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused','completed')),
 targets jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,id),
 FOREIGN KEY(user_id,account_id) REFERENCES accounts(user_id,id) ON DELETE CASCADE
);
CREATE TABLE training_feedback (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 account_id uuid NOT NULL, message_id uuid NOT NULL, session_id uuid, original jsonb NOT NULL,
 decision text NOT NULL CHECK(decision IN ('keep','archive','remove','skip')), reasons jsonb NOT NULL DEFAULT '[]',
 explanation text NOT NULL DEFAULT '', scope text NOT NULL CHECK(scope IN ('message','similar','rule')),
 contributes boolean NOT NULL DEFAULT false, kind text NOT NULL, features jsonb NOT NULL,
 version text NOT NULL DEFAULT 'personal-v1', created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(user_id,message_id) REFERENCES messages(user_id,id) ON DELETE CASCADE,
 FOREIGN KEY(user_id,account_id) REFERENCES accounts(user_id,id) ON DELETE CASCADE,
 FOREIGN KEY(user_id,session_id) REFERENCES training_sessions(user_id,id) ON DELETE CASCADE
);
CREATE INDEX training_feedback_owner ON training_feedback(user_id,account_id,message_id,created_at DESC);
CREATE TABLE learned_filter_rules (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 account_id uuid NOT NULL, name text NOT NULL, config jsonb NOT NULL, enabled boolean NOT NULL DEFAULT false,
 origin text NOT NULL DEFAULT 'suggested', support int NOT NULL DEFAULT 0, priority int NOT NULL DEFAULT 100,
 signature text NOT NULL, revision int NOT NULL DEFAULT 1, history jsonb NOT NULL DEFAULT '[]',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,account_id,signature), FOREIGN KEY(user_id,account_id) REFERENCES accounts(user_id,id) ON DELETE CASCADE
);
ALTER TABLE messages ADD COLUMN personal_disposition text;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['training_sessions','training_feedback','learned_filter_rules'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY tenant ON %I USING (user_id = nullif(current_setting(''app.user_id'',true),'''')::uuid) WITH CHECK (user_id = nullif(current_setting(''app.user_id'',true),'''')::uuid)',t);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON %I TO smc_tenant',t);
 END LOOP;
END $$;
