const jwt = require('jsonwebtoken');

function sendUnauthorized(response) {
  response.writeHead(401, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify({
    error: {
      code: 'UNAUTHORIZED',
      message: 'Authentication required.'
    }
  }));
}

function authMiddleware(request, response, next) {
  const authorization = request.headers.authorization;
  const match = typeof authorization === 'string'
    ? authorization.match(/^Bearer ([^\s]+)$/i)
    : null;

  if (!match) {
    sendUnauthorized(response);
    return;
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    next(new Error('JWT_SECRET must be configured.'));
    return;
  }

  try {
    const payload = jwt.verify(match[1], secret, { algorithms: ['HS256'] });
    if (!payload || typeof payload !== 'object' || payload.userId === undefined || payload.userId === null) {
      sendUnauthorized(response);
      return;
    }

    request.userId = payload.userId;
    next();
  } catch {
    sendUnauthorized(response);
  }
}

module.exports = { authMiddleware };
