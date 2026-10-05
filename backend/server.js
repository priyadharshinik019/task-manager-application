const http = require('node:http');

if (require.main === module) {
  require('dotenv').config({ path: require('node:path').resolve(__dirname, '.env') });
}

const { handleAuthRoute } = require('./routes/authRoutes');
const { handleTaskRoute } = require('./routes/taskRoutes');
const { startReminderScheduler } = require('./services/reminderScheduler');

const port = Number(process.env.PORT) || 3000;
const allowedMethods = 'GET, POST, PUT, DELETE, OPTIONS';
const allowedHeaders = 'Authorization, Content-Type';

function handleRequest(request, response) {
  const requestOrigin = request.headers.origin;
  const configuredOrigin = process.env.FRONTEND_ORIGIN;
  const originAllowed = Boolean(
    requestOrigin &&
    configuredOrigin &&
    requestOrigin === configuredOrigin
  );

  response.setHeader('Vary', 'Origin');
  if (originAllowed) {
    response.setHeader('Access-Control-Allow-Origin', configuredOrigin);
  }

  if (request.method === 'OPTIONS') {
    const requestedMethod = request.headers['access-control-request-method'];
    const methodAllowed = !requestedMethod || allowedMethods
      .split(', ')
      .includes(requestedMethod);

    if (!originAllowed || !methodAllowed) {
      response.writeHead(403);
      response.end();
      return;
    }

    response.setHeader('Access-Control-Allow-Methods', allowedMethods);
    response.setHeader('Access-Control-Allow-Headers', allowedHeaders);
    response.writeHead(204);
    response.end();
    return;
  }

  async function dispatchRequest() {
    const pathname = new URL(request.url, 'http://localhost').pathname;

    if (pathname === '/register' || pathname === '/login') {
      await handleAuthRoute(request, response);
      return;
    }

    if (await handleTaskRoute(request, response)) {
      return;
    }

    await handleAuthRoute(request, response);
  }

  dispatchRequest().catch((error) => {
    console.error('Request failed:', error);
    if (!response.headersSent) {
      response.writeHead(500, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An unexpected error occurred.'
        }
      }));
    }
  });
}

if (require.main === module) {
  const server = http.createServer(handleRequest);
  server.listen(port, () => {
    console.log(`Task Manager backend listening on port ${port}`);
    startReminderScheduler();
  });
}

module.exports = { handleRequest };
