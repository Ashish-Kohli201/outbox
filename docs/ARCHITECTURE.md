# Architecture

Outbox is a Next.js (App Router) app on Cloudflare Workers via `@opennextjs/cloudflare`, with Supabase for Postgres, Auth
and file storage. There is no separate backend: API routes are the backend, and `worker.js` adds a `scheduled()` handler so
Cloudflare's cron can call the app.

```
Browser (PWA) ──► Next.js pages + API routes ──► Supabase (Postgres, Auth, Storage)
      │                    │
      │                    ├──► Gemini (drafting, reading images/PDFs, web research via Google Search grounding)
      │                    └──► Gmail API (optional: send, threads, replies)
      └── Supabase Auth (sign-in, token refresh)

Cloudflare cron (every 5 min) ──► /api/cron ──► small slice of work for every user
```

## Users and isolation

Every table carries `user_id`. Isolation is enforced in three layers:

1. **Request context.** `lib/http.js` verifies the session token, then runs the handler inside
   `runAs(userId, ...)` (`lib/ctx.js`, `AsyncLocalStorage`). Nothing below that line takes a user argument.
2. **Scoped data layer.** `lib/db.js` is the only module that talks to the database. Every helper filters by `uid()`
   on reads and stamps it on writes; file paths are `"<user_id>/..."` and are checked before download.
3. **Row-level security.** Policies on every table (`supabase/schema.sql`) restrict rows to `auth.uid()`. The server uses
   the service key (which bypasses RLS), so this is a second wall rather than the first.

`tests/auth.test.mjs` includes a concurrency test that checks parallel requests never see each other's user.

Rule for contributors: **never query Supabase outside `lib/db.js`** except in the cron route, which is deliberately
cross-user and wraps each unit of work in `runAs(item.user_id, ...)`.

## Sign-in

Supabase Auth issues a JWT (email/password, magic link, optional Google). The browser hands the access token to
`POST /api/auth/session`, which stores it in an httpOnly cookie (`ob_at`). `lib/auth.js` verifies it: locally (HS256, with
`SUPABASE_JWT_SECRET`) or by asking Supabase (`/auth/v1/user`, cached for a minute). Tokens last about an hour; the browser
refreshes them through `supabase-js` and `lib/client.js` retries once on a 401. `middleware.js` is only a cheap "has a live
cookie" gate for page loads; API routes always verify properly.

## Secrets

Users' Gemini keys and Gmail refresh tokens are encrypted with AES-256-GCM (`lib/crypto.js`) using `APP_SECRET` before being
stored in the `settings` table. They are never sent back to the browser. Account export omits them.

## The drafting pipeline (`lib/pipeline.js`)

1. **Capture.** A lead (link, text, screenshot, share-sheet) becomes an `items` row with status `queued` and starts
   processing immediately in the background (`lib/kick.js`, `waitUntil`). The item page and cron are fallbacks, so a lead
   never waits for a timer and a stuck draft is retried within five minutes.
2. **Understand.** One LLM call reads the page (`lib/fetchpage.js`: Google Forms parsed exactly, JS-heavy pages through a
   reader fallback), attachments (Gemini reads images and PDFs) and decides what it is: job form, cold company, person,
   recruiter message, and so on.
3. **Research.** For company leads, `lib/research.js` asks Gemini with Google Search grounding for what the company does,
   funding, news and hooks (backup: a keyless search reader). The text is stored on the item.
4. **Write.** A second call drafts the email and any form answers from the user's CV, personality, learned voice, swipe
   taste and the research. `RULES` in `lib/context.js` keep emails short, specific and free of invented facts.
5. **Review.** The item sits in `review`. The user edits, rewrites with an instruction, picks a CV and signature, then
   approves, schedules, or (without Gmail) opens a prefilled Gmail compose window.
6. **After sending.** Cron drafts follow-ups (day 4 and 7), detects replies and drafts responses. Each needs approval.

### CV handling

- **Import** (`lib/cvimport.js`): a PDF, image, Word file or pasted text becomes structured `cv_data` plus plain `cv_text`.
- **Tailoring** (`lib/cvguard.js`): the AI returns only a *plan* (orders, optional rewrites). The CV is rebuilt from the
  master in code, so nothing can be added or dropped. Rewrites must be no longer, add no new numbers and keep bold markers
  balanced. EDUCATION stays first.
- **PDF** (`lib/cvpdf.js`): rendered in the browser with `pdf-lib` to stay under the Worker CPU limit. Every bullet is
  measured with the real font; one that would wrap is reverted to the nearest original. It scales down to 80% to stay on
  one page, then falls back to a second page.
- **Library:** users can also upload their own PDFs and pick one per email.

### Voice and taste

`lib/voice.js` distils writing samples (Gmail sent mail, uploads), swipe verdicts and sent-vs-drafted edits into a style
guide stored in `settings.voice_profile`. The swipe deck (`lib/swipe.js`) generates candidate emails that each test one
style lever; verdicts and comments feed back into the context and the guide. Cards come from a pre-generated pool so the
deck opens instantly.

## Sending (`lib/gmail.js`)

Optional. With Gmail connected, mail goes out as `multipart/alternative` (plain + HTML, where `**bold**`, `[text](url)`,
links, emails and phone lines become real HTML, see `lib/mimehtml.js`) with optional PDF attachments, threaded for
follow-ups. Scheduled sends store the rendered PDF in storage and are sent by cron.

## Background work (`app/api/cron/route.js`)

Runs every five minutes across all users, in small slices because of Cloudflare's free-plan limits (~50 subrequests per
invocation): rescue queued or stuck drafts, send due scheduled emails, then (one run in three) nudges, reply detection and
follow-up drafts. Each unit runs in `runAs(item.user_id, ...)` with that user's keys.

## Data model

| Table | Purpose |
|---|---|
| `profiles` | who the user is: name, headline, CV text and structured CV, tone, personality, timezone |
| `items` | one per lead or outreach: status, source, info, form answers, email, CV, threading, follow-ups, reply |
| `notes` | writing samples (`kind='sample'`) and swipe verdicts (`kind='swipe'`, JSON body) |
| `style` | AI draft vs what the user sent, so drafts learn from edits |
| `settings` | per-user key/value: prefs, signatures, encrypted AI keys and Gmail tokens, voice profile, push subscriptions, swipe pool |

Item status: `queued → processing → review / error → scheduled → sent → replied / interview / closed / skipped`.

## Where things are

```
app/                    pages and API routes
  api/cron              all-user background job
  api/auth, api/config  session cookie, runtime public config
  onboarding, login     first-run flow and sign-in
lib/
  ctx.js http.js auth.js db.js crypto.js      the user-isolation spine
  pipeline.js context.js llm.js research.js   drafting
  cvimport.js cvguard.js cvpdf.js             CV import, tailoring, PDF
  voice.js swipe.js defaults.js               personality and taste
  gmail.js mimehtml.js sig.js                 sending
supabase/schema.sql    schema + RLS
tests/                 unit tests for the pure modules
```
