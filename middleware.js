import { NextResponse } from 'next/server';
import { COOKIE, peek, expired } from '@/lib/auth';

// Kept as middleware.js (not Next 16's proxy.js): OpenNext's Cloudflare adapter only supports proxy as
// experimental Node.js middleware. This is only the cheap "is there a live session cookie" gate for page loads;
// every API route verifies the token properly (lib/http.js).
const OPEN = ['/login', '/api/auth/session', '/api/config', '/api/cron', '/manifest.webmanifest', '/sw.js', '/icon-192.png', '/icon-512.png'];

export function middleware(req) {
  const { pathname } = req.nextUrl;
  if (OPEN.includes(pathname) || pathname.startsWith('/_next') || pathname.startsWith('/fonts/')) return NextResponse.next();
  const t = req.cookies.get(COOKIE)?.value;
  if (t && !expired(peek(t))) return NextResponse.next();
  if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  return NextResponse.redirect(new URL('/login', req.url));
}
export const config = { matcher: ['/((?!favicon.ico).*)'] };
