import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import {
  CalendarClock, CheckCircle2, Droplet, ExternalLink, Flag, Heart, Hospital, Info, Lock, MapPin, MessageSquare, Navigation, Phone, ShieldCheck, User, Users, X,
} from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { useMe } from '../../lib/auth';
import { BLOOD_COMPONENTS } from '../../lib/constants';
import { ago, fmtDateTime, plural } from '../../lib/format';
import { MapView } from '../../components/Map';
import { ReportDialog } from '../../components/ReportDialog';
import {
  Button, ButtonLink, Card, Checkbox, EmptyState, ErrorState, FormError, Modal, Notice, PageHeader, Pill, ProgressBar, Skeleton, Textarea,
  UserLine, toastError, useConfirm,
} from '../../components/ui';
import { directionsUrl } from '../../components/EventsKit';
import {
  BloodDetail as Detail, BloodGroupBadge, BloodResponse, DeadlineText, InfoRow, Metric, RarePill, ReqStatusPill, RequestStatusActions, UrgencyPill,
} from '../../components/RequestsKit';

function DetailSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <Skeleton className="h-8 w-48" />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4"><Skeleton className="h-40 w-full rounded-2xl" /><Skeleton className="h-64 w-full rounded-2xl" /></div>
        <Skeleton className="h-72 w-full rounded-2xl" />
      </div>
    </div>
  );
}

function Forbidden({ message }: { message: string }) {
  return (
    <div>
      <PageHeader back="/requests?tab=blood" title="Blood request" />
      <Card>
        <EmptyState
          icon={<Lock />}
          title="This request is only visible to nearby donors"
          body={
            <>
              To protect patients, blood requests are shown only to opted-in donors whose location is inside the request's search radius.
              <span className="mt-2 block text-sm text-ink-faint">{message}</span>
            </>
          }
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <ButtonLink to="/settings/donor" variant="danger" icon={<Heart className="h-4 w-4" />}>Open donor settings</ButtonLink>
              <ButtonLink to="/requests?tab=blood" variant="outline">See requests near me</ButtonLink>
            </div>
          }
        />
      </Card>
    </div>
  );
}

const RESP_PILL: Record<BloodResponse['status'], JSX.Element> = {
  pledged: <Pill tone="marigold">Pledged</Pill>,
  donated: <Pill tone="leaf" icon={<CheckCircle2 className="h-3 w-3" aria-hidden />}>Donated</Pill>,
  cancelled: <Pill>Removed</Pill>,
};

function ResponsesPanel({ b, onChanged }: { b: Detail; onChanged: () => void }) {
  const [confirm, dialog] = useConfirm();
  const m = useMutation({
    mutationFn: (v: { id: string; status: 'donated' | 'cancelled' }) => api(`/requests/blood/${b.id}/responses/${v.id}`, { method: 'PATCH', body: { status: v.status } }),
    onSuccess: (_d, v) => {
      toast.success(v.status === 'donated' ? 'Donation recorded. The donor has been thanked.' : 'Donor removed from this request.');
      onChanged();
    },
    onError: toastError,
  });
  const markDonated = async (r: BloodResponse) => {
    if (await confirm({ title: `Confirm ${r.donor.name} donated?`, body: 'This records one unit received and pauses alerts to this donor for 90 days, as donors need time to recover.', confirmLabel: 'Mark donated' })) m.mutate({ id: r.id, status: 'donated' });
  };
  const remove = async (r: BloodResponse) => {
    if (await confirm({ title: `Remove ${r.donor.name}?`, body: 'Use this if they can no longer donate. Their pledge stops counting toward the units needed.', confirmLabel: 'Remove donor', danger: true })) m.mutate({ id: r.id, status: 'cancelled' });
  };
  return (
    <section aria-labelledby="donors-h">
      <Card padded={false}>
        <div className="flex items-center gap-2 border-b border-paper-line px-4 py-3 sm:px-5">
          <Users className="h-5 w-5 text-ink-soft" aria-hidden />
          <h2 id="donors-h" className="text-base font-bold">Donors who responded</h2>
          <span className="rounded-full bg-paper px-2 text-xs font-semibold text-ink-soft">{b.responses.length}</span>
        </div>
        {b.responses.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-ink-soft">
            No donors yet. Compatible donors within {b.radiusKm} km have been alerted{b.broadcastCount > 1 ? ` ${b.broadcastCount} times` : ''}.
            {b.status === 'open' && ' If time is short, re-broadcast or widen your search on a new request.'}
          </div>
        ) : (
          <ul className="divide-y divide-paper-line">
            {b.responses.map((r) => {
              const busy = m.isPending && m.variables?.id === r.id;
              return (
                <li key={r.id} className="space-y-2 px-4 py-3 sm:px-5">
                  <div className="flex items-start justify-between gap-3">
                    <UserLine user={r.donor} sub={`Responded ${ago(r.createdAt)}`} size={36} />
                    {RESP_PILL[r.status]}
                  </div>
                  {r.message && <p className="rounded-xl bg-paper px-3 py-2 text-sm text-ink-soft"><MessageSquare className="mr-1.5 inline h-4 w-4 align-[-3px]" aria-hidden />{r.message}</p>}
                  <div className="flex flex-wrap items-center gap-2">
                    {r.donorPhone ? (
                      <a href={`tel:${r.donorPhone}`} className="inline-flex items-center gap-1.5 rounded-xl bg-leaf-50 px-3 py-1.5 text-sm font-semibold text-leaf-700 hover:bg-leaf-100">
                        <Phone className="h-4 w-4" aria-hidden /> {r.donorPhone}
                      </a>
                    ) : (
                      <span className="text-sm text-ink-faint">No phone on file</span>
                    )}
                    {r.status === 'pledged' && (
                      <>
                        <Button size="sm" variant="secondary" icon={<CheckCircle2 className="h-4 w-4" />} loading={busy && m.variables?.status === 'donated'} disabled={busy} onClick={() => markDonated(r)}>Mark donated</Button>
                        <Button size="sm" variant="ghost" icon={<X className="h-4 w-4" />} loading={busy && m.variables?.status === 'cancelled'} disabled={busy} onClick={() => remove(r)}>Remove</Button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      {dialog}
    </section>
  );
}

function DonorPanel({ b, onChanged }: { b: Detail; onChanged: () => void }) {
  const me = useMe();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [consent, setConsent] = useState(false);
  const [message, setMessage] = useState('');
  const [confirm, dialog] = useConfirm();
  const respond = useMutation({
    mutationFn: () => api<{ ok: true; contactPhone: string | null }>(`/requests/blood/${b.id}/respond`, { body: { shareContact: true, message: message.trim() || undefined } }),
    onSuccess: () => {
      setOpen(false);
      setMessage('');
      setConsent(false);
      toast.success('Thank you. The requester has your number — call them to coordinate.', { duration: 6000 });
      qc.invalidateQueries({ queryKey: ['requests-mine'] });
      onChanged();
    },
  });
  const cancel = useMutation({
    mutationFn: () => api(`/requests/blood/${b.id}/respond`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Your pledge was cancelled.');
      qc.invalidateQueries({ queryKey: ['requests-mine'] });
      onChanged();
    },
    onError: toastError,
  });
  const status = b.myResponse?.status;
  const pledged = status === 'pledged';

  if (status === 'donated') {
    return (
      <Card className="space-y-2 border-leaf-100 bg-leaf-50">
        <h2 className="flex items-center gap-2 text-base font-bold text-leaf-700"><Heart className="h-5 w-5 fill-current" aria-hidden /> You donated. Thank you.</h2>
        <p className="text-sm text-leaf-700">The requester confirmed your donation. Please wait at least 90 days before your next whole-blood donation.</p>
      </Card>
    );
  }

  if (pledged) {
    return (
      <Card className="space-y-3">
        <h2 className="flex items-center gap-2 text-base font-bold"><CheckCircle2 className="h-5 w-5 text-leaf-500" aria-hidden /> You pledged to donate</h2>
        <p className="text-sm text-ink-soft">Call the requester before you go so they can tell you the ward and blood bank counter.</p>
        {b.contactPhone && (
          <a href={`tel:${b.contactPhone}`} className="flex items-center justify-center gap-2 rounded-xl bg-leaf-500 px-4 py-3 font-semibold text-white hover:bg-leaf-600">
            <Phone className="h-5 w-5" aria-hidden /> Call {b.contactPhone}
          </a>
        )}
        <a href={directionsUrl(b.lat, b.lng)} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 rounded-xl border border-paper-line px-4 py-2.5 text-sm font-semibold hover:bg-paper">
          <Navigation className="h-4 w-4" aria-hidden /> Directions to hospital
        </a>
        <Button
          variant="ghost"
          block
          size="sm"
          className="text-blood-600 hover:bg-blood-50"
          loading={cancel.isPending}
          onClick={async () => {
            if (await confirm({ title: 'Cancel your pledge?', body: 'The requester will no longer count on you. Please call them too if you had agreed on a time.', confirmLabel: 'Cancel pledge', danger: true })) cancel.mutate();
          }}
        >
          Cancel my pledge
        </Button>
        {dialog}
      </Card>
    );
  }

  if (b.status !== 'open') {
    return (
      <Card className="text-sm text-ink-soft">
        This request is {b.status === 'fulfilled' ? 'fulfilled' : 'closed'} and no longer needs donors. Thank you for checking.
      </Card>
    );
  }

  const noGroup = !me.bloodGroup || !me.isBloodDonor;
  return (
    <Card className="space-y-3">
      {b.compatible ? (
        <>
          <p className="flex items-center gap-2 text-sm font-semibold text-leaf-700"><CheckCircle2 className="h-5 w-5" aria-hidden /> Your group ({me.bloodGroup}) is compatible</p>
          <Button variant="danger" size="lg" block icon={<Droplet className="h-5 w-5" />} onClick={() => { respond.reset(); setOpen(true); }}>I can donate</Button>
          <p className="text-xs text-ink-faint">You'll see the requester's number after you pledge.</p>
        </>
      ) : noGroup ? (
        <>
          <p className="text-sm text-ink-soft">Set your blood group and turn on donor mode to pledge.</p>
          <ButtonLink to="/settings/donor" variant="outline" block>Donor settings</ButtonLink>
        </>
      ) : (
        <p className="flex gap-2 text-sm text-ink-soft">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          Your group ({me.bloodGroup}) can't donate to a {b.bloodGroup} patient. If you know someone with a compatible group, ask them to check ServeConnect.
        </p>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Donate ${b.bloodGroup} at ${b.hospitalName}`}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="danger" disabled={!consent} loading={respond.isPending} onClick={() => respond.mutate()}>Pledge to donate</Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-ink-soft">
            Only pledge if you can reach the hospital by <strong className="text-ink">{fmtDateTime(b.neededBy)}</strong>, feel well, and haven't donated in the last 90 days.
          </p>
          <Checkbox
            checked={consent}
            onChange={setConsent}
            label="Share my phone number with the requester"
            hint="Required so they can coordinate with you. It's never shown to anyone else."
            error={(respond.error as ApiError | null)?.fields?.shareContact}
          />
          <Textarea label="Message" optional rows={3} maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="e.g. I can reach in 40 minutes" />
          <FormError error={respond.error} />
        </div>
      </Modal>
    </Card>
  );
}

export default function BloodDetail() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const loc = useLocation();
  const me = useMe();
  const qc = useQueryClient();
  const [reportOpen, setReportOpen] = useState(false);
  const [alerted, setAlerted] = useState<number | null>((loc.state as { matchedDonors?: number } | null)?.matchedDonors ?? null);
  const q = useQuery({ queryKey: ['blood', id], queryFn: () => api<Detail>(`/requests/blood/${id}`), enabled: Boolean(id) });

  if (q.isPending) return <DetailSkeleton />;
  if (q.isError) {
    if (q.error instanceof ApiError && q.error.status === 403) return <Forbidden message={q.error.message} />;
    return (
      <div>
        <PageHeader back="/requests?tab=blood" title="Blood request" />
        <ErrorState error={q.error} retry={() => q.refetch()} />
      </div>
    );
  }
  const b = q.data;
  const owner = b.isMine || me.role === 'admin';
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['blood', id] });
    qc.invalidateQueries({ queryKey: ['blood-requests'] });
  };
  const component = BLOOD_COMPONENTS[b.component] ?? b.component;

  return (
    <div>
      <PageHeader
        back="/requests?tab=blood"
        title={t('blood.detail.title', 'Blood request')}
        actions={!b.isMine && <Button variant="ghost" size="sm" icon={<Flag className="h-4 w-4" />} onClick={() => setReportOpen(true)}>Report</Button>}
      />

      {alerted !== null && b.isMine && (
        <div className="mb-4">
          <Notice
            tone={alerted > 0 ? 'leaf' : 'marigold'}
            icon={alerted > 0 ? <CheckCircle2 className="h-6 w-6" aria-hidden /> : <Info className="h-6 w-6" aria-hidden />}
            title={alerted > 0 ? `${plural(alerted, 'compatible donor')} alerted` : 'No matching donors in range right now'}
            action={<button type="button" className="rounded-full p-1 hover:bg-white/60" aria-label="Dismiss" onClick={() => setAlerted(null)}><X className="h-4 w-4" /></button>}
          >
            {alerted > 0
              ? "You'll get a notification with their number as soon as someone pledges."
              : 'New donors who come into range will see it. You can re-broadcast later, and also contact the hospital blood bank directly.'}
          </Notice>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-4">
          <Card className={clsx('flex gap-4 sm:gap-5', b.isRare && b.status === 'open' && 'border-blood-100 ring-1 ring-blood-100')}>
            <BloodGroupBadge group={b.bloodGroup} size="lg" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                {b.isRare && <RarePill />}
                {b.status === 'open' ? <UrgencyPill urgency={b.urgency} /> : <ReqStatusPill status={b.status} />}
                {b.compatible && !b.isMine && b.status === 'open' && <Pill tone="leaf" icon={<CheckCircle2 className="h-3 w-3" aria-hidden />}>Compatible with you</Pill>}
              </div>
              <h2 className="mt-2 text-xl font-extrabold leading-tight sm:text-2xl">
                {plural(b.unitsNeeded, 'unit')} of {b.bloodGroup} {component.toLowerCase()}
              </h2>
              <p className="mt-0.5 text-ink-soft">at {b.hospitalName}</p>
              {b.status === 'open' && <div className="mt-2"><DeadlineText iso={b.neededBy} prefix="Needed ·" /></div>}
            </div>
          </Card>

          <Card className="space-y-4">
            {b.requester && <UserLine user={b.requester} sub={`Posted ${ago(b.createdAt)}`} />}
            <div className="space-y-3">
              <InfoRow icon={<Hospital />}>
                <div className="font-semibold">{b.hospitalName}</div>
                {b.address && <div className="text-ink-soft">{b.address}</div>}
                {b.distanceKm != null && !b.isMine && <div className="text-sm text-ink-faint">{b.distanceKm} km from you</div>}
              </InfoRow>
              <InfoRow icon={<CalendarClock />}>
                Needed by <strong>{fmtDateTime(b.neededBy)}</strong>
              </InfoRow>
              {b.patientLabel && <InfoRow icon={<User />}>For {b.patientLabel}</InfoRow>}
              <InfoRow icon={<MapPin />}>Donors alerted within {b.radiusKm} km{b.broadcastCount > 1 ? ` · sent ${b.broadcastCount} times` : ''}</InfoRow>
              {b.notes && (
                <InfoRow icon={<Info />}><p className="prose-body">{b.notes}</p></InfoRow>
              )}
            </div>
          </Card>

          <section aria-labelledby="loc-h" className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h2 id="loc-h" className="text-base font-bold">Location</h2>
              <a href={directionsUrl(b.lat, b.lng)} target="_blank" rel="noreferrer" className="link inline-flex items-center gap-1 text-sm font-semibold">
                <Navigation className="h-4 w-4" aria-hidden /> Directions <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </a>
            </div>
            <MapView height={260} markers={[{ id: b.id, lat: b.lat, lng: b.lng, title: b.hospitalName, sub: b.address ?? undefined, tone: 'blood' }]} />
          </section>

          <Card className="space-y-2">
            <h2 className="text-base font-bold">Who can donate to {b.bloodGroup}</h2>
            <div className="flex flex-wrap gap-2">
              {b.compatibleGroups.map((g) => {
                const mine = g === me.bloodGroup;
                return (
                  <span key={g} className={clsx('inline-flex items-center gap-1 rounded-xl border px-3 py-1.5 font-display text-base font-bold', mine ? 'border-blood-500 bg-blood-50 text-blood-700' : 'border-paper-line bg-white')}>
                    {g}{mine && <span className="font-sans text-xs font-semibold">(you)</span>}
                  </span>
                );
              })}
            </div>
            <p className="text-sm text-ink-faint">{b.bloodGroup.startsWith('Bombay') ? 'Bombay phenotype patients can only receive Bombay blood.' : 'Based on red-cell compatibility. The hospital blood bank makes the final cross-match.'}</p>
          </Card>

          {owner && <ResponsesPanel b={b} onChanged={refresh} />}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <Card className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <Metric value={b.unitsPledged} label="Pledged" tone="blood" />
              <Metric value={b.unitsReceived} label="Received" tone="leaf" />
              <Metric value={b.unitsNeeded} label="Needed" />
            </div>
            <ProgressBar value={b.unitsPledged} max={b.unitsNeeded} tone="blood" />
            <p className="text-sm text-ink-soft">
              {b.unitsPledged >= b.unitsNeeded ? 'Enough donors have pledged.' : `${plural(b.unitsNeeded - b.unitsPledged, 'more donor')} needed.`}
            </p>
          </Card>

          {owner ? (
            <>
              {b.contactPhone && (
                <Card className="space-y-1 text-sm">
                  <div className="font-semibold">Contact shown to pledged donors</div>
                  <a href={`tel:${b.contactPhone}`} className="link inline-flex items-center gap-1.5"><Phone className="h-4 w-4" aria-hidden />{b.contactPhone}</a>
                </Card>
              )}
              <Card className="space-y-3">
                <h2 className="text-base font-bold">Manage request</h2>
                <RequestStatusActions
                  kind="blood"
                  id={b.id}
                  status={b.status}
                  deadline={b.neededBy}
                  onUpdated={(data) => {
                    if (data?.matchedDonors !== undefined) setAlerted(data.matchedDonors);
                    refresh();
                  }}
                />
              </Card>
            </>
          ) : (
            <DonorPanel b={b} onChanged={refresh} />
          )}

          <Card className="flex gap-3 text-sm text-ink-soft">
            <ShieldCheck className="h-5 w-5 shrink-0 text-brand-500" aria-hidden />
            <p>Never pay anyone for blood or share bank details. Blood donation in India is voluntary and free. <Link to="/help" className="link">Safety tips</Link></p>
          </Card>
        </aside>
      </div>

      <ReportDialog open={reportOpen} onClose={() => setReportOpen(false)} targetType="blood_request" targetId={b.id} title="Report this blood request" />
    </div>
  );
}
