import { useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import { api } from '../lib/api';
import { useMe } from '../lib/auth';
import type { EventCard as E, Paged, Post, UserCard } from '../lib/types';
import { hours } from '../lib/format';
import { PostCard } from '../components/PostCard';
import { PostComposer } from '../components/PostComposer';
import { EventCard } from '../components/EventCard';
import { FollowButton } from '../components/FollowButton';
import { Avatar, Card, EmptyState, ErrorState, Notice, Skeleton, Tabs, VerifiedBadge } from '../components/ui';

type FeedPage = Paged<Post> & { fallback?: boolean };

function useFeed(kind: 'following' | 'discover') {
  return useInfiniteQuery({
    queryKey: ['feed', kind],
    queryFn: ({ pageParam }) => api<FeedPage>(kind === 'following' ? '/posts/feed' : '/posts/explore', { query: { cursor: pageParam } }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

function InfiniteSentinel({ onVisible, enabled }: { onVisible: () => void; enabled: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!enabled || !ref.current) return;
    const io = new IntersectionObserver((e) => e[0].isIntersecting && onVisible(), { rootMargin: '600px' });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [enabled, onVisible]);
  return <div ref={ref} className="h-1" />;
}

function RightRail() {
  const me = useMe();
  const profile = useQuery({ queryKey: ['profile', me.handle], queryFn: () => api<any>(`/users/${me.handle}`) });
  const rec = useQuery({ queryKey: ['events-recommended'], queryFn: () => api<E[]>('/events/recommended') });
  const sugg = useQuery({ queryKey: ['suggestions'], queryFn: () => api<(UserCard & { followers: number; distanceKm: number | null })[]>('/users/suggestions') });
  const tags = useQuery({ queryKey: ['trending-tags'], queryFn: () => api<{ tag: string; n: number }[]>('/posts/trending-tags') });
  const stats = profile.data?.stats;
  return (
    <aside className="hidden space-y-4 lg:block">
      <Card className="text-center">
        <Link to={`/u/${me.handle}`} className="inline-block"><Avatar src={me.avatarUrl} name={me.name} size={64} /></Link>
        <div className="mt-2 flex items-center justify-center gap-1 font-bold">{me.name}{me.verificationStatus === 'verified' && <VerifiedBadge />}</div>
        {me.headline && <div className="text-sm text-ink-soft">{me.headline}</div>}
        {stats && (me.role === 'volunteer' ? (
          <div className="mt-4 flex items-center justify-center gap-5">
            <div className="stamp h-20 w-20 text-brand-600"><span className="text-2xl leading-none">{hours(stats.verifiedHours ?? 0)}</span><span className="text-[10px]">hours</span></div>
            <div className="text-left text-sm">
              <div><b>{stats.eventsAttended}</b> events attended</div>
              <div><b>{profile.data.streak}</b>-month streak</div>
              <div><b>{stats.followers}</b> followers</div>
            </div>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-3 text-sm">
            <div><div className="font-display text-xl font-extrabold">{stats.completedEvents}</div>events</div>
            <div><div className="font-display text-xl font-extrabold">{hours(stats.volunteerHoursDelivered)}</div>hours</div>
            <div><div className="font-display text-xl font-extrabold">{stats.followers}</div>followers</div>
          </div>
        ))}
      </Card>
      {rec.data && rec.data.length > 0 && (
        <Card>
          <div className="mb-2 flex items-center justify-between"><h2 className="text-base font-bold">Events for you</h2><Link to="/events" className="link text-sm">See all</Link></div>
          <div className="-mx-2">{rec.data.slice(0, 4).map((e) => <EventCard key={e.id} event={e} compact />)}</div>
        </Card>
      )}
      {sugg.data && sugg.data.length > 0 && (
        <Card>
          <h2 className="mb-3 text-base font-bold">Organizations to follow</h2>
          <ul className="space-y-3">
            {sugg.data.slice(0, 5).map((u) => (
              <li key={u.id} className="flex items-center gap-2">
                <Link to={`/u/${u.handle}`} className="flex min-w-0 flex-1 items-center gap-2">
                  <Avatar src={u.avatarUrl} name={u.name} size={36} />
                  <span className="min-w-0">
                    <span className="flex items-center gap-1 truncate text-sm font-semibold">{u.name}{u.verified && <VerifiedBadge size={14} />}</span>
                    <span className="block truncate text-xs text-ink-faint">{u.distanceKm != null ? `${u.distanceKm} km away · ` : ''}{u.followers} followers</span>
                  </span>
                </Link>
                <FollowButton userId={u.id} following={false} />
              </li>
            ))}
          </ul>
        </Card>
      )}
      {tags.data && tags.data.length > 0 && (
        <Card>
          <h2 className="mb-2 text-base font-bold">Trending</h2>
          <div className="flex flex-wrap gap-2">{tags.data.map((t) => <Link key={t.tag} to={`/explore?tag=${t.tag}`} className="rounded-full bg-paper px-3 py-1 text-sm font-medium text-brand-700 hover:bg-brand-50">#{t.tag}</Link>)}</div>
        </Card>
      )}
    </aside>
  );
}

export default function Feed() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as 'following' | 'discover') || 'following';
  const feed = useFeed(tab);
  const qc = useQueryClient();
  const posts = feed.data?.pages.flatMap((p) => p.items) ?? [];
  const fallback = feed.data?.pages[0]?.fallback;
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0 space-y-4">
        <h1 className="sr-only">{t('nav.home')}</h1>
        <PostComposer autoFocus={params.get('compose') === '1'} onPosted={() => qc.invalidateQueries({ queryKey: ['feed'] })} />
        <Tabs tabs={[{ id: 'following', label: 'Following' }, { id: 'discover', label: 'Discover' }]} value={tab} onChange={(v) => setParams(v === 'following' ? {} : { tab: v })} />
        {fallback && tab === 'following' && (
          <Notice tone="marigold" icon={<Sparkles className="h-5 w-5" />} title="Your feed fills up as you follow people">
            Here are updates from verified organizations. <Link to="/explore" className="font-semibold underline">Find causes to follow</Link>.
          </Notice>
        )}
        {feed.isLoading ? (
          [0, 1, 2].map((i) => <div key={i} className="card space-y-3 p-5"><div className="flex gap-3"><Skeleton className="h-10 w-10 rounded-full" /><Skeleton className="h-4 w-40" /></div><Skeleton className="h-16" /></div>)
        ) : feed.error ? (
          <ErrorState error={feed.error} retry={() => feed.refetch()} />
        ) : posts.length === 0 ? (
          <EmptyState title="Nothing here yet" body="Follow organizations and volunteers, or be the first to share an update." />
        ) : (
          posts.map((p) => <PostCard key={p.id} post={p} onDeleted={() => qc.invalidateQueries({ queryKey: ['feed'] })} />)
        )}
        <InfiniteSentinel enabled={Boolean(feed.hasNextPage) && !feed.isFetchingNextPage} onVisible={() => feed.fetchNextPage()} />
        {feed.isFetchingNextPage && <div className="py-4 text-center text-sm text-ink-faint">Loading more…</div>}
        {!feed.hasNextPage && posts.length > 5 && <div className="py-4 text-center text-sm text-ink-faint">You're all caught up.</div>}
      </div>
      <RightRail />
    </div>
  );
}
