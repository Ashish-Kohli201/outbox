import { NextResponse } from 'next/server';
import { authUrl, gmailConfigured } from '@/lib/gmail';
import { withUser } from '@/lib/http';
export const dynamic = 'force-dynamic';

export const GET = withUser(async req => {
  if (!gmailConfigured()) return NextResponse.redirect(new URL('/settings?gmail=' + encodeURIComponent('Gmail is not set up on this server (see docs/SELF_HOSTING.md).'), req.url));
  return NextResponse.redirect(await authUrl());
});
