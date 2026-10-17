# ServeConnect — setup, integration and deployment guide

This guide covers four stages:

1. **Run it on your laptop.** About 15 minutes, and no accounts needed.
2. **Switch on the real services**: email, SMS, Google Sign-In, media storage and push notifications. All are free tiers.
3. **Deploy it publicly for free.**
4. **Ship the mobile app** (installable PWA, plus Play Store / App Store builds if you want them).

Every external service below has a free tier, and nothing needs a credit card except Twilio, which is optional.

---

## 0. What you need

| Thing | Needed for | Cost | Required? |
|---|---|---|---|
| Node.js 22 LTS (≥ 20) | running the app | free | ✅ |
| Git | getting and deploying the code | free | ✅ |
| PostgreSQL 14+ (local, Docker or Neon) | database | free | ✅ |
| VS Code | editing | free | recommended |
| Gmail account with an App Password, **or** a Brevo account | sending OTP and notification emails | free (Gmail ~500/day, Brevo 300/day) | ✅ in production |
| Google Cloud project (OAuth client ID) | "Sign in with Google" | free | optional |
| Cloudinary account | storing photos and documents in production | free (25 GB) | ✅ in production |
| Fast2SMS (India) or Twilio trial | SMS OTP to phone numbers | Fast2SMS has free credit; Twilio trial has credit | optional |
| Neon (or Supabase) account | hosted Postgres in production | free | ✅ in production |
| Render account | hosting the app | free | ✅ in production (or any Docker host) |
| OpenStreetMap / Open-Meteo | maps, geocoding, weather | free, no key | built in |
| Web Push (VAPID) | push notifications | free, keys auto-generated | built in |

---

## 1. Run it locally

### 1.1 Install prerequisites

**Windows**
1. Install **Node.js 22 LTS** from https://nodejs.org (tick "Add to PATH").
2. Install **Git** from https://git-scm.com.
3. Pick one database option:
   - **Docker Desktop** (https://www.docker.com/products/docker-desktop/) — easiest; or
   - **PostgreSQL 16** (https://www.postgresql.org/download/windows/) — remember the password you set for the `postgres` user; or
   - **Neon** cloud Postgres (https://neon.tech) — nothing to install (see 3.1).

**macOS**
```bash
brew install node@22 git
brew install --cask docker        # or: brew install postgresql@16 && brew services start postgresql@16
```

**Ubuntu/Debian**
```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs git postgresql
```

Check your versions: `node -v` should print v20 or newer, and `npm -v` should print 10 or newer.

### 1.2 Get the code and install dependencies

Unzip `serveconnect.zip`, open a terminal in the `serveconnect` folder, then run:

```bash
npm run install:all
```

This installs the root, `server/` and `client/` packages. It takes 1–3 minutes.

To keep the project in GitHub:
```bash
git init && git add . && git commit -m "ServeConnect v1.0"
# create an empty repo on github.com, then:
git remote add origin https://github.com/<you>/serveconnect.git && git push -u origin main
```
`.gitignore` already excludes `node_modules`, builds, uploads and every `.env` file.

### 1.3 Start the database

**Option A: Docker** (also starts Mailpit, an inbox that catches every email the app sends)
```bash
docker compose up -d
```
Postgres runs on `localhost:5432` (user `postgres`, password `postgres`, database `serveconnect`), and the Mailpit inbox is at http://localhost:8025.

**Option B: local PostgreSQL**
```bash
# macOS/Linux
createdb serveconnect
# Windows: open "SQL Shell (psql)", log in, then run:   CREATE DATABASE serveconnect;
```

**Option C: Neon.** Create a project and copy its connection string (see 3.1).

### 1.4 Configure

```bash
npm run setup
```
This creates `server/.env` from `server/.env.example` and generates every secret: JWT keys, AES-256 encryption key, blind-index key, QR secret and Web Push VAPID keys.

Open `server/.env` and check `DATABASE_URL`:
- Docker: leave the default `postgres://postgres:postgres@localhost:5432/serveconnect`.
- Local install: `postgres://postgres:<your password>@localhost:5432/serveconnect`.
- Neon: paste its URL and set `DATABASE_SSL=true`.

To make Mailpit catch emails (Docker option), also set:
```
SMTP_HOST=localhost
SMTP_PORT=1025
```
With no SMTP settings at all, emails and SMS are **printed in the server terminal**. That's fine for development.

### 1.5 Load demo data and run

```bash
npm run db:seed      # creates tables (migrations run automatically) + Chennai demo data
npm run dev          # starts the API on :4000 and the web app on :5173
```

Open **http://localhost:5173**.

Every demo account uses the password **`Password@123`**:

| Email | Role | Use it to try |
|---|---|---|
| `admin@serveconnect.app` | Administrator | Admin console: verification queue, reports, users, broadcast, audit log |
| `hello@greencoast.example` | Verified NGO | Create and manage events, QR check-in console, teams, gallery, dashboard |
| `team@akshara.example` | Verified NGO | Donation drive with wishlist, education events |
| `care@lifeline.example` | Verified NGO | Blood requests (O- critical, B+) |
| `karthik@example.com` | Organizer, verification pending | Shows the publishing restriction and the admin approval flow |
| `csr@nimbus.example` | CSR company (invite code `NIMBUS24`) | Employee roster, bulk registration, impact report |
| `priya@example.com` | Volunteer, nurse, O- blood donor | Feed, registrations, certificates, blood requests nearby, leaderboard |
| `arjun@example.com` | Volunteer, Nimbus employee | Company leaderboard, tutoring history |
| `kavya@example.com` | Volunteer aged 17 | Guardian-consent gate, DMs disabled |

**OTP codes in development.** While `NODE_ENV` is not `production`, the sign-up, sign-in and reset screens show the code in a yellow "Development mode" box, and the server terminal prints it too. This is switched off automatically in production.

To wipe everything and reseed (development only): `npm run db:reset`.

### 1.6 Demo walkthrough

1. **Sign-up with OTP.** Register a new volunteer, enter the code, then complete the onboarding wizard.
2. **2FA.** Go to Settings → Security → Two-factor. Scan the QR code with Google Authenticator or Microsoft Authenticator, save the backup codes, sign out, and sign back in.
3. **Organizer flow.** As `hello@greencoast.example`, open Create → Create an event. Mark it Outdoor, set capacity 1, then Publish.
4. **Waitlist.** Register as Priya, then as Arjun (he's waitlisted). Cancel as Priya, and Arjun is promoted automatically with a notification.
5. **Check-in.** Make an event that starts within the next hour. Open Manage → Check-in console as the organizer; the QR refreshes every minute. On a phone signed in as the volunteer, open **Check in** and scan it, or use the event code or the volunteer's personal code.
6. **Certificates.** As the organizer choose Manage → Complete event. The volunteer gets a PDF certificate under Certificates; its QR code opens the public verification page.
7. **Blood.** As `care@lifeline.example`, request O- blood. Priya (O-, opted in, nearby) gets a high-priority alert and can pledge to donate.
8. **Wishlist.** Open Akshara's school-supplies drive in two browsers and pledge in one; the other updates live.
9. **Moderation.** Report a post as anyone. As admin, resolve it in Admin → Reports, and approve Karthik in Admin → Verifications.
10. **Teams and chat.** In Manage → Teams, choose Auto-assign, then Open team chat. Messages arrive in real time.

### 1.7 Automated checks

```bash
npm run typecheck                       # strict TypeScript, both projects
npm run db:reset && npm run dev         # in one terminal
npm run test:smoke                      # in another: 32 end-to-end API scenarios
```

---

## 2. Switch on the real services

Edit `server/.env` and restart `npm run dev` after each change.

### 2.1 Email (OTP, alerts, guardian consent)

**Gmail (simplest)**
1. Turn on 2-Step Verification for your Google account at https://myaccount.google.com/security.
2. Create an **App Password** at https://myaccount.google.com/apppasswords (name it "ServeConnect"). You get 16 characters.
3. Add to `.env`:
   ```
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=465
   SMTP_SECURE=true
   SMTP_USER=yourname@gmail.com
   SMTP_PASS=abcdefghijklmnop
   MAIL_FROM=ServeConnect <yourname@gmail.com>
   ```

**Brevo (better for production deliverability, 300 emails/day free)**
1. Sign up at https://www.brevo.com. Go to Senders, domains & dedicated IPs and verify your sender email.
2. Go to SMTP & API → SMTP and generate an SMTP key.
3. Add:
   ```
   SMTP_HOST=smtp-relay.brevo.com
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER=<your Brevo login>
   SMTP_PASS=<SMTP key>
   MAIL_FROM=ServeConnect <verified-sender@yourdomain>
   ```

### 2.2 "Sign in with Google"

1. Go to https://console.cloud.google.com, create a project called "ServeConnect", then open **APIs & Services → OAuth consent screen**.
   - Choose External, enter the app name, support email and developer email, and save.
   - Under **Audience/Test users**, add your Gmail (or press **Publish app** so anyone can sign in).
2. Go to **Credentials → Create credentials → OAuth client ID → Web application**.
   - **Authorized JavaScript origins:** `http://localhost:5173`, `http://localhost:4000`, and later your production URL, for example `https://serveconnect.onrender.com`.
   - No redirect URIs are needed, because the app uses the Google Identity Services popup.
3. Copy the **Client ID** (ending `.apps.googleusercontent.com`) into `GOOGLE_CLIENT_ID=`.

The "Sign in with Google" button now appears on the sign-in and sign-up pages, and in Settings → Account (link/unlink).

### 2.3 SMS OTP (phone sign-up and sign-in)

- **Fast2SMS** (India, easiest): sign up at https://www.fast2sms.com and copy the API key from the Dev API page. Then set:
  ```
  SMS_PROVIDER=fast2sms
  FAST2SMS_API_KEY=...
  ```
  Bulk or transactional routes need DLT registration under TRAI rules. The "quick" route works for testing.
- **Twilio** (international): the trial account can only text numbers you've verified. Set:
  ```
  SMS_PROVIDER=twilio
  TWILIO_ACCOUNT_SID=...
  TWILIO_AUTH_TOKEN=...
  TWILIO_FROM=+1xxxxxxxxxx
  ```
- Leave `SMS_PROVIDER=console` to keep printing SMS codes in the terminal.

### 2.4 Media storage: Cloudinary (required in production)

1. Sign up at https://cloudinary.com (free plan).
2. On the Dashboard, copy the **API Environment variable** (`cloudinary://<key>:<secret>@<cloud_name>`).
3. Set:
   ```
   STORAGE_DRIVER=cloudinary
   CLOUDINARY_URL=cloudinary://...
   ```

Photos (avatars, posts, galleries, chat) become public CDN URLs. Verification documents are AES-256-encrypted before upload, so even Cloudinary only ever sees ciphertext.

### 2.5 Push notifications

Push already works: `npm run setup` generated VAPID keys. Set `VAPID_SUBJECT=mailto:<your email>`.

- Users switch push on in **Settings → Notifications → Push on this device**.
- Push needs HTTPS (localhost is exempt). On iPhone it works only after **Share → Add to Home Screen** (iOS 16.4+).
- **Don't change the VAPID keys after launch**, or every existing subscription stops working.

### 2.6 Virus scanning (optional)

```bash
docker compose --profile clamav up -d     # needs ~1.5 GB RAM
```
Then set `CLAMAV_HOST=localhost`. Every upload is streamed to ClamAV, and infected files are rejected. Without it, uploads are still checked by their real file signature (magic bytes) and size.

### 2.7 Maps, geocoding and weather

There's nothing to set up. The app uses OpenStreetMap tiles, Nominatim geocoding (cached in the database and limited to 1 request per second per their policy) and Open-Meteo forecasts. For heavy production traffic you can point `NOMINATIM_URL` at a self-hosted or commercial Nominatim.

---

## 3. Deploy for free

The recommended setup is **Neon (database) + Cloudinary (media) + Render (app)**. You get one URL that serves both the API and the web app, with HTTPS included.

### 3.1 Database on Neon
1. Go to https://neon.tech, sign in with GitHub and create a project (region: **AWS Asia Pacific (Singapore)** is closest to India).
2. Copy the **connection string** (`postgresql://...neon.tech/neondb?sslmode=require`).
3. You don't need to run anything: the server runs migrations automatically on startup.

### 3.2 Media on Cloudinary
Follow 2.4 and keep the `CLOUDINARY_URL`.

### 3.3 App on Render
1. Push the code to GitHub (see 1.2).
2. Go to https://render.com → **New → Blueprint** and pick your repo. Render reads `render.yaml`.
3. Fill in the variables it asks for:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Neon connection string |
| `APP_URL`, `PUBLIC_API_URL`, `CORS_ORIGINS` | your Render URL, e.g. `https://serveconnect.onrender.com` (you can set these after the first deploy, then redeploy) |
| `ENCRYPTION_KEY`, `BLIND_INDEX_KEY` | copy from your local `server/.env`, or generate fresh ones with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | copy from your local `server/.env` |
| `CLOUDINARY_URL` | from 3.2 |
| `SMTP_*`, `MAIL_FROM` | from 2.1 |
| `GOOGLE_CLIENT_ID` | from 2.2 (then add the Render URL to the Authorized JavaScript origins) |

4. Click **Apply**. The first build takes about 5 minutes. Open `https://<your-app>.onrender.com/api/health`; it should return `{"status":"ok"}`.
5. **Create your admin account.** Sign up in the live app with your email. Then, on your laptop, from the project folder, run the promotion script against the production database:
   ```bash
   # macOS / Linux
   DATABASE_URL="<your Neon URL>" DATABASE_SSL=true npm run make-admin -- you@example.com
   # Windows PowerShell
   $env:DATABASE_URL="<your Neon URL>"; $env:DATABASE_SSL="true"; npm run make-admin -- you@example.com
   ```
   This uses your local `server/.env` for everything except the database. On paid Render plans you can run `cd server && npm run make-admin:prod -- you@example.com` in the service **Shell** instead.
6. **Do not run the seed in production.** Demo accounts would be public.

**About Render's free plan:** the service sleeps after 15 minutes without traffic, takes about 50 seconds to wake, and background jobs (reminders, no-shows, certificates) pause while it sleeps. To keep it awake, create a free monitor at https://cron-job.org or https://uptimerobot.com that calls `https://<your-app>.onrender.com/api/health` every 10 minutes. Upgrading to a paid instance removes the limit.

**Manual Render setup** (if you'd rather not use the blueprint): create a New → Web Service with Node and these settings:
- Build: `npm --prefix server ci --include=dev && npm --prefix client ci --include=dev && npm --prefix client run build && npm --prefix server run build`
- Start: `npm --prefix server start`
- Health check path: `/api/health`
- Add the same environment variables plus `NODE_ENV=production`, `DATABASE_SSL=true`, `COOKIE_SECURE=true`, `STORAGE_DRIVER=cloudinary`, and fresh values for `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` and `QR_SECRET`.

### 3.4 Custom domain (optional)
In Render, go to Settings → Custom Domains and add `serveconnect.in` (or a free subdomain). Create the DNS records it shows. Then update `APP_URL`, `PUBLIC_API_URL` and `CORS_ORIGINS` and your Google OAuth origins, and redeploy.

### 3.5 Other hosts
The included `Dockerfile` builds one production image, so any Docker host works: Railway, Fly.io, Koyeb, Google Cloud Run, or a ₹400/month VPS.
```bash
docker build -t serveconnect .
docker run -p 4000:4000 --env-file server/.env -e NODE_ENV=production serveconnect
```
On a VPS, put Caddy or Nginx in front for HTTPS, and keep `STORAGE_DRIVER=local` only if the `server/uploads` volume is persistent and backed up.

To try the full production stack locally: `docker compose --profile app up --build` then open http://localhost:4000.

### 3.6 Web app and API on different domains (optional)
If you host the web app separately (Vercel or Netlify) from the API:
- Build the client with `VITE_API_URL=https://api.yourdomain.com`.
- On the server set:
  - `CORS_ORIGINS=https://app.yourdomain.com`
  - `COOKIE_SAMESITE=none`
  - `COOKIE_SECURE=true`
  - `APP_URL=https://app.yourdomain.com`
  - `SERVE_CLIENT=false`
- Add an SPA rewrite on the static host (all paths → `/index.html`).

---

## 4. Mobile apps

### 4.1 Installable app (PWA): already done
On Android Chrome, open the site and tap **Install app**. On iPhone Safari, tap **Share → Add to Home Screen**. You get a full-screen app with an icon, push notifications, camera QR scanning and an offline shell.

### 4.2 Play Store / App Store (optional)
**Easiest: PWABuilder.** Go to https://www.pwabuilder.com, enter your live URL and choose **Package for stores**. For Android it creates a Trusted Web Activity `.aab` you can upload to Google Play Console (one-time $25 developer fee).

**Capacitor** (native shell, more control):
```bash
cd client
npm i @capacitor/core @capacitor/cli @capacitor/android @capacitor/ios
# edit capacitor.config.json → server.url = https://<your live domain>
npm run build
npx cap add android          # needs Android Studio
npx cap open android         # build/sign the APK/AAB from Android Studio
npx cap add ios && npx cap open ios   # needs a Mac with Xcode
```
Because `capacitor.config.json` loads your live site, the native app always shows the latest version and sign-in cookies keep working. If you use Google Sign-In inside the native shell, add the domain to the OAuth origins.

---

## 5. Production checklist

- [ ] `NODE_ENV=production`. This forces development OTP codes off and enables secure cookies.
- [ ] **Back up `ENCRYPTION_KEY` and `BLIND_INDEX_KEY` somewhere safe, and never change them.** Changing them makes blood groups, phone numbers, 2FA secrets and verification documents unreadable.
- [ ] Every secret is unique and lives only in the host's environment settings, never in Git.
- [ ] SMTP configured, with a test sign-up OTP received.
- [ ] `STORAGE_DRIVER=cloudinary`.
- [ ] `APP_URL` is the real HTTPS URL. QR codes, email links and certificate verification links use it.
- [ ] An admin account was created with `make-admin` and has 2FA turned on (Settings → Security).
- [ ] Database backups: Neon keeps point-in-time history on free projects; use `pg_dump` for extra safety.
- [ ] Have the Terms and Privacy pages (`client/src/pages/static/`) reviewed by a lawyer. Fill in the grievance officer and contact details required by the DPDP Act 2023 and IT Rules 2021.
- [ ] Set `DOC_RETENTION_DAYS` to your retention policy (SRS TBD-3). Admins can also purge from the admin console.
- [ ] Tune the default donor and notification radius (SRS TBD-2) in `server/src/db/migrations` defaults or via user settings.
- [ ] Optional: run ClamAV for upload scanning.
- [ ] Keep-alive monitor if you're on Render's free plan.

---

## 6. Troubleshooting

| Symptom | Fix |
|---|---|
| `Missing required environment variable JWT_ACCESS_SECRET` | Run `npm run setup`. If `.env` already existed, copy the missing keys from `.env.example`, then rerun setup or generate them. |
| `ECONNREFUSED 127.0.0.1:5432` | Postgres isn't running. Run `docker compose up -d`, or start the PostgreSQL service. |
| `password authentication failed for user "postgres"` | Fix the password in `DATABASE_URL`. |
| `database "serveconnect" does not exist` | Run `createdb serveconnect`, or `CREATE DATABASE serveconnect;` in psql. |
| `self-signed certificate` / SSL errors with Neon | Set `DATABASE_SSL=true`. |
| Port 4000 or 5173 in use | Change `PORT` in `server/.env` (and the proxy target in `client/vite.config.ts`), or close the other app. |
| Didn't receive an email | Check the server terminal for `[mail]` errors. With Gmail you must use an App Password, not your normal password. Check spam. |
| Google button doesn't appear | `GOOGLE_CLIENT_ID` isn't set, or the current URL isn't listed under Authorized JavaScript origins. |
| "Camera permission was denied" when scanning | Allow camera access for the site. The camera needs HTTPS (or localhost). Volunteers can always use the event code or their personal code instead. |
| Push "not supported" on iPhone | Add the app to the Home Screen first (iOS 16.4+). |
| Uploaded images disappear after a redeploy | You're on `STORAGE_DRIVER=local` on an ephemeral host. Switch to Cloudinary. |
| Signed out every page refresh in production | You're on different domains without `COOKIE_SAMESITE=none` + `COOKIE_SECURE=true`, or the site isn't on HTTPS. |
| Map tiles don't load | Your network is blocking `tile.openstreetmap.org`. Try another network. |
| Weather card missing | It only appears for **outdoor** events within 5 days of the start date. |

---

## 7. Command reference (run from the project root)

| Command | What it does |
|---|---|
| `npm run install:all` | Install all dependencies |
| `npm run setup` | Create `server/.env` with fresh secrets |
| `npm run dev` | API (:4000) + web app with hot reload (:5173) |
| `npm run db:migrate` | Apply database migrations (also runs automatically at startup) |
| `npm run db:seed` | Load demo data, only if the database is empty |
| `npm run db:reset` | Wipe **all data** and reseed (development only) |
| `npm run make-admin -- <email>` | Promote an existing account to admin |
| `npm run typecheck` | Type-check server and client |
| `npm run test:smoke` | End-to-end API test (needs a running, freshly seeded dev server) |
| `npm run build` | Production build of the client and server |
| `npm start` | Run the production server (serves the web app too) on `PORT` |

API reference: [docs/API.md](docs/API.md).
