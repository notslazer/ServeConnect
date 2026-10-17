import { ReactNode, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { CalendarDays, Hash, HandHeart, MapPin, Newspaper, Search, Users, X } from 'lucide-react';
import { api } from '../lib/api';
import { useMe } from '../lib/auth';
import { EVENT_CATEGORIES, RESOURCE_CATEGORIES, ROLE_LABEL, SKILLS, label } from '../lib/constants';
import { plural, relDay } from '../lib/format';
import { useDebounce } from '../lib/hooks';
import type { Paged, Post, Role, UserCard } from '../lib/types';
import {
  Avatar, Button, Card, Checkbox, EmptyState, ErrorState, PageHeader, Pill, Skeleton, Spinner, Tabs, UserLine, VerifiedBadge,
} from '../components/ui';
import { FollowButton } from '../components/FollowButton';
import { PostCard } from '../components/PostCard';
import { EventCover } from '../components/EventCard';
import { useFollowingSet } from '../components/SettingsKit';

interface SearchResult {
  people: (UserCard & { verified: boolean })[];
  events: { id: string; title: string; startAt: string; locationName: string | null; coverUrl: string | null; category: string }[];
  requests: { id: string; title: string; category: string; status: string }[];
}
type Person = UserCard & { skills: string[]; locationName: string | null; followers: number };
type Suggestion = UserCard & { followers: number; distanceKm: number | null };
const PEOPLE_PAGE = 12;

// ───────────────────────── posts feed (explore or tag) ─────────────────────────
function PostsFeed({ tag }: { tag?: string }) {
  const q = useInfiniteQuery({
    queryKey: ['explore-posts', tag ?? ''],
    queryFn: ({ pageParam }) => api<Paged<Post>>('/posts/explore', { query: { tag, cursor: pageParam, limit: 10 } }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  if (q.isPending) return <div className="space-y-3">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-44 w-full" />)}</div>;
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const items = q.data.pages.flatMap((p) => p.items);
  if (!items.length) {
    return (
      <Card>
        <EmptyState icon={tag ? <Hash /> : <Newspaper />} title={tag ? `No posts with #${tag} yet` : 'No posts yet'}
          body={tag ? 'Be the first — add this hashtag to your next post.' : 'Posts from organizers and volunteers will show up here.'} />
      </Card>
    );
  }
  return (
    <div className="space-y-3">
      {items.map((p) => <PostCard key={p.id} post={p} onDeleted={() => q.refetch()} />)}
      {q.hasNextPage && <div className="flex justify-center"><Button variant="outline" loading={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>Load more</Button></div>}
    </div>
  );
}

// ───────────────────────── people directory ─────────────────────────
function PersonCard({ p, following, showFollow }: { p: Person; following: boolean; showFollow: boolean }) {
  return (
    <li className="card flex flex-col p-4">
      <div className="flex items-start gap-3">
        <Link to={`/u/${p.handle}`} className="shrink-0"><Avatar src={p.avatarUrl} name={p.name} size={52} /></Link>
        <div className="min-w-0 flex-1">
          <Link to={`/u/${p.handle}`} className="flex items-center gap-1 font-semibold hover:underline"><span className="truncate">{p.name}</span>{p.verified && <VerifiedBadge />}</Link>
          <div className="text-sm text-ink-faint">{ROLE_LABEL[p.role]} · {plural(p.followers, 'follower')}</div>
          {p.headline && <p className="mt-1 line-clamp-2 text-sm text-ink-soft">{p.headline}</p>}
        </div>
      </div>
      {p.locationName && <div className="mt-2 flex items-center gap-1 text-sm text-ink-soft"><MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden /><span className="truncate">{p.locationName}</span></div>}
      {p.skills?.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {p.skills.slice(0, 3).map((s) => <Pill key={s} tone="brand">{SKILLS[s] ?? s}</Pill>)}
          {p.skills.length > 3 && <Pill>+{p.skills.length - 3}</Pill>}
        </div>
      )}
      {showFollow && <div className="mt-auto pt-3"><FollowButton key={`${p.id}:${following}`} userId={p.id} following={following} /></div>}
    </li>
  );
}

function PeopleDirectory() {
  const me = useMe();
  const [role, setRole] = useState<'' | Exclude<Role, 'admin'>>('');
  const [skill, setSkill] = useState('');
  const [verified, setVerified] = useState(false);
  const [text, setText] = useState('');
  const dq = useDebounce(text.trim(), 350);
  const { set: followingSet, ready } = useFollowingSet(me.id);
  const q = useInfiniteQuery({
    queryKey: ['people-search', role, skill, verified, dq],
    queryFn: ({ pageParam }) => api<Person[]>('/users/search', { query: { role: role || undefined, skill: skill || undefined, verified: verified || undefined, q: dq || undefined, limit: PEOPLE_PAGE, offset: pageParam } }),
    initialPageParam: 0,
    getNextPageParam: (last, all) => (last.length === PEOPLE_PAGE ? all.length * PEOPLE_PAGE : undefined),
  });
  const people = q.data?.pages.flat() ?? [];
  const roles: [typeof role, string][] = [['', 'Everyone'], ['volunteer', 'Volunteers'], ['organizer', 'Organizers'], ['csr', 'Companies']];
  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div role="radiogroup" aria-label="Filter by type" className="flex flex-wrap gap-1.5">
          {roles.map(([v, l]) => (
            <button key={v || 'all'} type="button" role="radio" aria-checked={role === v} onClick={() => setRole(v)}
              className={clsx('rounded-full border px-3 py-1.5 text-sm font-semibold transition', role === v ? 'border-brand-600 bg-brand-600 text-white' : 'border-paper-line bg-white text-ink-soft hover:text-ink')}>
              {l}
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
          <input className="input" type="search" placeholder="Filter by name or headline" aria-label="Filter people by name or headline" value={text} onChange={(e) => setText(e.target.value)} />
          <select className="input" aria-label="Filter by skill" value={skill} onChange={(e) => setSkill(e.target.value)}>
            <option value="">Any skill</option>
            {Object.entries(SKILLS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        <Checkbox label="Verified profiles only" checked={verified} onChange={setVerified} />
      </div>
      {q.isPending ? (
        <div className="grid gap-3 sm:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-36 w-full" />)}</div>
      ) : q.isError ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : people.length === 0 ? (
        <Card><EmptyState icon={<Users />} title="No one matches these filters" body="Try another skill or turn off “Verified profiles only”." /></Card>
      ) : (
        <>
          <ul className="grid gap-3 sm:grid-cols-2">
            {people.map((p) => <PersonCard key={p.id} p={p} following={followingSet.has(p.id)} showFollow={ready && p.id !== me.id} />)}
          </ul>
          {q.hasNextPage && <div className="flex justify-center"><Button variant="outline" loading={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>Show more people</Button></div>}
        </>
      )}
      <p className="text-sm text-ink-faint">People under 18 aren't listed in the directory.</p>
    </div>
  );
}

// ───────────────────────── side rail ─────────────────────────
function RailCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <h2 className="mb-3 text-base font-bold">{title}</h2>
      {children}
    </Card>
  );
}

function TrendingTags({ active }: { active?: string }) {
  const q = useQuery({ queryKey: ['trending-tags'], queryFn: () => api<{ tag: string; n: number }[]>('/posts/trending-tags'), staleTime: 5 * 60_000 });
  return (
    <RailCard title="Trending hashtags">
      {q.isPending ? <div className="flex flex-wrap gap-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-24 rounded-full" />)}</div>
        : q.isError ? <p className="text-sm text-ink-soft">Couldn't load trending tags. <button className="link" onClick={() => q.refetch()}>Try again</button></p>
        : q.data.length === 0 ? <p className="text-sm text-ink-soft">No hashtags in the last 30 days. Add one like #BeachClean to your post.</p>
        : (
          <ul className="flex flex-wrap gap-2">
            {q.data.map((t) => (
              <li key={t.tag}>
                <Link to={`/explore?tag=${encodeURIComponent(t.tag)}`} aria-current={active?.toLowerCase() === t.tag ? 'page' : undefined}
                  className={clsx('inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm font-semibold transition', active?.toLowerCase() === t.tag ? 'border-brand-600 bg-brand-600 text-white' : 'border-paper-line bg-white text-brand-700 hover:border-brand-300')}>
                  #{t.tag}<span className={clsx('text-xs font-normal', active?.toLowerCase() === t.tag ? 'text-white/80' : 'text-ink-faint')}>{t.n}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
    </RailCard>
  );
}

function Suggestions() {
  const q = useQuery({ queryKey: ['suggestions'], queryFn: () => api<Suggestion[]>('/users/suggestions') });
  return (
    <RailCard title="Organizations to follow">
      {q.isPending ? <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}</div>
        : q.isError ? <p className="text-sm text-ink-soft">Couldn't load suggestions. <button className="link" onClick={() => q.refetch()}>Try again</button></p>
        : q.data.length === 0 ? <p className="text-sm text-ink-soft">You already follow every organization we'd suggest. Nice.</p>
        : (
          <ul className="space-y-3">
            {q.data.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2">
                <UserLine user={s} size={40} sub={[plural(s.followers, 'follower'), s.distanceKm != null ? `${s.distanceKm} km` : null].filter(Boolean).join(' · ')} />
                <FollowButton userId={s.id} following={false} />
              </li>
            ))}
          </ul>
        )}
    </RailCard>
  );
}

// ───────────────────────── global search results ─────────────────────────
function Section({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 flex items-center gap-2 text-base font-bold"><span className="text-ink-faint [&>svg]:h-5 [&>svg]:w-5" aria-hidden>{icon}</span>{title}</h2>
      {children}
    </section>
  );
}

function SearchResults({ q }: { q: string }) {
  const me = useMe();
  const { set: followingSet, ready } = useFollowingSet(me.id);
  const r = useQuery({ queryKey: ['search', q], queryFn: () => api<SearchResult>('/search', { query: { q } }), placeholderData: (prev) => prev });
  if (r.isPending) return <div className="space-y-3"><Skeleton className="h-6 w-32" /><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>;
  if (r.isError) return <ErrorState error={r.error} retry={() => r.refetch()} />;
  const { people, events, requests } = r.data;
  if (!people.length && !events.length && !requests.length) {
    return <Card><EmptyState icon={<Search />} title={`Nothing found for “${q}”`} body="Check the spelling, or search for an area, a cause or an organization's name." /></Card>;
  }
  return (
    <div className={clsx('space-y-6 transition-opacity', r.isFetching && 'opacity-60')} aria-busy={r.isFetching}>
      {people.length > 0 && (
        <Section title="People and organizations" icon={<Users />}>
          <ul className="card divide-y divide-paper-line">
            {people.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <UserLine user={p} sub={p.headline ?? ROLE_LABEL[p.role]} />
                {ready && p.id !== me.id && <FollowButton key={`${p.id}:${followingSet.has(p.id)}`} userId={p.id} following={followingSet.has(p.id)} />}
              </li>
            ))}
          </ul>
        </Section>
      )}
      {events.length > 0 && (
        <Section title="Upcoming events" icon={<CalendarDays />}>
          <ul className="card divide-y divide-paper-line">
            {events.map((e) => (
              <li key={e.id}>
                <Link to={`/events/${e.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-paper">
                  <EventCover event={e} className="h-12 w-12 shrink-0 rounded-xl text-xl" />
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{e.title}</div>
                    <div className="truncate text-sm text-ink-soft">{relDay(e.startAt)}{e.locationName && ` · ${e.locationName}`}</div>
                  </div>
                  <Pill className="ml-auto hidden shrink-0 sm:inline-flex">{label(EVENT_CATEGORIES, e.category)}</Pill>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {requests.length > 0 && (
        <Section title="Donation drives" icon={<HandHeart />}>
          <ul className="card divide-y divide-paper-line">
            {requests.map((x) => (
              <li key={x.id}>
                <Link to={`/requests/resources/${x.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-paper">
                  <span className="min-w-0 truncate font-semibold">{x.title}</span>
                  <Pill tone="marigold" className="shrink-0">{RESOURCE_CATEGORIES[x.category] ?? x.category}</Pill>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

// ───────────────────────── page ─────────────────────────
export default function Explore() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const tag = params.get('tag')?.replace(/^#/, '') || undefined;
  const [text, setText] = useState(params.get('q') ?? '');
  const dq = useDebounce(text.trim(), 300);
  const [tab, setTab] = useState<'posts' | 'people'>(params.get('tab') === 'people' ? 'people' : 'posts');

  // Keep ?q= in the URL so searches can be shared and survive a reload.
  useEffect(() => {
    const cur = params.get('q') ?? '';
    if (cur === dq) return;
    const next = new URLSearchParams(params);
    if (dq) { next.set('q', dq); next.delete('tag'); } else next.delete('q');
    setParams(next, { replace: true });
  }, [dq]); // eslint-disable-line react-hooks/exhaustive-deps

  // Picking a hashtag replaces any text search.
  useEffect(() => { if (tag) setText(''); }, [tag]);

  const searching = dq.length >= 2;
  const changeTab = (v: 'posts' | 'people') => {
    setTab(v);
    const next = new URLSearchParams(params);
    if (v === 'people') next.set('tab', 'people'); else next.delete('tab');
    setParams(next, { replace: true });
  };

  return (
    <div>
      <PageHeader title={t('nav.explore', 'Explore')} subtitle="Find organizations, volunteers, events and conversations across ServeConnect." />
      <form role="search" className="relative mb-5" onSubmit={(e) => e.preventDefault()}>
        <Search className="pointer-events-none absolute left-3.5 top-3.5 h-5 w-5 text-ink-faint" aria-hidden />
        <input
          className="input h-12 pl-11 pr-11 text-base"
          type="search"
          placeholder="Search people, organizations, events and drives"
          aria-label="Search ServeConnect"
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoComplete="off"
        />
        {text && dq !== text.trim() && <Spinner className="absolute right-3.5 top-3.5" />}
        {text && dq === text.trim() && (
          <button type="button" aria-label="Clear search" onClick={() => setText('')} className="absolute right-2.5 top-2.5 rounded-full p-1.5 text-ink-soft hover:bg-paper"><X className="h-5 w-5" /></button>
        )}
      </form>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          {searching ? (
            <SearchResults q={dq} />
          ) : text.trim().length === 1 ? (
            <p className="text-sm text-ink-soft">Keep typing — search needs at least 2 characters.</p>
          ) : tag ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="flex items-center gap-1 text-xl font-extrabold"><Hash className="h-5 w-5 text-brand-600" aria-hidden />{tag}</h2>
                <Link to="/explore" className="link text-sm">Back to Explore</Link>
              </div>
              <PostsFeed tag={tag} />
            </div>
          ) : (
            <>
              <Tabs className="mb-4" value={tab} onChange={changeTab} tabs={[{ id: 'posts', label: 'Explore posts' }, { id: 'people', label: 'People' }]} />
              <div role="tabpanel" aria-label={tab === 'posts' ? 'Explore posts' : 'People'}>
                {tab === 'posts' ? <PostsFeed /> : <PeopleDirectory />}
              </div>
            </>
          )}
        </div>
        <aside className="space-y-4">
          <TrendingTags active={tag} />
          <Suggestions />
        </aside>
      </div>
    </div>
  );
}
