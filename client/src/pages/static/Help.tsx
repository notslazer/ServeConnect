import { ReactNode, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import {
  Award, BookOpen, CalendarCheck, ChevronDown, Droplet, KeyRound, LifeBuoy, Mail, Rocket, Search, ShieldCheck, ShieldHalf,
} from 'lucide-react';
import { API_URL } from '../../lib/api';
import { useDebounce } from '../../lib/hooks';
import { Card, EmptyState, PageHeader } from '../../components/ui';

/** A paragraph (string) or a bullet list (string[]). */
type Block = string | string[];
interface Article { id: string; title: string; body: Block[] }
interface Topic { id: string; title: string; icon: ReactNode; articles: Article[] }

const SUPPORT = 'support@serveconnect.app';

const TOPICS: Topic[] = [
  {
    id: 'start', title: 'Getting started', icon: <Rocket />,
    articles: [
      { id: 'what-is', title: 'What is ServeConnect?', body: [
        'ServeConnect is a community platform that connects volunteers, NGOs, independent organizers and companies running CSR programmes. Organizers publish events and donation drives; volunteers find them, sign up, check in on the day and build a verified record of their service.',
        'It also connects blood donors with people who urgently need blood nearby, and lets anyone follow causes and organizations they care about.',
      ] },
      { id: 'account-types', title: 'Which account type should I choose?', body: [
        [
          'Volunteer — for individuals who want to join events, donate blood or pledge items. You must be at least 13; under-18s need a parent or guardian’s consent.',
          'Organizer — for NGOs, trusts, societies, community groups and independent organizers who run events or drives. Organizers must be verified before they can publish.',
          'CSR company — for companies running employee volunteering. You get an invite code for employees and an impact report of their verified hours.',
        ],
        'If you picked the wrong type, contact support and we can change it for you.',
      ] },
      { id: 'profile-setup', title: 'Setting up a profile that gets noticed', body: [
        'Add a clear photo or logo, a one-line headline and your area. Volunteers should pick their skills (for example first aid, teaching or driving) and the causes they care about — we use these to recommend events, and organizers looking for those skills can find you.',
        'Your location is used to show nearby events and requests. Others only ever see your general area, blurred to about 1 km. You can edit everything later in Settings → Profile.',
      ] },
      { id: 'feed', title: 'How the feed and following work', body: [
        'Your feed shows posts from people and organizations you follow, newest first. Until you follow anyone, it shows recent posts from verified organizers so it is never empty.',
        'Use Explore to search for people, events and donation drives, browse trending hashtags, and find organizations to follow. Tap a #hashtag in any post to see everything tagged with it.',
      ] },
    ],
  },
  {
    id: 'events', title: 'Events & check-in', icon: <CalendarCheck />,
    articles: [
      { id: 'register', title: 'How do I sign up for an event?', body: [
        'Open the event and tap Register. You’ll get a confirmation and the event appears under My events with your personal check-in code. If the event has a minimum age, skill requirements or needs guardian consent for under-18s, the page tells you before you register.',
        'Can’t make it any more? Open the event and cancel your registration as early as you can — it frees your spot for someone on the waitlist.',
      ] },
      { id: 'waitlist', title: 'The event is full — how does the waitlist work?', body: [
        'When an event reaches capacity you can join the waitlist instead. Your position is shown on the event and in My events.',
        'If a registered volunteer cancels, the first person on the waitlist is promoted automatically and notified straight away. You don’t need to do anything — just check your notifications.',
      ] },
      { id: 'reminders', title: 'Reminders and weather advisories', body: [
        'We remind you 24 hours and 1 hour before an event starts (organizers can change these times). Reminders arrive in the app, and by push and email if you have those turned on in Settings → Notifications.',
        'For outdoor events, we check the forecast for the event location from 5 days before. If heavy rain, storms or extreme heat are expected, registered volunteers get a weather advisory and the event page shows the forecast.',
      ] },
      { id: 'checkin', title: 'How do I check in on the day?', body: [
        'Check-in opens 1 hour before the event starts and closes when it ends. There are three ways to check in:',
        [
          'Scan the QR code: tap Check in in the app and scan the code on the organizer’s screen. The code refreshes every minute, so a photo of it won’t work later — scan it live.',
          'Personal check-in code: every registration has a 6-character code (shown in My events). If your camera isn’t working, tell the organizer or your team lead your code and they’ll check you in.',
          'Event code: the organizer may read out a short event code you can type into the app.',
        ],
        'You can only check in once per event. Your check-in is what turns into verified hours.',
      ] },
      { id: 'no-show', title: 'What counts as a no-show?', body: [
        'If you stay registered but aren’t checked in by the time the organizer completes the event, it’s recorded as a no-show. No-show counts are visible only to organizers, to help them plan — never to other volunteers.',
        'If you were there but your check-in failed, ask the organizer to mark you as attended from their attendee list.',
      ] },
      { id: 'teams', title: 'Teams and group chat', body: [
        'Organizers can split volunteers into teams with a team lead and roles. Each team has a private group chat for coordinating on the day. Team leads can also check in their own members.',
      ] },
    ],
  },
  {
    id: 'certificates', title: 'Certificates & hours', icon: <Award />,
    articles: [
      { id: 'verified-hours', title: 'What are verified hours?', body: [
        'Hours are added to your profile only when your attendance is verified — by QR scan, your personal check-in code entered by the organizer, or the organizer marking you attended. Registering alone doesn’t count.',
        'The hours for each event are set by the organizer (normally the event’s length). Your total appears on your profile as a service stamp; you can hide it in Settings → Privacy.',
      ] },
      { id: 'certificate', title: 'When do I get my certificate?', body: [
        'Certificates are issued only for verified attendance. When the organizer marks the event complete, every verified attendee receives a PDF certificate within 24 hours. If an organizer forgets, events are completed automatically 24 hours after they end, so certificates are never withheld.',
        'Find and download all your certificates under Certificates.',
      ] },
      { id: 'verify-certificate', title: 'How can an employer or college check my certificate?', body: [
        'Each certificate has a unique number and a QR code. Scanning it — or visiting the verification link printed on the certificate — opens a public page confirming the volunteer’s name, the event, the organizer and the verified hours.',
      ] },
      { id: 'streaks', title: 'Streaks, milestones and leaderboards', body: [
        'Your streak counts consecutive months in which you attended at least one event. Milestones are awarded for things like your first event, hours of service and reviews.',
        'Leaderboards rank volunteers by verified hours this month and all time, globally, among people you follow, nearby or within your company. Prefer not to appear? Turn it off in Settings → Privacy.',
      ] },
    ],
  },
  {
    id: 'blood', title: 'Blood & donation requests', icon: <Droplet />,
    articles: [
      { id: 'blood-requests', title: 'Who sees a blood request?', body: [
        'A blood request is not broadcast to everyone. It is sent only to people who have opted in as blood donors, whose blood group is compatible with the patient’s, who are within both the requester’s chosen radius and the donor’s own travel radius, and who haven’t donated in the last 90 days.',
        'Requests for rare groups (A−, B−, AB−, O− and Bombay) and critical requests are flagged high priority and sent as urgent alerts. Requesters can re-broadcast if they still need donors.',
        'Anyone signed in can raise a blood request. Please only post genuine, current needs with the hospital’s details.',
      ] },
      { id: 'become-donor', title: 'How do I become a blood donor?', body: [
        'Go to Settings → Blood donor, choose your blood group, set how far you can travel and agree to your blood group being used only for matching. You need to be 18 or older and have your location set in your profile.',
        'Your blood group is encrypted and never shown on your profile or in search. If you respond to a request, the requester sees your name and phone number so they can coordinate with you.',
      ] },
      { id: 'compatibility', title: 'Which blood groups are compatible?', body: [
        'We match donors using standard red-cell compatibility:',
        [
          'O− patients: O− donors only',
          'O+ patients: O−, O+',
          'A− patients: O−, A−',
          'A+ patients: O−, O+, A−, A+',
          'B− patients: O−, B−',
          'B+ patients: O−, O+, B−, B+',
          'AB− patients: O−, A−, B−, AB−',
          'AB+ patients: all groups',
          'Bombay (hh) patients: Bombay donors only',
        ],
        'The blood bank always cross-matches before transfusion and has the final say on eligibility.',
      ] },
      { id: 'interval', title: 'Why haven’t I received any blood requests?', body: [
        'We wait at least 90 days after your last donation before sending you new requests, to protect your health. Your last donation date updates automatically when a requester marks you as donated, and you can also set it yourself in Settings → Blood donor.',
        'Other reasons: there may be no compatible requests within your radius, your location may be missing, or push notifications may be off on your device.',
        'ServeConnect can’t guarantee a match for any request — it helps people find willing donors faster, alongside hospitals and blood banks.',
      ] },
      { id: 'drives', title: 'Donation drives and pledges', body: [
        'Verified organizers can start donation drives with an itemised wishlist (for example 200 notebooks or 50 blankets). Pledge the quantity you can give; the counts update live for everyone.',
        'Coordinate drop-off with the organizer through the drive page. The organizer confirms when your items arrive.',
      ] },
    ],
  },
  {
    id: 'organizers', title: 'Organizers & verification', icon: <ShieldCheck />,
    articles: [
      { id: 'get-verified', title: 'How do I get verified?', body: [
        'Go to Settings → Verification and upload your NGO registration certificate (Trust deed, Society or Section 8 certificate, 12A/80G or NGO Darpan ID). Independent organizers can use a government photo ID; companies upload their incorporation or CSR registration. You can attach up to 5 files (PDF, JPG, PNG or WebP, 10 MB each).',
        'Most reviews finish within 2 working days. Documents are encrypted, seen only by our admin team, and deleted 90 days after a decision. If we can’t approve, we’ll tell you why so you can resubmit.',
      ] },
      { id: 'publish', title: 'Publishing an event', body: [
        'Only verified organizers can publish; until then you can save drafts. Write a clear title and description, set capacity, tag the skills you need (matching volunteers are notified), and mark outdoor events so volunteers get weather advisories.',
        'When the event is full, new sign-ups join the waitlist and are promoted automatically if someone cancels.',
      ] },
      { id: 'run-checkin', title: 'Running check-in on the day', body: [
        'Open your event → Manage → Check-in to show a QR code that refreshes every minute. Volunteers scan it with the app. For anyone who can’t scan, enter their personal check-in code, or mark them attended from the attendee list. Team leads can check in their own team.',
      ] },
      { id: 'after-event', title: 'After the event', body: [
        'Mark the event complete so attendees receive certificates. Upload photos to the event gallery — they appear on your profile. Attendees are invited to rate the event, and your average rating is shown on your profile.',
        'The Organizer Handbook covers all of this in detail.',
      ] },
    ],
  },
  {
    id: 'safety', title: 'Safety & privacy', icon: <ShieldHalf />,
    articles: [
      { id: 'minors', title: 'Volunteers under 18', body: [
        'You must be at least 13 to use ServeConnect. Volunteers under 18 need a parent or guardian to approve their account by email before joining in-person events. Until then they can browse and follow causes.',
        [
          'Direct messages are turned off for under-18 accounts — use the event team chat instead.',
          'Their email, phone number, date of birth and location are never shown on their profile, whatever their privacy settings.',
          'They don’t appear in people search or the directory, and can’t register as blood donors.',
        ],
        'Guardians can be changed or re-sent the request from Settings → Account.',
      ] },
      { id: 'report', title: 'Reporting a person, post or event', body: [
        'Use the ⋯ menu on any profile, post, comment, message, event or request and choose Report. Pick a reason and add details. Reports are confidential — the person isn’t told who reported them.',
        'Our moderators review every report. Safety and child-safety reports are looked at first. Depending on what we find, we may remove content, warn the person, suspend their account, cancel an event or close a request. You’ll get a notification when your report has been reviewed.',
        'If someone is in immediate danger, call 112 first.',
      ] },
      { id: 'block', title: 'Blocking someone', body: [
        'Open their profile, tap ⋯ and choose Block. They can no longer see your profile, follow you or message you, and their posts disappear from your feed. You stop following each other. They aren’t notified. Unblock the same way.',
      ] },
      { id: 'privacy-controls', title: 'Who can see my information?', body: [
        'In Settings → Privacy you choose who sees your email, phone, location, date of birth and verified hours: everyone, only your followers, or only you. Organizers of events you register for can see the details they need to coordinate with you.',
        'Your exact map pin is never shown — locations are blurred to about 1 km. Your blood group is never shown to anyone.',
      ] },
      { id: 'onsite', title: 'Staying safe at events', body: [
        'The organizer is responsible for on-site safety arrangements: briefing, protective equipment and first aid. Follow their instructions, don’t take on tasks you aren’t trained for, and report any safety concern from the event page.',
      ] },
    ],
  },
  {
    id: 'account', title: 'Account & security', icon: <KeyRound />,
    articles: [
      { id: '2fa', title: 'Turning on two-factor authentication', body: [
        'Go to Settings → Security → Set up two-factor authentication. Scan the QR code with an authenticator app (Google Authenticator, Microsoft Authenticator, Authy…), enter the 6-digit code, then save your 10 backup codes somewhere safe — each works once if you lose your phone.',
        'We strongly recommend two-factor authentication for organizer and company accounts.',
      ] },
      { id: 'sessions', title: 'Seeing where you’re signed in', body: [
        'Settings → Security lists every device signed in to your account with its IP address and last activity. Revoke any you don’t recognise, or sign out of all other sessions at once. We also email you when your account is signed in on a new device.',
        'Changing your password signs you out everywhere else automatically.',
      ] },
      { id: 'locked', title: 'I forgot my password or I’m locked out', body: [
        'Tap “Forgot password?” on the sign-in page and enter your email or phone number. We’ll send a 6-digit code to reset it. You can also sign in with a one-time code instead of a password.',
        'After 5 wrong passwords in a row, the account is locked for 15 minutes to protect it. Wait, or reset your password to unlock it straight away.',
      ] },
      { id: 'data', title: 'Downloading or deleting your data', body: [
        'Settings → Account → Download my data gives you a file with your profile, posts, registrations and hours, certificates, reviews, pledges, blood-donation responses and follows.',
        'Delete my account permanently removes your personal information and signs you out everywhere. Certificates already issued stay verifiable. This can’t be undone.',
      ] },
    ],
  },
];

const flatten = (blocks: Block[]) => blocks.map((b) => (Array.isArray(b) ? b.join(' ') : b)).join(' ');

function ArticleBody({ body }: { body: Block[] }) {
  return (
    <div className="space-y-2.5 text-[15px] leading-relaxed text-ink-soft">
      {body.map((b, i) => (Array.isArray(b) ? (
        <ul key={i} className="list-disc space-y-1 pl-5">{b.map((li) => <li key={li}>{li}</li>)}</ul>
      ) : <p key={i}>{b}</p>))}
    </div>
  );
}

export default function Help() {
  const { t } = useTranslation();
  const loc = useLocation();
  const [query, setQuery] = useState('');
  const [topic, setTopic] = useState<string>('all');
  const [open, setOpen] = useState<Set<string>>(() => new Set(loc.hash ? [loc.hash.slice(1)] : []));
  const dq = useDebounce(query.trim().toLowerCase(), 150);

  useEffect(() => {
    document.title = 'Help center · ServeConnect';
    if (loc.hash) document.getElementById(loc.hash.slice(1))?.scrollIntoView({ block: 'center' });
  }, [loc.hash]);

  const results = useMemo(() => {
    const words = dq.split(/\s+/).filter(Boolean);
    return TOPICS.filter((tp) => topic === 'all' || tp.id === topic || words.length > 0)
      .map((tp) => ({
        ...tp,
        articles: tp.articles.filter((a) => {
          if (!words.length) return true;
          const hay = `${a.title} ${flatten(a.body)} ${tp.title}`.toLowerCase();
          return words.every((w) => hay.includes(w));
        }),
      }))
      .filter((tp) => tp.articles.length > 0);
  }, [dq, topic]);
  const total = results.reduce((n, tp) => n + tp.articles.length, 0);
  const searching = dq.length > 0;

  const toggle = (id: string) => setOpen((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  return (
    <div>
      <PageHeader title={t('nav.help', 'Help center')} subtitle="Answers about events, check-in, certificates, blood requests, safety and your account." />

      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3.5 top-3.5 h-5 w-5 text-ink-faint" aria-hidden />
        <input className="input h-12 pl-11 text-base" type="search" placeholder="Search help — e.g. check-in code, certificate, waitlist" aria-label="Search help articles"
          value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      {!searching && (
        <div role="radiogroup" aria-label="Topics" className="-mx-4 mb-5 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          {[{ id: 'all', title: 'All topics' }, ...TOPICS].map((tp) => (
            <button key={tp.id} type="button" role="radio" aria-checked={topic === tp.id} onClick={() => setTopic(tp.id)}
              className={clsx('shrink-0 rounded-full border px-3 py-1.5 text-sm font-semibold transition', topic === tp.id ? 'border-brand-600 bg-brand-600 text-white' : 'border-paper-line bg-white text-ink-soft hover:text-ink')}>
              {tp.title}
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0 space-y-6">
          {searching && <p className="text-sm text-ink-soft" aria-live="polite">{total === 0 ? 'No articles match your search.' : `${total} ${total === 1 ? 'article' : 'articles'} found`}</p>}
          {total === 0 ? (
            <Card><EmptyState icon={<LifeBuoy />} title="We couldn't find that" body={<>Try different words, or email us at <a className="link" href={`mailto:${SUPPORT}`}>{SUPPORT}</a> and we’ll help.</>} /></Card>
          ) : results.map((tp) => (
            <section key={tp.id} aria-labelledby={`topic-${tp.id}`}>
              <h2 id={`topic-${tp.id}`} className="mb-2 flex items-center gap-2 text-lg font-bold">
                <span className="text-brand-600 [&>svg]:h-5 [&>svg]:w-5" aria-hidden>{tp.icon}</span>{tp.title}
              </h2>
              <ul className="card divide-y divide-paper-line">
                {tp.articles.map((a) => {
                  const isOpen = open.has(a.id) || (searching && total <= 3);
                  return (
                    <li key={a.id} id={a.id}>
                      <h3>
                        <button type="button" aria-expanded={isOpen} aria-controls={`${a.id}-body`} onClick={() => toggle(a.id)}
                          className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left font-semibold text-ink hover:bg-paper/60 sm:px-5">
                          {a.title}
                          <ChevronDown className={clsx('h-5 w-5 shrink-0 text-ink-faint transition', isOpen && 'rotate-180')} aria-hidden />
                        </button>
                      </h3>
                      <div id={`${a.id}-body`} hidden={!isOpen} className="px-4 pb-4 sm:px-5">
                        <ArticleBody body={a.body} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>

        <aside className="space-y-4">
          <Card>
            <BookOpen className="h-6 w-6 text-brand-600" aria-hidden />
            <h2 className="mt-2 text-base font-bold">Organizer Handbook</h2>
            <p className="mt-1 text-sm text-ink-soft">Verification, publishing, check-in, certificates, blood requests and volunteer safety in one PDF.</p>
            <a href={`${API_URL}/api/handbook.pdf`} target="_blank" rel="noopener noreferrer" className="link mt-2 inline-block text-sm font-semibold">Open the handbook (PDF)<span className="sr-only"> — opens in a new tab</span></a>
          </Card>
          <Card>
            <Mail className="h-6 w-6 text-brand-600" aria-hidden />
            <h2 className="mt-2 text-base font-bold">Still need help?</h2>
            <p className="mt-1 text-sm text-ink-soft">Email us and a person will reply, usually within one working day. For account issues, write from the email on your account.</p>
            <a href={`mailto:${SUPPORT}`} className="link mt-2 inline-block text-sm font-semibold">{SUPPORT}</a>
          </Card>
          <p className="px-1 text-sm text-ink-faint">
            Read our <Link to="/terms" className="link">Terms of Service</Link> and <Link to="/privacy" className="link">Privacy Policy</Link>.
          </p>
        </aside>
      </div>
    </div>
  );
}
