/* Shared types and building blocks for the requests pages (blood requests + resource wishlists).
 * API shapes mirror server/src/modules/requests/routes.ts (camelCase). */
import { ReactNode, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { AlertTriangle, CalendarClock, CheckCircle2, Clock, Megaphone, RotateCcw, XCircle } from 'lucide-react';
import { api } from '../lib/api';
import { useNow } from '../lib/hooks';
import { plural } from '../lib/format';
import type { UserCard } from '../lib/types';
import { Button, FormError, Input, Modal, Pill, useConfirm } from './ui';
import { fromLocalInput, toLocalInput } from './EventsKit';

// ───────────────────────── API shapes ─────────────────────────
export type ReqStatus = 'open' | 'fulfilled' | 'closed';
export type Urgency = 'normal' | 'urgent' | 'critical';

export interface BloodRequest {
  id: string;
  requesterId: string;
  bloodGroup: string;
  component: string;
  unitsNeeded: number;
  unitsPledged: number;
  unitsReceived: number;
  patientLabel: string | null;
  hospitalName: string;
  address: string | null;
  lat: number;
  lng: number;
  urgency: Urgency;
  radiusKm: number;
  notes: string | null;
  isRare: boolean;
  neededBy: string;
  status: ReqStatus;
  broadcastCount: number;
  createdAt: string;
  updatedAt: string;
  requester?: UserCard;
  distanceKm: number | null;
  contactPhone: string | null;
  isMine: boolean;
  compatible?: boolean;
}

export interface BloodResponse {
  id: string;
  status: 'pledged' | 'donated' | 'cancelled';
  message: string | null;
  createdAt: string;
  donor: UserCard;
  donorPhone: string | null;
}

export interface BloodDetail extends BloodRequest {
  myResponse: { status: 'pledged' | 'donated' | 'cancelled'; message: string | null; createdAt: string } | null;
  responses: BloodResponse[];
  compatible: boolean;
  compatibleGroups: string[];
}

export interface BloodList {
  mine: BloodRequest[];
  nearby: BloodRequest[];
  donor: { optedIn: boolean; hasLocation: boolean; bloodGroup: string | null };
}

export interface ResourceCard {
  id: string;
  title: string;
  category: string;
  coverUrl: string | null;
  status: ReqStatus;
  locationName: string | null;
  deadline: string | null;
  createdAt: string;
  distanceKm: number | null;
  requester: UserCard;
  needed: number;
  pledged: number;
  topItems: { name: string; needed: number; pledged: number; unit: string }[] | null;
}

export interface ResourceItem {
  id: string;
  requestId: string;
  name: string;
  unit: string;
  quantityNeeded: number;
  quantityPledged: number;
  quantityReceived: number;
  position: number;
}

export interface MyPledge { id: string; itemId: string; quantity: number; status: 'pledged' | 'delivered' | 'cancelled'; note: string | null; createdAt: string }

export interface RequesterPledge extends MyPledge { itemName: string; unit: string; donor: UserCard }

export interface ResourceDetail {
  id: string;
  requesterId: string;
  title: string;
  description: string;
  category: string;
  coverUrl: string | null;
  locationName: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  deadline: string | null;
  status: ReqStatus;
  createdAt: string;
  updatedAt: string;
  requester: UserCard;
  items: ResourceItem[];
  myPledges: MyPledge[];
  donorCount: number;
  isMine: boolean;
  pledges?: RequesterPledge[];
}

// ───────────────────────── badges & pills ─────────────────────────
export const CATEGORY_ICON: Record<string, string> = { food: '🍚', clothing: '👕', medical: '💊', education: '📚', shelter: '🏠', hygiene: '🧼', disaster_relief: '🆘', other: '📦' };

/** Donation-drive cover image, or a calm marigold tile with the category glyph. */
export function DriveCover({ coverUrl, category, className }: { coverUrl: string | null; category: string; className?: string }) {
  return coverUrl ? (
    <img src={coverUrl} alt="" loading="lazy" className={clsx('object-cover', className)} />
  ) : (
    <div className={clsx('flex items-center justify-center bg-marigold-50 text-5xl', className)} aria-hidden>
      <span>{CATEGORY_ICON[category] ?? '📦'}</span>
    </div>
  );
}

/** The blood group set large in a blood-red tile — the anchor of every blood request card. */
export function BloodGroupBadge({ group, size = 'md', className }: { group: string; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const bombay = group.startsWith('Bombay');
  const dims = { sm: 'h-12 w-12 text-lg', md: 'h-16 w-16 text-2xl', lg: 'h-24 w-24 text-4xl' }[size];
  return (
    <div
      className={clsx('flex shrink-0 flex-col items-center justify-center rounded-2xl bg-blood-500 font-display font-extrabold leading-none text-white', dims, className)}
      aria-label={`Blood group ${group}`}
      role="img"
    >
      {bombay ? (
        <>
          <span className={size === 'lg' ? 'text-2xl' : size === 'md' ? 'text-base' : 'text-xs'}>Bombay</span>
          <span className={clsx('mt-0.5 opacity-90', size === 'lg' ? 'text-lg' : 'text-xs')}>hh</span>
        </>
      ) : (
        group
      )}
    </div>
  );
}

export function RarePill() {
  return <Pill tone="blood" className="border border-blood-500 bg-white" icon={<AlertTriangle className="h-3 w-3" aria-hidden />}>Rare</Pill>;
}

const URGENCY: Record<Urgency, { label: string; tone: 'blood' | 'marigold' | 'neutral' }> = {
  critical: { label: 'Critical', tone: 'blood' },
  urgent: { label: 'Urgent', tone: 'marigold' },
  normal: { label: 'Normal', tone: 'neutral' },
};
export function UrgencyPill({ urgency }: { urgency: Urgency }) {
  const u = URGENCY[urgency] ?? URGENCY.normal;
  return <Pill tone={u.tone} icon={urgency === 'critical' ? <AlertTriangle className="h-3 w-3" aria-hidden /> : <Clock className="h-3 w-3" aria-hidden />}>{u.label}</Pill>;
}

export const REQ_STATUS_LABEL: Record<ReqStatus, string> = { open: 'Open', fulfilled: 'Fulfilled', closed: 'Closed' };
export function ReqStatusPill({ status }: { status: ReqStatus }) {
  const tone = status === 'open' ? 'leaf' : status === 'fulfilled' ? 'brand' : 'neutral';
  return <Pill tone={tone}>{REQ_STATUS_LABEL[status] ?? status}</Pill>;
}

/** "in 5h 20m" style countdown, refreshed every 30 s. */
export function useDeadlineText(iso: string | null | undefined) {
  const now = useNow(30_000);
  if (!iso) return { text: 'No deadline', overdue: false, soon: false };
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return { text: 'Deadline passed', overdue: true, soon: false };
  const mins = Math.floor(ms / 60_000);
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  const text = d > 0 ? `${d}d ${h}h left` : h > 0 ? `${h}h ${m}m left` : `${Math.max(1, m)}m left`;
  return { text, overdue: false, soon: ms < 6 * 3600_000 };
}

export function DeadlineText({ iso, prefix, className }: { iso: string | null; prefix?: string; className?: string }) {
  const d = useDeadlineText(iso);
  return (
    <span className={clsx('inline-flex items-center gap-1', d.overdue ? 'text-ink-faint' : d.soon ? 'font-semibold text-blood-600' : 'text-ink-soft', className)}>
      <Clock className="h-4 w-4 shrink-0" aria-hidden />
      {prefix && !d.overdue ? `${prefix} ` : ''}{d.text}
    </span>
  );
}

export function InfoRow({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="mt-0.5 shrink-0 text-brand-500 [&>svg]:h-5 [&>svg]:w-5" aria-hidden>{icon}</div>
      <div className="min-w-0 text-[15px]">{children}</div>
    </div>
  );
}

// ───────────────────────── requester status tools ─────────────────────────
type Action = 'fulfilled' | 'close' | 'extend' | 'rebroadcast' | 'reopen';

/** Mark fulfilled / Close / Extend deadline / Re-broadcast / Reopen — shared by blood and resource requests. */
export function RequestStatusActions({
  kind, id, status, deadline, onUpdated,
}: { kind: 'blood' | 'resource'; id: string; status: ReqStatus; deadline: string | null; onUpdated: (data: any) => void }) {
  const [confirm, dialog] = useConfirm();
  const [extendOpen, setExtendOpen] = useState(false);
  const [when, setWhen] = useState('');
  const path = kind === 'blood' ? `/requests/blood/${id}/status` : `/requests/resources/${id}/status`;
  const m = useMutation({
    mutationFn: (v: { action: Action; at?: string }) =>
      api(path, { body: { action: v.action, ...(v.at ? (kind === 'blood' ? { neededBy: v.at } : { deadline: v.at }) : {}) } }),
    onSuccess: (data: any, v) => {
      onUpdated(data);
      if (v.action === 'fulfilled') toast.success('Marked as fulfilled. Pledged donors have been told.');
      if (v.action === 'close') toast.success('Request closed.');
      if (v.action === 'reopen') toast.success('Request reopened.');
      if (v.action === 'extend') { toast.success('Deadline extended.'); setExtendOpen(false); }
      if (v.action === 'rebroadcast') {
        toast.success(kind === 'blood'
          ? `Alert sent again to ${plural(data?.matchedDonors ?? 0, 'matching donor')}.`
          : 'Your followers have been reminded.');
      }
    },
  });
  const busy = (a: Action) => m.isPending && m.variables?.action === a;
  const run = async (a: Action) => {
    if (a === 'fulfilled' && !(await confirm({ title: 'Mark as fulfilled?', body: 'The request stops accepting new pledges and pledged donors are thanked.', confirmLabel: 'Mark fulfilled' }))) return;
    if (a === 'close' && !(await confirm({ title: 'Close this request?', body: 'Nobody will be able to pledge. You can reopen it later.', confirmLabel: 'Close request', danger: true }))) return;
    if (a === 'rebroadcast' && !(await confirm({
      title: 'Send the alert again?',
      body: kind === 'blood' ? 'Every compatible donor in range gets a fresh notification. Use this sparingly.' : 'Your followers get a reminder that this drive still needs help.',
      confirmLabel: 'Send again',
    }))) return;
    m.mutate({ action: a });
  };
  const openExtend = () => {
    const base = deadline && new Date(deadline) > new Date() ? new Date(deadline) : new Date();
    setWhen(toLocalInput(new Date(base.getTime() + 24 * 3600_000).toISOString()));
    m.reset();
    setExtendOpen(true);
  };
  const extendValid = when && new Date(when) > new Date();
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {status === 'open' ? (
          <>
            <Button size="sm" variant="secondary" icon={<CheckCircle2 className="h-4 w-4" />} loading={busy('fulfilled')} onClick={() => run('fulfilled')}>Mark fulfilled</Button>
            <Button size="sm" variant="outline" icon={<Megaphone className="h-4 w-4" />} loading={busy('rebroadcast')} onClick={() => run('rebroadcast')}>Re-broadcast</Button>
            <Button size="sm" variant="outline" icon={<CalendarClock className="h-4 w-4" />} onClick={openExtend}>Extend deadline</Button>
            <Button size="sm" variant="ghost" className="text-blood-600 hover:bg-blood-50 hover:text-blood-700" icon={<XCircle className="h-4 w-4" />} loading={busy('close')} onClick={() => run('close')}>Close</Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="secondary" icon={<RotateCcw className="h-4 w-4" />} loading={busy('reopen')} onClick={() => run('reopen')}>Reopen</Button>
            <Button size="sm" variant="outline" icon={<CalendarClock className="h-4 w-4" />} onClick={openExtend}>Extend &amp; reopen</Button>
          </>
        )}
      </div>
      {!extendOpen && <FormError error={m.error} />}
      {dialog}
      <Modal
        open={extendOpen}
        onClose={() => setExtendOpen(false)}
        title="Extend the deadline"
        size="sm"
        footer={<><Button variant="ghost" onClick={() => setExtendOpen(false)}>Cancel</Button><Button disabled={!extendValid} loading={busy('extend')} onClick={() => m.mutate({ action: 'extend', at: fromLocalInput(when) })}>Save deadline</Button></>}
      >
        <div className="space-y-3">
          <Input
            type="datetime-local"
            label={kind === 'blood' ? 'Needed by' : 'New deadline'}
            value={when}
            min={toLocalInput(new Date().toISOString())}
            onChange={(e) => setWhen(e.target.value)}
            error={when && !extendValid ? 'Choose a time in the future.' : undefined}
            hint="The request reopens if it was closed."
          />
          <FormError error={m.error} />
        </div>
      </Modal>
    </div>
  );
}

/** Two-line metric used in the detail side rails. */
export function Metric({ value, label, tone = 'ink' }: { value: ReactNode; label: string; tone?: 'ink' | 'blood' | 'leaf' | 'brand' }) {
  const c = { ink: 'text-ink', blood: 'text-blood-600', leaf: 'text-leaf-600', brand: 'text-brand-600' }[tone];
  return (
    <div className="rounded-xl bg-paper px-3 py-2.5 text-center">
      <div className={clsx('font-display text-2xl font-extrabold leading-none', c)}>{value}</div>
      <div className="mt-1 text-xs font-medium text-ink-soft">{label}</div>
    </div>
  );
}
