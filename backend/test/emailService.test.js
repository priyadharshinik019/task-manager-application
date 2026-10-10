const assert = require('node:assert/strict');
const { afterEach, test } = require('node:test');

const {
  sendTaskCreatedEmail,
  sendDueDateReminderEmail,
  sendPendingTaskReminderEmail,
  sendWelcomeEmail
} = require('../services/emailService');

const originalFetch = global.fetch;
const environmentNames = [
  'EMAILJS_SERVICE_ID',
  'EMAILJS_TEMPLATE_ID',
  'EMAILJS_PUBLIC_KEY',
  'EMAIL_FROM'
];
const originalEnvironment = Object.fromEntries(
  environmentNames.map((name) => [name, process.env[name]])
);
const testPublicKey = 'test-only-emailjs-public-key';

afterEach(() => {
  global.fetch = originalFetch;

  for (const name of environmentNames) {
    if (originalEnvironment[name] === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = originalEnvironment[name];
    }
  }
});

function configureTestEmail() {
  process.env.EMAILJS_SERVICE_ID = 'service_test';
  process.env.EMAILJS_TEMPLATE_ID = 'template_test';
  process.env.EMAILJS_PUBLIC_KEY = testPublicKey;
}

function mockFetch(response) {
  let request;
  global.fetch = async (url, options) => {
    request = { url, options };
    return response;
  };
  return () => request;
}

function readTemplateParams(getRequest) {
  const request = getRequest();
  assert.equal(request.url, 'https://api.emailjs.com/api/v1.0/email/send');
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.headers['Content-Type'], 'application/json');

  const payload = JSON.parse(request.options.body);
  assert.equal(payload.service_id, 'service_test');
  assert.equal(payload.template_id, 'template_test');
  assert.equal(payload.user_id, testPublicKey);
  return payload.template_params;
}

test('welcome email uses EmailJS with the welcome template variables', async () => {
  configureTestEmail();
  const getRequest = mockFetch({ ok: true });

  await sendWelcomeEmail({
    name: '<Alice & Bob>',
    email: 'alice@example.test'
  });

  const params = readTemplateParams(getRequest);
  assert.deepEqual(params, {
    to_email: 'alice@example.test',
    subject: 'Welcome to Task Manager',
    heading: 'Welcome, &lt;Alice &amp; Bob&gt;',
    message: 'Your Task Manager account has been created successfully.',
    task_title: '',
    description: '',
    due_date: '',
    status: '',
    image_url: '',
    name: '&lt;Alice &amp; Bob&gt;',
    email: 'alice@example.test',
    time: params.time
  });
  assert.ok(Number.isFinite(Date.parse(params.time)));
});

test('task-created email maps escaped fields and image URL into template variables', async () => {
  configureTestEmail();
  const getRequest = mockFetch({ ok: true });

  await sendTaskCreatedEmail({
    email: 'alice@example.test',
    title: '<Review & finish>',
    description: '<script>alert("x")</script> & details',
    due_date: '2030-05-06',
    status: 'pending',
    image_url: 'https://images.example.test/task?a=1&b=2'
  });

  const params = readTemplateParams(getRequest);
  assert.equal(params.to_email, 'alice@example.test');
  assert.equal(params.email, 'alice@example.test');
  assert.equal(params.subject, 'Task created successfully');
  assert.equal(params.heading, 'Task created successfully');
  assert.equal(params.task_title, '&lt;Review &amp; finish&gt;');
  assert.equal(params.description, '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; details');
  assert.equal(params.due_date, '2030-05-06');
  assert.equal(params.status, 'pending');
  assert.equal(params.image_url, 'https://images.example.test/task?a=1&amp;b=2');
  assert.equal(params.name, '');
  assert.ok(Number.isFinite(Date.parse(params.time)));
});

test('task-created email supplies safe defaults and an empty image URL when absent', async () => {
  configureTestEmail();
  const getRequest = mockFetch({ ok: true });

  await sendTaskCreatedEmail({
    email: 'alice@example.test',
    title: 'A task',
    description: null,
    due_date: null,
    status: 'pending',
    image_url: null
  });

  const params = readTemplateParams(getRequest);
  assert.equal(params.description, 'No description provided.');
  assert.equal(params.due_date, 'Not set');
  assert.equal(params.image_url, '');
});

test('due-date reminder passes formatted due date and compatible template fields', async () => {
  configureTestEmail();
  const getRequest = mockFetch({ ok: true });

  await sendDueDateReminderEmail({
    email: 'alice@example.test',
    title: '<Review & finish>',
    due_date: '2030-05-06T00:00:00.000Z'
  });

  const params = readTemplateParams(getRequest);
  assert.equal(params.to_email, 'alice@example.test');
  assert.equal(params.subject, 'Task due tomorrow');
  assert.equal(params.heading, 'Task due tomorrow');
  assert.equal(params.message, 'This is a reminder that this task is due on 2030-05-06 00:00:00 UTC.');
  assert.equal(params.task_title, '&lt;Review &amp; finish&gt;');
  assert.equal(params.due_date, '2030-05-06 00:00:00 UTC');
  assert.equal(params.image_url, '');
});

test('daily reminder maps recipient name and escaped task details', async () => {
  configureTestEmail();
  const getRequest = mockFetch({ ok: true });

  await sendPendingTaskReminderEmail({
    email: 'alice@example.test',
    name: '<Alice & Bob>',
    title: '<Review & finish>',
    description: '<script>unsafe</script>',
    due_date: '2030-05-06',
    status: 'pending',
    image_url: 'https://images.example.test/task.png'
  });

  const params = readTemplateParams(getRequest);
  assert.equal(params.to_email, 'alice@example.test');
  assert.equal(params.subject, 'Daily pending task reminder');
  assert.equal(params.heading, 'Daily task reminder');
  assert.equal(params.name, '&lt;Alice &amp; Bob&gt;');
  assert.equal(params.task_title, '&lt;Review &amp; finish&gt;');
  assert.equal(params.description, '&lt;script&gt;unsafe&lt;/script&gt;');
  assert.equal(params.due_date, '2030-05-06');
  assert.equal(params.status, 'pending');
  assert.equal(params.image_url, 'https://images.example.test/task.png');
  assert.ok(Number.isFinite(Date.parse(params.time)));
});

test('EmailJS HTTP errors expose status only, not the provider response body', async () => {
  configureTestEmail();
  const logs = [];
  const originalConsoleError = console.error;
  console.error = (...args) => logs.push(args);
  mockFetch({
    ok: false,
    status: 403,
    async text() {
      return 'private body containing credentials';
    }
  });

  try {
    await assert.rejects(
      sendWelcomeEmail({ name: 'Alice', email: 'alice@example.test' }),
      {
        code: 'EMAIL_DELIVERY_FAILED',
        message: 'EmailJS delivery failed (HTTP 403).'
      }
    );
    assert.deepEqual(logs, []);
  } finally {
    console.error = originalConsoleError;
  }
});

test('EmailJS network errors are sanitized without logging request data', async () => {
  configureTestEmail();
  const originalConsoleError = console.error;
  console.error = () => {
    throw new Error('Email content must not be logged.');
  };
  global.fetch = async () => {
    throw Object.assign(
      new Error(`Network failure with ${testPublicKey} and private email content`),
      { code: 'ECONNRESET' }
    );
  };

  try {
    await assert.rejects(
      sendWelcomeEmail({ name: 'Alice', email: 'alice@example.test' }),
      {
        code: 'EMAIL_DELIVERY_FAILED',
        message: 'EmailJS request failed (ECONNRESET).'
      }
    );
  } finally {
    console.error = originalConsoleError;
  }
});

test('EmailJS delivery rejects incomplete configuration without making a request', async () => {
  configureTestEmail();
  delete process.env.EMAILJS_PUBLIC_KEY;

  let requestMade = false;
  global.fetch = async () => {
    requestMade = true;
    return { ok: true };
  };

  await assert.rejects(
    sendWelcomeEmail({ name: 'Alice', email: 'alice@example.test' }),
    { message: 'EmailJS environment configuration is incomplete.' }
  );
  assert.equal(requestMade, false);
});
