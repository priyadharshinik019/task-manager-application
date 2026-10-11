const taskModel = require('../models/taskModel');
const { sendPendingTaskReminderEmail } = require('./emailService');

const intervalMilliseconds = 24 * 60 * 60 * 1000;
let interval;
let checkInProgress = false;

async function checkForPendingTaskReminders() {
  if (checkInProgress) {
    console.log('Daily pending-task reminder check is already in progress. Skipping concurrent check.');
    return;
  }

  checkInProgress = true;
  console.log('Starting daily pending-task reminder check...');
  try {
    const tasks = await taskModel.getPendingTasksForDailyReminder();
    console.log(`Found ${tasks.length} pending task(s) eligible for daily reminder.`);

    for (const task of tasks) {
      try {
        await sendPendingTaskReminderEmail(task);
        console.log(`Sent reminder email for task ${task.id}.`);
      } catch (error) {
        console.error(
          `A pending-task reminder for task ${task.id} could not be sent:`,
          error.message
        );
        continue;
      }

      try {
        await taskModel.markTaskReminderSent(task.id);
        console.log(`Recorded reminder delivery for task ${task.id}.`);
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
    console.log('Daily pending-task reminder check completed.');
  }
}

function startReminderScheduler() {
  if (interval) {
    return;
  }

  console.log('Daily pending-task reminder scheduler started (interval: 24h).');
  void checkForPendingTaskReminders();
  interval = setInterval(() => {
    void checkForPendingTaskReminders();
  }, intervalMilliseconds);
  interval.unref();
}

module.exports = { startReminderScheduler };
