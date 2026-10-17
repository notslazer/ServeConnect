# ServeConnect

**A unified NGO and volunteer engagement platform.** Think LinkedIn + Teams + Instagram for community service: NGOs and organizers get verified profiles, publish drives and donation needs, and manage volunteers end to end. Volunteers discover causes, check in with a QR code and build a verified record of their service hours.

Built for the BCSE301P Software Engineering project (SRS v1.0, 24BCE1515 / 24BCE1610 / 24BCE5239). All four increments are implemented, and everything runs on free tools and free tiers.

> **New here? Follow [SETUP.md](SETUP.md).** It walks you from an empty laptop to a running app in about 15 minutes, then to a free public deployment.

---

## What's inside

| Area | Highlights |
|---|---|
| **Accounts & security** | Email or phone sign-up with OTP verification · passwordless OTP sign-in (email/SMS) · Google Sign-In with account linking · TOTP two-factor auth with 10 one-time backup codes · forgot/reset password · change email/phone (OTP-confirmed) · account lockout after 5 failed attempts · rotating refresh tokens with reuse detection · idle-timeout sessions · list and revoke active sessions · new-device sign-in alerts · data export · account deletion |
| **Minor safety** | Date of birth at sign-up · under-13s blocked · under-18s need parent/guardian consent by email link before joining in-person events · minors' contact details and location are never shown · DMs disabled for minors · hidden from people search |
| **Profiles & social** | Organizer and volunteer profiles · verification badge · skills and interests · per-field privacy (public, followers, private) · follow/unfollow · block · home feed of followed profiles · posts with up to 6 photos, likes, threaded comments, bookmarks, polls and hashtags · trending tags · explore · suggestions |
| **Events** | Drafts and publishing (verified organizers only) · capacity with automatic waitlist promotion · live countdown · reminders (configurable, default 24h and 1h) · weather advisories for outdoor events within 5 days (Open-Meteo) · edits notify registrants · cancellation · map with directions · `.ics` calendar export · min-age rule · safety disclaimer and safety reporting |
| **Coordination** | Filter attendees by skill · teams with lead, roles and a group chat each · auto-form teams by skill · rotating QR check-in (changes every 60 s) · event code and personal check-in code fallbacks · duplicate check-in rejected · no-show tracking (organizer-only metric) · CSV export · automatic PDF certificates with a QR verification link · public certificate verification page |
| **Requests & donations** | Blood requests matched to opted-in, compatible donors in range (full ABO/Rh compatibility, Bombay phenotype) · rare-group priority alerts · 90-day donation interval · contact shared only after consent · extend, close or re-broadcast prompts after the deadline · itemised resource wishlists with live pledge counts (WebSocket) · delivery confirmation |
| **Trust** | Verification documents encrypted with AES-256-GCM and readable only by admins (every view audited, auto-purged after retention) · reviews only from verified attendees, one each · organizer rating · event Q&A discussion boards · polls · reports on any content type |
| **Engagement** | Notifications in-app, by Web Push and by email, with per-category and per-channel preferences · personalised matches by skill, interest and radius · monthly streaks · 19 milestone badges · leaderboards (month or all-time; everyone, following, nearby or company) with opt-out |
| **Organizations** | Organizer analytics dashboard · CSR company accounts: invite code, employee roster, bulk event registration, impact report with CSV export |
| **Admin console** | Platform stats · verification review queue (approve or reject with a reason) · report moderation (dismiss, remove content, warn, suspend, cancel event, close request) · user management (suspend, role, badge, revoke sessions) · broadcast announcements · audit log |
| **App experience** | Installable PWA (works like an app on Android/iOS) · Web Push · camera QR scanner · offline app shell · responsive from 360 px phones to desktop · onboarding wizard and walkthrough · searchable help center · Organizer Handbook PDF · Terms and Privacy pages (DPDP Act 2023) · externalised strings (i18next) for future languages |

## Architecture

```
┌──────────────── client/ (React 18 + Vite + Tailwind, PWA) ─────────────────┐
│ pages · components · React Query · Socket.IO client · Leaflet · html5-qrcode │
└───────────────▲──────────────────────── HTTPS (REST JSON) + WebSocket ──────┘
                │
┌───────────────┴──────────── server/ (Node 20+ · Express 5 · TypeScript) ─────┐
│ modules/ auth · users · posts · events · teams · chat · requests ·            │
│          notifications · certificates · engagement · verification ·          │
│          reports · admin · csr · misc                                         │
│ lib/  crypto (AES-GCM, blind index) · otp · mailer · sms · storage · upload  │
│       (magic-byte check + optional ClamAV) · geo · weather · push · pdf ·    │
│       socket · notify                                                         │
│ jobs/ reminders · no-shows · auto-complete · certificates · weather ·        │
│       deadline prompts · housekeeping (advisory-locked, multi-instance safe) │
└───────▲──────────────────────▲────────────────────▲──────────────────────────┘
        │                      │                    │
   PostgreSQL           Cloudinary / disk     Free external services:
   (structured data)    (media, encrypted     OpenStreetMap (maps, geocoding),
                        documents)            Open-Meteo (weather), Web Push (VAPID),
                                              SMTP (Gmail/Brevo), SMS (Twilio/Fast2SMS)
```

- **One deployable service.** The API also serves the built web app, so there's one URL, no CORS trouble and one free host.
- **Stateless API.** State lives in Postgres, and background jobs take Postgres advisory locks, so you can run several instances behind a load balancer.
- **Sensitive data is encrypted at rest.** This covers blood group, phone, 2FA secrets and verification documents. Encrypted values that need lookups (phone, blood group, OTP targets) use HMAC blind indexes.

## Repository layout

```
serveconnect/
├── README.md                ← you are here
├── SETUP.md                 ← step-by-step install, configuration and deployment
├── docs/API.md              ← all 186 REST endpoints
├── package.json             ← root scripts (dev, build, start, db:*)
├── docker-compose.yml       ← Postgres + Mailpit (+ optional ClamAV / full app)
├── Dockerfile               ← production image (API + web app)
├── render.yaml              ← one-click Render blueprint
├── server/
│   ├── .env.example         ← every setting, documented
│   ├── scripts/             ← setup-env.js (generates secrets), smoke-test.mjs (32 end-to-end checks)
│   └── src/
│       ├── index.ts, app.ts
│       ├── config/env.ts
│       ├── db/              ← pool, migrate runner, migrations/001_init.sql, seed.ts (demo data)
│       ├── lib/             ← crypto, otp, mailer, sms, storage, upload, geo, weather, push, pdf, socket, notify
│       ├── middleware/      ← auth, rate limits, errors
│       ├── modules/         ← one folder per feature group (SRS §4)
│       ├── jobs/scheduler.ts
│       └── templates/emails.ts
└── client/
    ├── public/              ← manifest, service worker, icons
    ├── capacitor.config.json← optional native Android/iOS wrapper
    └── src/
        ├── App.tsx          ← routes
        ├── components/      ← design system (ui.tsx) + shared widgets
        ├── lib/             ← api client, auth, socket, push, hooks, types
        ├── i18n/            ← externalised strings
        └── pages/           ← auth, feed, events, requests, messages, profile, settings, admin, …
```

## SRS traceability

| Requirement | Where it lives |
|---|---|
| REQ-PROF-1 registration (email/phone + password or OTP) | `server/src/modules/auth/routes.ts` · `client/src/pages/auth/*` |
| REQ-PROF-2 verification + badge | `modules/verification`, `modules/admin` (queue) · `pages/settings/VerificationSettings.tsx`, `pages/admin/AdminVerifications.tsx` |
| REQ-PROF-3 skills, verified hours, history | `modules/users` (`/:id/events`, stats) · `pages/Profile.tsx` |
| REQ-PROF-4 follow + counts | `modules/users` follow routes · `components/FollowButton.tsx` |
| REQ-PROF-5 home feed | `modules/posts` `/feed` · `pages/Feed.tsx` |
| REQ-PROF-6 edit profile + per-field visibility | `modules/users` `/me`, `/me/privacy` · `pages/settings/*` |
| REQ-EVT-1 create/publish/draft | `modules/events` · `pages/events/EventForm.tsx` |
| REQ-EVT-2 registration + automatic waitlist | `events/routes.ts` register, `service.ts` `promoteWaitlist` |
| REQ-EVT-3 countdown + reminders | `components/Countdown.tsx` · `jobs/scheduler.ts` `sendReminders` |
| REQ-EVT-4 weather advisory | `lib/weather.ts`, `events/service.ts` `refreshWeather`, weather job |
| REQ-EVT-5 no-shows (organizer-only) | `jobs/scheduler.ts` `markNoShows` · `users/serialize.ts` privacy rule |
| REQ-EVT-6 gallery after completion | `events/routes.ts` gallery routes · `components/EventsDetailTabs.tsx` |
| REQ-COORD-1 filter by skill | `GET /events/:id/attendees?skill=` · `pages/events/EventManage.tsx` |
| REQ-COORD-2 teams, lead, group chat | `modules/teams`, `modules/chat` · `pages/Messages.tsx` |
| REQ-COORD-3 unique QR per event in active window | `events/service.ts` rotating HMAC tokens · `pages/events/CheckIn.tsx` |
| REQ-COORD-4 manual check-in code fallback | `POST /events/:id/checkin/manual` |
| REQ-COORD-5 PDF certificate within 24 h | `lib/pdf.ts`, `issueCertificates`, certificate job |
| REQ-REQ-1/2 blood requests, radius + rare priority | `modules/requests` (blood) · `lib/blood.ts` |
| REQ-REQ-3/4 itemised wishlist, live pledges | `modules/requests` (resources) + Socket.IO `wishlist:update` |
| REQ-REQ-5 fulfil/close stops notifications | `/status` actions; dedupe keys in `lib/notify.ts` |
| REQ-TRUST-1 admin review queue | `modules/admin` |
| REQ-TRUST-2/3 verified-attendee reviews, organizer rating | `events/routes.ts` reviews · `profileStats` |
| REQ-TRUST-4 discussion board + polls | `events/routes.ts` discussions/polls, `posts/routes.ts` polls |
| REQ-TRUST-5 reports + outcomes | `modules/reports`, `admin/routes.ts` resolve |
| REQ-ENG-1 notification preferences by category and channel | `users/routes.ts` `/me/notifications`, `lib/notify.ts` |
| REQ-ENG-2 personalised matching | `events/service.ts` `onEventPublished`, blood matching |
| REQ-ENG-3 streaks and milestones | `modules/gamification/service.ts` |
| REQ-ENG-4/5 leaderboards + opt-out | `gamification` `/leaderboard`, `/me/leaderboard` |
| §5.2 Safety (minors, disclaimer, safety reports) | auth guardian flow, `requireAuth`, `ReportDialog` 'safety' |
| §5.3 Security (2FA, RBAC, encryption, upload scanning, sessions) | `auth`, `middleware/auth.ts`, `lib/crypto.ts`, `lib/upload.ts` |
| §5.5 Business rules | `assertVerified`, single check-in, certificate rule, blood visibility, suspension write-block |
| §6.2 Externalised strings | `client/src/i18n`, `server/src/templates/emails.ts` |
| §6.3 Terms, Privacy, disclaimer | `pages/static/Terms.tsx`, `Privacy.tsx`, landing footer |

## Quality checks

- `npm run typecheck`: both projects compile under strict TypeScript.
- `npm run test:smoke`: 32 end-to-end API scenarios run against a seeded dev server, covering auth, 2FA, waitlist, QR, certificates, blood matching, pledges, moderation, CSR and deletion.

## License

Built as an academic project. Choose a license (MIT is common) before you publish the code.
