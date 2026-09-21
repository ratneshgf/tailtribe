import nodemailer from 'nodemailer';

let cachedTransporter;

export const isEmailConfigured = () => Boolean(
  process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER && process.env.SMTP_PASS,
);

function transporter() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!isEmailConfigured()) {
    throw new Error('SMTP_HOST, SMTP_PORT, SMTP_USER and SMTP_PASS must be configured');
  }
  if (!cachedTransporter) {
    const port = Number(SMTP_PORT);
    cachedTransporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port,
      secure: process.env.SMTP_SECURE === 'true' || port === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
  }
  return cachedTransporter;
}

export async function sendPasswordResetEmail({ to, name, token, ttlMinutes = 30 }) {
  const origin = (process.env.WEB_ORIGIN || 'http://localhost:5173').replace(/\/$/, '');
  const resetUrl = `${origin}/?resetToken=${encodeURIComponent(token)}`;
  const brand = process.env.EMAIL_FROM_NAME || 'TailTribe';
  await transporter().sendMail({
    from: { name: brand, address: process.env.EMAIL_FROM || process.env.SMTP_USER },
    to,
    subject: 'Reset your TailTribe password',
    text: `Hi ${name || 'there'},\n\nWe received a request to reset your TailTribe password. Use this link within ${ttlMinutes} minutes:\n${resetUrl}\n\nIf you did not request this, you can ignore this email. Your password will not change.`,
    html: `<div style="margin:0;background:#080808;padding:36px 16px;font-family:Arial,sans-serif;color:#f7f7f2"><div style="max-width:520px;margin:auto;border:1px solid #30302d;border-radius:14px;background:#141414;padding:32px"><div style="font-size:22px;font-weight:700">tailtribe<span style="color:#ffd400">.</span></div><h1 style="font-size:24px;margin:28px 0 12px">Reset your password</h1><p style="color:#c5c5c0;line-height:1.6">Hi ${escapeHtml(name || 'there')}, we received a request to reset your TailTribe password.</p><p style="color:#c5c5c0;line-height:1.6">This secure link expires in ${ttlMinutes} minutes and can only be used once.</p><p style="margin:26px 0"><a href="${resetUrl}" style="display:inline-block;padding:14px 20px;border-radius:6px;background:#ffd400;color:#080808;text-decoration:none;font-weight:700">Choose a new password</a></p><p style="color:#93938c;font-size:12px;line-height:1.6">If you did not request this, ignore this message. Your password will not change.</p></div></div>`,
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}
