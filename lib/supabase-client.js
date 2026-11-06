'use client';
// Browser side of sign-in. Supabase Auth keeps the session (and refreshes it); we mirror the access token into
// an httpOnly cookie so the server can read it (see app/api/auth/session).
import { createClient } from '@supabase/supabase-js';

let cfgP, client;
export const config = () => (cfgP ||= fetch('/api/config').then(r => r.json()).catch(() => ({})));

export async function supabase() {
  if (client) return client;
  const c = await config();
  if (!c.supabaseUrl || !c.anonKey) throw new Error('This server is missing SUPABASE_URL or SUPABASE_ANON_KEY.');
  client = createClient(c.supabaseUrl, c.anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  return client;
}

export async function pushSession(session) {
  if (!session?.access_token) return false;
  const r = await fetch('/api/auth/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ access_token: session.access_token }) });
  return r.ok;
}

/** Get a fresh token from Supabase and refresh the cookie. Returns false if the user has to sign in again. */
export async function refreshSession() {
  try {
    const sb = await supabase();
    const { data } = await sb.auth.refreshSession();
    return data?.session ? await pushSession(data.session) : false;
  } catch { return false; }
}

export async function signOut() {
  try { (await supabase()).auth.signOut(); } catch {}
  await fetch('/api/auth/session', { method: 'DELETE' });
  location.href = '/login';
}
