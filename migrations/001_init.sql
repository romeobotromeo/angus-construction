-- Angus Construction Dashboard — initial schema

CREATE TABLE IF NOT EXISTS updates (
  id SERIAL PRIMARY KEY,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  source TEXT DEFAULT 'web'
);

CREATE TABLE IF NOT EXISTS photos (
  id SERIAL PRIMARY KEY,
  url TEXT NOT NULL,
  caption TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS budget_items (
  id SERIAL PRIMARY KEY,
  label TEXT NOT NULL,
  budgeted NUMERIC(12,2) DEFAULT 0,
  spent NUMERIC(12,2) DEFAULT 0
);

CREATE TABLE IF NOT EXISTS inspections (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  date DATE,
  duration_label TEXT,
  status TEXT DEFAULT 'pending',
  audio_url TEXT
);

CREATE TABLE IF NOT EXISTS phases (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  completed_date DATE,
  order_index INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS subs (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  trade TEXT NOT NULL,
  typical_lead_days INTEGER,
  phone TEXT
);

CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS ai_daily_brief (
  id SERIAL PRIMARY KEY,
  content_json JSONB NOT NULL,
  generated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS architect_plans (
  id SERIAL PRIMARY KEY,
  file_url TEXT NOT NULL,
  label TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed config
INSERT INTO config (key, value) VALUES
  ('target_end_date', '2026-07-15'),
  ('project_address', '2961 W Angus St'),
  ('project_name', 'Gibson House'),
  ('target_list_price', '3500000'),
  ('break_even_price', '3350000'),
  ('webcam_url', ''),
  ('owner_name', 'Naomi')
ON CONFLICT (key) DO NOTHING;

-- Seed phases
INSERT INTO phases (name, status, completed_date, order_index) VALUES
  ('Permits & approvals', 'done', '2026-02-28', 1),
  ('Demo & site prep', 'done', '2026-03-14', 2),
  ('Framing', 'active', NULL, 3),
  ('Rough MEP (mechanical, electrical, plumbing)', 'pending', NULL, 4),
  ('Insulation & drywall', 'pending', NULL, 5),
  ('Finishes & fixtures', 'pending', NULL, 6),
  ('Final inspection & punch list', 'pending', NULL, 7)
ON CONFLICT DO NOTHING;

-- Seed budget items
INSERT INTO budget_items (label, budgeted, spent) VALUES
  ('Framing', 50000, 35000),
  ('MEP rough', 55000, 0),
  ('Drywall', 40000, 0),
  ('Finishes', 80000, 0),
  ('Contingency reserve', 35000, 0)
ON CONFLICT DO NOTHING;
