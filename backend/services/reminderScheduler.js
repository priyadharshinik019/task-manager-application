const taskModel = require('../models/taskModel');
const { sendDueDateReminderEmail } = require('./emailService');

const intervalMilliseconds = 15 * 1000;
const sentReminderKeys = new Set();
let interval;
let checkInProgress = false;

async function checkForDueDateReminders() {
  if (checkInProgress) {
    return;
  }

  checkInProgress = true;
  try {
    const tasks = await taskModel.getTasksInReminderWindow();

    for (const task of tasks) {
      const reminderKey = `${task.id}:${new Date(task.due_date).toISOString()}`;
      if (sentReminderKeys.has(reminderKey)) {
        continue;
      }

      try {
        await sendDueDateReminderEmail(task);
        sentReminderKeys.add(reminderKey);
      } catch {
        console.error('A due-date reminder email could not be sent.');
      }
    }
  } catch {
    console.error('The due-date reminder check failed.');
  } finally {
    checkInProgress = false;
  }
}

function startReminderScheduler() {
  if (interval) {
    return;
  }

  // The query window matches the scheduler cadence; duplicate tracking is
  // process-local and resets when the server restarts.
  void checkForDueDateReminders();
  interval = setInterval(() => {
    void checkForDueDateReminders();
  }, intervalMilliseconds);
  interval.unref();
}

module.exports = { startReminderScheduler };
