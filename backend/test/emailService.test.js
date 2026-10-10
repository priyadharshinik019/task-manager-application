
const assert = require('node:assert/strict');
const { afterEach, test } = require('node:test');

const {
  sendTaskCreatedEmail,
  sendDueDateReminderEmail,
  sendWelcomeEmail
} = require('../services/emailService');

const originalFetch = global.fetch;
const environmentNames = [
  'BREVO_API_KEY',
  'RESEND_API_KEY',
  'EMAIL_FROM',
  'JWT_SECRET',
  'API_KEY'
];

const originalEnvironment = Object.fromEntries(
  environmentNames.map((name) => [name, process.env[name]])
);

const testBrevoApiKey = 'test-only-brevo-api-key';

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
  process.env.BREVO_API_KEY = testBrevoApiKey;
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

test('welcome email uses Brevo and sends to the new user', async () => {
  configureTestEmail();
  const getRequest = mockFetch({ ok: true });

  await sendWelcomeEmail({
    name: '<Alice & Bob>',
    email: 'alice@example.test'
  });

  const request = getRequest();

  assert.equal(
    request.url,
    'https://api.brevo.com/v3/smtp/email'
  );
  assert.equal(request.options.method, 'POST');
  assert.equal(
    request.options.headers['api-key'],
    testBrevoApiKey
  );

  const message = JSON.parse(request.options.body);

  assert.deepEqual(message.sender, {
    name: 'Task Manager',
    email: 'taskflow@example.test'
  });
  assert.deepEqual(message.to, [{ email: 'alice@example.test' }]);
  assert.equal(message.subject, 'Welcome to Task Manager');
  assert.match(message.htmlContent, /Welcome, &lt;Alice &amp; Bob&gt;/);
  assert.equal(
    message.textContent,
    'Welcome, <Alice & Bob>. Your Task Manager account has been created successfully.'
  );
});

test('due-date reminder uses Brevo with the escaped template', async () => {
  configureTestEmail();
  const getRequest = mockFetch({ ok: true });

  await sendDueDateReminderEmail({
    email: 'alice@example.test',
    title: '<Review & finish>',
    due_date: '2030-05-06T00:00:00.000Z'
  });

  const request = getRequest();

  assert.equal(
    request.url,
    'https://api.brevo.com/v3/smtp/email'
  );

  const message = JSON.parse(request.options.body);

  assert.deepEqual(message.to, [{ email: 'alice@example.test' }]);
  assert.equal(message.subject, 'Task due tomorrow');
  assert.match(message.htmlContent, /&lt;Review &amp; finish&gt;/);
  assert.match(message.htmlContent, /2030-05-06 00:00:00 UTC/);
  assert.equal(
    message.textContent,
    'Reminder: "<Review & finish>" is due on 2030-05-06 00:00:00 UTC.'
  );
});

test('task-created email uses Brevo and includes escaped task details', async () => {
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

  const request = getRequest();
  assert.equal(request.url, 'https://api.brevo.com/v3/smtp/email');
  assert.equal(request.options.headers['api-key'], testBrevoApiKey);

  const message = JSON.parse(request.options.body);
  assert.deepEqual(message.to, [{ email: 'alice@example.test' }]);
  assert.equal(message.subject, 'Task created: <Review & finish>');
  assert.match(message.htmlContent, /&lt;Review &amp; finish&gt;/);
  assert.match(message.htmlContent, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt; &amp; details/);
  assert.match(message.htmlContent, /2030-05-06/);
  assert.match(message.htmlContent, />pending</);
  assert.match(message.htmlContent, /https:\/\/images\.example\.test\/task\?a=1&amp;b=2/);
  assert.doesNotMatch(message.htmlContent, /<script>/);
  assert.match(message.textContent, /Description: <script>alert\("x"\)<\/script> & details/);
});

test('task-created email renders optional fields when absent', async () => {
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

  const message = JSON.parse(getRequest().options.body);
  assert.match(message.htmlContent, /No description provided\./);
  assert.match(message.htmlContent, />Not set</);
  assert.doesNotMatch(message.htmlContent, /Task image/);
  assert.match(message.textContent, /Due date: Not set/);
  assert.doesNotMatch(message.textContent, /Task image:/);
});

test('Brevo failures do not expose secrets in logs', async () => {
  configureTestEmail();

  process.env.JWT_SECRET = 'test-jwt-secret';
  process.env.API_KEY = 'test-api-key';

  const logs = [];
  const originalConsoleError = console.error;

  console.error = (...args) => logs.push(args);
  mockFetch({
    ok: false,
    status: 403,
    async text() {
      return 'test error response';
    }
  });

  try {
    await assert.rejects(
      sendWelcomeEmail({ name: 'Alice', email: 'alice@example.test' }),
      { message: 'Email delivery failed.' }
    );

    assert.deepEqual(logs, [
      ['Brevo email delivery failed:', 403, 'test error response']
    ]);

    const serializedLogs = JSON.stringify(logs);

    for (const secret of [
      testBrevoApiKey,
      process.env.JWT_SECRET,
      process.env.API_KEY
    ]) {
      assert.equal(serializedLogs.includes(secret), false);
    }
  } finally {
    console.error = originalConsoleError;
  }
});

test('email delivery rejects incomplete Brevo configuration', async () => {
  configureTestEmail();
  delete process.env.BREVO_API_KEY;

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
