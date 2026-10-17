import { ReactNode, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { EyeOff, Flame, Lock, MapPin, Trophy } from 'lucide-react';
import { api } from '../lib/api';
import { useMe } from '../lib/auth';
import { fmtShort, hours as fmtHours, plural } from '../lib/format';
import type { UserCard } from '../lib/types';
import { Avatar, ButtonLink, Card, EmptyState, ErrorState, Notice, PageHeader, Pill, Skeleton, VerifiedBadge } from '../components/ui';

type Period = 'month' | 'all';
type Scope = 'global' | 'following' | 'nearby' | 'company';
interface Row extends UserCard { hours: number; events: number; rank: number }
interface Board { rows: Row[]; me: Row | null; optedOut: boolean }
interface Progress {
  streak: { streak: number; longest: number };
  milestones: { code: string; title: string; description: string; icon: string; earned: boolean; awardedAt: string | null }[];
}

function Segmented<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange: (v: T) => void; options: { id: T; label: ReactNode }[] }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex max-w-full overflow-x-auto rounded-xl border border-paper-line bg-white p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={clsx('shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold transition', value === o.id ? 'bg-brand-600 text-white' : 'text-ink-soft hover:text-ink')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const MEDAL = ['bg-marigold-400 text-ink', 'bg-paper-line text-ink', 'bg-marigold-600 text-white'];

function Podium({ rows, meId }: { rows: Row[]; meId: string }) {
  const top = rows.slice(0, 3);
  // DOM order stays 1-2-3 for screen readers; CSS order shows 2nd, 1st, 3rd.
  return (
    <ol className="grid grid-cols-3 items-end gap-2 sm:gap-4" aria-label="Top three">
      {top.map((r) => {
        const first = r === top[0];
        const place = top.indexOf(r);
        return (
          <li key={r.id} className={clsx('flex min-w-0 flex-col items-center text-center', first ? 'order-2' : place === 1 ? 'order-1' : 'order-3')}>
            <Link to={`/u/${r.handle}`} className="group flex min-w-0 flex-col items-center">
              <span className="relative">
                <Avatar src={r.avatarUrl} name={r.name} size={first ? 72 : 56} className={clsx('ring-4', first ? 'ring-marigold-300' : 'ring-white')} />
                <span className={clsx('absolute -bottom-1 left-1/2 flex h-7 w-7 -translate-x-1/2 items-center justify-center rounded-full font-display text-sm font-extrabold ring-2 ring-white', MEDAL[place])}>
                  {r.rank}
                </span>
              </span>
              <span className="mt-3 flex max-w-full items-center gap-1 text-sm font-semibold group-hover:underline">
                <span className="truncate">{r.name.split(' ')[0]}</span>
                {r.verified && <VerifiedBadge size={13} />}
              </span>
            </Link>
            {r.id === meId && <Pill tone="brand" className="mt-1">You</Pill>}
            <div
              className={clsx(
                'mt-2 flex w-full flex-col items-center justify-start rounded-t-2xl pt-3',
                first ? 'h-28 bg-brand-600 text-white' : place === 1 ? 'h-20 bg-brand-100 text-brand-800' : 'h-16 bg-brand-50 text-brand-700',
              )}
            >
              <span className="font-display text-2xl font-extrabold leading-none">{fmtHours(r.hours)}</span>
              <span className="text-xs font-semibold opacity-80">hours</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Standing({ board, period }: { board: Board; period: Period }) {
  const me = board.me;
  return (
    <Card className="flex items-center gap-4">
      <div className="stamp h-24 w-24 shrink-0 text-center" aria-label={`${me ? fmtHours(me.hours) : 0} verified hours`}>
        <span className="text-3xl leading-none">{me ? fmtHours(me.hours) : 0}</span>
        <span className="mt-0.5 text-xs font-bold">hours</span>
      </div>
      <div className="min-w-0">
        <h2 className="text-base font-bold">Your standing</h2>
        {board.optedOut ? (
          <p className="text-sm text-ink-soft">You're hidden from leaderboards.</p>
        ) : me ? (
          <p className="text-sm text-ink-soft">
            Ranked <strong className="text-ink">#{me.rank}</strong> {period === 'month' ? 'this month' : 'all time'} with {plural(me.events, 'verified event')}.
          </p>
        ) : (
          <p className="text-sm text-ink-soft">{period === 'month' ? 'No verified hours yet this month.' : 'Attend a verified event to get on the board.'}</p>
        )}
      </div>
    </Card>
  );
}

function ProgressPanel({ q }: { q: ReturnType<typeof useProgress> }) {
  if (q.isPending) return <Skeleton className="h-36 w-full rounded-2xl" />;
  if (q.isError) return <Card><ErrorState error={q.error} retry={() => q.refetch()} /></Card>;
  const { streak } = q.data;
  const earned = q.data.milestones.filter((m) => m.earned).length;
  return (
    <Card className="space-y-3">
      <h2 className="text-base font-bold">Your progress</h2>
      <div className="flex items-center gap-3">
        <span className={clsx('flex h-12 w-12 items-center justify-center rounded-2xl', streak.streak > 0 ? 'bg-marigold-50 text-marigold-600' : 'bg-paper text-ink-faint')} aria-hidden>
          <Flame className="h-7 w-7" />
        </span>
        <div>
          <div className="font-display text-2xl font-extrabold leading-none">{plural(streak.streak, 'month')}</div>
          <div className="text-sm text-ink-soft">current streak · best {plural(streak.longest, 'month')}</div>
        </div>
      </div>
      <p className="text-sm text-ink-soft">
        {streak.streak > 0 ? 'Volunteer at a verified event this month to keep your streak going.' : 'Attend a verified event this month to start a streak.'}
      </p>
      <div className="text-sm"><strong>{earned}</strong> of {q.data.milestones.length} milestones earned</div>
    </Card>
  );
}

const useProgress = () => useQuery({ queryKey: ['engagement-progress'], queryFn: () => api<Progress>('/engagement/progress') });

export default function Leaderboard() {
  const { t } = useTranslation();
  const me = useMe();
  const [period, setPeriod] = useState<Period>('month');
  const [scope, setScope] = useState<Scope>('global');
  const board = useQuery({ queryKey: ['leaderboard', period, scope], queryFn: () => api<Board>('/engagement/leaderboard', { query: { period, scope } }) });
  const progress = useProgress();

  const scopes: { id: Scope; label: string }[] = [
    { id: 'global', label: 'Everyone' },
    { id: 'following', label: 'People I follow' },
    { id: 'nearby', label: 'Nearby' },
    ...(me.companyId ? [{ id: 'company' as Scope, label: 'My company' }] : []),
  ];
  const rows = board.data?.rows ?? [];

  return (
    <div>
      <PageHeader title={t('nav.leaderboard', 'Leaderboard')} subtitle={t('leaderboard.subtitle', 'Verified service hours from checked-in events. Every hour here was confirmed by an organizer.')} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented label="Period" value={period} onChange={setPeriod} options={[{ id: 'month', label: 'This month' }, { id: 'all', label: 'All time' }]} />
        <Segmented label="Who" value={scope} onChange={setScope} options={scopes} />
      </div>

      {board.data?.optedOut && (
        <div className="mb-4">
          <Notice tone="neutral" icon={<EyeOff className="h-5 w-5" aria-hidden />} title="You're hidden from leaderboards" action={<ButtonLink to="/settings/privacy" size="sm" variant="outline">Change in settings</ButtonLink>}>
            Others can't see your rank. Your hours, streaks and milestones still count.
          </Notice>
        </div>
      )}
      {scope === 'nearby' && me.lat == null && (
        <div className="mb-4">
          <Notice tone="marigold" icon={<MapPin className="h-5 w-5" aria-hidden />} title="Add your location to see volunteers near you" action={<ButtonLink to="/settings/profile" size="sm" variant="outline">Set location</ButtonLink>}>
            Without a location we show everyone instead.
          </Notice>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-4">
          {board.isPending ? (
            <Card className="space-y-3">
              <div className="grid grid-cols-3 items-end gap-3"><Skeleton className="h-36" /><Skeleton className="h-44" /><Skeleton className="h-32" /></div>
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </Card>
          ) : board.isError ? (
            <ErrorState error={board.error} retry={() => board.refetch()} />
          ) : rows.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Trophy />}
                title={period === 'month' ? 'No verified hours yet this month' : 'No one on this board yet'}
                body={scope === 'following' ? 'Follow volunteers you know to compare progress.' : 'Hours appear after volunteers check in at events and organizers confirm attendance.'}
                action={<ButtonLink to="/events">Find an event</ButtonLink>}
              />
            </Card>
          ) : (
            <>
              {rows.length >= 3 && (
                <Card className="pb-0">
                  <Podium rows={rows} meId={me.id} />
                </Card>
              )}
              <Card padded={false}>
                <ol aria-label="Rankings" className="divide-y divide-paper-line">
                  {rows.slice(rows.length >= 3 ? 3 : 0).map((r) => {
                    const mine = r.id === me.id;
                    return (
                      <li key={r.id} className={clsx('flex items-center gap-3 px-4 py-2.5 sm:px-5', mine && 'bg-brand-50')} aria-current={mine ? 'true' : undefined}>
                        <span className="w-8 shrink-0 text-center font-display text-lg font-extrabold text-ink-faint">{r.rank}</span>
                        <Link to={`/u/${r.handle}`} className="flex min-w-0 flex-1 items-center gap-3">
                          <Avatar src={r.avatarUrl} name={r.name} size={36} />
                          <span className="min-w-0">
                            <span className="flex items-center gap-1 font-semibold hover:underline">
                              <span className="truncate">{r.name}</span>
                              {r.verified && <VerifiedBadge size={14} />}
                              {mine && <Pill tone="brand" className="ml-1">You</Pill>}
                            </span>
                            <span className="block truncate text-sm text-ink-faint">{plural(r.events, 'event')}</span>
                          </span>
                        </Link>
                        <span className="shrink-0 text-right">
                          <span className="font-display text-lg font-extrabold">{fmtHours(r.hours)}</span>
                          <span className="ml-1 text-sm text-ink-faint">h</span>
                        </span>
                      </li>
                    );
                  })}
                </ol>
                {rows.length <= 3 && <p className="px-5 py-3 text-sm text-ink-faint">That's everyone so far.</p>}
              </Card>
              {me.role !== 'volunteer' && <p className="text-sm text-ink-faint">Leaderboards rank volunteer accounts only.</p>}
            </>
          )}
        </div>

        <aside className="space-y-4">
          {board.data && me.role === 'volunteer' && <Standing board={board.data} period={period} />}
          <ProgressPanel q={progress} />
        </aside>
      </div>

      {progress.data && (
        <section aria-labelledby="ms-h" className="mt-8">
          <h2 id="ms-h" className="mb-3 text-lg font-bold">Milestones</h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {progress.data.milestones.map((m) => (
              <li key={m.code} className={clsx('card flex items-start gap-3 p-4', !m.earned && 'bg-paper/60')}>
                <span className={clsx('flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-2xl', m.earned ? 'bg-marigold-50' : 'bg-paper grayscale opacity-50')} aria-hidden>
                  {m.icon}
                </span>
                <div className="min-w-0">
                  <div className={clsx('flex items-center gap-1.5 font-semibold', !m.earned && 'text-ink-soft')}>
                    {m.title}
                    {!m.earned && <Lock className="h-3.5 w-3.5 text-ink-faint" aria-label="Locked" />}
                  </div>
                  <p className="text-sm text-ink-soft">{m.description}</p>
                  <p className={clsx('mt-1 text-xs font-semibold', m.earned ? 'text-leaf-600' : 'text-ink-faint')}>
                    {m.earned ? `Earned ${m.awardedAt ? fmtShort(m.awardedAt) : ''}` : 'Not yet earned'}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
