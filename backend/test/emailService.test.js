const assert = require('node:assert/strict');
const { afterEach, test } = require('node:test');
const nodemailer = require('nodemailer');

const { sendDueDateReminderEmail, sendWelcomeEmail } = require('../services/emailService');

const originalCreateTransport = nodemailer.createTransport;
const smtpEnvironmentNames = [
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASSWORD',
  'EMAIL_FROM'
];
const originalEnvironment = Object.fromEntries(
  smtpEnvironmentNames.map((name) => [name, process.env[name]])
);
const testSmtpPassword = 'test-only-app-password';

afterEach(() => {
  nodemailer.createTransport = originalCreateTransport;
  for (const name of smtpEnvironmentNames) {
    if (originalEnvironment[name] === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = originalEnvironment[name];
    }
  }
});

function configureTestEmail() {
  process.env.SMTP_HOST = 'smtp.gmail.com';
  process.env.SMTP_PORT = '587';
  process.env.SMTP_USER = 'taskflow@example.test';
  process.env.SMTP_PASSWORD = testSmtpPassword;
  process.env.EMAIL_FROM = 'Task Manager <taskflow@example.test>';
}

function mockTransport(onSendMail) {
  let transportOptions;
  nodemailer.createTransport = (options) => {
    transportOptions = options;
    return { sendMail: onSendMail };
  };
  return () => transportOptions;
}

test('welcome email uses Gmail SMTP and the escaped existing template', async () => {
  configureTestEmail();
  let message;
  const getTransportOptions = mockTransport(async (options) => {
    message = options;
  });

  await sendWelcomeEmail({ name: '<Alice & Bob>', email: 'alice@example.test' });

  assert.deepEqual(getTransportOptions(), {
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: { user: 'taskflow@example.test', pass: testSmtpPassword }
  });
  assert.equal(message.from, 'Task Manager <taskflow@example.test>');
  assert.equal(message.to, 'alice@example.test');
  assert.equal(message.subject, 'Welcome to Task Manager');
  assert.match(message.html, /Welcome, &lt;Alice &amp; Bob&gt;/);
  assert.equal(message.text, 'Welcome, <Alice & Bob>. Your Task Manager account has been created successfully.');
});

test('due-date reminder uses Gmail SMTP with the existing escaped template', async () => {
  configureTestEmail();
  let message;
  mockTransport(async (options) => {
    message = options;
  });

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

test('SMTP delivery failures do not log SMTP credentials', async () => {
  configureTestEmail();
  const logs = [];
  const originalConsoleError = console.error;
  console.error = (...args) => logs.push(args);
  mockTransport(async () => {
    throw new Error(`SMTP rejected password ${testSmtpPassword}`);
  });

  try {
    await assert.rejects(
      sendWelcomeEmail({ name: 'Alice', email: 'alice@example.test' }),
      { message: 'SMTP email delivery failed.' }
    );

    assert.deepEqual(logs, [['SMTP email delivery failed.']]);
    assert.equal(JSON.stringify(logs).includes(testSmtpPassword), false);
  } finally {
    console.error = originalConsoleError;
  }
});

test('SMTP port 465 enables secure transport', async () => {
  configureTestEmail();
  process.env.SMTP_PORT = '465';
  const getTransportOptions = mockTransport(async () => {});

  await sendWelcomeEmail({ name: 'Alice', email: 'alice@example.test' });

  assert.equal(getTransportOptions().secure, true);
});

test('email delivery rejects incomplete SMTP configuration without creating a transporter', async () => {
  configureTestEmail();
  delete process.env.SMTP_PASSWORD;
  let transporterCreated = false;
  nodemailer.createTransport = () => {
    transporterCreated = true;
    throw new Error('Transporter should not be created.');
  };

  await assert.rejects(
    sendWelcomeEmail({ name: 'Alice', email: 'alice@example.test' }),
    { message: 'Email service environment configuration is incomplete.' }
  );
  assert.equal(transporterCreated, false);
});
