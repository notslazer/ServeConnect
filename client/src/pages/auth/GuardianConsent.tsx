import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CheckCircle2, ShieldCheck, XCircle } from 'lucide-react';
import { api } from '../../lib/api';
import { Button, Checkbox, ErrorState, FormError, Input, PageLoader, fieldError } from '../../components/ui';
import { Logo } from '../../components/Logo';

/** Public page a parent/guardian opens from the consent email (SRS §5.2). */
export default function GuardianConsent() {
  const { token } = useParams();
  const q = useQuery({ queryKey: ['guardian', token], queryFn: () => api<{ childName: string; guardianEmail: string; decision: string | null; expired: boolean }>(`/auth/guardian/${token}`) });
  const [name, setName] = useState('');
  const [confirm, setConfirm] = useState(false);
  const m = useMutation({ mutationFn: (decision: 'granted' | 'denied') => api(`/auth/guardian/${token}`, { body: { decision, guardianName: name, confirm } }), onSuccess: () => q.refetch() });
  const decision = q.data?.decision ?? (m.isSuccess ? m.variables : null);
  return (
    <div className="min-h-screen bg-paper px-4 py-10">
      <div className="mx-auto max-w-lg">
        <Link to="/" className="mb-8 inline-block"><Logo /></Link>
        {q.isLoading ? <PageLoader /> : q.error ? <ErrorState error={q.error} /> : (
          <div className="card p-6">
            {decision ? (
              <div className="text-center">
                {decision === 'granted' ? <CheckCircle2 className="mx-auto h-12 w-12 text-leaf-500" /> : <XCircle className="mx-auto h-12 w-12 text-blood-500" />}
                <h1 className="mt-3 text-2xl font-extrabold">{decision === 'granted' ? 'Consent recorded' : 'Consent declined'}</h1>
                <p className="mt-2 text-ink-soft">{decision === 'granted' ? `${q.data!.childName} can now register for in-person events. Thank you.` : `${q.data!.childName} can browse ServeConnect but cannot join in-person events.`}</p>
              </div>
            ) : q.data!.expired ? (
              <div className="text-center">
                <h1 className="text-2xl font-extrabold">This link has expired</h1>
                <p className="mt-2 text-ink-soft">Ask {q.data!.childName} to send a new request from Settings → Account.</p>
              </div>
            ) : (
              <>
                <ShieldCheck className="h-10 w-10 text-brand-600" />
                <h1 className="mt-3 text-2xl font-extrabold">{q.data!.childName} wants to volunteer</h1>
                <p className="mt-2 text-ink-soft">
                  {q.data!.childName} listed you ({q.data!.guardianEmail}) as their parent or guardian on ServeConnect, a platform where NGOs organize volunteering drives. Because they are under 18, they need your consent to register for in-person events.
                </p>
                <ul className="mt-4 list-disc space-y-1 pl-5 text-[15px] text-ink-soft">
                  <li>Their exact location and contact details are never shown to other users.</li>
                  <li>Direct messages are disabled for under-18 accounts; they can only chat in organizer-run event teams.</li>
                  <li>Organizers can set minimum ages for events that aren't suitable for minors.</li>
                  <li>You can ask us to delete the account at any time: support@serveconnect.app.</li>
                </ul>
                <div className="mt-5 space-y-4">
                  <Input label="Your full name" value={name} onChange={(e) => setName(e.target.value)} error={fieldError(m.error, 'guardianName')} />
                  <Checkbox checked={confirm} onChange={setConfirm} label={`I am ${q.data!.childName}'s parent or legal guardian.`} error={fieldError(m.error, 'confirm')} />
                  <FormError error={m.error} />
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button className="flex-1" loading={m.isPending && m.variables === 'granted'} disabled={!confirm || name.trim().length < 2} onClick={() => m.mutate('granted')}>Give consent</Button>
                    <Button className="flex-1" variant="outline" loading={m.isPending && m.variables === 'denied'} disabled={!confirm || name.trim().length < 2} onClick={() => m.mutate('denied')}>Decline</Button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
