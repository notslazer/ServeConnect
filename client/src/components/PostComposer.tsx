import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { BarChart2, X } from 'lucide-react';
import { api } from '../lib/api';
import { useMe } from '../lib/auth';
import type { Post } from '../lib/types';
import { Avatar, Button, FormError, IconButton, Toggle } from './ui';
import { ImagePicker } from './ImagePicker';

export function PostComposer({ onPosted, autoFocus }: { onPosted: (p: Post) => void; autoFocus?: boolean }) {
  const me = useMe();
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [poll, setPoll] = useState<null | { question: string; options: string[]; multi: boolean }>(null);
  const [focused, setFocused] = useState(Boolean(autoFocus));
  const m = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      if (body.trim()) fd.append('body', body.trim());
      files.forEach((f) => fd.append('files', f));
      if (poll) fd.append('poll', JSON.stringify({ question: poll.question.trim(), options: poll.options.map((o) => o.trim()).filter(Boolean), multi: poll.multi }));
      return api<Post>('/posts', { form: fd });
    },
    onSuccess: (p) => {
      setBody(''); setFiles([]); setPoll(null); setFocused(false);
      toast.success('Posted');
      onPosted(p);
    },
  });
  const pollValid = !poll || (poll.question.trim().length >= 3 && poll.options.filter((o) => o.trim()).length >= 2);
  const canPost = (body.trim() || files.length || poll) && pollValid;
  return (
    <div className="card p-4">
      <div className="flex gap-3">
        <Avatar src={me.avatarUrl} name={me.name} size={42} />
        <textarea
          className="min-h-[48px] flex-1 resize-none bg-transparent py-2 text-[16px] placeholder:text-ink-faint focus:outline-none"
          rows={focused ? 4 : 1}
          placeholder={me.role === 'volunteer' ? 'Share a moment from the field…' : 'Share an update with your supporters…'}
          value={body}
          autoFocus={autoFocus}
          onFocus={() => setFocused(true)}
          onChange={(e) => setBody(e.target.value)}
          maxLength={5000}
          aria-label="Write a post"
        />
      </div>
      {poll && (
        <div className="mt-3 space-y-2 rounded-2xl border border-paper-line p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">Poll</span>
            <IconButton label="Remove poll" onClick={() => setPoll(null)}><X className="h-4 w-4" /></IconButton>
          </div>
          <input className="input" placeholder="Ask a question" value={poll.question} onChange={(e) => setPoll({ ...poll, question: e.target.value })} maxLength={200} aria-label="Poll question" />
          {poll.options.map((o, i) => (
            <input key={i} className="input" placeholder={`Option ${i + 1}`} value={o} maxLength={80} aria-label={`Option ${i + 1}`}
              onChange={(e) => setPoll({ ...poll, options: poll.options.map((x, j) => (j === i ? e.target.value : x)) })} />
          ))}
          <div className="flex items-center justify-between">
            {poll.options.length < 6 ? <button className="link text-sm" onClick={() => setPoll({ ...poll, options: [...poll.options, ''] })}>Add option</button> : <span />}
            <div className="w-56"><Toggle checked={poll.multi} onChange={(v) => setPoll({ ...poll, multi: v })} label={<span className="text-sm">Allow multiple answers</span>} /></div>
          </div>
        </div>
      )}
      {(focused || files.length > 0) && (
        <div className="mt-3 space-y-3 border-t border-paper-line pt-3">
          <ImagePicker files={files} onChange={setFiles} />
          <div className="flex items-center justify-between gap-2">
            {!poll ? (
              <button type="button" onClick={() => setPoll({ question: '', options: ['', ''], multi: false })} className="inline-flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm font-semibold text-brand-600 hover:bg-brand-50">
                <BarChart2 className="h-5 w-5" /> Add a poll
              </button>
            ) : <span />}
            <div className="flex items-center gap-3">
              <span className="text-xs text-ink-faint">{body.length > 4500 && `${5000 - body.length} left`}</span>
              <Button loading={m.isPending} disabled={!canPost} onClick={() => m.mutate()}>Post</Button>
            </div>
          </div>
          <FormError error={m.error} />
        </div>
      )}
    </div>
  );
}
