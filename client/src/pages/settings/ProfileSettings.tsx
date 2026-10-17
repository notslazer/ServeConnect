import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Camera, ExternalLink, ImagePlus } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth, useMe } from '../../lib/auth';
import { SKILLS } from '../../lib/constants';
import type { Me } from '../../lib/types';
import { Avatar, Button, ChipSelect, FormError, Input, Select, Spinner, Textarea, fieldError, toastError } from '../../components/ui';
import { MapPicker, type Place } from '../../components/Map';
import { FileButton } from '../../components/ImagePicker';
import {
  IMAGE_ACCEPT, INTEREST_OPTIONS, ORG_TYPE_OPTIONS, SettingsBlock, checkImage, uploadProfileImage, useMeMutation,
} from '../../components/SettingsKit';

function ImagesBlock() {
  const me = useMe();
  const { setUser } = useAuth();
  const upload = useMutation({
    mutationFn: ({ kind, file }: { kind: 'avatar' | 'cover'; file: File }) => uploadProfileImage(kind, file),
    onSuccess: (u, v) => { setUser(u); toast.success(v.kind === 'avatar' ? 'Profile photo updated' : 'Cover image updated'); },
    onError: toastError,
  });
  const pick = (kind: 'avatar' | 'cover') => (file: File) => {
    const err = checkImage(file);
    if (err) return toast.error(err);
    upload.mutate({ kind, file });
  };
  const busy = (k: 'avatar' | 'cover') => upload.isPending && upload.variables?.kind === k;
  return (
    <SettingsBlock id="images-h" title="Photo and cover" description="JPG, PNG, WebP or GIF up to 5 MB. A clear photo or logo helps people recognise you.">
      <div className="overflow-hidden rounded-2xl border border-paper-line">
        <div className="relative h-28 bg-brand-100 sm:h-36">
          {me.coverUrl && <img src={me.coverUrl} alt="" className="h-full w-full object-cover" />}
          <FileButton accept={IMAGE_ACCEPT} onFile={pick('cover')} className="absolute right-2 top-2 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-sm font-semibold shadow-lift hover:bg-white">
            {busy('cover') ? <Spinner className="h-4 w-4" /> : <ImagePlus className="h-4 w-4" aria-hidden />}
            {me.coverUrl ? 'Change cover' : 'Add cover'}
          </FileButton>
        </div>
        <div className="flex items-end gap-3 px-4 pb-4">
          <div className="relative -mt-10">
            <Avatar src={me.avatarUrl} name={me.name} size={88} className="border-4 border-white" />
          </div>
          <FileButton accept={IMAGE_ACCEPT} onFile={pick('avatar')} className="mb-1 inline-flex items-center gap-1.5 rounded-xl border border-paper-line bg-white px-3 py-1.5 text-sm font-semibold hover:bg-paper">
            {busy('avatar') ? <Spinner className="h-4 w-4" /> : <Camera className="h-4 w-4" aria-hidden />}
            {me.avatarUrl ? 'Change photo' : 'Upload photo'}
          </FileButton>
        </div>
      </div>
    </SettingsBlock>
  );
}

export default function ProfileSettings() {
  const me = useMe();
  const isOrg = me.role === 'organizer' || me.role === 'csr';
  const [f, setF] = useState({
    name: me.name,
    handle: me.handle,
    headline: me.headline ?? '',
    bio: me.bio ?? '',
    website: me.website ?? '',
    orgType: me.orgType ?? '',
    orgRegistrationNo: me.orgRegistrationNo ?? '',
  });
  const [place, setPlace] = useState<Place | null>(me.lat != null && me.lng != null ? { lat: me.lat, lng: me.lng, name: me.locationName ?? undefined } : null);
  const [skills, setSkills] = useState<string[]>(me.skills ?? []);
  const [interests, setInterests] = useState<string[]>(me.interests ?? []);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  const save = useMeMutation(() => {
    const website = f.website.trim();
    return api<Me>('/users/me', {
      method: 'PATCH',
      body: {
        name: f.name.trim(),
        handle: f.handle.trim().replace(/^@/, ''),
        headline: f.headline.trim() || null,
        bio: f.bio.trim() || null,
        website: website ? (/^https?:\/\//i.test(website) ? website : `https://${website}`) : null,
        locationName: place ? place.name ?? `${place.lat.toFixed(4)}, ${place.lng.toFixed(4)}` : null,
        lat: place?.lat ?? null,
        lng: place?.lng ?? null,
        skills,
        interests,
        ...(isOrg ? { orgType: f.orgType || undefined, orgRegistrationNo: f.orgRegistrationNo.trim() || null } : {}),
      },
    });
  }, { success: 'Profile saved' });

  const submit = (e: FormEvent) => { e.preventDefault(); save.mutate(); };
  const err = (k: string) => fieldError(save.error, k);
  const hasFieldErrors = save.error && ['name', 'handle', 'headline', 'bio', 'website', 'orgType', 'orgRegistrationNo', 'skills', 'interests'].some((k) => err(k));

  return (
    <div className="space-y-4">
      <ImagesBlock />
      <form onSubmit={submit} className="space-y-4" noValidate>
        <SettingsBlock id="basics-h" title="Basics" actions={<Link to={`/u/${me.handle}`} className="link inline-flex items-center gap-1 text-sm">View profile <ExternalLink className="h-3.5 w-3.5" aria-hidden /></Link>}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label={isOrg ? 'Organization name' : 'Full name'} value={f.name} onChange={set('name')} maxLength={80} required autoComplete={isOrg ? 'organization' : 'name'} error={err('name')} />
            <Input
              label="Username"
              value={f.handle}
              onChange={set('handle')}
              maxLength={30}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              hint={`serveconnect.app/u/${f.handle || 'username'}`}
              error={err('handle')}
            />
            <Input className="sm:col-span-2" label="Headline" optional value={f.headline} onChange={set('headline')} maxLength={120}
              placeholder={isOrg ? 'e.g. Protecting Chennai’s wetlands since 2012' : 'e.g. Nursing student · weekend volunteer'} error={err('headline')} />
            <Textarea className="sm:col-span-2" label={isOrg ? 'About your organization' : 'Bio'} optional rows={5} value={f.bio} onChange={set('bio')} maxLength={2000}
              hint={`${f.bio.length}/2000`} error={err('bio')} />
            <Input className="sm:col-span-2" label="Website" optional type="url" inputMode="url" placeholder="https://" value={f.website} onChange={set('website')} maxLength={200} error={err('website')} />
          </div>
        </SettingsBlock>

        {isOrg && (
          <SettingsBlock id="org-h" title="Organization details" description="Shown on your profile and used by our team when reviewing verification.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Select label="Organization type" value={f.orgType} onChange={set('orgType')} options={ORG_TYPE_OPTIONS} placeholder="Choose one" error={err('orgType')} />
              <Input label="Registration number" optional value={f.orgRegistrationNo} onChange={set('orgRegistrationNo')} maxLength={80}
                hint="Trust / Society / Section 8 / CIN or NGO Darpan ID" error={err('orgRegistrationNo')} />
            </div>
          </SettingsBlock>
        )}

        <SettingsBlock id="loc-h" title="Location" description="Powers nearby events, requests and blood-donor matching. Others see only your area, never your exact pin — and minors' location is never shown.">
          <MapPicker value={place} onChange={setPlace} label="Your area" />
          {place && <Button className="mt-2" size="sm" variant="ghost" onClick={() => setPlace(null)}>Remove location</Button>}
        </SettingsBlock>

        {!isOrg && (
          <SettingsBlock id="skills-h" title="Skills" description={`Pick up to 15. Organizers looking for these skills can invite you, and matching events are recommended to you. ${skills.length}/15 selected.`}>
            <ChipSelect options={SKILLS} value={skills} onChange={setSkills} max={15} />
            {err('skills') && <p role="alert" className="mt-2 text-sm text-blood-600">{err('skills')}</p>}
          </SettingsBlock>
        )}

        <SettingsBlock id="interests-h" title={isOrg ? 'Focus areas' : 'Causes you care about'} description={`Pick up to 15. ${interests.length}/15 selected.`}>
          <ChipSelect options={INTEREST_OPTIONS} value={interests} onChange={setInterests} max={15} />
        </SettingsBlock>

        {isOrg && (
          <SettingsBlock id="orgskills-h" title="Skills your team offers" description={`Optional. ${skills.length}/15 selected.`}>
            <ChipSelect options={SKILLS} value={skills} onChange={setSkills} max={15} />
          </SettingsBlock>
        )}

        <div className="sticky bottom-20 z-10 flex flex-wrap items-center justify-end gap-3 rounded-2xl border border-paper-line bg-white/95 p-3 shadow-lift backdrop-blur lg:bottom-4">
          {save.error && !hasFieldErrors && <div className="mr-auto min-w-0 flex-1"><FormError error={save.error} /></div>}
          {hasFieldErrors && <p role="alert" className="mr-auto text-sm text-blood-600">Fix the highlighted fields and try again.</p>}
          <Button type="submit" loading={save.isPending}>Save profile</Button>
        </div>
      </form>
    </div>
  );
}
