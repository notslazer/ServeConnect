import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { CheckCircle2, FileText, Lock, ShieldCheck, Trash2, XCircle } from 'lucide-react';
import { api, openFile } from '../../lib/api';
import { ORG_TYPE_LABEL, ROLE_LABEL } from '../../lib/constants';
import { ago, fmtDate, fmtDateTime } from '../../lib/format';
import type { UserCard } from '../../lib/types';
import {
  Button, Card, EmptyState, ErrorState, FormError, Modal, Pill, Skeleton, Textarea, UserLine, fieldError, toastError, useConfirm,
} from '../../components/ui';
import { FilterChips, Meta, fmtBytes } from './AdminKit';

type Status = 'pending' | 'approved' | 'rejected' | 'all';
interface Verification {
  id: string;
  docType: string;
  docTypeLabel: string;
  note: string | null;
  status: 'pending' | 'approved' | 'rejected';
  reason: string | null;
  createdAt: string;
  reviewedAt: string | null;
  docsPurgedAt: string | null;
  documents: { name: string; mime: string; size: string | number }[];
  user: UserCard;
  email: string | null;
  orgType: string | null;
  orgRegistrationNo: string | null;
  userCreatedAt: string;
  reviewerName: string | null;
}

function DecideModal({ item, decision, onClose }: { item: Verification; decision: 'approved' | 'rejected'; onClose: () => void }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState('');
  const m = useMutation({
    mutationFn: () => api(`/admin/verifications/${item.id}/decide`, { body: { decision, reason: decision === 'rejected' ? reason.trim() : undefined } }),
    onSuccess: () => {
      toast.success(decision === 'approved' ? `${item.user.name} is now verified` : 'Request rejected. The applicant has been told why.');
      qc.invalidateQueries({ queryKey: ['admin'] });
      onClose();
    },
  });
  const approve = decision === 'approved';
  return (
    <Modal open onClose={onClose} title={approve ? `Approve ${item.user.name}?` : `Reject ${item.user.name}'s request?`} size="sm"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant={approve ? 'primary' : 'danger'} loading={m.isPending} disabled={!approve && reason.trim().length < 3} onClick={() => m.mutate()}>{approve ? 'Approve and verify' : 'Reject request'}</Button></>}>
      <div className="space-y-3">
        <p className="text-sm text-ink-soft">
          {approve
            ? 'They get the Verified badge immediately and can publish events and requests. They are notified.'
            : 'They are notified with your reason and can submit new documents.'}
        </p>
        {!approve && (
          <Textarea label="Reason shown to the applicant" rows={3} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. The registration certificate is cut off — please upload the full page." error={fieldError(m.error, 'reason')} />
        )}
        <FormError error={!fieldError(m.error, 'reason') && m.error} />
      </div>
    </Modal>
  );
}

function VerificationCard({ v }: { v: Verification }) {
  const [deciding, setDeciding] = useState<null | 'approved' | 'rejected'>(null);
  const [opening, setOpening] = useState<number | null>(null);
  const open = async (i: number) => {
    setOpening(i);
    try { await openFile(`/admin/verifications/${v.id}/documents/${i}`); } catch (e) { toastError(e); } finally { setOpening(null); }
  };
  const tone = v.status === 'approved' ? 'leaf' : v.status === 'rejected' ? 'blood' : 'marigold';
  return (
    <li className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <UserLine user={v.user} sub={`${ROLE_LABEL[v.user.role]} · joined ${fmtDate(v.userCreatedAt)}`} />
        <div className="flex flex-col items-end gap-1">
          <Pill tone={tone}>{{ pending: 'Pending', approved: 'Approved', rejected: 'Rejected' }[v.status]}</Pill>
          <span className="text-xs text-ink-faint" title={fmtDateTime(v.createdAt)}>Submitted {ago(v.createdAt)}</span>
        </div>
      </div>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <Meta label="Document type">{v.docTypeLabel}</Meta>
        <Meta label="Email">{v.email ?? '—'}</Meta>
        <Meta label="Organization type">{v.orgType ? ORG_TYPE_LABEL[v.orgType] ?? v.orgType : '—'}</Meta>
        <Meta label="Registration number">{v.orgRegistrationNo ?? '—'}</Meta>
        {v.note && <div className="sm:col-span-2"><Meta label="Applicant's note"><span className="whitespace-pre-wrap">{v.note}</span></Meta></div>}
      </dl>

      <div className="mt-4">
        <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-ink-faint"><Lock className="h-3.5 w-3.5" aria-hidden />Documents (decrypted on open, every view is logged)</div>
        {v.docsPurgedAt ? (
          <p className="text-sm text-ink-soft">Purged {fmtDate(v.docsPurgedAt)} under the retention policy.</p>
        ) : v.documents.length === 0 ? (
          <p className="text-sm text-ink-soft">No files attached.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {v.documents.map((d, i) => (
              <li key={i}>
                <Button variant="outline" size="sm" icon={<FileText className="h-4 w-4" />} loading={opening === i} onClick={() => open(i)}>
                  <span className="max-w-[180px] truncate">{d.name}</span>
                  <span className="font-normal text-ink-faint">{fmtBytes(d.size)}</span>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {v.status !== 'pending' && (
        <p className="mt-3 text-sm text-ink-soft">
          {v.status === 'approved' ? 'Approved' : 'Rejected'}{v.reviewerName ? ` by ${v.reviewerName}` : ''}{v.reviewedAt ? ` on ${fmtDateTime(v.reviewedAt)}` : ''}.
          {v.reason && <> Reason: <span className="text-ink">{v.reason}</span></>}
        </p>
      )}
      {v.status === 'pending' && (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-paper-line pt-3">
          <Button icon={<CheckCircle2 className="h-4 w-4" />} onClick={() => setDeciding('approved')}>Approve</Button>
          <Button variant="outline" className="text-blood-600" icon={<XCircle className="h-4 w-4" />} onClick={() => setDeciding('rejected')}>Reject</Button>
        </div>
      )}
      {deciding && <DecideModal item={v} decision={deciding} onClose={() => setDeciding(null)} />}
    </li>
  );
}

export default function AdminVerifications() {
  const [status, setStatus] = useState<Status>('pending');
  const [confirm, dialog] = useConfirm();
  const q = useQuery({ queryKey: ['admin', 'verifications', status], queryFn: () => api<Verification[]>('/admin/verifications', { query: { status } }) });
  const purge = useMutation({
    mutationFn: () => api<{ purged: number }>('/admin/purge-documents', { method: 'POST' }),
    onSuccess: (r) => toast.success(r.purged ? `Purged documents from ${r.purged} reviewed ${r.purged === 1 ? 'request' : 'requests'}` : 'Nothing to purge — no reviewed documents are past the retention period'),
    onError: toastError,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterChips label="Filter by status" value={status} onChange={setStatus} options={[['pending', 'Pending'], ['approved', 'Approved'], ['rejected', 'Rejected'], ['all', 'All']]} />
        <Button variant="ghost" size="sm" icon={<Trash2 className="h-4 w-4" />} loading={purge.isPending} onClick={async () => {
          if (await confirm({ title: 'Purge expired documents?', body: 'Permanently deletes verification files of decided requests older than the retention period (90 days by default). Decisions and history are kept. This also runs automatically every day.', confirmLabel: 'Purge now', danger: true })) purge.mutate();
        }}>Purge expired verification documents</Button>
      </div>
      {q.isPending ? (
        <div className="space-y-3">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-56 w-full" />)}</div>
      ) : q.isError ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : q.data.length === 0 ? (
        <Card><EmptyState icon={<ShieldCheck />} title={status === 'pending' ? 'Queue is clear' : 'Nothing here'} body={status === 'pending' ? 'New verification requests will appear here, oldest first.' : 'No requests match this filter.'} /></Card>
      ) : (
        <ul className="space-y-3">{q.data.map((v) => <VerificationCard key={v.id} v={v} />)}</ul>
      )}
      {dialog}
    </div>
  );
}
