import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { isToday } from 'date-fns';
import { AlertCircle, CheckCircle2, KeyRound, QrCode, Ticket } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { fmtRange, fmtTime } from '../../lib/format';
import type { EventCard as EventCardT } from '../../lib/types';
import { QRScanner } from '../../components/QRScanner';
import { Button, ButtonLink, Card, FormError, PageHeader, Select, Skeleton, Spinner, fieldError } from '../../components/ui';
import type { RegStatus } from '../../components/EventsKit';

type VolEvent = EventCardT & { myStatus: RegStatus; checkinCode: string; checkedInAt: string | null };
interface CheckinResult { ok: true; checkedInAt: string; title: string }
interface Done { eventId: string; title: string; at: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Extracts {eventId, token} from a scanned check-in URL like https://…/checkin/<eventId>?t=<token>. */
function parseCheckinUrl(text: string): { eventId: string; token: string } | null {
  try {
    const u = new URL(text.trim(), window.location.origin);
    const m = u.pathname.match(/\/checkin\/([^/?#]+)\/?$/);
    const token = u.searchParams.get('t');
    if (!m || !token || !UUID.test(m[1])) return null;
    return { eventId: m[1], token };
  } catch {
    return null;
  }
}

function SuccessPanel({ done, onAnother }: { done: Done; onAnother?: () => void }) {
  return (
    <Card className="flex flex-col items-center px-6 py-10 text-center" role="status" aria-live="polite">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-leaf-50">
        <CheckCircle2 className="h-9 w-9 text-leaf-600" aria-hidden />
      </div>
      <h2 className="mt-4 text-2xl font-extrabold">You're checked in</h2>
      <p className="mt-1 max-w-md text-ink-soft">
        Checked in to <span className="font-semibold text-ink">{done.title}</span> at {fmtTime(done.at)}. Your hours count once the organizer completes the event.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <ButtonLink to={`/events/${done.eventId}`}>View event</ButtonLink>
        <ButtonLink to="/events/mine" variant="outline">My events</ButtonLink>
        {onAnother && <Button variant="ghost" onClick={onAnother}>Check in to another event</Button>}
      </div>
    </Card>
  );
}

function ErrorPanel({ error, eventId }: { error: unknown; eventId: string }) {
  const dup = error instanceof ApiError && error.code === 'duplicate_checkin';
  if (dup) {
    return (
      <Card className="flex flex-col items-center px-6 py-10 text-center" role="status">
        <CheckCircle2 className="h-12 w-12 text-leaf-600" aria-hidden />
        <h2 className="mt-3 text-2xl font-extrabold">You're already checked in</h2>
        <p className="mt-1 text-ink-soft">Check-in only counts once per event, so there's nothing more to do.</p>
        <ButtonLink className="mt-6" to={`/events/${eventId}`}>View event</ButtonLink>
      </Card>
    );
  }
  return (
    <Card className="flex flex-col items-center px-6 py-10 text-center" role="alert">
      <AlertCircle className="h-12 w-12 text-blood-500" aria-hidden />
      <h2 className="mt-3 text-2xl font-extrabold">Check-in didn't go through</h2>
      <p className="mt-1 max-w-md text-ink-soft">{error instanceof Error ? error.message : 'Something went wrong.'}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <ButtonLink to="/scan" icon={<QrCode className="h-4 w-4" />}>Scan again</ButtonLink>
        <ButtonLink to={`/checkin/${eventId}`} variant="outline" icon={<KeyRound className="h-4 w-4" />}>Enter event code instead</ButtonLink>
      </div>
    </Card>
  );
}

/** /checkin/:eventId?t=TOKEN — opened from the camera app; checks in immediately. */
function TokenCheckin({ eventId, token }: { eventId: string; token: string }) {
  const qc = useQueryClient();
  const fired = useRef(false);
  const m = useMutation({
    mutationFn: () => api<CheckinResult>(`/events/${eventId}/checkin`, { body: { token } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['events', 'mine'] });
      qc.invalidateQueries({ queryKey: ['event', eventId], exact: true });
    },
  });
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    m.mutate();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Check in" />
      {m.isSuccess ? (
        <SuccessPanel done={{ eventId, title: m.data.title, at: m.data.checkedInAt }} />
      ) : m.isError ? (
        <ErrorPanel error={m.error} eventId={eventId} />
      ) : (
        <Card className="flex flex-col items-center px-6 py-14 text-center" aria-busy="true">
          <Spinner className="h-8 w-8" />
          <p className="mt-3 font-semibold">Checking you in…</p>
        </Card>
      )}
    </div>
  );
}

/** /scan (and /checkin/:eventId without a token): camera scanner plus event-code fallback. */
function ScanCheckin({ presetEventId }: { presetEventId?: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [mode, setMode] = useState<'scan' | 'code'>(presetEventId ? 'code' : 'scan');
  const [done, setDone] = useState<Done | null>(null);
  const [eventId, setEventId] = useState(presetEventId ?? '');
  const [code, setCode] = useState('');

  const mine = useQuery({ queryKey: ['events', 'mine', 'volunteer'], queryFn: () => api<VolEvent[]>('/events/mine', { query: { as: 'volunteer' } }) });
  const { eligible, today } = useMemo(() => {
    const now = Date.now();
    const all = (mine.data ?? []).filter((e) => e.myStatus === 'registered' && e.status === 'published' && new Date(e.endAt).getTime() > now);
    all.sort((a, b) => a.startAt.localeCompare(b.startAt));
    const td = all.filter((e) => isToday(new Date(e.startAt)) || (now >= new Date(e.startAt).getTime() && now <= new Date(e.endAt).getTime()));
    return { eligible: all, today: td };
  }, [mine.data]);

  useEffect(() => {
    if (eligible.length && !eligible.some((e) => e.id === eventId)) setEventId((today[0] ?? eligible[0]).id);
  }, [eligible, today, eventId]);

  const m = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { token?: string; eventCode?: string } }) => api<CheckinResult>(`/events/${id}/checkin`, { body }).then((r) => ({ ...r, id })),
    onSuccess: (r) => {
      setDone({ eventId: r.id, title: r.title, at: r.checkedInAt });
      setCode('');
      qc.invalidateQueries({ queryKey: ['events', 'mine'] });
      qc.invalidateQueries({ queryKey: ['event', r.id], exact: true });
    },
    onError: (e, v) => {
      if (e instanceof ApiError && e.code === 'duplicate_checkin') {
        toast.success("You're already checked in to this event.");
        return;
      }
      if (v.body.token) toast.error(e.message);
    },
  });

  const onScan = (text: string) => {
    if (m.isPending) return;
    const parsed = parseCheckinUrl(text);
    if (!parsed) {
      toast.error("That isn't a ServeConnect check-in code. Scan the QR shown by the organizer.", { id: 'bad-qr' });
      return;
    }
    m.mutate({ id: parsed.eventId, body: { token: parsed.token } });
  };

  const submitCode = (e: FormEvent) => {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (!eventId || c.length !== 6) return;
    m.mutate({ id: eventId, body: { eventCode: c } });
  };

  if (done) {
    return (
      <div className="mx-auto max-w-xl">
        <PageHeader title="Check in" />
        <SuccessPanel done={done} onAnother={() => { setDone(null); m.reset(); }} />
      </div>
    );
  }

  const codeError = m.variables?.body.eventCode && m.isError && !(m.error instanceof ApiError && m.error.code === 'duplicate_checkin') ? m.error : null;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={t('checkin.title', 'Check in')} subtitle="Scan the organizer's QR code when you arrive. Check-in opens 1 hour before the event starts." />
      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <div className="inline-flex rounded-xl border border-paper-line bg-white p-0.5" role="tablist" aria-label="Check-in method">
            {([['scan', 'Scan QR code', QrCode], ['code', 'Enter event code', KeyRound]] as const).map(([k, l, Icon]) => (
              <button key={k} type="button" role="tab" aria-selected={mode === k} onClick={() => setMode(k)}
                className={clsx('inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold', mode === k ? 'bg-brand-50 text-brand-700' : 'text-ink-soft hover:text-ink')}>
                <Icon className="h-4 w-4" aria-hidden /> {l}
              </button>
            ))}
          </div>

          {mode === 'scan' ? (
            <Card className="space-y-3">
              <div className="relative mx-auto w-full max-w-md">
                <QRScanner onScan={onScan} paused={m.isPending} />
                {m.isPending && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-ink/70 text-white" aria-live="polite">
                    <Spinner className="h-8 w-8 text-white" />
                    <span className="mt-2 font-semibold">Checking you in…</span>
                  </div>
                )}
              </div>
              <p className="text-center text-sm text-ink-soft">Point your camera at the QR code. It refreshes every minute, so scan the one on screen right now.</p>
              {m.isError && m.variables?.body.token && !(m.error instanceof ApiError && m.error.code === 'duplicate_checkin') && <FormError error={m.error} />}
            </Card>
          ) : (
            <Card>
              {mine.isPending ? <Skeleton className="h-40 w-full" /> : eligible.length === 0 ? (
                <div className="py-6 text-center">
                  <Ticket className="mx-auto h-10 w-10 text-ink-faint" aria-hidden />
                  <h2 className="mt-2 text-lg font-bold">No upcoming registrations</h2>
                  <p className="mt-1 text-ink-soft">You can only check in to events you're registered for.</p>
                  <ButtonLink to="/events" className="mt-4" variant="outline">Find events</ButtonLink>
                </div>
              ) : (
                <form onSubmit={submitCode} className="space-y-4">
                  <Select
                    label="Event"
                    value={eventId}
                    onChange={(e) => { setEventId(e.target.value); m.reset(); }}
                    options={eligible.map((e) => [e.id, `${e.title} · ${fmtRange(e.startAt, e.endAt)}`] as [string, string])}
                  />
                  <div className="space-y-1.5">
                    <label htmlFor="event-code" className="block text-sm font-semibold">Event code</label>
                    <input
                      id="event-code"
                      className={clsx('input text-center font-mono text-2xl uppercase tracking-[0.4em]', codeError && 'input-error')}
                      inputMode="text"
                      autoComplete="off"
                      autoCapitalize="characters"
                      spellCheck={false}
                      maxLength={6}
                      placeholder="••••••"
                      value={code}
                      onChange={(e) => { setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')); if (m.isError) m.reset(); }}
                      aria-describedby="event-code-hint"
                    />
                    <p id="event-code-hint" className="text-sm text-ink-faint">The 6-character code shown under the organizer's QR code.</p>
                  </div>
                  {codeError && <FormError error={fieldError(codeError, 'eventCode') ?? codeError} />}
                  <Button type="submit" block size="lg" loading={m.isPending} disabled={!eventId || code.length !== 6}>Check in</Button>
                </form>
              )}
            </Card>
          )}
        </div>

        <aside className="space-y-3">
          <Card>
            <h2 className="text-base font-bold">Your check-in codes</h2>
            <p className="mb-3 text-sm text-ink-soft">Show this code to the organizer if you can't scan.</p>
            {mine.isPending ? <Skeleton className="h-20 w-full" /> : mine.isError ? (
              <p className="text-sm text-blood-600">Couldn't load your events. <button type="button" className="link" onClick={() => mine.refetch()}>Try again</button></p>
            ) : today.length === 0 ? (
              <p className="text-sm text-ink-faint">You have no events today.{eligible.length > 0 && ' Codes for later events are on each event page.'}</p>
            ) : (
              <ul className="space-y-2">
                {today.map((e) => (
                  <li key={e.id} className="rounded-xl border border-dashed border-brand-300 bg-brand-50 p-3">
                    <Link to={`/events/${e.id}`} className="block truncate text-sm font-semibold hover:underline">{e.title}</Link>
                    <div className="text-xs text-ink-soft">{fmtTime(e.startAt)} – {fmtTime(e.endAt)}</div>
                    <div className="mt-1 font-mono text-2xl font-bold tracking-[0.25em] text-brand-800" aria-label={`Code ${e.checkinCode.split('').join(' ')}`}>{e.checkinCode}</div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}

export default function CheckIn() {
  const { eventId } = useParams();
  const [params] = useSearchParams();
  const token = params.get('t');
  if (eventId && token) return <TokenCheckin key={`${eventId}:${token}`} eventId={eventId} token={token} />;
  return <ScanCheckin key={eventId ?? 'scan'} presetEventId={eventId && UUID.test(eventId) ? eventId : undefined} />;
}
