import { ReactNode, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import {
  ArrowLeft, BellRing, BookOpen, Camera, CheckCircle2, Droplet, Home, Lock, MapPin, QrCode, ShieldCheck, HandHeart, CalendarDays,
} from 'lucide-react';
import { api, API_URL } from '../lib/api';
import { useAuth, useMe } from '../lib/auth';
import { BLOOD_GROUPS, SKILLS } from '../lib/constants';
import { plural } from '../lib/format';
import { enablePush, pushSupported } from '../lib/push';
import type { Me, UserCard } from '../lib/types';
import {
  Avatar, Button, Checkbox, ChipSelect, FormError, Input, Notice, Select, Skeleton, Spinner, Textarea, UserLine, fieldError, toastError,
} from '../components/ui';
import { Logo } from '../components/Logo';
import { MapPicker, type Place } from '../components/Map';
import { FileButton } from '../components/ImagePicker';
import { FollowButton } from '../components/FollowButton';
import { IMAGE_ACCEPT, INTEREST_OPTIONS, ORG_TYPE_OPTIONS, checkImage, uploadProfileImage } from '../components/SettingsKit';

type StepId = 'welcome' | 'location' | 'interests' | 'organization' | 'donor' | 'verification' | 'finish';
interface StepProps { onNext: () => void; onSkip: () => void; isLast: boolean }

/** PATCH helper that keeps the auth user in sync. */
function useSave<V>(fn: (v: V) => Promise<Me>) {
  const { setUser } = useAuth();
  return useMutation({ mutationFn: fn, onSuccess: (me) => setUser(me) });
}

function StepShell({ title, lead, children, footer }: { title: string; lead?: ReactNode; children: ReactNode; footer: ReactNode }) {
  const h = useRef<HTMLHeadingElement>(null);
  useEffect(() => { h.current?.focus(); }, []);
  return (
    <div className="card p-5 sm:p-8">
      <h1 ref={h} tabIndex={-1} className="text-2xl font-extrabold outline-none focus-visible:ring-0 sm:text-[28px]">{title}</h1>
      {lead && <p className="mt-1.5 text-ink-soft">{lead}</p>}
      <div className="mt-6">{children}</div>
      <div className="mt-8 flex flex-wrap items-center justify-end gap-2 border-t border-paper-line pt-4">{footer}</div>
    </div>
  );
}

function Footer({ onSkip, onContinue, loading, disabled, continueLabel = 'Continue', skipLabel = 'Skip for now' }: { onSkip?: () => void; onContinue: () => void; loading?: boolean; disabled?: boolean; continueLabel?: string; skipLabel?: string }) {
  return (
    <>
      {onSkip && <Button variant="ghost" onClick={onSkip}>{skipLabel}</Button>}
      <Button onClick={onContinue} loading={loading} disabled={disabled}>{continueLabel}</Button>
    </>
  );
}

// ───────────────────────── steps ─────────────────────────
function WelcomeStep({ onNext, onSkip }: StepProps) {
  const me = useMe();
  const { setUser } = useAuth();
  const isOrg = me.role === 'organizer' || me.role === 'csr';
  const [headline, setHeadline] = useState(me.headline ?? '');
  const upload = useMutation({ mutationFn: (f: File) => uploadProfileImage('avatar', f), onSuccess: (u) => { setUser(u); toast.success('Photo added'); }, onError: toastError });
  const save = useSave(() => api<Me>('/users/me', { method: 'PATCH', body: { headline: headline.trim() || null } }));
  const next = () => {
    if ((headline.trim() || null) === (me.headline ?? null)) return onNext();
    save.mutate(undefined, { onSuccess: onNext });
  };
  return (
    <StepShell
      title={`Welcome to ServeConnect, ${me.name.split(' ')[0]}`}
      lead={isOrg ? "Let's set up your organization's page so volunteers and donors can find and trust you. It takes about two minutes." : "Let's set up your profile so we can show you events and requests that match you. It takes about two minutes."}
      footer={<Footer onSkip={onSkip} onContinue={next} loading={save.isPending} />}
    >
      <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center sm:gap-5">
        <div className="relative">
          <Avatar src={me.avatarUrl} name={me.name} size={96} />
          {upload.isPending && <span className="absolute inset-0 flex items-center justify-center rounded-full bg-white/70"><Spinner /></span>}
        </div>
        <div className="text-center sm:text-left">
          <div className="font-semibold">{isOrg ? 'Your logo' : 'Your photo'}</div>
          <p className="text-sm text-ink-soft">{isOrg ? 'A clear logo helps people recognise your events.' : 'Organizers find it easier to welcome you on the day.'}</p>
          <FileButton accept={IMAGE_ACCEPT} onFile={(f) => { const err = checkImage(f); if (err) toast.error(err); else upload.mutate(f); }}
            className="mt-2 inline-flex items-center gap-2 rounded-xl border border-paper-line bg-white px-3 py-1.5 text-sm font-semibold hover:bg-paper">
            <Camera className="h-4 w-4" aria-hidden />{me.avatarUrl ? 'Change' : 'Upload'} {isOrg ? 'logo' : 'photo'}
          </FileButton>
        </div>
      </div>
      <Input className="mt-6" label="Headline" optional value={headline} onChange={(e) => setHeadline(e.target.value)} maxLength={120}
        placeholder={isOrg ? 'e.g. Feeding 500 families a week across North Chennai' : 'e.g. Engineering student · loves teaching kids'}
        hint="One line that appears under your name." error={fieldError(save.error, 'headline')} />
      <div className="mt-3"><FormError error={save.error && !fieldError(save.error, 'headline') && save.error} /></div>
    </StepShell>
  );
}

function LocationStep({ onNext, onSkip }: StepProps) {
  const me = useMe();
  const [place, setPlace] = useState<Place | null>(me.lat != null && me.lng != null ? { lat: me.lat, lng: me.lng, name: me.locationName ?? undefined } : null);
  const save = useSave((p: Place) => api<Me>('/users/me', { method: 'PATCH', body: { lat: p.lat, lng: p.lng, locationName: p.name ?? `${p.lat.toFixed(3)}, ${p.lng.toFixed(3)}` } }));
  return (
    <StepShell
      title="Where are you based?"
      lead="Your location powers nearby events, donation drives and — if you opt in — urgent blood requests close to you."
      footer={<Footer onSkip={onSkip} onContinue={() => place && save.mutate(place, { onSuccess: onNext })} loading={save.isPending} disabled={!place} />}
    >
      <MapPicker value={place} onChange={setPlace} label="Search your area or tap “Use my location”" height={280} />
      <div className="mt-4 flex gap-3 rounded-xl bg-paper p-3 text-sm text-ink-soft">
        <Lock className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
        <p>
          Others only ever see your general area, blurred to about 1 km — never your exact pin.
          {me.isMinor ? ' Because you are under 18, your location is never shown on your profile at all.' : " Accounts of people under 18 never show location at all. You can hide yours in Privacy settings."}
        </p>
      </div>
      <FormError error={save.error} />
    </StepShell>
  );
}

function InterestsStep({ onNext, onSkip }: StepProps) {
  const me = useMe();
  const [skills, setSkills] = useState<string[]>(me.skills ?? []);
  const [interests, setInterests] = useState<string[]>(me.interests ?? []);
  const save = useSave(() => api<Me>('/users/me', { method: 'PATCH', body: { skills, interests } }));
  return (
    <StepShell
      title="What can you help with?"
      lead="We use your skills and causes to recommend events and let organizers who need your skills find you."
      footer={<Footer onSkip={onSkip} onContinue={() => save.mutate(undefined, { onSuccess: onNext })} loading={save.isPending} disabled={!skills.length && !interests.length} />}
    >
      <h2 className="mb-2 text-base font-bold">Skills <span className="font-normal text-ink-faint">· {skills.length}/15</span></h2>
      <ChipSelect options={SKILLS} value={skills} onChange={setSkills} max={15} />
      <h2 className="mb-2 mt-6 text-base font-bold">Causes you care about <span className="font-normal text-ink-faint">· {interests.length}/15</span></h2>
      <ChipSelect options={INTEREST_OPTIONS} value={interests} onChange={setInterests} max={15} />
      <div className="mt-4"><FormError error={save.error} /></div>
    </StepShell>
  );
}

function OrganizationStep({ onNext, onSkip }: StepProps) {
  const me = useMe();
  const [f, setF] = useState({ orgType: me.orgType ?? '', orgRegistrationNo: me.orgRegistrationNo ?? '', bio: me.bio ?? '', website: me.website ?? '' });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const save = useSave(() => {
    const w = f.website.trim();
    return api<Me>('/users/me', {
      method: 'PATCH',
      body: {
        orgType: f.orgType || undefined,
        orgRegistrationNo: f.orgRegistrationNo.trim() || null,
        bio: f.bio.trim() || null,
        website: w ? (/^https?:\/\//i.test(w) ? w : `https://${w}`) : null,
      },
    });
  });
  const err = (k: string) => fieldError(save.error, k);
  return (
    <StepShell
      title="About your organization"
      lead="This appears on your public page and helps our team review your verification faster."
      footer={<Footer onSkip={onSkip} onContinue={() => save.mutate(undefined, { onSuccess: onNext })} loading={save.isPending} />}
    >
      <div className="space-y-4">
        <Select label="Organization type" value={f.orgType} onChange={set('orgType')} options={ORG_TYPE_OPTIONS} placeholder="Choose one" error={err('orgType')} />
        <Input label="Registration number" optional value={f.orgRegistrationNo} onChange={set('orgRegistrationNo')} maxLength={80} hint="Trust / Society / Section 8 / CIN, or your NGO Darpan ID" error={err('orgRegistrationNo')} />
        <Textarea label="What you do" optional rows={4} maxLength={2000} value={f.bio} onChange={set('bio')} placeholder="Your mission, the communities you serve and how volunteers help." error={err('bio')} />
        <Input label="Website" optional type="url" inputMode="url" placeholder="https://" value={f.website} onChange={set('website')} maxLength={200} error={err('website')} />
        <FormError error={save.error && !['orgType', 'orgRegistrationNo', 'bio', 'website'].some(err) && save.error} />
      </div>
    </StepShell>
  );
}

function DonorStep({ onNext, onSkip }: StepProps) {
  const me = useMe();
  const [optIn, setOptIn] = useState(me.isBloodDonor);
  const [group, setGroup] = useState(me.bloodGroup ?? '');
  const [consent, setConsent] = useState(me.isBloodDonor);
  const hasLocation = me.lat != null && me.lng != null;
  const save = useSave(() => api<Me>('/users/me/donor', { method: 'PATCH', body: { isBloodDonor: true, bloodGroup: group, consent, donorRadiusKm: me.donorRadiusKm || 25 } }));
  return (
    <StepShell
      title="Become a blood donor?"
      lead="Optional. When someone nearby urgently needs a blood group you can give, we'll alert you. You always choose whether to respond."
      footer={<Footer onSkip={onSkip} skipLabel="Not now" onContinue={() => (optIn ? save.mutate(undefined, { onSuccess: () => { toast.success('You are registered as a blood donor'); onNext(); } }) : onNext())}
        loading={save.isPending} disabled={optIn && (!group || !consent || !hasLocation)} continueLabel={optIn ? 'Register and continue' : 'Continue'} />}
    >
      <div className="space-y-4">
        <label className={clsx('flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition', optIn ? 'border-blood-100 bg-blood-50' : 'border-paper-line')}>
          <input type="checkbox" className="mt-1 h-5 w-5 rounded border-paper-line text-blood-500" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} />
          <span>
            <span className="flex items-center gap-1.5 font-semibold"><Droplet className="h-4 w-4 text-blood-500" aria-hidden />Yes, alert me about nearby blood requests</span>
            <span className="text-sm text-ink-soft">You must be 18 or older and leave 90 days between donations.</span>
          </span>
        </label>
        {optIn && (
          <>
            {!hasLocation && <Notice tone="marigold" icon={<MapPin className="h-5 w-5" />}>Add your location in the previous step so we can match you with nearby requests.</Notice>}
            <Select label="Your blood group" value={group} onChange={(e) => setGroup(e.target.value)} options={BLOOD_GROUPS.map((g) => [g, g] as [string, string])} placeholder="Choose your blood group" error={fieldError(save.error, 'bloodGroup')} />
            <Checkbox checked={consent} onChange={setConsent} error={fieldError(save.error, 'consent')}
              label="My blood group is used only to match me with nearby requests and is never shown on my profile" />
            <p className="flex gap-2 text-sm text-ink-soft"><Lock className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" aria-hidden />Your blood group is stored encrypted. Change or opt out any time in Settings → Blood donor.</p>
          </>
        )}
        <FormError error={save.error && !fieldError(save.error, 'bloodGroup') && !fieldError(save.error, 'consent') && save.error} />
      </div>
    </StepShell>
  );
}

function VerificationStep({ onNext, onSkip, onVerifyNow, finishing }: StepProps & { onVerifyNow: () => void; finishing: boolean }) {
  const me = useMe();
  const pending = me.verificationStatus === 'pending';
  return (
    <StepShell
      title="Get verified to publish"
      lead="Verified organizers get a badge on every event and post — and only verified organizers can publish events and donation requests. It protects volunteers and donors from fraud."
      footer={pending ? <Button onClick={onNext}>Continue</Button> : <><Button variant="ghost" onClick={onSkip}>Not now</Button><Button icon={<ShieldCheck className="h-4 w-4" />} loading={finishing} onClick={onVerifyNow}>Verify now</Button></>}
    >
      {pending && <div className="mb-5"><Notice tone="brand" icon={<ShieldCheck className="h-5 w-5" />} title="Your documents are under review">We'll notify you as soon as there's a decision. You can prepare events as drafts meanwhile.</Notice></div>}
      <ol className="space-y-3">
        {[
          ['Upload a document', me.role === 'csr' ? 'Your company incorporation or CSR registration certificate.' : 'Your NGO registration (Trust deed, Society or Section 8 certificate, 12A/80G or Darpan ID). Independent organizers can use a government photo ID.'],
          ['We review it', 'Most reviews finish within 2 working days. Files are encrypted, seen only by our admin team, and deleted 90 days after a decision.'],
          ['Start publishing', "Your Verified badge goes live and you can publish. Until then, you can prepare events as drafts."],
        ].map(([t, b], i) => (
          <li key={t} className="flex gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 font-display font-bold text-brand-700">{i + 1}</span>
            <div><div className="font-semibold">{t}</div><p className="text-sm text-ink-soft">{b}</p></div>
          </li>
        ))}
      </ol>
      <a href={`${API_URL}/api/handbook.pdf`} target="_blank" rel="noopener noreferrer" className="mt-6 flex items-center gap-3 rounded-xl border border-paper-line p-3 hover:bg-paper">
        <BookOpen className="h-6 w-6 shrink-0 text-brand-600" aria-hidden />
        <span><span className="block font-semibold">Organizer Handbook (PDF)</span><span className="text-sm text-ink-soft">Verification, check-in, certificates, blood requests and volunteer safety.</span></span>
        <span className="sr-only">(opens in a new tab)</span>
      </a>
    </StepShell>
  );
}

function FinishStep({ onFinish, finishing, error }: { onFinish: () => void; finishing: boolean; error: unknown }) {
  const me = useMe();
  const suggestions = useQuery({ queryKey: ['suggestions'], queryFn: () => api<(UserCard & { followers: number; distanceKm: number | null })[]>('/users/suggestions') });
  const [push, setPush] = useState<'idle' | 'busy' | 'on' | string>('idle');
  const turnOnPush = async () => {
    setPush('busy');
    try {
      const r = await enablePush();
      setPush(r === 'ok' ? 'on' : r);
    } catch (e) {
      setPush(e instanceof Error ? e.message : "Couldn't turn on notifications.");
    }
  };
  const isOrg = me.role !== 'volunteer';
  const tour: { icon: ReactNode; title: string; body: string }[] = [
    { icon: <Home />, title: 'Feed', body: 'Updates, photos and calls for help from people and organizations you follow.' },
    { icon: <CalendarDays />, title: 'Events & check-in', body: isOrg ? 'Publish events, manage your waitlist and teams, and check volunteers in with a QR code that refreshes every minute.' : 'Register in one tap. On the day, scan the QR code or give your personal check-in code to earn verified hours and a certificate.' },
    { icon: <HandHeart />, title: 'Requests', body: 'Urgent blood requests reach compatible donors nearby. Donation drives show exactly what is needed, with live pledge counts.' },
  ];
  return (
    <StepShell
      title="You're all set"
      lead="Follow a few organizations to fill your feed, and turn on notifications so you never miss an urgent request."
      footer={<Button size="lg" loading={finishing} onClick={onFinish}>Go to my feed</Button>}
    >
      <section aria-labelledby="sugg-h">
        <h2 id="sugg-h" className="mb-3 text-base font-bold">Organizations near you</h2>
        {suggestions.isPending ? (
          <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}</div>
        ) : suggestions.isError ? (
          <p className="text-sm text-ink-soft">Couldn't load suggestions. You can find organizations later in Explore.</p>
        ) : suggestions.data.length === 0 ? (
          <p className="text-sm text-ink-soft">No suggestions right now — browse Explore once you're in.</p>
        ) : (
          <ul className="space-y-3">
            {suggestions.data.slice(0, 5).map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2">
                <UserLine user={s} size={40} sub={[plural(s.followers, 'follower'), s.distanceKm != null ? `${s.distanceKm} km away` : s.headline].filter(Boolean).join(' · ')} />
                <FollowButton key={s.id} userId={s.id} following={false} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="push-h" className="mt-6 rounded-2xl border border-paper-line p-4">
        <h2 id="push-h" className="flex items-center gap-2 text-base font-bold"><BellRing className="h-5 w-5 text-brand-600" aria-hidden />Notifications on this device</h2>
        <p className="mt-1 text-sm text-ink-soft">Event reminders, weather advisories and urgent blood requests — even when the app is closed.</p>
        <div className="mt-3" aria-live="polite">
          {push === 'on' ? (
            <span className="inline-flex items-center gap-1.5 font-semibold text-leaf-700"><CheckCircle2 className="h-5 w-5" aria-hidden />Notifications are on</span>
          ) : !pushSupported() ? (
            <p className="text-sm text-ink-faint">This browser doesn't support push. On iPhone, add ServeConnect to your Home Screen first, then turn them on in Settings.</p>
          ) : (
            <>
              <Button variant="secondary" icon={<BellRing className="h-4 w-4" />} loading={push === 'busy'} onClick={turnOnPush}>Turn on notifications</Button>
              {push !== 'idle' && push !== 'busy' && <p className="mt-2 text-sm text-marigold-700">{push}</p>}
            </>
          )}
        </div>
      </section>

      <section aria-labelledby="tour-h" className="mt-6">
        <h2 id="tour-h" className="mb-3 text-base font-bold">A quick tour</h2>
        <ol className="grid gap-3 sm:grid-cols-3">
          {tour.map((c, i) => (
            <li key={c.title} className="rounded-2xl bg-paper p-4">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-brand-600 [&>svg]:h-5 [&>svg]:w-5" aria-hidden>{c.icon}</span>
                <span className="text-xs font-semibold text-ink-faint">{i + 1} of 3</span>
              </div>
              <h3 className="mt-2 font-bold">{c.title}</h3>
              <p className="mt-0.5 text-sm text-ink-soft">{c.body}</p>
            </li>
          ))}
        </ol>
        <p className="mt-3 flex items-center gap-2 text-sm text-ink-soft"><QrCode className="h-4 w-4 shrink-0" aria-hidden />Tip: on event day, open Check in from the menu to scan the organizer's QR code.</p>
      </section>
      <div className="mt-4"><FormError error={error} /></div>
    </StepShell>
  );
}

// ───────────────────────── wizard ─────────────────────────
export default function Onboarding() {
  const me = useMe();
  const { setUser, signOut } = useAuth();
  const { t } = useTranslation();
  const nav = useNavigate();

  const steps: StepId[] =
    me.role === 'volunteer'
      ? ['welcome', 'location', 'interests', ...(me.isMinor ? [] : (['donor'] as StepId[])), 'finish']
      : me.role === 'admin'
        ? ['welcome', 'location', 'finish']
        : ['welcome', 'location', 'organization', ...(me.verificationStatus === 'verified' ? [] : (['verification'] as StepId[])), 'finish'];
  const [index, setIndex] = useState(0);
  const step = steps[Math.min(index, steps.length - 1)];
  const next = () => setIndex((i) => Math.min(i + 1, steps.length - 1));
  const back = () => setIndex((i) => Math.max(0, i - 1));
  useEffect(() => { window.scrollTo({ top: 0 }); }, [index]);
  useEffect(() => { document.title = 'Set up your profile · ServeConnect'; }, []);

  const complete = useMutation({
    mutationFn: (_to: string) => api<Me>('/users/me/onboarding-complete', { method: 'POST' }),
    onSuccess: (u, to) => { setUser(u); nav(to, { replace: true }); },
  });

  const props: StepProps = { onNext: next, onSkip: next, isLast: index === steps.length - 1 };
  const labels: Record<StepId, string> = {
    welcome: 'Welcome', location: 'Location', interests: 'Skills & causes', organization: 'Organization', donor: 'Blood donor', verification: 'Verification', finish: 'Finish',
  };

  return (
    <div className="min-h-screen bg-paper">
      <header className="mx-auto flex max-w-2xl items-center justify-between px-4 pb-2 pt-5 sm:px-6">
        <Logo compact />
        <button type="button" onClick={() => signOut().then(() => nav('/', { replace: true }))} className="text-sm font-semibold text-ink-soft hover:text-ink">{t('nav.signOut', 'Sign out')}</button>
      </header>

      <main id="main" className="mx-auto max-w-2xl px-4 pb-16 sm:px-6">
        <div className="mb-5 mt-3">
          <div className="mb-2 flex items-center justify-between text-sm">
            {index > 0 ? (
              <button type="button" onClick={back} className="inline-flex items-center gap-1 font-semibold text-ink-soft hover:text-ink"><ArrowLeft className="h-4 w-4" aria-hidden />Back</button>
            ) : <span />}
            <span className="text-ink-soft">Step {index + 1} of {steps.length} · <span className="font-semibold text-ink">{labels[step]}</span></span>
          </div>
          <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }} role="progressbar" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={index + 1} aria-label="Setup progress">
            {steps.map((s, i) => <div key={s} className={clsx('h-1.5 rounded-full transition', i <= index ? 'bg-brand-600' : 'bg-paper-line')} />)}
          </div>
        </div>

        <div key={step}>
          {step === 'welcome' && <WelcomeStep {...props} />}
          {step === 'location' && <LocationStep {...props} />}
          {step === 'interests' && <InterestsStep {...props} />}
          {step === 'organization' && <OrganizationStep {...props} />}
          {step === 'donor' && <DonorStep {...props} />}
          {step === 'verification' && <VerificationStep {...props} onVerifyNow={() => complete.mutate('/settings/verification')} finishing={complete.isPending && complete.variables === '/settings/verification'} />}
          {step === 'finish' && <FinishStep onFinish={() => complete.mutate('/feed')} finishing={complete.isPending} error={complete.error} />}
        </div>
        {step === 'verification' && complete.error && <div className="mt-3"><FormError error={complete.error} /></div>}
      </main>
    </div>
  );
}
