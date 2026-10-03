CREATE TABLE IF NOT EXISTS users (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(320) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tasks (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'completed')),
  due_date TIMESTAMPTZ,
  image_url VARCHAR(512),
  image_public_id VARCHAR(512),
  owner_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (image_url IS NULL AND image_public_id IS NULL)
    OR (image_url IS NOT NULL AND image_public_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS tasks_owner_due_date_idx
  ON tasks (owner_id, due_date);
CREATE INDEX IF NOT EXISTS tasks_owner_status_idx
  ON tasks (owner_id, status);

CREATE TABLE IF NOT EXISTS task_reminders (
  task_id BIGINT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  due_date TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (task_id, due_date)
);
