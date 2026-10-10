const taskModel = require('../models/taskModel');
const { sendPendingTaskReminderEmail } = require('./emailService');

const intervalMilliseconds = 24 * 60 * 60 * 1000;
let interval;
let checkInProgress = false;

async function checkForPendingTaskReminders() {
  if (checkInProgress) {
    return;
  }

  checkInProgress = true;
  try {
    const tasks = await taskModel.getPendingTasksForDailyReminder();

    for (const task of tasks) {
      try {
        await sendPendingTaskReminderEmail(task);
      } catch (error) {
        console.error(
          `A pending-task reminder for task ${task.id} could not be sent:`,
          error.message
        );
        continue;
      }

      try {
        await taskModel.markTaskReminderSent(task.id);
      } catch (error) {
        console.error(
          `A pending-task reminder for task ${task.id} was sent, but its delivery could not be recorded:`,
          error.message
        );
      }
    }
  } catch (error) {
    console.error('The pending-task reminder check failed:', error.message);
  } finally {
    checkInProgress = false;
  }
}

function startReminderScheduler() {
  if (interval) {
    return;
  }

  void checkForPendingTaskReminders();
  interval = setInterval(() => {
    void checkForPendingTaskReminders();
  }, intervalMilliseconds);
  interval.unref();
}

module.exports = { startReminderScheduler };
