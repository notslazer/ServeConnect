import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import clsx from 'clsx';
import { CheckCircle2 } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { Poll } from '../lib/types';
import { Button, toastError } from './ui';
import { untilText, plural } from '../lib/format';

export function PollView({ poll: initial }: { poll: Poll }) {
  const { user } = useAuth();
  const [poll, setPoll] = useState(initial);
  const [picked, setPicked] = useState<string[]>(initial.myVotes);
  const voted = poll.myVotes.length > 0;
  const total = poll.options.reduce((a, o) => a + o.votes, 0);
  const showResults = voted || poll.closed || !user;
  const vote = useMutation({
    mutationFn: (ids: string[]) => api<Poll>(`/posts/polls/${poll.id}/vote`, { body: { optionIds: ids } }),
    onSuccess: (p) => { setPoll(p); setPicked(p.myVotes); },
    onError: toastError,
  });
  const toggle = (id: string) => {
    if (poll.closed || !user) return;
    if (!poll.multi) return vote.mutate([id]);
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  };
  return (
    <div className="rounded-2xl border border-paper-line p-4">
      <div className="mb-3 font-semibold">{poll.question}</div>
      <div className="space-y-2">
        {poll.options.map((o) => {
          const pct = total ? Math.round((o.votes / total) * 100) : 0;
          const mine = poll.myVotes.includes(o.id);
          return (
            <button key={o.id} type="button" disabled={poll.closed || vote.isPending} onClick={() => toggle(o.id)}
              className={clsx('relative w-full overflow-hidden rounded-xl border px-3 py-2.5 text-left text-[15px] transition',
                picked.includes(o.id) ? 'border-brand-400' : 'border-paper-line hover:border-brand-200')}>
              {showResults && <span className={clsx('absolute inset-y-0 left-0', mine ? 'bg-brand-100' : 'bg-paper')} style={{ width: `${pct}%` }} />}
              <span className="relative flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">{mine && <CheckCircle2 className="h-4 w-4 text-brand-600" />}{o.label}</span>
                {showResults && <span className="font-semibold text-ink-soft">{pct}%</span>}
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex items-center justify-between text-sm text-ink-faint">
        <span>{plural(poll.voters, 'vote')}{poll.closesAt && ` · ${poll.closed ? 'closed' : 'closes ' + untilText(poll.closesAt)}`}{poll.multi && ' · choose any'}</span>
        {poll.multi && !poll.closed && user && <Button size="sm" variant="secondary" loading={vote.isPending} disabled={!picked.length} onClick={() => vote.mutate(picked)}>{voted ? 'Update vote' : 'Vote'}</Button>}
      </div>
    </div>
  );
}
