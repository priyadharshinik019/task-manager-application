const taskService = require('../services/taskService');
const { authMiddleware } = require('../middleware/authMiddleware');
const Busboy = require('busboy');

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(body));
}

function sendError(response, statusCode, code, message, details) {
  const error = { code, message };
  if (details) {
    error.details = details;
  }

  sendJson(response, statusCode, { error });
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

function readMultipartBody(request) {
  return new Promise((resolve, reject) => {
    let parser;
    try {
      parser = Busboy({ headers: request.headers });
    } catch {
      reject(new Error('Multipart request is invalid.'));
      return;
    }

    const fields = Object.create(null);
    const chunks = [];
    let hasImage = false;
    let parseError = null;

    parser.on('field', (name, value) => {
      if (Object.hasOwn(fields, name)) {
        parseError = new Error('Multipart fields must not be repeated.');
        return;
      }
      fields[name] = value;
    });

    parser.on('file', (name, file, info) => {
      if (name !== 'image' || hasImage) {
        parseError = new Error('Only one image file field named image is allowed.');
        file.resume();
        return;
      }

      hasImage = true;
      if (!info.mimeType || !info.mimeType.startsWith('image/')) {
        parseError = new Error('Uploaded file must be an image.');
        file.resume();
        return;
      }

      file.on('data', (chunk) => chunks.push(chunk));
      file.on('error', () => {
        parseError = new Error('Multipart image upload could not be read.');
      });
    });

    parser.on('error', () => {
      reject(new Error('Multipart request is invalid.'));
    });
    parser.on('close', () => {
      if (parseError) {
        reject(parseError);
        return;
      }
      resolve({
        payload: fields,
        image: hasImage ? Buffer.concat(chunks) : null
      });
    });
    request.on('error', () => {
      reject(new Error('Multipart request could not be read.'));
    });
    request.pipe(parser);
  });
}

function readTaskRequestBody(request) {
  const contentType = request.headers['content-type'] || '';
  if (contentType.toLowerCase().startsWith('multipart/form-data')) {
    return readMultipartBody(request);
  }

  return readJsonBody(request).then((payload) => ({ payload, image: null }));
}

function authenticate(request, response) {
  let authenticated = false;
  let middlewareError;

  authMiddleware(request, response, (error) => {
    if (error) {
      middlewareError = error;
      return;
    }

    authenticated = true;
  });

  if (middlewareError) {
    console.error('Task authentication middleware failed:', middlewareError);
    sendError(response, 500, 'INTERNAL_SERVER_ERROR', 'An unexpected error occurred.');
    return false;
  }

  return authenticated;
}

async function handleTaskRoute(request, response) {
  let pathname;
  try {
    pathname = new URL(request.url, 'http://localhost').pathname;
  } catch {
    sendError(response, 400, 'BAD_REQUEST', 'Request URL is invalid.');
    return true;
  }

  const collectionMatch = pathname.match(/^\/tasks\/?$/);
  const itemMatch = pathname.match(/^\/tasks\/([^/]+)\/?$/);
  if (!collectionMatch && !itemMatch) {
    return false;
  }

  const method = request.method;
  const isCollectionRoute = Boolean(collectionMatch);
  const supportedMethod = isCollectionRoute
    ? method === 'GET' || method === 'POST'
    : method === 'GET' || method === 'PUT' || method === 'DELETE';

  if (!supportedMethod) {
    sendError(response, 404, 'NOT_FOUND', 'Route not found.');
    return true;
  }

  if (!authenticate(request, response)) {
    return true;
  }

  let taskId;
  if (!isCollectionRoute) {
    try {
      taskId = decodeURIComponent(itemMatch[1]);
    } catch {
      sendError(response, 400, 'BAD_REQUEST', 'Task ID is invalid.');
      return true;
    }

    if (!/^[1-9]\d*$/.test(taskId)) {
      sendError(response, 400, 'BAD_REQUEST', 'Task ID is invalid.');
      return true;
    }
  }

  try {
    if (isCollectionRoute && method === 'GET') {
      const tasks = await taskService.listTasks(request.userId);
      sendJson(response, 200, { tasks });
      return true;
    }

    if (isCollectionRoute && method === 'POST') {
      let body;
      try {
        body = await readTaskRequestBody(request);
      } catch (error) {
        sendError(response, 400, 'BAD_REQUEST', error.message);
        return true;
      }

      const task = await taskService.createTask(request.userId, body.payload, body.image);
      sendJson(response, 201, { task });
      return true;
    }

    if (method === 'GET') {
      const task = await taskService.getTask(request.userId, taskId);
      sendJson(response, 200, { task });
      return true;
    }

    if (method === 'PUT') {
      let body;
      try {
        body = await readTaskRequestBody(request);
      } catch (error) {
        sendError(response, 400, 'BAD_REQUEST', error.message);
        return true;
      }

      const task = await taskService.updateTask(request.userId, taskId, body.payload, body.image);
      sendJson(response, 200, { task });
      return true;
    }

    await taskService.deleteTask(request.userId, taskId);
    sendJson(response, 200, {
      message: 'Task deleted successfully.'
    });
    return true;
  } catch (error) {
    if (error.code === 'VALIDATION_ERROR') {
      sendError(response, 400, 'BAD_REQUEST', 'Task payload is invalid.', error.details);
      return true;
    }

    if (error.code === 'INVALID_IMAGE_SOURCE') {
      sendError(response, 400, 'BAD_REQUEST', error.message);
      return true;
    }

    if (error.code === 'TASK_NOT_FOUND') {
      sendError(response, 404, 'NOT_FOUND', 'Task not found.');
      return true;
    }

    console.error('Task request failed:', error);
    sendError(response, 500, 'INTERNAL_SERVER_ERROR', 'An unexpected error occurred.');
    return true;
  }
}

module.exports = { handleTaskRoute };
