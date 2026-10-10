
ALTER TABLE tasks
    DROP CONSTRAINT IF EXISTS tasks_status_check,
    ADD CONSTRAINT tasks_status_check
    CHECK (status IN ('pending', 'in_progress', 'completed', 'failed'));

CREATE TABLE IF NOT EXISTS task_daily_reminders (
    task_id BIGINT NOT NULL
        REFERENCES tasks(id) ON DELETE CASCADE,
    reminder_date DATE NOT NULL,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (task_id, reminder_date)
);
