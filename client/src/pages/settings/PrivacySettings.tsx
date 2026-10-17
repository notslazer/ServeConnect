import { Link } from 'react-router-dom';
import { Ban, Lock } from 'lucide-react';
import { api } from '../../lib/api';
import { useMe } from '../../lib/auth';
import type { Me } from '../../lib/types';
import { FormError, Notice, Select, Toggle } from '../../components/ui';
import { SettingsBlock, useMeMutation } from '../../components/SettingsKit';

type Vis = 'public' | 'followers' | 'private';
const VIS_OPTIONS: [Vis, string][] = [['public', 'Everyone'], ['followers', 'Followers only'], ['private', 'Only me']];

const FIELDS: { key: 'email' | 'phone' | 'location' | 'dob' | 'hours'; label: string; hint: string; minorLocked?: boolean }[] = [
  { key: 'email', label: 'Email address', hint: 'Shown in the contact box on your profile.', minorLocked: true },
  { key: 'phone', label: 'Phone number', hint: 'Shown in the contact box on your profile.', minorLocked: true },
  { key: 'location', label: 'Location', hint: 'Your area name. Your exact pin is always blurred to about 1 km.', minorLocked: true },
  { key: 'dob', label: 'Date of birth', hint: 'Used to confirm age requirements for events.', minorLocked: true },
  { key: 'hours', label: 'Verified hours and activity', hint: 'Your service hours and attended-events timeline.' },
];

export default function PrivacySettings() {
  const me = useMe();
  const privacy = useMeMutation((patch: Partial<Record<string, Vis>>) => api<Me>('/users/me/privacy', { method: 'PATCH', body: patch }));
  const board = useMeMutation((optOut: boolean) => api<Me>('/users/me/leaderboard', { method: 'PATCH', body: { optOut } }));

  return (
    <div className="space-y-4">
      <SettingsBlock id="vis-h" title="Who can see your details" description="Organizers of events you register for can always see your name and the contact details needed to coordinate with you.">
        {me.isMinor && (
          <div className="mb-4">
            <Notice tone="brand" icon={<Lock className="h-5 w-5" />} title="Extra protection for under-18s">
              Your email, phone, location and date of birth are never shown on your profile, whatever these settings say. You also don't appear in people search.
            </Notice>
          </div>
        )}
        <ul className="divide-y divide-paper-line">
          {FIELDS.map((f) => {
            const locked = me.isMinor && f.minorLocked;
            const value = (me.privacy?.[f.key] ?? 'private') as Vis;
            return (
              <li key={f.key} className="grid gap-2 py-3 first:pt-0 last:pb-0 sm:grid-cols-[1fr_200px] sm:items-center">
                <div>
                  <label htmlFor={`vis-${f.key}`} className="font-semibold">{f.label}</label>
                  <p className="text-sm text-ink-faint">{locked ? 'Always hidden for accounts under 18.' : f.hint}</p>
                </div>
                <select
                  id={`vis-${f.key}`}
                  className="input"
                  value={locked ? 'private' : value}
                  disabled={locked || (privacy.isPending && privacy.variables?.[f.key] !== undefined)}
                  onChange={(e) => privacy.mutate({ [f.key]: e.target.value as Vis })}
                >
                  {VIS_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </li>
            );
          })}
        </ul>
        <div className="mt-3"><FormError error={privacy.error} /></div>
      </SettingsBlock>

      <SettingsBlock id="lb-h" title="Leaderboards">
        <Toggle
          label="Show me on leaderboards"
          hint="Leaderboards rank volunteers by verified hours this month and all time. If you hide yourself, you can still see the boards and your own progress."
          checked={!me.leaderboardOptOut}
          disabled={board.isPending}
          onChange={(v) => board.mutate(!v)}
        />
        <FormError error={board.error} />
      </SettingsBlock>

      <SettingsBlock id="blocked-h" title="Blocked accounts">
        <div className="flex gap-3 text-sm text-ink-soft">
          <Ban className="mt-0.5 h-5 w-5 shrink-0 text-ink-faint" aria-hidden />
          <div className="space-y-2">
            <p>When you block someone, they can't see your profile, follow you or message you, and their posts disappear from your feed. You also stop following each other. They aren't told.</p>
            <p>To block or unblock someone, open their profile and use the <span className="font-semibold text-ink">⋯</span> menu. If someone is making you feel unsafe, also report them so our moderators can act — see <Link to="/help" className="link">Safety &amp; privacy help</Link>.</p>
          </div>
        </div>
      </SettingsBlock>
    </div>
  );
}
