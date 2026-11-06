# Security

## Reporting a vulnerability

Please **do not** open a public issue. Use GitHub's private reporting (the repository's **Security** tab → **Report a
vulnerability**). Include what you found, how to reproduce it, and the impact. You will get a reply within a few days, and
we will credit you in the fix unless you prefer otherwise.

## What the app protects

- **User isolation.** Every row has a `user_id`. All data access goes through `lib/db.js`, scoped to the signed-in user, and
  row-level security is enabled as a second wall. Uploaded files live under `<user_id>/` and are checked before download.
- **Stored secrets.** Users' Gemini keys and Gmail refresh tokens are encrypted with AES-256-GCM (key derived from
  `APP_SECRET`) and never returned to the browser.
- **Sessions.** Supabase Auth tokens in an httpOnly, SameSite=Lax cookie, verified on every API request.
- **Never auto-sends.** Mail is sent only after an explicit user action.
- **Data control.** Users can download all their data and delete their account (rows and files) from Settings.

## What it does not protect against

- The **operator** of an instance holds `SUPABASE_SERVICE_KEY` and `APP_SECRET` and can read the database and decrypt stored
  secrets. Only sign up on an instance run by someone you trust, or run your own.
- Content you send to Gemini (your CV, leads, drafts) is processed by Google under your own API key's terms.
- If you lose `APP_SECRET`, stored keys and tokens cannot be recovered; if it leaks, rotate it and ask users to re-enter keys.

## Hardening checklist for operators

- Keep `SUPABASE_SERVICE_KEY`, `APP_SECRET`, `CRON_SECRET` and `GOOGLE_CLIENT_SECRET` as Cloudflare **secrets**, never in the repo.
- Leave `GEMINI_API_KEY` unset on shared instances so one user cannot spend another's quota.
- Set Supabase's Site URL and Redirect URLs to your real domain only.
- Use your own SMTP provider in Supabase for production sign-up emails.
- Publish a privacy policy and terms if you host for other people.
