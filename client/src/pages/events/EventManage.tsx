import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { format } from 'date-fns';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  CheckCircle2, Clock, Download, ExternalLink, Eye, KeyRound, Maximize2, Pencil, QrCode, Search, ShieldAlert, Timer, UserCheck, UserX, Users, X,
} from 'lucide-react';
import { api, download } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { getSocket } from '../../lib/socket';
import { SKILLS } from '../../lib/constants';
import { fmtTime, hours as fmtHours, plural, relDay } from '../../lib/format';
import { useDebounce, useNow } from '../../lib/hooks';
import { Stars } from '../../components/StarRating';
import {
  Avatar, Button, ButtonLink, Card, EmptyState, ErrorState, FormError, IconButton, Input, Modal, Notice, PageHeader, PageLoader, Pill, ProgressBar,
  Select, Skeleton, Stat, Tabs, fieldError, toastError, useConfirm,
} from '../../components/ui';
import { TeamsPanel } from '../../components/EventsManageTeams';
import {
  CHART, ChartTooltip, EventStatusPill, METHOD_LABEL, RegStatusPill, useEventCounts,
  type Analytics, type Attendee, type CheckinQr, type EventDetail,
} from '../../components/EventsKit';

type TabId = 'checkin' | 'attendees' | 'teams' | 'analytics';

// ───────────────────────── Check-in console ─────────────────────────
function CheckinConsole({ event }: { event: EventDetail }) {
  const qc = useQueryClient();
  const now = useNow(1000);
  const [code, setCode] = useState('');
  const [last, setLast] = useState<{ name: string; at: string } | null>(null);
  const [full, setFull] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const qr = useQuery({
    queryKey: ['checkin-qr', event.id],
    queryFn: () => api<CheckinQr>(`/events/${event.id}/checkin-qr`),
    // The QR token rotates every minute; fetch the next one right after the current window closes.
    refetchInterval: (query) => Math.max(3000, (query.state.data?.refreshInMs ?? 60_000) + 400),
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
  });
  const recent = useQuery({
    queryKey: ['attendees', event.id, { status: 'attended' }],
    queryFn: () => api<Attendee[]>(`/events/${event.id}/attendees`, { query: { status: 'attended' } }),
  });

  const refreshLists = () => {
    qc.invalidateQueries({ queryKey: ['attendees', event.id] });
  };
  useEventCounts(event.id, true, (c) => {
    qc.setQueryData<CheckinQr>(['checkin-qr', event.id], (old) => (old ? { ...old, counts: c } : old));
    refreshLists();
  });
  useEffect(() => {
    const s = getSocket();
    const onCheckin = (d: { eventId: string; name: string }) => {
      if (d.eventId !== event.id) return;
      toast.success(`${d.name} checked in`, { id: `ci-${d.name}` });
      refreshLists();
    };
    s.on('checkin', onCheckin);
    return () => { s.off('checkin', onCheckin); };
  }, [event.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const manual = useMutation({
    mutationFn: (checkinCode: string) => api<{ ok: true; name: string; checkedInAt: string }>(`/events/${event.id}/checkin/manual`, { body: { checkinCode } }),
    onSuccess: (r) => {
      setLast({ name: r.name, at: r.checkedInAt });
      setCode('');
      toast.success(`${r.name} checked in`);
      refreshLists();
      qc.invalidateQueries({ queryKey: ['checkin-qr', event.id] });
      inputRef.current?.focus();
    },
  });
  const submitCode = (e: FormEvent) => {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (c.length >= 4) manual.mutate(c);
  };

  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setFull(false);
    document.addEventListener('keydown', onKey);
    document.documentElement.requestFullscreen?.().catch(() => {});
    return () => {
      document.removeEventListener('keydown', onKey);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, [full]);
  useEffect(() => {
    const onFs = () => { if (!document.fullscreenElement) setFull(false); };
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  const d = qr.data;
  const secsLeft = d ? Math.max(0, Math.ceil((qr.dataUpdatedAt + d.refreshInMs - now) / 1000)) : 0;
  const counts = d?.counts ?? event.counts;
  const opensAt = new Date(new Date(event.startAt).getTime() - 60 * 60_000);
  const recentList = (recent.data ?? []).filter((a) => a.checkedInAt).sort((a, b) => b.checkedInAt!.localeCompare(a.checkedInAt!)).slice(0, 15);

  if (event.status !== 'published') {
    return <EmptyState icon={<QrCode />} title="Check-in is closed" body={event.status === 'draft' ? 'Publish the event to open check-in on the day.' : `This event is ${event.status}.`} />;
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        {d && !d.open && (
          <Notice tone="marigold" icon={<Clock className="h-5 w-5" />} title="Check-in isn't open yet">
            It opens at {fmtTime(opensAt)} on {format(opensAt, 'd MMM')} (1 hour before the start) and closes when the event ends.
          </Notice>
        )}
        <Card className="flex flex-col items-center text-center">
          {qr.isPending ? <Skeleton className="aspect-square w-full max-w-[340px]" /> : qr.isError ? <ErrorState error={qr.error} retry={() => qr.refetch()} /> : d && (
            <>
              <img src={d.qr} alt="Check-in QR code. Volunteers scan this with the ServeConnect scanner." className={clsx('aspect-square w-full max-w-[340px] rounded-xl', !d.open && 'opacity-40')} />
              <div className="mt-3 flex items-center gap-1.5 text-sm text-ink-soft" aria-live="off">
                <Timer className="h-4 w-4" aria-hidden /> New code in {secsLeft}s · old codes keep working for ~3 minutes
              </div>
              <div className="mt-4 text-sm font-semibold text-ink-soft">Event code</div>
              <div className="font-mono text-4xl font-extrabold tracking-[0.3em] text-ink sm:text-5xl" aria-label={`Event code ${d.eventCode.split('').join(' ')}`}>{d.eventCode}</div>
              <p className="mt-1 max-w-sm text-sm text-ink-faint">Volunteers who can't scan can type this code under Check in, then Enter event code.</p>
              <Button className="mt-4" variant="outline" icon={<Maximize2 className="h-4 w-4" />} onClick={() => setFull(true)}>Fullscreen display</Button>
            </>
          )}
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <div className="grid grid-cols-2 gap-3">
            <Stat value={counts.attended} label="Checked in" tone="leaf" />
            <Stat value={counts.registered} label="Registered" />
          </div>
          <div className="mt-3"><ProgressBar value={counts.attended} max={Math.max(1, counts.registered)} tone="leaf" /></div>
          <p className="mt-1 text-sm text-ink-soft">{counts.registered ? Math.round((counts.attended / counts.registered) * 100) : 0}% of registered volunteers are here</p>
        </Card>

        <Card>
          <form onSubmit={submitCode} className="space-y-2">
            <h2 className="flex items-center gap-2 text-base font-bold"><KeyRound className="h-4 w-4 text-brand-500" aria-hidden /> Check in by personal code</h2>
            <p className="text-sm text-ink-soft">Ask the volunteer for the code shown on their event page.</p>
            <div className="flex gap-2">
              <input
                ref={inputRef}
                className={clsx('input font-mono text-lg uppercase tracking-[0.2em]', fieldError(manual.error, 'checkinCode') && 'input-error')}
                aria-label="Volunteer's personal check-in code"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={8}
                placeholder="AB12CD"
                value={code}
                onChange={(e) => { setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')); manual.reset(); }}
              />
              <Button type="submit" loading={manual.isPending} disabled={code.length < 4}>Check in</Button>
            </div>
            {manual.error ? <FormError error={manual.error} /> : last && (
              <p role="status" className="flex items-center gap-1.5 text-sm font-semibold text-leaf-700"><CheckCircle2 className="h-4 w-4" aria-hidden /> {last.name} checked in at {fmtTime(last.at)}</p>
            )}
          </form>
        </Card>

        <Card>
          <h2 className="mb-2 text-base font-bold">Recent check-ins</h2>
          {recent.isPending ? <Skeleton className="h-24 w-full" /> : recentList.length === 0 ? (
            <p className="text-sm text-ink-faint">Nobody has checked in yet. New check-ins appear here live.</p>
          ) : (
            <ul className="divide-y divide-paper-line" aria-live="polite">
              {recentList.map((a) => (
                <li key={a.registrationId} className="flex items-center gap-3 py-2">
                  <Avatar src={a.user.avatarUrl} name={a.user.name} size={32} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{a.user.name}</div>
                    <div className="text-xs text-ink-faint">{a.checkinMethod ? METHOD_LABEL[a.checkinMethod] : ''}</div>
                  </div>
                  <span className="shrink-0 text-xs tabular-nums text-ink-soft">{fmtTime(a.checkedInAt!)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {full && d && createPortal(
        <div role="dialog" aria-modal="true" aria-label="Check-in display" className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-3 overflow-auto bg-white p-6 text-center">
          <button type="button" autoFocus onClick={() => setFull(false)} className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-semibold text-ink-soft hover:bg-paper">
            <X className="h-5 w-5" aria-hidden /> Exit fullscreen
          </button>
          <h2 className="max-w-3xl text-2xl font-extrabold sm:text-4xl">{event.title}</h2>
          <p className="text-lg text-ink-soft">Open ServeConnect, tap Check in, and point your camera here</p>
          <img src={d.qr} alt="Check-in QR code" className={clsx('aspect-square w-[min(52vh,80vw)] rounded-2xl', !d.open && 'opacity-40')} />
          <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-2">
            <div>
              <div className="text-sm font-semibold text-ink-soft">Can't scan? Event code</div>
              <div className="font-mono text-5xl font-extrabold tracking-[0.3em] sm:text-6xl">{d.eventCode}</div>
            </div>
            <div>
              <div className="text-sm font-semibold text-ink-soft">Checked in</div>
              <div className="font-display text-5xl font-extrabold text-leaf-600 tabular-nums sm:text-6xl">{counts.attended}<span className="text-2xl text-ink-faint"> / {counts.registered}</span></div>
            </div>
          </div>
          {!d.open && <p className="font-semibold text-marigold-700">Check-in opens at {fmtTime(opensAt)}</p>}
          <p className="text-sm text-ink-faint">Code refreshes in {secsLeft}s</p>
        </div>,
        document.body,
      )}
    </div>
  );
}

// ───────────────────────── Attendees ─────────────────────────
function HoursModal({ attendee, eventId, defaultHours, onClose }: { attendee: Attendee; eventId: string; defaultHours: number; onClose: () => void }) {
  const qc = useQueryClient();
  const [h, setH] = useState(String(attendee.hours != null ? Number(attendee.hours) : defaultHours));
  const n = Number(h);
  const valid = h !== '' && !Number.isNaN(n) && n >= 0 && n <= 48;
  const m = useMutation({
    mutationFn: () => api(`/events/${eventId}/attendees/${attendee.user.id}`, { method: 'PATCH', body: { hours: n } }),
    onSuccess: () => { toast.success(`Hours updated for ${attendee.user.name}`); qc.invalidateQueries({ queryKey: ['attendees', eventId] }); onClose(); },
  });
  return (
    <Modal open onClose={onClose} title={`Hours for ${attendee.user.name}`} size="sm"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button disabled={!valid} loading={m.isPending} onClick={() => m.mutate()}>Save hours</Button></>}>
      <div className="space-y-3">
        <Input label="Verified volunteer hours" type="number" step={0.5} min={0} max={48} inputMode="decimal" value={h} onChange={(e) => setH(e.target.value)}
          error={!valid ? 'Enter 0–48 hours' : fieldError(m.error, 'hours')} hint={`The event runs ${fmtHours(defaultHours)} hours. Hours appear on the volunteer's certificate.`} />
        <FormError error={m.error} />
      </div>
    </Modal>
  );
}

function AttendeesPanel({ event }: { event: EventDetail }) {
  const qc = useQueryClient();
  const [confirm, confirmDialog] = useConfirm();
  const [q, setQ] = useState('');
  const dq = useDebounce(q.trim(), 300);
  const [skill, setSkill] = useState('');
  const [status, setStatus] = useState('');
  const [hoursFor, setHoursFor] = useState<Attendee | null>(null);
  const [exporting, setExporting] = useState(false);
  const owner = event.isOwner;
  const filters = { q: dq || undefined, skill: skill || undefined, status: status || undefined };
  const list = useQuery({
    queryKey: ['attendees', event.id, filters],
    queryFn: () => api<Attendee[]>(`/events/${event.id}/attendees`, { query: filters }),
    placeholderData: (prev) => prev,
  });

  const patch = useMutation({
    mutationFn: ({ a, status: s }: { a: Attendee; status: 'attended' | 'no_show' | 'registered' }) => api(`/events/${event.id}/attendees/${a.user.id}`, { method: 'PATCH', body: { status: s } }),
    onSuccess: (_r, { a, status: s }) => {
      toast.success(s === 'attended' ? `${a.user.name} marked as attended` : s === 'no_show' ? `${a.user.name} marked as a no-show` : `${a.user.name} moved off the waitlist`);
      qc.invalidateQueries({ queryKey: ['attendees', event.id] });
      qc.invalidateQueries({ queryKey: ['checkin-qr', event.id] });
    },
    onError: toastError,
  });
  const remove = useMutation({
    mutationFn: (a: Attendee) => api(`/events/${event.id}/attendees/${a.user.id}`, { method: 'DELETE' }),
    onSuccess: (_r, a) => { toast.success(`${a.user.name} was removed and notified`); qc.invalidateQueries({ queryKey: ['attendees', event.id] }); qc.invalidateQueries({ queryKey: ['teams', event.id] }); },
    onError: toastError,
  });

  const exportCsv = async () => {
    setExporting(true);
    try {
      await download(`/events/${event.id}/attendees.csv`, `attendees-${event.title.replace(/[^\w]+/g, '-').toLowerCase().slice(0, 40)}.csv`);
    } catch (e) {
      toastError(e);
    } finally {
      setExporting(false);
    }
  };

  const live = event.status === 'published';
  const rows = list.data ?? [];
  const busy = (a: Attendee) => (patch.isPending && patch.variables?.a.user.id === a.user.id) || (remove.isPending && remove.variables?.user.id === a.user.id);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-ink-faint" aria-hidden />
          <input type="search" className="input pl-10" placeholder="Search by name or username" aria-label="Search attendees" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="input w-auto" aria-label="Filter by skill" value={skill} onChange={(e) => setSkill(e.target.value)}>
          <option value="">Any skill</option>
          {Object.entries(SKILLS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <select className="input w-auto" aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="registered">Registered</option>
          <option value="waitlisted">Waitlisted</option>
          <option value="attended">Attended</option>
          <option value="no_show">No-show</option>
        </select>
        {owner && <Button variant="outline" icon={<Download className="h-4 w-4" />} loading={exporting} onClick={exportCsv}>Export CSV</Button>}
      </div>

      {list.isPending ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : list.isError ? <ErrorState error={list.error} retry={() => list.refetch()} /> : rows.length === 0 ? (
        <Card><EmptyState icon={<Users />} title={dq || skill || status ? 'Nobody matches these filters' : 'No registrations yet'} body={dq || skill || status ? 'Try clearing a filter.' : 'Share the event so volunteers can find it.'} /></Card>
      ) : (
        <div className="card overflow-hidden">
          <div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,1fr)_auto] gap-3 border-b border-paper-line bg-paper px-4 py-2 text-xs font-semibold text-ink-soft md:grid">
            <span>Volunteer</span><span>Status</span><span>Check-in</span><span className="text-right">Actions</span>
          </div>
          <ul className={clsx('divide-y divide-paper-line', list.isFetching && 'opacity-70')}>
            {rows.map((a) => (
              <li key={a.registrationId} className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,1fr)_auto] md:items-center">
                <div className="flex min-w-0 items-start gap-3">
                  <Avatar src={a.user.avatarUrl} name={a.user.name} size={40} />
                  <div className="min-w-0">
                    <Link to={`/u/${a.user.handle}`} className="block truncate font-semibold hover:underline">{a.user.name}</Link>
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {a.skills.slice(0, 3).map((s) => <Pill key={s}>{SKILLS[s] ?? s}</Pill>)}
                      {a.skills.length > 3 && <Pill>+{a.skills.length - 3}</Pill>}
                      {a.isMinor && <Pill tone="marigold">Under 18</Pill>}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-sm">
                  <RegStatusPill status={a.status} />
                  {a.team && <Pill tone="brand">{a.team.name}</Pill>}
                  {a.noShowCount > 0 && (
                    <Pill tone="blood" icon={<ShieldAlert className="h-3 w-3" />} className="cursor-help">
                      <span title="Private reliability metric: only organizers can see this">{plural(a.noShowCount, 'no-show')} overall</span>
                    </Pill>
                  )}
                </div>
                <div className="text-sm text-ink-soft">
                  {a.checkedInAt ? (
                    <>
                      <div className="font-medium text-ink">{fmtTime(a.checkedInAt)}</div>
                      <div className="text-xs">{a.checkinMethod ? METHOD_LABEL[a.checkinMethod] : ''}{a.hours != null && ` · ${fmtHours(a.hours)} h`}</div>
                    </>
                  ) : (
                    <span className="text-ink-faint">—</span>
                  )}
                </div>
                <div className="flex flex-wrap justify-start gap-1 md:justify-end">
                  {(a.status === 'registered' || (owner && a.status === 'no_show')) && (live || (owner && event.status === 'completed')) && (
                    <Button size="sm" variant="secondary" icon={<UserCheck className="h-4 w-4" />} disabled={busy(a)} onClick={() => patch.mutate({ a, status: 'attended' })}>
                      {a.status === 'registered' && live ? 'Check in' : 'Mark attended'}
                    </Button>
                  )}
                  {owner && a.status === 'waitlisted' && live && (
                    <Button size="sm" variant="ghost" disabled={busy(a)}
                      onClick={async () => { if (await confirm({ title: `Give ${a.user.name} a spot?`, body: 'This confirms their registration even if the event is at capacity.', confirmLabel: 'Confirm spot' })) patch.mutate({ a, status: 'registered' }); }}>
                      Confirm spot
                    </Button>
                  )}
                  {owner && (a.status === 'registered' || a.status === 'attended') && event.status !== 'cancelled' && (
                    <IconButton label={`Mark ${a.user.name} as no-show`} disabled={busy(a)} className="hover:text-blood-600"
                      onClick={async () => { if (await confirm({ title: `Mark ${a.user.name} as a no-show?`, body: 'No-shows are a private metric only organizers see. Their attendance and hours are cleared.', confirmLabel: 'Mark no-show', danger: true })) patch.mutate({ a, status: 'no_show' }); }}>
                      <UserX className="h-4 w-4" />
                    </IconButton>
                  )}
                  {owner && a.status === 'attended' && (
                    <IconButton label={`Set hours for ${a.user.name}`} onClick={() => setHoursFor(a)}><Clock className="h-4 w-4" /></IconButton>
                  )}
                  {owner && a.status !== 'attended' && event.status !== 'completed' && (
                    <IconButton label={`Remove ${a.user.name}`} disabled={busy(a)} className="hover:text-blood-600"
                      onClick={async () => { if (await confirm({ title: `Remove ${a.user.name}?`, body: 'Their registration is cancelled, they are notified, and the next person on the waitlist gets the spot.', confirmLabel: 'Remove', danger: true })) remove.mutate(a); }}>
                      <X className="h-4 w-4" />
                    </IconButton>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-sm text-ink-faint">{plural(rows.length, 'person', 'people')} shown. No-show history is private and visible only to organizers.</p>
      {hoursFor && <HoursModal attendee={hoursFor} eventId={event.id} defaultHours={event.hours} onClose={() => setHoursFor(null)} />}
      {confirmDialog}
    </div>
  );
}

// ───────────────────────── Analytics ─────────────────────────
function AnalyticsPanel({ event }: { event: EventDetail }) {
  const q = useQuery({ queryKey: ['event-analytics', event.id], queryFn: () => api<Analytics>(`/events/${event.id}/analytics`) });
  const timeline = useMemo(() => (q.data?.timeline ?? []).map((x) => ({ day: format(new Date(x.day), 'd MMM'), n: x.n })), [q.data]);
  const skills = useMemo(() => (q.data?.skills ?? []).map((x) => ({ skill: SKILLS[x.skill] ?? x.skill, n: x.n })), [q.data]);
  if (q.isPending) return <div className="grid gap-3 sm:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>;
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const a = q.data;
  const checkins = a.viaQr + a.viaManual;
  const tile = (value: React.ReactNode, label: string, tone?: 'brand' | 'marigold' | 'blood' | 'leaf', extra?: React.ReactNode) => (
    <Card className="p-4">{<Stat value={value} label={label} tone={tone} />}{extra}</Card>
  );
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tile(<>{a.registered}<span className="text-base text-ink-faint"> / {a.capacity}</span></>, 'Registered / capacity', 'brand', <div className="mt-2"><ProgressBar value={a.registered} max={a.capacity} /></div>)}
        {tile(a.attended, 'Attended', 'leaf')}
        {tile(a.noShows, 'No-shows', 'blood')}
        {tile(a.cancellations, 'Cancellations', 'marigold')}
        {tile(fmtHours(a.totalHours), 'Volunteer hours', 'brand')}
        {tile(a.waitlisted, 'On waitlist', 'marigold')}
        {tile(<>{a.viaQr}<span className="text-base text-ink-faint"> / {a.viaManual}</span></>, 'QR vs code check-ins', 'brand',
          checkins > 0 ? <div className="mt-1 text-xs text-ink-faint">{Math.round((a.viaQr / checkins) * 100)}% scanned the QR</div> : null)}
        {tile(a.rating.avg ? a.rating.avg.toFixed(1) : '—', a.rating.n ? `Rating · ${plural(a.rating.n, 'review')}` : 'No reviews yet', 'marigold',
          a.rating.avg ? <div className="mt-1"><Stars value={a.rating.avg} size={14} /></div> : null)}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="text-base font-bold">Registrations per day</h2>
          <p className="mb-3 text-sm text-ink-soft">New sign-ups, including those later cancelled</p>
          {timeline.length === 0 ? <p className="py-10 text-center text-sm text-ink-faint">No registrations yet.</p> : (
            <div className="h-56" role="img" aria-label={`Registrations per day: ${timeline.map((t) => `${t.day} ${t.n}`).join(', ')}`}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={timeline} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={CHART.grid} />
                  <XAxis dataKey="day" tick={{ fontSize: 12, fill: CHART.axis }} tickLine={false} axisLine={{ stroke: CHART.grid }} minTickGap={8} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: CHART.axis }} tickLine={false} axisLine={false} />
                  <Tooltip cursor={{ fill: 'rgba(62,75,180,0.06)' }} content={<ChartTooltip />} />
                  <Bar dataKey="n" name="Registrations" fill={CHART.primary} radius={[4, 4, 0, 0]} maxBarSize={36} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
        <Card>
          <h2 className="text-base font-bold">Skills on the roster</h2>
          <p className="mb-3 text-sm text-ink-soft">Top skills among registered volunteers</p>
          {skills.length === 0 ? <p className="py-10 text-center text-sm text-ink-faint">No skills data yet.</p> : (
            <div style={{ height: Math.max(160, skills.length * 30 + 20) }} role="img" aria-label={`Skills: ${skills.map((s) => `${s.skill} ${s.n}`).join(', ')}`}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={skills} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid horizontal={false} stroke={CHART.grid} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: CHART.axis }} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="skill" width={110} tick={{ fontSize: 12, fill: '#4A5468' }} tickLine={false} axisLine={false} />
                  <Tooltip cursor={{ fill: 'rgba(62,75,180,0.06)' }} content={<ChartTooltip />} />
                  <Bar dataKey="n" name="Volunteers" fill={CHART.primary} radius={[0, 4, 4, 0]} maxBarSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

// ───────────────────────── Page ─────────────────────────
export default function EventManage() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [confirm, confirmDialog] = useConfirm();
  const ev = useQuery({ queryKey: ['event', id], queryFn: () => api<EventDetail>(`/events/${id}`) });
  const complete = useMutation({
    mutationFn: () => api(`/events/${id}/complete`, { method: 'POST' }),
    onSuccess: () => {
      toast.success('Event marked complete. Certificates are being issued to verified attendees.');
      qc.invalidateQueries({ queryKey: ['event', id] });
      qc.invalidateQueries({ queryKey: ['attendees', id] });
      qc.invalidateQueries({ queryKey: ['event-analytics', id] });
    },
    onError: toastError,
  });

  if (ev.isPending) return <PageLoader />;
  if (ev.isError) return <ErrorState error={ev.error} retry={() => ev.refetch()} />;
  const e = ev.data;
  if (!e.isOwner && !e.isTeamLead) {
    return <EmptyState icon={<ShieldAlert />} title="You can't manage this event" body="Only the organizer and team leads can open this page." action={<ButtonLink to={`/events/${id}`} variant="outline">View event</ButtonLink>} />;
  }

  const tabs: { id: TabId; label: string }[] = [
    { id: 'checkin', label: t('manage.checkin', 'Check-in console') },
    { id: 'attendees', label: t('manage.attendees', 'Attendees') },
    ...(e.isOwner ? [{ id: 'teams' as TabId, label: t('manage.teams', 'Teams') }, { id: 'analytics' as TabId, label: t('manage.analytics', 'Analytics') }] : []),
  ];
  const req = params.get('tab') as TabId | null;
  const tab: TabId = req && tabs.some((x) => x.id === req) ? req : e.status === 'completed' ? (e.isOwner ? 'analytics' : 'attendees') : 'checkin';
  const setTab = (v: TabId) => { const p = new URLSearchParams(params); p.set('tab', v); setParams(p, { replace: true }); };
  const started = Date.now() >= new Date(e.startAt).getTime();

  return (
    <div>
      <PageHeader
        back={`/events/${e.id}`}
        title={e.title}
        subtitle={<span className="inline-flex flex-wrap items-center gap-2">{relDay(e.startAt)} <EventStatusPill status={e.status} />{!e.isOwner && <Pill tone="marigold">Team lead</Pill>}</span>}
        actions={
          <>
            <ButtonLink to={`/events/${e.id}`} variant="ghost" icon={<Eye className="h-4 w-4" />}>View public page</ButtonLink>
            {e.isOwner && !['completed', 'cancelled'].includes(e.status) && (
              <ButtonLink to={`/events/${e.id}/edit`} variant="outline" icon={<Pencil className="h-4 w-4" />}>Edit</ButtonLink>
            )}
            {e.isOwner && e.status === 'published' && started && (
              <Button icon={<CheckCircle2 className="h-4 w-4" />} loading={complete.isPending}
                onClick={async () => {
                  if (await confirm({ title: 'Mark this event complete?', body: `${e.counts.registered - e.counts.attended} volunteer(s) not checked in will be marked as no-shows, the waitlist closes, and certificates are issued to the ${e.counts.attended} verified attendee(s). This cannot be undone.`, confirmLabel: 'Complete event' })) complete.mutate();
                }}>
                Complete event
              </Button>
            )}
          </>
        }
      />
      {user && e.isOwner && e.status === 'draft' && (
        <div className="mb-4"><Notice tone="neutral" title="This event is still a draft" action={<ButtonLink size="sm" variant="outline" to={`/events/${e.id}`} icon={<ExternalLink className="h-4 w-4" />}>Publish from event page</ButtonLink>}>Volunteers can't register until it's published.</Notice></div>
      )}
      <Tabs tabs={tabs} value={tab} onChange={setTab} className="mb-5" />
      <div role="tabpanel" aria-label={tabs.find((x) => x.id === tab)?.label}>
        {tab === 'checkin' && <CheckinConsole event={e} />}
        {tab === 'attendees' && <AttendeesPanel event={e} />}
        {tab === 'teams' && e.isOwner && <TeamsPanel event={e} />}
        {tab === 'analytics' && e.isOwner && <AnalyticsPanel event={e} />}
      </div>
      {confirmDialog}
    </div>
  );
}
