import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { BellOff, BellRing, CheckCircle2, Smartphone } from 'lucide-react';
import { api } from '../../lib/api';
import { useMe } from '../../lib/auth';
import { currentSubscription, disablePush, enablePush, pushSupported } from '../../lib/push';
import type { Me } from '../../lib/types';
import { Button, FormError, Notice, Pill, Select, Spinner, toastError } from '../../components/ui';
import { SettingsBlock, useMeMutation } from '../../components/SettingsKit';

type Cat = 'events' | 'requests' | 'social' | 'reminders';
type Chan = 'push' | 'email';
const CATEGORIES: { key: Cat; label: string; hint: string }[] = [
  { key: 'events', label: 'New events & matches', hint: 'Events near you that match your skills and causes, and updates to events you joined.' },
  { key: 'requests', label: 'Requests', hint: 'Blood requests you can help with, donation drives and pledge updates.' },
  { key: 'social', label: 'Social', hint: 'New followers, likes, comments, mentions and messages.' },
  { key: 'reminders', label: 'Reminders', hint: 'Event reminders (24 hours and 1 hour before) and weather advisories.' },
];
const RADII: [string, string][] = [['5', '5 km'], ['10', '10 km'], ['25', '25 km'], ['50', '50 km'], ['100', '100 km']];

function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx('relative inline-flex h-6 w-11 shrink-0 rounded-full transition disabled:opacity-50', checked ? 'bg-brand-600' : 'bg-paper-line')}
    >
      <span className={clsx('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition', checked ? 'left-[22px]' : 'left-0.5')} />
    </button>
  );
}

type PushState = 'checking' | 'unsupported' | 'denied' | 'on' | 'off';

function PushDevice() {
  const [state, setState] = useState<PushState>('checking');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const check = useCallback(async () => {
    if (!pushSupported()) return setState('unsupported');
    if (Notification.permission === 'denied') return setState('denied');
    try {
      setState((await currentSubscription()) ? 'on' : 'off');
    } catch {
      setState('off');
    }
  }, []);
  useEffect(() => { check(); }, [check]);

  const turnOn = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const r = await enablePush();
      if (r === 'ok') toast.success('Push notifications are on for this device');
      else setMessage(r);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
      check();
    }
  };
  const turnOff = async () => {
    setBusy(true);
    try {
      await disablePush();
      toast.success('Push notifications are off for this device');
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
      check();
    }
  };

  const status = {
    checking: { tone: 'neutral' as const, text: 'Checking…' },
    unsupported: { tone: 'neutral' as const, text: 'Not supported' },
    denied: { tone: 'blood' as const, text: 'Blocked in browser' },
    on: { tone: 'leaf' as const, text: 'On for this device' },
    off: { tone: 'neutral' as const, text: 'Off for this device' },
  }[state];

  return (
    <SettingsBlock id="push-h" title="Push on this device" description="Push alerts arrive even when ServeConnect isn't open — essential for urgent blood requests. Turn them on separately on each phone or computer you use."
      actions={<Pill tone={status.tone} icon={state === 'on' ? <CheckCircle2 className="h-3 w-3" /> : undefined}>{status.text}</Pill>}>
      <div className="space-y-3">
        {state === 'checking' && <Spinner />}
        {state === 'unsupported' && (
          <Notice tone="neutral" icon={<Smartphone className="h-5 w-5" />}>
            This browser doesn't support push notifications. On iPhone or iPad, tap Share → Add to Home Screen, open ServeConnect from the Home Screen, then come back here.
          </Notice>
        )}
        {state === 'denied' && (
          <Notice tone="blood" icon={<BellOff className="h-5 w-5" />} title="Notifications are blocked">
            Allow notifications for this site in your browser's site settings (usually the lock icon in the address bar), then reload this page.
          </Notice>
        )}
        {state === 'off' && <Button icon={<BellRing className="h-4 w-4" />} loading={busy} onClick={turnOn}>Turn on push notifications</Button>}
        {state === 'on' && (
          <>
            <p className="text-sm text-ink-soft">
              You'll get alerts here for the categories switched on under Push above. To check it works, keep this tab in the background and ask a friend to follow you — you should see an alert within a few seconds. If nothing arrives, check that Do Not Disturb or Focus mode is off.
            </p>
            <Button variant="outline" icon={<BellOff className="h-4 w-4" />} loading={busy} onClick={turnOff}>Turn off on this device</Button>
          </>
        )}
        {message && <FormError error={message} />}
      </div>
    </SettingsBlock>
  );
}

export default function NotificationSettings() {
  const me = useMe();
  const prefs = (me.notificationPrefs ?? {}) as Partial<Record<Cat, { push: boolean; email: boolean }>> & { radiusKm?: number };
  const save = useMeMutation((patch: Record<string, unknown>) => api<Me>('/users/me/notifications', { method: 'PATCH', body: patch }));
  const get = (c: Cat) => ({ push: prefs[c]?.push ?? true, email: prefs[c]?.email ?? true });
  const toggle = (c: Cat, ch: Chan, v: boolean) => save.mutate({ [c]: { ...get(c), [ch]: v } });
  const radius = String(prefs.radiusKm ?? 25);
  const radiusOptions = RADII.some(([k]) => k === radius) ? RADII : [...RADII, [radius, `${radius} km`] as [string, string]];

  return (
    <div className="space-y-4">
      <SettingsBlock id="notif-h" title="What we notify you about" description="In-app notifications are always on. Choose where else each kind of update reaches you.">
        {!me.email && (
          <div className="mb-3"><Notice tone="marigold">Add an email address in Account settings to receive email notifications.</Notice></div>
        )}
        <table className="w-full text-left">
          <caption className="sr-only">Notification channels by category</caption>
          <thead>
            <tr className="border-b border-paper-line text-sm text-ink-soft">
              <th scope="col" className="pb-2 font-semibold">Category</th>
              <th scope="col" className="w-16 pb-2 text-center font-semibold">Push</th>
              <th scope="col" className="w-16 pb-2 text-center font-semibold">Email</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-paper-line">
            {CATEGORIES.map((c) => {
              const v = get(c.key);
              return (
                <tr key={c.key}>
                  <th scope="row" className="py-3 pr-3 align-top font-normal">
                    <div className="font-semibold text-ink">{c.label}</div>
                    <div className="text-sm text-ink-faint">{c.hint}</div>
                  </th>
                  <td className="py-3 text-center align-top"><Switch label={`${c.label} by push`} checked={v.push} disabled={save.isPending} onChange={(x) => toggle(c.key, 'push', x)} /></td>
                  <td className="py-3 text-center align-top"><Switch label={`${c.label} by email`} checked={v.email} disabled={save.isPending || !me.email} onChange={(x) => toggle(c.key, 'email', x)} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-3 text-sm text-ink-faint">Security alerts (new sign-ins, password changes), verification decisions and moderation notices are always delivered in the app and by push. Urgent alerts are also emailed.</p>
        <FormError error={save.error} />
      </SettingsBlock>

      <SettingsBlock id="radius-h" title="Nearby distance" description="How far from your profile location we look for new events and resource requests to tell you about. Blood-request alerts use your donor radius instead.">
        <div className="max-w-xs">
          <Select label="Notify me about things within" value={radius} options={radiusOptions} disabled={save.isPending} onChange={(e) => save.mutate({ radiusKm: Number(e.target.value) })} />
        </div>
        {me.lat == null && <p className="mt-2 text-sm text-marigold-700">Set your location in Profile settings so we know what's nearby.</p>}
      </SettingsBlock>

      <PushDevice />
    </div>
  );
}
