import { env } from '../config/env';

/** Normalises an Indian/International phone number to E.164 (+919876543210). */
export function normalizePhone(raw: string): string | null {
  let p = raw.replace(/[\s()-]/g, '');
  if (p.startsWith('00')) p = '+' + p.slice(2);
  if (!p.startsWith('+')) {
    p = p.replace(/^0+/, '');
    p = env.sms.defaultCountryCode + p;
  }
  return /^\+[1-9]\d{7,14}$/.test(p) ? p : null;
}

/** Sends an SMS via the configured provider. Without a provider it prints to the console. Never throws. */
export async function sendSms(to: string, body: string): Promise<boolean> {
  try {
    if (env.sms.provider === 'twilio' && env.sms.twilioSid) {
      const auth = Buffer.from(`${env.sms.twilioSid}:${env.sms.twilioToken}`).toString('base64');
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.sms.twilioSid}/Messages.json`, {
        method: 'POST',
        headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ To: to, From: env.sms.twilioFrom, Body: body }),
      });
      if (!res.ok) console.error('[sms] twilio error', res.status, await res.text());
      return res.ok;
    }
    if (env.sms.provider === 'fast2sms' && env.sms.fast2smsKey) {
      // Fast2SMS (India). Uses the "q" quick route; numbers without +91.
      const res = await fetch('https://www.fast2sms.com/dev/bulkV2', {
        method: 'POST',
        headers: { authorization: env.sms.fast2smsKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ route: 'q', message: body, numbers: to.replace(/^\+91/, '') }),
      });
      if (!res.ok) console.error('[sms] fast2sms error', res.status, await res.text());
      return res.ok;
    }
    console.log(`\n📱 [sms:console] to=${to}\n   ${body}\n`);
    return true;
  } catch (e: any) {
    console.error('[sms] send failed:', e.message);
    return false;
  }
}
