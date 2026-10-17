import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { BadgeCheck, Ban, ExternalLink, KeyRound, LogOut, Search, ShieldOff, UserCog, Users } from 'lucide-react';
import { api } from '../../lib/api';
import { useMe } from '../../lib/auth';
import { ROLE_LABEL } from '../../lib/constants';
import { ago, fmtDate, fmtDateTime } from '../../lib/format';
import { useDebounce } from '../../lib/hooks';
import type { Role } from '../../lib/types';
import {
  Avatar, Button, Card, EmptyState, ErrorState, FormError, Modal, Pill, Select, Skeleton, Textarea, VerifiedBadge, fieldError,
} from '../../components/ui';

interface AdminUser {
  id: string;
  name: string;
  handle: string;
  email: string | null;
  role: Role;
  accountStatus: 'active' | 'suspended' | 'deleted';
  verificationStatus: 'unverified' | 'pending' | 'verified' | 'rejected';
  emailVerified: boolean;
  phoneVerified: boolean;
  twoFactorEnabled: boolean;
  isMinor: boolean;
  guardianConsent: string;
  createdAt: string;
  lastActiveAt: string | null;
  suspendedReason: string | null;
  avatarUrl: string | null;
  reports: number;
}
const PAGE = 50;

type Pane = 'menu' | 'suspend' | 'role' | 'verify' | 'sessions' | 'unsuspend';

function ManageModal({ user: u, onClose }: { user: AdminUser; onClose: () => void }) {
  const me = useMe();
  const qc = useQueryClient();
  const [pane, setPane] = useState<Pane>('menu');
  const [reason, setReason] = useState('');
  const [role, setRole] = useState<Role>(u.role);
  const done = (msg: string) => { toast.success(msg); qc.invalidateQueries({ queryKey: ['admin'] }); onClose(); };

  const suspend = useMutation({ mutationFn: () => api(`/admin/users/${u.id}/suspend`, { body: { reason: reason.trim() } }), onSuccess: () => done(`${u.name} is suspended and has been notified`) });
  const unsuspend = useMutation({ mutationFn: () => api(`/admin/users/${u.id}/unsuspend`, { method: 'POST' }), onSuccess: () => done(`${u.name}'s account is restored`) });
  const changeRole = useMutation({ mutationFn: () => api(`/admin/users/${u.id}/role`, { method: 'PATCH', body: { role } }), onSuccess: () => done(`${u.name} is now ${ROLE_LABEL[role].toLowerCase()}`) });
  const verified = u.verificationStatus === 'verified';
  const verify = useMutation({
    mutationFn: () => api(`/admin/users/${u.id}/verification`, { body: { status: verified ? 'unverified' : 'verified', reason: reason.trim() || undefined } }),
    onSuccess: () => done(verified ? `Removed ${u.name}'s verified badge` : `${u.name} is now verified`),
  });
  const sessions = useMutation({ mutationFn: () => api(`/admin/users/${u.id}/revoke-sessions`, { method: 'POST' }), onSuccess: () => done(`Signed ${u.name} out everywhere`) });

  const isSelf = u.id === me.id;
  const item = 'flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-paper disabled:opacity-50 disabled:hover:bg-transparent';
  const back = <Button variant="ghost" onClick={() => { setPane('menu'); setReason(''); }}>Back</Button>;

  return (
    <Modal open onClose={onClose} title={`Manage ${u.name}`}
      footer={
        pane === 'suspend' ? <>{back}<Button variant="danger" loading={suspend.isPending} disabled={reason.trim().length < 3} onClick={() => suspend.mutate()}>Suspend account</Button></>
        : pane === 'unsuspend' ? <>{back}<Button loading={unsuspend.isPending} onClick={() => unsuspend.mutate()}>Restore account</Button></>
        : pane === 'role' ? <>{back}<Button loading={changeRole.isPending} disabled={role === u.role} onClick={() => changeRole.mutate()}>Change role</Button></>
        : pane === 'verify' ? <>{back}<Button variant={verified ? 'danger' : 'primary'} loading={verify.isPending} onClick={() => verify.mutate()}>{verified ? 'Revoke badge' : 'Grant badge'}</Button></>
        : pane === 'sessions' ? <>{back}<Button variant="danger" loading={sessions.isPending} onClick={() => sessions.mutate()}>Sign out everywhere</Button></>
        : undefined
      }>
      <div className="mb-4 flex items-center gap-3">
        <Avatar src={u.avatarUrl} name={u.name} size={44} />
        <div className="min-w-0">
          <div className="flex items-center gap-1 font-semibold">{u.name}{verified && <VerifiedBadge />}</div>
          <div className="truncate text-sm text-ink-soft">@{u.handle} · {u.email ?? 'no email'} · {ROLE_LABEL[u.role]}</div>
        </div>
      </div>

      {pane === 'menu' && (
        <div className="-mx-2 space-y-0.5">
          <Link to={`/u/${u.handle}`} className={item} onClick={onClose}><ExternalLink className="mt-0.5 h-5 w-5 text-ink-soft" /><span><span className="block font-semibold">View profile</span></span></Link>
          {u.accountStatus === 'suspended' ? (
            <button className={item} onClick={() => setPane('unsuspend')}><Ban className="mt-0.5 h-5 w-5 text-leaf-600" /><span><span className="block font-semibold">Unsuspend</span><span className="text-sm text-ink-soft">Suspended: {u.suspendedReason ?? 'no reason recorded'}</span></span></button>
          ) : (
            <button className={item} disabled={u.role === 'admin'} onClick={() => setPane('suspend')}><Ban className="mt-0.5 h-5 w-5 text-blood-500" /><span><span className="block font-semibold">Suspend</span><span className="text-sm text-ink-soft">{u.role === 'admin' ? "Administrators can't be suspended." : 'Blocks posting, registering and messaging.'}</span></span></button>
          )}
          <button className={item} disabled={isSelf} onClick={() => setPane('role')}><UserCog className="mt-0.5 h-5 w-5 text-brand-600" /><span><span className="block font-semibold">Change role</span><span className="text-sm text-ink-soft">{isSelf ? "You can't change your own role." : `Currently ${ROLE_LABEL[u.role]}.`}</span></span></button>
          <button className={item} onClick={() => setPane('verify')}>{verified ? <ShieldOff className="mt-0.5 h-5 w-5 text-blood-500" /> : <BadgeCheck className="mt-0.5 h-5 w-5 text-marigold-600" />}<span><span className="block font-semibold">{verified ? 'Revoke verified badge' : 'Grant verified badge'}</span><span className="text-sm text-ink-soft">For identities confirmed outside the document queue.</span></span></button>
          <button className={item} onClick={() => setPane('sessions')}><LogOut className="mt-0.5 h-5 w-5 text-ink-soft" /><span><span className="block font-semibold">Revoke all sessions</span><span className="text-sm text-ink-soft">Signs them out on every device.</span></span></button>
        </div>
      )}
      {pane === 'suspend' && (
        <div className="space-y-3">
          <p className="text-sm text-ink-soft">They can still sign in and browse, but can't post, register or message. They are notified with your reason.</p>
          <Textarea label="Reason" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Repeated spam in event discussions." error={fieldError(suspend.error, 'reason')} />
          <FormError error={!fieldError(suspend.error, 'reason') && suspend.error} />
        </div>
      )}
      {pane === 'unsuspend' && (
        <div className="space-y-3"><p className="text-sm text-ink-soft">Restore full access for {u.name}? They'll be notified.</p><FormError error={unsuspend.error} /></div>
      )}
      {pane === 'role' && (
        <div className="space-y-3">
          <Select label="New role" value={role} onChange={(e) => setRole(e.target.value as Role)} options={ROLE_LABEL} />
          {role === 'admin' && role !== u.role && <p className="rounded-xl bg-blood-50 px-3 py-2 text-sm text-blood-700">Administrators can read verification documents, moderate content and manage every account. Only grant this to staff.</p>}
          <FormError error={changeRole.error} />
        </div>
      )}
      {pane === 'verify' && (
        <div className="space-y-3">
          <p className="text-sm text-ink-soft">{verified ? 'They lose the Verified badge and, if an organizer, can no longer publish events or requests.' : 'They get the Verified badge immediately and can publish events and requests.'} The change is logged and they're notified.</p>
          <Textarea label="Reason" optional rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
          <FormError error={verify.error} />
        </div>
      )}
      {pane === 'sessions' && (
        <div className="space-y-3"><p className="text-sm text-ink-soft">Every device signed in as {u.name} will be signed out. Use this if an account may be compromised.</p><FormError error={sessions.error} /></div>
      )}
    </Modal>
  );
}

function StatusPill({ u }: { u: AdminUser }) {
  return u.accountStatus === 'suspended' ? <Pill tone="blood">Suspended</Pill> : <Pill tone="leaf">Active</Pill>;
}
function VerifPill({ s }: { s: AdminUser['verificationStatus'] }) {
  const map = { verified: ['leaf', 'Verified'], pending: ['marigold', 'Pending'], rejected: ['blood', 'Rejected'], unverified: ['neutral', 'Unverified'] } as const;
  return <Pill tone={map[s][0]}>{map[s][1]}</Pill>;
}

export default function AdminUsers() {
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [managing, setManaging] = useState<AdminUser | null>(null);
  const dq = useDebounce(q.trim(), 350);

  const list = useInfiniteQuery({
    queryKey: ['admin', 'users', dq, role, status],
    queryFn: ({ pageParam }) => api<AdminUser[]>('/admin/users', { query: { q: dq || undefined, role: role || undefined, status: status || undefined, offset: pageParam } }),
    initialPageParam: 0,
    getNextPageParam: (last, all) => (last.length === PAGE ? all.length * PAGE : undefined),
  });
  const users = list.data?.pages.flat() ?? [];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_170px_170px]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-ink-faint" aria-hidden />
          <input className="input pl-10" type="search" placeholder="Search name, username or email" aria-label="Search users" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="input" aria-label="Filter by role" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">All roles</option>
          {Object.entries(ROLE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <select className="input" aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </select>
      </div>

      {list.isPending ? (
        <Skeleton className="h-80 w-full" />
      ) : list.isError ? (
        <ErrorState error={list.error} retry={() => list.refetch()} />
      ) : users.length === 0 ? (
        <Card><EmptyState icon={<Users />} title="No users found" body="Try a different search or clear the filters." /></Card>
      ) : (
        <Card padded={false} className="overflow-hidden">
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead className="border-b border-paper-line bg-paper text-ink-soft">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-semibold">User</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Email</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Role</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Status</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Verification</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">2FA</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Minor</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-semibold">Reports</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Last active</th>
                  <th scope="col" className="px-4 py-2.5"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-paper-line">
                {users.map((u) => (
                  <tr key={u.id} className="align-middle">
                    <td className="px-4 py-2.5">
                      <Link to={`/u/${u.handle}`} className="flex items-center gap-2.5 hover:underline">
                        <Avatar src={u.avatarUrl} name={u.name} size={32} />
                        <span className="min-w-0">
                          <span className="block max-w-[180px] truncate font-semibold text-ink">{u.name}</span>
                          <span className="block text-xs text-ink-faint" title={`Joined ${fmtDate(u.createdAt)}`}>@{u.handle}</span>
                        </span>
                      </Link>
                    </td>
                    <td className="max-w-[200px] px-3 py-2.5">
                      <span className="block truncate">{u.email ?? '—'}</span>
                      {u.email && <span className={clsx('text-xs', u.emailVerified ? 'text-leaf-700' : 'text-marigold-700')}>{u.emailVerified ? 'Verified' : 'Unverified'}</span>}
                    </td>
                    <td className="px-3 py-2.5">{ROLE_LABEL[u.role]}</td>
                    <td className="px-3 py-2.5"><StatusPill u={u} /></td>
                    <td className="px-3 py-2.5"><VerifPill s={u.verificationStatus} /></td>
                    <td className="px-3 py-2.5">{u.twoFactorEnabled ? <span className="inline-flex items-center gap-1 text-leaf-700"><KeyRound className="h-3.5 w-3.5" aria-hidden />On</span> : <span className="text-ink-faint">Off</span>}</td>
                    <td className="px-3 py-2.5">{u.isMinor ? <span title={`Guardian consent: ${u.guardianConsent}`}>Yes · {u.guardianConsent}</span> : <span className="text-ink-faint">No</span>}</td>
                    <td className={clsx('px-3 py-2.5 text-right tabular-nums', u.reports > 0 && 'font-bold text-blood-600')}>{u.reports}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap" title={u.lastActiveAt ? fmtDateTime(u.lastActiveAt) : undefined}>{u.lastActiveAt ? ago(u.lastActiveAt) : 'Never'}</td>
                    <td className="px-4 py-2.5 text-right"><Button size="sm" variant="outline" onClick={() => setManaging(u)}>Manage</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {list.hasNextPage && (
        <div className="flex justify-center"><Button variant="outline" loading={list.isFetchingNextPage} onClick={() => list.fetchNextPage()}>Load more users</Button></div>
      )}
      {managing && <ManageModal user={managing} onClose={() => setManaging(null)} />}
    </div>
  );
}
