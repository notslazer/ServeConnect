/* Helpers shared by the Settings sections and the onboarding wizard. */
import { ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { Check, X } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { EVENT_CATEGORIES } from '../lib/constants';
import type { Me } from '../lib/types';

/** Interest options use event-category keys so they line up with event matching. */
export const INTEREST_OPTIONS: Record<string, string> = Object.fromEntries(
  Object.entries(EVENT_CATEGORIES).filter(([k]) => k !== 'other').map(([k, v]) => [k, v.label]),
);

export const ORG_TYPE_OPTIONS: [string, string][] = [
  ['ngo', 'NGO / Non-profit (Trust, Society, Section 8)'],
  ['independent', 'Independent organizer or community group'],
  ['company', 'Company (CSR programme)'],
];

/** A titled block inside a settings page. */
export function SettingsBlock({ title, description, children, className, id, actions }: { title: ReactNode; description?: ReactNode; children: ReactNode; className?: string; id?: string; actions?: ReactNode }) {
  return (
    <section aria-labelledby={id} className={clsx('card p-4 sm:p-5', className)}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 id={id} className="text-lg font-bold">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-ink-soft">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

/**
 * Mutation for any endpoint that returns the full Me. Keeps the auth user in sync,
 * refreshes cached profile views and shows a "Saved" toast.
 */
export function useMeMutation<V = void>(fn: (v: V) => Promise<Me>, opts: { success?: string | null; onDone?: (me: Me) => void } = {}) {
  const { setUser } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (me) => {
      setUser(me);
      qc.setQueryData(['me'], me);
      qc.invalidateQueries({ queryKey: ['profile'] });
      if (opts.success !== null) toast.success(opts.success ?? 'Saved');
      opts.onDone?.(me);
    },
  });
}

/** Upload a profile image (avatar or cover). Returns the updated Me. */
export function uploadProfileImage(kind: 'avatar' | 'cover', file: File) {
  const form = new FormData();
  form.append('file', file);
  return api<Me>(`/users/me/${kind}`, { form });
}

export const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif';
/** Client-side guard matching the server's 5 MB limit for profile images. */
export function checkImage(file: File) {
  if (!IMAGE_ACCEPT.split(',').includes(file.type)) return 'Choose a JPG, PNG, WebP or GIF image.';
  if (file.size > 5 * 1024 * 1024) return 'That image is larger than 5 MB. Choose a smaller one.';
  return null;
}

/** Password rules enforced by the server. */
export function passwordRules(pw: string) {
  return [
    { ok: pw.length >= 8, label: 'At least 8 characters' },
    { ok: /[A-Za-z]/.test(pw), label: 'A letter' },
    { ok: /\d/.test(pw), label: 'A number' },
  ];
}
export function passwordStrength(pw: string) {
  if (!pw) return { score: 0, label: '' };
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  const score = Math.min(4, Math.max(1, s - (pw.length < 8 ? 1 : 0)));
  return { score, label: ['', 'Weak', 'Fair', 'Good', 'Strong'][score] };
}

export function PasswordMeter({ value }: { value: string }) {
  const { score, label } = passwordStrength(value);
  const color = ['bg-paper-line', 'bg-blood-500', 'bg-marigold-400', 'bg-leaf-500', 'bg-leaf-600'][score];
  return (
    <div className="space-y-2" aria-live="polite">
      <div className="flex items-center gap-2">
        <div className="grid flex-1 grid-cols-4 gap-1" aria-hidden>
          {[1, 2, 3, 4].map((i) => <div key={i} className={clsx('h-1.5 rounded-full', i <= score ? color : 'bg-paper-line')} />)}
        </div>
        <span className="w-14 text-right text-xs font-semibold text-ink-soft">{label && <>{label}<span className="sr-only"> password</span></>}</span>
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {passwordRules(value).map((r) => (
          <li key={r.label} className={clsx('flex items-center gap-1', r.ok ? 'text-leaf-700' : 'text-ink-faint')}>
            {r.ok ? <Check className="h-4 w-4" aria-hidden /> : <X className="h-4 w-4" aria-hidden />}
            {r.label}<span className="sr-only">{r.ok ? ' (met)' : ' (not met)'}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Set of user ids the signed-in user follows. List endpoints (followers, people search) don't
 * include per-row follow state, so FollowButton needs this to start in the right state.
 */
export function useFollowingSet(meId: string | undefined) {
  const q = useQuery({
    queryKey: ['profile', 'following-set', meId],
    queryFn: () => api<{ id: string }[]>(`/users/${meId}/following`),
    enabled: Boolean(meId),
    staleTime: 60_000,
  });
  return { set: new Set((q.data ?? []).map((u) => u.id)), ready: !meId || q.isSuccess };
}

/** `YYYY-MM-DD` in local time from an ISO timestamp or date string. */
export function toDateInput(d: string | null | undefined) {
  if (!d) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`;
}
