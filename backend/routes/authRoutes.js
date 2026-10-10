const { loginUser, registerUser } = require('../services/authService');
const { sendWelcomeEmail } = require('../services/emailService');
const { validateLogin, validateRegistration } = require('../validators/authValidator');

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(body));
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';

    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
    });
    request.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Request body must be valid JSON.'));
      }
    });
    request.on('error', reject);
  });
}

async function handleAuthRoute(request, response) {
  const pathname = new URL(request.url, 'http://localhost').pathname;

  if (
    request.method !== 'POST' ||
    (pathname !== '/register' && pathname !== '/login')
  ) {
    sendJson(response, 404, {
      error: {
        code: 'NOT_FOUND',
        message: 'Route not found.'
      }
    });
    return;
  }

  let input;
  try {
    input = await readJsonBody(request);
  } catch (error) {
    sendJson(response, 400, {
      error: {
        code: 'BAD_REQUEST',
        message: error.message
      }
    });
    return;
  }

  const isLogin = pathname === '/login';
  const validation = isLogin ? validateLogin(input) : validateRegistration(input);
  if (!validation.valid) {
    sendJson(response, 400, {
      error: {
        code: 'BAD_REQUEST',
        message: isLogin ? 'Login data is invalid.' : 'Registration data is invalid.',
        details: validation.errors
      }
    });
    return;
  }

  try {
    if (isLogin) {
      const result = await loginUser(validation.value);
      sendJson(response, 200, result);
      return;
    }

    const user = await registerUser(validation.value);
    void sendWelcomeEmail({ name: user.name, email: user.email }).catch((error) => {
      console.error(
        'Welcome email could not be sent:',
        error.code || 'EMAIL_DELIVERY_FAILED'
      );
    });
    sendJson(response, 201, { user });
  } catch (error) {
    if (error.code === 'INVALID_CREDENTIALS') {
      sendJson(response, 401, {
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid email or password.'
        }
      });
      return;
    }

    if (error.code === 'DUPLICATE_EMAIL') {
      sendJson(response, 400, {
        error: {
          code: 'BAD_REQUEST',
          message: 'An account with this email already exists.'
        }
      });
      return;
    }

    throw error;
  }
}

module.exports = { handleAuthRoute };
