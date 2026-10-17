/* Messages: Teams/WhatsApp-style two-pane inbox — team group chats and 1:1 DMs, live over Socket.IO. */
import { KeyboardEvent, ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { isToday, isYesterday } from 'date-fns';
import {
  ArrowDown, ArrowLeft, Bell, BellOff, CalendarDays, Flag, ImagePlus, Loader2, MessageCircle, MoreVertical, Pencil, Search, Send, Trash2, Users, X,
} from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useMe } from '../lib/auth';
import { getSocket } from '../lib/socket';
import { ago, fmtDate, fmtTime, plural } from '../lib/format';
import { useMediaQuery } from '../lib/hooks';
import type { UserCard } from '../lib/types';
import { ReportDialog } from '../components/ReportDialog';
import { Avatar, Button, ButtonLink, EmptyState, IconButton, Modal, Skeleton, Spinner, UserLine, VerifiedBadge, toastError, useConfirm } from '../components/ui';

// ───────────────────────── API shapes (server/src/modules/chat/routes.ts) ─────────────────────────
interface Conv {
  id: string;
  type: 'team' | 'dm';
  title: string | null;
  lastMessageAt: string;
  teamId: string | null;
  muted: boolean;
  eventId: string | null;
  lastMessage: { body: string | null; senderId: string; createdAt: string; hasAttachment: boolean; deleted: boolean } | null;
  unread: number;
  other: UserCard | null;
  memberCount: number;
}
interface ConvDetail { id: string; type: 'team' | 'dm'; title: string | null; teamId: string | null; eventId: string | null; createdAt: string; members: UserCard[] }
interface Msg {
  id: string;
  conversationId: string;
  body: string | null;
  attachments: { url: string; type: string }[];
  createdAt: string;
  editedAt: string | null;
  deleted: boolean;
  sender: UserCard;
  pending?: boolean;
  previews?: string[];
}

const EDIT_WINDOW_MS = 15 * 60_000;
const GROUP_GAP_MS = 5 * 60_000;
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const convTitle = (c: { type: string; title: string | null; other?: UserCard | null }) => (c.type === 'team' ? c.title ?? 'Team chat' : c.other?.name ?? 'Direct message');
const dayLabel = (d: string) => (isToday(new Date(d)) ? 'Today' : isYesterday(new Date(d)) ? 'Yesterday' : fmtDate(d));

function TeamAvatar({ size = 44 }: { size?: number }) {
  return (
    <span className="inline-flex shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-600" style={{ width: size, height: size }} aria-hidden>
      <Users style={{ width: size * 0.48, height: size * 0.48 }} />
    </span>
  );
}

// ───────────────────────── conversation list ─────────────────────────
function ConversationList({ activeId, convs, loading, error, retry }: { activeId?: string; convs: Conv[]; loading: boolean; error: unknown; retry: () => void }) {
  const me = useMe();
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? convs.filter((c) => convTitle(c).toLowerCase().includes(s)) : convs;
  }, [convs, q]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 space-y-3 border-b border-paper-line p-3 sm:p-4">
        <h1 className="text-xl font-extrabold">{t('nav.messages', 'Messages')}</h1>
        {convs.length > 4 && (
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-ink-faint" aria-hidden />
            <input type="search" className="input py-2 pl-9 text-sm" placeholder="Search conversations" aria-label="Search conversations" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="space-y-1 p-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-2"><Skeleton className="h-11 w-11 rounded-full" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-1/2" /><Skeleton className="h-3 w-3/4" /></div></div>
            ))}
          </div>
        ) : error ? (
          <EmptyState title="Couldn't load your conversations" body={(error as Error).message} action={<Button variant="outline" size="sm" onClick={retry}>Try again</Button>} />
        ) : convs.length === 0 ? (
          <EmptyState
            icon={<MessageCircle />}
            title="No conversations yet"
            body="Team chats appear when an organizer adds you to an event team. Start a direct message from anyone's profile."
            action={<ButtonLink to="/events" variant="outline" size="sm">Find events</ButtonLink>}
          />
        ) : shown.length === 0 ? (
          <p className="p-6 text-center text-sm text-ink-faint">No conversations match "{q}".</p>
        ) : (
          <ul className="p-1.5" aria-label="Conversations">
            {shown.map((c) => {
              const lm = c.lastMessage;
              const preview = !lm ? (c.type === 'team' ? 'Say hello to your team' : 'No messages yet')
                : lm.deleted ? 'Message deleted'
                : `${lm.senderId === me.id ? 'You: ' : ''}${lm.body ?? (lm.hasAttachment ? '📷 Photo' : '')}`;
              const active = c.id === activeId;
              return (
                <li key={c.id}>
                  <Link
                    to={`/messages/${c.id}`}
                    aria-current={active ? 'page' : undefined}
                    className={clsx('flex items-center gap-3 rounded-xl px-2.5 py-2.5 transition', active ? 'bg-brand-50' : 'hover:bg-paper')}
                  >
                    {c.type === 'team' ? <TeamAvatar /> : <Avatar src={c.other?.avatarUrl} name={c.other?.name ?? '?'} size={44} />}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span className={clsx('flex min-w-0 flex-1 items-center gap-1 truncate', c.unread ? 'font-bold' : 'font-semibold')}>
                          <span className="truncate">{convTitle(c)}</span>
                          {c.type === 'dm' && c.other?.verified && <VerifiedBadge size={14} />}
                        </span>
                        <span className={clsx('shrink-0 text-xs', c.unread ? 'font-semibold text-brand-600' : 'text-ink-faint')}>{ago(lm?.createdAt ?? c.lastMessageAt)}</span>
                      </span>
                      <span className="mt-0.5 flex items-center gap-2">
                        <span className={clsx('min-w-0 flex-1 truncate text-sm', c.unread ? 'text-ink' : 'text-ink-faint', lm?.deleted && 'italic')}>{preview}</span>
                        {c.muted && <BellOff className="h-3.5 w-3.5 shrink-0 text-ink-faint" aria-label="Muted" />}
                        {c.unread > 0 && (
                          <span className={clsx('min-w-[20px] shrink-0 rounded-full px-1.5 text-center text-xs font-bold leading-5 text-white', c.muted ? 'bg-ink-faint' : 'bg-brand-600')} aria-label={`${c.unread} unread`}>
                            {c.unread > 99 ? '99+' : c.unread}
                          </span>
                        )}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

// ───────────────────────── message bubble ─────────────────────────
function Bubble({
  m, mine, showName, showAvatar, isAdmin, onEdit, onDelete, onReport, onMediaLoad,
}: {
  m: Msg; mine: boolean; showName: boolean; showAvatar: boolean; isAdmin: boolean; onMediaLoad: () => void;
  onEdit: (m: Msg, body: string) => Promise<void>; onDelete: (m: Msg) => void; onReport: (m: Msg) => void;
}) {
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(m.body ?? '');
  const [saving, setSaving] = useState(false);
  const canEdit = mine && !m.deleted && !m.pending && Boolean(m.body) && Date.now() - new Date(m.createdAt).getTime() < EDIT_WINDOW_MS;
  const canDelete = (mine || isAdmin) && !m.deleted && !m.pending;
  const canReport = !mine && !m.deleted;
  const hasMenu = canEdit || canDelete || canReport;
  const images = m.previews ?? m.attachments.map((a) => a.url);

  const save = async () => {
    const body = draft.trim();
    if (!body || body === m.body) return setEditing(false);
    setSaving(true);
    try {
      await onEdit(m, body);
      setEditing(false);
    } catch (e) {
      toastError(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={clsx('group flex items-end gap-2', mine ? 'justify-end' : 'justify-start', showName || showAvatar ? 'mt-2' : 'mt-0.5')}>
      {!mine && (
        <div className="w-8 shrink-0">
          {showAvatar && <Link to={`/u/${m.sender.handle}`} aria-label={m.sender.name}><Avatar src={m.sender.avatarUrl} name={m.sender.name} size={32} /></Link>}
        </div>
      )}
      {mine && hasMenu && !editing && <MenuButton open={menu} setOpen={setMenu} mine canEdit={canEdit} canDelete={canDelete} canReport={canReport} onEdit={() => { setDraft(m.body ?? ''); setEditing(true); }} onDelete={() => onDelete(m)} onReport={() => onReport(m)} />}
      <div className={clsx('min-w-0 max-w-[78%] sm:max-w-[70%]', mine && 'flex flex-col items-end')}>
        {showName && !mine && (
          <Link to={`/u/${m.sender.handle}`} className="mb-0.5 ml-1 flex items-center gap-1 text-xs font-semibold text-ink-soft hover:underline">
            {m.sender.name}{m.sender.verified && <VerifiedBadge size={12} />}
          </Link>
        )}
        {editing ? (
          <div className="w-[min(80vw,420px)] rounded-2xl border border-brand-300 bg-white p-2">
            <label htmlFor={`edit-${m.id}`} className="sr-only">Edit message</label>
            <textarea
              id={`edit-${m.id}`}
              className="input min-h-[60px] resize-none border-0 p-1 focus:ring-0"
              value={draft}
              maxLength={4000}
              autoFocus
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); save(); }
                if (e.key === 'Escape') setEditing(false);
              }}
            />
            <div className="flex justify-end gap-1.5">
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
              <Button size="sm" loading={saving} disabled={!draft.trim()} onClick={save}>Save</Button>
            </div>
          </div>
        ) : (
          <div
            className={clsx(
              'overflow-hidden rounded-2xl text-[15px]',
              m.deleted ? 'border border-dashed border-paper-line bg-transparent px-3 py-2 italic text-ink-faint'
                : mine ? 'rounded-br-md bg-brand-600 text-white' : 'rounded-bl-md border border-paper-line bg-white text-ink',
              m.pending && 'opacity-70',
            )}
          >
            {m.deleted ? (
              'This message was deleted'
            ) : (
              <>
                {images.length > 0 && (
                  <div className={clsx('grid gap-0.5', images.length > 1 ? 'grid-cols-2' : 'grid-cols-1')}>
                    {images.map((u, i) => (
                      <a key={u} href={u} target="_blank" rel="noreferrer" className="block bg-paper" aria-label={`Open photo ${i + 1}`}>
                        <img src={u} alt="" loading="lazy" onLoad={onMediaLoad} className={clsx('w-full object-cover', images.length > 1 ? 'aspect-square' : 'max-h-80')} />
                      </a>
                    ))}
                  </div>
                )}
                {m.body && <p className="whitespace-pre-wrap break-words px-3 py-2">{m.body}</p>}
              </>
            )}
          </div>
        )}
        <div className={clsx('mt-0.5 flex items-center gap-1 px-1 text-[11px] text-ink-faint', mine && 'justify-end')}>
          {m.pending ? <><Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Sending</> : <time dateTime={m.createdAt}>{fmtTime(m.createdAt)}</time>}
          {m.editedAt && !m.deleted && <span>· edited</span>}
        </div>
      </div>
      {!mine && hasMenu && <MenuButton open={menu} setOpen={setMenu} canEdit={false} canDelete={canDelete} canReport={canReport} onEdit={() => {}} onDelete={() => onDelete(m)} onReport={() => onReport(m)} />}
    </div>
  );
}

function MenuButton({ open, setOpen, mine, canEdit, canDelete, canReport, onEdit, onDelete, onReport }: {
  open: boolean; setOpen: (v: boolean) => void; mine?: boolean; canEdit: boolean; canDelete: boolean; canReport: boolean; onEdit: () => void; onDelete: () => void; onReport: () => void;
}) {
  const item = 'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm hover:bg-paper';
  const pick = (fn: () => void) => () => { setOpen(false); fn(); };
  return (
    <div className="relative mb-5 shrink-0">
      <IconButton
        label="Message actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={clsx('h-8 w-8 opacity-0 focus:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-60', open && 'opacity-100')}
      >
        <MoreVertical className="h-4 w-4" />
      </IconButton>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div role="menu" className={clsx('absolute bottom-9 z-40 w-40 rounded-xl border border-paper-line bg-white p-1 shadow-lift', mine ? 'right-0' : 'left-0')}>
            {canEdit && <button role="menuitem" className={item} onClick={pick(onEdit)}><Pencil className="h-4 w-4" /> Edit</button>}
            {canDelete && <button role="menuitem" className={clsx(item, 'text-blood-600')} onClick={pick(onDelete)}><Trash2 className="h-4 w-4" /> Delete</button>}
            {canReport && <button role="menuitem" className={item} onClick={pick(onReport)}><Flag className="h-4 w-4" /> Report</button>}
          </div>
        </>
      )}
    </div>
  );
}

// ───────────────────────── composer ─────────────────────────
function Composer({ convId, onSend, disabled }: { convId: string; onSend: (body: string, files: File[]) => Promise<boolean>; disabled?: boolean }) {
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const lastTyping = useRef(0);

  useEffect(() => { setText(''); setFiles([]); }, [convId]);
  useEffect(() => {
    const u = files.map((f) => URL.createObjectURL(f));
    setPreviews(u);
    return () => u.forEach(URL.revokeObjectURL);
  }, [files]);
  useLayoutEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const next = [...files];
    for (const f of Array.from(list)) {
      if (!ALLOWED.includes(f.type)) { toast.error(`${f.name}: only JPG, PNG, WebP or GIF images.`); continue; }
      if (f.size > 8 * 1024 * 1024) { toast.error(`${f.name} is larger than 8 MB.`); continue; }
      if (next.length >= 4) { toast.error('You can attach up to 4 photos.'); break; }
      next.push(f);
    }
    setFiles(next);
  };

  const send = async () => {
    const body = text.trim();
    if ((!body && !files.length) || sending) return;
    setSending(true);
    const prevText = text;
    const prevFiles = files;
    setText('');
    setFiles([]);
    const ok = await onSend(body, prevFiles);
    if (!ok) { setText(prevText); setFiles(prevFiles); }
    setSending(false);
    ta.current?.focus();
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };
  const onChange = (v: string) => {
    setText(v);
    const now = Date.now();
    if (v && now - lastTyping.current > 2500) {
      lastTyping.current = now;
      getSocket().emit('typing', convId);
    }
  };

  return (
    <div className="shrink-0 border-t border-paper-line bg-white p-2 sm:p-3">
      {files.length > 0 && (
        <ul className="mb-2 flex gap-2 overflow-x-auto" aria-label="Attached photos">
          {previews.map((u, i) => (
            <li key={u} className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-paper">
              <img src={u} alt="" className="h-full w-full object-cover" />
              <button type="button" aria-label={`Remove photo ${i + 1}`} onClick={() => setFiles(files.filter((_, j) => j !== i))} className="absolute right-0.5 top-0.5 rounded-full bg-ink/70 p-0.5 text-white">
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-end gap-1.5">
        <input ref={fileInput} type="file" accept={ALLOWED.join(',')} multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
        <IconButton label="Attach photos" className="h-10 w-10 shrink-0" disabled={disabled || files.length >= 4} onClick={() => fileInput.current?.click()}>
          <ImagePlus className="h-5 w-5" />
        </IconButton>
        <label htmlFor="composer" className="sr-only">Message</label>
        <textarea
          id="composer"
          ref={ta}
          rows={1}
          maxLength={4000}
          value={text}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKey}
          placeholder="Write a message"
          className="input max-h-40 min-h-[40px] flex-1 resize-none rounded-2xl py-2"
        />
        <IconButton
          label="Send message"
          className={clsx('h-10 w-10 shrink-0', (text.trim() || files.length) && !disabled ? 'bg-brand-600 text-white hover:bg-brand-700 hover:text-white' : '')}
          disabled={disabled || sending || (!text.trim() && !files.length)}
          onClick={send}
        >
          {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
        </IconButton>
      </div>
      <p className="mt-1 hidden px-12 text-[11px] text-ink-faint sm:block">Enter to send · Shift + Enter for a new line</p>
    </div>
  );
}

// ───────────────────────── thread ─────────────────────────
function Thread({ id, conv, onBack, showBack }: { id: string; conv?: Conv; onBack: () => void; showBack: boolean }) {
  const me = useMe();
  const qc = useQueryClient();
  const detail = useQuery({ queryKey: ['conversation', id], queryFn: () => api<ConvDetail>(`/chat/conversations/${id}`) });
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<unknown>(null);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [typing, setTyping] = useState<Record<string, number>>({});
  const [newBelow, setNewBelow] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [reportMsg, setReportMsg] = useState<Msg | null>(null);
  const [confirm, dialog] = useConfirm();
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const restore = useRef<number | null>(null);

  const nearBottom = () => {
    const el = scroller.current;
    return !el || el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };
  const toBottom = (smooth = false) => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    setNewBelow(false);
  };

  const markRead = useCallback(() => {
    if (document.visibilityState !== 'visible') return;
    api(`/chat/conversations/${id}/read`, { method: 'POST' })
      .then(() => {
        qc.setQueryData<Conv[]>(['conversations'], (old) => old?.map((c) => (c.id === id ? { ...c, unread: 0 } : c)));
        qc.invalidateQueries({ queryKey: ['chat-count'] });
      })
      .catch(() => {});
  }, [id, qc]);

  // Initial page
  const load = useCallback(() => {
    setLoading(true);
    setLoadErr(null);
    api<{ items: Msg[]; hasMore: boolean }>(`/chat/conversations/${id}/messages`)
      .then((r) => {
        setMsgs(r.items);
        setHasMore(r.hasMore);
        stick.current = true;
      })
      .catch(setLoadErr)
      .finally(() => setLoading(false));
  }, [id]);
  useEffect(() => {
    setMsgs([]);
    setTyping({});
    load();
    markRead();
  }, [id, load, markRead]);

  // Re-mark read when the tab becomes visible again.
  useEffect(() => {
    const f = () => document.visibilityState === 'visible' && markRead();
    document.addEventListener('visibilitychange', f);
    return () => document.removeEventListener('visibilitychange', f);
  }, [markRead]);

  // Realtime
  useEffect(() => {
    const s = getSocket();
    const join = () => s.emit('conversation:join', id);
    const onMessage = (m: Msg) => {
      if (m.conversationId !== id) return;
      stick.current = m.sender.id === me.id || nearBottom();
      if (!stick.current) setNewBelow(true);
      setMsgs((list) => (list.some((x) => x.id === m.id) ? list : [...list, m]));
      setTyping((t) => { const n = { ...t }; delete n[m.sender.id]; return n; });
      if (m.sender.id !== me.id) markRead();
    };
    const onEdited = (m: { id: string; conversationId: string; body: string; editedAt: string }) => {
      if (m.conversationId !== id) return;
      setMsgs((list) => list.map((x) => (x.id === m.id ? { ...x, body: m.body, editedAt: m.editedAt } : x)));
    };
    const onDeleted = (m: { id: string; conversationId: string }) => {
      if (m.conversationId !== id) return;
      setMsgs((list) => list.map((x) => (x.id === m.id ? { ...x, deleted: true, body: null, attachments: [] } : x)));
    };
    const onTyping = (d: { conversationId: string; userId: string }) => {
      if (d.conversationId !== id || d.userId === me.id) return;
      setTyping((t) => ({ ...t, [d.userId]: Date.now() }));
    };
    join();
    s.on('connect', join);
    s.on('message', onMessage);
    s.on('message:edited', onEdited);
    s.on('message:deleted', onDeleted);
    s.on('typing', onTyping);
    return () => {
      s.emit('conversation:leave', id);
      s.off('connect', join);
      s.off('message', onMessage);
      s.off('message:edited', onEdited);
      s.off('message:deleted', onDeleted);
      s.off('typing', onTyping);
    };
  }, [id, me.id, markRead]);

  // Typing indicators expire after 4 s of silence.
  useEffect(() => {
    if (!Object.keys(typing).length) return;
    const tm = setInterval(() => {
      setTyping((t) => {
        const now = Date.now();
        const n = Object.fromEntries(Object.entries(t).filter(([, at]) => now - at < 4000));
        return Object.keys(n).length === Object.keys(t).length ? t : n;
      });
    }, 1000);
    return () => clearInterval(tm);
  }, [typing]);

  // Scroll management: keep position when prepending, stick to bottom for new messages.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (restore.current !== null) {
      el.scrollTop = el.scrollHeight - restore.current;
      restore.current = null;
    } else if (stick.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [msgs]);

  const loadEarlier = async () => {
    if (!msgs.length || loadingEarlier) return;
    setLoadingEarlier(true);
    try {
      const r = await api<{ items: Msg[]; hasMore: boolean }>(`/chat/conversations/${id}/messages`, { query: { before: msgs.find((m) => !m.pending)?.createdAt } });
      const el = scroller.current;
      restore.current = el ? el.scrollHeight - el.scrollTop : null;
      stick.current = false;
      setMsgs((list) => [...r.items.filter((m) => !list.some((x) => x.id === m.id)), ...list]);
      setHasMore(r.hasMore);
    } catch (e) {
      toastError(e);
    } finally {
      setLoadingEarlier(false);
    }
  };

  const send = async (body: string, files: File[]): Promise<boolean> => {
    const tmpId = `tmp-${Date.now()}`;
    const previews = files.map((f) => URL.createObjectURL(f));
    stick.current = true;
    setMsgs((list) => [...list, {
      id: tmpId, conversationId: id, body: body || null, attachments: [], previews, createdAt: new Date().toISOString(), editedAt: null, deleted: false,
      sender: { id: me.id, name: me.name, handle: me.handle, avatarUrl: me.avatarUrl, role: me.role, verified: me.verificationStatus === 'verified' }, pending: true,
    }]);
    const form = new FormData();
    if (body) form.append('body', body);
    files.forEach((f) => form.append('files', f));
    try {
      const m = await api<Msg>(`/chat/conversations/${id}/messages`, { form });
      setMsgs((list) => {
        const without = list.filter((x) => x.id !== tmpId);
        return without.some((x) => x.id === m.id) ? without : [...without, m];
      });
      qc.setQueryData<Conv[]>(['conversations'], (old) => {
        if (!old) return old;
        const c = old.find((x) => x.id === id);
        if (!c) return old;
        const upd = { ...c, unread: 0, lastMessageAt: m.createdAt, lastMessage: { body: m.body, senderId: me.id, createdAt: m.createdAt, hasAttachment: m.attachments.length > 0, deleted: false } };
        return [upd, ...old.filter((x) => x.id !== id)];
      });
      return true;
    } catch (e) {
      setMsgs((list) => list.filter((x) => x.id !== tmpId));
      toastError(e);
      return false;
    } finally {
      setTimeout(() => previews.forEach(URL.revokeObjectURL), 5000);
    }
  };

  const edit = async (m: Msg, body: string) => {
    const r = await api<{ id: string; body: string; editedAt: string }>(`/chat/messages/${m.id}`, { method: 'PATCH', body: { body } });
    setMsgs((list) => list.map((x) => (x.id === m.id ? { ...x, body: r.body, editedAt: r.editedAt } : x)));
  };
  const del = async (m: Msg) => {
    if (!(await confirm({ title: 'Delete this message?', body: 'It will be removed for everyone in this conversation.', confirmLabel: 'Delete', danger: true }))) return;
    try {
      await api(`/chat/messages/${m.id}`, { method: 'DELETE' });
      setMsgs((list) => list.map((x) => (x.id === m.id ? { ...x, deleted: true, body: null, attachments: [] } : x)));
    } catch (e) {
      toastError(e);
    }
  };

  const muted = conv?.muted ?? false;
  const mute = useMutation({
    mutationFn: () => api<{ muted: boolean }>(`/chat/conversations/${id}/mute`, { body: { muted: !muted } }),
    onSuccess: (r) => {
      qc.setQueryData<Conv[]>(['conversations'], (old) => old?.map((c) => (c.id === id ? { ...c, muted: r.muted } : c)));
      qc.invalidateQueries({ queryKey: ['chat-count'] });
      toast.success(r.muted ? 'Conversation muted. You won’t get alerts for it.' : 'Notifications turned back on.');
    },
    onError: toastError,
  });

  const d = detail.data;
  const type = d?.type ?? conv?.type;
  const other = type === 'dm' ? d?.members.find((u) => u.id !== me.id) ?? conv?.other ?? null : null;
  const title = type === 'team' ? d?.title ?? conv?.title ?? 'Team chat' : other?.name ?? 'Direct message';
  const memberCount = d?.members.length ?? conv?.memberCount ?? 0;
  const eventId = d?.eventId ?? conv?.eventId ?? null;
  const names = new Map((d?.members ?? []).map((u) => [u.id, u.name.split(' ')[0]]));
  const typers = Object.keys(typing).map((uid) => names.get(uid) ?? 'Someone');
  const typingText = typers.length === 1 ? `${typers[0]} is typing…` : typers.length > 1 ? `${typers.length} people are typing…` : '';

  if (detail.isError) {
    const forbidden = detail.error instanceof ApiError && (detail.error.status === 403 || detail.error.status === 404);
    return (
      <div className="flex h-full flex-col">
        {showBack && <div className="border-b border-paper-line p-2"><IconButton label="Back to conversations" onClick={onBack}><ArrowLeft className="h-5 w-5" /></IconButton></div>}
        <EmptyState
          className="m-auto"
          title={forbidden ? "You can't open this conversation" : "Couldn't load this conversation"}
          body={detail.error.message}
          action={forbidden ? <ButtonLink to="/messages" variant="outline">Back to messages</ButtonLink> : <Button variant="outline" onClick={() => detail.refetch()}>Try again</Button>}
        />
      </div>
    );
  }

  const onMediaLoad = () => { if (stick.current) toBottom(); };

  // Build render rows: day separators + sender grouping.
  const rows: ReactNode[] = [];
  let prev: Msg | null = null;
  for (const m of msgs) {
    const newDay = !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
    if (newDay) {
      rows.push(
        <div key={`d-${m.id}`} className="my-3 flex justify-center" role="separator">
          <span className="rounded-full bg-paper px-3 py-1 text-xs font-semibold text-ink-soft">{dayLabel(m.createdAt)}</span>
        </div>,
      );
    }
    const firstOfGroup = newDay || !prev || prev.sender.id !== m.sender.id || new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() > GROUP_GAP_MS;
    rows.push(
      <Bubble
        key={m.id}
        m={m}
        mine={m.sender.id === me.id}
        showName={firstOfGroup && type === 'team'}
        showAvatar={firstOfGroup}
        isAdmin={me.role === 'admin'}
        onEdit={edit}
        onDelete={del}
        onReport={setReportMsg}
        onMediaLoad={onMediaLoad}
      />,
    );
    prev = m;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <header className="flex shrink-0 items-center gap-2 border-b border-paper-line bg-white px-2 py-2 sm:px-3">
        {showBack && <IconButton label="Back to conversations" onClick={onBack}><ArrowLeft className="h-5 w-5" /></IconButton>}
        {!d && detail.isPending && !conv ? (
          <div className="flex flex-1 items-center gap-3"><Skeleton className="h-10 w-10 rounded-full" /><Skeleton className="h-4 w-40" /></div>
        ) : type === 'dm' && other ? (
          <div className="min-w-0 flex-1">
            <UserLine user={other} sub={other.headline ?? 'View profile'} size={40} />
          </div>
        ) : (
          <button type="button" onClick={() => setMembersOpen(true)} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl p-1 text-left hover:bg-paper" aria-label={`${title}, ${plural(memberCount, 'member')}. Show members`}>
            <TeamAvatar size={40} />
            <span className="min-w-0">
              <span className="block truncate font-semibold">{title}</span>
              <span className="block truncate text-sm text-ink-faint">{typingText || plural(memberCount, 'member')}</span>
            </span>
          </button>
        )}
        <div className="flex shrink-0 items-center">
          {eventId && (
            <Link to={`/events/${eventId}`} className="hidden items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-brand-600 hover:bg-brand-50 sm:inline-flex">
              <CalendarDays className="h-4 w-4" aria-hidden /> Event
            </Link>
          )}
          {eventId && (
            <Link to={`/events/${eventId}`} aria-label="Open event" className="inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-soft hover:bg-paper sm:hidden"><CalendarDays className="h-5 w-5" /></Link>
          )}
          {type === 'team' && (
            <IconButton label="Members" className="hidden sm:inline-flex" onClick={() => setMembersOpen(true)}><Users className="h-5 w-5" /></IconButton>
          )}
          <IconButton label={muted ? 'Unmute conversation' : 'Mute conversation'} aria-pressed={muted} disabled={mute.isPending} onClick={() => mute.mutate()}>
            {muted ? <BellOff className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
          </IconButton>
        </div>
      </header>

      {/* Messages */}
      <div className="relative min-h-0 flex-1">
        <div
          ref={scroller}
          className="h-full overflow-y-auto bg-paper/60 px-3 py-3 sm:px-5"
          onScroll={() => { stick.current = nearBottom(); if (stick.current) setNewBelow(false); }}
          role="log"
          aria-label="Messages"
        >
          {loading ? (
            <div className="flex h-full items-center justify-center"><Spinner className="h-7 w-7" /></div>
          ) : loadErr ? (
            <EmptyState title="Couldn't load messages" body={(loadErr as Error).message} action={<Button variant="outline" onClick={load}>Try again</Button>} />
          ) : (
            <>
              {hasMore && (
                <div className="mb-2 flex justify-center">
                  <Button size="sm" variant="outline" loading={loadingEarlier} onClick={loadEarlier}>Load earlier messages</Button>
                </div>
              )}
              {msgs.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-center text-ink-soft">
                  <MessageCircle className="mb-2 h-10 w-10 text-ink-faint" aria-hidden />
                  <p className="font-semibold text-ink">No messages yet</p>
                  <p className="text-sm">{type === 'team' ? 'Introduce yourself and coordinate with your team.' : 'Say hello. Be kind and keep personal details safe.'}</p>
                </div>
              ) : rows}
            </>
          )}
        </div>
        {newBelow && (
          <button type="button" onClick={() => toBottom(true)} className="absolute bottom-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white shadow-lift">
            <ArrowDown className="h-4 w-4" aria-hidden /> New messages
          </button>
        )}
      </div>

      <div className="h-5 shrink-0 bg-white px-4 text-xs text-ink-faint" aria-live="polite">{type === 'dm' ? typingText : ''}</div>
      <Composer convId={id} onSend={send} disabled={loading || Boolean(loadErr)} />

      <Modal open={membersOpen} onClose={() => setMembersOpen(false)} title={`Members · ${memberCount}`} size="sm">
        {d ? (
          <ul className="space-y-3">
            {d.members.map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-2">
                <UserLine user={u} sub={u.id === me.id ? 'You' : u.headline ?? undefined} size={36} />
              </li>
            ))}
          </ul>
        ) : <Spinner />}
        {eventId && <ButtonLink to={`/events/${eventId}`} variant="outline" block className="mt-4" icon={<CalendarDays className="h-4 w-4" />}>Open the event</ButtonLink>}
      </Modal>
      {reportMsg && <ReportDialog open onClose={() => setReportMsg(null)} targetType="message" targetId={reportMsg.id} title="Report message" />}
      {dialog}
    </div>
  );
}

// ───────────────────────── start a DM via ?to=<userId> ─────────────────────────
function StartDm({ to, onBack, showBack }: { to: string; onBack: () => void; showBack: boolean }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [error, setError] = useState<Error | null>(null);
  const started = useRef<string | null>(null);
  useEffect(() => {
    if (started.current === to) return;
    started.current = to;
    setError(null);
    api<{ id: string }>(`/chat/dm/${to}`, { method: 'POST' })
      .then((r) => {
        qc.invalidateQueries({ queryKey: ['conversations'] });
        nav(`/messages/${r.id}`, { replace: true });
      })
      .catch((e) => setError(e));
  }, [to, nav, qc]);
  return (
    <div className="flex h-full flex-col">
      {showBack && <div className="border-b border-paper-line p-2"><IconButton label="Back to conversations" onClick={onBack}><ArrowLeft className="h-5 w-5" /></IconButton></div>}
      {error ? (
        <EmptyState className="m-auto" title="Can't start this conversation" body={error.message} action={<Button variant="outline" onClick={() => nav(-1)}>Go back</Button>} />
      ) : (
        <div className="m-auto flex flex-col items-center gap-2 text-ink-soft"><Spinner className="h-7 w-7" /> Opening conversation…</div>
      )}
    </div>
  );
}

export default function Messages() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const to = params.get('to');
  const nav = useNavigate();
  const twoPane = useMediaQuery('(min-width: 768px)');
  const list = useQuery({ queryKey: ['conversations'], queryFn: () => api<Conv[]>('/chat/conversations'), refetchInterval: 60_000 });
  const convs = list.data ?? [];
  const active = id ? convs.find((c) => c.id === id) : undefined;
  const threadOpen = Boolean(id || to);
  const back = () => nav('/messages');

  const originalTitle = useRef(document.title);
  useEffect(() => {
    const unread = convs.reduce((s, c) => s + (c.muted ? 0 : c.unread), 0);
    document.title = `${unread ? `(${unread}) ` : ''}Messages · ServeConnect`;
  }, [convs]);
  useEffect(() => {
    const original = originalTitle.current;
    return () => { document.title = original; };
  }, []);

  return (
    <div
      className={clsx(
        // Mobile/tablet: pin between the sticky top bar and the fixed bottom nav so only the thread scrolls.
        'fixed inset-x-0 bottom-0 top-0 z-20 flex bg-paper pb-[calc(60px+env(safe-area-inset-bottom))] pt-[59px]',
        'lg:static lg:z-auto lg:h-[calc(100vh-3.5rem)] lg:p-0',
      )}
    >
      <div className="flex min-h-0 w-full overflow-hidden bg-white md:m-3 md:rounded-2xl md:border md:border-paper-line lg:m-0">
        <aside className={clsx('min-h-0 w-full shrink-0 md:w-[300px] md:border-r md:border-paper-line lg:w-[320px]', threadOpen && !twoPane && 'hidden')} aria-label="Conversations">
          <ConversationList activeId={id} convs={convs} loading={list.isPending} error={list.isError ? list.error : null} retry={() => list.refetch()} />
        </aside>
        <section className={clsx('min-h-0 min-w-0 flex-1', !threadOpen && !twoPane && 'hidden')} aria-label="Conversation">
          {to && !id ? (
            <StartDm to={to} onBack={back} showBack={!twoPane} />
          ) : id ? (
            <Thread key={id} id={id} conv={active} onBack={back} showBack={!twoPane} />
          ) : (
            <div className="flex h-full flex-col items-center justify-center bg-paper/60 p-6 text-center">
              <MessageCircle className="mb-3 h-12 w-12 text-brand-200" aria-hidden />
              <h2 className="text-lg font-bold">Your conversations</h2>
              <p className="mt-1 max-w-xs text-sm text-ink-soft">Pick a team chat or direct message on the left. Messages arrive here in real time.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
