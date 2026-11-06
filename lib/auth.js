// Sessions: Supabase Auth issues the tokens (email/password, magic link or Google); we keep the access token
// in an httpOnly cookie and verify it on every request. Browsers refresh it (see lib/supabase-client.js).
export const COOKIE = 'ob_at';

const dec = new TextDecoder();
const unb64url = s => { s = s.replace(/-/g, '+').replace(/_/g, '/'); s += '='.repeat((4 - (s.length % 4)) % 4); return Uint8Array.from(atob(s), c => c.charCodeAt(0)); };

/** Reads the claims without verifying the signature. Only for cheap "is it expired" checks (middleware). */
export function peek(token) {
  try { return JSON.parse(dec.decode(unb64url(String(token).split('.')[1]))); } catch { return null; }
}
export const expired = claims => !claims || !claims.exp || claims.exp * 1000 < Date.now() + 5000;

const apiCache = new Map(); // token -> { user, until }

/**
 * Verifies a Supabase access token. With SUPABASE_JWT_SECRET (legacy HS256 projects) it is checked locally with no
 * network call; otherwise the token is validated against Supabase Auth and remembered for a minute.
 */
export async function verify(token) {
  const claims = peek(token);
  if (expired(claims)) return null;
  const secret = process.env.SUPABASE_JWT_SECRET;
  let alg = '';
  try { alg = JSON.parse(dec.decode(unb64url(token.split('.')[0]))).alg; } catch { return null; }
  if (secret && alg === 'HS256') {
    const [h, p, s] = token.split('.');
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify('HMAC', key, unb64url(s), new TextEncoder().encode(h + '.' + p));
    return ok && claims.sub ? { id: claims.sub, email: claims.email || '' } : null;
  }
  const hit = apiCache.get(token);
  if (hit && hit.until > Date.now()) return hit.user;
  const r = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_KEY, Authorization: 'Bearer ' + token } });
  if (!r.ok) return null;
  const u = await r.json();
  const user = u?.id ? { id: u.id, email: u.email || '' } : null;
  if (user) { if (apiCache.size > 500) apiCache.clear(); apiCache.set(token, { user, until: Date.now() + 60000 }); }
  return user;
}

export function tokenFrom(req) {
  const c = req.cookies?.get?.(COOKIE)?.value;
  if (c) return c;
  const m = (req.headers.get('cookie') || '').match(new RegExp('(?:^|; )' + COOKIE + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : '';
}

export async function sessionUser(req) {
  const t = tokenFrom(req);
  return t ? verify(t) : null;
}
