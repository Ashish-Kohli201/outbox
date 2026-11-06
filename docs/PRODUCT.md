# From personal tool to product anyone can use

Outbox started as one student's job-search autopilot. This document is the thinking behind turning it into something
anyone can run, and what is still missing. It is meant to be argued with: open an issue if you disagree.

## Who it is for

- **Students and early-career job seekers** who send lots of personal emails and want each one to sound hand-written.
- **Career and placement cells** that want to give a whole batch the same tool without paying per seat.
- **Career switchers and freelancers** who cold-email for work.

The common job: *"I found a lead. Make me look good to this specific person, in my own voice, without me writing ten emails."*

## Principles (these are the product, not decoration)

1. **A human approves every email.** Drafting, follow-ups and replies are automatic; sending never is. A scheduled send is
   an approval with a time on it, and can be cancelled.
2. **Free to run.** No paid APIs. Gemini's free tier is the default model; each user brings their own key.
3. **Never invent facts.** Drafts may only use the user's CV and what the app found on the web. Missing facts become
   `[confirm: ...]`, not guesses.
4. **Specific beats polite.** One real observation about the recipient, at most two proof points, one small ask.
5. **Your data is yours.** Export everything, delete everything, read the code.

## Three ways to run it

| | Who runs it | Cost | Effort | Status |
|---|---|---|---|---|
| **Self-host for yourself** | you | $0 | ~20 min, once | ✅ works today |
| **Host for a cohort** (college, bootcamp, friends) | one volunteer | $0 to a few dollars | same 20 min | ✅ multi-user is built in |
| **Public hosted app for everyone** | a maintainer | hosting + compliance | blocked on Gmail verification | 🟡 see below |

The first two need nothing from us. Fork, deploy, share the link. Multi-tenancy (per-user data, per-user keys, per-user
Gmail) is part of the core, so a cohort instance is just "more people sign up".

### Why a public hosted app is not simply a launch away

**Gmail permissions.** Sending from the user's own mailbox and reading replies needs the `gmail.send` and
`gmail.readonly` scopes. Google classifies these as *restricted*. An app that offers them to the public must pass OAuth
verification, and restricted scopes additionally require an independent security assessment, repeated yearly. Without
that, an app is limited to a small number of users and shows an "unverified app" warning. Check Google's current policy
before planning around exact numbers.

How Outbox deals with it:

- **Works without Gmail.** If Gmail is not connected, the draft screen shows **Open in Gmail**: a prefilled compose
  window. The user presses send themselves. No scopes, no verification, and still no auto-send. (Trade-off: no automatic
  reply detection, follow-up threading, or CV attachment.)
- **Gmail is opt-in per user**, and each self-hosted instance uses its own Google project, so the limits apply per
  instance, not globally.
- **Roadmap:** Outlook / Microsoft 365 through Microsoft Graph, and SMTP/IMAP with app passwords, so users are never
  forced through a Google review.

**AI cost.** Every user supplies their own Gemini key (stored encrypted). The operator pays nothing, and one heavy user
cannot burn another's quota. A server-wide key can be set as a fallback for single-owner instances; leave it unset on a
shared instance.

**Platform limits.** On Cloudflare's free plan a Worker gets about 10 ms of CPU and 50 subrequests per invocation. The
cron job therefore does a small slice of work per run. That comfortably serves a few dozen active users; beyond that,
Cloudflare's $5 plan raises the limits roughly 20-fold. This is a hosting detail, not an architecture change.

**Trust and compliance.** Anyone hosting for others becomes a data controller. The app ships the building blocks
(export, delete, encrypted secrets, no analytics, no third-party trackers), but operators must still publish their own
privacy policy and terms and respect local law (GDPR, CAN-SPAM, and similar). Cold email to individuals is legal in many
places and restricted in others: the user is responsible for who they write to.

## Abuse and misuse

Cold-email tools get abused. The design choices that keep Outbox from becoming a spam cannon:

- No automatic sending, ever. One human tap per email.
- No email scraping or "find emails" feature, and none planned. Users add addresses they already have.
- Sends go from the user's own mailbox under their own name, so deliverability and reputation are theirs to protect.
- Planned: a per-user daily send cap (default well under Gmail's limits), and a visible "sent today" counter.

## What changed to make it multi-user

| Single-user original | Product version |
|---|---|
| Hardcoded CV and personality in code | Profile in the database; CV imported from PDF/Word, editable |
| One shared password | Supabase Auth: email + password, magic link, optional Google |
| One Gmail, tokens in a settings row | Per-user Gmail OAuth, tokens encrypted (AES-GCM) |
| Server-wide Gemini key | Per-user key, encrypted; server key is only a fallback |
| One set of tables | Every row carries `user_id`; RLS on as a second wall |
| Cron for one person | Cron walks all users in small slices |
| Fixed timezone | Per-user timezone for nudges and streaks |

## Roadmap

Roughly in order. Pull requests welcome on any of it.

**Next (v0.2)**
- Per-user daily send cap and a "sent today" counter
- One-click "Deploy to Cloudflare" button and a guided first-run checklist
- Outlook / Microsoft 365 sending and reply detection
- Better CV import: keep the user's own PDF layout instead of re-rendering

**Then**
- Browser extension / share target for desktop (capture a LinkedIn post or job page in one click)
- Cohort admin view for placement cells: activity counts only, never email content
- SMTP/IMAP provider for users who do not use Gmail or Outlook
- Localised UI and prompts
- A Node/Docker adapter so it can run outside Cloudflare

**Maybe**
- Shared, anonymised "what worked" email patterns users can opt into
- Calendar link insertion for interview scheduling replies

## How this stays sustainable

MIT-licensed, no paywall, no hosted lock-in. Maintainer time is the real cost; sponsors or a college that wants to run a
cohort instance are the natural funders. If a hosted offering ever exists it should be a convenience for people who do
not want to self-host, never a requirement.

## Open questions

- **License.** MIT maximises adoption and contributions. AGPL-3.0 would require anyone running a modified public
  service to share their changes. The maintainers can still choose; this is a one-line change before outside
  contributions accumulate.
- **Verification.** Is a Google-verified hosted instance worth the yearly assessment, or is Outlook/SMTP the better
  path to a no-setup experience?
- **Defaults.** Which tone presets and CV layouts serve non-student users well?
