const assert = require('node:assert/strict');
const { beforeEach, test } = require('node:test');
const { Readable } = require('node:stream');

process.env.JWT_SECRET = 'node-test-only-secret';
process.env.JWT_EXPIRES_IN = '1h';

const users = [];
let tasks = [];
let nextUserId = 1;
let nextTaskId = 1;

const poolStub = {
  async query(sql, values) {
    if (sql.includes('INSERT INTO users')) {
      const [name, email, passwordHash] = values;
      if (users.some((user) => user.email === email)) {
        const error = new Error('Duplicate email.');
        error.code = '23505';
        error.constraint = 'users_email_key';
        throw error;
      }

      const user = { id: nextUserId++, name, email, password_hash: passwordHash };
      users.push(user);
      return { rows: [{ id: user.id, name: user.name, email: user.email }] };
    }

    if (sql.includes('SELECT id, password_hash FROM users')) {
      const user = users.find((item) => item.email === values[0]);
      return { rows: user ? [{ id: user.id, password_hash: user.password_hash }] : [] };
    }

    throw new Error('Unexpected database query in test.');
  }
};

const taskModelStub = {
  async createTask(task) {
    const created = { id: nextTaskId++, ...task };
    tasks.push(created);
    return { ...created };
  },
  async getTasksByOwner(ownerId) {
    return tasks.filter((task) => task.owner_id === ownerId).map((task) => ({ ...task }));
  },
  async getTaskById(taskId, ownerId) {
    const task = tasks.find((item) => item.id === Number(taskId) && item.owner_id === ownerId);
    return task ? { ...task } : undefined;
  },
  async getTaskForOwner(taskId, ownerId) {
    const task = tasks.find((item) => item.id === Number(taskId) && item.owner_id === ownerId);
    return task ? { ...task } : undefined;
  },
  async updateTask(taskId, ownerId, values) {
    const index = tasks.findIndex((item) => item.id === Number(taskId) && item.owner_id === ownerId);
    if (index === -1) return undefined;
    tasks[index] = { ...tasks[index], ...values };
    return { ...tasks[index] };
  },
  async deleteTask(taskId, ownerId) {
    const originalLength = tasks.length;
    tasks = tasks.filter((task) => !(task.id === Number(taskId) && task.owner_id === ownerId));
    return tasks.length !== originalLength;
  }
};

const emailServiceStub = {
  async sendWelcomeEmail() {},
  async sendDueDateReminderEmail() {}
};

const cloudinaryServiceStub = {
  async uploadImage() {
    throw new Error('Cloudinary must not be called in these tests.');
  },
  async deleteImage() {
    throw new Error('Cloudinary must not be called in these tests.');
  }
};

function stubModule(modulePath, exports) {
  const filename = require.resolve(modulePath);
  require.cache[filename] = {
    id: filename,
    filename,
    loaded: true,
    exports
  };
}

stubModule('../config/database', { pool: poolStub });
stubModule('../models/taskModel', taskModelStub);
stubModule('../services/emailService', emailServiceStub);
stubModule('../services/cloudinaryService', cloudinaryServiceStub);

const { handleAuthRoute } = require('../routes/authRoutes');
const { handleTaskRoute } = require('../routes/taskRoutes');
const { handleRequest } = require('../requestHandler');

function createRequest(method, url, body, token) {
  const request = Readable.from(body === undefined ? [] : [JSON.stringify(body)]);
  request.method = method;
  request.url = url;
  request.headers = token ? { authorization: `Bearer ${token}` } : {};
  return request;
}

function callRequestHandler(method, headers = {}) {
  const request = { method, url: '/register', headers };
  const responseHeaders = {};
  let statusCode;
  let ended = false;
  const response = {
    setHeader(name, value) {
      responseHeaders[name] = value;
    },
    writeHead(status) {
      statusCode = status;
    },
    end() {
      ended = true;
    }
  };

  handleRequest(request, response);
  return { statusCode, headers: responseHeaders, ended };
}

async function callHandler(handler, method, url, body, token) {
  const request = createRequest(method, url, body, token);
  let statusCode;
  let responseBody;
  const response = {
    writeHead(status) {
      statusCode = status;
    },
    end(value = '') {
      responseBody = value ? JSON.parse(value) : null;
    }
  };

  await handler(request, response);
  return { statusCode, body: responseBody };
}

async function register(name, email, password = 'correct horse battery staple') {
  return callHandler(handleAuthRoute, 'POST', '/register', { name, email, password });
}

async function createAuthenticatedUser(email) {
  const registration = await register('Test User', email);
  assert.equal(registration.statusCode, 201);
  const login = await callHandler(handleAuthRoute, 'POST', '/login', {
    email,
    password: 'correct horse battery staple'
  });
  assert.equal(login.statusCode, 200);
  return { user: registration.body.user, token: login.body.accessToken };
}

async function createTask(token, values = { title: 'Test task' }) {
  return callHandler(handleTaskRoute, 'POST', '/tasks/', values, token);
}

beforeEach(() => {
  users.length = 0;
  tasks = [];
  nextUserId = 1;
  nextTaskId = 1;
});

test('CORS preflight succeeds for the configured frontend origin', () => {
  const originalFrontendOrigin = process.env.FRONTEND_ORIGIN;
  process.env.FRONTEND_ORIGIN = 'https://frontend.example.test';

  try {
    const response = callRequestHandler('OPTIONS', {
      origin: 'https://frontend.example.test',
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'content-type'
    });

    assert.equal(response.statusCode, 204);
    assert.equal(response.headers['Access-Control-Allow-Origin'], 'https://frontend.example.test');
    assert.equal(response.headers['Access-Control-Allow-Methods'], 'GET, POST, PUT, DELETE, OPTIONS');
    assert.equal(response.headers['Access-Control-Allow-Headers'], 'Authorization, Content-Type');
    assert.equal(response.ended, true);
  } finally {
    if (originalFrontendOrigin === undefined) {
      delete process.env.FRONTEND_ORIGIN;
    } else {
      process.env.FRONTEND_ORIGIN = originalFrontendOrigin;
    }
  }
});

test('CORS preflight succeeds for production and local frontend origins', () => {
  const originalFrontendOrigin = process.env.FRONTEND_ORIGIN;
  delete process.env.FRONTEND_ORIGIN;

  try {
    for (const origin of [
      'https://task-manager-application-mwkw.vercel.app',
      'http://localhost:5173',
      'http://127.0.0.1:5173'
    ]) {
      const response = callRequestHandler('OPTIONS', {
        origin,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization,content-type'
      });

      assert.equal(response.statusCode, 204);
      assert.equal(response.headers['Access-Control-Allow-Origin'], origin);
      assert.equal(response.headers['Access-Control-Allow-Methods'], 'GET, POST, PUT, DELETE, OPTIONS');
      assert.equal(response.headers['Access-Control-Allow-Headers'], 'Authorization, Content-Type');
      assert.equal(response.ended, true);
    }
  } finally {
    if (originalFrontendOrigin === undefined) {
      delete process.env.FRONTEND_ORIGIN;
    } else {
      process.env.FRONTEND_ORIGIN = originalFrontendOrigin;
    }
  }
});

test('CORS preflight rejects unconfigured origins and methods', () => {
  const originalFrontendOrigin = process.env.FRONTEND_ORIGIN;
  process.env.FRONTEND_ORIGIN = 'https://frontend.example.test';

  try {
    const wrongOrigin = callRequestHandler('OPTIONS', {
      origin: 'https://other.example.test',
      'access-control-request-method': 'POST'
    });
    assert.equal(wrongOrigin.statusCode, 403);
    assert.equal(wrongOrigin.headers['Access-Control-Allow-Origin'], undefined);

    const wrongMethod = callRequestHandler('OPTIONS', {
      origin: 'https://frontend.example.test',
      'access-control-request-method': 'PATCH'
    });
    assert.equal(wrongMethod.statusCode, 403);
  } finally {
    if (originalFrontendOrigin === undefined) {
      delete process.env.FRONTEND_ORIGIN;
    } else {
      process.env.FRONTEND_ORIGIN = originalFrontendOrigin;
    }
  }
});

test('registration succeeds without returning password or password hash', async () => {
  const response = await register('Alice Example', 'alice@example.test');

  assert.equal(response.statusCode, 201);
  assert.deepEqual(response.body.user, {
    id: 1,
    name: 'Alice Example',
    email: 'alice@example.test'
  });
  assert.equal(JSON.stringify(response.body).includes('password'), false);
});

test('duplicate email registration is rejected', async () => {
  await register('Alice Example', 'alice@example.test');
  const duplicate = await register('Another Name', 'alice@example.test');

  assert.equal(duplicate.statusCode, 400);
  assert.match(duplicate.body.error.message, /already exists/i);
});

test('login succeeds and returns an access token without password data', async () => {
  await register('Alice Example', 'alice@example.test');
  const response = await callHandler(handleAuthRoute, 'POST', '/login', {
    email: 'alice@example.test',
    password: 'correct horse battery staple'
  });

  assert.equal(response.statusCode, 200);
  assert.equal(typeof response.body.accessToken, 'string');
  assert.equal(Object.hasOwn(response.body, 'password'), false);
  assert.equal(Object.hasOwn(response.body, 'password_hash'), false);
});

test('login rejects invalid credentials', async () => {
  await register('Alice Example', 'alice@example.test');
  const response = await callHandler(handleAuthRoute, 'POST', '/login', {
    email: 'alice@example.test',
    password: 'incorrect password'
  });

  assert.equal(response.statusCode, 401);
});

test('protected task routes reject a missing Bearer token', async () => {
  const response = await callHandler(handleTaskRoute, 'GET', '/tasks/');

  assert.equal(response.statusCode, 401);
});

test('protected task routes reject an invalid Bearer token', async () => {
  const response = await callHandler(handleTaskRoute, 'GET', '/tasks/', undefined, 'invalid-token');

  assert.equal(response.statusCode, 401);
});

test('protected task routes require the Bearer scheme', async () => {
  const { token } = await createAuthenticatedUser('alice@example.test');
  const request = createRequest('GET', '/tasks/');
  request.headers.authorization = `Token ${token}`;
  let statusCode;
  const response = {
    writeHead(status) {
      statusCode = status;
    },
    end() {}
  };

  await handleTaskRoute(request, response);
  assert.equal(statusCode, 401);
});

test('task create, list, read, update, and delete work', async () => {
  const { token } = await createAuthenticatedUser('alice@example.test');
  const created = await createTask(token, {
    title: 'First task',
    description: 'Initial description',
    status: 'pending',
    due_date: '2026-10-10',
    image_url: null
  });
  assert.equal(created.statusCode, 201);
  const taskId = created.body.task.id;

  const listed = await callHandler(handleTaskRoute, 'GET', '/tasks/', undefined, token);
  assert.equal(listed.statusCode, 200);
  assert.equal(listed.body.tasks.length, 1);
  assert.equal(listed.body.tasks[0].title, 'First task');

  const fetched = await callHandler(handleTaskRoute, 'GET', `/tasks/${taskId}`, undefined, token);
  assert.equal(fetched.statusCode, 200);
  assert.equal(fetched.body.task.title, 'First task');

  const updated = await callHandler(handleTaskRoute, 'PUT', `/tasks/${taskId}`, {
    title: 'Updated task',
    description: 'Updated description',
    status: 'completed',
    due_date: '2026-10-11',
    image_url: null
  }, token);
  assert.equal(updated.statusCode, 200);
  assert.equal(updated.body.task.title, 'Updated task');
  assert.equal(updated.body.task.status, 'completed');

  const deleted = await callHandler(handleTaskRoute, 'DELETE', `/tasks/${taskId}`, undefined, token);
  assert.equal(deleted.statusCode, 200);
  const afterDelete = await callHandler(handleTaskRoute, 'GET', `/tasks/${taskId}`, undefined, token);
  assert.equal(afterDelete.statusCode, 404);
});

test('invalid task payload is rejected', async () => {
  const { token } = await createAuthenticatedUser('alice@example.test');
  const response = await createTask(token, ['not', 'an', 'object']);

  assert.equal(response.statusCode, 400);
});

test('invalid task status is rejected', async () => {
  const { token } = await createAuthenticatedUser('alice@example.test');
  const response = await createTask(token, { title: 'Task', status: 'blocked' });

  assert.equal(response.statusCode, 400);
  assert.ok(response.body.error.details.some((detail) => detail.includes('status')));
});

test('missing task title is rejected', async () => {
  const { token } = await createAuthenticatedUser('alice@example.test');
  const response = await createTask(token, { description: 'No title' });

  assert.equal(response.statusCode, 400);
});

test('blank task title is rejected', async () => {
  const { token } = await createAuthenticatedUser('alice@example.test');
  const response = await createTask(token, { title: '   ' });

  assert.equal(response.statusCode, 400);
});

test('owner_id cannot be changed through a task payload', async () => {
  const { user, token } = await createAuthenticatedUser('alice@example.test');
  const response = await createTask(token, {
    title: 'Task',
    owner_id: user.id + 100
  });

  assert.equal(response.statusCode, 400);
  assert.equal(tasks.length, 0);
});

test('users cannot read, update, or delete another user task', async () => {
  const owner = await createAuthenticatedUser('owner@example.test');
  const otherUser = await createAuthenticatedUser('other@example.test');
  const created = await createTask(owner.token, { title: 'Private task' });
  const taskId = created.body.task.id;

  const read = await callHandler(handleTaskRoute, 'GET', `/tasks/${taskId}`, undefined, otherUser.token);
  const update = await callHandler(handleTaskRoute, 'PUT', `/tasks/${taskId}`, {
    title: 'Changed task'
  }, otherUser.token);
  const remove = await callHandler(handleTaskRoute, 'DELETE', `/tasks/${taskId}`, undefined, otherUser.token);

  assert.equal(read.statusCode, 404);
  assert.equal(update.statusCode, 404);
  assert.equal(remove.statusCode, 404);

  const ownerRead = await callHandler(handleTaskRoute, 'GET', `/tasks/${taskId}`, undefined, owner.token);
  assert.equal(ownerRead.statusCode, 200);
  assert.equal(ownerRead.body.task.title, 'Private task');
});
