import { FormEvent, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Megaphone, Send } from 'lucide-react';
import { api } from '../../lib/api';
import { Button, Card, FormError, Input, Notice, Select, Textarea, fieldError, useConfirm } from '../../components/ui';

const AUDIENCES: [string, string][] = [
  ['all', 'Everyone'],
  ['volunteers', 'Volunteers'],
  ['organizers', 'Organizers and CSR companies'],
  ['donors', 'Registered blood donors'],
];

export default function AdminBroadcast() {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [link, setLink] = useState('');
  const [audience, setAudience] = useState('all');
  const [sent, setSent] = useState<{ count: number; title: string } | null>(null);
  const [confirm, dialog] = useConfirm();
  const m = useMutation({
    mutationFn: () => api<{ sent: number }>('/admin/broadcast', { body: { title: title.trim(), body: body.trim() || undefined, link: link.trim() || undefined, audience } }),
    onSuccess: (r) => {
      setSent({ count: r.sent, title: title.trim() });
      toast.success(`Announcement sent to ${r.sent} ${r.sent === 1 ? 'person' : 'people'}`);
      setTitle(''); setBody(''); setLink('');
    },
  });
  const linkInvalid = link.trim() !== '' && !/^\/[^\s]*$|^https:\/\/[^\s]+$/.test(link.trim());
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const who = AUDIENCES.find(([k]) => k === audience)?.[1];
    if (await confirm({ title: 'Send this announcement?', body: `Audience: ${who}. It arrives as an in-app notification and a push alert on devices with push turned on. It can't be recalled.`, confirmLabel: 'Send now' })) m.mutate();
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
      <Card>
        <h2 className="text-lg font-bold">Send an announcement</h2>
        <p className="mb-4 text-sm text-ink-soft">Use sparingly — for platform news, safety advisories or city-wide emergencies.</p>
        <form onSubmit={submit} className="space-y-4">
          <Select label="Audience" value={audience} onChange={(e) => setAudience(e.target.value)} options={AUDIENCES} />
          <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required placeholder="e.g. Cyclone advisory for Chennai — stay safe" hint={`${title.length}/120`} error={fieldError(m.error, 'title')} />
          <Textarea label="Message" optional rows={4} value={body} onChange={(e) => setBody(e.target.value)} maxLength={1000} hint={`${body.length}/1000`} error={fieldError(m.error, 'body')} />
          <Input label="Link" optional value={link} onChange={(e) => setLink(e.target.value)} maxLength={300} placeholder="/events or https://…" hint="An in-app path like /requests, or a full https:// address."
            error={linkInvalid ? 'Start with / for an in-app page, or https:// for a website' : fieldError(m.error, 'link')} />
          <FormError error={m.error && !fieldError(m.error, 'title') && m.error} />
          <Button type="submit" icon={<Send className="h-4 w-4" />} loading={m.isPending} disabled={title.trim().length < 3 || linkInvalid}>Send announcement</Button>
        </form>
      </Card>
      <div className="space-y-3">
        {sent && (
          <Notice tone="leaf" icon={<Megaphone className="h-5 w-5" />} title={`Sent to ${sent.count} ${sent.count === 1 ? 'person' : 'people'}`}>
            “{sent.title}” is in their notifications now.
          </Notice>
        )}
        <Card>
          <h3 className="text-sm font-bold">Preview</h3>
          <div className="mt-2 rounded-xl border border-paper-line p-3">
            <div className="font-semibold">📢 {title || 'Your title'}</div>
            {body && <div className="mt-0.5 line-clamp-3 text-sm text-ink-soft">{body}</div>}
          </div>
          <p className="mt-2 text-xs text-ink-faint">Every broadcast is recorded in the audit log.</p>
        </Card>
      </div>
      {dialog}
    </div>
  );
}
