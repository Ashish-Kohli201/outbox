import { NextResponse } from 'next/server';
import { sessionUser } from './auth';
import { runAs } from './ctx';

export const json = (d, s = 200) => NextResponse.json(d, { status: s });
const fail = e => json({ error: String(e?.message || e) }, 500);

/** API route for a signed-in user. Everything inside runs "as" that user (see lib/ctx.js). */
export const wrap = fn => async (req, ...rest) => {
  try {
    const u = await sessionUser(req);
    if (!u) return json({ error: 'Not signed in' }, 401);
    return await runAs(u.id, () => fn(req, rest[0], u));
  } catch (e) { return fail(e); }
};

/** Same, for routes that return redirects or raw responses (share target, OAuth callback, file download). */
export const withUser = fn => async (req, ...rest) => {
  try {
    const u = await sessionUser(req);
    if (!u) return NextResponse.redirect(new URL('/login', req.url));
    return await runAs(u.id, () => fn(req, rest[0], u));
  } catch (e) { return fail(e); }
};

/** Public route (login helpers, config). */
export const open = fn => async (...a) => { try { return await fn(...a); } catch (e) { return fail(e); } };
