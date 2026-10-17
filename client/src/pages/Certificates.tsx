import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Award, CalendarDays, Copy, Download, ExternalLink, Eye, Linkedin, MapPin } from 'lucide-react';
import { api, download, openFile } from '../lib/api';
import { EVENT_CATEGORIES } from '../lib/constants';
import { fmtDate, hours as fmtHours, plural } from '../lib/format';
import { Button, ButtonLink, Card, EmptyState, ErrorState, PageHeader, Skeleton, VerifiedBadge, toastError } from '../components/ui';

export interface Certificate {
  serial: string;
  hours: number;
  issuedAt: string;
  eventId: string;
  eventTitle: string;
  startAt: string;
  locationName: string | null;
  category: string;
  organizerName: string;
  organizerHandle: string;
  organizerVerified: boolean;
  volunteerName?: string;
}

const verifyUrl = (serial: string) => `${window.location.origin}/verify/${serial}`;

function CertCard({ c }: { c: Certificate }) {
  const [busy, setBusy] = useState<'pdf' | 'view' | null>(null);
  const cat = EVENT_CATEGORIES[c.category] ?? EVENT_CATEGORIES.other;
  const run = async (kind: 'pdf' | 'view') => {
    setBusy(kind);
    try {
      if (kind === 'pdf') await download(`/certificates/${c.serial}/pdf`, `ServeConnect-certificate-${c.serial}.pdf`);
      else await openFile(`/certificates/${c.serial}/pdf?inline=1`);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(verifyUrl(c.serial));
      toast.success('Verification link copied.');
    } catch {
      toast.error("Couldn't copy. The link is " + verifyUrl(c.serial));
    }
  };
  const linkedIn = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(verifyUrl(c.serial))}`;

  return (
    <li className="card flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5">
      <div className="flex min-w-0 flex-1 gap-4">
        <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
          <span className="font-display text-xl font-extrabold leading-none">{fmtHours(c.hours)}</span>
          <span className="text-[11px] font-semibold">hours</span>
        </div>
        <div className="min-w-0">
          <Link to={`/events/${c.eventId}`} className="line-clamp-2 text-base font-bold leading-snug hover:underline">{c.eventTitle}</Link>
          <div className="mt-0.5 flex items-center gap-1 text-sm text-ink-soft">
            <Link to={`/u/${c.organizerHandle}`} className="truncate hover:underline">{c.organizerName}</Link>
            {c.organizerVerified && <VerifiedBadge size={14} />}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-ink-faint">
            <span className="inline-flex items-center gap-1"><CalendarDays className="h-4 w-4" aria-hidden />{fmtDate(c.startAt)}</span>
            {c.locationName && <span className="inline-flex min-w-0 items-center gap-1"><MapPin className="h-4 w-4 shrink-0" aria-hidden /><span className="truncate">{c.locationName}</span></span>}
            <span><span aria-hidden>{cat.emoji}</span> {cat.label}</span>
          </div>
          <div className="mt-1.5 font-mono text-xs text-ink-faint">No. {c.serial}</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0 sm:flex-col sm:items-stretch">
        <Button size="sm" icon={<Download className="h-4 w-4" />} loading={busy === 'pdf'} disabled={busy !== null} onClick={() => run('pdf')}>Download PDF</Button>
        <Button size="sm" variant="outline" icon={<Eye className="h-4 w-4" />} loading={busy === 'view'} disabled={busy !== null} onClick={() => run('view')}>View</Button>
        <Button size="sm" variant="ghost" icon={<Copy className="h-4 w-4" />} onClick={copy}>Copy link</Button>
        <a href={linkedIn} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl px-3 py-1.5 text-sm font-semibold text-[#0A66C2] hover:bg-paper">
          <Linkedin className="h-4 w-4" aria-hidden /> Share<span className="sr-only"> on LinkedIn (opens in a new tab)</span>
        </a>
      </div>
    </li>
  );
}

export default function Certificates() {
  const { t } = useTranslation();
  const q = useQuery({ queryKey: ['certificates'], queryFn: () => api<Certificate[]>('/certificates/mine') });
  const certs = q.data ?? [];
  const total = certs.reduce((s, c) => s + Number(c.hours || 0), 0);
  const orgs = new Set(certs.map((c) => c.organizerHandle)).size;

  return (
    <div>
      <PageHeader title={t('nav.certificates', 'Certificates')} subtitle={t('certificates.subtitle', 'Proof of your verified service — download, share or let anyone check it online.')} />
      {q.isPending ? (
        <div className="space-y-3"><Skeleton className="h-40 w-full rounded-2xl" />{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-2xl" />)}</div>
      ) : q.isError ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : certs.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Award />}
            title="No certificates yet"
            body="When you check in at an event and the organizer completes it, your certificate appears here automatically."
            action={<ButtonLink to="/events">Find an event</ButtonLink>}
          />
        </Card>
      ) : (
        <div className="space-y-5">
          <Card className="flex flex-col items-center gap-5 sm:flex-row sm:gap-8">
            <div className="stamp h-32 w-32 shrink-0 text-center" role="img" aria-label={`${fmtHours(total)} verified hours`}>
              <span className="text-4xl leading-none">{fmtHours(total)}</span>
              <span className="mt-1 text-sm">hours</span>
            </div>
            <div className="text-center sm:text-left">
              <h2 className="text-xl font-extrabold">{fmtHours(total)} verified hours of service</h2>
              <p className="mt-1 text-ink-soft">
                {plural(certs.length, 'certificate')} from {plural(orgs, 'organization')}. Each one carries a serial number anyone can check at ServeConnect — useful for college applications, CSR records and CVs.
              </p>
              <Link to={`/verify/${certs[0].serial}`} className="link mt-2 inline-flex items-center gap-1 text-sm font-semibold">
                See what verifiers see <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </div>
          </Card>
          <ul className="space-y-3" aria-label="Your certificates">
            {certs.map((c) => <CertCard key={c.serial} c={c} />)}
          </ul>
        </div>
      )}
    </div>
  );
}
