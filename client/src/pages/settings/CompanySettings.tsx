import { FormEvent, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Building2, LogOut } from 'lucide-react';
import { api } from '../../lib/api';
import { useMe } from '../../lib/auth';
import type { Me } from '../../lib/types';
import { Button, FormError, Input, Skeleton, UserLine, fieldError, useConfirm } from '../../components/ui';
import { SettingsBlock, useMeMutation } from '../../components/SettingsKit';

export default function CompanySettings() {
  const me = useMe();
  const [code, setCode] = useState('');
  const [confirm, dialog] = useConfirm();
  const company = useQuery({
    queryKey: ['profile', me.companyId],
    queryFn: () => api<{ id: string; name: string; handle: string; avatarUrl: string | null; verified: boolean; headline: string | null }>(`/users/${me.companyId}`),
    enabled: Boolean(me.companyId),
  });
  const join = useMeMutation((c: string) => api<Me>('/users/me/company/join', { body: { code: c } }), { success: 'You joined the company team', onDone: () => setCode('') });
  const leave = useMeMutation(() => api<Me>('/users/me/company/leave', { method: 'POST' }), { success: 'You left the company team' });

  const submit = (e: FormEvent) => { e.preventDefault(); join.mutate(code.trim().toUpperCase()); };

  return (
    <div className="space-y-4">
      <SettingsBlock id="company-h" title="Company volunteering team"
        description="If your employer runs a CSR programme on ServeConnect, join their team so your verified hours count towards the company's impact report. Your colleagues can see you on the company leaderboard.">
        {me.companyId ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-paper-line p-3">
              {company.isPending ? <Skeleton className="h-10 w-48" /> : company.data ? (
                <UserLine user={company.data} sub="Your company team" />
              ) : (
                <span className="flex items-center gap-2 font-semibold"><Building2 className="h-5 w-5 text-ink-faint" aria-hidden />Company team</span>
              )}
              <Button variant="outline" size="sm" icon={<LogOut className="h-4 w-4" />} loading={leave.isPending} onClick={async () => {
                if (await confirm({
                  title: `Leave ${company.data?.name ?? 'this company team'}?`,
                  body: 'Hours you volunteer from now on will no longer count towards their CSR report. Your past hours and certificates stay with you.',
                  confirmLabel: 'Leave team',
                  danger: true,
                })) leave.mutate();
              }}>Leave team</Button>
            </div>
            <FormError error={leave.error} />
          </div>
        ) : (
          <form onSubmit={submit} className="max-w-sm space-y-3">
            <Input label="Company invite code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={20} autoCapitalize="characters" autoComplete="off" spellCheck={false}
              className="[&_input]:font-mono [&_input]:tracking-[0.2em]" placeholder="e.g. NIMBUS24" hint="Ask your CSR or HR team for the code." error={fieldError(join.error, 'code')} />
            <FormError error={!fieldError(join.error, 'code') && join.error} />
            <Button type="submit" icon={<Building2 className="h-4 w-4" />} loading={join.isPending} disabled={code.trim().length < 4}>Join team</Button>
          </form>
        )}
      </SettingsBlock>
      {dialog}
    </div>
  );
}
