// The browser signs in with Supabase Auth, then hands us the access token to keep in an httpOnly cookie.
import { NextResponse } from 'next/server';
import { COOKIE, verify } from '@/lib/auth';
import { open } from '@/lib/http';
export const dynamic = 'force-dynamic';

export const POST = open(async req => {
  const { access_token } = await req.json();
  const user = access_token ? await verify(access_token) : null;
  if (!user) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, access_token, { httpOnly: true, secure: req.nextUrl.protocol === 'https:', sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30 });
  return res;
});

export const DELETE = open(async () => {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, '', { path: '/', maxAge: 0 });
  return res;
});
