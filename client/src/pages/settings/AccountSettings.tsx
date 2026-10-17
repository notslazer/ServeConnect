import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { CheckCircle2, Copy, Download, Mail, Phone, ShieldAlert, Trash2, UserCheck } from 'lucide-react';
import { api, download } from '../../lib/api';
import { useAuth, useMe } from '../../lib/auth';
import type { Me } from '../../lib/types';
import {
  Button, FormError, Input, Modal, Notice, Pill, fieldError, toastError, useConfirm,
} from '../../components/ui';
import { OtpInput } from '../../components/OtpInput';
import { GoogleButton, useAppConfig } from '../../components/GoogleButton';
import { SettingsBlock, useMeMutation } from '../../components/SettingsKit';

type SendResult = { sent: boolean; destination: string; devCode?: string };

/** Add or change an email address / phone number, confirmed with a one-time code. */
function ContactRow({ kind }: { kind: 'email' | 'phone' }) {
  const me = useMe();
  const current = kind === 'email' ? me.email : me.phone;
  const verified = kind === 'email' ? me.emailVerified : me.phoneVerified;
  const [stage, setStage] = useState<'idle' | 'edit' | 'code'>('idle');
  const [value, setValue] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState<SendResult | null>(null);

  const send = useMutation({
    mutationFn: (v: string) => api<SendResult>(`/auth/contact/${kind}`, { body: { [kind]: v } }),
    onSuccess: (r) => { setSentTo(r); setCode(''); setStage('code'); },
  });
  const verify = useMeMutation((c: string) => api<Me>(`/auth/contact/${kind}/verify`, { body: { [kind]: value, code: c } }), {
    success: kind === 'email' ? 'Email address verified' : 'Phone number verified',
    onDone: () => { setStage('idle'); setValue(''); setCode(''); setSentTo(null); },
  });
  const start = (prefill = '') => { setValue(prefill); setStage(prefill ? 'code' : 'edit'); if (prefill) send.mutate(prefill); };
  const cancel = () => { setStage('idle'); setValue(''); setCode(''); send.reset(); verify.reset(); };

  const Icon = kind === 'email' ? Mail : Phone;
  const title = kind === 'email' ? 'Email address' : 'Mobile number';

  return (
    <div className="py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-paper text-ink-soft" aria-hidden><Icon className="h-[18px] w-[18px]" /></span>
          <div className="min-w-0">
            <div className="font-semibold">{title}</div>
            <div className="break-all text-ink-soft">{current ?? (kind === 'email' ? 'No email added' : 'No phone number added')}</div>
            {current && (
              <div className="mt-1">
                {verified ? <Pill tone="leaf" icon={<CheckCircle2 className="h-3 w-3" />}>Verified</Pill> : <Pill tone="marigold">Not verified</Pill>}
              </div>
            )}
          </div>
        </div>
        {stage === 'idle' && (
          <div className="flex flex-wrap gap-2">
            {current && !verified && <Button size="sm" variant="secondary" loading={send.isPending} onClick={() => start(current)}>Verify</Button>}
            <Button size="sm" variant="outline" onClick={() => start()}>{current ? 'Change' : 'Add'}</Button>
          </div>
        )}
      </div>

      {stage === 'edit' && (
        <form className="mt-3 space-y-3 rounded-xl bg-paper p-3 sm:p-4" onSubmit={(e) => { e.preventDefault(); send.mutate(value.trim()); }}>
          <Input
            label={kind === 'email' ? 'New email address' : 'New mobile number'}
            type={kind === 'email' ? 'email' : 'tel'}
            inputMode={kind === 'email' ? 'email' : 'tel'}
            autoComplete={kind === 'email' ? 'email' : 'tel'}
            placeholder={kind === 'email' ? 'you@example.com' : '+91 98765 43210'}
            hint={kind === 'phone' ? 'Include the country code if you are outside India. We will text you a code.' : 'We will email a 6-digit code to confirm it is yours.'}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            error={fieldError(send.error, kind)}
            required
            autoFocus
          />
          <FormError error={!fieldError(send.error, kind) && send.error} />
          <div className="flex gap-2">
            <Button type="submit" size="sm" loading={send.isPending} disabled={value.trim().length < 5}>Send code</Button>
            <Button size="sm" variant="ghost" onClick={cancel}>Cancel</Button>
          </div>
        </form>
      )}

      {stage === 'code' && (
        <div className="mt-3 space-y-3 rounded-xl bg-paper p-3 sm:p-4">
          {send.isPending && !sentTo ? (
            <p className="text-sm text-ink-soft">Sending a code…</p>
          ) : send.error ? (
            <FormError error={send.error} />
          ) : (
            <p className="text-sm text-ink-soft">Enter the 6-digit code we sent to <span className="font-semibold text-ink">{sentTo?.destination}</span>. It expires in 10 minutes.</p>
          )}
          {sentTo?.devCode && <p className="text-sm text-marigold-700">Development mode: your code is <span className="font-mono font-bold">{sentTo.devCode}</span></p>}
          <div className="max-w-xs">
            <OtpInput value={code} onChange={setCode} onComplete={(c) => verify.mutate(c)} error={Boolean(verify.error)} />
          </div>
          <FormError error={verify.error} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" loading={verify.isPending} disabled={code.length !== 6} onClick={() => verify.mutate(code)}>Verify</Button>
            <Button size="sm" variant="ghost" loading={send.isPending} onClick={() => send.mutate(value)}>Resend code</Button>
            <Button size="sm" variant="ghost" onClick={cancel}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function GoogleRow() {
  const me = useMe();
  const config = useAppConfig();
  const [confirm, dialog] = useConfirm();
  const link = useMeMutation((credential: string) => api<Me>('/auth/google/link', { body: { credential } }), { success: 'Google account connected' });
  const unlink = useMeMutation(() => api<Me>('/auth/google/unlink', { method: 'POST' }), { success: 'Google account disconnected' });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-paper" aria-hidden>
            <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" /><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" /><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" /><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" /></svg>
          </span>
          <div>
            <div className="font-semibold">Google</div>
            <div className="text-sm text-ink-soft">{me.googleLinked ? 'Connected — you can sign in with Google.' : 'Sign in with one tap using your Google account.'}</div>
          </div>
        </div>
        {me.googleLinked && (
          <Button size="sm" variant="outline" loading={unlink.isPending} onClick={async () => {
            if (await confirm({ title: 'Disconnect Google?', body: 'You will need your password or a one-time code to sign in afterwards.', confirmLabel: 'Disconnect', danger: true })) unlink.mutate();
          }}>Disconnect</Button>
        )}
      </div>
      {!me.googleLinked && (
        config.data && !config.data.googleClientId ? (
          <p className="text-sm text-ink-faint">Google sign-in is not available on this server.</p>
        ) : (
          <div className="max-w-sm"><GoogleButton text="continue_with" onCredential={(c) => link.mutate(c)} /></div>
        )
      )}
      <FormError error={link.error || unlink.error} />
      {dialog}
    </div>
  );
}

function GuardianPanel() {
  const me = useMe();
  const { reload } = useAuth();
  const [changing, setChanging] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [devLink, setDevLink] = useState<string | null>(null);
  const resend = useMutation({
    mutationFn: (b: { guardianEmail?: string; guardianName?: string }) => api<{ sent: boolean; devGuardianLink?: string }>('/auth/guardian-resend', { body: b }),
    onSuccess: async (r, b) => {
      toast.success(`Consent request sent to ${b.guardianEmail ?? me.guardianEmail}`);
      setDevLink(r.devGuardianLink ?? null);
      setChanging(false);
      setEmail('');
      if (b.guardianEmail) await reload().catch(() => {});
    },
  });
  const status = me.guardianConsent;
  const tone = status === 'granted' ? 'leaf' : status === 'denied' ? 'blood' : 'marigold';
  const statusText = { granted: 'Approved', denied: 'Declined', pending: 'Waiting for approval', not_required: 'Not required' }[status];
  return (
    <SettingsBlock id="guardian-h" title="Parent or guardian consent" description="Volunteers under 18 need a parent or guardian to approve their account before joining in-person events.">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone={tone}>{statusText}</Pill>
          {me.guardianEmail && <span className="text-sm text-ink-soft">Guardian: <span className="font-semibold text-ink">{me.guardianEmail}</span></span>}
        </div>
        {status === 'granted' ? (
          <p className="text-sm text-ink-soft">You can register for events. For your safety, direct messages stay off and your contact details and exact location are never shown on your profile.</p>
        ) : (
          <>
            <p className="text-sm text-ink-soft">
              {status === 'denied'
                ? 'Your guardian declined. You can still browse and follow causes. If this was a mistake, send a new request.'
                : 'We emailed your guardian a link to approve. Links expire after 14 days. Ask them to check spam, or send it again.'}
            </p>
            {devLink && <p className="break-all text-sm text-marigold-700">Development mode link: <a className="link" href={devLink}>{devLink}</a></p>}
            {changing ? (
              <form className="space-y-3 rounded-xl bg-paper p-3 sm:p-4" onSubmit={(e) => { e.preventDefault(); resend.mutate({ guardianEmail: email.trim(), guardianName: name.trim() || undefined }); }}>
                <Input label="Guardian's email" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} required error={fieldError(resend.error, 'guardianEmail')} />
                <Input label="Guardian's name" optional value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
                <FormError error={resend.error} />
                <div className="flex gap-2">
                  <Button type="submit" size="sm" loading={resend.isPending}>Send request</Button>
                  <Button size="sm" variant="ghost" onClick={() => setChanging(false)}>Cancel</Button>
                </div>
              </form>
            ) : (
              <>
                <FormError error={resend.error} />
                <div className="flex flex-wrap gap-2">
                  {me.guardianEmail && <Button size="sm" loading={resend.isPending} onClick={() => resend.mutate({})}>Resend request</Button>}
                  <Button size="sm" variant="outline" onClick={() => setChanging(true)}>Use a different email</Button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </SettingsBlock>
  );
}

function DeleteAccount() {
  const me = useMe();
  const { signOut } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [typed, setTyped] = useState('');
  const del = useMutation({
    mutationFn: () => api('/users/me/delete', { body: { password: me.hasPassword ? password : undefined, confirm: typed } }),
    onSuccess: async () => {
      setOpen(false);
      toast.success('Your account has been deleted');
      await signOut();
      nav('/', { replace: true });
    },
  });
  const close = () => { setOpen(false); setPassword(''); setTyped(''); del.reset(); };
  return (
    <>
      <Button variant="danger" icon={<Trash2 className="h-4 w-4" />} onClick={() => setOpen(true)}>Delete my account</Button>
      <Modal open={open} onClose={close} title="Delete your account?" size="sm"
        footer={<><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="danger" loading={del.isPending} disabled={typed !== 'DELETE' || (me.hasPassword && !password)} onClick={() => del.mutate()}>Delete permanently</Button></>}>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (typed === 'DELETE') del.mutate(); }}>
          <div className="text-sm text-ink-soft space-y-2">
            <p>This permanently removes your name, contact details, photos, location, blood group and follows, and signs you out everywhere. Upcoming registrations are cancelled.</p>
            <p>Certificates already issued stay verifiable, and anonymised attendance stays in organizers' records. This can't be undone — download your data first if you want a copy.</p>
          </div>
          {me.hasPassword && (
            <Input label="Your password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} error={fieldError(del.error, 'password')} />
          )}
          <Input label={<>Type <span className="font-mono">DELETE</span> to confirm</>} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoCapitalize="characters" error={fieldError(del.error, 'confirm')} />
          <FormError error={!fieldError(del.error, 'password') && !fieldError(del.error, 'confirm') && del.error} />
        </form>
      </Modal>
    </>
  );
}

export default function AccountSettings() {
  const me = useMe();
  const [exporting, setExporting] = useState(false);
  const exportData = async () => {
    setExporting(true);
    try {
      await download('/users/me/export', `serveconnect-data-${me.handle}.json`);
      toast.success('Your data download has started');
    } catch (e) {
      toastError(e);
    } finally {
      setExporting(false);
    }
  };
  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(me.csrInviteCode ?? '');
      toast.success('Invite code copied');
    } catch {
      toast.error("Couldn't copy. Select the code and copy it manually.");
    }
  };

  return (
    <div className="space-y-4">
      {me.accountStatus === 'suspended' && (
        <Notice tone="blood" icon={<ShieldAlert className="h-5 w-5" />} title="Your account is suspended">
          {me.suspendedReason ?? 'A moderator suspended this account.'} You can still update your settings and download your data. To appeal, email support@serveconnect.app.
        </Notice>
      )}

      <SettingsBlock id="contact-h" title="Sign-in and contact" description="Used to sign in, recover your account and receive important notices. Changes are confirmed with a one-time code.">
        <div className="divide-y divide-paper-line">
          <ContactRow kind="email" />
          <ContactRow kind="phone" />
        </div>
      </SettingsBlock>

      <SettingsBlock id="linked-h" title="Linked accounts">
        <GoogleRow />
      </SettingsBlock>

      {me.isMinor && <GuardianPanel />}

      {me.role === 'csr' && (
        <SettingsBlock id="csr-h" title="Company invite code" description="Share this code with employees. They join your company team from Settings → Company team, and their volunteering counts towards your CSR impact report.">
          {me.csrInviteCode ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-xl border border-dashed border-brand-300 bg-brand-50 px-4 py-2 font-mono text-xl font-bold tracking-[0.2em] text-brand-800">{me.csrInviteCode}</span>
              <Button variant="outline" size="sm" icon={<Copy className="h-4 w-4" />} onClick={copyCode}>Copy code</Button>
            </div>
          ) : (
            <p className="text-sm text-ink-soft">Your invite code is created when your company account is verified. Contact support if it doesn't appear after verification.</p>
          )}
        </SettingsBlock>
      )}

      <SettingsBlock id="data-h" title="Your data" description="Download a copy of everything linked to your account: profile, posts, registrations and hours, certificates, reviews, pledges, donation responses and follows.">
        <Button variant="outline" icon={<Download className="h-4 w-4" />} loading={exporting} onClick={exportData}>Download my data (JSON)</Button>
      </SettingsBlock>

      <SettingsBlock id="delete-h" title="Delete account" description="Permanently delete your account and personal information." className="border-blood-100">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-sm text-ink-soft"><UserCheck className="h-4 w-4 shrink-0" aria-hidden />Signed in as <span className="font-semibold text-ink">@{me.handle}</span></p>
          <DeleteAccount />
        </div>
      </SettingsBlock>
    </div>
  );
}
