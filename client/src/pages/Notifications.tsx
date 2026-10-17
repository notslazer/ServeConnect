import { ReactNode, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { InfiniteData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { isToday, isYesterday } from 'date-fns';
import {
  AlarmClock, AlertTriangle, Award, BadgeCheck, Bell, BellOff, BellRing, Building2, CalendarDays, CheckCheck, CloudRain, Droplet, Flag, Gift, Heart,
  Megaphone, MessageCircle, MessageSquare, QrCode, Settings, ShieldAlert, Trophy, UserPlus, Users, X,
} from 'lucide-react';
import { api } from '../lib/api';
import { ago } from '../lib/format';
import { currentSubscription, disablePush, enablePush, pushSupported } from '../lib/push';
import { Button, ButtonLink, Card, EmptyState, ErrorState, IconButton, PageHeader, Pill, Skeleton, Tabs, toastError } from '../components/ui';

interface Notif {
  id: string;
  type: string;
  category: 'events' | 'requests' | 'social' | 'system' | 'reminders' | string;
  title: string;
  body: string | null;
  link: string | null;
  priority: 'normal' | 'high';
  readAt: string | null;
  createdAt: string;
}
type Page = { items: Notif[]; nextCursor: string | null };
type Filter = 'all' | 'unread' | 'events' | 'requests' | 'social' | 'system';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'events', label: 'Events' },
  { id: 'requests', label: 'Requests' },
  { id: 'social', label: 'Social' },
  { id: 'system', label: 'System' },
];

type Tone = 'brand' | 'blood' | 'marigold' | 'leaf' | 'neutral';
const TYPE_ICON: Record<string, [ReactNode, Tone]> = {
  blood_request: [<Droplet />, 'blood'], blood_response: [<Droplet />, 'blood'], blood_closed: [<Droplet />, 'neutral'], blood_thanks: [<Heart />, 'blood'],
  pledge: [<Gift />, 'marigold'], pledge_received: [<Gift />, 'leaf'], resource_request: [<Gift />, 'marigold'], request_deadline: [<AlarmClock />, 'marigold'],
  message: [<MessageCircle />, 'brand'], comment: [<MessageSquare />, 'brand'], discussion: [<MessageSquare />, 'brand'], like: [<Heart />, 'blood'],
  follow: [<UserPlus />, 'brand'], gallery: [<Users />, 'brand'], review: [<MessageSquare />, 'marigold'], milestone: [<Trophy />, 'marigold'],
  certificate: [<Award />, 'leaf'], checked_in: [<QrCode />, 'leaf'], reminder: [<AlarmClock />, 'brand'], weather: [<CloudRain />, 'marigold'],
  team: [<Users />, 'brand'], team_lead: [<Users />, 'brand'], csr_registered: [<Building2 />, 'brand'], csr_join: [<Building2 />, 'brand'],
  event_cancelled: [<CalendarDays />, 'blood'], waitlist_promoted: [<CalendarDays />, 'leaf'], registered: [<CalendarDays />, 'leaf'],
  verification_decision: [<BadgeCheck />, 'marigold'], verification_submitted: [<BadgeCheck />, 'brand'], security: [<ShieldAlert />, 'blood'],
  suspended: [<AlertTriangle />, 'blood'], warning: [<AlertTriangle />, 'marigold'], unsuspended: [<CheckCheck />, 'leaf'],
  report: [<Flag />, 'neutral'], report_outcome: [<Flag />, 'neutral'], announcement: [<Megaphone />, 'brand'],
};
const CATEGORY_ICON: Record<string, [ReactNode, Tone]> = {
  events: [<CalendarDays />, 'brand'], requests: [<Gift />, 'marigold'], social: [<Users />, 'brand'], system: [<Bell />, 'neutral'], reminders: [<AlarmClock />, 'brand'],
};
const TONE_CLASS: Record<Tone, string> = {
  brand: 'bg-brand-50 text-brand-600', blood: 'bg-blood-50 text-blood-500', marigold: 'bg-marigold-50 text-marigold-600', leaf: 'bg-leaf-50 text-leaf-600', neutral: 'bg-paper text-ink-soft',
};

const bucket = (d: string) => (isToday(new Date(d)) ? 'Today' : isYesterday(new Date(d)) ? 'Yesterday' : 'Earlier');

function PushCard() {
  const supported = pushSupported();
  const [state, setState] = useState<'checking' | 'on' | 'off' | 'blocked'>('checking');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!supported) return;
    currentSubscription()
      .then((s) => setState(s ? 'on' : Notification.permission === 'denied' ? 'blocked' : 'off'))
      .catch(() => setState('off'));
  }, [supported]);

  const turnOn = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await enablePush();
      if (r === 'ok') {
        setState('on');
        toast.success('Push notifications are on for this device.');
      } else {
        setMsg(r);
        if (Notification.permission === 'denied') setState('blocked');
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Couldn't turn on push notifications. Try again.");
    } finally {
      setBusy(false);
    }
  };
  const turnOff = async () => {
    setBusy(true);
    try {
      await disablePush();
      setState('off');
      toast.success('Push notifications turned off for this device.');
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2">
        {state === 'on' ? <BellRing className="h-5 w-5 text-leaf-600" aria-hidden /> : <BellOff className="h-5 w-5 text-ink-soft" aria-hidden />}
        <h2 className="text-base font-bold">Alerts on this device</h2>
      </div>
      {!supported ? (
        <p className="text-sm text-ink-soft">This browser doesn't support push notifications. On iPhone, add ServeConnect to your Home Screen from the Share menu first.</p>
      ) : state === 'checking' ? (
        <Skeleton className="h-10 w-full" />
      ) : state === 'on' ? (
        <>
          <p className="text-sm text-ink-soft">You'll get urgent blood requests, event reminders and messages even when ServeConnect is closed.</p>
          <Button variant="outline" size="sm" loading={busy} onClick={turnOff}>Turn off on this device</Button>
        </>
      ) : state === 'blocked' ? (
        <p className="text-sm text-ink-soft">Notifications are blocked for this site. Allow them in your browser's site settings, then reload this page.</p>
      ) : (
        <>
          <p className="text-sm text-ink-soft">Get urgent blood requests and event reminders instantly, even when the app is closed.</p>
          <Button size="sm" loading={busy} icon={<BellRing className="h-4 w-4" />} onClick={turnOn}>Turn on push notifications</Button>
        </>
      )}
      {msg && <p role="status" className="rounded-xl bg-marigold-50 px-3 py-2 text-sm text-marigold-700">{msg}</p>}
    </Card>
  );
}

export default function Notifications() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>('all');
  const key = ['notifications', filter] as const;
  const query = filter === 'unread' ? { unread: true } : filter === 'all' ? {} : { category: filter };
  const list = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam }) => api<Page>('/notifications', { query: { ...query, cursor: pageParam ?? undefined } }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];

  const patchCache = (fn: (n: Notif) => Notif | null) =>
    qc.setQueriesData<InfiniteData<Page>>({ queryKey: ['notifications'] }, (old) =>
      old ? { ...old, pages: old.pages.map((p) => ({ ...p, items: p.items.map(fn).filter(Boolean) as Notif[] })) } : old,
    );

  const readOne = useMutation({
    mutationFn: (id: string) => api(`/notifications/${id}/read`, { method: 'POST' }),
    onMutate: (id) => patchCache((n) => (n.id === id ? { ...n, readAt: n.readAt ?? new Date().toISOString() } : n)),
    onSettled: () => qc.invalidateQueries({ queryKey: ['notif-count'] }),
  });
  const readAll = useMutation({
    mutationFn: () => api('/notifications/read-all', { method: 'POST' }),
    onSuccess: () => {
      patchCache((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() }));
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['notif-count'] });
      toast.success('All caught up.');
    },
    onError: toastError,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/notifications/${id}`, { method: 'DELETE' }),
    onMutate: (id) => patchCache((n) => (n.id === id ? null : n)),
    onError: (e) => { toastError(e); qc.invalidateQueries({ queryKey: ['notifications'] }); },
    onSettled: () => qc.invalidateQueries({ queryKey: ['notif-count'] }),
  });

  const open = (n: Notif) => {
    if (!n.readAt) readOne.mutate(n.id);
    if (n.link) nav(n.link);
  };

  const unreadCount = useQuery({ queryKey: ['notif-count'], queryFn: () => api<{ count: number }>('/notifications/unread-count') });
  const hasUnread = (unreadCount.data?.count ?? 0) > 0 || items.some((n) => !n.readAt);
  let lastBucket = '';

  return (
    <div>
      <PageHeader
        title={t('nav.notifications', 'Notifications')}
        actions={
          <>
            <Button variant="outline" size="sm" icon={<CheckCheck className="h-4 w-4" />} loading={readAll.isPending} disabled={!hasUnread} onClick={() => readAll.mutate()}>Mark all read</Button>
            <ButtonLink to="/settings/notifications" variant="ghost" size="sm" icon={<Settings className="h-4 w-4" />}>Settings</ButtonLink>
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0">
          <Tabs className="mb-3" tabs={FILTERS} value={filter} onChange={setFilter} />
          {list.isPending ? (
            <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[72px] w-full rounded-2xl" />)}</div>
          ) : list.isError ? (
            <ErrorState error={list.error} retry={() => list.refetch()} />
          ) : items.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Bell />}
                title={filter === 'unread' ? "You're all caught up" : 'Nothing here yet'}
                body={filter === 'unread' ? 'New alerts will appear here.' : 'Follow organizers and register for events to start getting updates.'}
                action={filter === 'unread' ? <Button variant="outline" onClick={() => setFilter('all')}>See all notifications</Button> : <ButtonLink to="/events" variant="outline">Find events</ButtonLink>}
              />
            </Card>
          ) : (
            <Card padded={false} className="overflow-hidden">
              <ul>
                {items.map((n) => {
                  const [icon, tone] = TYPE_ICON[n.type] ?? CATEGORY_ICON[n.category] ?? [<Bell />, 'neutral' as Tone];
                  const high = n.priority === 'high';
                  const b = bucket(n.createdAt);
                  const header = b !== lastBucket ? b : null;
                  lastBucket = b;
                  return (
                    <li key={n.id}>
                      {header && <div className="border-b border-paper-line bg-paper/70 px-4 py-1.5 text-xs font-semibold text-ink-soft sm:px-5">{header}</div>}
                      <div className={clsx('group relative flex items-start gap-3 border-b border-paper-line px-4 py-3 last:border-b-0 sm:px-5', !n.readAt && 'bg-brand-50/40', high && 'border-l-4 border-l-blood-500 pl-3 sm:pl-4')}>
                        <span className={clsx('mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full [&>svg]:h-5 [&>svg]:w-5', TONE_CLASS[tone])} aria-hidden>{icon}</span>
                        <button type="button" onClick={() => open(n)} className="min-w-0 flex-1 text-left after:absolute after:inset-0 after:content-['']" aria-label={`${n.readAt ? '' : 'Unread: '}${n.title}`}>
                          <span className="flex flex-wrap items-center gap-1.5">
                            {high && <Pill tone="blood" icon={<AlertTriangle className="h-3 w-3" aria-hidden />}>Priority</Pill>}
                            <span className={clsx('text-[15px] leading-snug', n.readAt ? 'text-ink-soft' : 'font-semibold text-ink')}>{n.title}</span>
                          </span>
                          {n.body && <span className="mt-0.5 line-clamp-2 block text-sm text-ink-soft">{n.body}</span>}
                          <span className="mt-1 block text-xs text-ink-faint">{ago(n.createdAt)}</span>
                        </button>
                        <div className="relative z-10 flex shrink-0 items-center gap-1">
                          {!n.readAt && <span className="h-2.5 w-2.5 rounded-full bg-brand-600" aria-hidden />}
                          <IconButton label="Delete notification" className="h-8 w-8 opacity-60 hover:opacity-100 focus:opacity-100" onClick={() => remove.mutate(n.id)}>
                            <X className="h-4 w-4" />
                          </IconButton>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
          {list.hasNextPage && (
            <div className="mt-4 flex justify-center">
              <Button variant="outline" loading={list.isFetchingNextPage} onClick={() => list.fetchNextPage()}>Load older notifications</Button>
            </div>
          )}
        </div>
        <aside className="space-y-4">
          <PushCard />
          <Card className="text-sm text-ink-soft">
            Choose which alerts you get by email or push in <Link to="/settings/notifications" className="link">notification settings</Link>. Urgent blood requests near you always come through.
          </Card>
        </aside>
      </div>
    </div>
  );
}
