import { ReactNode, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  AlertTriangle, BookOpen, CalendarPlus, ClipboardList, Droplet, ExternalLink, HandHeart, PackagePlus, ShieldCheck, Star, Users,
} from 'lucide-react';
import { api, API_URL } from '../../lib/api';
import { useMe } from '../../lib/auth';
import { ago, hours as fmtHours, plural, relDay } from '../../lib/format';
import type { EventCard as EventCardT, Me, UserCard } from '../../lib/types';
import { Stars } from '../../components/StarRating';
import {
  ButtonLink, Card, EmptyState, ErrorState, Notice, PageHeader, Pill, ProgressBar, Skeleton, Stat,
} from '../../components/ui';
import { CHART, ChartTooltip, EventStatusPill, type Analytics } from '../../components/EventsKit';

interface OrgStats {
  followers: number;
  following: number;
  posts: number;
  completedEvents: number;
  hostedEvents: number;
  avgRating: number | null;
  reviewCount: number;
  volunteerHoursDelivered: number;
  volunteersEngaged: number;
}
interface Profile { id: string; name: string; handle: string; stats: OrgStats }
interface OrgReview { id: string; rating: number; body: string | null; createdAt: string; eventId: string; eventTitle: string; reviewer: UserCard }

function Tile({ children, className }: { children: ReactNode; className?: string }) {
  return <Card className={className ?? 'p-4'}>{children}</Card>;
}

function QuickAction({ to, href, icon, title, body }: { to?: string; href?: string; icon: ReactNode; title: string; body: string }) {
  const inner = (
    <>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 [&>svg]:h-5 [&>svg]:w-5" aria-hidden>{icon}</span>
      <span className="min-w-0">
        <span className="flex items-center gap-1 font-semibold text-ink">{title}{href && <ExternalLink className="h-3.5 w-3.5 text-ink-faint" aria-hidden />}</span>
        <span className="block text-sm text-ink-soft">{body}</span>
      </span>
    </>
  );
  const cls = 'flex items-center gap-3 rounded-xl p-2 transition hover:bg-paper';
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>{inner}<span className="sr-only">(opens in a new tab)</span></a>
  ) : (
    <Link to={to!} className={cls}>{inner}</Link>
  );
}

export default function Dashboard() {
  const { t } = useTranslation();
  const authUser = useMe();
  const meQ = useQuery({ queryKey: ['me'], queryFn: () => api<Me>('/users/me'), placeholderData: authUser });
  const me = meQ.data ?? authUser;
  const profile = useQuery({ queryKey: ['profile', me.id], queryFn: () => api<Profile>(`/users/${me.id}`) });
  const events = useQuery({ queryKey: ['events', 'mine', 'organizer'], queryFn: () => api<EventCardT[]>('/events/mine', { query: { as: 'organizer' } }) });
  const reviews = useQuery({ queryKey: ['org-reviews', me.id], queryFn: () => api<OrgReview[]>(`/users/${me.id}/reviews`) });

  const now = Date.now();
  const all = events.data ?? [];
  const upcoming = all.filter((e) => (e.status === 'published' || e.status === 'draft') && new Date(e.endAt).getTime() > now).sort((a, b) => a.startAt.localeCompare(b.startAt));
  const overdue = all.filter((e) => e.status === 'published' && new Date(e.endAt).getTime() <= now);
  const completed = useMemo(
    () => (events.data ?? []).filter((e) => e.status === 'completed').sort((a, b) => b.startAt.localeCompare(a.startAt)).slice(0, 8).reverse(),
    [events.data],
  );

  const analytics = useQueries({
    queries: completed.map((e) => ({ queryKey: ['event-analytics', e.id], queryFn: () => api<Analytics>(`/events/${e.id}/analytics`), staleTime: 5 * 60_000 })),
  });
  const chartLoading = analytics.some((a) => a.isPending);
  const chartData = completed.map((e, i) => {
    const a = analytics[i]?.data;
    // After completion, "registered" counts only attendees; sign-ups = attended + no-shows.
    return { id: e.id, label: format(new Date(e.startAt), 'd MMM'), title: e.title, signedUp: a ? a.attended + a.noShows : 0, attended: a?.attended ?? 0 };
  }).filter((_, i) => analytics[i]?.data);

  const s = profile.data?.stats;
  const verif = me.verificationStatus;

  return (
    <div>
      <PageHeader
        title={t('dashboard.title', 'Organizer dashboard')}
        subtitle={`Welcome back, ${me.name}. Here's how your events are going.`}
        actions={<ButtonLink to="/events/new" icon={<CalendarPlus className="h-4 w-4" />}>Create event</ButtonLink>}
      />

      <div className="space-y-3">
        {verif !== 'verified' && me.role !== 'admin' && (
          verif === 'pending' ? (
            <Notice tone="brand" icon={<ShieldCheck className="h-5 w-5" />} title="Your verification is under review">
              You can create drafts meanwhile. We'll notify you as soon as you can publish events.
            </Notice>
          ) : (
            <Notice
              tone="marigold"
              icon={<ShieldCheck className="h-5 w-5" />}
              title={verif === 'rejected' ? 'Your verification was not approved' : 'Get verified to publish events'}
              action={<ButtonLink to="/settings/verification" size="sm" variant="outline">{verif === 'rejected' ? 'Resubmit documents' : 'Get verified'}</ButtonLink>}
            >
              Verified organizers get a badge, can publish events and earn volunteers' trust. Drafts are saved until then.
            </Notice>
          )
        )}
        {overdue.length > 0 && (
          <Notice tone="marigold" icon={<AlertTriangle className="h-5 w-5" />} title={`${plural(overdue.length, 'event has', 'events have')} ended but ${overdue.length === 1 ? "isn't" : "aren't"} marked complete`}>
            Complete {overdue.length === 1 ? 'it' : 'them'} so attendees receive their certificates:{' '}
            {overdue.map((e, i) => <span key={e.id}>{i > 0 && ', '}<Link className="link font-semibold" to={`/events/${e.id}/manage`}>{e.title}</Link></span>)}
          </Notice>
        )}
      </div>

      {/* Stats */}
      <section aria-label="Your impact" className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {profile.isPending ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[88px]" />) : profile.isError ? (
          <div className="col-span-full"><ErrorState error={profile.error} retry={() => profile.refetch()} /></div>
        ) : s && (
          <>
            <Tile><Stat value={s.hostedEvents} label="Events hosted" /></Tile>
            <Tile><Stat value={s.completedEvents} label="Completed" tone="leaf" /></Tile>
            <Tile><Stat value={s.volunteersEngaged} label="Volunteers engaged" /></Tile>
            <Tile className="flex items-center gap-3 p-4">
              <div className="stamp h-14 w-14 shrink-0 text-[11px]" aria-hidden><span className="text-base leading-none">{fmtHours(s.volunteerHoursDelivered)}</span>hrs</div>
              <div className="text-sm text-ink-soft">{fmtHours(s.volunteerHoursDelivered)} verified hours delivered</div>
            </Tile>
            <Tile>
              <Stat value={s.avgRating ? s.avgRating.toFixed(1) : '—'} label={s.reviewCount ? plural(s.reviewCount, 'review') : 'No reviews yet'} tone="marigold" />
              {s.avgRating ? <div className="mt-1"><Stars value={s.avgRating} size={14} /></div> : null}
            </Tile>
            <Tile><Stat value={s.followers} label="Followers" /></Tile>
          </>
        )}
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-6">
          {/* Upcoming */}
          <section aria-labelledby="up-h" className="card overflow-hidden">
            <div className="flex items-center justify-between gap-2 border-b border-paper-line px-4 py-3">
              <h2 id="up-h" className="text-lg font-bold">Upcoming events</h2>
              <Link to="/events/mine?tab=hosting" className="link text-sm font-semibold">All my events</Link>
            </div>
            {events.isPending ? (
              <div className="space-y-2 p-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : events.isError ? <ErrorState error={events.error} retry={() => events.refetch()} /> : upcoming.length === 0 ? (
              <EmptyState icon={<CalendarPlus />} title="No upcoming events" body="Plan your next drive and we'll notify volunteers with matching skills nearby." action={<ButtonLink to="/events/new">Create event</ButtonLink>} />
            ) : (
              <ul className="divide-y divide-paper-line">
                {upcoming.map((e) => (
                  <li key={e.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_180px_auto] sm:items-center sm:gap-4">
                    <div className="min-w-0">
                      <Link to={`/events/${e.id}`} className="block truncate font-semibold hover:underline">{e.title}</Link>
                      <div className="flex flex-wrap items-center gap-2 text-sm text-ink-soft">
                        {relDay(e.startAt)}
                        {e.status === 'draft' && <EventStatusPill status="draft" />}
                      </div>
                    </div>
                    <div>
                      {e.status === 'draft' ? <span className="text-sm text-ink-faint">Not published</span> : (
                        <>
                          <ProgressBar value={e.registered} max={e.capacity} tone={e.registered >= e.capacity ? 'marigold' : 'brand'} />
                          <div className="mt-1 text-xs text-ink-soft">
                            {e.registered}/{e.capacity} registered{e.waitlisted > 0 && ` · ${e.waitlisted} waitlisted`}
                          </div>
                        </>
                      )}
                    </div>
                    <ButtonLink to={e.status === 'draft' ? `/events/${e.id}` : `/events/${e.id}/manage`} size="sm" variant="secondary" icon={<ClipboardList className="h-4 w-4" />} className="justify-self-start">
                      {e.status === 'draft' ? 'Review' : 'Manage'}
                    </ButtonLink>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Turnout chart */}
          <section aria-labelledby="turnout-h" className="card p-4 sm:p-5">
            <h2 id="turnout-h" className="text-lg font-bold">Turnout at recent events</h2>
            <p className="text-sm text-ink-soft">Confirmed sign-ups vs. verified attendance for your last {completed.length || 8} completed events</p>
            {events.isPending || (completed.length > 0 && chartLoading) ? (
              <Skeleton className="mt-4 h-64 w-full" />
            ) : chartData.length === 0 ? (
              <EmptyState icon={<Users />} title="No completed events yet" body="Once you mark an event complete, its turnout shows up here." />
            ) : (
              <>
                <div className="mt-3 flex flex-wrap gap-4 text-sm text-ink-soft" aria-hidden>
                  <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm" style={{ background: CHART.primary }} />Signed up</span>
                  <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm" style={{ background: CHART.secondary }} />Attended</span>
                </div>
                <div className="mt-2 h-64" role="img" aria-label={`Turnout: ${chartData.map((d) => `${d.title}, ${d.signedUp} signed up, ${d.attended} attended`).join('; ')}`}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }} barGap={2}>
                      <CartesianGrid vertical={false} stroke={CHART.grid} />
                      <XAxis dataKey="label" tick={{ fontSize: 12, fill: CHART.axis }} tickLine={false} axisLine={{ stroke: CHART.grid }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: CHART.axis }} tickLine={false} axisLine={false} />
                      <Tooltip
                        cursor={{ fill: 'rgba(62,75,180,0.06)' }}
                        content={({ active, payload }) => (
                          <ChartTooltip active={active} payload={payload as any[]} label={(payload?.[0]?.payload as any)?.title} />
                        )}
                      />
                      <Bar dataKey="signedUp" name="Signed up" fill={CHART.primary} radius={[4, 4, 0, 0]} maxBarSize={24} />
                      <Bar dataKey="attended" name="Attended" fill={CHART.secondary} radius={[4, 4, 0, 0]} maxBarSize={24} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer font-semibold text-ink-soft">Show as table</summary>
                  <table className="mt-2 w-full text-left">
                    <thead className="text-ink-faint"><tr><th className="py-1 font-semibold">Event</th><th className="py-1 text-right font-semibold">Signed up</th><th className="py-1 text-right font-semibold">Attended</th></tr></thead>
                    <tbody className="divide-y divide-paper-line">
                      {chartData.map((d) => (
                        <tr key={d.id}>
                          <td className="py-1.5 pr-2"><Link to={`/events/${d.id}/manage?tab=analytics`} className="link">{d.title}</Link> <span className="text-ink-faint">· {d.label}</span></td>
                          <td className="py-1.5 text-right tabular-nums">{d.signedUp}</td>
                          <td className="py-1.5 text-right tabular-nums">{d.attended}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              </>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          <Card>
            <h2 className="mb-2 text-base font-bold">Quick actions</h2>
            <div className="space-y-1">
              <QuickAction to="/events/new" icon={<CalendarPlus />} title="Create event" body="Drive, camp or workshop" />
              <QuickAction to="/requests/resources/new" icon={<PackagePlus />} title="Start donation drive" body="List items you need pledged" />
              <QuickAction to="/requests/blood/new" icon={<Droplet />} title="Request blood" body="Alert compatible donors nearby" />
              <QuickAction href={`${API_URL}/api/handbook.pdf`} icon={<BookOpen />} title="Organizer handbook" body="Safety, check-in and certificates (PDF)" />
            </div>
          </Card>

          <Card>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-base font-bold">Recent reviews</h2>
              {s?.reviewCount ? <Pill tone="marigold" icon={<Star className="h-3 w-3 fill-current" />}>{s.avgRating?.toFixed(1)}</Pill> : null}
            </div>
            {reviews.isPending ? <Skeleton className="h-28 w-full" /> : reviews.isError ? (
              <p className="text-sm text-blood-600">Couldn't load reviews. <button type="button" className="link" onClick={() => reviews.refetch()}>Try again</button></p>
            ) : reviews.data.length === 0 ? (
              <p className="text-sm text-ink-faint">Volunteers who attend your completed events can rate them. Reviews appear here.</p>
            ) : (
              <ul className="divide-y divide-paper-line">
                {reviews.data.slice(0, 5).map((r) => (
                  <li key={r.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex items-center justify-between gap-2">
                      <Stars value={r.rating} size={14} />
                      <span className="text-xs text-ink-faint">{ago(r.createdAt)}</span>
                    </div>
                    {r.body && <p className="mt-1 line-clamp-3 text-sm">{r.body}</p>}
                    <div className="mt-1 truncate text-xs text-ink-soft">
                      {r.reviewer.name} · <Link to={`/events/${r.eventId}?tab=reviews`} className="link">{r.eventTitle}</Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="flex items-start gap-3">
            <HandHeart className="h-5 w-5 shrink-0 text-marigold-600" aria-hidden />
            <p className="text-sm text-ink-soft">
              Tip: mark events complete within a day so volunteers get their certificates while the experience is fresh.
            </p>
          </Card>
        </aside>
      </div>
    </div>
  );
}
