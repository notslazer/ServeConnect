import { ReactNode, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import {
  Ban, CalendarDays, Camera, ChevronLeft, ChevronRight, Clock, Droplet, Flag, Flame, Gift, Globe, History, ImageIcon,
  Link2, MapPin, MessageCircle, MoreHorizontal, Pencil, Share2, ShieldAlert, Star, UserX, Users,
} from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { EVENT_CATEGORIES, ORG_TYPE_LABEL, ROLE_LABEL, SKILLS, label } from '../lib/constants';
import { fmtDate, fmtShort, hours as fmtHours, plural, relDay } from '../lib/format';
import type { Badge, EventCard as EventCardT, Paged, Post, Role, UserCard } from '../lib/types';
import {
  Avatar, Button, ButtonLink, Card, EmptyState, ErrorState, IconButton, Modal, Notice, Pill, Skeleton, Spinner, Tabs,
  UserLine, VerifiedBadge, toastError, useConfirm,
} from '../components/ui';
import { FollowButton } from '../components/FollowButton';
import { FileButton } from '../components/ImagePicker';
import { PostCard } from '../components/PostCard';
import { ReportDialog } from '../components/ReportDialog';
import { Stars } from '../components/StarRating';
import { EventCover } from '../components/EventCard';
import { EventStatusPill, RegStatusPill, shareLink, type EventStatus, type RegStatus } from '../components/EventsKit';
import { IMAGE_ACCEPT, checkImage, uploadProfileImage, useFollowingSet } from '../components/SettingsKit';

// ───────────────────────── types ─────────────────────────
interface Stats {
  followers: number;
  following: number;
  posts: number;
  // volunteer
  verifiedHours?: number;
  eventsAttended?: number;
  noShows?: number;
  upcoming?: number;
  bloodDonations?: number;
  pledges?: number;
  // organizer / csr
  completedEvents?: number;
  hostedEvents?: number;
  avgRating?: number | null;
  reviewCount?: number;
  volunteerHoursDelivered?: number;
  volunteersEngaged?: number;
}
interface ProfileView {
  id: string;
  name: string;
  handle: string;
  role: Role;
  avatarUrl: string | null;
  coverUrl: string | null;
  headline: string | null;
  bio: string | null;
  website: string | null;
  orgType: string | null;
  verified: boolean;
  verificationStatus?: string;
  skills: string[];
  interests: string[];
  email: string | null;
  phone: string | null;
  locationName: string | null;
  isMinor?: boolean;
  accountStatus: 'active' | 'suspended' | 'deleted';
  createdAt: string;
  isFollowing: boolean;
  followsYou: boolean;
  isSelf: boolean;
  blocked?: boolean;
  stats: Stats;
  streak: number;
  badges: Badge[];
}
interface ActivityItem {
  id: string;
  title: string;
  category: string;
  startAt: string;
  endAt: string;
  locationName: string | null;
  coverUrl: string | null;
  status: RegStatus;
  hours: number | string | null;
  checkedInAt: string | null;
  organizer: UserCard;
}
interface HostedEvent {
  id: string;
  title: string;
  category: string;
  status: EventStatus;
  startAt: string;
  endAt: string;
  locationName: string | null;
  coverUrl: string | null;
  capacity: number;
  registered: number;
  rating: number | null;
}
interface GalleryPhoto { id: string; url: string; caption: string | null; createdAt: string; eventId: string; eventTitle: string }
interface Review { id: string; rating: number; body: string | null; createdAt: string; eventId: string; eventTitle: string; reviewer: UserCard }

const isOrgRole = (r: Role) => r === 'organizer' || r === 'csr' || r === 'admin';
type TabId = 'posts' | 'activity' | 'events' | 'gallery' | 'reviews';

// ───────────────────────── small pieces ─────────────────────────
function ProfileSkeleton() {
  return (
    <div aria-busy="true" className="space-y-4">
      <div className="card overflow-hidden">
        <Skeleton className="h-36 w-full rounded-none sm:h-52" />
        <div className="space-y-3 p-5">
          <Skeleton className="-mt-16 h-24 w-24 rounded-full border-4 border-white" />
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-72" />
          <Skeleton className="h-4 w-40" />
        </div>
      </div>
      <Skeleton className="h-28 w-full" />
    </div>
  );
}

function StatBox({ value, label: l, icon, hint }: { value: ReactNode; label: ReactNode; icon?: ReactNode; hint?: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-paper px-3 py-3" title={hint}>
      <div className="flex items-center gap-1.5 font-display text-xl font-extrabold text-ink sm:text-2xl">
        {icon && <span className="text-ink-faint [&>svg]:h-4 [&>svg]:w-4" aria-hidden>{icon}</span>}
        <span className="tabular-nums">{value}</span>
      </div>
      <div className="text-sm leading-tight text-ink-soft">{l}</div>
    </div>
  );
}

function AboutCard({ bio, className }: { bio: string; className?: string }) {
  return (
    <Card className={className}>
      <h2 className="mb-1.5 text-base font-bold">About</h2>
      <p className="prose-body">{bio}</p>
    </Card>
  );
}

function BadgeChip({ badge }: { badge: Badge }) {
  return (
    <li className="group relative">
      <button
        type="button"
        className="flex items-center gap-2 rounded-full border border-marigold-100 bg-marigold-50 py-1 pl-1.5 pr-3 text-sm font-semibold text-marigold-700"
        aria-describedby={`badge-${badge.code}`}
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-base" aria-hidden>{badge.icon}</span>
        {badge.title}
      </button>
      <span
        id={`badge-${badge.code}`}
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-56 -translate-x-1/2 rounded-xl bg-ink px-3 py-2 text-xs font-medium text-white opacity-0 shadow-lift transition group-focus-within:opacity-100 group-hover:opacity-100"
      >
        {badge.description}
        <span className="mt-0.5 block text-white/70">Earned {fmtShort(badge.awardedAt)}</span>
      </span>
    </li>
  );
}

function PeopleModal({ open, onClose, title, userId, kind }: { open: boolean; onClose: () => void; title: string; userId: string; kind: 'followers' | 'following' }) {
  const { user } = useAuth();
  const list = useQuery({ queryKey: ['profile', kind, userId], queryFn: () => api<UserCard[]>(`/users/${userId}/${kind}`), enabled: open });
  const { set: followingSet, ready } = useFollowingSet(open ? user?.id : undefined);
  return (
    <Modal open={open} onClose={onClose} title={title}>
      {list.isPending ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : list.isError ? (
        <ErrorState error={list.error} retry={() => list.refetch()} />
      ) : list.data.length === 0 ? (
        <EmptyState icon={<Users />} title={kind === 'followers' ? 'No followers yet' : 'Not following anyone yet'} />
      ) : (
        <ul className="divide-y divide-paper-line">
          {list.data.map((u) => (
            <li key={u.id} className="flex items-center justify-between gap-3 py-2.5">
              <span onClick={onClose} className="min-w-0"><UserLine user={u} sub={u.headline ?? ROLE_LABEL[u.role]} /></span>
              {user && user.id !== u.id && ready && <FollowButton key={`${u.id}:${followingSet.has(u.id)}`} userId={u.id} following={followingSet.has(u.id)} />}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

function Lightbox({ photos, index, onClose, onIndex }: { photos: GalleryPhoto[]; index: number; onClose: () => void; onIndex: (i: number) => void }) {
  const p = photos[index];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' && index < photos.length - 1) onIndex(index + 1);
      if (e.key === 'ArrowLeft' && index > 0) onIndex(index - 1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [index, photos.length, onIndex]);
  return (
    <Modal open onClose={onClose} title={<Link to={`/events/${p.eventId}`} className="hover:underline">{p.eventTitle}</Link>} size="lg">
      <figure>
        <div className="relative flex items-center justify-center overflow-hidden rounded-xl bg-ink">
          <img src={p.url} alt={p.caption ?? `Photo from ${p.eventTitle}`} className="max-h-[65vh] w-auto object-contain" />
          {index > 0 && (
            <IconButton label="Previous photo" onClick={() => onIndex(index - 1)} className="absolute left-2 bg-white/90 text-ink hover:bg-white"><ChevronLeft className="h-5 w-5" /></IconButton>
          )}
          {index < photos.length - 1 && (
            <IconButton label="Next photo" onClick={() => onIndex(index + 1)} className="absolute right-2 bg-white/90 text-ink hover:bg-white"><ChevronRight className="h-5 w-5" /></IconButton>
          )}
        </div>
        <figcaption className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-ink-soft">
          <span>{p.caption ?? 'No caption'} · {fmtShort(p.createdAt)}</span>
          <span className="tabular-nums">{index + 1} / {photos.length}</span>
        </figcaption>
        <div className="mt-3"><ButtonLink to={`/events/${p.eventId}`} size="sm" variant="outline" icon={<CalendarDays className="h-4 w-4" />}>View event</ButtonLink></div>
      </figure>
    </Modal>
  );
}

// ───────────────────────── tabs ─────────────────────────
function PostsTab({ profile }: { profile: ProfileView }) {
  const posts = useInfiniteQuery({
    queryKey: ['profile-posts', profile.id],
    queryFn: ({ pageParam }) => api<Paged<Post>>(`/posts/user/${profile.id}`, { query: { cursor: pageParam, limit: 10 } }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  if (posts.isPending) return <div className="space-y-3">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-40 w-full" />)}</div>;
  if (posts.isError) return <ErrorState error={posts.error} retry={() => posts.refetch()} />;
  const items = posts.data.pages.flatMap((p) => p.items);
  if (!items.length) {
    return (
      <Card>
        <EmptyState
          icon={<MessageCircle />}
          title={profile.isSelf ? "You haven't posted yet" : 'No posts yet'}
          body={profile.isSelf ? 'Share an update, photos from an event or a call for help.' : `When ${profile.name} posts, it shows up here.`}
          action={profile.isSelf && <ButtonLink to="/feed?compose=1">Write a post</ButtonLink>}
        />
      </Card>
    );
  }
  return (
    <div className="space-y-3">
      {items.map((p) => <PostCard key={p.id} post={p} onDeleted={() => posts.refetch()} />)}
      {posts.hasNextPage && (
        <div className="flex justify-center"><Button variant="outline" loading={posts.isFetchingNextPage} onClick={() => posts.fetchNextPage()}>Load more</Button></div>
      )}
    </div>
  );
}

function ActivityTab({ profile }: { profile: ProfileView }) {
  const q = useQuery({ queryKey: ['profile-activity', profile.id], queryFn: () => api<ActivityItem[]>(`/users/${profile.id}/events`) });
  if (q.isPending) return <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>;
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const hidden = !profile.isSelf && profile.stats.verifiedHours === undefined;
  const now = Date.now();
  const upcoming = q.data.filter((e) => (e.status === 'registered' || e.status === 'waitlisted') && new Date(e.endAt).getTime() > now).sort((a, b) => a.startAt.localeCompare(b.startAt));
  const history = q.data.filter((e) => !upcoming.includes(e));
  if (!q.data.length) {
    return (
      <Card>
        <EmptyState
          icon={<History />}
          title={hidden ? 'Activity is private' : profile.isSelf ? 'No activity yet' : 'No attended events yet'}
          body={hidden ? `${profile.name} has chosen not to show their volunteering history.` : profile.isSelf ? 'Events you attend appear here as a timeline with your verified hours.' : 'Verified attendance shows up here after each event.'}
          action={profile.isSelf && <ButtonLink to="/events">Find an event</ButtonLink>}
        />
      </Card>
    );
  }
  return (
    <div className="space-y-6">
      {profile.isSelf && upcoming.length > 0 && (
        <section>
          <h2 className="mb-2 text-base font-bold">Coming up <span className="font-normal text-ink-faint">· only you can see this</span></h2>
          <ul className="space-y-2">
            {upcoming.map((e) => (
              <li key={e.id}>
                <Link to={`/events/${e.id}`} className="card flex items-center gap-3 p-3 hover:border-brand-200">
                  <EventCover event={e} className="h-12 w-12 shrink-0 rounded-xl text-xl" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{e.title}</div>
                    <div className="text-sm text-ink-soft">{relDay(e.startAt)} · {e.organizer.name}</div>
                  </div>
                  <RegStatusPill status={e.status} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {history.length > 0 && (
        <section>
          <h2 className="mb-3 text-base font-bold">Volunteering history</h2>
          <ol className="relative ml-3 border-l-2 border-paper-line">
            {history.map((e) => {
              const attended = e.status === 'attended';
              return (
                <li key={e.id} className="relative mb-4 pl-6 last:mb-0">
                  <span className={clsx('absolute -left-[9px] top-4 h-4 w-4 rounded-full border-[3px] border-paper', attended ? 'bg-brand-500' : 'bg-marigold-400')} aria-hidden />
                  <div className="card flex items-start gap-3 p-3 sm:p-4">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-brand-600">{fmtDate(e.startAt)}</div>
                      <Link to={`/events/${e.id}`} className="font-bold leading-snug hover:text-brand-700">{e.title}</Link>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-ink-soft">
                        <Link to={`/u/${e.organizer.handle}`} className="inline-flex items-center gap-1 hover:underline">{e.organizer.name}{e.organizer.verified && <VerifiedBadge size={14} />}</Link>
                        {e.locationName && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" aria-hidden />{e.locationName}</span>}
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <Pill tone="neutral">{EVENT_CATEGORIES[e.category]?.emoji} {label(EVENT_CATEGORIES, e.category)}</Pill>
                        {!attended && <RegStatusPill status={e.status} />}
                      </div>
                    </div>
                    {attended && (
                      <div className="flex shrink-0 flex-col items-end text-right">
                        <span className="font-display text-xl font-extrabold text-brand-600 tabular-nums">{fmtHours(e.hours)}</span>
                        <span className="text-xs text-ink-faint">verified {Number(e.hours) === 1 ? 'hour' : 'hours'}</span>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      )}
    </div>
  );
}

function EventsTab({ profile }: { profile: ProfileView }) {
  const q = useQuery({ queryKey: ['profile-hosted', profile.id], queryFn: () => api<HostedEvent[]>(`/users/${profile.id}/events`) });
  if (q.isPending) return <div className="grid gap-3 sm:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-56 w-full" />)}</div>;
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  if (!q.data.length) {
    return (
      <Card>
        <EmptyState icon={<CalendarDays />} title="No events yet" body={profile.isSelf ? 'Events you publish appear here for everyone to see.' : `${profile.name} hasn't hosted any events yet.`}
          action={profile.isSelf && <ButtonLink to="/events/new">Create event</ButtonLink>} />
      </Card>
    );
  }
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {q.data.map((e) => (
        <li key={e.id}>
          <Link to={`/events/${e.id}`} className="card group flex h-full flex-col overflow-hidden">
            <div className="relative">
              <EventCover event={e} className="aspect-[16/8] w-full" />
              <span className="absolute left-3 top-3"><EventStatusPill status={e.status} /></span>
            </div>
            <div className="flex flex-1 flex-col p-4">
              <div className="text-sm font-semibold text-brand-600">{relDay(e.startAt)}</div>
              <h3 className="line-clamp-2 font-bold leading-snug group-hover:text-brand-700">{e.title}</h3>
              {e.locationName && <div className="mt-1 flex items-center gap-1.5 text-sm text-ink-soft"><MapPin className="h-4 w-4 shrink-0" aria-hidden /><span className="truncate">{e.locationName}</span></div>}
              <div className="mt-auto flex items-center justify-between gap-2 pt-3 text-sm">
                <span className="flex items-center gap-1.5 text-ink-soft"><Users className="h-4 w-4" aria-hidden />{e.status === 'completed' ? `${e.registered} attended` : `${e.registered} / ${e.capacity} registered`}</span>
                {e.rating != null && <span className="flex items-center gap-1"><Stars value={e.rating} size={14} /><span className="font-semibold tabular-nums">{e.rating.toFixed(1)}</span></span>}
              </div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function GalleryTab({ profile }: { profile: ProfileView }) {
  const [open, setOpen] = useState<number | null>(null);
  const q = useQuery({ queryKey: ['profile-gallery', profile.id], queryFn: () => api<GalleryPhoto[]>(`/users/${profile.id}/gallery`) });
  if (q.isPending) return <div className="grid grid-cols-3 gap-1.5">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="aspect-square w-full" />)}</div>;
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  if (!q.data.length) {
    return <Card><EmptyState icon={<ImageIcon />} title="No photos yet" body={profile.isSelf ? 'Upload photos to an event gallery after it ends — they appear here.' : 'Photos from past events will appear here.'} /></Card>;
  }
  return (
    <>
      <ul className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
        {q.data.map((p, i) => (
          <li key={p.id}>
            <button type="button" onClick={() => setOpen(i)} className="block aspect-square w-full overflow-hidden rounded-xl bg-paper" aria-label={`Open photo from ${p.eventTitle}`}>
              <img src={p.url} alt="" loading="lazy" className="h-full w-full object-cover transition hover:scale-[1.03]" />
            </button>
          </li>
        ))}
      </ul>
      {open !== null && <Lightbox photos={q.data} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />}
    </>
  );
}

function ReviewsTab({ profile }: { profile: ProfileView }) {
  const q = useQuery({ queryKey: ['org-reviews', profile.id], queryFn: () => api<Review[]>(`/users/${profile.id}/reviews`) });
  if (q.isPending) return <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>;
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  if (!q.data.length) return <Card><EmptyState icon={<Star />} title="No reviews yet" body="Volunteers who attend an event can rate it afterwards." /></Card>;
  const avg = profile.stats.avgRating;
  return (
    <div className="space-y-3">
      {avg != null && (
        <Card className="flex flex-wrap items-center gap-4">
          <div className="font-display text-4xl font-extrabold tabular-nums">{avg.toFixed(1)}</div>
          <div>
            <Stars value={avg} size={20} />
            <div className="text-sm text-ink-soft">Average from {plural(profile.stats.reviewCount ?? q.data.length, 'review')}</div>
          </div>
        </Card>
      )}
      <ul className="space-y-3">
        {q.data.map((r) => (
          <li key={r.id} className="card p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <UserLine user={r.reviewer} size={36} sub={fmtShort(r.createdAt)} />
              <Stars value={r.rating} />
            </div>
            <Link to={`/events/${r.eventId}`} className="mt-2 inline-flex items-center gap-1 text-sm text-ink-soft hover:underline"><CalendarDays className="h-3.5 w-3.5" aria-hidden />{r.eventTitle}</Link>
            {r.body && <p className="prose-body mt-2">{r.body}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ───────────────────────── page ─────────────────────────
export default function Profile() {
  const { handle = '' } = useParams();
  const { t } = useTranslation();
  const { user, setUser } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [menu, setMenu] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [people, setPeople] = useState<null | 'followers' | 'following'>(null);
  const [confirm, confirmDialog] = useConfirm();

  const q = useQuery({
    queryKey: ['profile', handle],
    queryFn: () => api<ProfileView>(`/users/${encodeURIComponent(handle)}`),
    retry: (n, e) => !(e instanceof ApiError && e.status === 404) && n < 2,
  });
  const p = q.data;

  const upload = useMutation({
    mutationFn: ({ kind, file }: { kind: 'avatar' | 'cover'; file: File }) => uploadProfileImage(kind, file),
    onSuccess: (me, v) => {
      setUser(me);
      qc.invalidateQueries({ queryKey: ['profile'] });
      toast.success(v.kind === 'avatar' ? 'Profile photo updated' : 'Cover image updated');
    },
    onError: toastError,
  });
  const pick = (kind: 'avatar' | 'cover') => (file: File) => {
    const err = checkImage(file);
    if (err) return toast.error(err);
    upload.mutate({ kind, file });
  };

  const block = useMutation({
    mutationFn: (on: boolean) => api(`/users/${p!.id}/block`, { method: on ? 'POST' : 'DELETE' }),
    onSuccess: (_d, on) => {
      toast.success(on ? `${p!.name} is blocked` : `${p!.name} is unblocked`);
      qc.invalidateQueries({ queryKey: ['profile'] });
    },
    onError: toastError,
  });

  useEffect(() => { if (p) document.title = `${p.name} (@${p.handle}) · ServeConnect`; }, [p]);

  if (q.isPending) return <ProfileSkeleton />;
  if (q.isError) {
    if (q.error instanceof ApiError && q.error.status === 404) {
      return (
        <Card>
          <EmptyState icon={<UserX />} title="This profile isn't available" body={`There's no one at @${handle.replace(/^@/, '')}, or the account was removed.`}
            action={<ButtonLink to={user ? '/explore' : '/'} variant="outline">{user ? 'Search for people' : 'Go to home page'}</ButtonLink>} />
        </Card>
      );
    }
    return <ErrorState error={q.error} retry={() => q.refetch()} />;
  }
  if (!p) return null;

  const org = isOrgRole(p.role);
  const isAdminViewer = user?.role === 'admin';
  const suspended = p.accountStatus === 'suspended';
  const restricted = (suspended && !p.isSelf && !isAdminViewer) || Boolean(p.blocked);
  const profileUrl = `${window.location.origin}/u/${p.handle}`;
  const s = p.stats;

  const tabs: { id: TabId; label: string; count?: number }[] = org
    ? [
        { id: 'posts', label: t('profile.posts', 'Posts'), count: s.posts },
        { id: 'events', label: t('profile.events', 'Events'), count: s.hostedEvents },
        { id: 'gallery', label: t('profile.gallery', 'Gallery') },
        { id: 'reviews', label: t('profile.reviews', 'Reviews'), count: s.reviewCount },
      ]
    : [
        { id: 'posts', label: t('profile.posts', 'Posts'), count: s.posts },
        { id: 'activity', label: t('profile.activity', 'Activity') },
      ];
  const reqTab = params.get('tab') as TabId | null;
  const tab: TabId = reqTab && tabs.some((x) => x.id === reqTab) ? reqTab : 'posts';
  const setTab = (v: TabId) => setParams(v === 'posts' ? {} : { tab: v }, { replace: true });

  const share = async () => {
    setMenu(false);
    const r = await shareLink(`${p.name} on ServeConnect`, profileUrl);
    if (r === 'copied') toast.success('Profile link copied');
    if (r === 'failed') toast.error("Couldn't copy the link. Copy it from the address bar instead.");
  };
  const toggleBlock = async () => {
    setMenu(false);
    if (p.blocked) return block.mutate(false);
    const ok = await confirm({
      title: `Block ${p.name}?`,
      body: "They won't be able to see your profile, follow you or message you, and you'll stop seeing their posts. You'll also unfollow each other. They aren't notified.",
      confirmLabel: 'Block',
      danger: true,
    });
    if (ok) block.mutate(true);
  };

  const roleLine = [ROLE_LABEL[p.role], org && p.orgType ? ORG_TYPE_LABEL[p.orgType] : null].filter(Boolean).join(' · ');
  const websiteLabel = p.website?.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');

  return (
    <div className="space-y-4">
      {/* ───── header card ───── */}
      <section className="card overflow-hidden" aria-label="Profile">
        <div className="relative h-36 bg-brand-100 sm:h-52">
          {p.coverUrl ? (
            <img src={p.coverUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full bg-[radial-gradient(circle_at_20%_120%,theme(colors.brand.200),transparent_55%),radial-gradient(circle_at_90%_-20%,theme(colors.marigold.100),transparent_50%)]" aria-hidden />
          )}
          {p.isSelf && (
            <FileButton accept={IMAGE_ACCEPT} onFile={pick('cover')} className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-sm font-semibold text-ink shadow-lift hover:bg-white">
              {upload.isPending && upload.variables?.kind === 'cover' ? <Spinner className="h-4 w-4" /> : <Camera className="h-4 w-4" aria-hidden />}
              {p.coverUrl ? 'Change cover' : 'Add cover'}
            </FileButton>
          )}
        </div>

        <div className="px-4 pb-5 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="relative -mt-12 sm:-mt-16">
              <Avatar src={p.avatarUrl} name={p.name} size={120} className="border-4 border-white" />
              {p.isSelf && (
                <FileButton accept={IMAGE_ACCEPT} onFile={pick('avatar')} className="absolute bottom-1 right-1 inline-flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-brand-600 text-white shadow-lift hover:bg-brand-700">
                  {upload.isPending && upload.variables?.kind === 'avatar' ? <Spinner className="h-4 w-4 text-white" /> : <Camera className="h-4 w-4" aria-hidden />}
                  <span className="sr-only">Change profile photo</span>
                </FileButton>
              )}
            </div>

            {/* actions */}
            <div className="flex flex-wrap items-center gap-2 pt-3">
              {p.isSelf ? (
                <>
                  <ButtonLink to="/settings/profile" variant="outline" size="sm" icon={<Pencil className="h-4 w-4" />}>Edit profile</ButtonLink>
                  <Button variant="ghost" size="sm" icon={<Share2 className="h-4 w-4" />} onClick={share}>Share</Button>
                </>
              ) : !user ? (
                <>
                  <ButtonLink to={`/login?next=${encodeURIComponent(`/u/${p.handle}`)}`} size="sm">Follow</ButtonLink>
                  <Button variant="ghost" size="sm" icon={<Share2 className="h-4 w-4" />} onClick={share}>Share</Button>
                </>
              ) : (
                <>
                  {!restricted && <FollowButton key={`${p.id}:${p.isFollowing}`} userId={p.id} following={p.isFollowing} />}
                  {!restricted && (p as any).canMessage !== false && (
                    <Button variant="outline" size="sm" icon={<MessageCircle className="h-4 w-4" />} onClick={() => nav(`/messages?to=${p.id}`)}>Message</Button>
                  )}
                  <div className="relative">
                    <IconButton label="More options" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((v) => !v)} className="border border-paper-line bg-white">
                      <MoreHorizontal className="h-5 w-5" />
                    </IconButton>
                    {menu && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
                        <div role="menu" className="absolute right-0 z-20 mt-1 w-56 rounded-xl border border-paper-line bg-white p-1 shadow-lift">
                          <button role="menuitem" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-paper" onClick={share}><Link2 className="h-4 w-4" />Share or copy link</button>
                          <button role="menuitem" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-paper" onClick={() => { setMenu(false); setReporting(true); }}><Flag className="h-4 w-4" />Report {org ? 'organization' : 'profile'}</button>
                          <button role="menuitem" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-blood-600 hover:bg-paper" onClick={toggleBlock}><Ban className="h-4 w-4" />{p.blocked ? 'Unblock' : 'Block'}</button>
                        </div>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="mt-3">
            <h1 className="flex flex-wrap items-center gap-1.5 text-2xl font-extrabold sm:text-[28px]">
              {p.name}
              {p.verified && <VerifiedBadge size={22} />}
            </h1>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-ink-soft">
              <span>@{p.handle}</span>
              <span aria-hidden>·</span>
              <span>{roleLine}</span>
              {p.followsYou && !p.isSelf && <Pill tone="neutral">Follows you</Pill>}
              {p.isSelf && p.verificationStatus === 'pending' && <Pill tone="marigold">Verification pending</Pill>}
            </div>
            {p.headline && <p className="mt-2 text-[17px] font-medium text-ink">{p.headline}</p>}
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-soft">
              {p.locationName && <span className="inline-flex items-center gap-1"><MapPin className="h-4 w-4" aria-hidden />{p.locationName}</span>}
              {p.website && (
                <a href={p.website} target="_blank" rel="noopener noreferrer nofollow" className="link inline-flex items-center gap-1"><Globe className="h-4 w-4" aria-hidden />{websiteLabel}</a>
              )}
              <span className="inline-flex items-center gap-1"><CalendarDays className="h-4 w-4" aria-hidden />Joined {new Date(p.createdAt).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</span>
            </div>
            {!restricted && (
              <div className="mt-3 flex gap-4 text-[15px]">
                <button type="button" className="hover:underline" onClick={() => setPeople('followers')}><span className="font-bold tabular-nums">{s.followers}</span> <span className="text-ink-soft">{s.followers === 1 ? 'follower' : 'followers'}</span></button>
                <button type="button" className="hover:underline" onClick={() => setPeople('following')}><span className="font-bold tabular-nums">{s.following}</span> <span className="text-ink-soft">following</span></button>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ───── restricted states ───── */}
      {suspended && (
        <Notice tone="blood" icon={<ShieldAlert className="h-5 w-5" />} title={p.isSelf ? 'Your account is suspended' : 'This account is suspended'}>
          {p.isSelf
            ? 'Your profile stays visible to you, but posting, registering and messaging are turned off. Contact support@serveconnect.app to appeal.'
            : 'This account was suspended for breaking our community guidelines. Its activity is hidden while the suspension is in place.'}
        </Notice>
      )}
      {p.blocked && (
        <Notice tone="neutral" icon={<Ban className="h-5 w-5" />} title={`You blocked ${p.name}`}
          action={<Button size="sm" variant="outline" loading={block.isPending} onClick={() => block.mutate(false)}>Unblock</Button>}>
          They can't see your profile, follow you or message you. Unblock to see their posts and activity again.
        </Notice>
      )}

      {!restricted && (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="order-2 min-w-0 space-y-4 lg:order-1">
            {p.bio && <AboutCard bio={p.bio} className="hidden lg:block" />}
            <Tabs tabs={tabs} value={tab} onChange={setTab} />
            <div role="tabpanel" aria-label={tabs.find((x) => x.id === tab)?.label}>
              {tab === 'posts' && <PostsTab profile={p} />}
              {tab === 'activity' && <ActivityTab profile={p} />}
              {tab === 'events' && <EventsTab profile={p} />}
              {tab === 'gallery' && <GalleryTab profile={p} />}
              {tab === 'reviews' && <ReviewsTab profile={p} />}
            </div>
          </div>

          {/* ───── side rail: impact, skills, badges ───── */}
          <aside className="order-1 space-y-4 lg:order-2">
            {p.bio && <AboutCard bio={p.bio} className="lg:hidden" />}
            <Card>
              <h2 className="mb-3 text-base font-bold">{org ? 'Impact' : 'Service record'}</h2>
              {org ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    {s.avgRating != null ? (
                      <>
                        <span className="font-display text-3xl font-extrabold tabular-nums">{s.avgRating.toFixed(1)}</span>
                        <div>
                          <Stars value={s.avgRating} size={18} />
                          <button type="button" className="block text-sm text-ink-soft hover:underline" onClick={() => setTab('reviews')}>{plural(s.reviewCount ?? 0, 'review')}</button>
                        </div>
                      </>
                    ) : (
                      <span className="text-sm text-ink-soft">No ratings yet</span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <StatBox value={s.completedEvents ?? 0} label="Completed events" />
                    <StatBox value={s.hostedEvents ?? 0} label="Hosted events" />
                    <StatBox value={fmtHours(s.volunteerHoursDelivered)} label="Volunteer hours delivered" icon={<Clock />} />
                    <StatBox value={s.volunteersEngaged ?? 0} label="Volunteers engaged" icon={<Users />} />
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-4">
                    {s.verifiedHours !== undefined ? (
                      <div className="stamp h-24 w-24 shrink-0" role="img" aria-label={`${fmtHours(s.verifiedHours)} verified service hours`}>
                        <span className="text-2xl leading-none">{fmtHours(s.verifiedHours)}</span>
                        <span className="text-[10px] font-bold">verified hrs</span>
                      </div>
                    ) : (
                      <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-paper-line px-2 text-center text-xs text-ink-faint">Hours are private</div>
                    )}
                    <div className="text-sm text-ink-soft">
                      Hours are counted only for events where attendance was verified by QR or the organizer.
                      {p.isSelf && <> <Link to="/certificates" className="link">Your certificates</Link></>}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <StatBox value={s.eventsAttended ?? 0} label="Events attended" icon={<CalendarDays />} />
                    <StatBox value={p.streak} label="Month streak" icon={<Flame />} hint="Consecutive months with at least one attended event" />
                    <StatBox value={s.bloodDonations ?? 0} label="Blood donations" icon={<Droplet />} />
                    <StatBox value={s.pledges ?? 0} label="Pledges" icon={<Gift />} />
                    {s.noShows !== undefined && (
                      <div className="col-span-2">
                        <StatBox value={s.noShows} label="No-shows (visible to organizers)" />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </Card>

            {(p.skills.length > 0 || p.interests.length > 0) && (
              <Card>
                {p.skills.length > 0 && (
                  <>
                    <h2 className="mb-2 text-base font-bold">Skills</h2>
                    <ul className="flex flex-wrap gap-1.5">{p.skills.map((k) => <li key={k}><Pill tone="brand">{SKILLS[k] ?? k}</Pill></li>)}</ul>
                  </>
                )}
                {p.interests.length > 0 && (
                  <>
                    <h2 className={clsx('mb-2 text-base font-bold', p.skills.length > 0 && 'mt-4')}>Causes</h2>
                    <ul className="flex flex-wrap gap-1.5">{p.interests.map((k) => <li key={k}><Pill>{EVENT_CATEGORIES[k]?.emoji} {label(EVENT_CATEGORIES, k)}</Pill></li>)}</ul>
                  </>
                )}
              </Card>
            )}

            {p.badges.length > 0 && (
              <Card>
                <h2 className="mb-2 text-base font-bold">Milestones</h2>
                <ul className="flex flex-wrap gap-2">{p.badges.map((b) => <BadgeChip key={b.code} badge={b} />)}</ul>
              </Card>
            )}

            {(p.email || p.phone) && (
              <Card>
                <h2 className="mb-2 text-base font-bold">Contact</h2>
                <dl className="space-y-1 text-sm">
                  {p.email && <div><dt className="sr-only">Email</dt><dd><a className="link break-all" href={`mailto:${p.email}`}>{p.email}</a></dd></div>}
                  {p.phone && <div><dt className="sr-only">Phone</dt><dd><a className="link" href={`tel:${p.phone}`}>{p.phone}</a></dd></div>}
                </dl>
              </Card>
            )}
          </aside>
        </div>
      )}

      {people && (
        <PeopleModal open onClose={() => setPeople(null)} userId={p.id} kind={people} title={people === 'followers' ? `${p.name}'s followers` : `${p.name} follows`} />
      )}
      {user && !p.isSelf && <ReportDialog open={reporting} onClose={() => setReporting(false)} targetType="user" targetId={p.id} title={`Report ${p.name}`} />}
      {confirmDialog}
    </div>
  );
}
