import { FormEvent, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { ImagePlus, PackagePlus, Plus, ShieldCheck, Trash2, X } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { useMe } from '../../lib/auth';
import { RESOURCE_CATEGORIES } from '../../lib/constants';
import { MapPicker, Place } from '../../components/Map';
import { FileButton } from '../../components/ImagePicker';
import {
  Button, ButtonLink, Card, EmptyState, ErrorState, FormError, IconButton, Input, Notice, PageHeader, PageLoader, Select, Textarea, fieldError,
} from '../../components/ui';
import { fromLocalInput, toLocalInput } from '../../components/EventsKit';
import { DriveCover, ResourceDetail } from '../../components/RequestsKit';

interface Row { key: string; id?: string; name: string; quantity: string; unit: string; pledged: number }
const UNITS = ['units', 'kg', 'litres', 'packets', 'boxes', 'pieces', 'pairs', 'sets', 'bottles', 'kits'];
let seq = 0;
const newRow = (): Row => ({ key: `n${++seq}`, name: '', quantity: '', unit: 'units', pledged: 0 });
const IMAGE_TYPES = 'image/jpeg,image/png,image/webp';

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
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

export default function ResourceForm() {
  const { id } = useParams();
  const editing = Boolean(id);
  const existing = useQuery({ queryKey: ['resource', id], queryFn: () => api<ResourceDetail>(`/requests/resources/${id}`), enabled: editing });
  if (editing && existing.isPending) return <PageLoader />;
  if (editing && existing.isError) return <div><PageHeader back title="Edit donation drive" /><ErrorState error={existing.error} retry={() => existing.refetch()} /></div>;
  return <FormBody initial={existing.data} key={existing.data?.id ?? 'new'} />;
}

function FormBody({ initial }: { initial?: ResourceDetail }) {
  const { t } = useTranslation();
  const me = useMe();
  const nav = useNavigate();
  const qc = useQueryClient();
  const editing = Boolean(initial);
  const verified = me.verificationStatus === 'verified' || me.role === 'admin';
  const canEdit = !initial || initial.isMine || me.role === 'admin';

  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [category, setCategory] = useState(initial?.category ?? '');
  const [place, setPlace] = useState<Place | null>(initial?.lat != null && initial?.lng != null ? { lat: initial.lat, lng: initial.lng, name: initial.locationName ?? undefined } : null);
  const [address, setAddress] = useState(initial?.address ?? '');
  const [deadline, setDeadline] = useState(toLocalInput(initial?.deadline));
  const [rows, setRows] = useState<Row[]>(() =>
    initial?.items.length
      ? initial.items.map((i) => ({ key: i.id, id: i.id, name: i.name, quantity: String(i.quantityNeeded), unit: i.unit, pledged: i.quantityPledged }))
      : [newRow()],
  );
  const [cover, setCover] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const [itemErrors, setItemErrors] = useState<string[]>([]);
  const lastRowRef = useRef<HTMLInputElement>(null);
  const [focusNew, setFocusNew] = useState(false);

  useEffect(() => {
    if (!cover) return setCoverPreview(null);
    const u = URL.createObjectURL(cover);
    setCoverPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [cover]);
  useEffect(() => {
    if (focusNew) { lastRowRef.current?.focus(); setFocusNew(false); }
  }, [focusNew]);

  const cleanRows = rows.filter((r) => r.name.trim() || r.quantity);
  const rowError = (r: Row) => {
    if (!r.name.trim() && !r.quantity) return undefined;
    if (!r.name.trim()) return 'Name the item.';
    const n = Number(r.quantity);
    if (!Number.isInteger(n) || n < 1) return 'Enter a whole number of 1 or more.';
    return undefined;
  };
  const errors = {
    title: title.trim().length < 5 ? 'Give the drive a title of at least 5 characters.' : undefined,
    description: description.trim().length < 10 ? 'Describe who this helps and how donations will be used (10+ characters).' : undefined,
    category: !category ? 'Choose a category.' : undefined,
    deadline: deadline && new Date(deadline) <= new Date() && deadline !== toLocalInput(initial?.deadline) ? 'The deadline must be in the future.' : undefined,
    items: cleanRows.length === 0 ? 'Add at least one item to the wishlist.' : cleanRows.some(rowError) ? 'Fix the highlighted items.' : undefined,
  };
  const valid = !Object.values(errors).some(Boolean);
  const err = (k: keyof typeof errors, server?: string) => server ?? (tried ? errors[k] : undefined);

  const mainBody = () => ({
    title: title.trim(),
    description: description.trim(),
    category,
    locationName: place?.name?.slice(0, 200) || undefined,
    address: address.trim() || undefined,
    lat: place?.lat ?? null,
    lng: place?.lng ?? null,
    deadline: deadline ? fromLocalInput(deadline) : null,
  });

  const uploadCover = async (rid: string) => {
    if (!cover) return true;
    const form = new FormData();
    form.append('file', cover);
    try {
      await api(`/requests/resources/${rid}/cover`, { form });
      return true;
    } catch (e) {
      toast.error(`The drive was saved, but the cover photo didn't upload: ${(e as Error).message}`);
      return false;
    }
  };

  const create = useMutation({
    mutationFn: async () => {
      const r = await api<ResourceDetail>('/requests/resources', {
        body: { ...mainBody(), items: cleanRows.map((x) => ({ name: x.name.trim(), unit: x.unit.trim() || 'units', quantityNeeded: Number(x.quantity) })) },
      });
      await uploadCover(r.id);
      return r;
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['resources'] });
      qc.invalidateQueries({ queryKey: ['requests-mine'] });
      toast.success('Donation drive published. Your followers and people nearby have been notified.');
      nav(`/requests/resources/${r.id}`, { replace: true });
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const rid = initial!.id;
      await api(`/requests/resources/${rid}`, { method: 'PATCH', body: mainBody() });
      const problems: string[] = [];
      const keep = new Set(rows.map((r) => r.id).filter(Boolean));
      for (const old of initial!.items) {
        if (!keep.has(old.id)) {
          try { await api(`/requests/resources/${rid}/items/${old.id}`, { method: 'DELETE' }); } catch (e) { problems.push(`${old.name}: ${(e as Error).message}`); }
        }
      }
      for (const r of cleanRows) {
        const body = { name: r.name.trim(), unit: r.unit.trim() || 'units', quantityNeeded: Number(r.quantity) };
        try {
          if (!r.id) await api(`/requests/resources/${rid}/items`, { body });
          else {
            const old = initial!.items.find((i) => i.id === r.id);
            if (old && (old.name !== body.name || old.unit !== body.unit || old.quantityNeeded !== body.quantityNeeded)) {
              await api(`/requests/resources/${rid}/items/${r.id}`, { method: 'PATCH', body });
            }
          }
        } catch (e) {
          problems.push(`${body.name}: ${(e as Error).message}`);
        }
      }
      await uploadCover(rid);
      return problems;
    },
    onSuccess: (problems) => {
      qc.invalidateQueries({ queryKey: ['resource', initial!.id] });
      qc.invalidateQueries({ queryKey: ['resources'] });
      if (problems.length) {
        setItemErrors(problems);
        toast.error('Some wishlist changes could not be saved.');
        return;
      }
      toast.success('Changes saved.');
      nav(`/requests/resources/${initial!.id}`, { replace: true });
    },
  });
  const m = editing ? save : create;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    setItemErrors([]);
    if (!valid) return;
    m.mutate();
  };

  const update = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const addRow = () => { setRows((rs) => [...rs, newRow()]); setFocusNew(true); };
  const removeRow = (key: string) => setRows((rs) => (rs.length === 1 ? [newRow()] : rs.filter((r) => r.key !== key)));

  if (!canEdit) {
    return (
      <div>
        <PageHeader back title="Edit donation drive" />
        <Card><EmptyState title="You can't edit this drive" body="Only the organizer who posted it can make changes." action={<ButtonLink to={`/requests/resources/${initial!.id}`} variant="outline">View the drive</ButtonLink>} /></Card>
      </div>
    );
  }

  const blocked = !editing && !verified;
  const serverItemsError = m.error instanceof ApiError ? m.error.fields.items : undefined;
  const coverSrc = coverPreview ?? initial?.coverUrl ?? null;

  return (
    <div>
      <PageHeader
        back
        title={editing ? t('drive.edit.title', 'Edit donation drive') : t('drive.new.title', 'Start a donation drive')}
        subtitle={editing ? initial!.title : t('drive.new.subtitle', 'List exactly what you need. Donors pledge item by item and you see counts update live.')}
      />

      {blocked && (
        <div className="mb-4">
          <Notice tone="marigold" icon={<ShieldCheck className="h-6 w-6" aria-hidden />} title="Only verified organizations can start donation drives"
            action={<ButtonLink to="/settings/verification" size="sm" variant="marigold">Get verified</ButtonLink>}>
            Donors trust drives from verified profiles. Submit your registration documents to get your badge.
          </Notice>
        </div>
      )}

      <form onSubmit={submit} noValidate>
        <fieldset disabled={blocked || m.isPending} className="grid gap-6 lg:grid-cols-[1fr_300px]">
          <div className="min-w-0 space-y-4">
            <Section title="About the drive">
              <Input label="Title" value={title} maxLength={140} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Monsoon relief kits for Velachery families" error={err('title', fieldError(m.error, 'title'))} />
              <Textarea label="Description" rows={5} maxLength={5000} value={description} onChange={(e) => setDescription(e.target.value)}
                placeholder="Who will benefit, why it's needed now, and where to drop off donations"
                error={err('description', fieldError(m.error, 'description'))} hint={`${description.length}/5000`} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Select label="Category" value={category} onChange={(e) => setCategory(e.target.value)} options={RESOURCE_CATEGORIES} placeholder="Choose a category" error={err('category', fieldError(m.error, 'category'))} />
                <Input type="datetime-local" label="Deadline" optional value={deadline} min={toLocalInput(new Date().toISOString())} onChange={(e) => setDeadline(e.target.value)}
                  error={err('deadline', fieldError(m.error, 'deadline'))} hint="We'll remind you to close or extend it." />
              </div>
            </Section>

            <Section title="Wishlist" hint="One row per item. Donors can pledge part of a quantity.">
              <datalist id="unit-options">{UNITS.map((u) => <option key={u} value={u} />)}</datalist>
              <div className="hidden grid-cols-[1fr_96px_120px_40px] gap-2 px-1 text-xs font-semibold text-ink-soft sm:grid" aria-hidden>
                <span>Item</span><span>Quantity</span><span>Unit</span><span />
              </div>
              <ul className="space-y-3 sm:space-y-2">
                {rows.map((r, i) => {
                  const e = tried ? rowError(r) : undefined;
                  return (
                    <li key={r.key} className="rounded-xl border border-paper-line p-3 sm:border-0 sm:p-0">
                      <div className="grid grid-cols-[1fr_1fr_40px] gap-2 sm:grid-cols-[1fr_96px_120px_40px]">
                        <input
                          ref={i === rows.length - 1 ? lastRowRef : undefined}
                          className="input col-span-3 sm:col-span-1"
                          aria-label={`Item ${i + 1} name`}
                          placeholder="e.g. Rice"
                          maxLength={100}
                          value={r.name}
                          aria-invalid={Boolean(e)}
                          onChange={(ev) => update(r.key, { name: ev.target.value })}
                        />
                        <input
                          className="input"
                          type="number"
                          inputMode="numeric"
                          min={1}
                          aria-label={`Item ${i + 1} quantity`}
                          placeholder="Qty"
                          value={r.quantity}
                          aria-invalid={Boolean(e)}
                          onChange={(ev) => update(r.key, { quantity: ev.target.value })}
                        />
                        <input className="input" list="unit-options" aria-label={`Item ${i + 1} unit`} maxLength={30} value={r.unit} onChange={(ev) => update(r.key, { unit: ev.target.value })} />
                        <IconButton label={`Remove item ${i + 1}`} className="h-11 w-10 self-center hover:text-blood-600" onClick={() => removeRow(r.key)}>
                          <Trash2 className="h-4 w-4" />
                        </IconButton>
                      </div>
                      {(e || r.pledged > 0) && (
                        <p className={e ? 'mt-1 text-sm text-blood-600' : 'mt-1 text-xs text-ink-faint'} role={e ? 'alert' : undefined}>
                          {e ?? `${r.pledged} ${r.unit} already pledged — this item can't be removed, but you can change the quantity.`}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button variant="secondary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={addRow} disabled={rows.length >= 50}>Add item</Button>
                <span className="text-sm text-ink-faint">{cleanRows.length}/50 items</span>
              </div>
              {(err('items') || serverItemsError) && <p role="alert" className="text-sm text-blood-600">{serverItemsError ?? err('items')}</p>}
              {itemErrors.length > 0 && (
                <div role="alert" className="rounded-xl border border-blood-100 bg-blood-50 px-3.5 py-2.5 text-sm text-blood-700">
                  <div className="font-semibold">These wishlist changes weren't saved:</div>
                  <ul className="mt-1 list-disc pl-5">{itemErrors.map((x) => <li key={x}>{x}</li>)}</ul>
                </div>
              )}
            </Section>

            <Section title="Drop-off location" hint="Optional, but drives with a location reach people nearby.">
              <MapPicker label="Location" value={place} onChange={setPlace} />
              {place && <Button size="sm" variant="ghost" icon={<X className="h-4 w-4" />} onClick={() => setPlace(null)}>Remove location</Button>}
              <Input label="Address or drop-off instructions" optional maxLength={300} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Gate 2, collection desk open 9 am – 6 pm" />
            </Section>

            <FormError error={m.error} />
            {tried && !valid && <p role="alert" className="text-sm text-blood-600">Fix the highlighted fields to continue.</p>}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="ghost" onClick={() => nav(-1)}>Cancel</Button>
              <Button type="submit" size="lg" loading={m.isPending} icon={editing ? undefined : <PackagePlus className="h-5 w-5" />}>{editing ? 'Save changes' : 'Publish drive'}</Button>
            </div>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
            <Card className="space-y-3">
              <h2 className="text-base font-bold">Cover photo</h2>
              <div className="overflow-hidden rounded-xl">
                {coverSrc ? <img src={coverSrc} alt="Cover preview" className="aspect-[16/9] w-full object-cover" /> : <DriveCover coverUrl={null} category={category || 'other'} className="aspect-[16/9] w-full" />}
              </div>
              <div className="flex flex-wrap gap-2">
                <FileButton
                  accept={IMAGE_TYPES}
                  onFile={(f) => {
                    if (f.size > 8 * 1024 * 1024) return toast.error('The photo is larger than 8 MB.');
                    setCover(f);
                  }}
                  className="inline-flex items-center gap-2 rounded-xl bg-brand-50 px-3 py-1.5 text-sm font-semibold text-brand-700 hover:bg-brand-100"
                >
                  <ImagePlus className="h-4 w-4" aria-hidden /> {coverSrc ? 'Change photo' : 'Add photo'}
                </FileButton>
                {cover && <Button size="sm" variant="ghost" onClick={() => setCover(null)}>Undo</Button>}
              </div>
              <p className="text-xs text-ink-faint">JPG, PNG or WebP, up to 8 MB. A real photo of your work builds trust.</p>
            </Card>
            <Card className="space-y-2 text-sm text-ink-soft">
              <h2 className="text-base font-bold text-ink">Tips</h2>
              <p>Be specific: "5 kg rice bags" gets more pledges than "groceries".</p>
              <p>Mark pledges as received when items arrive — donors are thanked automatically.</p>
            </Card>
          </aside>
        </fieldset>
      </form>
    </div>
  );
}
