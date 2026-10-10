const { pool } = require('../config/database');

const taskFields = `
  id,
  title,
  description,
  status,
  to_char(due_date, 'YYYY-MM-DD') AS due_date,
  image_url,
  owner_id
`;

async function createTask({
  owner_id,
  title,
  description = null,
  status = 'pending',
  due_date = null,
  image_url = null,
  image_public_id = null
}) {
  const result = await pool.query(
    `INSERT INTO tasks (owner_id, title, description, status, due_date, image_url, image_public_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING ${taskFields}`,
    [owner_id, title, description, status, due_date, image_url, image_public_id]
  );

  return result.rows[0];
}

async function getOwnerEmail(ownerId) {
  const result = await pool.query(
    'SELECT email FROM users WHERE id = $1',
    [ownerId]
  );

  return result.rows[0] && result.rows[0].email;
}

async function getTasksByOwner(ownerId) {
  const result = await pool.query(
    `SELECT ${taskFields}
     FROM tasks
     WHERE owner_id = $1`,
    [ownerId]
  );

  return result.rows;
}

async function getTaskById(taskId, ownerId) {
  const result = await pool.query(
    `SELECT ${taskFields}
     FROM tasks
     WHERE id = $1 AND owner_id = $2`,
    [taskId, ownerId]
  );

  return result.rows[0];
}

async function getTaskForOwner(taskId, ownerId) {
  const result = await pool.query(
    `SELECT ${taskFields}, image_public_id
     FROM tasks
     WHERE id = $1 AND owner_id = $2`,
    [taskId, ownerId]
  );

  return result.rows[0];
}

async function getPendingTasksForDailyReminder() {
  const result = await pool.query(
    `SELECT tasks.id, tasks.owner_id, users.email, tasks.title,
            tasks.description, to_char(tasks.due_date, 'YYYY-MM-DD') AS due_date,
            tasks.status, tasks.image_url
     FROM tasks
     INNER JOIN users ON users.id = tasks.owner_id
     WHERE tasks.status = 'pending'
       AND NOT EXISTS (
         SELECT 1
         FROM task_daily_reminders
         WHERE task_daily_reminders.task_id = tasks.id
           AND task_daily_reminders.reminder_date = CURRENT_DATE
       )`
  );

  return result.rows;
}

async function markTaskReminderSent(taskId) {
  const result = await pool.query(
    `INSERT INTO task_daily_reminders (task_id, reminder_date)
     VALUES ($1, CURRENT_DATE)
     ON CONFLICT (task_id, reminder_date) DO NOTHING`,
    [taskId]
  );

  return result.rowCount > 0;
}

async function updateTask(taskId, ownerId, {
  title,
  description,
  status,
  due_date,
  image_url,
  image_public_id = null
}) {
  const result = await pool.query(
    `UPDATE tasks
     SET title = $1,
         description = $2,
         status = $3,
         due_date = $4,
         image_url = $5,
         image_public_id = $6
     WHERE id = $7 AND owner_id = $8
     RETURNING ${taskFields}`,
    [title, description, status, due_date, image_url, image_public_id, taskId, ownerId]
  );

  return result.rows[0];
}

async function deleteTask(taskId, ownerId) {
  const result = await pool.query(
    'DELETE FROM tasks WHERE id = $1 AND owner_id = $2',
    [taskId, ownerId]
  );

  return result.rowCount > 0;
}

module.exports = {
  createTask,
  getOwnerEmail,
  getTasksByOwner,
  getTaskById,
  getTaskForOwner,
  getPendingTasksForDailyReminder,
  markTaskReminderSent,
  updateTask,
  deleteTask
};
