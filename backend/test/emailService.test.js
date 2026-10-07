const assert = require('node:assert/strict');
const { afterEach, test } = require('node:test');
const { randomUUID } = require('node:crypto');

const { sendDueDateReminderEmail, sendWelcomeEmail } = require('../services/emailService');

const originalFetch = global.fetch;
const originalApiKey = process.env.RESEND_API_KEY;
const originalEmailFrom = process.env.EMAIL_FROM;
const testApiKey = `unit-test-${randomUUID()}`;

afterEach(() => {
  global.fetch = originalFetch;
  if (originalApiKey === undefined) {
    delete process.env.RESEND_API_KEY;
  } else {
    process.env.RESEND_API_KEY = originalApiKey;
  }
  if (originalEmailFrom === undefined) {
    delete process.env.EMAIL_FROM;
  } else {
    process.env.EMAIL_FROM = originalEmailFrom;
  }
});

function configureTestEmail() {
  process.env.RESEND_API_KEY = testApiKey;
  process.env.EMAIL_FROM = 'Task Manager <no-reply@example.test>';
}

test('welcome email uses Resend with the escaped existing template', async () => {
  configureTestEmail();
  let request;
  global.fetch = async (url, options) => {
    request = { url, ...options };
    return { ok: true, status: 200 };
  };

  await sendWelcomeEmail({ name: '<Alice & Bob>', email: 'alice@example.test' });

  assert.equal(request.url, 'https://api.resend.com/emails');
  assert.equal(request.method, 'POST');
  assert.equal(request.headers.Authorization, `Bearer ${testApiKey}`);
  assert.equal(request.headers['Content-Type'], 'application/json');
  const message = JSON.parse(request.body);
  assert.equal(message.from, 'Task Manager <no-reply@example.test>');
  assert.equal(message.to, 'alice@example.test');
  assert.equal(message.subject, 'Welcome to Task Manager');
  assert.match(message.html, /Welcome, &lt;Alice &amp; Bob&gt;/);
  assert.equal(message.text, 'Welcome, <Alice & Bob>. Your Task Manager account has been created successfully.');
});

test('due-date reminder uses Resend with the existing escaped template', async () => {
  configureTestEmail();
  let message;
  global.fetch = async (_url, options) => {
    message = JSON.parse(options.body);
    return { ok: true, status: 200 };
  };

  await sendDueDateReminderEmail({
    email: 'alice@example.test',
    title: '<Review & finish>',
    due_date: '2030-05-06T00:00:00.000Z'
  });

  assert.equal(message.to, 'alice@example.test');
  assert.equal(message.subject, 'Task due tomorrow');
  assert.match(message.html, /&lt;Review &amp; finish&gt;/);
  assert.match(message.html, /2030-05-06 00:00:00 UTC/);
  assert.equal(message.text, 'Reminder: "<Review & finish>" is due on 2030-05-06 00:00:00 UTC.');
});

test('Resend failures do not include response details or the API key', async () => {
  configureTestEmail();
  const logs = [];
  const originalConsoleError = console.error;
  console.error = (...args) => logs.push(args);
  global.fetch = async () => ({
    ok: false,
    status: 401,
    async text() {
      return `Rejected ${testApiKey}`;
    }
  });

  try {
    await assert.rejects(
      sendWelcomeEmail({ name: 'Alice', email: 'alice@example.test' }),
      (error) => {
        assert.equal(error.message, 'Resend email request failed with status 401.');
        assert.equal(error.message.includes(testApiKey), false);
        return true;
      }
    );

    assert.equal(logs.length, 1);
    assert.deepEqual(logs[0][0], {
      name: 'Error',
      message: 'Resend email request failed with status 401.',
      status: 401
    });
    assert.equal(JSON.stringify(logs).includes(testApiKey), false);
    assert.deepEqual(Object.keys(logs[0][0]).sort(), ['message', 'name', 'status']);
  } finally {
    console.error = originalConsoleError;
  }
});

test('network failure diagnostics redact a key echoed in the error message', async () => {
  configureTestEmail();
  const logs = [];
  const originalConsoleError = console.error;
  console.error = (...args) => logs.push(args);
  global.fetch = async () => {
    const error = new TypeError(`Request failed using ${testApiKey}`);
    error.statusCode = 503;
    throw error;
  };

  try {
    await assert.rejects(
      sendWelcomeEmail({ name: 'Alice', email: 'alice@example.test' }),
      TypeError
    );

    assert.equal(logs.length, 1);
    assert.deepEqual(logs[0][0], {
      name: 'TypeError',
      message: 'Request failed using [REDACTED]',
      status: 503
    });
    assert.equal(JSON.stringify(logs).includes(testApiKey), false);
    assert.deepEqual(Object.keys(logs[0][0]).sort(), ['message', 'name', 'status']);
  } finally {
    console.error = originalConsoleError;
  }
});
