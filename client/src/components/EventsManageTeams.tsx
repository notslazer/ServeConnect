/* Organizer team management for an event: create, auto-assign by skill, edit, members & roles, delete (REQ-COORD-2). */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { MessageCircle, Pencil, Plus, Search, Tag, Trash2, UserMinus, UserPlus, Users, Wand2 } from 'lucide-react';
import { api } from '../lib/api';
import { SKILLS } from '../lib/constants';
import {
  Avatar, Button, ButtonLink, Card, EmptyState, ErrorState, FormError, IconButton, Input, Modal, Pill, Select, Skeleton, Textarea,
  UserLine, fieldError, toastError, useConfirm,
} from './ui';
import type { Attendee, EventDetail, Team } from './EventsKit';

/** Searchable, skill-filterable checkbox list of registered volunteers. */
function MemberPicker({ people, value, onChange, exclude = [] }: { people: Attendee[]; value: string[]; onChange: (v: string[]) => void; exclude?: string[] }) {
  const [q, setQ] = useState('');
  const [skill, setSkill] = useState('');
  const shown = people.filter((p) =>
    !exclude.includes(p.user.id)
    && (!skill || p.skills.includes(skill))
    && (!q.trim() || p.user.name.toLowerCase().includes(q.trim().toLowerCase()) || p.user.handle.toLowerCase().includes(q.trim().toLowerCase())));
  const allShownOn = shown.length > 0 && shown.every((p) => value.includes(p.user.id));
  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-ink-faint" aria-hidden />
          <input className="input pl-9" placeholder="Search volunteers" aria-label="Search volunteers" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="input" aria-label="Filter by skill" value={skill} onChange={(e) => setSkill(e.target.value)}>
          <option value="">Any skill</option>
          {Object.entries(SKILLS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-ink-soft">{value.length} selected</span>
        {shown.length > 0 && (
          <button type="button" className="link font-semibold" onClick={() => onChange(allShownOn ? value.filter((id) => !shown.some((p) => p.user.id === id)) : [...new Set([...value, ...shown.map((p) => p.user.id)])])}>
            {allShownOn ? 'Clear shown' : `Select all shown (${shown.length})`}
          </button>
        )}
      </div>
      <ul className="max-h-72 divide-y divide-paper-line overflow-y-auto rounded-xl border border-paper-line">
        {shown.length === 0 ? (
          <li className="p-4 text-center text-sm text-ink-faint">No registered volunteers match.</li>
        ) : shown.map((p) => {
          const on = value.includes(p.user.id);
          return (
            <li key={p.user.id}>
              <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-paper">
                <input type="checkbox" className="h-5 w-5 rounded border-paper-line text-brand-600" checked={on} onChange={() => onChange(on ? value.filter((x) => x !== p.user.id) : [...value, p.user.id])} />
                <Avatar src={p.user.avatarUrl} name={p.user.name} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{p.user.name}</span>
                  <span className="block truncate text-xs text-ink-faint">
                    {p.skills.slice(0, 3).map((s) => SKILLS[s] ?? s).join(' · ') || 'No skills listed'}
                    {p.team && ` · in ${p.team.name} (will move)`}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function TeamModal({ open, onClose, eventId, people, team }: { open: boolean; onClose: () => void; eventId: string; people: Attendee[]; team?: Team }) {
  const qc = useQueryClient();
  const [name, setName] = useState(team?.name ?? '');
  const [desc, setDesc] = useState(team?.roleDescription ?? '');
  const [leadId, setLeadId] = useState(team?.lead?.id ?? '');
  const [members, setMembers] = useState<string[]>([]);
  const m = useMutation({
    mutationFn: () =>
      team
        ? api(`/teams/${team.id}`, { method: 'PATCH', body: { name: name.trim(), roleDescription: desc.trim(), leadId: leadId || null } })
        : api(`/teams/events/${eventId}/teams`, { body: { name: name.trim(), roleDescription: desc.trim() || undefined, leadId: leadId || null, memberIds: members } }),
    onSuccess: () => {
      toast.success(team ? 'Team updated' : 'Team created. Members have been notified.');
      qc.invalidateQueries({ queryKey: ['teams', eventId] });
      qc.invalidateQueries({ queryKey: ['attendees', eventId] });
      onClose();
    },
  });
  const leadOptions: [string, string][] = people.map((p) => [p.user.id, p.user.name]);
  return (
    <Modal open={open} onClose={onClose} title={team ? `Edit ${team.name}` : 'Create a team'} size="lg"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button disabled={name.trim().length < 2} loading={m.isPending} onClick={() => m.mutate()}>{team ? 'Save team' : 'Create team'}</Button></>}>
      <div className="space-y-4">
        <Input label="Team name" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="First aid desk" error={fieldError(m.error, 'name')} />
        <Textarea label="Role description" optional rows={2} maxLength={300} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Set up the first aid tent and handle minor injuries." error={fieldError(m.error, 'roleDescription')} />
        <Select label="Team lead" optional value={leadId} onChange={(e) => setLeadId(e.target.value)} options={leadOptions} placeholder="No lead"
          hint="Leads can check in volunteers and see the event code." />
        {!team && (
          <div>
            <div className="mb-1.5 text-sm font-semibold">Members</div>
            <MemberPicker people={people} value={members} onChange={setMembers} exclude={leadId ? [leadId] : []} />
          </div>
        )}
        <FormError error={m.error} />
      </div>
    </Modal>
  );
}

function AddMembersModal({ open, onClose, eventId, team, people }: { open: boolean; onClose: () => void; eventId: string; team: Team; people: Attendee[] }) {
  const qc = useQueryClient();
  const [ids, setIds] = useState<string[]>([]);
  const [role, setRole] = useState('');
  const m = useMutation({
    mutationFn: () => api(`/teams/${team.id}/members`, { body: { userIds: ids, role: role.trim() || undefined } }),
    onSuccess: () => {
      toast.success(`Added ${ids.length} to ${team.name}`);
      qc.invalidateQueries({ queryKey: ['teams', eventId] });
      qc.invalidateQueries({ queryKey: ['attendees', eventId] });
      onClose();
    },
  });
  return (
    <Modal open={open} onClose={onClose} title={`Add members to ${team.name}`} size="lg"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button disabled={!ids.length} loading={m.isPending} onClick={() => m.mutate()}>Add {ids.length || ''} member{ids.length === 1 ? '' : 's'}</Button></>}>
      <div className="space-y-4">
        <MemberPicker people={people} value={ids} onChange={setIds} exclude={team.members.map((x) => x.user.id)} />
        <Input label="Role for these members" optional maxLength={60} value={role} onChange={(e) => setRole(e.target.value)} placeholder="Registration desk" />
        <FormError error={m.error} />
      </div>
    </Modal>
  );
}

function RoleModal({ open, onClose, eventId, teamId, member }: { open: boolean; onClose: () => void; eventId: string; teamId: string; member: { id: string; name: string; role: string | null } }) {
  const qc = useQueryClient();
  const [role, setRole] = useState(member.role ?? '');
  const m = useMutation({
    mutationFn: () => api(`/teams/${teamId}/members/${member.id}`, { method: 'PATCH', body: { role: role.trim() || null } }),
    onSuccess: () => { toast.success('Role updated'); qc.invalidateQueries({ queryKey: ['teams', eventId] }); onClose(); },
  });
  return (
    <Modal open={open} onClose={onClose} title={`Role for ${member.name}`} size="sm"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={m.isPending} onClick={() => m.mutate()}>Save role</Button></>}>
      <div className="space-y-3">
        <Input label="Role" maxLength={60} value={role} onChange={(e) => setRole(e.target.value)} placeholder="Photographer" hint="Leave empty to clear the role." />
        <FormError error={m.error} />
      </div>
    </Modal>
  );
}

export function TeamsPanel({ event }: { event: EventDetail }) {
  const qc = useQueryClient();
  const [confirm, confirmDialog] = useConfirm();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Team | null>(null);
  const [adding, setAdding] = useState<Team | null>(null);
  const [roleFor, setRoleFor] = useState<{ teamId: string; member: { id: string; name: string; role: string | null } } | null>(null);
  const [maxSize, setMaxSize] = useState('8');
  const locked = ['completed', 'cancelled'].includes(event.status);

  const teams = useQuery({ queryKey: ['teams', event.id], queryFn: () => api<Team[]>(`/teams/events/${event.id}/teams`) });
  const att = useQuery({ queryKey: ['attendees', event.id, {}], queryFn: () => api<Attendee[]>(`/events/${event.id}/attendees`) });
  const people = useMemo(() => (att.data ?? []).filter((a) => a.status === 'registered' || a.status === 'attended'), [att.data]);
  const unassigned = people.filter((p) => !p.team).length;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['teams', event.id] });
    qc.invalidateQueries({ queryKey: ['attendees', event.id] });
  };
  const auto = useMutation({
    mutationFn: () => api<{ created: number; assigned: number }>(`/teams/events/${event.id}/teams/auto`, { body: { maxSize: Number(maxSize) } }),
    onSuccess: (r) => { toast.success(`Created ${r.created} team${r.created === 1 ? '' : 's'} and assigned ${r.assigned} volunteer${r.assigned === 1 ? '' : 's'}.`); invalidate(); },
    onError: toastError,
  });
  const delTeam = useMutation({
    mutationFn: (id: string) => api(`/teams/${id}`, { method: 'DELETE' }),
    onSuccess: () => { toast.success('Team deleted'); invalidate(); },
    onError: toastError,
  });
  const removeMember = useMutation({
    mutationFn: ({ teamId, userId }: { teamId: string; userId: string }) => api(`/teams/${teamId}/members/${userId}`, { method: 'DELETE' }),
    onSuccess: () => { toast.success('Removed from team'); invalidate(); },
    onError: toastError,
  });

  if (teams.isPending || att.isPending) return <div className="space-y-3"><Skeleton className="h-24 w-full" /><Skeleton className="h-40 w-full" /></div>;
  if (teams.isError) return <ErrorState error={teams.error} retry={() => teams.refetch()} />;
  if (att.isError) return <ErrorState error={att.error} retry={() => att.refetch()} />;
  const size = Number(maxSize);
  const sizeValid = Number.isInteger(size) && size >= 2 && size <= 50;

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Teams</h2>
            <p className="text-sm text-ink-soft">{people.length} registered · {unassigned} not in a team yet. Each team gets a group chat with its lead and you.</p>
          </div>
          <Button icon={<Plus className="h-4 w-4" />} disabled={locked || people.length === 0} onClick={() => setCreating(true)}>Create team</Button>
        </div>
        {!locked && unassigned > 0 && (
          <div className="flex flex-wrap items-end gap-2 rounded-xl bg-paper p-3">
            <Input label="Max team size" type="number" min={2} max={50} inputMode="numeric" className="w-36" value={maxSize} onChange={(e) => setMaxSize(e.target.value)} error={!sizeValid ? '2–50' : undefined} />
            <Button variant="secondary" icon={<Wand2 className="h-4 w-4" />} disabled={!sizeValid} loading={auto.isPending}
              onClick={async () => {
                if (await confirm({ title: 'Auto-assign volunteers?', body: `${unassigned} unassigned volunteer${unassigned === 1 ? '' : 's'} will be grouped by matching skill into teams of up to ${size}, each with a lead. Existing teams stay as they are.`, confirmLabel: 'Auto-assign' })) auto.mutate();
              }}>
              Auto-assign by skill
            </Button>
          </div>
        )}
        {locked && <p className="text-sm text-ink-faint">Teams can't be created after the event has {event.status === 'completed' ? 'ended' : 'been cancelled'}.</p>}
      </Card>

      {teams.data.length === 0 ? (
        <EmptyState icon={<Users />} title="No teams yet" body={people.length ? 'Create a team or auto-assign volunteers by skill.' : 'Teams can be formed once volunteers register.'} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {teams.data.map((t) => (
            <Card key={t.id} className="flex flex-col">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate text-lg font-bold">{t.name}</h3>
                  {t.roleDescription && <p className="text-sm text-ink-soft">{t.roleDescription}</p>}
                </div>
                <div className="flex shrink-0">
                  <IconButton label={`Edit ${t.name}`} onClick={() => setEditing(t)}><Pencil className="h-4 w-4" /></IconButton>
                  <IconButton label={`Delete ${t.name}`} className="hover:text-blood-600"
                    onClick={async () => { if (await confirm({ title: `Delete ${t.name}?`, body: 'Members are unassigned and the team chat is closed.', confirmLabel: 'Delete team', danger: true })) delTeam.mutate(t.id); }}>
                    <Trash2 className="h-4 w-4" />
                  </IconButton>
                </div>
              </div>
              <div className="mt-2 text-sm">
                {t.lead ? <span className="text-ink-soft">Lead: <span className="font-semibold text-ink">{t.lead.name}</span></span> : <Pill tone="marigold">No lead assigned</Pill>}
              </div>
              <ul className="mt-3 flex-1 divide-y divide-paper-line">
                {t.members.length === 0 && <li className="py-2 text-sm text-ink-faint">No members yet.</li>}
                {t.members.map((mb) => (
                  <li key={mb.user.id} className="flex items-center gap-2 py-2">
                    <UserLine user={mb.user} size={28} className="flex-1" sub={mb.skills.slice(0, 2).map((s) => SKILLS[s] ?? s).join(' · ') || undefined} />
                    {mb.role && <Pill tone={mb.user.id === t.lead?.id ? 'marigold' : 'brand'} className="hidden shrink-0 sm:inline-flex">{mb.role}</Pill>}
                    <IconButton label={`Set role for ${mb.user.name}`} onClick={() => setRoleFor({ teamId: t.id, member: { id: mb.user.id, name: mb.user.name, role: mb.role } })}><Tag className="h-4 w-4" /></IconButton>
                    <IconButton label={`Remove ${mb.user.name} from team`} className="hover:text-blood-600"
                      onClick={async () => { if (await confirm({ title: `Remove ${mb.user.name} from ${t.name}?`, body: mb.user.id === t.lead?.id ? 'They are the team lead; the team will have no lead.' : undefined, confirmLabel: 'Remove', danger: true })) removeMember.mutate({ teamId: t.id, userId: mb.user.id }); }}>
                      <UserMinus className="h-4 w-4" />
                    </IconButton>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" icon={<UserPlus className="h-4 w-4" />} onClick={() => setAdding(t)}>Add members</Button>
                {t.conversationId && <ButtonLink size="sm" variant="ghost" to={`/messages/${t.conversationId}`} icon={<MessageCircle className="h-4 w-4" />}>Team chat</ButtonLink>}
              </div>
            </Card>
          ))}
        </div>
      )}

      {creating && <TeamModal open onClose={() => setCreating(false)} eventId={event.id} people={people} />}
      {editing && <TeamModal open onClose={() => setEditing(null)} eventId={event.id} people={people} team={editing} />}
      {adding && <AddMembersModal open onClose={() => setAdding(null)} eventId={event.id} team={adding} people={people} />}
      {roleFor && <RoleModal open onClose={() => setRoleFor(null)} eventId={event.id} teamId={roleFor.teamId} member={roleFor.member} />}
      {confirmDialog}
    </div>
  );
}
