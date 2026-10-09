function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function sendHtmlEmail({ to, subject, html, text }) {
  const apiKey = process.env.BREVO_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    throw new Error('Email service environment configuration is incomplete.');
  }

  const match = from.match(/^(.*?)\s*<([^<>]+)>$/);
  const sender = match
    ? { name: match[1].replace(/^["']|["']$/g, ''), email: match[2] }
    : { email: from };

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'accept': 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      sender,
      to: [{ email: to }],
      subject,
      htmlContent: html,
      textContent: text
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(
      'Brevo email delivery failed:',
      response.status,
      errorBody
    );
    throw new Error('Email delivery failed.');
  }

  console.log('Email accepted by Brevo.');
}

async function sendWelcomeEmail(user) {
  const name = escapeHtml(user.name);
  const html = `
    <div style="margin:0;padding:32px 16px;background-color:#f4f6f8;font-family:Arial,sans-serif;color:#243041;">
      <div style="max-width:560px;margin:0 auto;padding:32px;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:8px;">
        <h1 style="margin:0 0 16px;font-size:24px;line-height:1.3;color:#1f2937;">Welcome, ${name}</h1>
        <p style="margin:0;font-size:16px;line-height:1.6;color:#475569;">Your Task Manager account has been created successfully.</p>
      </div>
    </div>`;

  await sendHtmlEmail({
    to: user.email,
    subject: 'Welcome to Task Manager',
    html,
    text: `Welcome, ${user.name}. Your Task Manager account has been created successfully.`
  });
}

async function sendDueDateReminderEmail({ email, title, due_date }) {
  const safeTitle = escapeHtml(title);
  const dueDate = escapeHtml(
    new Date(due_date).toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC')
  );
  const html = `
    <div style="margin:0;padding:32px 16px;background-color:#f4f6f8;font-family:Arial,sans-serif;color:#243041;">
      <div style="max-width:560px;margin:0 auto;padding:32px;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:8px;">
        <h1 style="margin:0 0 16px;font-size:24px;line-height:1.3;color:#1f2937;">Task due tomorrow</h1>
        <p style="margin:0 0 12px;font-size:16px;line-height:1.6;color:#475569;">This is a reminder that the following task is due on ${dueDate}:</p>
        <p style="margin:0;font-size:16px;line-height:1.6;font-weight:bold;color:#1f2937;">${safeTitle}</p>
      </div>
    </div>`;

  await sendHtmlEmail({
    to: email,
    subject: 'Task due tomorrow',
    html,
    text: `Reminder: "${title}" is due on ${dueDate}.`
  });
}

module.exports = { sendWelcomeEmail, sendDueDateReminderEmail };
