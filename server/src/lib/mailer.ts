import nodemailer, { Transporter } from 'nodemailer';
import { env } from '../config/env';

let transporter: Transporter | null = null;
if (env.smtp.host) {
  transporter = nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.secure,
    auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
  });
}

let muted = false;
/** Used by the seed script so demo data never triggers real emails. */
export const muteMail = (v: boolean) => { muted = v; };

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/** Sends an email. Without SMTP configured it prints the email to the console (dev mode). Never throws. */
export async function sendMail(mail: Mail): Promise<boolean> {
  if (muted) return true;
  if (!transporter) {
    console.log(`\n📧 [mail:console] to=${mail.to}\n   subject: ${mail.subject}\n   ${mail.text}\n`);
    return true;
  }
  try {
    await transporter.sendMail({ from: env.smtp.from, ...mail });
    return true;
  } catch (e: any) {
    console.error('[mail] send failed:', e.message);
    return false;
  }
}
