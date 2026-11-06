## What and why

## How I checked it
- [ ] `npm test`
- [ ] `npx opennextjs-cloudflare build`
- [ ] Tried it at phone width (screenshots for UI changes)

## Checklist
- [ ] Nothing sends email without an explicit user action
- [ ] New data access goes through `lib/db.js` and is scoped to the user (new tables have `user_id`, an index and an RLS policy)
- [ ] No new paid dependency; fits the Cloudflare free-plan limits
- [ ] No explanatory helper text added to the UI
