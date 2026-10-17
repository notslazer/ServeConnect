/* Building blocks shared by sign-in and sign-up: auth page frame, OTP verification step, 2FA step,
 * Google sign-up completion and password strength. */
import { ReactNode, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ShieldCheck, Mail, Smartphone } from 'lucide-react';
import clsx from 'clsx';
import { api, ApiError } from '../lib/api';
import { Logo } from './Logo';
import { useAppConfig } from './GoogleButton';
import { OtpInput } from './OtpInput';
import { Button, Checkbox, FormError, Input, Notice, Select, fieldError } from './ui';
import { PasswordMeter } from './SettingsKit';
import type { Me } from '../lib/types';

export type SessionPayload = { accessToken: string; user: Me };

export function AuthFrame({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-paper lg:flex-row">
      <aside className="relative hidden overflow-hidden bg-brand-700 p-10 text-white lg:flex lg:w-[44%] lg:flex-col lg:justify-between">
        <Link to="/" className="inline-flex items-center gap-2 font-display text-xl font-extrabold">
          <span className="rounded-xl bg-white p-1"><Logo compact /></span>
        </Link>
        <div className="relative z-10 max-w-md">
          <p className="font-display text-[40px] font-extrabold leading-[1.05]">Every hour you give, checked in and counted.</p>
          <p className="mt-4 text-lg text-brand-100">Find drives near you, check in with a QR code, and build a verified record of your service — certificates included.</p>
        </div>
        <div className="stamp absolute -bottom-10 -right-10 h-72 w-72 border-marigold-400 text-marigold-300 opacity-90" aria-hidden>
          <span className="text-6xl leading-none">1,200+</span>
          <span className="text-lg">verified hours</span>
        </div>
        <p className="relative z-10 text-sm text-brand-200">Free for NGOs, organizers and volunteers.</p>
      </aside>
      <main className="flex flex-1 flex-col items-center justify-center px-5 py-10">
        <div className="w-full max-w-[420px]">
          <Link to="/" className="mb-8 inline-block lg:hidden"><Logo /></Link>
          <h1 className="text-[28px] font-extrabold">{title}</h1>
          {subtitle && <p className="mt-1 text-ink-soft">{subtitle}</p>}
          <div className="mt-6">{children}</div>
          {footer && <div className="mt-8 text-center text-[15px] text-ink-soft">{footer}</div>}
        </div>
      </main>
    </div>
  );
}

export function OrDivider() {
  const { data } = useAppConfig();
  if (!data?.googleClientId) return null;
  return <div className="flex items-center gap-3 text-sm text-ink-faint"><span className="h-px flex-1 bg-paper-line" />or<span className="h-px flex-1 bg-paper-line" /></div>;
}

export function DevCode({ code }: { code?: string }) {
  if (!code) return null;
  return <p className="rounded-lg bg-marigold-50 px-3 py-2 text-sm text-marigold-700">Development mode — your code is <b className="font-mono tracking-widest">{code}</b>. (Hidden in production.)</p>;
}

/** Enter a 6-digit code sent to email/phone, with resend cooldown. */
export function VerifyStep({ identifier, destination, channel, endpoint, purpose, devCode: initialDev, onVerified, onBack }: {
  identifier: string;
  destination: string;
  channel: 'email' | 'sms';
  endpoint: '/auth/verify' | '/auth/otp/verify';
  purpose: 'verify_email' | 'verify_phone' | 'login';
  devCode?: string;
  onVerified: (data: any) => void;
  onBack?: () => void;
}) {
  const { t } = useTranslation();
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState(initialDev);
  const [cooldown, setCooldown] = useState(45);
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);
  const verify = useMutation({ mutationFn: (c: string) => api(endpoint, { body: { identifier, code: c } }), onSuccess: onVerified, onError: () => setCode('') });
  const resend = useMutation({
    mutationFn: () => api<{ devCode?: string }>(purpose === 'login' ? '/auth/otp/request' : '/auth/resend', { body: purpose === 'login' ? { identifier } : { identifier, purpose } }),
    onSuccess: (d) => { setCooldown(45); setDevCode(d.devCode); },
  });
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-2xl bg-brand-50 p-4 text-brand-800">
        {channel === 'email' ? <Mail className="mt-0.5 h-5 w-5 shrink-0" /> : <Smartphone className="mt-0.5 h-5 w-5 shrink-0" />}
        <p className="text-[15px]">{t('auth.codeSent', { dest: destination })}. It expires in 10 minutes.</p>
      </div>
      <OtpInput value={code} onChange={setCode} onComplete={(c) => verify.mutate(c)} error={Boolean(verify.error)} />
      <FormError error={verify.error} />
      <DevCode code={devCode} />
      <Button block size="lg" loading={verify.isPending} disabled={code.length !== 6} onClick={() => verify.mutate(code)}>{t('auth.verify')}</Button>
      <div className="flex items-center justify-between text-sm">
        {onBack ? <button className="link" onClick={onBack}>Use a different {channel === 'email' ? 'email' : 'number'}</button> : <span />}
        <button className="link disabled:text-ink-faint disabled:no-underline" disabled={cooldown > 0 || resend.isPending} onClick={() => resend.mutate()}>
          {cooldown > 0 ? `Resend in ${cooldown}s` : t('auth.resend')}
        </button>
      </div>
      {resend.error && <FormError error={resend.error} />}
    </div>
  );
}

/** Second factor after password / OTP / Google when 2FA is enabled. */
export function TwoFactorStep({ mfaToken, onDone, onCancel }: { mfaToken: string; onDone: (d: SessionPayload) => void; onCancel: () => void }) {
  const { t } = useTranslation();
  const [code, setCode] = useState('');
  const [useBackup, setUseBackup] = useState(false);
  const m = useMutation({ mutationFn: (c: string) => api<SessionPayload>('/auth/2fa/verify', { body: { mfaToken, code: c } }), onSuccess: onDone, onError: () => setCode('') });
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-2xl bg-brand-50 p-4 text-brand-800">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
        <p className="text-[15px]">{t('auth.twoFactorHelp')}</p>
      </div>
      {useBackup ? (
        <Input label="Backup code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="XXXXX-XXXXX" autoFocus autoComplete="off" />
      ) : (
        <OtpInput value={code} onChange={setCode} onComplete={(c) => m.mutate(c)} error={Boolean(m.error)} />
      )}
      <FormError error={m.error} />
      <Button block size="lg" loading={m.isPending} disabled={code.length < 6} onClick={() => m.mutate(code)}>{t('auth.verify')}</Button>
      <div className="flex justify-between text-sm">
        <button className="link" onClick={() => { setUseBackup((v) => !v); setCode(''); }}>{useBackup ? 'Use authenticator app' : 'Use a backup code'}</button>
        <button className="link" onClick={onCancel}>Start over</button>
      </div>
    </div>
  );
}

export const ROLE_CHOICES = [
  { id: 'volunteer', title: 'Volunteer', body: 'Find drives, check in, earn verified hours.' },
  { id: 'organizer', title: 'NGO or organizer', body: 'Host events, manage volunteers, post needs.' },
  { id: 'csr', title: 'Company (CSR)', body: 'Bring your employees and track impact.' },
] as const;

export function RolePicker({ value, onChange }: { value: string; onChange: (v: 'volunteer' | 'organizer' | 'csr') => void }) {
  return (
    <div role="radiogroup" aria-label="Account type" className="grid gap-2 sm:grid-cols-3">
      {ROLE_CHOICES.map((r) => (
        <button key={r.id} type="button" role="radio" aria-checked={value === r.id} onClick={() => onChange(r.id)}
          className={clsx('rounded-2xl border p-3 text-left transition', value === r.id ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-100' : 'border-paper-line bg-white hover:border-brand-200')}>
          <div className="font-bold">{r.title}</div>
          <div className="mt-0.5 text-[13px] leading-snug text-ink-soft">{r.body}</div>
        </button>
      ))}
    </div>
  );
}

export function ageFrom(dob: string) {
  if (!dob) return null;
  const d = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

/** Fields shared by email sign-up and Google sign-up completion: role-specific age / guardian / org type + terms. */
export function ProfileBasics({ hideRole, role, setRole, dob, setDob, guardianEmail, setGuardianEmail, guardianName, setGuardianName, orgType, setOrgType, accept, setAccept, error }: {
  hideRole?: boolean; role: string; setRole: (v: any) => void; dob: string; setDob: (v: string) => void; guardianEmail: string; setGuardianEmail: (v: string) => void;
  guardianName: string; setGuardianName: (v: string) => void; orgType: string; setOrgType: (v: string) => void; accept: boolean; setAccept: (v: boolean) => void; error: unknown;
}) {
  const age = ageFrom(dob);
  const minor = age !== null && age < 18 && age >= 13;
  return (
    <>
      {!hideRole && <RolePicker value={role} onChange={setRole} />}
      {role === 'volunteer' && (
        <Input label="Date of birth" type="date" value={dob} onChange={(e) => setDob(e.target.value)} max={new Date().toISOString().slice(0, 10)} required
          hint="Used to keep under-18 volunteers safe. Never shown publicly." error={fieldError(error, 'dateOfBirth') ?? (age !== null && age < 13 ? 'You must be at least 13 to join.' : undefined)} />
      )}
      {role === 'volunteer' && minor && (
        <div className="space-y-3 rounded-2xl border border-marigold-100 bg-marigold-50 p-4">
          <p className="text-sm text-marigold-700">Because you're under 18, we'll email your parent or guardian for consent before you can join in-person events. Direct messages are turned off for under-18 accounts.</p>
          <Input label="Parent or guardian's email" type="email" value={guardianEmail} onChange={(e) => setGuardianEmail(e.target.value)} required error={fieldError(error, 'guardianEmail')} />
          <Input label="Their name" optional value={guardianName} onChange={(e) => setGuardianName(e.target.value)} />
        </div>
      )}
      {role === 'organizer' && (
        <Select label="What kind of organizer are you?" value={orgType} onChange={(e) => setOrgType(e.target.value)} options={{ ngo: 'Registered NGO / non-profit', independent: 'Independent community organizer' }} />
      )}
      <Checkbox checked={accept} onChange={setAccept} error={fieldError(error, 'acceptTerms')}
        label={<>I agree to the <Link to="/terms" target="_blank" className="link">Terms of Service</Link> and <Link to="/privacy" target="_blank" className="link">Privacy Policy</Link>, including how sensitive data like blood group and location is used.</>} />
    </>
  );
}

/** Shown when a Google account isn't registered yet. */
export function GoogleComplete({ info, onDone, onCancel }: { info: { googleToken: string; name: string; email: string }; onDone: (d: SessionPayload) => void; onCancel: () => void }) {
  const [role, setRole] = useState<'volunteer' | 'organizer' | 'csr'>('volunteer');
  const [dob, setDob] = useState('');
  const [guardianEmail, setGuardianEmail] = useState('');
  const [guardianName, setGuardianName] = useState('');
  const [orgType, setOrgType] = useState('ngo');
  const [accept, setAccept] = useState(false);
  const m = useMutation({
    mutationFn: () => api<SessionPayload>('/auth/google/complete', {
      body: { googleToken: info.googleToken, role, dateOfBirth: dob || undefined, guardianEmail: guardianEmail || undefined, guardianName: guardianName || undefined, orgType: role === 'organizer' ? orgType : role === 'csr' ? 'company' : undefined, acceptTerms: accept },
    }),
    onSuccess: onDone,
  });
  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
      <Notice tone="brand">Signing up as <b>{info.name}</b> ({info.email}). Tell us a bit more to finish.</Notice>
      <ProfileBasics {...{ role, setRole, dob, setDob, guardianEmail, setGuardianEmail, guardianName, setGuardianName, orgType, setOrgType, accept, setAccept }} error={m.error} />
      <FormError error={m.error instanceof ApiError && Object.keys(m.error.fields).length ? null : m.error} />
      <Button type="submit" block size="lg" loading={m.isPending} disabled={!accept}>Create account</Button>
      <button type="button" className="link block w-full text-center text-sm" onClick={onCancel}>Cancel</button>
    </form>
  );
}

export function PasswordField({ value, onChange, error, label = 'Password', autoComplete = 'new-password' }: { value: string; onChange: (v: string) => void; error?: string; label?: string; autoComplete?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-2">
      <div className="relative">
        <Input label={label} type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} error={error} />
        <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-3 top-[38px] text-sm font-semibold text-brand-600">{show ? 'Hide' : 'Show'}</button>
      </div>
      {value && <PasswordMeter value={value} />}
    </div>
  );
}
