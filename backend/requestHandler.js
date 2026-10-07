const allowedMethods = 'GET, POST, PUT, DELETE, OPTIONS';
const allowedHeaders = 'Authorization, Content-Type';
const allowedFrontendOrigins = new Set([
  'https://task-manager-application-mwkw.vercel.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173'
]);

function handleRequest(request, response) {
  const requestOrigin = request.headers.origin;
  const configuredOrigin = process.env.FRONTEND_ORIGIN;
  const originAllowed = Boolean(requestOrigin) && (
    allowedFrontendOrigins.has(requestOrigin) ||
    requestOrigin === configuredOrigin
  );

  response.setHeader('Vary', 'Origin');
  if (originAllowed) {
    response.setHeader('Access-Control-Allow-Origin', requestOrigin);
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
      const { handleAuthRoute } = require('./routes/authRoutes');
      await handleAuthRoute(request, response);
      return;
    }

    if (/^\/tasks\/?$/.test(pathname) || /^\/tasks\/[^/]+\/?$/.test(pathname)) {
      const { handleTaskRoute } = require('./routes/taskRoutes');
      await handleTaskRoute(request, response);
      return;
    }

    response.writeHead(404, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({
      error: {
        code: 'NOT_FOUND',
        message: 'Route not found.'
      }
    }));
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

module.exports = { handleRequest };
