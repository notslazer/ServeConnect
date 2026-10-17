import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { AlertTriangle, ExternalLink, Flag, Gavel } from 'lucide-react';
import { api } from '../../lib/api';
import { REPORT_REASONS } from '../../lib/constants';
import { ago, fmtDateTime } from '../../lib/format';
import type { UserCard } from '../../lib/types';
import { Button, Card, EmptyState, ErrorState, FormError, Modal, Pill, Select, Skeleton, Textarea, UserLine } from '../../components/ui';
import { FilterChips, Meta } from './AdminKit';

type Status = 'open' | 'actioned' | 'dismissed' | 'all';
type Action = 'none' | 'remove_content' | 'warn_user' | 'suspend_user' | 'cancel_event' | 'close_request';
interface Report {
  id: string;
  targetType: string;
  targetId: string;
  reason: string;
  details: string | null;
  status: 'open' | 'actioned' | 'dismissed';
  actionTaken: Action | null;
  resolutionNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
  reporter: UserCard;
  resolverName: string | null;
  totalReportsOnTarget: number;
  target: null | { title: string | null; link: string | null; ownerId: string | null; deletedAt?: string | null };
  targetOwner: UserCard | null;
}

const TARGET_LABEL: Record<string, string> = {
  user: 'Profile', event: 'Event', post: 'Post', comment: 'Comment', discussion: 'Event discussion', message: 'Direct message',
  blood_request: 'Blood request', resource_request: 'Donation drive', safety: 'Event safety concern',
};
const ACTION_LABEL: Record<Action, string> = {
  none: 'No further action', remove_content: 'Remove the content', warn_user: 'Warn the owner', suspend_user: 'Suspend the owner',
  cancel_event: 'Cancel the event', close_request: 'Close the request',
};
/** Only offer actions that make sense for the reported thing. */
function actionsFor(type: string): Action[] {
  const content = ['post', 'comment', 'discussion', 'message'];
  if (content.includes(type)) return ['none', 'remove_content', 'warn_user', 'suspend_user'];
  if (type === 'event' || type === 'safety') return ['none', 'cancel_event', 'warn_user', 'suspend_user'];
  if (type === 'blood_request' || type === 'resource_request') return ['none', 'close_request', 'warn_user', 'suspend_user'];
  return ['none', 'warn_user', 'suspend_user'];
}
const isSafety = (r: Report) => r.reason === 'safety_concern' || r.reason === 'minor_safety' || r.targetType === 'safety';

function ResolveModal({ report, onClose }: { report: Report; onClose: () => void }) {
  const qc = useQueryClient();
  const [outcome, setOutcome] = useState<'actioned' | 'dismissed'>('actioned');
  const options = actionsFor(report.targetType);
  const [action, setAction] = useState<Action>(options[1] ?? 'none');
  const [note, setNote] = useState('');
  const m = useMutation({
    mutationFn: () => api<{ ok: boolean; resolved: number }>(`/admin/reports/${report.id}/resolve`, {
      body: { outcome, action: outcome === 'actioned' ? action : 'none', note: note.trim() || undefined },
    }),
    onSuccess: (r) => {
      toast.success(`Resolved ${r.resolved} ${r.resolved === 1 ? 'report' : 'reports'}. Reporters have been notified.`);
      qc.invalidateQueries({ queryKey: ['admin'] });
      onClose();
    },
  });
  const noteLabel = outcome === 'actioned' && action === 'suspend_user' ? 'Suspension reason (sent to the owner)'
    : outcome === 'actioned' && action === 'warn_user' ? 'Warning message (sent to the owner)' : 'Internal note';
  return (
    <Modal open onClose={onClose} title="Resolve report"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant={outcome === 'actioned' && action === 'suspend_user' ? 'danger' : 'primary'} loading={m.isPending} onClick={() => m.mutate()}>{outcome === 'dismissed' ? 'Dismiss report' : 'Apply and resolve'}</Button></>}>
      <div className="space-y-4">
        {report.totalReportsOnTarget > 1 && (
          <p className="rounded-xl bg-paper px-3 py-2 text-sm text-ink-soft">All {report.totalReportsOnTarget} open reports on this {TARGET_LABEL[report.targetType]?.toLowerCase() ?? 'item'} are resolved together.</p>
        )}
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">Outcome</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {([['actioned', 'Violation — take action', 'The report is valid.'], ['dismissed', 'No violation — dismiss', 'Nothing breaks our guidelines.']] as const).map(([v, l, h]) => (
              <label key={v} className={clsx('flex cursor-pointer gap-2 rounded-xl border p-3', outcome === v ? 'border-brand-400 bg-brand-50' : 'border-paper-line')}>
                <input type="radio" name="outcome" value={v} checked={outcome === v} onChange={() => setOutcome(v)} className="mt-1 text-brand-600" />
                <span><span className="block font-semibold">{l}</span><span className="text-sm text-ink-soft">{h}</span></span>
              </label>
            ))}
          </div>
        </fieldset>
        {outcome === 'actioned' && (
          <Select label="Action" value={action} onChange={(e) => setAction(e.target.value as Action)} options={options.map((a) => [a, ACTION_LABEL[a]] as [string, string])}
            hint={action === 'suspend_user' ? "The owner can still browse but can't post, register or message until unsuspended. Administrators can't be suspended." : action === 'remove_content' ? 'The content is hidden for everyone.' : undefined} />
        )}
        <Textarea label={noteLabel} optional rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
        <FormError error={m.error} />
      </div>
    </Modal>
  );
}

function ReportCard({ r }: { r: Report }) {
  const [resolving, setResolving] = useState(false);
  const safety = isSafety(r);
  return (
    <li className={clsx('card p-4 sm:p-5', safety && r.status === 'open' && 'border-blood-100 ring-1 ring-blood-100')}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {safety && <Pill tone="blood" icon={<AlertTriangle className="h-3 w-3" />}>Safety priority</Pill>}
          <Pill tone="neutral">{TARGET_LABEL[r.targetType] ?? r.targetType}</Pill>
          <Pill tone="marigold">{REPORT_REASONS[r.reason] ?? r.reason}</Pill>
          {r.totalReportsOnTarget > 1 && <Pill tone="brand">{r.totalReportsOnTarget} reports on this</Pill>}
        </div>
        <span className="text-xs text-ink-faint" title={fmtDateTime(r.createdAt)}>Reported {ago(r.createdAt)}</span>
      </div>

      <div className="mt-3 rounded-xl border border-paper-line bg-paper p-3">
        {r.target ? (
          <>
            <p className="line-clamp-3 text-[15px] text-ink">{r.target.title ?? '(no text)'}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-3 text-sm">
              {r.target.link && <Link to={r.target.link} className="link inline-flex items-center gap-1" target="_blank" rel="noopener">Open {TARGET_LABEL[r.targetType]?.toLowerCase() ?? 'item'} <ExternalLink className="h-3.5 w-3.5" aria-hidden /></Link>}
              {r.target.deletedAt && <Pill tone="neutral">Already removed</Pill>}
            </div>
          </>
        ) : (
          <p className="text-sm text-ink-soft">The reported item no longer exists.</p>
        )}
      </div>

      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
        <Meta label="Owner">{r.targetOwner ? <UserLine user={r.targetOwner} size={28} /> : '—'}</Meta>
        <Meta label="Reported by">{<UserLine user={r.reporter} size={28} />}</Meta>
        {r.details && <div className="sm:col-span-2"><Meta label="Reporter's details"><span className="whitespace-pre-wrap">{r.details}</span></Meta></div>}
      </dl>

      {r.status === 'open' ? (
        <div className="mt-4 border-t border-paper-line pt-3">
          <Button icon={<Gavel className="h-4 w-4" />} onClick={() => setResolving(true)}>Resolve</Button>
        </div>
      ) : (
        <p className="mt-3 border-t border-paper-line pt-3 text-sm text-ink-soft">
          <span className="font-semibold text-ink">{r.status === 'actioned' ? 'Actioned' : 'Dismissed'}</span>
          {r.actionTaken && r.actionTaken !== 'none' && <> · {ACTION_LABEL[r.actionTaken]}</>}
          {r.resolverName && <> · by {r.resolverName}</>}
          {r.resolvedAt && <> · {fmtDateTime(r.resolvedAt)}</>}
          {r.resolutionNote && <span className="block">Note: {r.resolutionNote}</span>}
        </p>
      )}
      {resolving && <ResolveModal report={r} onClose={() => setResolving(false)} />}
    </li>
  );
}

export default function AdminReports() {
  const [status, setStatus] = useState<Status>('open');
  const q = useQuery({ queryKey: ['admin', 'reports', status], queryFn: () => api<Report[]>('/admin/reports', { query: { status } }) });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterChips label="Filter by status" value={status} onChange={setStatus} options={[['open', 'Open'], ['actioned', 'Actioned'], ['dismissed', 'Dismissed'], ['all', 'All']]} />
        {status === 'open' && <p className="text-sm text-ink-faint">Safety and child-safety reports first, then oldest first.</p>}
      </div>
      {q.isPending ? (
        <div className="space-y-3">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-56 w-full" />)}</div>
      ) : q.isError ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : q.data.length === 0 ? (
        <Card><EmptyState icon={<Flag />} title={status === 'open' ? 'No open reports' : 'Nothing here'} body={status === 'open' ? 'Reports from the community will appear here.' : 'No reports match this filter.'} /></Card>
      ) : (
        <ul className="space-y-3">{q.data.map((r) => <ReportCard key={r.id} r={r} />)}</ul>
      )}
    </div>
  );
}
