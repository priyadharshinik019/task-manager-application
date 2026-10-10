function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function sendTemplateEmail({
  to,
  subject,
  heading,
  message,
  task_title = '',
  description = '',
  due_date = '',
  status = '',
  image_url = '',
  name = '',
  time = new Date().toISOString()
}) {
  const serviceId = process.env.EMAILJS_SERVICE_ID;
  const templateId = process.env.EMAILJS_TEMPLATE_ID;
  const publicKey = process.env.EMAILJS_PUBLIC_KEY;

  if (!serviceId || !templateId || !publicKey) {
    throw new Error('EmailJS environment configuration is incomplete.');
  }

  const templateParams = {
    to_email: to,
    subject,
    heading: escapeHtml(heading),
    message: escapeHtml(message),
    task_title: escapeHtml(task_title),
    description: escapeHtml(description),
    due_date: escapeHtml(due_date),
    status: escapeHtml(status),
    image_url: escapeHtml(image_url),
    name: escapeHtml(name),
    email: to,
    time: escapeHtml(time)
  };

  let response;
  try {
    response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: serviceId,
        template_id: templateId,
        user_id: publicKey,
        template_params: templateParams
      })
    });
  } catch (error) {
    const code = typeof error.code === 'string' && /^[A-Z0-9_-]+$/i.test(error.code)
      ? ` (${error.code})`
      : '';
    const deliveryError = new Error(`EmailJS request failed${code}.`);
    deliveryError.code = 'EMAIL_DELIVERY_FAILED';
    throw deliveryError;
  }

  if (!response.ok) {
    const deliveryError = new Error(
      `EmailJS delivery failed (HTTP ${response.status}).`
    );
    deliveryError.code = 'EMAIL_DELIVERY_FAILED';
    throw deliveryError;
  }
}

async function sendWelcomeEmail(user) {
  const message = 'Your Task Manager account has been created successfully.';
  await sendTemplateEmail({
    to: user.email,
    subject: 'Welcome to Task Manager',
    heading: `Welcome, ${user.name}`,
    message,
    name: user.name
  });
}

async function sendTaskCreatedEmail({
  email,
  title,
  description,
  due_date,
  status,
  image_url
}) {
  await sendTemplateEmail({
    to: email,
    subject: 'Task created successfully',
    heading: 'Task created successfully',
    message: 'Your new task has been added to Task Manager.',
    task_title: title,
    description: description || 'No description provided.',
    due_date: due_date || 'Not set',
    status,
    image_url: image_url || ''
  });
}

async function sendDueDateReminderEmail({ email, title, due_date }) {
  const dueDate = new Date(due_date)
    .toISOString()
    .replace('T', ' ')
    .replace(/\.\d{3}Z$/, ' UTC');

  await sendTemplateEmail({
    to: email,
    subject: 'Task due tomorrow',
    heading: 'Task due tomorrow',
    message: `This is a reminder that this task is due on ${dueDate}.`,
    task_title: title,
    due_date: dueDate
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
  await sendTemplateEmail({
    to: email,
    subject: 'Daily pending task reminder',
    heading: 'Daily task reminder',
    message: 'You have a task that is still pending. Please complete your task on time!',
    task_title: title,
    description: description || 'No description provided.',
    due_date: due_date || 'Not set',
    status: status || 'pending',
    image_url: image_url || '',
    name: name || 'User'
  });
}

module.exports = {
  sendWelcomeEmail,
  sendTaskCreatedEmail,
  sendDueDateReminderEmail,
  sendPendingTaskReminderEmail
};
