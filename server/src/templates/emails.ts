/* All outbound email/SMS copy lives here (externalized strings, SRS §3.4 / §6.2),
 * so wording can be reviewed or localized without touching application code. */
import { env } from '../config/env';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

function layout(title: string, inner: string) {
  return `<!doctype html><html><body style="margin:0;background:#f4f6f8;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2937">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 12px">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb">
<tr><td style="background:#0f766e;padding:18px 28px;color:#fff;font-size:20px;font-weight:700">${esc(env.appName)}</td></tr>
<tr><td style="padding:28px">
<h1 style="font-size:20px;margin:0 0 16px">${esc(title)}</h1>
${inner}
</td></tr>
<tr><td style="padding:16px 28px;background:#f9fafb;color:#6b7280;font-size:12px">
You are receiving this because you have an account on ${esc(env.appName)}. Manage email preferences in Settings → Notifications.
</td></tr></table></td></tr></table></body></html>`;
}
const button = (href: string, label: string) =>
  `<p style="margin:24px 0"><a href="${href}" style="background:#0f766e;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600">${esc(label)}</a></p>`;

const OTP_PURPOSE_TEXT: Record<string, string> = {
  verify_email: 'verify your email address',
  verify_phone: 'verify your phone number',
  login: 'sign in',
  reset_password: 'reset your password',
  change_email: 'confirm your new email address',
  change_phone: 'confirm your new phone number',
};

export const templates = {
  otpEmail(code: string, purpose: string, minutes: number) {
    const what = OTP_PURPOSE_TEXT[purpose] ?? 'continue';
    return {
      subject: `${code} is your ${env.appName} code`,
      text: `Your ${env.appName} code to ${what} is ${code}. It expires in ${minutes} minutes. If you didn't request this, you can ignore this email.`,
      html: layout(`Your code to ${what}`, `
<p>Use this code to ${esc(what)}:</p>
<p style="font-size:34px;letter-spacing:8px;font-weight:700;margin:20px 0;color:#0f766e">${code}</p>
<p>It expires in ${minutes} minutes. Never share this code with anyone — ${esc(env.appName)} staff will never ask for it.</p>
<p style="color:#6b7280">If you didn't request this, you can safely ignore this email.</p>`),
    };
  },
  otpSms(code: string, purpose: string, minutes: number) {
    const what = OTP_PURPOSE_TEXT[purpose] ?? 'continue';
    return `${code} is your ${env.appName} code to ${what}. Valid for ${minutes} min. Do not share it with anyone.`;
  },
  welcome(name: string) {
    return {
      subject: `Welcome to ${env.appName}, ${name}!`,
      text: `Welcome to ${env.appName}! Complete your profile to discover causes near you: ${env.appUrl}/onboarding`,
      html: layout(`Welcome, ${name}!`, `
<p>You're now part of a community of NGOs, organizers and volunteers making a measurable difference.</p>
<ul><li>Follow causes and organizations you care about</li><li>Register for drives and check in with a QR code</li><li>Earn verified service hours and certificates</li></ul>
${button(`${env.appUrl}/onboarding`, 'Complete your profile')}`),
    };
  },
  guardianConsent(childName: string, link: string, guardianName?: string) {
    return {
      subject: `Consent needed: ${childName} wants to volunteer on ${env.appName}`,
      text: `${childName} has created a volunteer account on ${env.appName} and listed you as their parent/guardian. Review and give or decline consent: ${link}`,
      html: layout('Parent / guardian consent requested', `
<p>Hello${guardianName ? ' ' + esc(guardianName) : ''},</p>
<p><b>${esc(childName)}</b> has created a volunteer account on ${esc(env.appName)} and listed you as their parent or guardian.
Because they are under 18, they cannot register for in-person events until you give consent.</p>
<p>We never show a minor's exact location or contact details to other users, and direct messages to minors are disabled.</p>
${button(link, 'Review and respond')}
<p style="color:#6b7280">This link expires in 14 days. If you don't know this person, choose "Decline".</p>`),
    };
  },
  notification(title: string, body: string, link?: string) {
    const href = link ? (link.startsWith('http') ? link : `${env.appUrl}${link}`) : env.appUrl;
    return {
      subject: title,
      text: `${title}\n\n${body}\n\n${href}`,
      html: layout(title, `<p>${esc(body)}</p>${button(href, 'Open ' + env.appName)}`),
    };
  },
  newLoginAlert(device: string, ip: string, when: string) {
    return {
      subject: `New sign-in to your ${env.appName} account`,
      text: `We noticed a new sign-in on ${device} (IP ${ip}) at ${when}. If this wasn't you, reset your password and revoke the session in Settings → Security.`,
      html: layout('New sign-in detected', `
<p>We noticed a new sign-in to your account:</p>
<p><b>Device:</b> ${esc(device)}<br><b>IP:</b> ${esc(ip)}<br><b>Time:</b> ${esc(when)}</p>
<p>If this was you, no action is needed. If not, reset your password and revoke the session immediately.</p>
${button(`${env.appUrl}/settings/security`, 'Review security')}`),
    };
  },
};
