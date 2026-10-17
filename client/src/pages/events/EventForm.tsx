import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { ImagePlus, ShieldCheck, Trash2 } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { useMe } from '../../lib/auth';
import { EVENT_CATEGORIES, SKILLS } from '../../lib/constants';
import { FileButton } from '../../components/ImagePicker';
import { MapPicker, type Place } from '../../components/Map';
import {
  Button, ButtonLink, Card, Checkbox, ChipSelect, EmptyState, ErrorState, FormError, Input, Notice, PageHeader, PageLoader, Select, Textarea, Toggle,
} from '../../components/ui';
import { EventCover } from '../../components/EventCard';
import { fromLocalInput, toLocalInput, type EventDetail } from '../../components/EventsKit';

const REMINDERS: [number, string][] = [[10080, '1 week before'], [1440, '1 day before'], [180, '3 hours before'], [60, '1 hour before'], [15, '15 minutes before']];
const COVER_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

interface FormState {
  title: string;
  description: string;
  category: string;
  startAt: string; // datetime-local value
  endAt: string;
  place: Place | null;
  locationName: string;
  address: string;
  isOutdoor: boolean;
  capacity: string;
  skillsNeeded: string[];
  requirements: string;
  minAge: string;
  checkinGraceMin: string;
  reminderOffsets: number[];
}

const empty: FormState = {
  title: '', description: '', category: 'volunteering', startAt: '', endAt: '', place: null, locationName: '', address: '', isOutdoor: false,
  capacity: '30', skillsNeeded: [], requirements: '', minAge: '', checkinGraceMin: '30', reminderOffsets: [1440, 60],
};

function fromEvent(e: EventDetail): FormState {
  return {
    title: e.title,
    description: e.description,
    category: e.category,
    startAt: toLocalInput(e.startAt),
    endAt: toLocalInput(e.endAt),
    place: e.lat != null && e.lng != null ? { lat: e.lat, lng: e.lng, name: e.locationName ?? undefined } : null,
    locationName: e.locationName ?? '',
    address: e.address ?? '',
    isOutdoor: e.isOutdoor,
    capacity: String(e.capacity),
    skillsNeeded: e.skillsNeeded,
    requirements: e.requirements ?? '',
    minAge: e.minAge ? String(e.minAge) : '',
    checkinGraceMin: String(e.checkinGraceMin),
    reminderOffsets: e.reminderOffsets ?? [],
  };
}

function validate(f: FormState, isNew: boolean, startChanged: boolean) {
  const err: Record<string, string> = {};
  if (f.title.trim().length < 5) err.title = 'Title must be at least 5 characters';
  if (f.description.trim().length < 20) err.description = 'Describe the event in at least 20 characters';
  if (!f.startAt) err.startAt = 'Choose a start date & time';
  else if ((isNew || startChanged) && new Date(f.startAt).getTime() < Date.now()) err.startAt = 'The start time must be in the future';
  if (!f.endAt) err.endAt = 'Choose an end date & time';
  else if (f.startAt && new Date(f.endAt) <= new Date(f.startAt)) err.endAt = 'End time must be after the start time';
  const cap = Number(f.capacity);
  if (!Number.isInteger(cap) || cap < 1) err.capacity = 'Capacity must be at least 1';
  else if (cap > 100000) err.capacity = 'Capacity can be at most 100,000';
  if (f.minAge) {
    const a = Number(f.minAge);
    if (!Number.isInteger(a) || a < 13 || a > 100) err.minAge = 'Minimum age must be between 13 and 100';
  }
  const g = Number(f.checkinGraceMin);
  if (!Number.isInteger(g) || g < 5 || g > 240) err.checkinGraceMin = 'Grace period must be 5–240 minutes';
  return err;
}

export default function EventForm() {
  const { id } = useParams();
  const isNew = !id;
  const { t } = useTranslation();
  const me = useMe();
  const nav = useNavigate();
  const qc = useQueryClient();
  const canPublish = me.verificationStatus === 'verified' || me.role === 'admin';

  const existing = useQuery({ queryKey: ['event', id], queryFn: () => api<EventDetail>(`/events/${id}`), enabled: !isNew });
  const [f, setF] = useState<FormState>(empty);
  const [loaded, setLoaded] = useState(isNew);
  const [cover, setCover] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (existing.data && !loaded) {
      setF(fromEvent(existing.data));
      setLoaded(true);
    }
  }, [existing.data, loaded]);

  useEffect(() => {
    if (!cover) return setCoverPreview(null);
    const u = URL.createObjectURL(cover);
    setCoverPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [cover]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setF((p) => ({ ...p, [k]: v }));
    if (errors[k as string]) setErrors((e) => { const n = { ...e }; delete n[k as string]; return n; });
  };

  const original = useMemo(() => (existing.data ? fromEvent(existing.data) : null), [existing.data]);

  const save = useMutation({
    mutationFn: async (mode: 'draft' | 'publish' | 'update' | 'update-publish') => {
      const body: Record<string, unknown> = {
        title: f.title.trim(),
        description: f.description.trim(),
        category: f.category,
        startAt: fromLocalInput(f.startAt),
        endAt: fromLocalInput(f.endAt),
        // On edit an empty string clears the field; on create it's simply omitted.
        locationName: f.locationName.trim() || (isNew ? undefined : ''),
        address: f.address.trim() || (isNew ? undefined : ''),
        lat: f.place?.lat ?? null,
        lng: f.place?.lng ?? null,
        isOutdoor: f.isOutdoor,
        capacity: Number(f.capacity),
        skillsNeeded: f.skillsNeeded,
        requirements: f.requirements.trim() || (isNew ? undefined : ''),
        minAge: f.minAge ? Number(f.minAge) : null,
        checkinGraceMin: Number(f.checkinGraceMin),
        reminderOffsets: [...f.reminderOffsets].sort((a, b) => b - a),
      };
      let eventId = id;
      if (isNew) {
        const created = await api<{ id: string }>('/events', { body: { ...body, publish: mode === 'publish' } });
        eventId = created.id;
      } else {
        // Leaving the start unchanged on an event that already started must not trip "start in future" rules.
        if (original && original.startAt === f.startAt) delete body.startAt;
        if (original && original.endAt === f.endAt) delete body.endAt;
        await api(`/events/${id}`, { method: 'PATCH', body });
      }
      let coverFailed = false;
      if (cover && eventId) {
        const form = new FormData();
        form.append('file', cover);
        await api(`/events/${eventId}/cover`, { form }).catch(() => { coverFailed = true; });
      }
      if (mode === 'update-publish') await api(`/events/${id}/publish`, { method: 'POST' });
      return { eventId: eventId!, coverFailed, mode };
    },
    onSuccess: ({ eventId, coverFailed, mode }) => {
      qc.invalidateQueries({ queryKey: ['event', eventId] });
      qc.invalidateQueries({ queryKey: ['events'] });
      const msg = { draft: 'Draft saved. Only you can see it.', publish: 'Event published. Followers and matching volunteers are being notified.', update: 'Changes saved.', 'update-publish': 'Changes saved and event published.' }[mode];
      toast.success(msg);
      if (coverFailed) toast.error("The cover image couldn't be uploaded. Try again from Edit event.");
      nav(`/events/${eventId}`);
    },
    onError: (e) => {
      if (e instanceof ApiError && Object.keys(e.fields).length) setErrors(e.fields);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
  });

  const submit = (mode: 'draft' | 'publish' | 'update' | 'update-publish') => {
    const startChanged = !original || original.startAt !== f.startAt;
    const err = validate(f, isNew, startChanged);
    setErrors(err);
    if (Object.keys(err).length) {
      const first = Object.keys(err)[0];
      document.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
      return;
    }
    save.mutate(mode);
  };
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit(isNew ? 'draft' : 'update');
  };

  const err = (k: string) => errors[k];

  if (!isNew && existing.isPending) return <PageLoader />;
  if (!isNew && existing.isError) return <ErrorState error={existing.error} retry={() => existing.refetch()} />;
  if (!isNew && existing.data && !existing.data.isOwner) {
    return <EmptyState title="You can't edit this event" body="Only the organizer who created it can make changes." action={<ButtonLink to={`/events/${id}`} variant="outline">View event</ButtonLink>} />;
  }
  if (!isNew && existing.data && ['completed', 'cancelled'].includes(existing.data.status)) {
    return (
      <EmptyState
        title={`A ${existing.data.status} event can't be edited`}
        body={existing.data.status === 'completed' ? 'You can still add photos to the gallery from the event page.' : 'Create a new event if you want to run it again.'}
        action={<ButtonLink to={`/events/${id}`} variant="outline">View event</ButtonLink>}
      />
    );
  }

  const currentCover = coverPreview ?? existing.data?.coverUrl ?? null;
  const isDraft = isNew || existing.data?.status === 'draft';
  const registered = existing.data?.counts.registered ?? 0;

  return (
    <form onSubmit={onSubmit} noValidate className="mx-auto max-w-3xl">
      <PageHeader
        back
        title={isNew ? t('events.form.newTitle', 'Create an event') : t('events.form.editTitle', 'Edit event')}
        subtitle={isNew ? 'Volunteers see these details before they register.' : existing.data?.title}
      />

      <div className="space-y-4">
        {!canPublish && (
          <Notice
            tone="marigold"
            icon={<ShieldCheck className="h-5 w-5" />}
            title={me.verificationStatus === 'pending' ? 'Your verification is under review' : 'Publishing requires a verified profile'}
            action={me.verificationStatus !== 'pending' ? <ButtonLink to="/settings/verification" size="sm" variant="outline">Get verified</ButtonLink> : undefined}
          >
            You can save this event as a draft now and publish it once your profile is verified.
          </Notice>
        )}
        {!isNew && existing.data?.status === 'published' && (
          <Notice tone="brand" title="This event is live">Changes to the date, time or location notify everyone registered.</Notice>
        )}
        <FormError error={save.error} />

        <Card className="space-y-4">
          <h2 className="text-lg font-bold">Basics</h2>
          <Input name="title" label="Event title" maxLength={140} value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="Besant Nagar beach clean-up" error={err('title')} />
          <Select name="category" label="Category" value={f.category} onChange={(e) => set('category', e.target.value)} options={Object.entries(EVENT_CATEGORIES).map(([k, c]) => [k, `${c.emoji} ${c.label}`] as [string, string])} error={err('category')} />
          <Textarea
            name="description"
            label="Description"
            rows={7}
            maxLength={10000}
            value={f.description}
            onChange={(e) => set('description', e.target.value)}
            placeholder="What will volunteers do? Who does it help? What's the plan for the day?"
            hint={`${f.description.trim().length} characters · at least 20`}
            error={err('description')}
          />
        </Card>

        <Card className="space-y-4">
          <h2 className="text-lg font-bold">Date and time</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input name="startAt" type="datetime-local" label="Starts" value={f.startAt} onChange={(e) => set('startAt', e.target.value)} error={err('startAt')} />
            <Input name="endAt" type="datetime-local" label="Ends" value={f.endAt} min={f.startAt || undefined} onChange={(e) => set('endAt', e.target.value)} error={err('endAt')} />
          </div>
          <p className="text-sm text-ink-faint">Times are in your timezone ({Intl.DateTimeFormat().resolvedOptions().timeZone}).</p>
        </Card>

        <Card className="space-y-4">
          <h2 className="text-lg font-bold">Location</h2>
          <MapPicker
            label="Pin the meeting point"
            value={f.place}
            onChange={(p) => {
              setF((prev) => ({ ...prev, place: p, locationName: p.name && (!prev.locationName || prev.locationName === prev.place?.name) ? p.name.split(',').slice(0, 2).join(',').trim() : prev.locationName }));
            }}
          />
          {f.place && (
            <Button size="sm" variant="ghost" icon={<Trash2 className="h-4 w-4" />} onClick={() => set('place', null)}>Remove map pin</Button>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Input name="locationName" label="Place name" maxLength={200} value={f.locationName} onChange={(e) => set('locationName', e.target.value)} placeholder="Elliot's Beach, near the Schmidt Memorial" error={err('locationName')} />
            <Input name="address" label="Address" optional maxLength={300} value={f.address} onChange={(e) => set('address', e.target.value)} placeholder="Besant Nagar, Chennai 600090" error={err('address')} />
          </div>
          <Toggle checked={f.isOutdoor} onChange={(v) => set('isOutdoor', v)} label="Outdoor event" hint="We'll show a weather forecast and alert volunteers about rain, heat or storms in the 5 days before." />
        </Card>

        <Card className="space-y-4">
          <h2 className="text-lg font-bold">Volunteers</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              name="capacity"
              type="number"
              inputMode="numeric"
              min={Math.max(1, registered)}
              max={100000}
              label="Capacity"
              value={f.capacity}
              onChange={(e) => set('capacity', e.target.value)}
              hint={registered ? `${registered} already registered. Extra sign-ups join a waitlist.` : 'Extra sign-ups join a waitlist automatically.'}
              error={err('capacity')}
            />
            <Input name="minAge" type="number" inputMode="numeric" min={13} max={100} label="Minimum age" optional value={f.minAge} onChange={(e) => set('minAge', e.target.value)} placeholder="e.g. 16" error={err('minAge')} />
          </div>
          <div className="space-y-1.5">
            <div className="text-sm font-semibold">Skills needed <span className="font-normal text-ink-faint">(up to 10)</span></div>
            <ChipSelect options={SKILLS} value={f.skillsNeeded} onChange={(v) => set('skillsNeeded', v)} max={10} />
            {err('skillsNeeded') && <p role="alert" className="text-sm text-blood-600">{err('skillsNeeded')}</p>}
            <p className="text-sm text-ink-faint">Volunteers with these skills are notified when you publish.</p>
          </div>
          <Textarea name="requirements" label="What volunteers should bring or know" optional rows={3} maxLength={3000} value={f.requirements} onChange={(e) => set('requirements', e.target.value)} placeholder="Closed shoes, cap, water bottle. Gloves provided." error={err('requirements')} />
        </Card>

        <Card className="space-y-4">
          <h2 className="text-lg font-bold">Check-in and reminders</h2>
          <Input
            name="checkinGraceMin"
            type="number"
            inputMode="numeric"
            min={5}
            max={240}
            label="Late check-in grace period (minutes)"
            className="sm:max-w-xs"
            value={f.checkinGraceMin}
            onChange={(e) => set('checkinGraceMin', e.target.value)}
            hint="How long after the start volunteers can still check in on time."
            error={err('checkinGraceMin')}
          />
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">Send reminders <span className="font-normal text-ink-faint">(up to 4)</span></legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {REMINDERS.map(([mins, l]) => (
                <Checkbox
                  key={mins}
                  label={l}
                  checked={f.reminderOffsets.includes(mins)}
                  onChange={(on) => {
                    if (on && f.reminderOffsets.length >= 4) return toast('You can pick up to 4 reminders.');
                    set('reminderOffsets', on ? [...f.reminderOffsets, mins] : f.reminderOffsets.filter((x) => x !== mins));
                  }}
                />
              ))}
            </div>
            {err('reminderOffsets') && <p role="alert" className="mt-1 text-sm text-blood-600">{err('reminderOffsets')}</p>}
          </fieldset>
        </Card>

        <Card className="space-y-3">
          <h2 className="text-lg font-bold">Cover image <span className="text-sm font-normal text-ink-faint">(optional)</span></h2>
          <div className="overflow-hidden rounded-xl">
            {currentCover ? (
              <img src={currentCover} alt="Cover preview" className="aspect-[16/9] w-full object-cover" />
            ) : (
              <EventCover event={{ coverUrl: null, category: f.category, title: f.title }} className="aspect-[16/9] w-full" />
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <FileButton
              accept={COVER_TYPES.join(',')}
              onFile={(file) => {
                if (!COVER_TYPES.includes(file.type)) return toast.error('Use a JPG, PNG, WebP or GIF image.');
                if (file.size > 8 * 1024 * 1024) return toast.error('The image is larger than 8 MB.');
                setCover(file);
              }}
              className="inline-flex items-center gap-2 rounded-xl border border-paper-line bg-white px-3 py-1.5 text-sm font-semibold text-ink hover:bg-paper"
            >
              <ImagePlus className="h-4 w-4" aria-hidden /> {currentCover ? 'Change image' : 'Upload image'}
            </FileButton>
            {cover && <Button size="sm" variant="ghost" onClick={() => setCover(null)}>Remove new image</Button>}
            <span className="text-sm text-ink-faint">16:9 works best · up to 8 MB</span>
          </div>
        </Card>

        {/* Actions */}
        <div className="sticky bottom-20 z-10 -mx-4 flex flex-wrap items-center justify-end gap-2 border-t border-paper-line bg-paper/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 lg:bottom-0">
          <Link to={isNew ? '/events' : `/events/${id}`} className="mr-auto text-sm font-semibold text-ink-soft hover:text-ink">Cancel</Link>
          {isNew ? (
            <>
              <Button type="submit" variant="outline" loading={save.isPending && save.variables === 'draft'} disabled={save.isPending}>Save draft</Button>
              <Button
                type="button"
                disabled={!canPublish || save.isPending}
                loading={save.isPending && save.variables === 'publish'}
                title={!canPublish ? 'Publishing requires a verified profile' : undefined}
                onClick={() => submit('publish')}
              >
                Publish event
              </Button>
            </>
          ) : (
            <>
              {isDraft && canPublish && (
                <Button type="button" variant="outline" disabled={save.isPending} loading={save.isPending && save.variables === 'update-publish'} onClick={() => submit('update-publish')}>Save and publish</Button>
              )}
              <Button type="submit" disabled={save.isPending} loading={save.isPending && save.variables === 'update'}>Save changes</Button>
            </>
          )}
        </div>
      </div>
    </form>
  );
}
