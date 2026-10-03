const nodemailer = require("nodemailer");

let transporter;

function getTransporter() {
  if (process.env.NODE_ENV === "test") {
    return null;
  }
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM } =
    process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASSWORD || !SMTP_FROM) {
    return null;
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT),
      secure: Number(SMTP_PORT) === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
    });
  }
  return transporter;
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

function emailShell(title, content) {
  return `<!doctype html><html><body style="margin:0;background:#f5f3ee;font-family:Arial,sans-serif;color:#20231f"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 12px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fffdf9;border:1px solid #e5e1d8;border-radius:16px"><tr><td style="padding:32px"><p style="margin:0 0 24px;color:#52745f;font-size:13px;font-weight:bold;letter-spacing:2px">DAYMARK / TASK MANAGER</p><h1 style="margin:0 0 16px;font-size:28px;line-height:1.2">${title}</h1>${content}<p style="margin:32px 0 0;color:#77786f;font-size:12px">A clear place for what matters next.</p></td></tr></table></td></tr></table></body></html>`;
}

async function sendMail({ to, subject, html }) {
  const mailer = getTransporter();
  if (!mailer) {
    return { sent: false, reason: "not_configured" };
  }

  await mailer.sendMail({ from: process.env.SMTP_FROM, to, subject, html });
  return { sent: true };
}

function sendWelcomeEmail(user) {
  const name = escapeHtml(user.name);
  const appUrl = process.env.APP_URL || "http://localhost:5173";
  const html = emailShell(
    `Welcome, ${name}.`,
    `<p style="font-size:16px;line-height:1.6;color:#55574f">Your account is ready. Bring your next task into focus and keep the important things moving.</p><a href="${appUrl}" style="display:inline-block;margin-top:12px;padding:13px 18px;background:#52745f;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold">Open your dashboard</a>`,
  );
  return sendMail({
    to: user.email,
    subject: "Welcome to Daymark",
    html,
  });
}

function sendDueReminderEmail(task) {
  const title = escapeHtml(task.title);
  const appUrl = process.env.APP_URL || "http://localhost:5173";
  const dueDate = new Date(task.due_date).toLocaleString("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  });
  const html = emailShell(
    "A task is due soon.",
    `<p style="font-size:16px;line-height:1.6;color:#55574f"><strong>${title}</strong> is due ${dueDate} (UTC). Take a moment to review it before the deadline.</p><a href="${appUrl}" style="display:inline-block;margin-top:12px;padding:13px 18px;background:#52745f;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold">View your tasks</a>`,
  );
  return sendMail({
    to: task.email,
    subject: `Due soon: ${task.title}`,
    html,
  });
}

module.exports = { sendDueReminderEmail, sendWelcomeEmail };
