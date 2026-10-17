import { ReactNode, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { CalendarCheck, CalendarDays, ClipboardList, History, MapPin, Pencil, Plus, QrCode, Search } from 'lucide-react';
import { api } from '../../lib/api';
import { useMe } from '../../lib/auth';
import { fmtRange, hours as fmtHours, relDay } from '../../lib/format';
import type { EventCard as EventCardT } from '../../lib/types';
import { EventCover, EventDateBlock } from '../../components/EventCard';
import { ButtonLink, Card, EmptyState, ErrorState, PageHeader, Pill, ProgressBar, Skeleton, Tabs } from '../../components/ui';
import { EventStatusPill, RegStatusPill, type EventStatus, type RegStatus } from '../../components/EventsKit';

type VolEvent = EventCardT & { myStatus: RegStatus; checkinCode: string; checkedInAt: string | null; hours: string | number | null; waitlistPosition: number };
type TabId = 'upcoming' | 'past' | 'hosting';

function ListSkeleton() {
  return <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>;
}

function VolunteerRow({ e, past }: { e: VolEvent; past?: boolean }) {
  const live = Date.now() >= new Date(e.startAt).getTime() - 3600_000 && Date.now() <= new Date(e.endAt).getTime();
  return (
    <li className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
      <Link to={`/events/${e.id}`} className="flex min-w-0 flex-1 items-start gap-3 group">
        <EventDateBlock date={e.startAt} />
        <div className="min-w-0">
          <div className="font-bold leading-snug group-hover:text-brand-700">{e.title}</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-sm text-ink-soft"><CalendarDays className="h-4 w-4 shrink-0" aria-hidden /><span className="truncate">{fmtRange(e.startAt, e.endAt)}</span></div>
          {e.locationName && <div className="flex items-center gap-1.5 text-sm text-ink-soft"><MapPin className="h-4 w-4 shrink-0" aria-hidden /><span className="truncate">{e.locationName}</span></div>}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {e.status === 'cancelled' ? <EventStatusPill status="cancelled" /> : <RegStatusPill status={e.myStatus} />}
            {e.myStatus === 'waitlisted' && <span className="text-sm text-marigold-700">#{e.waitlistPosition} in line</span>}
            {live && e.myStatus === 'registered' && <Pill tone="leaf">Check-in open</Pill>}
          </div>
        </div>
      </Link>
      {!past && e.myStatus === 'registered' && e.status === 'published' && (
        <div className="flex items-center gap-3 sm:flex-col sm:items-end">
          <div className="rounded-xl border border-dashed border-brand-300 bg-brand-50 px-3 py-1.5 text-center">
            <div className="text-[11px] font-semibold text-ink-soft">Check-in code</div>
            <div className="font-mono text-lg font-bold tracking-[0.2em] text-brand-800">{e.checkinCode}</div>
          </div>
          {live && <ButtonLink to="/scan" size="sm" icon={<QrCode className="h-4 w-4" />}>Scan to check in</ButtonLink>}
        </div>
      )}
      {past && e.myStatus === 'attended' && (
        <div className="stamp h-16 w-16 shrink-0 self-start sm:self-center" aria-label={`${fmtHours(e.hours)} verified hours`}>
          <span className="text-lg leading-none">{fmtHours(e.hours)}</span>
          <span className="text-[9px] font-bold">hours</span>
        </div>
      )}
    </li>
  );
}

function HostingRow({ e }: { e: EventCardT }) {
  const ended = Date.now() > new Date(e.endAt).getTime();
  return (
    <li className="card flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
      <Link to={`/events/${e.id}`} className="flex min-w-0 flex-1 items-center gap-3 group">
        <EventCover event={e} className="h-16 w-16 shrink-0 rounded-xl text-2xl" />
        <div className="min-w-0">
          <div className="truncate font-bold group-hover:text-brand-700">{e.title}</div>
          <div className="text-sm text-ink-soft">{relDay(e.startAt)}{e.status === 'published' && ended && ' · ended, not marked complete'}</div>
          {e.status !== 'draft' && (
            <div className="mt-1 flex max-w-xs items-center gap-2">
              <ProgressBar value={e.registered} max={e.capacity} tone={e.registered >= e.capacity ? 'marigold' : 'brand'} />
              <span className="shrink-0 text-xs tabular-nums text-ink-soft">{e.registered}/{e.capacity}</span>
            </div>
          )}
        </div>
      </Link>
      <div className="flex gap-2 sm:shrink-0">
        {e.status !== 'cancelled' && <ButtonLink to={`/events/${e.id}/manage`} size="sm" variant="secondary" icon={<ClipboardList className="h-4 w-4" />}>Manage</ButtonLink>}
        {(e.status === 'draft' || e.status === 'published') && <ButtonLink to={`/events/${e.id}/edit`} size="sm" variant="outline" icon={<Pencil className="h-4 w-4" />}>Edit</ButtonLink>}
      </div>
    </li>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  if (!count) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-base font-bold">{title} <span className="font-normal text-ink-faint">({count})</span></h2>
      <ul className="space-y-2">{children}</ul>
    </section>
  );
}

export default function MyEvents() {
  const { t } = useTranslation();
  const me = useMe();
  const isOrg = ['organizer', 'csr', 'admin'].includes(me.role);
  const [params, setParams] = useSearchParams();

  const vol = useQuery({ queryKey: ['events', 'mine', 'volunteer'], queryFn: () => api<VolEvent[]>('/events/mine', { query: { as: 'volunteer' } }) });
  const host = useQuery({ queryKey: ['events', 'mine', 'organizer'], queryFn: () => api<EventCardT[]>('/events/mine', { query: { as: 'organizer' } }), enabled: isOrg });

  const { upcoming, past } = useMemo(() => {
    const now = Date.now();
    const all = vol.data ?? [];
    const up = all
      .filter((e) => ['registered', 'waitlisted'].includes(e.myStatus) && new Date(e.endAt).getTime() > now && e.status === 'published')
      .sort((a, b) => a.startAt.localeCompare(b.startAt));
    const pa = all
      .filter((e) => !up.includes(e))
      .sort((a, b) => b.startAt.localeCompare(a.startAt));
    return { upcoming: up, past: pa };
  }, [vol.data]);

  const hosting = useMemo(() => {
    const g: Record<EventStatus, EventCardT[]> = { draft: [], published: [], completed: [], cancelled: [] };
    for (const e of host.data ?? []) g[e.status]?.push(e);
    g.published.sort((a, b) => a.startAt.localeCompare(b.startAt));
    return g;
  }, [host.data]);

  const tabs: { id: TabId; label: string; count?: number }[] = [
    ...(isOrg ? [{ id: 'hosting' as TabId, label: t('myEvents.hosting', 'Hosting'), count: host.data?.length }] : []),
    { id: 'upcoming', label: t('myEvents.upcoming', 'Upcoming'), count: vol.data ? upcoming.length : undefined },
    { id: 'past', label: t('myEvents.past', 'Past'), count: vol.data ? past.length : undefined },
  ];
  const req = params.get('tab') as TabId | null;
  const fallback: TabId = isOrg ? 'hosting' : 'upcoming';
  const tab: TabId = req && tabs.some((x) => x.id === req) ? req : fallback;
  const setTab = (v: TabId) => setParams(v === fallback ? {} : { tab: v }, { replace: true });

  return (
    <div>
      <PageHeader
        title={t('nav.myEvents', 'My events')}
        subtitle="Your registrations, check-in codes and hosted events."
        actions={isOrg ? <ButtonLink to="/events/new" icon={<Plus className="h-4 w-4" />}>Create event</ButtonLink> : <ButtonLink to="/events" variant="outline" icon={<Search className="h-4 w-4" />}>Find events</ButtonLink>}
      />
      <Tabs tabs={tabs} value={tab} onChange={setTab} className="mb-5" />

      <div role="tabpanel" aria-label={tabs.find((x) => x.id === tab)?.label}>
        {tab !== 'hosting' && (
          vol.isPending ? <ListSkeleton /> : vol.isError ? <ErrorState error={vol.error} retry={() => vol.refetch()} /> : tab === 'upcoming' ? (
            upcoming.length === 0 ? (
              <Card><EmptyState icon={<CalendarCheck />} title="No upcoming events" body="Events you register for appear here with your personal check-in code." action={<ButtonLink to="/events">Browse events</ButtonLink>} /></Card>
            ) : (
              <ul className="space-y-3">{upcoming.map((e) => <VolunteerRow key={e.id} e={e} />)}</ul>
            )
          ) : past.length === 0 ? (
            <Card><EmptyState icon={<History />} title="No past events yet" body="After you attend an event, your verified hours show up here." action={<ButtonLink to="/events" variant="outline">Find your first event</ButtonLink>} /></Card>
          ) : (
            <>
              <p className="mb-3 text-sm text-ink-soft">
                {past.filter((e) => e.myStatus === 'attended').length} attended ·{' '}
                {fmtHours(past.filter((e) => e.myStatus === 'attended').reduce((a, e) => a + Number(e.hours ?? 0), 0))} verified hours ·{' '}
                <Link to="/certificates" className="link">View certificates</Link>
              </p>
              <ul className="space-y-3">{past.map((e) => <VolunteerRow key={e.id} e={e} past />)}</ul>
            </>
          )
        )}

        {tab === 'hosting' && isOrg && (
          host.isPending ? <ListSkeleton /> : host.isError ? <ErrorState error={host.error} retry={() => host.refetch()} /> : (host.data?.length ?? 0) === 0 ? (
            <Card><EmptyState icon={<CalendarDays />} title="You haven't created an event yet" body="Create a drive, camp or workshop and invite volunteers with the skills you need." action={<ButtonLink to="/events/new">Create event</ButtonLink>} /></Card>
          ) : (
            <div className="space-y-6">
              <Section title="Drafts" count={hosting.draft.length}>{hosting.draft.map((e) => <HostingRow key={e.id} e={e} />)}</Section>
              <Section title="Published" count={hosting.published.length}>{hosting.published.map((e) => <HostingRow key={e.id} e={e} />)}</Section>
              <Section title="Completed" count={hosting.completed.length}>{hosting.completed.map((e) => <HostingRow key={e.id} e={e} />)}</Section>
              <Section title="Cancelled" count={hosting.cancelled.length}>{hosting.cancelled.map((e) => <HostingRow key={e.id} e={e} />)}</Section>
            </div>
          )
        )}
      </div>
    </div>
  );
}
