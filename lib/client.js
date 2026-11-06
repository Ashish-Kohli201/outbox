'use client';
import { refreshSession } from './supabase-client';

export async function api(url, opts = {}, retried = false) {
  const r = await fetch(url, { ...opts, headers: opts.body && !(opts.body instanceof FormData) ? { 'Content-Type': 'application/json', ...(opts.headers || {}) } : opts.headers });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401) {
    // The access token lasts about an hour: renew it once and retry before sending the user to sign in.
    if (!retried && opts.body instanceof FormData === false && (await refreshSession())) return api(url, opts, true);
    location.href = '/login';
    throw new Error('Not signed in');
  }
  if (!r.ok) throw new Error(d.error || 'Something went wrong');
  return d;
}
export const post = (url, body) => api(url, { method: 'POST', body: JSON.stringify(body) });
export async function copy(text) { try { await navigator.clipboard.writeText(text); } catch { const t = document.createElement('textarea'); t.value = text; document.body.append(t); t.select(); document.execCommand('copy'); t.remove(); } }
export const fmt = d => (d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '');
export function titleOf(it) {
  const c = it.info?.company, r = it.info?.role;
  if (it.kind === 'outreach') return `${it.email?.toName || 'Contact'}${c ? ' - ' + c : ''}`;
  if (c) return c + (r ? ' - ' + r : '');
  if (it.info?.title) return it.info.title;
  // Not read yet: never show a raw link as the headline.
  const raw = String(it.raw_text || '').trim();
  const text = raw.replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim();
  if (text) return text.slice(0, 50);
  const u = raw.match(/https?:\/\/[^\s]+/);
  if (u) { try { return 'New lead from ' + new URL(u[0]).hostname.replace(/^www\./, ''); } catch {} }
  return 'New lead';
}
