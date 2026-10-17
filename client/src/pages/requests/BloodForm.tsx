import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { AlertTriangle, Droplet, Lock, Minus, Plus, ShieldCheck } from 'lucide-react';
import { api } from '../../lib/api';
import { useMe } from '../../lib/auth';
import { BLOOD_COMPONENTS, BLOOD_GROUPS, RARE_GROUPS } from '../../lib/constants';
import { plural } from '../../lib/format';
import { MapPicker, Place } from '../../components/Map';
import { Button, ButtonLink, Card, FormError, Input, Notice, PageHeader, Select, Textarea, fieldError } from '../../components/ui';
import { fromLocalInput, toLocalInput } from '../../components/EventsKit';
import type { BloodRequest, Urgency } from '../../components/RequestsKit';

const URGENCIES: { id: Urgency; label: string; hint: string }[] = [
  { id: 'normal', label: 'Normal', hint: 'Within a few days' },
  { id: 'urgent', label: 'Urgent', hint: 'Within 24 hours' },
  { id: 'critical', label: 'Critical', hint: 'Needed right now' },
];

function Section({ title, children, hint }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-lg font-bold">{title}</h2>
        {hint && <p className="text-sm text-ink-soft">{hint}</p>}
      </div>
      {children}
    </Card>
  );
}

export default function BloodForm() {
  const { t } = useTranslation();
  const me = useMe();
  const nav = useNavigate();
  const qc = useQueryClient();
  const verified = me.verificationStatus === 'verified' || me.role === 'admin';

  const [group, setGroup] = useState('');
  const [component, setComponent] = useState('whole_blood');
  const [units, setUnits] = useState(1);
  const [urgency, setUrgency] = useState<Urgency>('urgent');
  const [hospital, setHospital] = useState('');
  const [place, setPlace] = useState<Place | null>(null);
  const [address, setAddress] = useState('');
  const [addressTouched, setAddressTouched] = useState(false);
  const [radius, setRadius] = useState(25);
  const [phone, setPhone] = useState(me.phone ?? '');
  const [neededBy, setNeededBy] = useState(() => toLocalInput(new Date(Date.now() + 24 * 3600_000).toISOString()));
  const [patient, setPatient] = useState('');
  const [notes, setNotes] = useState('');
  const [tried, setTried] = useState(false);

  const rare = RARE_GROUPS.includes(group);
  const errors = {
    group: !group ? 'Choose the blood group needed.' : undefined,
    hospital: hospital.trim().length < 3 ? 'Enter the hospital name.' : undefined,
    place: !place ? 'Pin the hospital on the map so we can find donors nearby.' : undefined,
    phone: phone.trim().length < 6 ? 'Enter a contact number donors can call.' : undefined,
    neededBy: !neededBy ? 'Choose when the blood is needed by.' : new Date(neededBy) <= new Date() ? '"Needed by" must be in the future.' : undefined,
  };
  const valid = !Object.values(errors).some(Boolean);

  const m = useMutation({
    mutationFn: () =>
      api<BloodRequest & { matchedDonors: number }>('/requests/blood', {
        body: {
          bloodGroup: group,
          component,
          unitsNeeded: units,
          urgency,
          hospitalName: hospital.trim(),
          address: address.trim() || undefined,
          lat: place!.lat,
          lng: place!.lng,
          radiusKm: radius,
          contactPhone: phone.trim(),
          neededBy: fromLocalInput(neededBy),
          patientLabel: patient.trim() || undefined,
          notes: notes.trim() || undefined,
        },
      }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['blood-requests'] });
      qc.invalidateQueries({ queryKey: ['requests-mine'] });
      toast.success(r.matchedDonors > 0 ? `Request posted. ${plural(r.matchedDonors, 'compatible donor')} alerted.` : 'Request posted. No matching donors in range yet — try a wider radius.', { duration: 6000 });
      nav(`/requests/blood/${r.id}`, { state: { matchedDonors: r.matchedDonors }, replace: true });
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (!valid || !verified) return;
    m.mutate();
  };
  const err = (k: keyof typeof errors, server?: string) => server ?? (tried ? errors[k] : undefined);

  const pickPlace = (p: Place) => {
    setPlace(p);
    if (!addressTouched && p.name) setAddress(p.name);
    if (!hospital.trim() && p.name) setHospital(p.name.split(',')[0]);
  };

  return (
    <div>
      <PageHeader back title={t('blood.new.title', 'Request blood')} subtitle={t('blood.new.subtitle', 'Compatible donors within your radius are alerted immediately.')} />

      {!verified && (
        <div className="mb-4">
          <Notice
            tone="marigold"
            icon={<ShieldCheck className="h-6 w-6" aria-hidden />}
            title="Only verified profiles can request blood"
            action={<ButtonLink to="/settings/verification" size="sm" variant="marigold">Get verified</ButtonLink>}
          >
            This keeps donors safe from fake requests. Verification usually takes less than a day. In an emergency, also call the blood bank at your hospital directly.
          </Notice>
        </div>
      )}

      <form onSubmit={submit} noValidate>
        <fieldset disabled={!verified || m.isPending} className="grid gap-6 lg:grid-cols-[1fr_300px]">
          <div className="min-w-0 space-y-4">
            <Section title="What is needed">
              <div role="radiogroup" aria-label="Blood group" aria-describedby={err('group', fieldError(m.error, 'bloodGroup')) ? 'bg-err' : undefined}>
                <div className="mb-2 text-sm font-semibold">Blood group</div>
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                  {BLOOD_GROUPS.map((g) => {
                    const on = group === g;
                    const isBombay = g.startsWith('Bombay');
                    return (
                      <button
                        key={g}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => setGroup(g)}
                        className={clsx(
                          'flex h-14 items-center justify-center rounded-xl border-2 font-display font-extrabold transition disabled:opacity-60',
                          isBombay ? 'col-span-2 text-base sm:col-span-1 sm:text-sm' : 'text-xl',
                          on ? 'border-blood-500 bg-blood-500 text-white' : 'border-paper-line bg-white text-ink hover:border-blood-100 hover:bg-blood-50',
                        )}
                      >
                        {g}
                      </button>
                    );
                  })}
                </div>
                {err('group', fieldError(m.error, 'bloodGroup')) && <p id="bg-err" role="alert" className="mt-1.5 text-sm text-blood-600">{err('group', fieldError(m.error, 'bloodGroup'))}</p>}
                {rare && (
                  <p className="mt-2 flex items-center gap-2 rounded-xl bg-blood-50 px-3 py-2 text-sm font-medium text-blood-700" role="status">
                    <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden /> Rare group — donors will get a priority alert.
                  </p>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Select label="Component" value={component} onChange={(e) => setComponent(e.target.value)} options={BLOOD_COMPONENTS} />
                <div className="space-y-1.5">
                  <label htmlFor="units" className="block text-sm font-semibold">Units needed</label>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" aria-label="Fewer units" className="h-11 w-11 !p-0" disabled={units <= 1} onClick={() => setUnits((u) => Math.max(1, u - 1))}><Minus className="h-4 w-4" /></Button>
                    <input id="units" type="number" min={1} max={50} inputMode="numeric" className="input w-20 text-center font-display text-lg font-bold" value={units}
                      onChange={(e) => setUnits(Math.min(50, Math.max(1, Number(e.target.value) || 1)))} />
                    <Button variant="outline" aria-label="More units" className="h-11 w-11 !p-0" disabled={units >= 50} onClick={() => setUnits((u) => Math.min(50, u + 1))}><Plus className="h-4 w-4" /></Button>
                  </div>
                </div>
              </div>

              <div>
                <div id="urg-label" className="mb-2 text-sm font-semibold">Urgency</div>
                <div role="radiogroup" aria-labelledby="urg-label" className="grid grid-cols-3 gap-1 rounded-xl border border-paper-line bg-paper p-1">
                  {URGENCIES.map((u) => {
                    const on = urgency === u.id;
                    return (
                      <button
                        key={u.id}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => setUrgency(u.id)}
                        className={clsx(
                          'rounded-lg px-2 py-2 text-center transition',
                          on ? (u.id === 'critical' ? 'bg-blood-500 text-white shadow-sm' : u.id === 'urgent' ? 'bg-marigold-400 text-ink shadow-sm' : 'bg-white text-ink shadow-sm') : 'text-ink-soft hover:text-ink',
                        )}
                      >
                        <span className="block text-[15px] font-semibold">{u.label}</span>
                        <span className={clsx('block text-xs', on ? 'opacity-90' : 'text-ink-faint')}>{u.hint}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <Input
                type="datetime-local"
                label="Needed by"
                value={neededBy}
                min={toLocalInput(new Date().toISOString())}
                onChange={(e) => setNeededBy(e.target.value)}
                error={err('neededBy', fieldError(m.error, 'neededBy'))}
              />
              <Input label="Patient" optional value={patient} maxLength={80} onChange={(e) => setPatient(e.target.value)} placeholder='e.g. "Mother, 54"' hint="Avoid full names. Donors see this to understand who they're helping." />
            </Section>

            <Section title="Where" hint="Donors are matched by distance from the hospital.">
              <Input label="Hospital name" value={hospital} maxLength={160} onChange={(e) => setHospital(e.target.value)} placeholder="e.g. Government General Hospital" error={err('hospital', fieldError(m.error, 'hospitalName'))} />
              <div>
                <MapPicker label="Hospital location" value={place} onChange={pickPlace} />
                {err('place') && <p role="alert" className="mt-1 text-sm text-blood-600">{err('place')}</p>}
              </div>
              <Input label="Address" optional value={address} maxLength={300} onChange={(e) => { setAddress(e.target.value); setAddressTouched(true); }} placeholder="Ward, block or blood bank counter" />
              <div className="space-y-1.5">
                <div className="flex items-baseline justify-between">
                  <label htmlFor="radius" className="text-sm font-semibold">Search radius</label>
                  <span className="font-display text-lg font-bold text-brand-600">{radius} km</span>
                </div>
                <input id="radius" type="range" min={5} max={200} step={5} value={radius} onChange={(e) => setRadius(Number(e.target.value))} className="w-full accent-blood-500" aria-valuetext={`${radius} kilometres`} />
                <div className="flex justify-between text-xs text-ink-faint"><span>5 km</span><span>200 km</span></div>
                <p className="text-sm text-ink-faint">{rare ? 'For rare groups a wider radius (50 km+) finds more donors.' : 'A smaller radius means donors can reach you faster.'}</p>
              </div>
            </Section>

            <Section title="Contact" hint="Shared only with donors who pledge to donate.">
              <Input type="tel" label="Contact phone" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98xxxxxxxx" error={err('phone', fieldError(m.error, 'contactPhone'))} />
              <Textarea label="Notes for donors" optional rows={3} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ward number, who to ask for, whether to call before coming" />
            </Section>

            <FormError error={m.error} />
            {tried && !valid && <p role="alert" className="text-sm text-blood-600">Fix the highlighted fields to continue.</p>}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="ghost" onClick={() => nav(-1)}>Cancel</Button>
              <Button type="submit" variant="danger" size="lg" loading={m.isPending} icon={<Droplet className="h-5 w-5" />}>Post request and alert donors</Button>
            </div>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
            <Card className="space-y-3 text-sm text-ink-soft">
              <h2 className="flex items-center gap-2 text-base font-bold text-ink"><Lock className="h-4 w-4" aria-hidden /> Privacy</h2>
              <p>Your request is visible only to opted-in donors within {radius} km, never on the public feed.</p>
              <p>Your phone number is revealed only to donors who pledge, and their number is shared with you only with their consent.</p>
            </Card>
            <Card className="space-y-2 text-sm text-ink-soft">
              <h2 className="text-base font-bold text-ink">Before you post</h2>
              <p>Confirm the requirement with the hospital blood bank and ask about replacement donation rules.</p>
              <p>Update or close the request once you have enough donors so others aren't called in vain.</p>
            </Card>
          </aside>
        </fieldset>
      </form>
    </div>
  );
}
