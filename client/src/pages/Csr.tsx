/* CSR company console: employee roster via invite code, bulk event registration and an impact report. */
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CalendarCheck, CalendarDays, Copy, Download, KeyRound, RefreshCw, Search, Trash2, UserPlus, Users } from 'lucide-react';
import { api, download } from '../lib/api';
import { EVENT_CATEGORIES, SKILLS } from '../lib/constants';
import { useDebounce } from '../lib/hooks';
import { fmtDate, fmtShort, hours as fmtHours, plural, relDay } from '../lib/format';
import type { EventCard, UserCard } from '../lib/types';
import { spotsText } from '../components/EventCard';
import {
  Button, ButtonLink, Card, EmptyState, ErrorState, FormError, IconButton, Notice, PageHeader, Pill, Skeleton, Stat, Tabs, UserLine, toastError, useConfirm,
} from '../components/ui';

interface Member extends UserCard { joinedAt: string; skills: string[]; hours: number; events: number }
interface Roster { inviteCode: string | null; members: Member[] }
interface Impact {
  summary: { participants: number; participations: number; hours: number; events: number; organizations: number };
  byMonth: { month: string; hours: number; participations: number }[];
  byCategory: { category: string; hours: number }[];
  byEvent: { id: string; title: string; startAt: string; organizer: string; employees: number; hours: number }[];
}
type TabId = 'impact' | 'team' | 'register';

const BRAND = '#3E4BB4';
const monthLabel = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
};
/** Fills gaps so months without activity show as zero instead of disappearing. */
function continuousMonths(rows: Impact['byMonth']) {
  if (!rows.length) return [];
  const map = new Map(rows.map((r) => [r.month, r]));
  const [y0, m0] = rows[0].month.split('-').map(Number);
  const last = rows[rows.length - 1].month;
  const out: { month: string; label: string; hours: number; participations: number }[] = [];
  for (let i = 0; i < 36; i++) {
    const d = new Date(y0, m0 - 1 + i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const r = map.get(key);
    out.push({ month: key, label: monthLabel(key), hours: r?.hours ?? 0, participations: r?.participations ?? 0 });
    if (key === last) break;
  }
  return out;
}

// ───────────────────────── impact ─────────────────────────
function ImpactTab() {
  const q = useQuery({ queryKey: ['csr-impact'], queryFn: () => api<Impact>('/csr/impact') });
  const [dl, setDl] = useState(false);
  const months = useMemo(() => continuousMonths(q.data?.byMonth ?? []), [q.data]);
  if (q.isPending) return <div className="space-y-4"><Skeleton className="h-24 w-full rounded-2xl" /><Skeleton className="h-72 w-full rounded-2xl" /></div>;
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const { summary, byCategory, byEvent } = q.data;
  const maxCat = Math.max(1, ...byCategory.map((c) => c.hours));
  const csv = async () => {
    setDl(true);
    try { await download('/csr/impact.csv', 'csr-impact-report.csv'); } catch (e) { toastError(e); } finally { setDl(false); }
  };

  if (summary.participations === 0) {
    return (
      <Card>
        <EmptyState
          icon={<CalendarCheck />}
          title="No verified volunteering yet"
          body="Once your employees check in at events and organizers confirm attendance, hours and impact show up here."
          action={<ButtonLink to="/csr?tab=register" variant="outline">Register employees for an event</ButtonLink>}
        />
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-soft">All figures count only attendance confirmed by organizers.</p>
        <Button variant="outline" size="sm" icon={<Download className="h-4 w-4" />} loading={dl} onClick={csv}>Download CSV</Button>
      </div>

      <Card>
        <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 lg:grid-cols-5">
          <div className="col-span-2 flex items-center gap-4 sm:col-span-1">
            <div className="stamp h-20 w-20 shrink-0 text-center" role="img" aria-label={`${fmtHours(summary.hours)} verified hours`}>
              <span className="text-2xl leading-none">{fmtHours(summary.hours)}</span>
              <span className="text-[11px]">hours</span>
            </div>
            <div className="text-sm text-ink-soft">verified service hours</div>
          </div>
          <Stat value={summary.participants} label="Employees took part" />
          <Stat value={summary.participations} label="Volunteer shifts" tone="leaf" />
          <Stat value={summary.events} label="Events" tone="marigold" />
          <Stat value={summary.organizations} label="NGOs supported" />
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <Card>
          <h2 className="text-base font-bold">Verified hours by month</h2>
          <p className="mb-3 text-sm text-ink-faint">Hours logged at events, by the month the event took place.</p>
          <div className="h-64" aria-hidden>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={months} margin={{ top: 8, right: 4, left: -16, bottom: 0 }} barCategoryGap="28%">
                <CartesianGrid vertical={false} stroke="#E3E6EC" />
                <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: '#E3E6EC' }} tick={{ fill: '#7A8396', fontSize: 12 }} interval="preserveStartEnd" />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: '#7A8396', fontSize: 12 }} width={44} />
                <Tooltip
                  cursor={{ fill: 'rgba(62,75,180,0.06)' }}
                  contentStyle={{ borderRadius: 12, border: '1px solid #E3E6EC', boxShadow: '0 4px 14px rgba(27,35,51,.08)', fontFamily: 'inherit' }}
                  formatter={(v: number, _n, p: any) => [`${fmtHours(v)} hours · ${plural(p?.payload?.participations ?? 0, 'shift')}`, '']}
                  separator=""
                  labelStyle={{ fontWeight: 700, color: '#1B2333' }}
                />
                <Bar dataKey="hours" fill={BRAND} radius={[4, 4, 0, 0]} maxBarSize={44} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <table className="sr-only">
            <caption>Verified hours by month</caption>
            <thead><tr><th>Month</th><th>Hours</th><th>Shifts</th></tr></thead>
            <tbody>{months.map((m) => <tr key={m.month}><td>{m.label}</td><td>{m.hours}</td><td>{m.participations}</td></tr>)}</tbody>
          </table>
        </Card>

        <Card>
          <h2 className="mb-3 text-base font-bold">Hours by cause</h2>
          <ul className="space-y-3">
            {byCategory.map((c) => {
              const cat = EVENT_CATEGORIES[c.category] ?? EVENT_CATEGORIES.other;
              return (
                <li key={c.category}>
                  <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                    <span className="truncate"><span aria-hidden>{cat.emoji}</span> {cat.label}</span>
                    <span className="shrink-0 font-semibold tabular-nums">{fmtHours(c.hours)} h</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-paper-line" aria-hidden>
                    <div className="h-full rounded-full bg-brand-500" style={{ width: `${(c.hours / maxCat) * 100}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      <Card padded={false}>
        <h2 className="border-b border-paper-line px-4 py-3 text-base font-bold sm:px-5">By event</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-paper/70 text-ink-soft">
              <tr>
                <th scope="col" className="px-4 py-2 font-semibold sm:px-5">Event</th>
                <th scope="col" className="px-3 py-2 font-semibold">Date</th>
                <th scope="col" className="px-3 py-2 font-semibold">Organizer</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">Employees</th>
                <th scope="col" className="px-4 py-2 text-right font-semibold sm:px-5">Hours</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-paper-line">
              {byEvent.map((e) => (
                <tr key={e.id}>
                  <td className="max-w-[260px] px-4 py-2.5 sm:px-5"><Link to={`/events/${e.id}`} className="line-clamp-2 font-semibold hover:underline">{e.title}</Link></td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-ink-soft">{fmtShort(e.startAt)}</td>
                  <td className="px-3 py-2.5 text-ink-soft">{e.organizer}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{e.employees}</td>
                  <td className="px-4 py-2.5 text-right font-semibold tabular-nums sm:px-5">{fmtHours(e.hours)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ───────────────────────── team ─────────────────────────
function InviteCard({ code }: { code: string | null }) {
  const qc = useQueryClient();
  const [confirm, dialog] = useConfirm();
  const rotate = useMutation({
    mutationFn: () => api<{ inviteCode: string }>('/csr/invite-code/rotate', { method: 'POST' }),
    onSuccess: (r) => {
      qc.setQueryData<Roster>(['csr-members'], (old) => (old ? { ...old, inviteCode: r.inviteCode } : old));
      toast.success('New invite code created. The old one no longer works.');
    },
    onError: toastError,
  });
  const copy = async (text: string, what: string) => {
    try { await navigator.clipboard.writeText(text); toast.success(`${what} copied.`); } catch { toast.error("Couldn't copy. Select the text and copy it manually."); }
  };
  const message = code ? `Join our company volunteering team on ServeConnect: sign in at ${window.location.origin}, open Settings → Company and enter the code ${code}.` : '';
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2">
        <KeyRound className="h-5 w-5 text-brand-500" aria-hidden />
        <h2 className="text-base font-bold">Invite employees</h2>
      </div>
      {code ? (
        <>
          <div className="flex items-center gap-2 rounded-xl border border-dashed border-brand-300 bg-brand-50 px-3 py-2">
            <span className="flex-1 font-mono text-2xl font-bold tracking-[0.2em] text-brand-700" aria-label={`Invite code ${code.split('').join(' ')}`}>{code}</span>
            <IconButton label="Copy invite code" onClick={() => copy(code, 'Invite code')}><Copy className="h-5 w-5" /></IconButton>
          </div>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-soft">
            <li>Employees sign up or sign in to ServeConnect.</li>
            <li>They open <strong className="text-ink">Settings → Company</strong> and enter this code.</li>
            <li>They appear in your roster and their verified hours count toward your report.</li>
          </ol>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" icon={<Copy className="h-4 w-4" />} onClick={() => copy(message, 'Invite message')}>Copy invite message</Button>
            <Button
              size="sm"
              variant="ghost"
              icon={<RefreshCw className="h-4 w-4" />}
              loading={rotate.isPending}
              onClick={async () => {
                if (await confirm({ title: 'Create a new invite code?', body: 'The current code stops working immediately. Employees who already joined stay on your team.', confirmLabel: 'Rotate code' })) rotate.mutate();
              }}
            >
              Rotate code
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-ink-soft">You don't have an invite code yet. Create one to let employees join your company team.</p>
          <Button size="sm" loading={rotate.isPending} onClick={() => rotate.mutate()}>Create invite code</Button>
        </>
      )}
      {dialog}
    </Card>
  );
}

function TeamTab({ roster }: { roster: ReturnType<typeof useRoster> }) {
  const qc = useQueryClient();
  const [confirm, dialog] = useConfirm();
  const [filter, setFilter] = useState('');
  const remove = useMutation({
    mutationFn: (id: string) => api(`/csr/members/${id}`, { method: 'DELETE' }),
    onSuccess: (_d, id) => {
      qc.setQueryData<Roster>(['csr-members'], (old) => (old ? { ...old, members: old.members.filter((m) => m.id !== id) } : old));
      qc.invalidateQueries({ queryKey: ['csr-impact'] });
      toast.success('Removed from your company team.');
    },
    onError: toastError,
  });
  if (roster.isPending) return <Skeleton className="h-72 w-full rounded-2xl" />;
  if (roster.isError) return <ErrorState error={roster.error} retry={() => roster.refetch()} />;
  const { members, inviteCode } = roster.data;
  const f = filter.trim().toLowerCase();
  const shown = f ? members.filter((m) => m.name.toLowerCase().includes(f) || m.skills.some((s) => (SKILLS[s] ?? s).toLowerCase().includes(f))) : members;

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <Card padded={false} className="min-w-0">
        <div className="flex flex-wrap items-center gap-3 border-b border-paper-line px-4 py-3 sm:px-5">
          <h2 className="text-base font-bold">Employees</h2>
          <span className="rounded-full bg-paper px-2 text-xs font-semibold text-ink-soft">{members.length}</span>
          {members.length > 6 && (
            <div className="relative ml-auto w-full sm:w-56">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-ink-faint" aria-hidden />
              <input type="search" className="input py-2 pl-9 text-sm" placeholder="Filter by name or skill" aria-label="Filter employees" value={filter} onChange={(e) => setFilter(e.target.value)} />
            </div>
          )}
        </div>
        {members.length === 0 ? (
          <EmptyState icon={<Users />} title="No employees yet" body="Share your invite code. People who enter it in Settings → Company appear here." />
        ) : shown.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-ink-faint">Nobody matches "{filter}".</p>
        ) : (
          <ul className="divide-y divide-paper-line">
            {shown.map((m) => (
              <li key={m.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] sm:items-center sm:px-5">
                <UserLine user={m} sub={`Joined ${fmtShort(m.joinedAt)}`} size={36} />
                <div className="flex flex-wrap gap-1">
                  {m.skills.slice(0, 3).map((s) => <Pill key={s} tone="brand">{SKILLS[s] ?? s}</Pill>)}
                  {m.skills.length > 3 && <Pill>+{m.skills.length - 3}</Pill>}
                  {m.skills.length === 0 && <span className="text-sm text-ink-faint">No skills listed</span>}
                </div>
                <div className="flex items-center justify-between gap-4 sm:justify-end">
                  <span className="text-sm text-ink-soft"><strong className="font-display text-base text-ink">{fmtHours(m.hours)}</strong> h · {plural(m.events, 'event')}</span>
                  <IconButton
                    label={`Remove ${m.name}`}
                    className="hover:text-blood-600"
                    disabled={remove.isPending && remove.variables === m.id}
                    onClick={async () => {
                      if (await confirm({ title: `Remove ${m.name}?`, body: 'They leave your company team. Their past hours stop counting in your impact report. They can rejoin with the invite code.', confirmLabel: 'Remove', danger: true })) remove.mutate(m.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </IconButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <aside><InviteCard code={inviteCode} /></aside>
      {dialog}
    </div>
  );
}

// ───────────────────────── bulk registration ─────────────────────────
function RegisterTab({ roster }: { roster: ReturnType<typeof useRoster> }) {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const dq = useDebounce(q.trim(), 350);
  const [event, setEvent] = useState<EventCard | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<{ registered: number; waitlisted: number; skipped: number; title: string } | null>(null);
  const events = useQuery({
    queryKey: ['csr-events', dq],
    queryFn: () => api<{ items: EventCard[]; hasMore: boolean }>('/events', { query: { when: 'upcoming', q: dq || undefined, limit: 8 } }),
  });
  const m = useMutation({
    mutationFn: () => api<{ registered: number; waitlisted: number; skipped: number }>(`/csr/events/${event!.id}/bulk-register`, { body: { userIds: [...selected] } }),
    onSuccess: (r) => {
      setResult({ ...r, title: event!.title });
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ['csr-events'] });
      qc.invalidateQueries({ queryKey: ['events'] });
    },
  });

  if (roster.isPending) return <Skeleton className="h-72 w-full rounded-2xl" />;
  if (roster.isError) return <ErrorState error={roster.error} retry={() => roster.refetch()} />;
  const members = roster.data.members;
  const allOn = members.length > 0 && selected.size === members.length;
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div className="space-y-4">
      {result && (
        <Notice tone={result.registered + result.waitlisted > 0 ? 'leaf' : 'marigold'} title={`Registration for "${result.title}" done`}
          action={<Button size="sm" variant="ghost" onClick={() => setResult(null)}>Dismiss</Button>}>
          {plural(result.registered, 'employee')} registered{result.waitlisted ? `, ${result.waitlisted} on the waitlist` : ''}{result.skipped ? `, ${result.skipped} skipped (already registered, or a minor without guardian consent)` : ''}. Everyone registered has been notified with their check-in code.
        </Notice>
      )}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="min-w-0 space-y-3">
          <h2 className="text-base font-bold">1. Choose an upcoming event</h2>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-ink-faint" aria-hidden />
            <input type="search" className="input pl-10" placeholder="Search events or organizers" aria-label="Search events" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {events.isPending ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
          ) : events.isError ? (
            <ErrorState error={events.error} retry={() => events.refetch()} />
          ) : events.data.items.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-faint">No upcoming events match "{q}".</p>
          ) : (
            <ul role="radiogroup" aria-label="Upcoming events" className="max-h-[420px] space-y-1.5 overflow-y-auto">
              {events.data.items.map((e) => {
                const on = event?.id === e.id;
                const cat = EVENT_CATEGORIES[e.category] ?? EVENT_CATEGORIES.other;
                return (
                  <li key={e.id}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setEvent(e)}
                      className={clsx('flex w-full items-start gap-3 rounded-xl border p-3 text-left transition', on ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500' : 'border-paper-line hover:bg-paper')}
                    >
                      <span className="text-2xl" aria-hidden>{cat.emoji}</span>
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-2 font-semibold leading-snug">{e.title}</span>
                        <span className="block text-sm text-ink-soft">{relDay(e.startAt)} · {e.organizer.name}</span>
                        <span className="block text-xs text-ink-faint">{spotsText(e)}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card padded={false} className="flex min-w-0 flex-col">
          <div className="space-y-1 border-b border-paper-line px-4 py-3 sm:px-5">
            <h2 className="text-base font-bold">2. Select employees</h2>
            {event ? (
              <p className="text-sm text-ink-soft">For <strong className="text-ink">{event.title}</strong> · {fmtDate(event.startAt)} · {spotsText(event)}</p>
            ) : (
              <p className="text-sm text-ink-faint">Pick an event first.</p>
            )}
          </div>
          {members.length === 0 ? (
            <EmptyState icon={<UserPlus />} title="No employees to register" body="Invite your team with the company code first." action={<ButtonLink to="/csr?tab=team" variant="outline" size="sm">Invite employees</ButtonLink>} />
          ) : (
            <>
              <label className="flex cursor-pointer items-center gap-3 border-b border-paper-line px-4 py-2.5 text-sm font-semibold sm:px-5">
                <input type="checkbox" className="h-5 w-5 rounded border-paper-line text-brand-600" checked={allOn}
                  ref={(el) => { if (el) el.indeterminate = selected.size > 0 && !allOn; }}
                  onChange={() => setSelected(allOn ? new Set() : new Set(members.map((x) => x.id)))} />
                Select all ({members.length})
              </label>
              <ul className="max-h-[360px] flex-1 divide-y divide-paper-line overflow-y-auto">
                {members.map((u) => (
                  <li key={u.id}>
                    <label className="flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-paper sm:px-5">
                      <input type="checkbox" className="h-5 w-5 rounded border-paper-line text-brand-600" checked={selected.has(u.id)} onChange={() => toggle(u.id)} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{u.name}</span>
                        <span className="block truncate text-xs text-ink-faint">{u.skills.map((s) => SKILLS[s] ?? s).slice(0, 3).join(', ') || 'No skills listed'}</span>
                      </span>
                      <span className="shrink-0 text-xs text-ink-faint">{fmtHours(u.hours)} h</span>
                    </label>
                  </li>
                ))}
              </ul>
              <div className="space-y-2 border-t border-paper-line px-4 py-3 sm:px-5">
                <FormError error={m.error} />
                <Button block disabled={!event || selected.size === 0} loading={m.isPending} icon={<CalendarCheck className="h-4 w-4" />} onClick={() => m.mutate()}>
                  {selected.size ? `Register ${plural(selected.size, 'employee')}` : 'Register employees'}
                </Button>
                <p className="text-xs text-ink-faint">If the event fills up, the rest join the waitlist and move up automatically.</p>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

const useRoster = () => useQuery({ queryKey: ['csr-members'], queryFn: () => api<Roster>('/csr/members') });

export default function Csr() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  const tab: TabId = raw === 'team' || raw === 'register' ? raw : 'impact';
  const roster = useRoster();
  return (
    <div>
      <PageHeader
        title={t('csr.title', 'Company volunteering')}
        subtitle={t('csr.subtitle', 'Grow your employee volunteering programme and report verified impact.')}
        actions={<ButtonLink to="/events" variant="outline" icon={<CalendarDays className="h-4 w-4" />}>Browse events</ButtonLink>}
      />
      <Tabs
        className="mb-5"
        value={tab}
        onChange={(v) => setParams(v === 'impact' ? {} : { tab: v }, { replace: true })}
        tabs={[
          { id: 'impact', label: 'Impact report' },
          { id: 'team', label: 'Employees', count: roster.data?.members.length },
          { id: 'register', label: 'Bulk registration' },
        ]}
      />
      {tab === 'impact' && <ImpactTab />}
      {tab === 'team' && <TeamTab roster={roster} />}
      {tab === 'register' && <RegisterTab roster={roster} />}
    </div>
  );
}
