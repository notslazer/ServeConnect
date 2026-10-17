import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import {
  ArrowLeft, CalendarClock, CheckCircle2, ExternalLink, Flag, Gift, MapPin, Minus, Navigation, PackageCheck, Pencil, Plus, Share2, Users, X,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useMe } from '../../lib/auth';
import { getSocket } from '../../lib/socket';
import { RESOURCE_CATEGORIES } from '../../lib/constants';
import { ago, fmtDateTime, fmtShort, plural } from '../../lib/format';
import { MapView } from '../../components/Map';
import { ReportDialog } from '../../components/ReportDialog';
import {
  Button, ButtonLink, Card, ErrorState, FormError, IconButton, Modal, PageHeader, Pill, ProgressBar, Skeleton, Textarea, UserLine, toastError, useConfirm,
} from '../../components/ui';
import { directionsUrl, shareLink } from '../../components/EventsKit';
import {
  DeadlineText, DriveCover, Metric, ReqStatusPill, RequestStatusActions, ResourceDetail as Detail, ResourceItem,
} from '../../components/RequestsKit';

function DetailSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <Skeleton className="aspect-[16/9] w-full rounded-2xl sm:aspect-[21/8]" />
      <Skeleton className="h-8 w-2/3" />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-2xl" />)}</div>
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    </div>
  );
}

/** Joins the live `request:<id>` room and patches wishlist counts in the query cache as pledges arrive. */
function useLiveWishlist(id: string) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!id) return;
    const s = getSocket();
    const room = `request:${id}`;
    const join = () => s.emit('watch', room);
    const onUpdate = (d: { requestId: string; items: ResourceItem[] }) => {
      if (d.requestId !== id) return;
      qc.setQueryData<Detail>(['resource', id], (old) => (old ? { ...old, items: d.items } : old));
    };
    join();
    s.on('connect', join);
    s.on('wishlist:update', onUpdate);
    return () => {
      s.emit('unwatch', room);
      s.off('connect', join);
      s.off('wishlist:update', onUpdate);
    };
  }, [id, qc]);
}

function PledgeModal({ item, requestId, onClose, onDone }: { item: ResourceItem | null; requestId: string; onClose: () => void; onDone: (d: Detail) => void }) {
  const remaining = item ? Math.max(0, item.quantityNeeded - item.quantityPledged) : 0;
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState('');
  useEffect(() => { setQty(1); setNote(''); }, [item?.id]);
  // If someone else pledges while the dialog is open, keep the quantity within what's still needed.
  useEffect(() => { if (remaining > 0 && qty > remaining) setQty(remaining); }, [remaining, qty]);
  const m = useMutation({
    mutationFn: () => api<Detail>(`/requests/resources/${requestId}/pledges`, { body: { itemId: item!.id, quantity: qty, note: note.trim() || undefined } }),
    onSuccess: (d) => {
      toast.success(`Thank you! You pledged ${qty} ${item!.unit} of ${item!.name}.`);
      onDone(d);
      onClose();
    },
  });
  useEffect(() => { m.reset(); }, [item?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const clamp = (n: number) => Math.max(1, Math.min(remaining || 1, Math.round(n) || 1));
  return (
    <Modal
      open={Boolean(item)}
      onClose={onClose}
      title={item ? `Pledge ${item.name}` : 'Pledge'}
      size="sm"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button disabled={remaining <= 0} loading={m.isPending} icon={<Gift className="h-4 w-4" />} onClick={() => m.mutate()}>Pledge {qty} {item?.unit}</Button></>}
    >
      {item && (
        <div className="space-y-4">
          <p className="text-sm text-ink-soft">
            {remaining > 0 ? <>Still needed: <strong className="text-ink">{remaining} {item.unit}</strong>. Pledge only what you can drop off or send.</> : 'This item has just been fully pledged. Thank you for wanting to help.'}
          </p>
          <div>
            <label htmlFor="pledge-qty" className="mb-1.5 block text-sm font-semibold">Quantity ({item.unit})</label>
            <div className="flex items-center gap-2">
              <Button variant="outline" aria-label="Decrease quantity" className="h-12 w-12 !p-0" disabled={qty <= 1} onClick={() => setQty((q) => clamp(q - 1))}><Minus className="h-5 w-5" /></Button>
              <input id="pledge-qty" type="number" inputMode="numeric" min={1} max={remaining} className="input w-24 text-center font-display text-xl font-bold" value={qty} onChange={(e) => setQty(clamp(Number(e.target.value)))} />
              <Button variant="outline" aria-label="Increase quantity" className="h-12 w-12 !p-0" disabled={qty >= remaining} onClick={() => setQty((q) => clamp(q + 1))}><Plus className="h-5 w-5" /></Button>
              {remaining > 1 && <Button variant="ghost" size="sm" onClick={() => setQty(remaining)}>All {remaining}</Button>}
            </div>
          </div>
          <Textarea label="Note for the organizer" optional rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Will drop off Saturday morning" />
          <FormError error={m.error} />
        </div>
      )}
    </Modal>
  );
}

function WishlistItem({ item, canPledge, onPledge, myQty }: { item: ResourceItem; canPledge: boolean; onPledge: () => void; myQty: number }) {
  const pledged = Math.min(item.quantityPledged, item.quantityNeeded);
  const remaining = Math.max(0, item.quantityNeeded - item.quantityPledged);
  const done = remaining === 0;
  return (
    <li className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-base font-bold">
            {done && <CheckCircle2 className="h-5 w-5 shrink-0 text-leaf-500" aria-hidden />}
            <span className="break-words">{item.name}</span>
          </h3>
          <p className="text-sm text-ink-soft">
            <span className="font-semibold text-ink tabular-nums">{pledged}</span> of {item.quantityNeeded} {item.unit} pledged
            {item.quantityReceived > 0 && <> · <span className="text-leaf-600">{item.quantityReceived} received</span></>}
          </p>
        </div>
        {done ? (
          <Pill tone="leaf">Fully pledged</Pill>
        ) : canPledge ? (
          <Button size="sm" onClick={onPledge} icon={<Gift className="h-4 w-4" />}>Pledge</Button>
        ) : null}
      </div>
      <div className="mt-3 space-y-1">
        <ProgressBar value={item.quantityPledged} max={item.quantityNeeded} tone={done ? 'leaf' : 'marigold'} />
        <div className="flex justify-between text-xs text-ink-faint">
          <span>{done ? 'Nothing more needed' : `${remaining} ${item.unit} still needed`}</span>
          {myQty > 0 && <span className="font-semibold text-brand-600">You pledged {myQty}</span>}
        </div>
      </div>
    </li>
  );
}

function RequesterPledges({ d, onChanged }: { d: Detail; onChanged: () => void }) {
  const pledges = d.pledges ?? [];
  const [confirm, dialog] = useConfirm();
  const m = useMutation({
    mutationFn: (pid: string) => api(`/requests/pledges/${pid}`, { method: 'PATCH', body: { status: 'delivered' } }),
    onSuccess: () => { toast.success('Marked as received. The donor has been thanked.'); onChanged(); },
    onError: toastError,
  });
  const sorted = [...pledges].sort((a, b) => (a.status === b.status ? 0 : a.status === 'pledged' ? -1 : 1));
  const pending = pledges.filter((p) => p.status === 'pledged').length;
  return (
    <section aria-labelledby="pledges-h">
      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-2 border-b border-paper-line px-4 py-3 sm:px-5">
          <PackageCheck className="h-5 w-5 text-ink-soft" aria-hidden />
          <h2 id="pledges-h" className="text-base font-bold">Pledges</h2>
          <span className="rounded-full bg-paper px-2 text-xs font-semibold text-ink-soft">{pledges.length}</span>
          {pending > 0 && <span className="ml-auto text-sm text-ink-faint">{pending} awaiting delivery</span>}
        </div>
        {pledges.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-ink-soft">No pledges yet. Share the drive with your followers and WhatsApp groups to get started.</p>
        ) : (
          <ul className="divide-y divide-paper-line">
            {sorted.map((p) => (
              <li key={p.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center sm:px-5">
                <UserLine user={p.donor} sub={ago(p.createdAt)} size={34} />
                <div className="min-w-0 text-sm">
                  <div><span className="font-display font-bold tabular-nums">{p.quantity}</span> {p.unit} · {p.itemName}</div>
                  {p.note && <div className="truncate text-ink-faint" title={p.note}>"{p.note}"</div>}
                </div>
                <div className="flex items-center gap-2 sm:justify-end">
                  {p.status === 'delivered' ? (
                    <Pill tone="leaf" icon={<CheckCircle2 className="h-3 w-3" aria-hidden />}>Received</Pill>
                  ) : (
                    <>
                      <Pill tone="marigold">Pledged</Pill>
                      <Button
                        size="sm"
                        variant="secondary"
                        loading={m.isPending && m.variables === p.id}
                        onClick={async () => {
                          if (await confirm({ title: 'Mark as received?', body: `Confirm you received ${p.quantity} ${p.unit} of ${p.itemName} from ${p.donor.name}.`, confirmLabel: 'Mark received' })) m.mutate(p.id);
                        }}
                      >
                        Mark received
                      </Button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {dialog}
    </section>
  );
}

export default function ResourceDetail() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const { id = '' } = useParams();
  const me = useMe();
  const qc = useQueryClient();
  const [pledgeItemId, setPledgeItemId] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [confirm, dialog] = useConfirm();
  const q = useQuery({ queryKey: ['resource', id], queryFn: () => api<Detail>(`/requests/resources/${id}`), enabled: Boolean(id) });
  useLiveWishlist(id);

  /** Pledge/cancel endpoints return the request without the requester-only `pledges` list — keep it. */
  const merge = (d: Detail) => qc.setQueryData<Detail>(['resource', id], (old) => ({ ...d, pledges: old?.pledges ?? d.pledges }));
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['resource', id] });
    qc.invalidateQueries({ queryKey: ['resources'] });
    qc.invalidateQueries({ queryKey: ['requests-mine'] });
  };
  const cancel = useMutation({
    mutationFn: (pid: string) => api<Detail>(`/requests/pledges/${pid}`, { method: 'DELETE' }),
    onSuccess: (d) => { merge(d); toast.success('Pledge cancelled.'); qc.invalidateQueries({ queryKey: ['requests-mine'] }); },
    onError: toastError,
  });

  if (q.isPending) return <DetailSkeleton />;
  if (q.isError) return <div><PageHeader back="/requests" title={t('drive.detail', 'Donation drive')} /><ErrorState error={q.error} retry={() => q.refetch()} /></div>;
  const d = q.data;
  const owner = d.isMine || me.role === 'admin';
  const needed = d.items.reduce((s, i) => s + i.quantityNeeded, 0);
  const pledged = d.items.reduce((s, i) => s + Math.min(i.quantityPledged, i.quantityNeeded), 0);
  const received = d.items.reduce((s, i) => s + i.quantityReceived, 0);
  const pct = needed ? Math.round((pledged / needed) * 100) : 0;
  const myByItem = new Map<string, number>();
  d.myPledges.forEach((p) => myByItem.set(p.itemId, (myByItem.get(p.itemId) ?? 0) + p.quantity));
  const itemName = (iid: string) => d.items.find((i) => i.id === iid);
  const pledgeItem = d.items.find((i) => i.id === pledgeItemId) ?? null;
  const canPledge = d.status === 'open' && !d.isMine;

  const share = async () => {
    const r = await shareLink(d.title, `${window.location.origin}/requests/resources/${d.id}`);
    if (r === 'copied') toast.success('Link copied.');
    if (r === 'failed') toast.error("Couldn't share. Copy the link from the address bar.");
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <IconButton label="Back" className="-ml-2" onClick={() => ((window.history.state?.idx ?? 0) > 0 ? nav(-1) : nav('/requests'))}>
          <ArrowLeft className="h-5 w-5" />
        </IconButton>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" size="sm" icon={<Share2 className="h-4 w-4" />} onClick={share}>Share</Button>
          {owner && <ButtonLink to={`/requests/resources/${d.id}/edit`} variant="outline" size="sm" icon={<Pencil className="h-4 w-4" />}>Edit</ButtonLink>}
          {!d.isMine && <Button variant="ghost" size="sm" icon={<Flag className="h-4 w-4" />} onClick={() => setReportOpen(true)}>Report</Button>}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl">
        <DriveCover coverUrl={d.coverUrl} category={d.category} className="aspect-[16/9] w-full sm:aspect-[21/8]" />
      </div>

      <div className="mt-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <Pill>{RESOURCE_CATEGORIES[d.category] ?? d.category}</Pill>
          <ReqStatusPill status={d.status} />
        </div>
        <h1 className="mt-2 text-2xl font-extrabold leading-tight sm:text-[28px]">{d.title}</h1>
        <UserLine className="mt-3" user={d.requester} sub={`Posted ${ago(d.createdAt)}`} />
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-6">
          <p className="prose-body">{d.description}</p>

          <section aria-labelledby="wish-h" className="space-y-3">
            <div className="flex items-baseline justify-between gap-2">
              <h2 id="wish-h" className="text-lg font-bold">Wishlist</h2>
              <span className="flex items-center gap-1.5 text-xs text-ink-faint"><span className="h-2 w-2 rounded-full bg-leaf-500" aria-hidden /> Live counts</span>
            </div>
            {d.status !== 'open' && (
              <p className="rounded-xl bg-paper px-3 py-2 text-sm text-ink-soft">This drive is {d.status} and isn't taking new pledges.</p>
            )}
            <ul className="space-y-3">
              {d.items.map((it) => (
                <WishlistItem key={it.id} item={it} canPledge={canPledge} myQty={myByItem.get(it.id) ?? 0} onPledge={() => setPledgeItemId(it.id)} />
              ))}
            </ul>
          </section>

          {d.lat != null && d.lng != null && (
            <section aria-labelledby="loc-h" className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h2 id="loc-h" className="text-lg font-bold">Drop-off location</h2>
                <a href={directionsUrl(d.lat, d.lng)} target="_blank" rel="noreferrer" className="link inline-flex items-center gap-1 text-sm font-semibold">
                  <Navigation className="h-4 w-4" aria-hidden /> Directions <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                </a>
              </div>
              {(d.locationName || d.address) && (
                <p className="flex gap-2 text-[15px]"><MapPin className="mt-0.5 h-5 w-5 shrink-0 text-brand-500" aria-hidden /><span>{d.locationName}{d.address && <span className="block text-ink-soft">{d.address}</span>}</span></p>
              )}
              <MapView height={260} markers={[{ id: d.id, lat: d.lat, lng: d.lng, title: d.locationName ?? d.title, tone: 'marigold' }]} />
            </section>
          )}

          {owner && <RequesterPledges d={d} onChanged={refresh} />}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <Card className="space-y-3">
            <div className="flex items-baseline justify-between">
              <span className="font-display text-3xl font-extrabold">{pct}%</span>
              <span className="text-sm text-ink-soft">pledged</span>
            </div>
            <ProgressBar value={pledged} max={needed} tone={pct >= 100 ? 'leaf' : 'marigold'} />
            <div className="grid grid-cols-3 gap-2">
              <Metric value={pledged} label="Pledged" tone="brand" />
              <Metric value={received} label="Received" tone="leaf" />
              <Metric value={needed} label="Needed" />
            </div>
            <div className="space-y-1.5 text-sm">
              <div className="flex items-center gap-1.5 text-ink-soft"><Users className="h-4 w-4" aria-hidden /> {plural(d.donorCount, 'donor')}</div>
              {d.deadline && (
                <div className="flex flex-wrap items-center gap-x-1.5 text-ink-soft">
                  <CalendarClock className="h-4 w-4" aria-hidden /> Until {fmtDateTime(d.deadline)}
                  {d.status === 'open' && <DeadlineText iso={d.deadline} className="ml-auto text-xs" />}
                </div>
              )}
            </div>
          </Card>

          {d.myPledges.length > 0 && (
            <Card padded={false}>
              <h2 className="border-b border-paper-line px-4 py-3 text-base font-bold">My pledges</h2>
              <ul className="divide-y divide-paper-line">
                {d.myPledges.map((p) => {
                  const it = itemName(p.itemId);
                  return (
                    <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1 text-sm">
                        <div className="font-semibold">{p.quantity} {it?.unit} · {it?.name ?? 'Item'}</div>
                        <div className="text-ink-faint">{fmtShort(p.createdAt)}{p.note && ` · ${p.note}`}</div>
                      </div>
                      {p.status === 'delivered' ? (
                        <Pill tone="leaf">Received</Pill>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<X className="h-4 w-4" />}
                          className={clsx('text-ink-soft')}
                          loading={cancel.isPending && cancel.variables === p.id}
                          onClick={async () => {
                            if (await confirm({ title: 'Cancel this pledge?', body: `The organizer will no longer expect ${p.quantity} ${it?.unit ?? ''} of ${it?.name ?? 'this item'} from you.`, confirmLabel: 'Cancel pledge', danger: true })) cancel.mutate(p.id);
                          }}
                        >
                          Cancel
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}

          {owner && (
            <Card className="space-y-3">
              <h2 className="text-base font-bold">Manage drive</h2>
              <RequestStatusActions kind="resource" id={d.id} status={d.status} deadline={d.deadline} onUpdated={(data) => { if (data?.id) merge(data); refresh(); }} />
            </Card>
          )}

          {!owner && d.status === 'open' && (
            <Card className="text-sm text-ink-soft">
              Pledge an item, then drop it off or coordinate with {d.requester.name}. They'll mark it received when it arrives.
            </Card>
          )}
        </aside>
      </div>

      <PledgeModal item={pledgeItem} requestId={d.id} onClose={() => setPledgeItemId(null)} onDone={(x) => { merge(x); qc.invalidateQueries({ queryKey: ['requests-mine'] }); }} />
      <ReportDialog open={reportOpen} onClose={() => setReportOpen(false)} targetType="resource_request" targetId={d.id} title="Report this donation drive" />
      {dialog}
    </div>
  );
}
