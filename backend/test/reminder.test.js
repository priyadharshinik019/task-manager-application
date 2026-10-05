const assert = require('node:assert/strict');
const { test } = require('node:test');

const reminderTasks = [
  { id: 1, status: 'pending', due_date: '2026-10-06T12:00:00.000Z' },
  { id: 2, status: 'in_progress', due_date: '2026-10-06T12:00:00.000Z' },
  { id: 3, status: 'completed', due_date: '2026-10-06T12:00:00.000Z' }
];

function stubModule(modulePath, exports) {
  const filename = require.resolve(modulePath);
  require.cache[filename] = {
    id: filename,
    filename,
    loaded: true,
    exports
  };
}

let reminderQuery;
const poolStub = {
  async query(sql, values) {
    reminderQuery = { sql, values };
    return {
      rows: reminderTasks.filter((task) => task.status !== values[2])
    };
  }
};

stubModule('../config/database', { pool: poolStub });
const taskModel = require('../models/taskModel');

test('reminder candidates exclude completed tasks and retain the 24-hour window', async () => {
  const selectedTasks = await taskModel.getTasksInReminderWindow();

  assert.deepEqual(selectedTasks.map((task) => task.status), ['pending', 'in_progress']);
  assert.match(reminderQuery.sql, /tasks\.due_date <= CURRENT_TIMESTAMP \+ \$1::interval/);
  assert.match(reminderQuery.sql, /tasks\.due_date > CURRENT_TIMESTAMP \+ \$2::interval/);
  assert.match(reminderQuery.sql, /tasks\.status <> \$3/);
  assert.deepEqual(reminderQuery.values, ['24 hours', '23 hours 59 minutes', 'completed']);
});

test('reminder scheduler sends selected reminders once per task and due date', async () => {
  const sentReminders = [];
  stubModule('../models/taskModel', {
    getTasksInReminderWindow: () => taskModel.getTasksInReminderWindow()
  });
  stubModule('../services/emailService', {
    async sendDueDateReminderEmail(task) {
      sentReminders.push(task);
    }
  });

  const scheduler = require('../services/reminderScheduler');
  const originalSetInterval = global.setInterval;
  let scheduledCheck;
  global.setInterval = (callback) => {
    scheduledCheck = callback;
    return { unref() {} };
  };

  try {
    scheduler.startReminderScheduler();
    await new Promise((resolve) => setImmediate(resolve));
    scheduledCheck();
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(sentReminders.length, 2);
    assert.deepEqual(sentReminders.map((task) => task.status), ['pending', 'in_progress']);
  } finally {
    global.setInterval = originalSetInterval;
  }
});
