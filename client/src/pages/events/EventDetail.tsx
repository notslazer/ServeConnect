import { ReactNode, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import {
  AlertTriangle, ArrowLeft, Award, CalendarDays, CalendarPlus, CheckCircle2, ClipboardList, CloudRain, Clock, Droplets, ExternalLink, Flag, Hourglass,
  MapPin, MessageCircle, Navigation, Pencil, QrCode, Send, Share2, ShieldAlert, Sun, Thermometer, Trash2, Users, Wind, XCircle,
} from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { EVENT_CATEGORIES, SKILLS } from '../../lib/constants';
import { isSameDay } from 'date-fns';
import { fmtDate, fmtRange, fmtTime, hours as fmtHours, plural } from '../../lib/format';
import { useNow } from '../../lib/hooks';
import { Countdown } from '../../components/Countdown';
import { EventCover, spotsText } from '../../components/EventCard';
import { MapView } from '../../components/Map';
import { ReportDialog } from '../../components/ReportDialog';
import {
  Button, ButtonLink, Card, ErrorState, FormError, Modal, Notice, Pill, ProgressBar, Skeleton, Tabs, Textarea,
  UserLine, fieldError, toastError, useConfirm,
} from '../../components/ui';
import { DiscussionTab, GalleryTab, ReviewsTab, TeamsTab } from '../../components/EventsDetailTabs';
import { directionsUrl, downloadIcs, EventStatusPill, shareLink, useEventCounts, type EventDetail as Ev, type WeatherAdvisory } from '../../components/EventsKit';

type TabId = 'about' | 'discussion' | 'teams' | 'gallery' | 'reviews';

function DetailSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <Skeleton className="aspect-[16/9] w-full rounded-2xl sm:aspect-[21/8]" />
      <Skeleton className="h-8 w-2/3" />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-3"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-5/6" /><Skeleton className="h-4 w-4/6" /></div>
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  );
}

function InfoRow({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="mt-0.5 shrink-0 text-brand-500 [&>svg]:h-5 [&>svg]:w-5" aria-hidden>{icon}</div>
      <div className="min-w-0 text-[15px]">{children}</div>
    </div>
  );
}

function WeatherCard({ weather }: { weather: WeatherAdvisory }) {
  return (
    <section aria-labelledby="wx-h" className={clsx('rounded-2xl border p-4', weather.adverse ? 'border-marigold-300 bg-marigold-50' : 'border-paper-line bg-white')}>
      <div className="mb-3 flex items-center gap-2">
        {weather.adverse ? <AlertTriangle className="h-5 w-5 text-marigold-700" aria-hidden /> : <Sun className="h-5 w-5 text-marigold-500" aria-hidden />}
        <h2 id="wx-h" className="text-base font-bold">{weather.adverse ? 'Weather advisory' : 'Weather forecast'}</h2>
        <span className="ml-auto text-xs text-ink-faint">Updated {fmtTime(weather.checkedAt)}</span>
      </div>
      {weather.alerts.length > 0 && (
        <ul className="mb-3 space-y-1.5" role="alert">
          {weather.alerts.map((a) => (
            <li key={a} className="flex gap-2 text-sm font-medium text-marigold-700"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {a}</li>
          ))}
        </ul>
      )}
      <ul className="grid gap-2 sm:grid-cols-2">
        {weather.days.map((d) => (
          <li key={d.date} className="rounded-xl bg-white/80 p-3 text-sm ring-1 ring-paper-line">
            <div className="font-semibold">{new Date(d.date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })} · {d.summary}</div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-ink-soft">
              <span className="inline-flex items-center gap-1"><Thermometer className="h-4 w-4" aria-hidden />{Math.round(d.tMin)}–{Math.round(d.tMax)}°C</span>
              <span className={clsx('inline-flex items-center gap-1', d.precipProb >= 70 && 'font-semibold text-marigold-700')}><CloudRain className="h-4 w-4" aria-hidden />{d.precipProb}% rain</span>
              {d.precipMm > 0 && <span className="inline-flex items-center gap-1"><Droplets className="h-4 w-4" aria-hidden />{d.precipMm} mm</span>}
              <span className={clsx('inline-flex items-center gap-1', d.windKmh >= 50 && 'font-semibold text-marigold-700')}><Wind className="h-4 w-4" aria-hidden />{Math.round(d.windKmh)} km/h</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function EventDetail() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const { user } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const now = useNow(30_000);
  const [params, setParams] = useSearchParams();
  const [confirm, confirmDialog] = useConfirm();
  const [report, setReport] = useState<null | 'event' | 'safety'>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [regError, setRegError] = useState<unknown>(null);

  const tabsRef = useRef<HTMLDivElement>(null);
  const key = ['event', id];
  const q = useQuery({ queryKey: key, queryFn: () => api<Ev>(`/events/${id}`), enabled: Boolean(id) });
  const e = q.data;
  const refresh = () => qc.invalidateQueries({ queryKey: key, exact: true });

  useEventCounts(id, Boolean(user) && e?.status === 'published', (c) => {
    qc.setQueryData<Ev>(key, (old) => (old ? { ...old, counts: c } : old));
  });

  const register = useMutation({
    mutationFn: () => api<{ status: 'registered' | 'waitlisted'; checkinCode: string }>(`/events/${id}/register`, { method: 'POST' }),
    onMutate: () => setRegError(null),
    onSuccess: (r) => {
      toast.success(r.status === 'registered' ? "You're registered. Your check-in code is below." : "You're on the waitlist. We'll tell you if a spot opens.");
      refresh();
      qc.invalidateQueries({ queryKey: ['events'] });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === 'already_registered') { refresh(); return; }
      setRegError(err);
    },
  });
  const cancelReg = useMutation({
    mutationFn: () => api(`/events/${id}/cancel-registration`, { method: 'POST' }),
    onSuccess: () => { toast.success('Your registration was cancelled.'); refresh(); qc.invalidateQueries({ queryKey: ['events'] }); },
    onError: toastError,
  });
  const publish = useMutation({
    mutationFn: () => api(`/events/${id}/publish`, { method: 'POST' }),
    onSuccess: () => { toast.success('Event published. Followers and matching volunteers are being notified.'); refresh(); },
    onError: toastError,
  });
  const cancelEvent = useMutation({
    mutationFn: () => api(`/events/${id}/cancel`, { body: { reason: reason.trim() } }),
    onSuccess: () => { toast.success('Event cancelled. Registered volunteers have been notified.'); setCancelOpen(false); setReason(''); refresh(); },
  });
  const complete = useMutation({
    mutationFn: () => api(`/events/${id}/complete`, { method: 'POST' }),
    onSuccess: () => { toast.success('Event marked complete. Certificates are being issued to verified attendees.'); refresh(); },
    onError: toastError,
  });
  const deleteDraft = useMutation({
    mutationFn: () => api(`/events/${id}`, { method: 'DELETE' }),
    onSuccess: () => { toast.success('Draft deleted.'); qc.invalidateQueries({ queryKey: ['events'] }); nav('/events/mine?tab=hosting', { replace: true }); },
    onError: toastError,
  });

  // Keep the selected tab visible when the tab strip scrolls horizontally on small screens (e.g. ?tab=reviews).
  const tabParam = params.get('tab');
  useEffect(() => {
    if (!tabParam) return;
    tabsRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [tabParam, q.isSuccess]);

  if (q.isPending) return <DetailSkeleton />;
  if (q.isError || !e) return <ErrorState error={q.error} retry={() => q.refetch()} />;

  const cat = EVENT_CATEGORIES[e.category] ?? EVENT_CATEGORIES.other;
  const start = new Date(e.startAt).getTime();
  const end = new Date(e.endAt).getTime();
  const ended = now > end;
  const started = now >= start;
  const my = e.myRegistration;
  const full = e.counts.registered >= e.capacity;
  const canSeeTeams = Boolean(user && (e.isOwner || e.isTeamLead || (my && ['registered', 'attended'].includes(my.status))));
  const canManage = e.isOwner || e.isTeamLead;
  const canPublish = user?.verificationStatus === 'verified' || user?.role === 'admin';
  const url = `${window.location.origin}/events/${e.id}`;

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: 'about', label: t('events.tab.about', 'About') },
    { id: 'discussion', label: t('events.tab.discussion', 'Discussion') },
    ...(canSeeTeams ? [{ id: 'teams' as TabId, label: t('events.tab.teams', 'Teams') }] : []),
    { id: 'gallery', label: t('events.tab.gallery', 'Gallery') },
    { id: 'reviews', label: t('events.tab.reviews', 'Reviews'), count: e.rating.n || undefined },
  ];
  const requested = params.get('tab') as TabId | null;
  const tab: TabId = requested && tabs.some((x) => x.id === requested) ? requested : 'about';
  const setTab = (v: TabId) => {
    const p = new URLSearchParams(params);
    if (v === 'about') p.delete('tab'); else p.set('tab', v);
    setParams(p, { replace: true });
  };

  const doShare = async () => {
    const r = await shareLink(e.title, url);
    if (r === 'copied') toast.success('Link copied');
    else if (r === 'failed') toast.error("Couldn't copy the link. Copy it from the address bar.");
  };

  const askCancelReg = async () => {
    const waitlisted = my?.status === 'waitlisted';
    const ok = await confirm({
      title: waitlisted ? 'Leave the waitlist?' : 'Cancel your registration?',
      body: waitlisted ? 'You will lose your place in the queue.' : 'Your spot goes to the next person on the waitlist. You can register again later if spots are still open.',
      confirmLabel: waitlisted ? 'Leave waitlist' : 'Cancel registration',
      danger: true,
    });
    if (ok) cancelReg.mutate();
  };

  // ── registration / action panel ──
  const regErrMsg = regError instanceof Error ? regError.message : null;
  const needsConsent = Boolean(user?.isMinor && user.guardianConsent !== 'granted');
  const actionPanel = (() => {
    if (!user) {
      return (
        <div className="space-y-2">
          <ButtonLink block size="lg" to={`/login?next=${encodeURIComponent(`/events/${e.id}`)}`}>{t('events.signInToRegister', 'Sign in to register')}</ButtonLink>
          <p className="text-center text-sm text-ink-faint">New here? <Link className="link" to={`/register?next=${encodeURIComponent(`/events/${e.id}`)}`}>Create a free account</Link></p>
        </div>
      );
    }
    if (e.isOwner) return null;
    if (my?.status === 'registered') {
      return (
        <div className="space-y-3">
          <div className="rounded-2xl border-2 border-dashed border-brand-300 bg-brand-50 p-4 text-center">
            <div className="flex items-center justify-center gap-1.5 text-sm font-semibold text-brand-700"><CheckCircle2 className="h-4 w-4" aria-hidden /> You're registered</div>
            <div className="mt-2 text-xs text-ink-soft">Your personal check-in code</div>
            <div className="font-mono text-3xl font-bold tracking-[0.25em] text-brand-800" aria-label={`Check-in code ${my.checkinCode.split('').join(' ')}`}>{my.checkinCode}</div>
            <p className="mt-1 text-xs text-ink-soft">Scan the organizer's QR code on the day, or show them this code.</p>
          </div>
          {e.checkinOpen && <ButtonLink block to="/scan" icon={<QrCode className="h-5 w-5" />}>Open check-in scanner</ButtonLink>}
          {!ended && <Button block variant="ghost" loading={cancelReg.isPending} onClick={askCancelReg}>Cancel registration</Button>}
        </div>
      );
    }
    if (my?.status === 'waitlisted') {
      return (
        <div className="space-y-3">
          <Notice tone="marigold" icon={<Hourglass className="h-5 w-5" />} title={`You're #${my.waitlistPosition} on the waitlist`}>
            If someone cancels, you'll move up automatically and we'll notify you.
          </Notice>
          <Button block variant="ghost" loading={cancelReg.isPending} onClick={askCancelReg}>Leave waitlist</Button>
        </div>
      );
    }
    if (my?.status === 'attended') {
      return (
        <div className="flex items-center gap-4">
          <div className="stamp h-20 w-20 shrink-0" aria-label={`${fmtHours(my.hours ?? e.hours)} verified hours`}>
            <span className="text-2xl leading-none">{fmtHours(my.hours ?? e.hours)}</span>
            <span className="text-[10px] font-bold">hours</span>
          </div>
          <div className="min-w-0 text-sm">
            <div className="font-semibold text-leaf-700">You attended this event</div>
            {my.checkedInAt && <div className="text-ink-soft">Checked in at {fmtTime(my.checkedInAt)}</div>}
            {my.certificateSerial ? (
              <Link to="/certificates" className="link mt-1 inline-flex items-center gap-1 font-semibold"><Award className="h-4 w-4" aria-hidden /> View your certificate</Link>
            ) : e.status === 'completed' ? (
              <div className="text-ink-faint">Your certificate is being prepared.</div>
            ) : null}
          </div>
        </div>
      );
    }
    if (my?.status === 'no_show') {
      return <Notice tone="neutral" title="Marked as missed">The organizer didn't record your attendance. If this is wrong, message them through the Discussion tab.</Notice>;
    }
    if (e.status === 'cancelled') return null;
    if (e.status !== 'published') return <p className="text-sm text-ink-faint">Registration is closed.</p>;
    if (ended) return <p className="text-sm text-ink-faint">This event has ended.</p>;
    return (
      <div className="space-y-3">
        <Button block size="lg" variant={full ? 'marigold' : 'primary'} loading={register.isPending} onClick={() => register.mutate()}>
          {full ? t('events.joinWaitlist', 'Join waitlist') : t('events.register', 'Register')}
        </Button>
        {e.minAge && <p className="text-center text-xs text-ink-faint">For volunteers aged {e.minAge}+</p>}
        {regErrMsg && (
          <Notice
            tone="blood"
            title="Couldn't register"
            action={needsConsent || /verify/i.test(regErrMsg) ? <ButtonLink size="sm" variant="outline" to="/settings/account">Open settings</ButtonLink> : undefined}
          >
            {regErrMsg}
          </Notice>
        )}
        {!regErrMsg && needsConsent && (
          <p className="text-xs text-ink-faint">Volunteers under 18 need parent or guardian consent before joining in-person events.</p>
        )}
      </div>
    );
  })();

  const ownerTools = canManage && (
    <Card className="space-y-3">
      <h2 className="text-base font-bold">{e.isOwner ? 'Organizer tools' : 'Team lead tools'}</h2>
      {e.manualCode && e.status === 'published' && (
        <div className="rounded-xl bg-paper px-3 py-2 text-sm">
          <span className="text-ink-soft">Event code </span>
          <span className="font-mono text-lg font-bold tracking-[0.2em]">{e.manualCode}</span>
        </div>
      )}
      <div className="grid gap-2">
        {e.isOwner ? (
          <ButtonLink to={`/events/${e.id}/manage`} icon={<ClipboardList className="h-4 w-4" />}>Manage event</ButtonLink>
        ) : (
          <ButtonLink to={`/events/${e.id}/manage`} icon={<QrCode className="h-4 w-4" />}>Check-in console</ButtonLink>
        )}
        {e.isOwner && e.status === 'draft' && (
          <>
            <Button variant="marigold" icon={<Send className="h-4 w-4" />} disabled={!canPublish} loading={publish.isPending} onClick={() => publish.mutate()}>Publish event</Button>
            {!canPublish && (
              <p className="text-xs text-ink-soft">Publishing needs a verified profile. <Link to="/settings/verification" className="link">Get verified</Link></p>
            )}
          </>
        )}
        {e.isOwner && !['completed', 'cancelled'].includes(e.status) && (
          <ButtonLink to={`/events/${e.id}/edit`} variant="outline" icon={<Pencil className="h-4 w-4" />}>Edit event</ButtonLink>
        )}
        {e.isOwner && e.status === 'published' && started && (
          <Button variant="secondary" icon={<CheckCircle2 className="h-4 w-4" />} loading={complete.isPending}
            onClick={async () => {
              if (await confirm({ title: 'Mark this event complete?', body: 'Volunteers not checked in are marked as no-shows, the waitlist is closed, and certificates are issued to verified attendees. This cannot be undone.', confirmLabel: 'Mark complete' })) complete.mutate();
            }}>
            Mark complete
          </Button>
        )}
        {e.isOwner && ['draft', 'published'].includes(e.status) && (
          <Button variant="ghost" className="text-blood-600 hover:bg-blood-50 hover:text-blood-700" icon={<XCircle className="h-4 w-4" />} onClick={() => setCancelOpen(true)}>Cancel event</Button>
        )}
        {e.isOwner && e.status === 'draft' && (
          <Button variant="ghost" className="text-blood-600 hover:bg-blood-50 hover:text-blood-700" icon={<Trash2 className="h-4 w-4" />} loading={deleteDraft.isPending}
            onClick={async () => { if (await confirm({ title: 'Delete this draft?', body: 'This permanently removes the draft.', confirmLabel: 'Delete draft', danger: true })) deleteDraft.mutate(); }}>
            Delete draft
          </Button>
        )}
      </div>
    </Card>
  );

  return (
    <div>
      <Link to={user ? '/events' : '/'} className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-soft hover:text-ink">
        <ArrowLeft className="h-4 w-4" aria-hidden /> {user ? 'All events' : 'ServeConnect home'}
      </Link>

      {/* Cover */}
      <div className="relative overflow-hidden rounded-2xl">
        <EventCover event={e} className="aspect-[16/9] max-h-[340px] w-full text-7xl sm:aspect-[21/8]" />
      </div>

      {/* Title */}
      <div className="mt-4">
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <Pill tone="brand"><span aria-hidden>{cat.emoji}</span> {cat.label}</Pill>
          {e.isOutdoor && <Pill tone="marigold" icon={<Sun className="h-3 w-3" />}>Outdoor</Pill>}
          {e.status !== 'published' && <EventStatusPill status={e.status} />}
        </div>
        <h1 className="text-2xl font-extrabold leading-tight sm:text-[32px]">{e.title}</h1>
        <div className="mt-3">
          <UserLine
            user={e.organizer}
            sub={[
              e.organizer.avgRating ? `★ ${e.organizer.avgRating.toFixed(1)} organizer rating` : null,
              plural(e.organizer.completedEvents, 'completed event'),
            ].filter(Boolean).join(' · ')}
          />
        </div>
      </div>

      {/* Status notices */}
      <div className="mt-4 space-y-3">
        {e.status === 'cancelled' && <Notice tone="blood" icon={<XCircle className="h-5 w-5" />} title="This event was cancelled">Registered volunteers were notified. Check the organizer's profile for other events.</Notice>}
        {e.status === 'draft' && <Notice tone="neutral" title="Draft — only you can see this">Publish it when you're ready for volunteers to register.</Notice>}
        {e.status === 'completed' && <Notice tone="leaf" icon={<CheckCircle2 className="h-5 w-5" />} title="This event is complete">{plural(e.counts.attended, 'volunteer')} attended{e.rating.n ? ` · rated ${e.rating.avg?.toFixed(1)} by ${plural(e.rating.n, 'volunteer')}` : ''}.</Notice>}
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Side rail (first on mobile) */}
        <aside className="space-y-4 lg:order-2 lg:sticky lg:top-20 lg:self-start">
          <Card className="space-y-4">
            <InfoRow icon={<CalendarDays />}>
              {isSameDay(new Date(e.startAt), new Date(e.endAt)) ? (
                <>
                  <div className="font-semibold">{fmtDate(e.startAt)}</div>
                  <div className="text-sm text-ink-soft">{fmtTime(e.startAt)} – {fmtTime(e.endAt)}</div>
                </>
              ) : (
                <div className="font-semibold">{fmtRange(e.startAt, e.endAt)}</div>
              )}
            </InfoRow>
            {(e.locationName || e.address) && (
              <InfoRow icon={<MapPin />}>
                <div className="font-semibold">{e.locationName ?? e.address}</div>
                {e.locationName && e.address && <div className="text-sm text-ink-soft">{e.address}</div>}
                {e.lat != null && e.lng != null && (
                  <a href={directionsUrl(e.lat, e.lng)} target="_blank" rel="noopener noreferrer" className="link mt-0.5 inline-flex items-center gap-1 text-sm font-semibold">
                    <Navigation className="h-3.5 w-3.5" aria-hidden /> Get directions
                  </a>
                )}
              </InfoRow>
            )}
            <InfoRow icon={<Users />}>
              <div className="flex items-center gap-2 font-semibold">
                {spotsText({ capacity: e.capacity, registered: e.counts.registered, waitlisted: e.counts.waitlisted, status: e.status })}
                {user && e.status === 'published' && !ended && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-leaf-600"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-leaf-500" aria-hidden />Live</span>
                )}
              </div>
              <div className="mt-1.5"><ProgressBar value={e.counts.registered} max={e.capacity} tone={full ? 'marigold' : 'brand'} /></div>
              <div className="mt-1 text-sm text-ink-soft" aria-live="polite">
                {e.counts.registered} of {e.capacity} registered{e.counts.waitlisted > 0 && ` · ${e.counts.waitlisted} on waitlist`}
                {e.counts.attended > 0 && ` · ${e.counts.attended} checked in`}
              </div>
            </InfoRow>
            <InfoRow icon={<Clock />}>
              <div className="text-sm text-ink-soft">
                {fmtHours(e.hours)} volunteer hours{!ended && e.status === 'published' && ' · check-in opens 1 hour before the start'}
              </div>
            </InfoRow>
            {e.status === 'published' && !ended && (
              <div>
                <div className="mb-1.5 text-sm font-semibold text-ink-soft">{started ? 'Status' : 'Starts in'}</div>
                <Countdown to={e.startAt} end={e.endAt} />
              </div>
            )}
            {actionPanel}
            {my?.team && (
              <div className="rounded-xl bg-paper p-3 text-sm">
                <div className="text-ink-soft">Your team</div>
                <div className="font-semibold">{my.team.name}</div>
                {my.team.conversationId && (
                  <Link to={`/messages/${my.team.conversationId}`} className="link mt-1 inline-flex items-center gap-1 font-semibold"><MessageCircle className="h-4 w-4" aria-hidden /> Open team chat</Link>
                )}
              </div>
            )}
            <div className="flex flex-wrap gap-2 border-t border-paper-line pt-3">
              <Button size="sm" variant="outline" icon={<Share2 className="h-4 w-4" />} onClick={doShare}>Share</Button>
              {e.status !== 'cancelled' && !ended && (
                <Button size="sm" variant="outline" icon={<CalendarPlus className="h-4 w-4" />} onClick={() => downloadIcs(e)}>Add to calendar</Button>
              )}
              {user && !e.isOwner && (
                <Button size="sm" variant="ghost" icon={<Flag className="h-4 w-4" />} onClick={() => setReport('event')}>Report event</Button>
              )}
            </div>
          </Card>
          {ownerTools}
        </aside>

        {/* Main column */}
        <div className="min-w-0 lg:order-1">
          <div ref={tabsRef}><Tabs tabs={tabs} value={tab} onChange={setTab} className="mb-5" /></div>
          <div role="tabpanel" aria-label={tabs.find((x) => x.id === tab)?.label}>
            {tab === 'about' && (
              <div className="space-y-6">
                {e.weather && e.weather.days?.length > 0 && !ended && <WeatherCard weather={e.weather} />}
                <section>
                  <h2 className="sr-only">Description</h2>
                  <p className="prose-body">{e.description}</p>
                </section>
                {e.skillsNeeded.length > 0 && (
                  <section aria-labelledby="skills-h">
                    <h2 id="skills-h" className="mb-2 text-base font-bold">Skills needed</h2>
                    <div className="flex flex-wrap gap-1.5">{e.skillsNeeded.map((s) => <Pill key={s} tone="brand">{SKILLS[s] ?? s}</Pill>)}</div>
                  </section>
                )}
                {(e.requirements || e.minAge) && (
                  <section aria-labelledby="req-h">
                    <h2 id="req-h" className="mb-2 text-base font-bold">What to know before you go</h2>
                    {e.minAge && <p className="mb-1 text-[15px]"><span className="font-semibold">Minimum age:</span> {e.minAge} years</p>}
                    {e.requirements && <p className="prose-body">{e.requirements}</p>}
                  </section>
                )}
                {e.lat != null && e.lng != null && (
                  <section aria-labelledby="loc-h" className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h2 id="loc-h" className="text-base font-bold">Location</h2>
                      <a href={directionsUrl(e.lat, e.lng)} target="_blank" rel="noopener noreferrer" className="link inline-flex items-center gap-1 text-sm font-semibold">
                        Get directions <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                      </a>
                    </div>
                    <MapView markers={[{ id: e.id, lat: e.lat, lng: e.lng, title: e.locationName ?? e.title, sub: e.address ?? undefined }]} height={260} />
                  </section>
                )}
                <section aria-labelledby="safety-h" className="rounded-2xl border border-paper-line bg-paper p-4">
                  <h2 id="safety-h" className="mb-1 flex items-center gap-2 text-base font-bold"><ShieldAlert className="h-5 w-5 text-ink-soft" aria-hidden /> Safety</h2>
                  <p className="text-sm text-ink-soft">{t('safety.eventDisclaimer', 'The organizer — not ServeConnect — is responsible for on-site safety arrangements. Follow their briefing, and report any safety concern to our moderation team.')}</p>
                  {e.isOwner ? null : user ? (
                    <Button size="sm" variant="outline" className="mt-3" icon={<ShieldAlert className="h-4 w-4" />} onClick={() => setReport('safety')}>Report a safety concern</Button>
                  ) : (
                    <Link to={`/login?next=${encodeURIComponent(`/events/${e.id}`)}`} className="link mt-2 inline-block text-sm font-semibold">Sign in to report a safety concern</Link>
                  )}
                </section>
              </div>
            )}
            {tab === 'discussion' && <DiscussionTab event={e} />}
            {tab === 'teams' && canSeeTeams && <TeamsTab event={e} />}
            {tab === 'gallery' && <GalleryTab event={e} />}
            {tab === 'reviews' && <ReviewsTab event={e} />}
          </div>
        </div>
      </div>

      {report && (
        <ReportDialog open onClose={() => setReport(null)} targetType={report} targetId={e.id} title={report === 'safety' ? 'Report a safety concern' : 'Report this event'} />
      )}

      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Cancel this event?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCancelOpen(false)}>Keep event</Button>
            <Button variant="danger" disabled={reason.trim().length < 3} loading={cancelEvent.isPending} onClick={() => cancelEvent.mutate()}>Cancel event</Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-ink-soft">
            {e.counts.registered + e.counts.waitlisted > 0
              ? `All ${plural(e.counts.registered + e.counts.waitlisted, 'volunteer')} registered or waitlisted will be notified with your reason. This cannot be undone.`
              : 'Nobody has registered yet. This cannot be undone.'}
          </p>
          <Textarea label="Reason for volunteers" rows={3} maxLength={500} value={reason} onChange={(ev) => setReason(ev.target.value)} placeholder="Heavy rain forecast; we'll announce a new date soon." error={fieldError(cancelEvent.error, 'reason')} />
          {cancelEvent.error && !fieldError(cancelEvent.error, 'reason') ? <FormError error={cancelEvent.error} /> : null}
        </div>
      </Modal>
      {confirmDialog}
    </div>
  );
}
