# Deploying ServeConnect with Vercel

Vercel hosts the **web app** (the React front end). The **API** cannot run on Vercel: it keeps WebSocket
connections open, runs scheduled jobs every minute and needs a long-running server, which Vercel's
serverless functions do not provide. So the setup is:

| Part | Where | Cost |
|---|---|---|
| Web app (client/) | Vercel | free |
| API (server/) | Render web service | free |
| Database | Neon PostgreSQL | free |
| Photos and documents | Cloudinary | free |

Vercel forwards every `/api`, `/socket.io` and `/uploads` request to Render, so the browser only ever talks
to your Vercel address and login cookies just work.

## 1. Put the code on GitHub
```
cd ~/Projects/serveconnect
git init && git add . && git commit -m "ServeConnect"
# create an empty repository on github.com, then:
git remote add origin https://github.com/<you>/serveconnect.git
git branch -M main && git push -u origin main
```
`.gitignore` already keeps `node_modules` and `server/.env` out of GitHub.

## 2. Database on Neon
1. Sign in at https://neon.tech and create a project (region: AWS Singapore).
2. Copy the connection string (`postgresql://...neon.tech/neondb?sslmode=require`).

## 3. Media on Cloudinary
1. Sign up at https://cloudinary.com.
2. Copy the **API environment variable** (`cloudinary://<key>:<secret>@<cloud>`).

## 4. API on Render
1. Sign in at https://render.com with GitHub. **New -> Blueprint** -> pick the repository. Render reads `render.yaml`.
2. Fill in the variables it asks for:
   - `DATABASE_URL` = Neon string from step 2
   - `ENCRYPTION_KEY`, `BLIND_INDEX_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` = copy from your local `server/.env`
   - `CLOUDINARY_URL` = from step 3
   - `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` = Gmail app password or Brevo (see SETUP.md 2.1)
   - `APP_URL`, `PUBLIC_API_URL`, `CORS_ORIGINS` = leave blank for now
3. Deploy. Note the address, e.g. `https://serveconnect.onrender.com`. Check `https://serveconnect.onrender.com/api/health` shows `{"status":"ok"}`.

## 5. Web app on Vercel
1. Open `client/vercel.json` and replace all three `YOUR-BACKEND.onrender.com` with your Render address. Commit and push.
2. Sign in at https://vercel.com with GitHub. **Add New -> Project** -> import the repository.
3. Set **Root Directory** to `client`. Framework: Vite (detected). Leave environment variables empty.
4. Deploy. Note your address, e.g. `https://serveconnect.vercel.app`.

## 6. Connect the two
In Render -> your service -> **Environment**, set:
```
APP_URL=https://serveconnect.vercel.app
PUBLIC_API_URL=https://serveconnect.vercel.app
CORS_ORIGINS=https://serveconnect.vercel.app
```
Save (Render redeploys). Open your Vercel address and sign up.

## 7. Demo data and an admin
From your laptop, pointing at the Neon database:
```
cd ~/Projects/serveconnect
DATABASE_URL="<Neon string>" DATABASE_SSL=true npm run db:seed              # optional demo accounts
DATABASE_URL="<Neon string>" DATABASE_SSL=true npm run make-admin -- you@example.com
```

## Things to know
- Render's free service sleeps after 15 minutes without traffic; the first request after that takes up to a minute.
- Live updates use Socket.IO long-polling through Vercel (Vercel does not proxy WebSockets). They still work, slightly slower.
- Never change `ENCRYPTION_KEY` after launch, or stored phone numbers, blood groups and documents can no longer be read.
