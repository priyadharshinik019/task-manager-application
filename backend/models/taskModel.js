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

async function getTasksInReminderWindow() {
  const result = await pool.query(
    `SELECT tasks.id, tasks.owner_id, users.email, tasks.title,
            tasks.due_date
     FROM tasks
     INNER JOIN users ON users.id = tasks.owner_id
     WHERE tasks.due_date <= CURRENT_TIMESTAMP + $1::interval
       AND tasks.due_date > CURRENT_TIMESTAMP + $2::interval
       AND tasks.status <> $3`,
    ['24 hours', '23 hours 59 minutes', 'completed']
  );

  return result.rows;
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
  getTasksInReminderWindow,
  updateTask,
  deleteTask
};
