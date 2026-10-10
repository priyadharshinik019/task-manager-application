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

async function sendTaskCreatedEmail({ email, title, description, due_date, status, image_url }) {
  const safeTitle = escapeHtml(title);
  const safeDescription = escapeHtml(description || 'No description provided.');
  const safeDueDate = escapeHtml(due_date || 'Not set');
  const safeStatus = escapeHtml(status);
  const hasImage = Boolean(image_url);
  const safeImageUrl = hasImage ? escapeHtml(image_url) : null;
  const html = `
    <div style="margin:0;padding:32px 16px;background-color:#f4f6f8;font-family:Arial,sans-serif;color:#243041;">
      <div style="max-width:560px;margin:0 auto;padding:32px;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:8px;">
        <h1 style="margin:0 0 16px;font-size:24px;line-height:1.3;color:#1f2937;">Task created successfully</h1>
        <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#475569;">Your new task has been added to Task Manager.</p>
        <h2 style="margin:0 0 16px;font-size:20px;line-height:1.4;color:#1f2937;">${safeTitle}</h2>
        <p style="margin:0 0 8px;font-size:14px;font-weight:bold;color:#475569;">Description</p>
        <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#475569;white-space:pre-wrap;">${safeDescription}</p>
        <p style="margin:0 0 8px;font-size:14px;font-weight:bold;color:#475569;">Due date</p>
        <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#475569;">${safeDueDate}</p>
        <p style="margin:0 0 8px;font-size:14px;font-weight:bold;color:#475569;">Status</p>
        <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#475569;">${safeStatus}</p>
        ${hasImage ? `<p style="margin:0 0 8px;font-size:14px;font-weight:bold;color:#475569;">Task image</p><a href="${safeImageUrl}" target="_blank" rel="noopener noreferrer"><img src="${safeImageUrl}" alt="Task image" style="display:block;max-width:100%;height:auto;border-radius:8px;margin:0 0 16px;"></a>` : ''}
        </div>
    </div>`;

  await sendHtmlEmail({
    to: email,
    subject: `Task created: ${title}`,
    html,
    text: `Task created: ${title}\nDescription: ${description || 'No description provided.'}\nDue date: ${due_date || 'Not set'}\nStatus: ${status}${hasImage ? `\nTask image: ${image_url}` : ''}`
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

async function sendPendingTaskReminderEmail({
  email,
  name,
  title,
  description,
  due_date,
  status,
  image_url
}) {
  const safeName = escapeHtml(name || 'User');
  const safeTitle = escapeHtml(title);
  const safeDescription = escapeHtml(description || 'No description provided.');
  const safeDueDate = escapeHtml(due_date || 'Not set');
  const safeStatus = escapeHtml(status);
  const hasImage = Boolean(image_url);
  const safeImageUrl = hasImage ? escapeHtml(image_url) : null;
  const html = `
    <div style="margin:0;padding:32px 16px;background-color:#f4f6f8;font-family:Arial,sans-serif;color:#243041;">
      <div style="max-width:560px;margin:0 auto;padding:32px;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:8px;">
        <h1 style="margin:0 0 16px;font-size:24px;line-height:1.3;color:#1f2937;">Daily task reminder</h1>
        <p style="margin:0 0 12px;font-size:16px;line-height:1.6;color:#475569;">Hi ${safeName},</p>
        <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#475569;">You have a task that is still pending. Please complete your task on time!</p>
        <h2 style="margin:0 0 16px;font-size:20px;line-height:1.4;color:#1f2937;">${safeTitle}</h2>
        <p style="margin:0 0 8px;font-size:14px;font-weight:bold;color:#475569;">Description</p>
        <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#475569;white-space:pre-wrap;">${safeDescription}</p>
        <p style="margin:0 0 8px;font-size:14px;font-weight:bold;color:#475569;">Due date</p>
        <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#475569;">${safeDueDate}</p>
        <p style="margin:0 0 8px;font-size:14px;font-weight:bold;color:#475569;">Status</p>
        <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#475569;">${safeStatus}</p>
        ${hasImage ? `<p style="margin:0 0 8px;font-size:14px;font-weight:bold;color:#475569;">Task image</p><a href="${safeImageUrl}" target="_blank" rel="noopener noreferrer"><img src="${safeImageUrl}" alt="Task image" style="display:block;max-width:100%;height:auto;border-radius:8px;margin:0 0 16px;"></a>` : ''}
    </div>`;

  await sendHtmlEmail({
    to: email,
    subject: `Daily reminder: ${title}`,
    html,
    text: `Daily reminder: ${title}\nDescription: ${description || 'No description provided.'}\nDue date: ${due_date || 'Not set'}\nStatus: ${status}${hasImage ? `\nTask image: ${image_url}` : ''}`
  });
}

module.exports = {
  sendWelcomeEmail,
  sendTaskCreatedEmail,
  sendDueDateReminderEmail,
  sendPendingTaskReminderEmail
};
