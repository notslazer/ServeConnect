import { FormEvent, ReactNode, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { BadgeCheck, Clock, FileText, Hourglass, Lock, Paperclip, ShieldAlert, ShieldCheck, Upload, X } from 'lucide-react';
import { api, API_URL } from '../../lib/api';
import { useAuth, useMe } from '../../lib/auth';
import { fmtDate, fmtDateTime } from '../../lib/format';
import { Button, ErrorState, FormError, Notice, Pill, Select, Skeleton, Textarea, fieldError } from '../../components/ui';
import { SettingsBlock } from '../../components/SettingsKit';

type VStatus = 'unverified' | 'pending' | 'verified' | 'rejected';
interface HistoryItem { id: string; docType: string; note: string | null; status: 'pending' | 'approved' | 'rejected'; reason: string | null; createdAt: string; reviewedAt: string | null; documentCount: number }
interface VerificationMe { status: VStatus; verifiedAt: string | null; history: HistoryItem[]; docTypes: Record<string, string> }

const ACCEPT = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const MAX_FILES = 5;
const MAX_MB = 10;
/** The API camel-cases response keys, but expects the original snake_case document-type keys on submit. */
const toSnake = (k: string) => k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const fmtSize = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function StatusCard({ data }: { data: VerificationMe }) {
  const lastRejected = data.history.find((h) => h.status === 'rejected');
  const pending = data.history.find((h) => h.status === 'pending');
  const map: Record<VStatus, { icon: ReactNode; title: string; body: ReactNode; cls: string }> = {
    verified: {
      icon: <BadgeCheck className="h-7 w-7 fill-marigold-400 text-white" />,
      title: 'Your profile is verified',
      body: <>Your Verified badge is shown on your profile{data.verifiedAt ? ` since ${fmtDate(data.verifiedAt)}` : ''}. You can publish events and requests.</>,
      cls: 'border-leaf-100 bg-leaf-50',
    },
    pending: {
      icon: <Hourglass className="h-7 w-7 text-brand-600" />,
      title: 'Under review',
      body: <>We received your documents{pending ? ` on ${fmtDateTime(pending.createdAt)}` : ''}. Most reviews finish within 2 working days — we'll notify you.</>,
      cls: 'border-brand-100 bg-brand-50',
    },
    rejected: {
      icon: <ShieldAlert className="h-7 w-7 text-blood-500" />,
      title: 'Not approved',
      body: <>{lastRejected?.reason ? <>Reason: <span className="font-semibold text-ink">{lastRejected.reason}</span>. </> : null}Fix the issue and submit new documents below.</>,
      cls: 'border-blood-100 bg-blood-50',
    },
    unverified: {
      icon: <ShieldCheck className="h-7 w-7 text-ink-faint" />,
      title: 'Not verified yet',
      body: 'Submit a document so our team can confirm who you are. Verified profiles get a badge and can publish events and requests.',
      cls: 'border-paper-line bg-white',
    },
  };
  const s = map[data.status];
  return (
    <div className={clsx('flex items-start gap-4 rounded-2xl border p-4 sm:p-5', s.cls)} role="status">
      <div className="shrink-0" aria-hidden>{s.icon}</div>
      <div>
        <h2 className="text-lg font-bold">{s.title}</h2>
        <p className="mt-0.5 text-sm text-ink-soft">{s.body}</p>
      </div>
    </div>
  );
}

function SubmitForm({ docTypes, onDone }: { docTypes: Record<string, string>; onDone: () => void }) {
  const me = useMe();
  const input = useRef<HTMLInputElement>(null);
  const [docType, setDocType] = useState('');
  const [note, setNote] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const options = Object.entries(docTypes).map(([k, v]) => [toSnake(k), v] as [string, string]);
  const suggested = me.role === 'volunteer' ? 'government_id' : me.role === 'csr' ? 'company_registration' : me.orgType === 'independent' ? 'government_id' : 'ngo_registration';

  const add = (list: FileList | null) => {
    if (!list) return;
    const next = [...files];
    const problems: string[] = [];
    for (const f of Array.from(list)) {
      if (!ACCEPT.includes(f.type)) { problems.push(`${f.name}: use PDF, JPG, PNG or WebP.`); continue; }
      if (f.size > MAX_MB * 1024 * 1024) { problems.push(`${f.name} is larger than ${MAX_MB} MB.`); continue; }
      if (next.length >= MAX_FILES) { problems.push(`You can attach up to ${MAX_FILES} files.`); break; }
      next.push(f);
    }
    setFiles(next);
    setFileError(problems.length ? problems.join(' ') : null);
  };

  const m = useMutation({
    mutationFn: () => {
      const form = new FormData();
      form.append('docType', docType);
      if (note.trim()) form.append('note', note.trim());
      files.forEach((f) => form.append('files', f));
      return api<{ id: string; status: string }>('/verification', { form });
    },
    onSuccess: () => {
      toast.success('Documents submitted for review');
      setFiles([]); setNote(''); setDocType('');
      onDone();
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!files.length) return setFileError('Attach at least one document.');
    m.mutate();
  };

  return (
    <SettingsBlock id="submit-h" title="Submit documents" description={me.role === 'volunteer' ? 'Volunteers can verify with a government photo ID or a professional licence (for example a medical licence for first-aid roles).' : 'Upload your registration certificate. Independent organizers can use a government photo ID.'}>
      <form onSubmit={submit} className="space-y-4">
        <Select label="Document type" value={docType} onChange={(e) => setDocType(e.target.value)} options={options} placeholder="Choose a document type" required
          hint={!docType ? `Most ${me.role === 'volunteer' ? 'volunteers' : 'organizations like yours'} use: ${docTypes[suggested.replace(/_([a-z])/g, (_, c) => c.toUpperCase())] ?? ''}` : undefined}
          error={fieldError(m.error, 'docType')} />

        <div>
          <div className="text-sm font-semibold">Files</div>
          <p className="text-sm text-ink-faint">Up to {MAX_FILES} files — PDF, JPG, PNG or WebP, {MAX_MB} MB each. Make sure all text is readable. You may mask all but the last 4 digits of an Aadhaar number.</p>
          {files.length > 0 && (
            <ul className="mt-2 space-y-1.5">
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-xl border border-paper-line bg-white px-3 py-2 text-sm">
                  <FileText className="h-4 w-4 shrink-0 text-brand-500" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{f.name}</span>
                  <span className="shrink-0 text-ink-faint">{fmtSize(f.size)}</span>
                  <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))} className="rounded-full p-1 text-ink-soft hover:bg-paper"><X className="h-4 w-4" /></button>
                </li>
              ))}
            </ul>
          )}
          <input ref={input} type="file" accept={ACCEPT.join(',')} multiple hidden onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
          {files.length < MAX_FILES && (
            <Button className="mt-2" variant="outline" size="sm" icon={files.length ? <Paperclip className="h-4 w-4" /> : <Upload className="h-4 w-4" />} onClick={() => input.current?.click()}>
              {files.length ? 'Add another file' : 'Choose files'}
            </Button>
          )}
          {fileError && <p role="alert" className="mt-2 text-sm text-blood-600">{fileError}</p>}
        </div>

        <Textarea label="Note for the reviewer" optional rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Registered as a Trust in 2012. Darpan ID TN/2017/0123456." error={fieldError(m.error, 'note')} />
        <FormError error={m.error && !fieldError(m.error, 'docType') && m.error} />
        <Button type="submit" icon={<ShieldCheck className="h-4 w-4" />} loading={m.isPending} disabled={!docType}>Submit for review</Button>
      </form>
    </SettingsBlock>
  );
}

export default function VerificationSettings() {
  const me = useMe();
  const { reload } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['verification', 'me'], queryFn: () => api<VerificationMe>('/verification/me') });
  const refresh = () => { qc.invalidateQueries({ queryKey: ['verification', 'me'] }); reload().catch(() => {}); };

  if (q.isPending) return <div className="space-y-4"><Skeleton className="h-24 w-full" /><Skeleton className="h-64 w-full" /></div>;
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const d = q.data;
  const canSubmit = d.status === 'unverified' || d.status === 'rejected';
  const isOrg = me.role === 'organizer' || me.role === 'csr';

  return (
    <div className="space-y-4">
      <StatusCard data={d} />
      {isOrg && d.status !== 'verified' && (
        <Notice tone="marigold" title="Verification is required to publish">
          You can create drafts now, but events and donation requests go live only after your organization is verified. This protects volunteers and donors from fraud.
        </Notice>
      )}
      {canSubmit && <SubmitForm docTypes={d.docTypes} onDone={refresh} />}

      {d.history.length > 0 && (
        <SettingsBlock id="hist-h" title="Submission history">
          <ul className="divide-y divide-paper-line">
            {d.history.map((h) => {
              const label = d.docTypes[h.docType.replace(/_([a-z])/g, (_, c) => c.toUpperCase())] ?? h.docType;
              return (
                <li key={h.id} className="flex flex-wrap items-start justify-between gap-2 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <div className="font-semibold">{label}</div>
                    <div className="text-sm text-ink-soft">
                      <Clock className="mr-1 inline h-3.5 w-3.5 align-[-2px]" aria-hidden />Submitted {fmtDateTime(h.createdAt)} · {h.documentCount} {h.documentCount === 1 ? 'file' : 'files'}
                      {h.reviewedAt && <> · reviewed {fmtDate(h.reviewedAt)}</>}
                    </div>
                    {h.reason && <p className="mt-1 text-sm text-blood-700">Reason: {h.reason}</p>}
                  </div>
                  <Pill tone={h.status === 'approved' ? 'leaf' : h.status === 'rejected' ? 'blood' : 'brand'}>{{ approved: 'Approved', rejected: 'Not approved', pending: 'Under review' }[h.status]}</Pill>
                </li>
              );
            })}
          </ul>
        </SettingsBlock>
      )}

      <SettingsBlock id="howdocs-h" title="How we handle your documents">
        <ul className="space-y-2 text-sm text-ink-soft">
          <li className="flex gap-2"><Lock className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" aria-hidden />Files are encrypted before they're stored and are never public. Only platform administrators can open them, and every view is logged.</li>
          <li className="flex gap-2"><Clock className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" aria-hidden />Documents are deleted automatically 90 days after a decision. We keep only the decision, the document type and the date.</li>
          <li className="flex gap-2"><FileText className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" aria-hidden /><span>New to organizing? Read the <a className="link" href={`${API_URL}/api/handbook.pdf`} target="_blank" rel="noopener noreferrer">Organizer Handbook (PDF)</a>.</span></li>
        </ul>
      </SettingsBlock>
    </div>
  );
}
