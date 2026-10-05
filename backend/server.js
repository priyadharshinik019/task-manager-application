const http = require('node:http');

if (require.main === module) {
  require('dotenv').config({ path: require('node:path').resolve(__dirname, '.env') });
}

const { handleRequest } = require('./requestHandler');
const port = Number(process.env.PORT) || 3000;

if (require.main === module) {
  const server = http.createServer(handleRequest);
  server.listen(port, () => {
    console.log(`Task Manager backend listening on port ${port}`);
    const { startReminderScheduler } = require('./services/reminderScheduler');
    startReminderScheduler();
  });
}
