import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { addDays, endOfDay } from 'date-fns';
import { CalendarSearch, LayoutGrid, LocateFixed, Map as MapIcon, Plus, Search, SlidersHorizontal, Sun, Ticket, Users, X } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { EVENT_CATEGORIES, SKILLS } from '../../lib/constants';
import { useDebounce, useGeolocation } from '../../lib/hooks';
import { relDay } from '../../lib/format';
import type { EventCard as EventCardT } from '../../lib/types';
import { EventCard } from '../../components/EventCard';
import { MapView } from '../../components/Map';
import { Button, ButtonLink, EmptyState, ErrorState, PageHeader, Select, Skeleton } from '../../components/ui';

type Range = 'any' | 'week' | 'month';
type Sort = 'soonest' | 'nearest' | 'popular' | 'newest';
const PAGE = 12;
const RADII = [5, 10, 25, 50];

function ToggleChip({ on, onClick, children, icon }: { on: boolean; onClick: () => void; children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition',
        on ? 'border-brand-500 bg-brand-600 text-white' : 'border-paper-line bg-white text-ink-soft hover:border-brand-300 hover:text-ink',
      )}
    >
      {icon}
      {children}
    </button>
  );
}

export default function EventsList() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [params] = useSearchParams();
  const isOrg = user && ['organizer', 'csr', 'admin'].includes(user.role);

  const [q, setQ] = useState(params.get('q') ?? '');
  const dq = useDebounce(q.trim(), 350);
  const [category, setCategory] = useState(params.get('category') ?? '');
  const [skill, setSkill] = useState(params.get('skill') ?? '');
  const [range, setRange] = useState<Range>('any');
  const [near, setNear] = useState<{ lat: number; lng: number } | null>(null);
  const [radius, setRadius] = useState(10);
  const [outdoor, setOutdoor] = useState(false);
  const [hasSpots, setHasSpots] = useState(false);
  const [sort, setSort] = useState<Sort>('soonest');
  const [view, setView] = useState<'list' | 'map'>('list');
  const [showFilters, setShowFilters] = useState(false);
  const geo = useGeolocation();

  // `from`/`to` are computed once per range choice so the query key stays stable between renders.
  const window_ = useMemo(() => {
    if (range === 'any') return { to: undefined };
    const days = range === 'week' ? 7 : 30;
    return { to: endOfDay(addDays(new Date(), days)).toISOString() };
  }, [range]);

  const filters = {
    q: dq || undefined,
    category: category || undefined,
    skill: skill || undefined,
    to: window_.to,
    lat: near?.lat,
    lng: near?.lng,
    radiusKm: near ? radius : undefined,
    // The API coerces any non-empty value to true, so only send these when switched on.
    outdoor: outdoor ? true : undefined,
    hasSpots: hasSpots ? true : undefined,
    sort: sort === 'nearest' && !near ? 'soonest' : sort,
  };
  const activeFilters = [dq, category, skill, range !== 'any', near, outdoor, hasSpots].filter(Boolean).length;
  const extraFilters = [skill, range !== 'any', near, outdoor, hasSpots].filter(Boolean).length;

  const list = useInfiniteQuery({
    queryKey: ['events', 'browse', filters],
    queryFn: ({ pageParam }) => api<{ items: EventCardT[]; hasMore: boolean }>('/events', { query: { ...filters, limit: PAGE, offset: pageParam } }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => (last.hasMore ? pages.length * PAGE : undefined),
  });
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];

  const recommended = useQuery({
    queryKey: ['events', 'recommended'],
    queryFn: () => api<EventCardT[]>('/events/recommended'),
    enabled: Boolean(user) && activeFilters === 0,
    staleTime: 5 * 60_000,
  });

  const useNearMe = async () => {
    if (near) {
      setNear(null);
      if (sort === 'nearest') setSort('soonest');
      return;
    }
    const c = await geo.locate();
    if (c) {
      setNear(c);
      setSort('nearest');
    }
  };

  const clearAll = () => {
    setQ(''); setCategory(''); setSkill(''); setRange('any'); setNear(null); setOutdoor(false); setHasSpots(false); setSort('soonest');
  };

  const sortOptions: [string, string][] = [
    ['soonest', 'Soonest first'],
    ...(near ? [['nearest', 'Nearest first'] as [string, string]] : []),
    ['popular', 'Most popular'],
    ['newest', 'Newly posted'],
  ];

  return (
    <div>
      <PageHeader
        title={t('events.title', 'Events')}
        subtitle={t('events.subtitle', 'Find drives, camps and causes near you that need your skills.')}
        actions={
          <>
            <ButtonLink to="/events/mine" variant="outline" icon={<Ticket className="h-4 w-4" />}>{t('nav.myEvents', 'My events')}</ButtonLink>
            {isOrg && <ButtonLink to="/events/new" icon={<Plus className="h-4 w-4" />}>{t('events.create', 'Create event')}</ButtonLink>}
          </>
        }
      />

      {/* Search + filters */}
      <section aria-label="Search and filter events" className="space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-ink-faint" aria-hidden />
            <input
              type="search"
              className="input pl-10"
              placeholder={t('events.searchPlaceholder', 'Search events, organizers or places')}
              aria-label="Search events"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <Button
            variant="outline"
            className="sm:hidden"
            aria-expanded={showFilters}
            aria-controls="event-filters"
            onClick={() => setShowFilters((v) => !v)}
            icon={<SlidersHorizontal className="h-4 w-4" />}
          >
            Filters{extraFilters > 0 && <span className="rounded-full bg-brand-600 px-1.5 text-xs text-white">{extraFilters}</span>}
          </Button>
        </div>

        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Category">
          <ToggleChip on={!category} onClick={() => setCategory('')}>All</ToggleChip>
          {Object.entries(EVENT_CATEGORIES).map(([k, c]) => (
            <span key={k} className="shrink-0">
              <ToggleChip on={category === k} onClick={() => setCategory(category === k ? '' : k)}>
                <span aria-hidden>{c.emoji}</span> {c.label}
              </ToggleChip>
            </span>
          ))}
        </div>

        <div id="event-filters" className={clsx('card space-y-3 p-3 sm:block', showFilters ? 'block' : 'hidden')}>
          <div className="grid gap-3 sm:grid-cols-3">
            <Select label="Skill" value={skill} onChange={(e) => setSkill(e.target.value)} options={SKILLS} placeholder="Any skill" />
            <Select label="When" value={range} onChange={(e) => setRange(e.target.value as Range)} options={[['any', 'Any upcoming date'], ['week', 'This week'], ['month', 'This month']]} />
            <Select label="Sort by" value={filters.sort} onChange={(e) => setSort(e.target.value as Sort)} options={sortOptions} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ToggleChip on={Boolean(near)} onClick={useNearMe} icon={geo.loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden /> : <LocateFixed className="h-4 w-4" />}>
              Near me
            </ToggleChip>
            {near && (
              <label className="inline-flex items-center gap-2 text-sm text-ink-soft">
                <span className="sr-only">Distance</span>
                <span aria-hidden>within</span>
                <select className="input w-auto py-1.5 pr-8 text-sm" value={radius} onChange={(e) => setRadius(Number(e.target.value))} aria-label="Search radius">
                  {RADII.map((r) => <option key={r} value={r}>{r} km</option>)}
                </select>
              </label>
            )}
            <ToggleChip on={outdoor} onClick={() => setOutdoor((v) => !v)} icon={<Sun className="h-4 w-4" />}>Outdoor</ToggleChip>
            <ToggleChip on={hasSpots} onClick={() => setHasSpots((v) => !v)} icon={<Users className="h-4 w-4" />}>Has open spots</ToggleChip>
            {activeFilters > 0 && (
              <Button size="sm" variant="ghost" onClick={clearAll} icon={<X className="h-4 w-4" />}>Clear all</Button>
            )}
          </div>
          {geo.error && <p role="alert" className="text-sm text-blood-600">{geo.error}</p>}
        </div>
      </section>

      {/* Recommended */}
      {activeFilters === 0 && (recommended.data?.length ?? 0) > 0 && (
        <section className="mt-6" aria-labelledby="rec-h">
          <h2 id="rec-h" className="mb-3 text-lg font-bold">{t('events.recommended', 'Recommended for you')}</h2>
          <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
            {recommended.data!.map((e) => (
              <div key={e.id} className="w-[270px] shrink-0 snap-start">
                <EventCard event={e} />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Results */}
      <section className="mt-6" aria-labelledby="res-h">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="res-h" className="text-lg font-bold">
            {activeFilters ? 'Matching events' : 'Upcoming events'}
            {near && <span className="ml-2 text-sm font-normal text-ink-faint">within {radius} km</span>}
          </h2>
          <div className="inline-flex rounded-xl border border-paper-line bg-white p-0.5" role="group" aria-label="View">
            {(['list', 'map'] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => setView(v)}
                className={clsx('inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold', view === v ? 'bg-brand-50 text-brand-700' : 'text-ink-soft hover:text-ink')}
              >
                {v === 'list' ? <LayoutGrid className="h-4 w-4" /> : <MapIcon className="h-4 w-4" />}
                {v === 'list' ? 'List' : 'Map'}
              </button>
            ))}
          </div>
        </div>

        {list.isPending ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="card overflow-hidden">
                <Skeleton className="aspect-[16/9] w-full rounded-none" />
                <div className="space-y-2 p-4"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-5 w-4/5" /><Skeleton className="h-4 w-1/2" /></div>
              </div>
            ))}
          </div>
        ) : list.isError ? (
          <ErrorState error={list.error} retry={() => list.refetch()} />
        ) : items.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={<CalendarSearch />}
              title={activeFilters ? 'No events match these filters' : 'No upcoming events yet'}
              body={activeFilters ? 'Try a wider radius, another date range or fewer filters.' : 'Follow organizers you care about and we will tell you when they post.'}
              action={activeFilters ? <Button variant="outline" onClick={clearAll}>Clear filters</Button> : isOrg ? <ButtonLink to="/events/new">Create an event</ButtonLink> : <ButtonLink to="/explore" variant="outline">Find organizers</ButtonLink>}
            />
          </div>
        ) : view === 'map' ? (
          <div className="space-y-3">
            <MapView
              height="min(70vh, 560px)"
              center={near ? [near.lat, near.lng] : undefined}
              radiusKm={near ? radius : undefined}
              zoom={near ? (radius <= 5 ? 13 : radius <= 10 ? 12 : radius <= 25 ? 11 : 10) : undefined}
              markers={items.filter((e) => e.lat != null && e.lng != null).map((e) => ({
                id: e.id, lat: e.lat!, lng: e.lng!, title: e.title, sub: `${relDay(e.startAt)}${e.locationName ? ' · ' + e.locationName : ''}`, href: `/events/${e.id}`,
              }))}
            />
            {items.some((e) => e.lat == null) && (
              <p className="text-sm text-ink-faint">{items.filter((e) => e.lat == null).length} event(s) without a map location are only shown in the list.</p>
            )}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((e) => <EventCard key={e.id} event={e} />)}
          </div>
        )}

        {list.hasNextPage && (
          <div className="mt-6 flex justify-center">
            <Button variant="outline" loading={list.isFetchingNextPage} onClick={() => list.fetchNextPage()}>Load more events</Button>
          </div>
        )}
      </section>
    </div>
  );
}
