# Self-hosting Outbox

About 20 minutes, once. Everything runs on free tiers: **Supabase** (database, auth, file storage) and **Cloudflare
Workers** (the app and its background job). You also need a free **Gemini API key**, but each user adds their own inside
the app.

You will end up with a private link like `https://outbox.<you>.workers.dev`. Anyone you share it with can sign up and use
their own account, data and keys.

## 1. Supabase (database and sign-in)

1. Create a free project at [supabase.com](https://supabase.com).
2. **SQL Editor** → paste all of [`supabase/schema.sql`](../supabase/schema.sql) → **Run**. Safe to run again later.
3. **Authentication → Providers**: leave **Email** on. For a private instance with a few people, turn **off** "Confirm
   email" so sign-up is instant. (Supabase's built-in mailer is heavily rate-limited; use your own SMTP under
   Authentication → SMTP if you want confirmation emails or magic links for many people.)
4. **Authentication → URL Configuration**: set **Site URL** to your final app URL (you get it in step 3; come back and
   set it, and add `<your URL>/login` under Redirect URLs).
5. **Project Settings → API**, copy:
   - Project URL → `SUPABASE_URL`
   - `anon` public key → `SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_KEY` (**secret**: it bypasses row-level security; never put it in the browser)
   - Optional: JWT secret → `SUPABASE_JWT_SECRET`. For projects that sign tokens with the legacy HS256 secret this makes
     token checks local and instant. Leave it unset otherwise; the app then validates tokens against Supabase Auth.

## 2. Generate your secrets

```bash
git clone https://github.com/<you>/outbox && cd outbox
npm install
npm run secrets
```

It prints `APP_SECRET` and `CRON_SECRET`, plus optional push-notification keys. Nothing is stored or sent anywhere. Keep
the output; you paste it into Cloudflare next.

`APP_SECRET` encrypts users' Gemini keys and Gmail tokens. **If you lose or change it, saved keys become unreadable** and
users must re-enter them.

## 3. Cloudflare (hosting and background job)

1. Push your fork to GitHub.
2. [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages → Create → Import a repository** → pick the fork.
3. Build settings:
   - Build command: `npx opennextjs-cloudflare build`
   - Deploy command: `npx wrangler deploy`
4. **Settings → Variables and Secrets**, add (as secrets unless noted):

   | Name | Value |
   |---|---|
   | `SUPABASE_URL` | from step 1 (plain variable is fine) |
   | `SUPABASE_ANON_KEY` | from step 1 (plain variable is fine) |
   | `SUPABASE_SERVICE_KEY` | from step 1 |
   | `APP_SECRET` | from step 2 |
   | `CRON_SECRET` | from step 2 |
   | `APP_URL` | your Worker URL, e.g. `https://outbox.you.workers.dev` (no trailing slash) |

5. Deploy, then fix the **Site URL** in Supabase (step 1.4) now that you know it.
6. Open the link, **sign up**, and the first-run flow takes you through: add your Gemini key → import your CV → pick a tone.

The `*/5 * * * *` cron in [`wrangler.jsonc`](../wrangler.jsonc) is already configured. It drafts queued leads, sends emails
users scheduled, and every 15 minutes checks replies and drafts follow-ups.

## 4. Optional extras

### Gmail (send from your own mailbox, track replies)

Without this, drafts have an **Open in Gmail** button and you press send yourself. To enable one-tap sending:

1. [console.cloud.google.com](https://console.cloud.google.com) → new project → **APIs & Services → Library → Gmail API → Enable**.
2. **OAuth consent screen**: User type *External*. Add scopes `…/auth/gmail.send` and `…/auth/gmail.readonly`.
   Add yourself and your users as **test users**. In *Testing* mode Google expires refresh tokens after 7 days, so users
   must reconnect weekly; publishing the app (still unverified) removes that but shows an "unverified app" screen and caps
   users. See [PRODUCT.md](PRODUCT.md) for why a large public deployment needs Google's verification.
3. **Credentials → Create OAuth client ID → Web application**. Authorised redirect URI:
   `https://<your-app>/api/google/callback`.
4. Add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to Cloudflare and redeploy.
5. Each user connects their own Gmail in **Settings → Gmail**.

### "Continue with Google" sign-in

Supabase → Authentication → Providers → Google (use any Google OAuth client, its redirect URI is shown there). Then set
`GOOGLE_LOGIN=1` in Cloudflare.

### Push notifications (drafts ready, replies, daily nudges)

Add the three values `npm run secrets` printed: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_EMAIL`. Then
each user taps **Settings → Notifications** on their phone (install the app to the home screen first on iOS).

### A shared Gemini key

Set `GEMINI_API_KEY` to let users without their own key use yours. **Only do this on an instance for yourself or people
you trust**: everyone shares one free-tier quota.

## Environment variable reference

| Variable | Required | Notes |
|---|---|---|
| `SUPABASE_URL` | yes | |
| `SUPABASE_ANON_KEY` | yes | public; served to the browser at runtime from `/api/config` |
| `SUPABASE_SERVICE_KEY` | yes | secret; server only |
| `APP_SECRET` | yes | 32+ random chars; encrypts stored keys and tokens |
| `CRON_SECRET` | yes | protects `/api/cron` |
| `APP_URL` | yes | used for the cron call and OAuth redirects |
| `SUPABASE_JWT_SECRET` | no | local HS256 token checks |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | no | enables Gmail sending |
| `GOOGLE_LOGIN` | no | `1` shows "Continue with Google" |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_EMAIL` | no | push notifications |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | no | shared fallback key / model override |
| `OLLAMA_API_KEY`, `OLLAMA_MODEL` | no | shared text-only fallback |

## Local development

```bash
cp .env.example .env.local   # fill in at least the six required values
npm run dev                  # http://localhost:3000
npm test
npm run preview              # builds and runs the real Cloudflare worker locally
```

## Updating

Pull from upstream and push. Cloudflare redeploys. If `supabase/schema.sql` changed, run it again (it is idempotent).

## Limits to know about (Cloudflare free plan)

~10 ms CPU and ~50 subrequests per invocation. The app is built around this: background work is sliced, large jobs are
paged (Gmail learning reads 12 messages per tap), and the CV PDF is rendered in the browser. A cohort of a few dozen
active users fits comfortably. If you outgrow it, Cloudflare's paid Workers plan lifts the limits without code changes.

## Troubleshooting

- **"Not signed in" loops** - check `SUPABASE_URL`/`SUPABASE_ANON_KEY` and that the Site URL in Supabase matches your app URL.
- **"APP_SECRET is missing or too short"** - set a 32+ character `APP_SECRET`.
- **Drafts stay on "Drafting"** - the user has no Gemini key yet, or the key is invalid (Settings → AI).
- **Gmail reconnect every week** - the Google app is in *Testing* mode (see above).
- **Cron does nothing** - confirm `CRON_SECRET` and `APP_URL` are set and the Worker shows a recent scheduled run in Cloudflare.
