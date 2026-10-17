import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { CalendarDays, CheckCircle2, MapPin, Search, ShieldQuestion } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { EVENT_CATEGORIES } from '../lib/constants';
import { fmtDate, hours as fmtHours } from '../lib/format';
import { Button, Card, ErrorState, Skeleton, VerifiedBadge } from '../components/ui';
import { LogoMark } from '../components/Logo';

interface Verified {
  valid: true;
  serial: string;
  hours: number;
  issuedAt: string;
  volunteerName: string;
  eventId: string;
  eventTitle: string;
  startAt: string;
  locationName: string | null;
  category: string;
  organizerName: string;
  organizerHandle: string;
  organizerVerified: boolean;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-ink-faint">{label}</dt>
      <dd className="mt-0.5 font-semibold">{children}</dd>
    </div>
  );
}

export default function VerifyCertificate() {
  const { t } = useTranslation();
  const { serial = '' } = useParams();
  const nav = useNavigate();
  const [input, setInput] = useState(serial);
  useEffect(() => setInput(serial), [serial]);
  const q = useQuery({
    queryKey: ['verify-cert', serial.toUpperCase()],
    queryFn: () => api<Verified>(`/certificates/verify/${encodeURIComponent(serial.trim())}`),
    enabled: Boolean(serial.trim()),
    retry: false,
  });
  const notFound = q.error instanceof ApiError && q.error.status === 404;

  const check = (e: FormEvent) => {
    e.preventDefault();
    const s = input.trim().toUpperCase();
    if (s) nav(`/verify/${encodeURIComponent(s)}`);
  };

  useEffect(() => {
    const prev = document.title;
    document.title = 'Verify a certificate · ServeConnect';
    return () => { document.title = prev; };
  }, []);

  const c = q.data;
  const cat = c ? EVENT_CATEGORIES[c.category] ?? EVENT_CATEGORIES.other : null;

  return (
    <div className="mx-auto max-w-2xl py-2">
      <div className="mb-5 text-center">
        <h1 className="text-2xl font-extrabold sm:text-[28px]">{t('verify.title', 'Certificate verification')}</h1>
        <p className="mt-1 text-ink-soft">{t('verify.subtitle', 'Check that a ServeConnect volunteering certificate is genuine.')}</p>
      </div>

      {q.isPending && serial ? (
        <Card className="space-y-4"><Skeleton className="h-8 w-1/2" /><Skeleton className="h-6 w-3/4" /><Skeleton className="h-24 w-full" /></Card>
      ) : c ? (
        <Card padded={false} className="overflow-hidden">
          <div className="flex items-center gap-3 border-b border-leaf-100 bg-leaf-50 px-5 py-4" role="status">
            <CheckCircle2 className="h-8 w-8 shrink-0 text-leaf-600" aria-hidden />
            <div>
              <div className="text-lg font-extrabold text-leaf-700">Valid certificate</div>
              <div className="text-sm text-leaf-700">Issued by ServeConnect after the organizer confirmed attendance.</div>
            </div>
          </div>
          <div className="space-y-5 p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-sm text-ink-faint">Awarded to</div>
                <div className="font-display text-2xl font-extrabold leading-tight sm:text-3xl">{c.volunteerName}</div>
                <div className="mt-1 text-ink-soft">for volunteering at</div>
                <Link to={`/events/${c.eventId}`} className="text-lg font-bold text-brand-700 hover:underline">{c.eventTitle}</Link>
              </div>
              <div className="stamp h-24 w-24 shrink-0 text-center" role="img" aria-label={`${fmtHours(c.hours)} verified hours`}>
                <span className="text-3xl leading-none">{fmtHours(c.hours)}</span>
                <span className="mt-0.5 text-xs">hours</span>
              </div>
            </div>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Field label="Organized by">
                <Link to={`/u/${c.organizerHandle}`} className="inline-flex items-center gap-1 hover:underline">{c.organizerName}{c.organizerVerified && <VerifiedBadge />}</Link>
                {c.organizerVerified && <span className="block text-xs font-normal text-ink-faint">Verified organization</span>}
              </Field>
              <Field label="Event date"><span className="inline-flex items-center gap-1.5"><CalendarDays className="h-4 w-4 text-ink-faint" aria-hidden />{fmtDate(c.startAt)}</span></Field>
              {c.locationName && <Field label="Location"><span className="inline-flex items-start gap-1.5"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" aria-hidden />{c.locationName}</span></Field>}
              {cat && <Field label="Cause"><span aria-hidden>{cat.emoji}</span> {cat.label}</Field>}
              <Field label="Verified service hours">{fmtHours(c.hours)}</Field>
              <Field label="Issued">{fmtDate(c.issuedAt)}</Field>
            </dl>
            <div className="flex items-center justify-between gap-3 border-t border-paper-line pt-4">
              <span className="font-mono text-sm text-ink-soft">No. {c.serial}</span>
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700"><LogoMark size={20} /> ServeConnect</span>
            </div>
          </div>
        </Card>
      ) : notFound ? (
        <Card className="flex flex-col items-center px-6 py-10 text-center">
          <ShieldQuestion className="h-12 w-12 text-marigold-600" aria-hidden />
          <h2 className="mt-3 text-xl font-extrabold">No certificate with that number</h2>
          <p className="mt-1 max-w-md text-ink-soft">
            We couldn't find <span className="font-mono font-semibold text-ink">{serial}</span>. Check for typos — serials look like <span className="font-mono">SC-2026-ABCD1234</span>. If it still doesn't match, the certificate may not be genuine.
          </p>
        </Card>
      ) : q.isError ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : null}

      <form onSubmit={check} className="mt-6">
        <Card className="space-y-2">
          <label htmlFor="serial" className="block text-sm font-semibold">{c || notFound ? 'Check another certificate' : 'Certificate number'}</label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="serial"
              className="input flex-1 font-mono uppercase"
              placeholder="SC-2026-ABCD1234"
              value={input}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setInput(e.target.value)}
            />
            <Button type="submit" icon={<Search className="h-4 w-4" />} disabled={!input.trim()}>Verify</Button>
          </div>
          <p className="text-sm text-ink-faint">The number is printed at the bottom of every certificate.</p>
        </Card>
      </form>
    </div>
  );
}
