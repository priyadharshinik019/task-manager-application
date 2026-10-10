const assert = require('node:assert/strict');
const { test } = require('node:test');

const reminderTasks = [
  {
    id: 1,
    owner_id: 10,
    email: 'pending@example.test',
    title: 'Pending task',
    description: 'Finish this',
    due_date: '2026-10-11',
    status: 'pending',
    image_url: 'https://images.example.test/task.png'
  },
  { id: 2, owner_id: 10, email: 'in-progress@example.test', title: 'In progress', status: 'in_progress' },
  { id: 3, owner_id: 10, email: 'completed@example.test', title: 'Completed', status: 'completed' },
  { id: 4, owner_id: 10, email: 'failed@example.test', title: 'Failed', status: 'failed' }
];
const sentReminderIds = new Set();

function stubModule(modulePath, exports) {
  const filename = require.resolve(modulePath);
  require.cache[filename] = {
    id: filename,
    filename,
    loaded: true,
    exports
  };
}

let reminderQueries = [];
const poolStub = {
  async query(sql, values = []) {
    reminderQueries.push({ sql, values });

    if (sql.includes('SELECT tasks.id')) {
      return {
        rows: reminderTasks.filter((task) => (
          task.status === 'pending' && !sentReminderIds.has(task.id)
        ))
      };
    }

    if (sql.includes('INSERT INTO task_daily_reminders')) {
      const taskId = Number(values[0]);
      const wasInserted = !sentReminderIds.has(taskId);
      sentReminderIds.add(taskId);
      return { rowCount: wasInserted ? 1 : 0 };
    }

    throw new Error('Unexpected database query in reminder test.');
  }
};

stubModule('../config/database', { pool: poolStub });
const taskModel = require('../models/taskModel');
const { validateTaskPayload } = require('../validators/taskValidator');

test('daily reminder candidates include only pending tasks not already sent today', async () => {
  reminderQueries = [];
  sentReminderIds.clear();

  const selectedTasks = await taskModel.getPendingTasksForDailyReminder();

  assert.deepEqual(selectedTasks.map((task) => task.id), [1]);
  assert.equal(selectedTasks[0].email, 'pending@example.test');
  assert.match(reminderQueries[0].sql, /tasks\.status = 'pending'/);
  assert.match(reminderQueries[0].sql, /INNER JOIN users ON users\.id = tasks\.owner_id/);
  assert.match(reminderQueries[0].sql, /task_daily_reminders\.reminder_date = CURRENT_DATE/);
  assert.deepEqual(reminderQueries[0].values, []);
});

test('reminder tracking is persistent and unique per task and database day', async () => {
  reminderQueries = [];
  sentReminderIds.clear();

  assert.equal(await taskModel.markTaskReminderSent(1), true);
  assert.equal(await taskModel.markTaskReminderSent(1), false);
  assert.match(reminderQueries[0].sql, /ON CONFLICT \(task_id, reminder_date\) DO NOTHING/);
  assert.match(reminderQueries[0].sql, /VALUES \(\$1, CURRENT_DATE\)/);

  const selectedTasks = await taskModel.getPendingTasksForDailyReminder();
  assert.deepEqual(selectedTasks, []);
});

test('failed status is accepted while terminal task statuses remain non-remindable', () => {
  assert.equal(validateTaskPayload({ title: 'Failed task', status: 'failed' }).valid, true);

  const candidateStatuses = reminderTasks
    .filter((task) => task.status === 'pending')
    .map((task) => task.status);
  assert.deepEqual(candidateStatuses, ['pending']);
});

test('scheduler retries failed reminder delivery and records only successful sends', async () => {
  reminderQueries = [];
  sentReminderIds.clear();
  const sentEmails = [];
  const loggedErrors = [];
  const originalSetInterval = global.setInterval;
  const originalConsoleError = console.error;
  let scheduledCheck;
  let failFirstAttempt = true;

  stubModule('../models/taskModel', {
    getPendingTasksForDailyReminder: () => taskModel.getPendingTasksForDailyReminder(),
    markTaskReminderSent: (taskId) => taskModel.markTaskReminderSent(taskId)
  });
  stubModule('../services/emailService', {
    async sendPendingTaskReminderEmail(task) {
      sentEmails.push(task);
      if (failFirstAttempt) {
        failFirstAttempt = false;
        throw new Error('Gmail SMTP temporarily unavailable.');
      }
    }
  });

  delete require.cache[require.resolve('../services/reminderScheduler')];
  const scheduler = require('../services/reminderScheduler');

  global.setInterval = (callback, milliseconds) => {
    scheduledCheck = callback;
    assert.equal(milliseconds, 24 * 60 * 60 * 1000);
    return { unref() {} };
  };
  console.error = (...args) => loggedErrors.push(args);

  async function flushCheck() {
    await new Promise((resolve) => setImmediate(resolve));
  }

  try {
    scheduler.startReminderScheduler();
    await flushCheck();
    assert.deepEqual([...sentReminderIds], []);

    scheduledCheck();
    await flushCheck();

    assert.equal(sentEmails.length, 2);
    assert.equal(sentEmails[0].email, 'pending@example.test');
    assert.equal(sentEmails[1].id, sentEmails[0].id);
    assert.deepEqual([...sentReminderIds], [1]);
    assert.match(loggedErrors[0][0], /task 1/);
    assert.match(loggedErrors[0][1], /Gmail SMTP temporarily unavailable/);

    scheduledCheck();
    await flushCheck();
    assert.equal(sentEmails.length, 2);
  } finally {
    global.setInterval = originalSetInterval;
    console.error = originalConsoleError;
    delete require.cache[require.resolve('../services/reminderScheduler')];
  }
});
