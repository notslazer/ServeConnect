import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { Bookmark, Flag, Heart, MessageCircle, MoreHorizontal, Pencil, Share2, Trash2, CalendarDays, MapPin, Gift } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { Post, UserCard } from '../lib/types';
import { ago, relDay } from '../lib/format';
import { Avatar, Button, IconButton, ProgressBar, Textarea, VerifiedBadge, toastError, useConfirm } from './ui';
import { PollView } from './PollView';
import { ReportDialog } from './ReportDialog';
import { EventCover } from './EventCard';

/** Renders text with #hashtags and links made clickable. */
export function RichText({ text }: { text: string }) {
  const parts = text.split(/(#[A-Za-z0-9_]{2,40}|https?:\/\/[^\s]+)/g);
  return (
    <p className="prose-body">
      {parts.map((p, i) =>
        p.startsWith('#') ? <Link key={i} to={`/explore?tag=${encodeURIComponent(p.slice(1))}`} className="font-medium text-brand-600 hover:underline">{p}</Link>
          : /^https?:\/\//.test(p) ? <a key={i} href={p} target="_blank" rel="noopener noreferrer nofollow" className="link break-all">{p}</a>
          : p,
      )}
    </p>
  );
}

function Gallery({ media }: { media: Post['media'] }) {
  const [open, setOpen] = useState<number | null>(null);
  if (!media.length) return null;
  const grid = media.length === 1 ? 'grid-cols-1' : media.length === 2 ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3';
  return (
    <>
      <div className={clsx('grid gap-1 overflow-hidden rounded-2xl', grid)}>
        {media.slice(0, 6).map((m, i) => (
          <button key={m.url} onClick={() => setOpen(i)} className={clsx('relative bg-paper', media.length === 1 ? 'max-h-[520px]' : 'aspect-square')}>
            <img src={m.url} alt="" loading="lazy" className="h-full w-full object-cover" />
          </button>
        ))}
      </div>
      {open !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/90 p-4" onClick={() => setOpen(null)} role="dialog" aria-label="Photo viewer">
          <img src={media[open].url} alt="" className="max-h-full max-w-full rounded-xl object-contain" />
        </div>
      )}
    </>
  );
}

function Comments({ postId, onCount }: { postId: string; onCount: (d: number) => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [body, setBody] = useState('');
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null);
  const { data = [] } = useQuery({ queryKey: ['comments', postId], queryFn: () => api<any[]>(`/posts/${postId}/comments`) });
  const add = useMutation({
    mutationFn: () => api(`/posts/${postId}/comments`, { body: { body, parentId: replyTo?.id } }),
    onSuccess: () => { setBody(''); setReplyTo(null); onCount(1); qc.invalidateQueries({ queryKey: ['comments', postId] }); },
    onError: toastError,
  });
  const del = useMutation({
    mutationFn: (id: string) => api(`/posts/comments/${id}`, { method: 'DELETE' }),
    onSuccess: () => { onCount(-1); qc.invalidateQueries({ queryKey: ['comments', postId] }); },
  });
  const roots = data.filter((c) => !c.parentId);
  const replies = (id: string) => data.filter((c) => c.parentId === id);
  const Item = ({ c, nested }: { c: any; nested?: boolean }) => (
    <div className={clsx('flex gap-2.5', nested && 'ml-10')}>
      <Avatar src={c.author.avatarUrl} name={c.author.name} size={nested ? 28 : 32} />
      <div className="min-w-0 flex-1">
        <div className="rounded-2xl bg-paper px-3 py-2">
          <Link to={`/u/${c.author.handle}`} className="flex items-center gap-1 text-sm font-semibold hover:underline">{c.author.name}{c.author.verified && <VerifiedBadge size={13} />}</Link>
          <div className="whitespace-pre-wrap break-words text-[15px]">{c.body}</div>
        </div>
        <div className="mt-0.5 flex gap-3 px-2 text-xs font-semibold text-ink-faint">
          <span>{ago(c.createdAt)}</span>
          {user && !nested && <button onClick={() => setReplyTo({ id: c.id, name: c.author.name })} className="hover:text-ink">Reply</button>}
          {user?.id === c.author.id && <button onClick={() => del.mutate(c.id)} className="hover:text-blood-600">Delete</button>}
        </div>
      </div>
    </div>
  );
  return (
    <div className="space-y-3 border-t border-paper-line pt-3">
      {roots.map((c) => (
        <div key={c.id} className="space-y-2">
          <Item c={c} />
          {replies(c.id).map((r) => <Item key={r.id} c={r} nested />)}
        </div>
      ))}
      {user && (
        <form onSubmit={(e) => { e.preventDefault(); if (body.trim()) add.mutate(); }} className="flex items-start gap-2">
          <Avatar src={user.avatarUrl} name={user.name} size={32} />
          <div className="flex-1">
            {replyTo && <div className="mb-1 text-xs text-ink-soft">Replying to {replyTo.name} · <button type="button" className="link" onClick={() => setReplyTo(null)}>cancel</button></div>}
            <div className="flex gap-2">
              <input className="input py-2" placeholder="Write a comment…" value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} aria-label="Comment" />
              <Button type="submit" size="sm" loading={add.isPending} disabled={!body.trim()}>Post</Button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}

function EventAttachment({ e }: { e: NonNullable<Post['event']> }) {
  const left = e.capacity - e.registered;
  return (
    <Link to={`/events/${e.id}`} className="flex overflow-hidden rounded-2xl border border-paper-line hover:border-brand-200">
      <EventCover event={e} className="w-28 shrink-0 text-3xl sm:w-36" />
      <div className="min-w-0 p-3">
        <div className="text-sm font-semibold text-brand-600">{relDay(e.startAt)}</div>
        <div className="line-clamp-2 font-bold">{e.title}</div>
        {e.locationName && <div className="mt-0.5 flex items-center gap-1 truncate text-sm text-ink-soft"><MapPin className="h-3.5 w-3.5 shrink-0" />{e.locationName}</div>}
        <div className="mt-1 text-sm font-semibold text-leaf-600">{e.status === 'published' ? (left > 0 ? `${left} spots open` : 'Full · join waitlist') : e.status}</div>
      </div>
    </Link>
  );
}

function RequestAttachment({ r }: { r: NonNullable<Post['request']> }) {
  return (
    <Link to={`/requests/resources/${r.id}`} className="block rounded-2xl border border-marigold-100 bg-marigold-50 p-4 hover:border-marigold-300">
      <div className="flex items-center gap-2 font-bold"><Gift className="h-5 w-5 text-marigold-600" />{r.title}</div>
      <div className="mt-2"><ProgressBar value={r.pledged} max={r.needed} tone="marigold" /></div>
      <div className="mt-1 text-sm text-ink-soft">{r.pledged} of {r.needed} items pledged · {r.status === 'open' ? 'Pledge an item' : r.status}</div>
    </Link>
  );
}

export function PostCard({ post: initial, onDeleted, defaultShowComments = false }: { post: Post; onDeleted?: () => void; defaultShowComments?: boolean }) {
  const { user } = useAuth();
  const nav = useNavigate();
  const [post, setPost] = useState(initial);
  const [showComments, setShowComments] = useState(defaultShowComments);
  const [menu, setMenu] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(post.body ?? '');
  const [confirm, dialog] = useConfirm();
  const mine = user?.id === post.author.id;

  const like = useMutation({
    mutationFn: () => api<{ liked: boolean; likeCount: number }>(`/posts/${post.id}/like`, { method: post.liked ? 'DELETE' : 'POST' }),
    onMutate: () => setPost((p) => ({ ...p, liked: !p.liked, likeCount: p.likeCount + (p.liked ? -1 : 1) })),
    onSuccess: (r) => setPost((p) => ({ ...p, liked: r.liked, likeCount: r.likeCount })),
    onError: (e) => { setPost(initial); toastError(e); },
  });
  const bookmark = useMutation({
    mutationFn: () => api(`/posts/${post.id}/bookmark`, { method: post.bookmarked ? 'DELETE' : 'POST' }),
    onMutate: () => setPost((p) => ({ ...p, bookmarked: !p.bookmarked })),
    onSuccess: () => toast.success(post.bookmarked ? 'Removed from saved' : 'Saved'),
  });
  const save = useMutation({
    mutationFn: () => api<Post>(`/posts/${post.id}`, { method: 'PATCH', body: { body: draft } }),
    onSuccess: (p) => { setPost(p); setEditing(false); },
    onError: toastError,
  });
  const remove = async () => {
    setMenu(false);
    if (!(await confirm({ title: 'Delete this post?', body: 'This cannot be undone.', confirmLabel: 'Delete', danger: true }))) return;
    await api(`/posts/${post.id}`, { method: 'DELETE' }).then(() => { toast.success('Post deleted'); onDeleted?.(); }).catch(toastError);
  };
  const share = async () => {
    const url = `${location.origin}/posts/${post.id}`;
    if (navigator.share) await navigator.share({ url, title: 'ServeConnect' }).catch(() => {});
    else { await navigator.clipboard.writeText(url); toast.success('Link copied'); }
  };

  const kindLine = { event: 'posted an event', request: 'started a donation drive', gallery: 'shared event photos', milestone: 'reached a milestone', post: '' }[post.kind];

  return (
    <article className="card p-4 sm:p-5">
      <header className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <Link to={`/u/${post.author.handle}`} aria-hidden tabIndex={-1}><Avatar src={post.author.avatarUrl} name={post.author.name} size={40} /></Link>
          <div className="min-w-0">
            <Link to={`/u/${post.author.handle}`} className="flex items-center gap-1 font-semibold hover:underline"><span className="truncate">{post.author.name}</span>{post.author.verified && <VerifiedBadge />}</Link>
            <div className="truncate text-sm text-ink-faint">{kindLine && <span>{kindLine} · </span>}<Link to={`/posts/${post.id}`} className="hover:underline">{ago(post.createdAt)}</Link>{post.updatedAt !== post.createdAt && post.kind === 'post' && ' · edited'}</div>
          </div>
        </div>
        {user && (
          <div className="relative">
            <IconButton label="More options" onClick={() => setMenu((v) => !v)}><MoreHorizontal className="h-5 w-5" /></IconButton>
            {menu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
                <div className="absolute right-0 z-20 w-48 rounded-xl border border-paper-line bg-white p-1 shadow-lift">
                  {mine && post.kind === 'post' && <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-paper" onClick={() => { setEditing(true); setMenu(false); }}><Pencil className="h-4 w-4" />Edit</button>}
                  {(mine || user.role === 'admin') && <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-blood-600 hover:bg-paper" onClick={remove}><Trash2 className="h-4 w-4" />Delete</button>}
                  {!mine && <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-paper" onClick={() => { setReporting(true); setMenu(false); }}><Flag className="h-4 w-4" />Report post</button>}
                  <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-paper" onClick={() => { share(); setMenu(false); }}><Share2 className="h-4 w-4" />Share</button>
                </div>
              </>
            )}
          </div>
        )}
      </header>

      <div className="mt-3 space-y-3">
        {editing ? (
          <div className="space-y-2">
            <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={4} maxLength={5000} aria-label="Edit post" />
            <div className="flex justify-end gap-2"><Button variant="ghost" size="sm" onClick={() => setEditing(false)}>Cancel</Button><Button size="sm" loading={save.isPending} onClick={() => save.mutate()}>Save changes</Button></div>
          </div>
        ) : post.body && post.kind !== 'event' ? <RichText text={post.body} /> : null}
        <Gallery media={post.media} />
        {post.event && <EventAttachment e={post.event} />}
        {post.request && <RequestAttachment r={post.request} />}
        {post.poll && <PollView poll={post.poll} />}
      </div>

      <footer className="mt-3 flex items-center gap-1 border-t border-paper-line pt-2 text-sm font-semibold text-ink-soft">
        <button onClick={() => (user ? like.mutate() : nav('/login'))} aria-pressed={post.liked} className={clsx('flex items-center gap-1.5 rounded-lg px-3 py-2 hover:bg-paper', post.liked && 'text-blood-500')}>
          <Heart className={clsx('h-5 w-5', post.liked && 'fill-blood-500')} /> {post.likeCount || ''} <span className="sr-only">likes</span>
        </button>
        <button onClick={() => setShowComments((v) => !v)} className="flex items-center gap-1.5 rounded-lg px-3 py-2 hover:bg-paper">
          <MessageCircle className="h-5 w-5" /> {post.commentCount || ''} <span className="sr-only">comments</span>
        </button>
        <button onClick={share} className="flex items-center gap-1.5 rounded-lg px-3 py-2 hover:bg-paper"><Share2 className="h-5 w-5" /><span className="sr-only">Share</span></button>
        {user && (
          <button onClick={() => bookmark.mutate()} aria-pressed={post.bookmarked} className={clsx('ml-auto rounded-lg px-3 py-2 hover:bg-paper', post.bookmarked && 'text-brand-600')} aria-label="Save post">
            <Bookmark className={clsx('h-5 w-5', post.bookmarked && 'fill-brand-600')} />
          </button>
        )}
      </footer>
      {showComments && <Comments postId={post.id} onCount={(d) => setPost((p) => ({ ...p, commentCount: p.commentCount + d }))} />}
      <ReportDialog open={reporting} onClose={() => setReporting(false)} targetType="post" targetId={post.id} title="Report post" />
      {dialog}
    </article>
  );
}

export type { UserCard };
export { CalendarDays };
