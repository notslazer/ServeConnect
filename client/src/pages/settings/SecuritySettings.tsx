import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { Copy, Download, KeyRound, LogOut, Monitor, ShieldCheck, ShieldAlert, Smartphone } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth, useMe } from '../../lib/auth';
import { ago, fmtDateTime } from '../../lib/format';
import {
  Button, EmptyState, ErrorState, FormError, Input, Modal, Notice, Pill, Skeleton, fieldError, toastError, useConfirm,
} from '../../components/ui';
import { OtpInput } from '../../components/OtpInput';
import { PasswordMeter, SettingsBlock, passwordRules } from '../../components/SettingsKit';

// ───────────────────────── password ─────────────────────────
function PasswordBlock() {
  const me = useMe();
  const { reload } = useAuth();
  const qc = useQueryClient();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [mismatch, setMismatch] = useState(false);
  const m = useMutation({
    mutationFn: () => api('/auth/password/change', { body: { currentPassword: me.hasPassword ? current : undefined, newPassword: next } }),
    onSuccess: async () => {
      toast.success(me.hasPassword ? 'Password changed. Other devices were signed out.' : 'Password set');
      setCurrent(''); setNext(''); setAgain('');
      qc.invalidateQueries({ queryKey: ['sessions'] });
      if (!me.hasPassword) await reload().catch(() => {});
    },
  });
  const valid = passwordRules(next).every((r) => r.ok);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (next !== again) return setMismatch(true);
    setMismatch(false);
    m.mutate();
  };
  return (
    <SettingsBlock id="pw-h" title={me.hasPassword ? 'Change password' : 'Set a password'}
      description={me.hasPassword ? 'Changing your password signs you out on every other device.' : 'You currently sign in with Google or one-time codes. Add a password as a backup way in.'}>
      <form onSubmit={submit} className="max-w-md space-y-4">
        {/* Hidden username helps password managers save the right entry. */}
        <input type="text" name="username" autoComplete="username" value={me.email ?? me.handle} readOnly hidden />
        {me.hasPassword && (
          <Input label="Current password" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required error={fieldError(m.error, 'currentPassword')} />
        )}
        <div className="space-y-2">
          <Input label="New password" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required maxLength={128} error={fieldError(m.error, 'newPassword')} />
          <PasswordMeter value={next} />
        </div>
        <Input label="Confirm new password" type="password" autoComplete="new-password" value={again} onChange={(e) => { setAgain(e.target.value); setMismatch(false); }} required
          error={mismatch ? "Passwords don't match" : undefined} />
        <FormError error={!fieldError(m.error, 'currentPassword') && !fieldError(m.error, 'newPassword') && m.error} />
        <Button type="submit" loading={m.isPending} disabled={!valid || !again || (me.hasPassword && !current)}>{me.hasPassword ? 'Change password' : 'Set password'}</Button>
      </form>
    </SettingsBlock>
  );
}

// ───────────────────────── 2FA ─────────────────────────
function BackupCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const me = useMe();
  const text = `ServeConnect backup codes for ${me.email ?? '@' + me.handle}\nEach code works once. Keep them somewhere safe.\n\n${codes.join('\n')}\n`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(codes.join('\n')); toast.success('Backup codes copied'); } catch { toast.error("Couldn't copy. Select the codes and copy them manually."); }
  };
  const save = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    a.download = 'serveconnect-backup-codes.txt';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  return (
    <div className="space-y-4">
      <Notice tone="marigold" title="Save these backup codes now">
        If you lose your phone, each code lets you sign in once. They won't be shown again.
      </Notice>
      <ol className="grid grid-cols-2 gap-2 rounded-xl border border-paper-line bg-paper p-3 font-mono text-[15px] font-semibold sm:grid-cols-2" aria-label="Backup codes">
        {codes.map((c) => <li key={c} className="rounded-lg bg-white px-2 py-1.5 text-center tracking-wider">{c}</li>)}
      </ol>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" icon={<Copy className="h-4 w-4" />} onClick={copy}>Copy</Button>
        <Button variant="outline" size="sm" icon={<Download className="h-4 w-4" />} onClick={save}>Download .txt</Button>
        <Button size="sm" className="ml-auto" onClick={onDone}>I saved them</Button>
      </div>
    </div>
  );
}

/** Asks for an authenticator or backup code before a sensitive 2FA change. */
function CodeModal({ open, title, body, action, danger, onClose, onSubmit, pending, error }: {
  open: boolean; title: string; body: string; action: string; danger?: boolean; onClose: () => void; onSubmit: (code: string) => void; pending: boolean; error: unknown;
}) {
  const [code, setCode] = useState('');
  const close = () => { setCode(''); onClose(); };
  const clean = code.replace(/\s/g, '');
  return (
    <Modal open={open} onClose={close} title={title} size="sm"
      footer={<><Button variant="ghost" onClick={close}>Cancel</Button><Button variant={danger ? 'danger' : 'primary'} loading={pending} disabled={clean.length < 6} onClick={() => onSubmit(clean)}>{action}</Button></>}>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (clean.length >= 6) onSubmit(clean); }}>
        <p className="text-sm text-ink-soft">{body}</p>
        <Input label="Authentication code" inputMode="text" autoComplete="one-time-code" placeholder="123456 or a backup code" value={code} onChange={(e) => setCode(e.target.value)} />
        <FormError error={error} />
      </form>
    </Modal>
  );
}

function TwoFactorBlock() {
  const me = useMe();
  const { reload } = useAuth();
  const [setup, setSetup] = useState<null | { secret: string; otpauth: string; qr: string }>(null);
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  const [modal, setModal] = useState<null | 'disable' | 'regen'>(null);
  const highRisk = me.role === 'organizer' || me.role === 'csr' || me.role === 'admin';

  const start = useMutation({ mutationFn: () => api<{ secret: string; otpauth: string; qr: string }>('/auth/2fa/setup', { method: 'POST' }), onSuccess: (d) => { setSetup(d); setCode(''); }, onError: toastError });
  const enable = useMutation({
    mutationFn: (c: string) => api<{ enabled: boolean; backupCodes: string[] }>('/auth/2fa/enable', { body: { code: c } }),
    onSuccess: async (d) => { setSetup(null); setCodes(d.backupCodes); toast.success('Two-factor authentication is on'); await reload().catch(() => {}); },
  });
  const disable = useMutation({
    mutationFn: (c: string) => api('/auth/2fa/disable', { body: { code: c } }),
    onSuccess: async () => { setModal(null); toast.success('Two-factor authentication is off'); await reload().catch(() => {}); },
  });
  const regen = useMutation({
    mutationFn: (c: string) => api<{ backupCodes: string[] }>('/auth/2fa/backup-codes', { body: { code: c } }),
    onSuccess: (d) => { setModal(null); setCodes(d.backupCodes); },
  });
  const copySecret = async () => {
    try { await navigator.clipboard.writeText(setup!.secret); toast.success('Setup key copied'); } catch { toast.error("Couldn't copy. Type the key into your app instead."); }
  };

  return (
    <SettingsBlock id="2fa-h" title="Two-factor authentication"
      description="Protect your account with a code from an authenticator app (Google Authenticator, Microsoft Authenticator, Authy…) whenever you sign in."
      actions={me.twoFactorEnabled ? <Pill tone="leaf" icon={<ShieldCheck className="h-3 w-3" />}>On</Pill> : <Pill tone="neutral">Off</Pill>}>
      <div className="space-y-4">
        {!me.twoFactorEnabled && highRisk && !setup && !codes && (
          <Notice tone="marigold" icon={<ShieldAlert className="h-5 w-5" />} title="Strongly recommended for your account">
            {me.role === 'admin' ? 'Administrator accounts can see verification documents and moderate the platform.' : 'Organizer accounts manage volunteers, attendance and donation requests.'} A stolen password alone shouldn't be enough to get in.
          </Notice>
        )}

        {codes ? (
          <BackupCodes codes={codes} onDone={() => setCodes(null)} />
        ) : setup ? (
          <div className="grid gap-5 sm:grid-cols-[auto_1fr]">
            <div className="flex flex-col items-center gap-2">
              <img src={setup.qr} alt="QR code to add ServeConnect to your authenticator app" width={180} height={180} className="rounded-xl border border-paper-line bg-white p-2" />
              <a href={setup.otpauth} className="link text-sm sm:hidden">Open in authenticator app</a>
            </div>
            <div className="space-y-4">
              <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-soft">
                <li>Open your authenticator app and add a new account.</li>
                <li>Scan the QR code, or enter the setup key below.</li>
                <li>Type the 6-digit code the app shows.</li>
              </ol>
              <div>
                <div className="text-sm font-semibold">Setup key</div>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <code className="break-all rounded-lg bg-paper px-2.5 py-1.5 font-mono text-sm tracking-wider">{setup.secret.match(/.{1,4}/g)?.join(' ')}</code>
                  <Button size="sm" variant="ghost" icon={<Copy className="h-4 w-4" />} onClick={copySecret}>Copy</Button>
                </div>
              </div>
              <div className="max-w-xs space-y-2">
                <div className="text-sm font-semibold" id="totp-label">Code from your app</div>
                <OtpInput value={code} onChange={setCode} onComplete={(c) => enable.mutate(c)} error={Boolean(enable.error)} autoFocus={false} />
              </div>
              <FormError error={enable.error} />
              <div className="flex gap-2">
                <Button loading={enable.isPending} disabled={code.length !== 6} onClick={() => enable.mutate(code)}>Turn on</Button>
                <Button variant="ghost" onClick={() => { setSetup(null); enable.reset(); }}>Cancel</Button>
              </div>
            </div>
          </div>
        ) : me.twoFactorEnabled ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" icon={<KeyRound className="h-4 w-4" />} onClick={() => { regen.reset(); setModal('regen'); }}>New backup codes</Button>
            <Button variant="ghost" className="text-blood-600" onClick={() => { disable.reset(); setModal('disable'); }}>Turn off</Button>
          </div>
        ) : (
          <Button icon={<ShieldCheck className="h-4 w-4" />} loading={start.isPending} onClick={() => start.mutate()}>Set up two-factor authentication</Button>
        )}
      </div>

      <CodeModal open={modal === 'disable'} title="Turn off two-factor authentication?" danger action="Turn off"
        body="Enter a code from your authenticator app or a backup code. Your account will be protected by your password only."
        onClose={() => setModal(null)} onSubmit={(c) => disable.mutate(c)} pending={disable.isPending} error={disable.error} />
      <CodeModal open={modal === 'regen'} title="Generate new backup codes" action="Generate codes"
        body="Your old backup codes stop working. Enter a code from your authenticator app to continue."
        onClose={() => setModal(null)} onSubmit={(c) => regen.mutate(c)} pending={regen.isPending} error={regen.error} />
    </SettingsBlock>
  );
}

// ───────────────────────── sessions ─────────────────────────
function agoText(d: string) {
  const a = ago(d);
  return /^\d+[mhd]$/.test(a) ? `${a} ago` : a === 'just now' ? a : `on ${a}`;
}
interface Session { id: string; device: string; userAgent: string | null; ip: string | null; createdAt: string; lastUsedAt: string; current: boolean }

function SessionsBlock() {
  const qc = useQueryClient();
  const [confirm, dialog] = useConfirm();
  const q = useQuery({ queryKey: ['sessions'], queryFn: () => api<Session[]>('/auth/sessions') });
  const revoke = useMutation({
    mutationFn: (id: string) => api(`/auth/sessions/${id}`, { method: 'DELETE' }),
    onSuccess: () => { toast.success('Signed out of that device'); qc.invalidateQueries({ queryKey: ['sessions'] }); },
    onError: toastError,
  });
  const others = useMutation({
    mutationFn: () => api<{ revoked: number }>('/auth/sessions/revoke-others', { method: 'POST' }),
    onSuccess: (r) => { toast.success(r.revoked ? `Signed out of ${r.revoked} other ${r.revoked === 1 ? 'session' : 'sessions'}` : 'No other sessions to sign out'); qc.invalidateQueries({ queryKey: ['sessions'] }); },
    onError: toastError,
  });
  const list = q.data ?? [];
  const otherCount = list.filter((s) => !s.current).length;
  return (
    <SettingsBlock id="sessions-h" title="Where you're signed in" description="If you don't recognise a device, sign it out and change your password."
      actions={otherCount > 0 && (
        <Button size="sm" variant="outline" icon={<LogOut className="h-4 w-4" />} loading={others.isPending} onClick={async () => {
          if (await confirm({ title: 'Sign out all other sessions?', body: `You'll stay signed in here. ${otherCount} other ${otherCount === 1 ? 'device' : 'devices'} will need to sign in again.`, confirmLabel: 'Sign out others' })) others.mutate();
        }}>Sign out all other sessions</Button>
      )}>
      {q.isPending ? (
        <div className="space-y-2">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : q.isError ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : list.length === 0 ? (
        <EmptyState title="No active sessions" />
      ) : (
        <ul className="divide-y divide-paper-line">
          {list.map((s) => {
            const mobile = /android|iphone|ipad|mobile/i.test(s.userAgent ?? s.device);
            const Icon = mobile ? Smartphone : Monitor;
            return (
              <li key={s.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <span className={clsx('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', s.current ? 'bg-leaf-50 text-leaf-700' : 'bg-paper text-ink-soft')} aria-hidden><Icon className="h-5 w-5" /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 font-semibold">{s.device}{s.current && <Pill tone="leaf">This device</Pill>}</div>
                  <div className="text-sm text-ink-soft">
                    {s.ip ?? 'Unknown IP'} · {s.current ? 'Active now' : <span title={fmtDateTime(s.lastUsedAt)}>Last active {agoText(s.lastUsedAt)}</span>}
                  </div>
                  <div className="text-xs text-ink-faint">Signed in {fmtDateTime(s.createdAt)}</div>
                </div>
                {!s.current && (
                  <Button size="sm" variant="ghost" loading={revoke.isPending && revoke.variables === s.id} onClick={() => revoke.mutate(s.id)}>Revoke</Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {dialog}
    </SettingsBlock>
  );
}

export default function SecuritySettings() {
  return (
    <div className="space-y-4">
      <PasswordBlock />
      <TwoFactorBlock />
      <SessionsBlock />
    </div>
  );
}
