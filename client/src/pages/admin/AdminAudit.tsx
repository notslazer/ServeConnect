import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ScrollText, Search } from 'lucide-react';
import { api } from '../../lib/api';
import { fmtDateTime } from '../../lib/format';
import { useDebounce } from '../../lib/hooks';
import { Card, EmptyState, ErrorState, Skeleton } from '../../components/ui';
import { FilterChips } from './AdminKit';

interface AuditRow {
  id: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  meta: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
  actorName: string | null;
  actorHandle: string | null;
}

const PRESETS: [string, string][] = [
  ['', 'All'], ['auth.', 'Sign-ins & security'], ['verification.', 'Verification'], ['report.', 'Moderation'], ['user.', 'User admin'],
  ['account.', 'Account changes'], ['admin.', 'Admin tools'], ['guardian.', 'Guardian consent'], ['donor.', 'Donor settings'],
];

function metaText(meta: AuditRow['meta']) {
  if (!meta || !Object.keys(meta).length) return '—';
  return Object.entries(meta).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`).join(' · ');
}

export default function AdminAudit() {
  const [text, setText] = useState('');
  const [preset, setPreset] = useState('');
  const action = useDebounce(text.trim() || preset, 350);
  const q = useQuery({ queryKey: ['admin', 'audit', action], queryFn: () => api<AuditRow[]>('/admin/audit', { query: { action: action || undefined } }) });

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <FilterChips label="Action category" value={text.trim() ? '__custom' : preset} onChange={(v) => { setText(''); setPreset(v); }} options={PRESETS} />
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-ink-faint" aria-hidden />
          <input className="input pl-10 font-mono text-sm" placeholder="Action starts with… e.g. verification.document" aria-label="Filter by action prefix" value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        <p className="text-sm text-ink-faint">Shows the latest 300 matching entries. The audit log is append-only.</p>
      </div>
      {q.isPending ? (
        <Skeleton className="h-80 w-full" />
      ) : q.isError ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : q.data.length === 0 ? (
        <Card><EmptyState icon={<ScrollText />} title="No entries" body="Nothing matches this filter yet." /></Card>
      ) : (
        <Card padded={false} className="overflow-hidden">
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="border-b border-paper-line bg-paper text-ink-soft">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-semibold">When</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Actor</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Action</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Target</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Details</th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-paper-line">
                {q.data.map((r) => (
                  <tr key={r.id} className="align-top">
                    <td className="whitespace-nowrap px-4 py-2 text-ink-soft">{fmtDateTime(r.createdAt)}</td>
                    <td className="px-3 py-2">{r.actorHandle ? <Link to={`/u/${r.actorHandle}`} className="link">{r.actorName}</Link> : <span className="text-ink-faint">System</span>}</td>
                    <td className="px-3 py-2"><code className="rounded bg-paper px-1.5 py-0.5 font-mono text-xs">{r.action}</code></td>
                    <td className="px-3 py-2 text-ink-soft">{r.targetType ?? '—'}{r.targetId && <span className="block max-w-[160px] truncate font-mono text-xs text-ink-faint" title={r.targetId}>{r.targetId}</span>}</td>
                    <td className="max-w-[280px] break-words px-3 py-2 text-ink-soft">{metaText(r.meta)}</td>
                    <td className="whitespace-nowrap px-4 py-2 font-mono text-xs text-ink-faint">{r.ip ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
