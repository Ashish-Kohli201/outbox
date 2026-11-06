<h1 align="center">📮 Outbox</h1>
<p align="center"><b>An open-source job-search autopilot.</b><br>
Drop any lead. Get a personal email drafted in <i>your</i> voice. Send it with one tap.</p>

<p align="center">
  <a href="LICENSE">MIT license</a> ·
  <a href="docs/SELF_HOSTING.md">Self-host in 20 minutes</a> ·
  <a href="docs/PRODUCT.md">Product thinking & roadmap</a> ·
  <a href="docs/ARCHITECTURE.md">Architecture</a>
</p>

---

Most cold emails read like templates, and writing a good one takes longer than finding the lead. Outbox does the part that
makes the difference: it reads the lead, researches the company, and writes a short email that sounds like you wrote it,
then waits for you to tap send.

- **Nothing is ever sent without your approval.** Drafts, follow-ups and replies are automatic. Sending never is.
- **Free to run.** Supabase and Cloudflare free tiers, plus your own free Gemini key.
- **Your data stays yours.** Export or delete everything in one tap. Keys are encrypted. No analytics.

## What it does

- 📥 **Drop anything**: a job link, a Google Form, a LinkedIn post, a screenshot, a company name, an email address. Share
  straight from your phone's share sheet.
- 🔎 **Reads and researches.** Parses forms exactly, reads screenshots and PDFs, and looks the company up on the web
  (funding, news, hooks) so the opening line is specific and current.
- ✍️ **Writes like you.** Learns from your sent mail, documents you upload, and a Tinder-style **swipe deck** where you
  like, nope or superlike candidate emails and say why.
- 📄 **Tailors your CV.** Reorders and rewords your real bullets for each role under hard guardrails: nothing invented,
  no bullet longer than the original, one page. Or attach any of your own PDFs; it suggests the best fit.
- ✈️ **One-tap send, or send later.** From your own Gmail with a signature you choose (with real hyperlinks), or schedule
  it for tomorrow 9 AM. No Gmail? Open a prefilled compose window instead.
- 🔁 **Follow-ups and replies.** Day-4 and day-7 follow-ups and responses to replies are drafted for you and wait for approval.
- 🔔 **Daily nudges** with a ready LinkedIn search of posts from the last 24 hours.
- 👥 **Multi-user.** Run it for yourself, or host one instance for a whole cohort. Everyone gets their own account, keys,
  Gmail and data.

## Quick start

```bash
git clone https://github.com/<you>/outbox && cd outbox
npm install
npm run secrets        # prints APP_SECRET, CRON_SECRET and push keys
```

Then create a free Supabase project, run [`supabase/schema.sql`](supabase/schema.sql), and deploy to Cloudflare Workers.
The full walkthrough, including optional Gmail and push notifications, is in
**[docs/SELF_HOSTING.md](docs/SELF_HOSTING.md)**.

When it is running: sign up → paste your free Gemini key → import your CV → pick a tone → drop your first lead.

## How it works

```
lead ──► understand ──► research the company ──► draft in your voice ──► you review ──► send / schedule
                                                                              │
                         follow-ups, replies, nudges  ◄── cron (every 5 min) ─┘
```

Next.js on Cloudflare Workers, Supabase for Postgres/Auth/Storage, Gemini for the AI. User isolation is enforced by a
request-scoped user context, a single scoped data layer, and row-level security. See
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Is this a product anyone can use?

You can run it today, for yourself or for a group, without asking anyone. The one thing that stops a public hosted version
is Google's verification for Gmail sending, which is why Outbox also works without Gmail. The reasoning, the trade-offs
and the roadmap are in [docs/PRODUCT.md](docs/PRODUCT.md).

## Contributing

Issues and pull requests are welcome, especially: Outlook and SMTP sending, localisation, CV layouts, and the browser
capture extension. Start with [CONTRIBUTING.md](CONTRIBUTING.md).

```bash
npm test      # unit tests for the pure modules
npm run dev   # local app
```

## Responsible use

Outbox is for personal, human-written outreach. It has no bulk sending and no
email-finding feature, by design. You are responsible for who you write to and for following the laws and platform rules
that apply to you.

## License

[MIT](LICENSE). Fonts in `public/fonts` are Carlito and Caladea under the SIL Open Font License; see
[THIRD_PARTY.md](THIRD_PARTY.md).
