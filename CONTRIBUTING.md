# Contributing to Outbox

Thanks for helping. Outbox is small enough to read in an afternoon: start with [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Run it locally

```bash
npm install
cp .env.example .env.local     # fill in the required values (a free Supabase project is enough)
npm run dev
npm test
```

You need a Supabase project with [`supabase/schema.sql`](supabase/schema.sql) applied. `npm run preview` builds and runs the
real Cloudflare worker locally, which is the best check before opening a pull request. Please also run
`npx opennextjs-cloudflare build`: the Cloudflare build is stricter than `next dev`.

## The rules that make this product what it is

Pull requests that break these will be asked to change:

1. **A human approves every email.** Nothing may send mail without an explicit user action (a tap, or scheduling that
   email). No bulk send, no auto-reply, no "send on my behalf" background jobs. Cron drafts and notifies only.
2. **User isolation.** Never query Supabase outside `lib/db.js`; every helper there is scoped to the current user. The
   cron route is the one deliberate exception and wraps each unit in `runAs(userId, ...)`. If you add a table, add
   `user_id`, an index and an RLS policy.
3. **Free to run.** No paid services or paid-only APIs in the default path. Optional integrations are fine if the app works without them.
4. **Never invent facts.** Anything the AI writes about a person must come from their CV, the lead, or cited research.
   Unknown facts become `[confirm: ...]`.
5. **Respect the Cloudflare free plan.** ~10 ms CPU and ~50 subrequests per invocation. Bulk-insert, page large reads,
   keep heavy work (like PDF rendering) in the browser, and keep latency-sensitive AI calls on a small prompt.
6. **Secrets stay encrypted and server-side.** Use `lib/crypto.js`; never return a stored key to the browser.

## UI and copy

- No explanatory helper text. If a screen needs a paragraph to be understood, change the screen: clearer labels, better
  defaults, or a self-evident layout.
- Use plain hyphens (`-`), not em dashes, in UI copy and in prompts.
- Phone first. Everything must work at 375 px wide with one thumb.
- Respect `prefers-reduced-motion`.

## Code style

- Plain JavaScript, no build-time type system. Keep modules small and put pure logic in files that can be unit tested
  without Supabase (see `lib/cvguard.js`, `lib/mimehtml.js`, `lib/sig.js`, `lib/tz.js`, `lib/crypto.js`).
- Import pure modules with an explicit `.js` extension if tests load them directly.
- Comments explain *why*, not *what*.
- Add or update a test for any change to the pure modules. `npm test` must pass.

## Pull requests

- Keep them focused. Describe the problem, the change, and how you checked it.
- Screenshots or a short screen recording for UI changes (phone width).
- Link the issue if there is one. For anything large, please open an issue first so we can agree on the approach.

## Reporting security problems

Do not open a public issue. See [SECURITY.md](SECURITY.md).

## Code of conduct

Be kind and assume good faith. See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
