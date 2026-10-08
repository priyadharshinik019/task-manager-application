const assert = require('node:assert/strict');
const { afterEach, test } = require('node:test');

const { sendDueDateReminderEmail, sendWelcomeEmail } = require('../services/emailService');

const originalFetch = global.fetch;
const emailEnvironmentNames = [
  'RESEND_API_KEY',
  'EMAIL_FROM',
  'JWT_SECRET',
  'API_KEY'
];
const originalEnvironment = Object.fromEntries(
  emailEnvironmentNames.map((name) => [name, process.env[name]])
);
const testResendApiKey = 'test-only-resend-api-key';

afterEach(() => {
  global.fetch = originalFetch;
  for (const name of emailEnvironmentNames) {
    if (originalEnvironment[name] === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = originalEnvironment[name];
    }
  }
});

function configureTestEmail() {
  process.env.RESEND_API_KEY = testResendApiKey;
  process.env.EMAIL_FROM = 'Task Manager <taskflow@example.test>';
}

function mockFetch(response) {
  let request;
  global.fetch = async (url, options) => {
    request = { url, options };
    return response;
  };
  return () => request;
}

test('welcome email uses Resend and sends to the new user with the existing template', async () => {
  configureTestEmail();
  const getRequest = mockFetch({ ok: true });

  await sendWelcomeEmail({ name: '<Alice & Bob>', email: 'alice@example.test' });

  const request = getRequest();
  assert.equal(request.url, 'https://api.resend.com/emails');
  assert.equal(request.options.method, 'POST');
  assert.deepEqual(request.options.headers, {
    Authorization: `Bearer ${testResendApiKey}`,
    'Content-Type': 'application/json'
  });

  const message = JSON.parse(request.options.body);
  assert.equal(message.from, 'Task Manager <taskflow@example.test>');
  assert.equal(message.to, 'alice@example.test');
  assert.equal(message.subject, 'Welcome to Task Manager');
  assert.match(message.html, /Welcome, &lt;Alice &amp; Bob&gt;/);
  assert.equal(message.text, 'Welcome, <Alice & Bob>. Your Task Manager account has been created successfully.');
});

test('due-date reminder uses Resend with the existing escaped template', async () => {
  configureTestEmail();
  const getRequest = mockFetch({ ok: true });

  await sendDueDateReminderEmail({
    email: 'alice@example.test',
    title: '<Review & finish>',
    due_date: '2030-05-06T00:00:00.000Z'
  });

  const request = getRequest();
  assert.equal(request.url, 'https://api.resend.com/emails');
  const message = JSON.parse(request.options.body);
  assert.equal(message.to, 'alice@example.test');
  assert.equal(message.subject, 'Task due tomorrow');
  assert.match(message.html, /&lt;Review &amp; finish&gt;/);
  assert.match(message.html, /2030-05-06 00:00:00 UTC/);
  assert.equal(message.text, 'Reminder: "<Review & finish>" is due on 2030-05-06 00:00:00 UTC.');
});

test('Resend failures log only the HTTP status and do not expose secrets', async () => {
  configureTestEmail();
  process.env.JWT_SECRET = 'test-jwt-secret';
  process.env.API_KEY = 'test-api-key';
  const logs = [];
  const originalConsoleError = console.error;
  console.error = (...args) => logs.push(args);
  mockFetch({ ok: false, status: 403 });

  try {
    await assert.rejects(
      sendWelcomeEmail({ name: 'Alice', email: 'alice@example.test' }),
      { message: 'Email delivery failed.' }
    );

    assert.deepEqual(logs, [['Resend email delivery failed with HTTP status:', 403]]);

    const serializedLogs = JSON.stringify(logs);
    for (const secret of [
      testResendApiKey,
      process.env.JWT_SECRET,
      process.env.API_KEY,
      'Bearer'
    ]) {
      assert.equal(serializedLogs.includes(secret), false);
    }
  } finally {
    console.error = originalConsoleError;
  }
});

test('email delivery rejects incomplete Resend configuration without making a request', async () => {
  configureTestEmail();
  delete process.env.RESEND_API_KEY;
  let requestMade = false;
  global.fetch = async () => {
    requestMade = true;
    throw new Error('Request should not be made.');
  };

  await assert.rejects(
    sendWelcomeEmail({ name: 'Alice', email: 'alice@example.test' }),
    { message: 'Email service environment configuration is incomplete.' }
  );
  assert.equal(requestMade, false);
});
