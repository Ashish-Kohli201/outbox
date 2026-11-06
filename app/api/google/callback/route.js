import { NextResponse } from 'next/server';
import { exchangeCode } from '@/lib/gmail';
import { withUser } from '@/lib/http';
export const dynamic = 'force-dynamic';

export const GET = withUser(async req => {
  const q = req.nextUrl.searchParams;
  try {
    if (q.get('error')) throw new Error(q.get('error'));
    await exchangeCode(q.get('code'), q.get('state'));
    return NextResponse.redirect(new URL('/settings?gmail=ok', req.url));
  } catch (e) { return NextResponse.redirect(new URL('/settings?gmail=' + encodeURIComponent(e.message), req.url)); }
});
