import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { addDays, format } from 'date-fns';
import { Droplet, Lock, MapPin } from 'lucide-react';
import { api } from '../../lib/api';
import { useMe } from '../../lib/auth';
import { BLOOD_GROUPS, RARE_GROUPS } from '../../lib/constants';
import type { Me } from '../../lib/types';
import { Button, ButtonLink, Checkbox, FormError, Input, Notice, Pill, Select, fieldError, useConfirm } from '../../components/ui';
import { SettingsBlock, toDateInput, useMeMutation } from '../../components/SettingsKit';

const INTERVAL_DAYS = 90;

export default function DonorSettings() {
  const me = useMe();
  const [group, setGroup] = useState(me.bloodGroup ?? '');
  const [consent, setConsent] = useState(me.isBloodDonor);
  const [radius, setRadius] = useState(me.donorRadiusKm || 25);
  const [last, setLast] = useState(toDateInput(me.lastDonationDate));
  const [confirm, dialog] = useConfirm();
  const hasLocation = me.lat != null && me.lng != null;
  const today = format(new Date(), 'yyyy-MM-dd');

  const save = useMeMutation(
    (optIn: boolean) =>
      api<Me>('/users/me/donor', {
        method: 'PATCH',
        body: optIn
          ? { isBloodDonor: true, bloodGroup: group || null, donorRadiusKm: radius, lastDonationDate: last || null, consent }
          : { isBloodDonor: false },
      }),
    { success: me.isBloodDonor ? 'Saved' : 'You are now a registered blood donor' },
  );
  const optOut = useMeMutation(() => api<Me>('/users/me/donor', { method: 'PATCH', body: { isBloodDonor: false } }), { success: 'You will no longer receive blood requests' });

  const nextEligible = last ? addDays(new Date(`${last}T00:00:00`), INTERVAL_DAYS) : null;
  const eligibleNow = !nextEligible || nextEligible <= new Date();

  const submit = (e: FormEvent) => { e.preventDefault(); save.mutate(true); };

  return (
    <div className="space-y-4">
      <SettingsBlock id="donor-h" title="Blood donor" description="Get alerted when someone nearby needs blood you can give. Requests reach only opted-in donors whose blood group is compatible and who are within range."
        actions={me.isBloodDonor ? <Pill tone="blood" icon={<Droplet className="h-3 w-3" />}>Registered donor</Pill> : <Pill>Not registered</Pill>}>
        {me.isMinor ? (
          <Notice tone="neutral" icon={<Lock className="h-5 w-5" />} title="Donors must be 18 or older">
            You can still share blood requests with adults in your family and follow blood banks. Come back here once you turn 18.
          </Notice>
        ) : (
          <form onSubmit={submit} className="space-y-5">
            {!hasLocation && (
              <Notice tone="marigold" icon={<MapPin className="h-5 w-5" />} title="Add your location first" action={<ButtonLink to="/settings/profile" size="sm" variant="outline">Set location</ButtonLink>}>
                We match you with requests near where you are. Set your area in Profile settings.
              </Notice>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Select label="Blood group" value={group} onChange={(e) => setGroup(e.target.value)} options={BLOOD_GROUPS.map((g) => [g, g] as [string, string])} placeholder="Choose your blood group"
                error={fieldError(save.error, 'bloodGroup')}
                hint={RARE_GROUPS.includes(group) ? 'Rare group — requests for your group are flagged as high priority.' : 'Check your donor card or a recent lab report if unsure.'} />
              <Input label="Last donation" optional type="date" max={today} value={last} onChange={(e) => setLast(e.target.value)}
                hint={nextEligible ? (eligibleNow ? 'You can donate again now.' : `Eligible again from ${format(nextEligible, 'd MMM yyyy')}. Until then we won't send you requests.`) : 'Leave empty if you have never donated.'}
                error={fieldError(save.error, 'lastDonationDate')} />
            </div>

            <div>
              <label htmlFor="donor-radius" className="block text-sm font-semibold">How far you can travel to donate: <span className="tabular-nums">{radius} km</span></label>
              <input id="donor-radius" type="range" min={2} max={100} step={1} value={radius} onChange={(e) => setRadius(Number(e.target.value))}
                className="mt-2 w-full accent-blood-500" aria-valuetext={`${radius} kilometres`} />
              <div className="flex justify-between text-xs text-ink-faint"><span>2 km</span><span>100 km</span></div>
            </div>

            {!me.isBloodDonor && (
              <Checkbox
                checked={consent}
                onChange={setConsent}
                label="My blood group is used only to match me with nearby requests and is never shown on my profile"
                hint="You can opt out any time. Responding to a request is always your choice."
                error={fieldError(save.error, 'consent')}
              />
            )}

            <FormError error={save.error && !fieldError(save.error, 'bloodGroup') && !fieldError(save.error, 'consent') && save.error} />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant={me.isBloodDonor ? 'primary' : 'danger'} icon={<Droplet className="h-4 w-4" />} loading={save.isPending}
                disabled={!group || !hasLocation || (!me.isBloodDonor && !consent)}>
                {me.isBloodDonor ? 'Save donor settings' : 'Register as a blood donor'}
              </Button>
              {me.isBloodDonor && (
                <Button variant="ghost" loading={optOut.isPending} onClick={async () => {
                  if (await confirm({ title: 'Stop receiving blood requests?', body: 'Your blood group will be removed from matching. You can opt in again any time.', confirmLabel: 'Opt out', danger: true })) optOut.mutate();
                }}>Opt out</Button>
              )}
            </div>
          </form>
        )}
      </SettingsBlock>

      <SettingsBlock id="elig-h" title="Who can donate">
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink-soft">
          <li>You must be 18–65 years old, weigh at least 45 kg and feel well on the day.</li>
          <li>Leave at least {INTERVAL_DAYS} days between whole-blood donations. When you're marked as having donated through ServeConnect, your last donation date updates automatically.</li>
          <li>Don't donate if you've had a fever, tattoo, piercing or surgery recently, or are pregnant or breastfeeding — the blood bank screens every donor and has the final say.</li>
          <li>Compatibility follows standard red-cell rules: O− can give to everyone, AB+ can receive from everyone, and Bombay (hh) patients can receive only Bombay blood.</li>
        </ul>
        <div className="mt-4 flex gap-3 rounded-xl bg-paper p-3 text-sm text-ink-soft">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
          <p>Your blood group is encrypted at rest and used only for donor matching. It never appears on your profile or in search. If you respond to a request, the requester sees your name and phone number so they can coordinate with you. <Link to="/privacy" className="link">Privacy policy</Link></p>
        </div>
      </SettingsBlock>
      {dialog}
    </div>
  );
}
