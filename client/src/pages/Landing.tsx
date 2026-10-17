import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { CalendarCheck2, Droplet, Gift, QrCode, ShieldCheck, Users, MessageCircle, Award } from 'lucide-react';
import { api } from '../lib/api';
import { Logo } from '../components/Logo';
import { ButtonLink } from '../components/ui';

function TicketMock() {
  return (
    <div className="relative mx-auto w-full max-w-[380px]" aria-hidden>
      <div className="card rotate-[-2deg] overflow-hidden shadow-lift">
        <div className="flex h-28 items-end bg-[linear-gradient(135deg,#28307A,#3E4BB4)] p-4 text-white">
          <div>
            <div className="text-sm font-semibold text-marigold-300">Sat, 7:00 AM · Pallikaranai</div>
            <div className="font-display text-xl font-extrabold leading-tight">Marsh restoration drive</div>
          </div>
        </div>
        <div className="flex items-center gap-4 p-4 pr-16">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-white ring-1 ring-paper-line">
            <QrCode className="h-16 w-16 text-ink" strokeWidth={1.5} />
          </div>
          <div className="text-sm">
            <div className="font-semibold">You're checked in</div>
            <div className="text-ink-soft">Team Wetland Crew · lead Vikram</div>
            <div className="mt-1 font-semibold text-leaf-600">38 of 50 volunteers here</div>
          </div>
        </div>
      </div>
      <div className="stamp absolute -bottom-20 right-2 h-32 w-32 bg-paper/90 text-brand-600 sm:-right-4">
        <span className="text-4xl leading-none">4 hrs</span>
        <span className="text-xs">verified</span>
      </div>
    </div>
  );
}

const steps = [
  { icon: <Users />, title: 'Find a cause near you', body: 'Browse drives by skill, distance and date, or follow NGOs you trust.' },
  { icon: <CalendarCheck2 />, title: 'Register in one tap', body: 'Full? Join the waitlist — you move up automatically when a spot opens.' },
  { icon: <QrCode />, title: 'Check in on the day', body: 'Scan the organizer’s QR code. No camera? Give them your personal code.' },
  { icon: <Award />, title: 'Get your certificate', body: 'Verified hours land on your profile with a PDF anyone can verify.' },
];

export default function Landing() {
  const { t } = useTranslation();
  const stats = useQuery({ queryKey: ['public-stats'], queryFn: () => api<{ volunteers: number; organizations: number; events: number; hours: number; bloodDonations: number }>('/stats/public') });
  const s = stats.data;
  return (
    <div className="min-h-screen bg-paper">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-4 sm:px-5">
        <span className="sm:hidden"><Logo compact /></span>
        <span className="hidden sm:inline"><Logo /></span>
        <nav className="flex items-center gap-1 sm:gap-2">
          <Link to="/help" className="hidden px-3 py-2 text-[15px] font-semibold text-ink-soft hover:text-ink sm:block">How it works</Link>
          <ButtonLink to="/login" variant="ghost" size="sm" className="sm:px-4 sm:py-2.5 sm:text-[15px]">{t('auth.signIn')}</ButtonLink>
          <ButtonLink to="/register" size="sm" className="sm:px-4 sm:py-2.5 sm:text-[15px]">Join free</ButtonLink>
        </nav>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-14 overflow-x-clip px-5 pb-24 pt-10 lg:grid-cols-[1.15fr_1fr] lg:pt-16">
        <div>
          <h1 className="font-display text-[44px] font-extrabold leading-[1.02] tracking-tight sm:text-[64px]">
            Show up for your city.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-soft">
            ServeConnect is where NGOs post drives and donation needs, volunteers sign up in a tap, and every hour of service is checked in, counted and certified — instead of getting lost in WhatsApp groups.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink to="/register" size="lg">Start volunteering</ButtonLink>
            <ButtonLink to="/register?role=organizer" size="lg" variant="outline">Register your NGO</ButtonLink>
          </div>
          {s && (
            <dl className="mt-10 flex flex-wrap gap-x-10 gap-y-4">
              <div><dt className="text-sm text-ink-soft">Volunteers</dt><dd className="font-display text-3xl font-extrabold">{s.volunteers.toLocaleString('en-IN')}</dd></div>
              <div><dt className="text-sm text-ink-soft">Verified organizations</dt><dd className="font-display text-3xl font-extrabold">{s.organizations.toLocaleString('en-IN')}</dd></div>
              <div><dt className="text-sm text-ink-soft">Hours of service</dt><dd className="font-display text-3xl font-extrabold">{Math.round(s.hours).toLocaleString('en-IN')}</dd></div>
            </dl>
          )}
        </div>
        <TicketMock />
      </section>

      <section className="border-y border-paper-line bg-white">
        <div className="mx-auto max-w-6xl px-5 py-16">
          <h2 className="max-w-xl text-3xl font-extrabold">From sign-up to certificate</h2>
          <ol className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((st, i) => (
              <li key={st.title}>
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-600 font-display font-extrabold text-white">{i + 1}</span>
                  <span className="text-brand-600 [&>svg]:h-6 [&>svg]:w-6">{st.icon}</span>
                </div>
                <h3 className="mt-4 text-lg font-bold">{st.title}</h3>
                <p className="mt-1 text-ink-soft">{st.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-6 px-5 py-16 md:grid-cols-3">
        <div className="card p-6">
          <ShieldCheck className="h-8 w-8 text-brand-600" />
          <h3 className="mt-3 text-xl font-bold">For NGOs and organizers</h3>
          <p className="mt-2 text-ink-soft">A verified profile, event pages with waitlists and weather alerts, teams with group chat, QR attendance, and analytics on who actually showed up.</p>
        </div>
        <div className="card p-6">
          <Droplet className="h-8 w-8 text-blood-500" />
          <h3 className="mt-3 text-xl font-bold">For blood donors</h3>
          <p className="mt-2 text-ink-soft">Opt in once. When a hospital nearby needs a group you can give to, you hear first — rare groups like O-negative and Bombay get priority alerts.</p>
        </div>
        <div className="card p-6">
          <Gift className="h-8 w-8 text-marigold-600" />
          <h3 className="mt-3 text-xl font-bold">For givers</h3>
          <p className="mt-2 text-ink-soft">Drives list exactly what they need — 40 kg rice, 120 school bags — and you pledge the item, not just money. Counts update live.</p>
        </div>
      </section>

      <section className="bg-brand-700 text-white">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-5 py-14 md:flex-row md:items-center">
          <div>
            <h2 className="text-3xl font-extrabold text-white">Your community is already organizing.</h2>
            <p className="mt-2 flex items-center gap-2 text-brand-100"><MessageCircle className="h-5 w-5" /> Follow, message and team up — it’s free for everyone.</p>
          </div>
          <ButtonLink to="/register" size="lg" variant="marigold">Create your account</ButtonLink>
        </div>
      </section>

      <footer className="mx-auto max-w-6xl px-5 py-10 text-sm text-ink-faint">
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <Link to="/help" className="hover:underline">Help center</Link>
          <Link to="/terms" className="hover:underline">Terms</Link>
          <Link to="/privacy" className="hover:underline">Privacy</Link>
          <a href="/api/handbook.pdf" target="_blank" rel="noreferrer" className="hover:underline">Organizer handbook</a>
        </div>
        <p className="mt-4 max-w-3xl">{t('safety.platformDisclaimer')}</p>
        <p className="mt-2">© {new Date().getFullYear()} ServeConnect</p>
      </footer>
    </div>
  );
}
