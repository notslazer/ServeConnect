import { ReactNode, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import {
  Building2, CheckCircle2, Droplet, Gift, HandHeart, Heart, LocateFixed, MapPin, Navigation, Package, PackagePlus, Search, ShieldCheck, X,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useMe } from '../../lib/auth';
import { BLOOD_COMPONENTS, RESOURCE_CATEGORIES } from '../../lib/constants';
import { useDebounce, useGeolocation } from '../../lib/hooks';
import { ago, fmtShort, plural } from '../../lib/format';
import {
  Button, ButtonLink, Card, EmptyState, ErrorState, Notice, PageHeader, Pill, ProgressBar, Skeleton, Tabs, VerifiedBadge,
} from '../../components/ui';
import {
  BloodGroupBadge, BloodList, CATEGORY_ICON, DriveCover, BloodRequest, DeadlineText, RarePill, ReqStatus, ReqStatusPill, ResourceCard, UrgencyPill,
} from '../../components/RequestsKit';

type TabId = 'drives' | 'blood' | 'mine';
const PAGE = 12;
const RADII = [5, 10, 25, 50, 100];


function ToggleChip({ on, onClick, children, icon }: { on: boolean; onClick: () => void; children: ReactNode; icon?: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={clsx(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition',
        on ? 'border-brand-500 bg-brand-600 text-white' : 'border-paper-line bg-white text-ink-soft hover:border-brand-300 hover:text-ink',
      )}
    >
      {icon}
      {children}
    </button>
  );
}

// ───────────────────────── donation drives ─────────────────────────
function DriveCard({ d }: { d: ResourceCard }) {
  const pct = d.needed > 0 ? Math.round((Math.min(d.pledged, d.needed) / d.needed) * 100) : 0;
  return (
    <Link to={`/requests/resources/${d.id}`} className="card group flex flex-col overflow-hidden transition hover:shadow-lift">
      <div className="relative">
        <DriveCover coverUrl={d.coverUrl} category={d.category} className="aspect-[16/9] w-full" />
        <div className="absolute left-3 top-3 flex gap-1.5">
          <Pill className="bg-white/95">{RESOURCE_CATEGORIES[d.category] ?? d.category}</Pill>
          {d.status !== 'open' && <ReqStatusPill status={d.status} />}
        </div>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="line-clamp-2 text-lg font-bold leading-snug group-hover:text-brand-700">{d.title}</h3>
        <div className="mt-1 flex items-center gap-1.5 text-sm text-ink-soft">
          <span className="truncate">{d.requester.name}</span>
          {d.requester.verified && <VerifiedBadge size={14} />}
        </div>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-ink-faint">
          {d.locationName && (
            <span className="inline-flex min-w-0 items-center gap-1"><MapPin className="h-4 w-4 shrink-0" aria-hidden /><span className="truncate">{d.locationName}</span>{d.distanceKm != null && <span className="shrink-0">· {Math.round(d.distanceKm)} km</span>}</span>
          )}
          {d.deadline && d.status === 'open' && <DeadlineText iso={d.deadline} className="text-sm" />}
        </div>

        <div className="mt-3">
          <div className="mb-1.5 flex items-baseline justify-between text-sm">
            <span className="font-semibold">{pct}% pledged</span>
            <span className="text-ink-faint">{d.pledged.toLocaleString('en-IN')} of {d.needed.toLocaleString('en-IN')} items</span>
          </div>
          <ProgressBar value={d.pledged} max={d.needed} tone={pct >= 100 ? 'leaf' : 'marigold'} />
        </div>

        {(d.topItems?.length ?? 0) > 0 && (
          <ul className="mt-3 space-y-1 text-sm">
            {d.topItems!.slice(0, 3).map((it) => {
              const done = it.pledged >= it.needed;
              return (
                <li key={it.name} className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5 text-ink-soft">
                    {done ? <CheckCircle2 className="h-4 w-4 shrink-0 text-leaf-500" aria-label="Fully pledged" /> : <Package className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />}
                    <span className="truncate">{it.name}</span>
                  </span>
                  <span className={clsx('shrink-0 tabular-nums', done ? 'text-leaf-600' : 'text-ink-faint')}>{Math.min(it.pledged, it.needed)}/{it.needed} {it.unit}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Link>
  );
}

function DrivesTab({ isOrg }: { isOrg: boolean }) {
  const [q, setQ] = useState('');
  const dq = useDebounce(q.trim(), 350);
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState<'open' | 'fulfilled' | 'closed' | 'all'>('open');
  const [near, setNear] = useState<{ lat: number; lng: number } | null>(null);
  const [radius, setRadius] = useState(25);
  const geo = useGeolocation();

  const filters = { q: dq || undefined, category: category || undefined, status, lat: near?.lat, lng: near?.lng, radiusKm: near ? radius : undefined };
  const active = [dq, category, near, status !== 'open'].filter(Boolean).length;
  const list = useInfiniteQuery({
    queryKey: ['resources', 'browse', filters],
    queryFn: ({ pageParam }) => api<{ items: ResourceCard[]; hasMore: boolean }>('/requests/resources', { query: { ...filters, limit: PAGE, offset: pageParam } }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => (last.hasMore ? pages.length * PAGE : undefined),
  });
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const toggleNear = async () => {
    if (near) return setNear(null);
    const c = await geo.locate();
    if (c) setNear(c);
  };
  const clear = () => { setQ(''); setCategory(''); setStatus('open'); setNear(null); };

  return (
    <div className="space-y-4">
      <section aria-label="Search and filter donation drives" className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-ink-faint" aria-hidden />
          <input type="search" className="input pl-10" placeholder="Search drives or items like rice, notebooks, blankets" aria-label="Search donation drives" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Category">
          <ToggleChip on={!category} onClick={() => setCategory('')}>All</ToggleChip>
          {Object.entries(RESOURCE_CATEGORIES).map(([k, l]) => (
            <ToggleChip key={k} on={category === k} onClick={() => setCategory(category === k ? '' : k)}>
              <span aria-hidden>{CATEGORY_ICON[k]}</span> {l}
            </ToggleChip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ToggleChip
            on={Boolean(near)}
            onClick={toggleNear}
            icon={geo.loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden /> : <LocateFixed className="h-4 w-4" />}
          >
            Near me
          </ToggleChip>
          {near && (
            <label className="inline-flex items-center gap-2 text-sm text-ink-soft">
              <span aria-hidden>within</span>
              <select className="input w-auto py-1.5 pr-8 text-sm" value={radius} onChange={(e) => setRadius(Number(e.target.value))} aria-label="Search radius">
                {RADII.map((r) => <option key={r} value={r}>{r} km</option>)}
              </select>
            </label>
          )}
          <label className="inline-flex items-center gap-2 text-sm text-ink-soft">
            <span className="sr-only">Status</span>
            <select className="input w-auto py-1.5 pr-8 text-sm" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Status">
              <option value="open">Open drives</option>
              <option value="fulfilled">Fulfilled</option>
              <option value="closed">Closed</option>
              <option value="all">All drives</option>
            </select>
          </label>
          {active > 0 && <Button size="sm" variant="ghost" onClick={clear} icon={<X className="h-4 w-4" />}>Clear</Button>}
        </div>
        {geo.error && <p role="alert" className="text-sm text-blood-600">{geo.error}</p>}
      </section>

      {list.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card overflow-hidden">
              <Skeleton className="aspect-[16/9] w-full rounded-none" />
              <div className="space-y-2 p-4"><Skeleton className="h-5 w-4/5" /><Skeleton className="h-4 w-1/2" /><Skeleton className="h-2 w-full" /></div>
            </div>
          ))}
        </div>
      ) : list.isError ? (
        <ErrorState error={list.error} retry={() => list.refetch()} />
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Gift />}
            title={active ? 'No drives match these filters' : 'No open donation drives right now'}
            body={active ? 'Try another category, a wider radius or fewer filters.' : 'When NGOs near you need food, clothes or supplies, their wishlists show up here.'}
            action={active ? <Button variant="outline" onClick={clear}>Clear filters</Button> : isOrg ? <ButtonLink to="/requests/resources/new" icon={<PackagePlus className="h-4 w-4" />}>Start a donation drive</ButtonLink> : <ButtonLink to="/explore" variant="outline">Find organizations</ButtonLink>}
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((d) => <DriveCard key={d.id} d={d} />)}
        </div>
      )}
      {list.hasNextPage && (
        <div className="flex justify-center">
          <Button variant="outline" loading={list.isFetchingNextPage} onClick={() => list.fetchNextPage()}>Load more drives</Button>
        </div>
      )}
    </div>
  );
}

// ───────────────────────── blood ─────────────────────────
function BloodCard({ b, showRequester = true }: { b: BloodRequest; showRequester?: boolean }) {
  const open = b.status === 'open';
  return (
    <Link
      to={`/requests/blood/${b.id}`}
      className={clsx('card flex gap-4 p-4 transition hover:shadow-lift', b.isRare && open && 'border-blood-100 ring-1 ring-blood-100', !open && 'opacity-80')}
    >
      <BloodGroupBadge group={b.bloodGroup} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {b.isRare && <RarePill />}
          {open ? <UrgencyPill urgency={b.urgency} /> : <ReqStatusPill status={b.status} />}
          {b.compatible && open && !b.isMine && (
            <Pill tone="leaf" icon={<CheckCircle2 className="h-3 w-3" aria-hidden />}>Compatible with you</Pill>
          )}
        </div>
        <h3 className="mt-1.5 truncate text-base font-bold">{b.hospitalName}</h3>
        <div className="text-sm text-ink-soft">
          {BLOOD_COMPONENTS[b.component] ?? b.component} · {plural(b.unitsNeeded, 'unit')}
          {b.patientLabel && <> · {b.patientLabel}</>}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-sm">
          {open && <DeadlineText iso={b.neededBy} prefix="Needed ·" />}
          {b.distanceKm != null && <span className="inline-flex items-center gap-1 text-ink-soft"><Navigation className="h-4 w-4" aria-hidden />{b.distanceKm} km away</span>}
          {showRequester && b.requester && (
            <span className="inline-flex min-w-0 items-center gap-1 text-ink-faint"><span className="truncate">by {b.requester.name}</span>{b.requester.verified && <VerifiedBadge size={13} />}</span>
          )}
        </div>
        <div className="mt-2.5 flex items-center gap-3">
          <div className="flex-1"><ProgressBar value={b.unitsPledged} max={b.unitsNeeded} tone="blood" /></div>
          <span className="shrink-0 text-sm font-semibold tabular-nums">{Math.min(b.unitsPledged, b.unitsNeeded)}/{b.unitsNeeded} pledged</span>
        </div>
      </div>
    </Link>
  );
}

function BloodTab() {
  const me = useMe();
  const [showAll, setShowAll] = useState(false);
  const q = useQuery({
    queryKey: ['blood-requests', showAll ? 'all' : 'open'],
    queryFn: () => api<BloodList>('/requests/blood', { query: { status: showAll ? 'all' : undefined } }),
  });
  const isAdmin = me.role === 'admin';

  if (q.isPending) {
    return <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-2xl" />)}</div>;
  }
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const { nearby, mine, donor } = q.data;
  const notDonor = !isAdmin && (!donor.optedIn || !donor.hasLocation);
  const myOpen = mine.filter((b) => showAll || b.status === 'open');

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <div className="min-w-0 space-y-4">
        {notDonor ? (
          <Notice
            tone="blood"
            icon={<ShieldCheck className="h-6 w-6" aria-hidden />}
            title={!donor.optedIn ? 'Turn on donor mode to see blood requests near you' : 'Add your location to see blood requests near you'}
            action={<ButtonLink to="/settings/donor" variant="danger" size="sm">{!donor.optedIn ? 'Become a donor' : 'Set my location'}</ButtonLink>}
          >
            To protect patients' privacy, blood requests are only shown to opted-in donors whose location is inside the request's search radius.
            We never show your blood group or contact to anyone until you choose to pledge.
          </Notice>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold">
              {isAdmin ? 'All blood requests' : 'Requests near you'}
              {donor.bloodGroup && !isAdmin && <span className="ml-2 text-sm font-normal text-ink-faint">Your group: <strong className="text-blood-600">{donor.bloodGroup}</strong></span>}
            </h2>
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink-soft">
              <input type="checkbox" className="h-4 w-4 rounded border-paper-line text-brand-600" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
              Show fulfilled and closed
            </label>
          </div>
        )}

        {!notDonor && (
          nearby.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Heart />}
                title="No blood requests in your area"
                body="We'll alert you the moment a compatible patient nearby needs blood. Keep notifications on."
                action={<ButtonLink to="/settings/donor" variant="outline">Donor settings</ButtonLink>}
              />
            </Card>
          ) : (
            <div className="space-y-3">{nearby.map((b) => <BloodCard key={b.id} b={b} />)}</div>
          )
        )}

        {myOpen.length > 0 && (
          <section aria-labelledby="my-blood-h" className="space-y-3 pt-2">
            <h2 id="my-blood-h" className="text-lg font-bold">Your requests</h2>
            {myOpen.map((b) => <BloodCard key={b.id} b={b} showRequester={false} />)}
          </section>
        )}
      </div>

      <aside className="space-y-4">
        <Card className="space-y-3">
          <div className="flex items-center gap-2">
            <Droplet className="h-5 w-5 text-blood-500" aria-hidden />
            <h2 className="text-base font-bold">Need blood urgently?</h2>
          </div>
          <p className="text-sm text-ink-soft">We alert compatible donors within your chosen radius. Rare groups get a priority alert.</p>
          <ButtonLink to="/requests/blood/new" variant="danger" block icon={<Droplet className="h-4 w-4" />}>Request blood</ButtonLink>
          {me.verificationStatus !== 'verified' && !isAdmin && (
            <p className="text-xs text-ink-faint">Only verified profiles can post blood requests. <Link to="/settings/verification" className="link">Get verified</Link></p>
          )}
        </Card>
        <Card className="space-y-2 text-sm text-ink-soft">
          <h2 className="text-base font-bold text-ink">How it works</h2>
          <p>1. A verified user posts the group, hospital and deadline.</p>
          <p>2. Only opted-in donors who are nearby and compatible are alerted.</p>
          <p>3. When you tap "I can donate", your number is shared with the requester — only with your consent.</p>
        </Card>
      </aside>
    </div>
  );
}

// ───────────────────────── my activity ─────────────────────────
interface Mine {
  blood: { id: string; bloodGroup: string; unitsNeeded: number; unitsPledged: number; unitsReceived: number; hospitalName: string; status: ReqStatus; urgency: BloodRequest['urgency']; neededBy: string; createdAt: string }[];
  resources: { id: string; title: string; status: ReqStatus; category: string; deadline: string | null; createdAt: string; needed: number; pledged: number }[];
  pledges: { id: string; quantity: number; status: 'pledged' | 'delivered' | 'cancelled'; createdAt: string; itemName: string; unit: string; requestId: string; requestTitle: string }[];
  responses: { id: string; status: 'pledged' | 'donated' | 'cancelled'; createdAt: string; requestId: string; bloodGroup: string; hospitalName: string; requestStatus: ReqStatus }[];
}

const PLEDGE_PILL = {
  pledged: <Pill tone="marigold">Pledged</Pill>,
  delivered: <Pill tone="leaf">Received</Pill>,
  donated: <Pill tone="leaf">Donated</Pill>,
  cancelled: <Pill>Cancelled</Pill>,
};

function ActivitySection({ title, icon, count, children, empty }: { title: string; icon: ReactNode; count: number; children: ReactNode; empty: ReactNode }) {
  return (
    <Card padded={false}>
      <div className="flex items-center gap-2 border-b border-paper-line px-4 py-3 sm:px-5">
        <span className="text-ink-soft [&>svg]:h-5 [&>svg]:w-5" aria-hidden>{icon}</span>
        <h2 className="text-base font-bold">{title}</h2>
        <span className="rounded-full bg-paper px-2 text-xs font-semibold text-ink-soft">{count}</span>
      </div>
      {count === 0 ? <div className="px-4 py-5 text-sm text-ink-faint sm:px-5">{empty}</div> : <ul className="divide-y divide-paper-line">{children}</ul>}
    </Card>
  );
}

function Row({ to, children }: { to: string; children: ReactNode }) {
  return (
    <li>
      <Link to={to} className="flex items-center gap-3 px-4 py-3 hover:bg-paper sm:px-5">{children}</Link>
    </li>
  );
}

function MineTab({ isOrg }: { isOrg: boolean }) {
  const q = useQuery({ queryKey: ['requests-mine'], queryFn: () => api<Mine>('/requests/mine') });
  if (q.isPending) return <div className="grid gap-4 md:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-40 w-full rounded-2xl" />)}</div>;
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const { blood, resources, pledges, responses } = q.data;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <ActivitySection title="My blood donations" icon={<Heart />} count={responses.length} empty="When you pledge to donate blood, it appears here.">
        {responses.map((r) => (
          <Row key={r.id} to={`/requests/blood/${r.requestId}`}>
            <BloodGroupBadge group={r.bloodGroup} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{r.hospitalName}</div>
              <div className="text-sm text-ink-faint">Responded {ago(r.createdAt)} · request {r.requestStatus}</div>
            </div>
            {PLEDGE_PILL[r.status]}
          </Row>
        ))}
      </ActivitySection>

      <ActivitySection title="My pledges" icon={<Gift />} count={pledges.length} empty={<>You haven't pledged to a donation drive yet. <Link className="link" to="/requests">Browse drives</Link></>}>
        {pledges.map((p) => (
          <Row key={p.id} to={`/requests/resources/${p.requestId}`}>
            <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-marigold-50 font-display font-extrabold leading-none text-marigold-700">
              {p.quantity}
              <span className="mt-0.5 max-w-[44px] truncate text-[10px] font-semibold">{p.unit}</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{p.itemName}</div>
              <div className="truncate text-sm text-ink-faint">{p.requestTitle} · {fmtShort(p.createdAt)}</div>
            </div>
            {PLEDGE_PILL[p.status]}
          </Row>
        ))}
      </ActivitySection>

      <ActivitySection title="My blood requests" icon={<Droplet />} count={blood.length} empty={<>You haven't requested blood. <Link className="link" to="/requests/blood/new">Request blood</Link></>}>
        {blood.map((b) => (
          <Row key={b.id} to={`/requests/blood/${b.id}`}>
            <BloodGroupBadge group={b.bloodGroup} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{b.hospitalName}</div>
              <div className="text-sm text-ink-faint">{b.unitsPledged} pledged · {b.unitsReceived} received of {b.unitsNeeded}</div>
            </div>
            <ReqStatusPill status={b.status} />
          </Row>
        ))}
      </ActivitySection>

      <ActivitySection
        title="My donation drives"
        icon={<Building2 />}
        count={resources.length}
        empty={isOrg ? <>No drives yet. <Link className="link" to="/requests/resources/new">Start a donation drive</Link></> : 'Organizers can run donation drives with itemised wishlists.'}
      >
        {resources.map((r) => (
          <Row key={r.id} to={`/requests/resources/${r.id}`}>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-semibold">{r.title}</span>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <div className="flex-1"><ProgressBar value={r.pledged} max={r.needed} tone="marigold" /></div>
                <span className="shrink-0 text-xs text-ink-faint">{r.pledged}/{r.needed}</span>
              </div>
            </div>
            <ReqStatusPill status={r.status} />
          </Row>
        ))}
      </ActivitySection>
    </div>
  );
}

export default function RequestsHome() {
  const { t } = useTranslation();
  const me = useMe();
  const isOrg = ['organizer', 'csr', 'admin'].includes(me.role);
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  const tab: TabId = raw === 'blood' || raw === 'mine' ? raw : 'drives';
  const setTab = (v: TabId) => setParams(v === 'drives' ? {} : { tab: v }, { replace: true });

  return (
    <div>
      <PageHeader
        title={t('requests.title', 'Requests & donations')}
        subtitle={t('requests.subtitle', 'Give what is needed, where it is needed — supplies for drives and blood for patients nearby.')}
        actions={
          <>
            <ButtonLink to="/requests/blood/new" variant="outline" icon={<Droplet className="h-4 w-4 text-blood-500" />}>{t('requests.requestBlood', 'Request blood')}</ButtonLink>
            {isOrg && <ButtonLink to="/requests/resources/new" icon={<PackagePlus className="h-4 w-4" />}>{t('requests.startDrive', 'Start a donation drive')}</ButtonLink>}
          </>
        }
      />
      <Tabs
        className="mb-5"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'drives', label: <><HandHeart className="h-4 w-4" aria-hidden /> Donation drives</> },
          { id: 'blood', label: <><Droplet className="h-4 w-4" aria-hidden /> Blood requests</> },
          { id: 'mine', label: 'My activity' },
        ]}
      />
      {tab === 'drives' && <DrivesTab isOrg={isOrg} />}
      {tab === 'blood' && <BloodTab />}
      {tab === 'mine' && <MineTab isOrg={isOrg} />}
    </div>
  );
}

