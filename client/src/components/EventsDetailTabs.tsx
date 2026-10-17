/* Tab panels for the event detail page: Discussion (Q&A + polls), Teams, Gallery, Reviews. */
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import {
  BarChart3, ChevronLeft, ChevronRight, Flag, ImageIcon, MessageCircle, MessagesSquare, Pin, PinOff, Plus, Reply, Star, Trash2, Users, X,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { SKILLS } from '../lib/constants';
import { ago, fmtDate } from '../lib/format';
import type { Poll, UserCard } from '../lib/types';
import { PollView } from './PollView';
import { ReportDialog } from './ReportDialog';
import { ImagePicker } from './ImagePicker';
import { Stars, StarInput } from './StarRating';
import {
  Avatar, Button, ButtonLink, Card, Checkbox, EmptyState, ErrorState, FormError, IconButton, Input, Modal, Pill, Skeleton, Textarea,
  UserLine, VerifiedBadge, fieldError, toastError, useConfirm,
} from './ui';
import { fromLocalInput, type EventDetail, type Team } from './EventsKit';

function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-3"><Skeleton className="h-10 w-10 rounded-full" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-4 w-4/5" /></div></div>
      ))}
    </div>
  );
}

// ───────────────────────── Discussion ─────────────────────────
interface Discussion {
  id: string;
  parentId: string | null;
  body: string;
  isPinned: boolean;
  createdAt: string;
  deleted: boolean;
  author: UserCard;
  byOrganizer: boolean;
}

export function DiscussionTab({ event }: { event: EventDetail }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [confirm, confirmDialog] = useConfirm();
  const [question, setQuestion] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [reportId, setReportId] = useState<string | null>(null);
  const [pollOpen, setPollOpen] = useState(false);
  const key = ['event', event.id, 'discussions'];

  const list = useQuery({ queryKey: key, queryFn: () => api<Discussion[]>(`/events/${event.id}/discussions`) });
  const polls = useQuery({ queryKey: ['event', event.id, 'polls'], queryFn: () => api<Poll[]>(`/events/${event.id}/polls`) });

  const threads = useMemo(() => {
    const all = list.data ?? [];
    const byId = new Map(all.map((d) => [d.id, d]));
    const rootOf = (d: Discussion): string => {
      let cur = d;
      for (let i = 0; i < 20 && cur.parentId && byId.has(cur.parentId); i++) cur = byId.get(cur.parentId)!;
      return cur.id;
    };
    const roots = all.filter((d) => !d.parentId);
    const replies = new Map<string, Discussion[]>();
    for (const d of all) {
      if (!d.parentId) continue;
      const r = rootOf(d);
      replies.set(r, [...(replies.get(r) ?? []), d]);
    }
    return roots.map((r) => ({ root: r, replies: (replies.get(r.id) ?? []).sort((a, b) => a.createdAt.localeCompare(b.createdAt)) }));
  }, [list.data]);

  const post = useMutation({
    mutationFn: (b: { body: string; parentId?: string }) => api(`/events/${event.id}/discussions`, { body: b }),
    onSuccess: (_d, b) => {
      qc.invalidateQueries({ queryKey: key });
      if (b.parentId) { setReply(''); setReplyTo(null); } else setQuestion('');
    },
  });
  const del = useMutation({
    mutationFn: (id: string) => api(`/events/${event.id}/discussions/${id}`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: key }); toast.success('Deleted'); },
    onError: toastError,
  });
  const pin = useMutation({
    mutationFn: (id: string) => api<{ pinned: boolean }>(`/events/${event.id}/discussions/${id}/pin`, { method: 'POST' }),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: key }); toast.success(r.pinned ? 'Pinned to the top' : 'Unpinned'); },
    onError: toastError,
  });

  const remove = async (d: Discussion) => {
    if (await confirm({ title: 'Delete this message?', body: 'It will show as “[deleted]” to everyone. Replies stay visible.', confirmLabel: 'Delete', danger: true })) del.mutate(d.id);
  };

  const renderItem = (d: Discussion, isRoot: boolean) => {
    const mine = user?.id === d.author.id;
    return (
      <div className="flex gap-3">
        <Link to={`/u/${d.author.handle}`} className="shrink-0" aria-hidden tabIndex={-1}><Avatar src={d.author.avatarUrl} name={d.author.name} size={isRoot ? 40 : 32} /></Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <Link to={`/u/${d.author.handle}`} className="inline-flex items-center gap-1 font-semibold text-ink hover:underline">{d.author.name}{d.author.verified && <VerifiedBadge size={14} />}</Link>
            {d.byOrganizer && <Pill tone="marigold">Organizer</Pill>}
            {d.isPinned && isRoot && <Pill tone="brand" icon={<Pin className="h-3 w-3" />}>Pinned</Pill>}
            <span className="text-ink-faint">{ago(d.createdAt)}</span>
          </div>
          <p className={clsx('prose-body mt-1', d.deleted && 'italic text-ink-faint')}>{d.body}</p>
          {!d.deleted && user && (
            <div className="mt-1 flex flex-wrap items-center gap-1 text-sm">
              {isRoot && event.status !== 'draft' && (
                <Button size="sm" variant="ghost" icon={<Reply className="h-4 w-4" />} onClick={() => { setReplyTo(replyTo === d.id ? null : d.id); setReply(''); }}>Reply</Button>
              )}
              {isRoot && event.isOwner && (
                <Button size="sm" variant="ghost" icon={d.isPinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />} disabled={pin.isPending} onClick={() => pin.mutate(d.id)}>{d.isPinned ? 'Unpin' : 'Pin'}</Button>
              )}
              {(mine || event.isOwner) && <Button size="sm" variant="ghost" icon={<Trash2 className="h-4 w-4" />} onClick={() => remove(d)}>Delete</Button>}
              {!mine && <Button size="sm" variant="ghost" icon={<Flag className="h-4 w-4" />} onClick={() => setReportId(d.id)}>Report</Button>}
            </div>
          )}
        </div>
      </div>
    );
  };

  const submitQuestion = (e: FormEvent) => {
    e.preventDefault();
    if (question.trim().length < 2) return;
    post.mutate({ body: question.trim() });
  };

  return (
    <div className="space-y-6">
      {/* Polls */}
      {(polls.data?.length || event.isOwner) ? (
        <section aria-labelledby="polls-h" className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 id="polls-h" className="text-lg font-bold">Polls</h2>
            {event.isOwner && event.status !== 'cancelled' && (
              <Button size="sm" variant="secondary" icon={<BarChart3 className="h-4 w-4" />} onClick={() => setPollOpen(true)}>Create poll</Button>
            )}
          </div>
          {polls.isPending ? <Skeleton className="h-32 w-full" /> : polls.data?.length ? (
            <div className="grid gap-3 md:grid-cols-2">{polls.data.map((p) => <PollView key={p.id} poll={p} />)}</div>
          ) : (
            <p className="text-sm text-ink-faint">Ask volunteers to vote on timings, T-shirt sizes or transport. Everyone registered gets notified.</p>
          )}
        </section>
      ) : null}

      <section aria-labelledby="qa-h" className="space-y-4">
        <h2 id="qa-h" className="text-lg font-bold">{t('events.qa', 'Questions & answers')}</h2>
        {user ? (
          event.status !== 'draft' && (
            <form onSubmit={submitQuestion} className="card space-y-2 p-4">
              <Textarea
                label={event.isOwner ? 'Post an update or answer' : 'Ask the organizer a question'}
                rows={3}
                maxLength={3000}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder={event.isOwner ? 'Share an update with volunteers' : 'Is parking available? What should I bring?'}
                error={!replyTo ? fieldError(post.error, 'body') : undefined}
              />
              {!replyTo && post.error && !fieldError(post.error, 'body') ? <FormError error={post.error} /> : null}
              <div className="flex justify-end">
                <Button type="submit" loading={post.isPending && !replyTo} disabled={question.trim().length < 2}>{event.isOwner ? 'Post' : 'Ask question'}</Button>
              </div>
            </form>
          )
        ) : (
          <Card className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-ink-soft">Sign in to ask the organizer a question.</p>
            <ButtonLink to={`/login?next=${encodeURIComponent(`/events/${event.id}?tab=discussion`)}`} variant="secondary">Sign in</ButtonLink>
          </Card>
        )}

        {list.isPending ? <ListSkeleton /> : list.isError ? <ErrorState error={list.error} retry={() => list.refetch()} /> : threads.length === 0 ? (
          <EmptyState icon={<MessagesSquare />} title="No questions yet" body="Questions and answers here are visible to everyone viewing the event." />
        ) : (
          <ul className="space-y-3">
            {threads.map(({ root, replies }) => (
              <li key={root.id} className={clsx('card p-4', root.isPinned && 'border-brand-200')}>
                {renderItem(root, true)}
                {(replies.length > 0 || replyTo === root.id) && (
                  <div className="ml-5 mt-3 space-y-3 border-l-2 border-paper-line pl-4 sm:ml-12">
                    {replies.map((r) => <div key={r.id}>{renderItem(r, false)}</div>)}
                    {replyTo === root.id && (
                      <form
                        className="space-y-2"
                        onSubmit={(e) => { e.preventDefault(); if (reply.trim().length >= 2) post.mutate({ body: reply.trim(), parentId: root.id }); }}
                      >
                        <Textarea label="Your reply" rows={2} maxLength={3000} value={reply} onChange={(e) => setReply(e.target.value)} autoFocus error={fieldError(post.error, 'body')} />
                        {post.error && !fieldError(post.error, 'body') ? <FormError error={post.error} /> : null}
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="ghost" onClick={() => setReplyTo(null)}>Cancel</Button>
                          <Button size="sm" type="submit" loading={post.isPending} disabled={reply.trim().length < 2}>Reply</Button>
                        </div>
                      </form>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {reportId && <ReportDialog open onClose={() => setReportId(null)} targetType="discussion" targetId={reportId} title="Report message" />}
      <CreatePollModal eventId={event.id} open={pollOpen} onClose={() => setPollOpen(false)} />
      {confirmDialog}
    </div>
  );
}

function CreatePollModal({ eventId, open, onClose }: { eventId: string; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [multi, setMulti] = useState(false);
  const [closesAt, setClosesAt] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const reset = () => { setQuestion(''); setOptions(['', '']); setMulti(false); setClosesAt(''); setErr(null); };
  const m = useMutation({
    mutationFn: () => api<Poll>(`/events/${eventId}/polls`, {
      body: { question: question.trim(), options: options.map((o) => o.trim()).filter(Boolean), multi, closesAt: closesAt ? fromLocalInput(closesAt) : null },
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['event', eventId, 'polls'] });
      toast.success('Poll posted. Registered volunteers have been notified.');
      reset();
      onClose();
    },
  });
  const submit = () => {
    const filled = options.map((o) => o.trim()).filter(Boolean);
    if (question.trim().length < 3) return setErr('Write a question of at least 3 characters.');
    if (filled.length < 2) return setErr('Add at least 2 options.');
    if (closesAt && new Date(closesAt) <= new Date()) return setErr('The closing time must be in the future.');
    setErr(null);
    m.mutate();
  };
  return (
    <Modal open={open} onClose={onClose} title="Create a poll"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={m.isPending} onClick={submit}>Post poll</Button></>}>
      <div className="space-y-4">
        <Input label="Question" maxLength={200} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Which reporting time works best?" error={fieldError(m.error, 'question')} />
        <fieldset className="space-y-2">
          <legend className="mb-1.5 text-sm font-semibold">Options</legend>
          {options.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <input className="input" aria-label={`Option ${i + 1}`} maxLength={80} value={o} placeholder={`Option ${i + 1}`} onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value : x)))} />
              {options.length > 2 && (
                <IconButton label={`Remove option ${i + 1}`} onClick={() => setOptions(options.filter((_, j) => j !== i))}><X className="h-4 w-4" /></IconButton>
              )}
            </div>
          ))}
          {options.length < 6 && <Button size="sm" variant="ghost" icon={<Plus className="h-4 w-4" />} onClick={() => setOptions([...options, ''])}>Add option</Button>}
          {fieldError(m.error, 'options') && <p role="alert" className="text-sm text-blood-600">{fieldError(m.error, 'options')}</p>}
        </fieldset>
        <Checkbox label="Allow choosing more than one option" checked={multi} onChange={setMulti} />
        <Input label="Closes at" optional type="datetime-local" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} hint="Leave empty to keep the poll open." />
        {err && <FormError error={err} />}
        <FormError error={m.error} />
      </div>
    </Modal>
  );
}

// ───────────────────────── Teams ─────────────────────────
export function TeamsTab({ event }: { event: EventDetail }) {
  const q = useQuery({ queryKey: ['teams', event.id], queryFn: () => api<Team[]>(`/teams/events/${event.id}/teams`) });
  if (q.isPending) return <ListSkeleton />;
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const teams = q.data;
  return (
    <div className="space-y-4">
      {event.isOwner && (
        <Card className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-ink-soft">Create teams, assign leads and auto-group volunteers by skill from the manage page.</p>
          <ButtonLink to={`/events/${event.id}/manage?tab=teams`} variant="secondary" icon={<Users className="h-4 w-4" />}>Manage teams</ButtonLink>
        </Card>
      )}
      {teams.length === 0 ? (
        <EmptyState icon={<Users />} title={event.isOwner ? 'No teams yet' : 'You are not in a team yet'} body={event.isOwner ? 'Teams get their own group chat so leads can coordinate on the day.' : 'The organizer will assign you to a team before the event. You will get a notification.'} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {teams.map((tm) => (
            <Card key={tm.id} className="flex flex-col">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-lg font-bold">{tm.name}</h3>
                  {tm.roleDescription && <p className="text-sm text-ink-soft">{tm.roleDescription}</p>}
                </div>
                <Pill>{tm.members.length} {tm.members.length === 1 ? 'member' : 'members'}</Pill>
              </div>
              {tm.lead && (
                <div className="mt-3">
                  <div className="mb-1 text-xs font-semibold text-ink-faint">Team lead</div>
                  <UserLine user={tm.lead} size={32} />
                </div>
              )}
              <ul className="mt-3 divide-y divide-paper-line">
                {tm.members.filter((m) => m.user.id !== tm.lead?.id).map((m) => (
                  <li key={m.user.id} className="flex items-center justify-between gap-2 py-2">
                    <UserLine user={m.user} size={28} sub={m.skills.slice(0, 3).map((s) => SKILLS[s] ?? s).join(' · ') || undefined} />
                    {m.role && <Pill tone="brand" className="shrink-0">{m.role}</Pill>}
                  </li>
                ))}
              </ul>
              <div className="mt-auto pt-3">
                {tm.conversationId ? (
                  <ButtonLink to={`/messages/${tm.conversationId}`} variant="outline" size="sm" icon={<MessageCircle className="h-4 w-4" />}>Open team chat</ButtonLink>
                ) : (
                  <p className="text-sm text-ink-faint">Team chat will appear once members are added.</p>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ───────────────────────── Gallery ─────────────────────────
interface Photo { id: string; url: string; caption: string | null; createdAt: string; uploader: UserCard }

function Lightbox({ photos, index, onClose, onIndex }: { photos: Photo[]; index: number; onClose: () => void; onIndex: (i: number) => void }) {
  const p = photos[index];
  const prev = useCallback(() => onIndex((index - 1 + photos.length) % photos.length), [index, photos.length, onIndex]);
  const next = useCallback(() => onIndex((index + 1) % photos.length), [index, photos.length, onIndex]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose, prev, next]);
  if (!p) return null;
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Photo viewer" className="fixed inset-0 z-50 flex flex-col bg-ink/95 text-white" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-sm opacity-80">{index + 1} / {photos.length}</span>
        <button type="button" aria-label="Close" autoFocus onClick={onClose} className="rounded-full p-2 hover:bg-white/10"><X className="h-6 w-6" /></button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        <img src={p.url} alt={p.caption ?? 'Event photo'} className="max-h-full max-w-full rounded-lg object-contain" />
        {photos.length > 1 && (
          <>
            <button type="button" aria-label="Previous photo" onClick={prev} className="absolute left-2 rounded-full bg-black/40 p-2 hover:bg-black/60"><ChevronLeft className="h-6 w-6" /></button>
            <button type="button" aria-label="Next photo" onClick={next} className="absolute right-2 rounded-full bg-black/40 p-2 hover:bg-black/60"><ChevronRight className="h-6 w-6" /></button>
          </>
        )}
      </div>
      <div className="px-4 py-4 text-center text-sm">
        {p.caption && <p className="mb-1 text-base">{p.caption}</p>}
        <p className="opacity-70">Added by {p.uploader.name} · {fmtDate(p.createdAt)}</p>
      </div>
    </div>,
    document.body,
  );
}

export function GalleryTab({ event }: { event: EventDetail }) {
  const qc = useQueryClient();
  const [confirm, confirmDialog] = useConfirm();
  const [files, setFiles] = useState<File[]>([]);
  const [caption, setCaption] = useState('');
  const [open, setOpen] = useState<number | null>(null);
  const key = ['event', event.id, 'gallery'];
  const q = useQuery({ queryKey: key, queryFn: () => api<Photo[]>(`/events/${event.id}/gallery`) });
  const canUpload = event.isOwner && event.status === 'completed';

  const upload = useMutation({
    mutationFn: () => {
      const form = new FormData();
      files.forEach((f) => form.append('files', f));
      if (caption.trim()) form.append('caption', caption.trim());
      return api<{ added: number }>(`/events/${event.id}/gallery`, { form });
    },
    onSuccess: (r) => {
      toast.success(`${r.added} photo${r.added === 1 ? '' : 's'} added and shared with your followers.`);
      setFiles([]); setCaption('');
      qc.invalidateQueries({ queryKey: key });
    },
  });
  const del = useMutation({
    mutationFn: (id: string) => api(`/events/${event.id}/gallery/${id}`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: key }); toast.success('Photo deleted'); },
    onError: toastError,
  });
  const photos = q.data ?? [];

  return (
    <div className="space-y-4">
      {canUpload && (
        <Card className="space-y-3">
          <h2 className="text-lg font-bold">Add photos</h2>
          <p className="text-sm text-ink-soft">Photos are posted to your followers' feeds and attendees are notified. Only share photos of people who agreed to be photographed.</p>
          <ImagePicker files={files} onChange={setFiles} max={10} label="Choose photos" />
          {files.length > 0 && (
            <>
              <Input label="Caption" optional maxLength={300} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Thank you to everyone who showed up" />
              <FormError error={upload.error} />
              <div className="flex justify-end"><Button loading={upload.isPending} onClick={() => upload.mutate()}>Upload {files.length} photo{files.length === 1 ? '' : 's'}</Button></div>
            </>
          )}
        </Card>
      )}
      {event.isOwner && event.status !== 'completed' && (
        <p className="text-sm text-ink-faint">You can add photos once the event is marked complete.</p>
      )}
      {q.isPending ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="aspect-square w-full" />)}</div>
      ) : q.isError ? <ErrorState error={q.error} retry={() => q.refetch()} /> : photos.length === 0 ? (
        <EmptyState icon={<ImageIcon />} title="No photos yet" body={event.status === 'completed' ? 'The organizer has not shared photos from this event yet.' : 'Photos from the day will appear here after the event.'} />
      ) : (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {photos.map((p, i) => (
            <li key={p.id} className="group relative aspect-square overflow-hidden rounded-xl bg-paper">
              <button type="button" className="h-full w-full" onClick={() => setOpen(i)} aria-label={`Open photo${p.caption ? `: ${p.caption}` : ` ${i + 1}`}`}>
                <img src={p.url} alt="" loading="lazy" className="h-full w-full object-cover" />
              </button>
              {event.isOwner && (
                <button
                  type="button"
                  aria-label="Delete photo"
                  onClick={async () => { if (await confirm({ title: 'Delete this photo?', body: 'It will be removed from the event gallery.', confirmLabel: 'Delete', danger: true })) del.mutate(p.id); }}
                  className="absolute right-2 top-2 rounded-full bg-ink/70 p-1.5 text-white hover:bg-ink"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {open !== null && <Lightbox photos={photos} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />}
      {confirmDialog}
    </div>
  );
}

// ───────────────────────── Reviews ─────────────────────────
interface Review { id: string; rating: number; body: string | null; createdAt: string; reviewer: UserCard }

export function ReviewsTab({ event }: { event: EventDetail }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState('');
  const key = ['event', event.id, 'reviews'];
  const q = useQuery({ queryKey: key, queryFn: () => api<{ items: Review[]; distribution: { rating: number; n: number }[] }>(`/events/${event.id}/reviews`) });
  const my = event.myRegistration;
  const canReview = Boolean(user && event.status === 'completed' && my?.status === 'attended' && my.checkedInAt && !my.reviewed);

  const m = useMutation({
    mutationFn: () => api(`/events/${event.id}/reviews`, { body: { rating, body: body.trim() || undefined } }),
    onSuccess: () => {
      toast.success('Thanks for your review');
      setRating(0); setBody('');
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ['event', event.id] });
    },
  });

  const items = q.data?.items ?? [];
  const total = items.length;
  const avg = total ? items.reduce((a, r) => a + r.rating, 0) / total : 0;
  const dist = new Map((q.data?.distribution ?? []).map((d) => [Number(d.rating), d.n]));

  return (
    <div className="space-y-5">
      {canReview && (
        <Card className="space-y-3 border-marigold-100 bg-marigold-50/40">
          <h2 className="text-lg font-bold">How was this event?</h2>
          <p className="text-sm text-ink-soft">Your rating helps other volunteers choose well-run events. Only verified attendees can review.</p>
          <StarInput value={rating} onChange={setRating} />
          {fieldError(m.error, 'rating') && <p role="alert" className="text-sm text-blood-600">{fieldError(m.error, 'rating')}</p>}
          <Textarea label="What went well, and what could be better?" optional rows={3} maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} />
          {m.error && !fieldError(m.error, 'rating') ? <FormError error={m.error} /> : null}
          <div className="flex justify-end"><Button disabled={!rating} loading={m.isPending} onClick={() => m.mutate()}>Submit review</Button></div>
        </Card>
      )}
      {my?.reviewed && <p className="text-sm text-leaf-700">You reviewed this event. Thank you.</p>}

      {q.isPending ? <ListSkeleton /> : q.isError ? <ErrorState error={q.error} retry={() => q.refetch()} /> : total === 0 ? (
        <EmptyState icon={<Star />} title="No reviews yet" body={event.status === 'completed' ? 'Volunteers who attended can leave a review.' : 'Reviews open once the event is complete.'} />
      ) : (
        <>
          <Card className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <div className="text-center sm:w-40">
              <div className="font-display text-5xl font-extrabold">{avg.toFixed(1)}</div>
              <Stars value={avg} size={18} />
              <div className="mt-1 text-sm text-ink-soft">{total} review{total === 1 ? '' : 's'}</div>
            </div>
            <ul className="flex-1 space-y-1.5" aria-label="Rating distribution">
              {[5, 4, 3, 2, 1].map((s) => {
                const n = dist.get(s) ?? 0;
                return (
                  <li key={s} className="flex items-center gap-2 text-sm">
                    <span className="w-12 shrink-0 text-ink-soft">{s} star</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-paper-line" aria-hidden>
                      <div className="h-full rounded-full bg-marigold-400" style={{ width: `${total ? (n / total) * 100 : 0}%` }} />
                    </div>
                    <span className="w-8 shrink-0 text-right tabular-nums text-ink-soft">{n}</span>
                  </li>
                );
              })}
            </ul>
          </Card>
          <ul className="space-y-3">
            {items.map((r) => (
              <li key={r.id} className="card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <UserLine user={r.reviewer} size={36} sub={ago(r.createdAt)} />
                  <Stars value={r.rating} />
                </div>
                {r.body && <p className="prose-body mt-2">{r.body}</p>}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
