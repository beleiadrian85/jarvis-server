-- JARVIS Faza 2 — schema PostgreSQL (idempotenta, rulata la pornire)

CREATE TABLE IF NOT EXISTS conversations (
  id SERIAL PRIMARY KEY,
  channel TEXT NOT NULL DEFAULT 'telegram',
  role TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sumarul rulant al conversatiei (un singur rand).
CREATE TABLE IF NOT EXISTS conv_state (
  id INT PRIMARY KEY DEFAULT 1,
  summary TEXT NOT NULL DEFAULT '',
  last_summarized_id INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO conv_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS memories (
  id SERIAL PRIMARY KEY,
  category TEXT NOT NULL CHECK (category IN
    ('Proiecte','Financiar','Contracte','Operational','Personal','Decizii')),
  fact TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'conversatie',
  deleted_at TIMESTAMPTZ,           -- soft-delete, retentie 30 zile
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS decisions (
  id SERIAL PRIMARY KEY,
  decided_on DATE NOT NULL DEFAULT CURRENT_DATE,
  context TEXT NOT NULL DEFAULT '',
  arguments TEXT NOT NULL DEFAULT '',
  figures TEXT NOT NULL DEFAULT '',
  risks TEXT NOT NULL DEFAULT '',
  decision TEXT NOT NULL,
  review_by DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reminders (
  id SERIAL PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'altele',  -- credit/contract/fiscal/email/promisiune/altele
  title TEXT NOT NULL,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'activ' CHECK (status IN ('activ','rezolvat','amanat','ignorat')),
  snooze_until TIMESTAMPTZ,
  source TEXT,                          -- ex: gmail:<message_id> pentru deduplicare
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_reminders_source ON reminders(source) WHERE source IS NOT NULL;

-- Append-only: fara UPDATE/DELETE din aplicatie.
CREATE TABLE IF NOT EXISTS audit_log (
  id SERIAL PRIMARY KEY,
  actor TEXT NOT NULL DEFAULT 'adrian',
  action TEXT NOT NULL,
  detail TEXT,
  data_used TEXT,
  confirmed BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- FAZA 3: stare interna (snapshot task-uri pt DIFF) + dedup notificari.
CREATE TABLE IF NOT EXISTS jarvis_state (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notified (
  key TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conv_created ON conversations(id);
CREATE INDEX IF NOT EXISTS idx_memories_cat ON memories(category) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_reminders_status ON reminders(status);
