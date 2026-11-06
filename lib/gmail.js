import { getSetting, setSetting, getProfile } from './db';
import { htmlToText } from './fetchpage';
import { encrypt, decrypt } from './crypto';
import { toHtml, toPlain } from './mimehtml.js';

// Gmail is optional. With it the app sends from the user's own mailbox, threads follow-ups and spots replies.
// Without it the item page offers "Open in Gmail" (compose link) and the user sends by hand.
const SCOPES = 'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly';
const redirectUri = () => `${process.env.APP_URL}/api/google/callback`;
export const gmailConfigured = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.APP_URL);

export async function authUrl() {
  const state = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  await setSetting('google_state', { state, at: Date.now() });
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID, redirect_uri: redirectUri(), response_type: 'code', state,
    scope: SCOPES, access_type: 'offline', prompt: 'consent', login_hint: (await getProfile()).email || ''
  });
  return 'https://accounts.google.com/o/oauth2/v2/auth?' + p;
}

async function save(g) { await setSetting('google', { email: g.email, rt: g.rt ? await encrypt(g.rt) : undefined, at: g.at ? await encrypt(g.at) : undefined, exp: g.exp }); }
async function load() {
  const s = await getSetting('google');
  if (!s?.rt) return null;
  return { email: s.email, rt: await decrypt(s.rt), at: s.at ? await decrypt(s.at).catch(() => '') : '', exp: s.exp || 0 };
}

export async function exchangeCode(code, state) {
  const saved = await getSetting('google_state');
  if (!saved?.state || saved.state !== state || Date.now() - saved.at > 15 * 60000) throw new Error('That sign-in link expired - try connecting again.');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, redirect_uri: redirectUri(), grant_type: 'authorization_code' })
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error_description || d.error || 'Google sign-in failed');
  if (!d.refresh_token) throw new Error('Google did not return a refresh token - remove Outbox at myaccount.google.com/permissions and connect again.');
  const g = { rt: d.refresh_token, at: d.access_token, exp: Date.now() + (d.expires_in - 60) * 1000 };
  await save(g);
  const prof = await api('/profile');
  await save({ ...g, email: prof.emailAddress });
  return prof.emailAddress;
}

export async function disconnectGmail() { await setSetting('google', null); }

async function accessToken() {
  const g = await load();
  if (!g) throw new Error('Connect Gmail in Settings first.');
  if (g.at && g.exp > Date.now()) return g.at;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, refresh_token: g.rt, grant_type: 'refresh_token' })
  });
  const d = await r.json();
  if (!r.ok) throw new Error('Gmail access expired - reconnect in Settings. (' + (d.error || '') + ')');
  await save({ ...g, at: d.access_token, exp: Date.now() + (d.expires_in - 60) * 1000 });
  return d.access_token;
}

async function api(path, opts = {}) {
  const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me' + path, {
    ...opts, headers: { Authorization: 'Bearer ' + (await accessToken()), 'Content-Type': 'application/json', ...(opts.headers || {}) }
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Gmail: ' + (d.error?.message || r.status));
  return d;
}

export async function myEmail() { return (await getSetting('google'))?.email || (await getProfile()).email || ''; }
export async function gmailEmail() { return (await getSetting('google'))?.email || null; }

const b64 = s => Buffer.from(s, 'utf8').toString('base64');
const enc = s => `=?UTF-8?B?${b64(s)}?=`;

/** Sends HTML + plain text (+ optional PDF attachments), threaded when threadId/inReplyTo given. Returns { threadId, messageId }. */
export async function sendMail({ to, subject, body, threadId, inReplyTo, attachments = [] }) {
  if (!to || !to.includes('@')) throw new Error('Add a valid email address first.');
  const from = await myEmail();
  const me = await getProfile();
  const h = [`From: ${enc(me.name || from)} <${from}>`, `To: ${to}`, `Subject: ${enc(subject || '')}`, 'MIME-Version: 1.0'];
  if (inReplyTo) h.push(`In-Reply-To: ${inReplyTo}`, `References: ${inReplyTo}`);
  const wrap76 = s => s.replace(/(.{76})/g, '$1\r\n');
  const rnd = () => 'ob' + Math.random().toString(36).slice(2);
  const alt = rnd();
  const altBlock = [
    `--${alt}`, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', wrap76(b64(toPlain(body))),
    `--${alt}`, 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', wrap76(b64(toHtml(body))),
    `--${alt}--`
  ];
  let mime;
  if (!attachments.length) {
    mime = [...h, `Content-Type: multipart/alternative; boundary="${alt}"`, '', ...altBlock].join('\r\n');
  } else {
    const bd = rnd();
    const parts = [`--${bd}`, `Content-Type: multipart/alternative; boundary="${alt}"`, '', ...altBlock];
    for (const a of attachments) {
      parts.push(`--${bd}`, `Content-Type: ${a.mime || 'application/pdf'}; name="${a.filename}"`, `Content-Disposition: attachment; filename="${a.filename}"`, 'Content-Transfer-Encoding: base64', '', wrap76(a.b64));
    }
    parts.push(`--${bd}--`);
    mime = [...h, `Content-Type: multipart/mixed; boundary="${bd}"`, '', ...parts].join('\r\n');
  }
  const raw = Buffer.from(mime).toString('base64url');
  const sent = await api('/messages/send', { method: 'POST', body: JSON.stringify({ raw, ...(threadId ? { threadId } : {}) }) });
  const meta = await api(`/messages/${sent.id}?format=metadata&metadataHeaders=Message-ID`);
  const mid = (meta.payload?.headers || []).find(x => x.name.toLowerCase() === 'message-id')?.value || '';
  return { threadId: sent.threadId, messageId: mid };
}

/**
 * Emails the user wrote themselves, newest first, one small page at a time (Workers allow ~50 subrequests per call).
 * Returns { items: [{id, subject, to, text}], next } - pass `next` back to dig further into the past.
 */
export async function recentSent(max = 12, pageToken = '') {
  const list = await api(`/messages?q=${encodeURIComponent('in:sent -in:chats')}&maxResults=${max}${pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : ''}`);
  const got = await Promise.all((list.messages || []).map(async m => {
    try {
      const full = await api(`/messages/${m.id}?format=full`);
      const hd = n => (full.payload?.headers || []).find(x => x.name.toLowerCase() === n)?.value || '';
      const text = stripQuoted(partText(full.payload)).trim();
      if (text.length >= 150 && text.length <= 4000) return { id: m.id, subject: hd('subject'), to: hd('to'), text };
    } catch (e) { /* skip */ }
    return null;
  }));
  return { items: got.filter(Boolean), next: list.nextPageToken || '', seen: (list.messages || []).length };
}

const decode = s => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
function partText(p) {
  if (!p) return '';
  if (p.mimeType === 'text/plain' && p.body?.data) return decode(p.body.data);
  for (const c of p.parts || []) { const t = partText(c); if (t) return t; }
  if (p.mimeType === 'text/html' && p.body?.data) return htmlToText(decode(p.body.data));
  return '';
}
function stripQuoted(t) {
  const out = [];
  for (const l of String(t).split(/\r?\n/)) {
    const x = l.trim();
    if (/^On .*wrote:$/.test(x) || /^-+\s*Original Message/i.test(x)) break;
    if (x.startsWith('>')) continue;
    out.push(l);
  }
  return out.join('\n').trim();
}

/** Full conversation, oldest first. */
export async function getThread(threadId) {
  const me = (await myEmail()).toLowerCase();
  const t = await api(`/threads/${threadId}?format=full`);
  return (t.messages || []).map(m => {
    const hd = n => (m.payload?.headers || []).find(x => x.name.toLowerCase() === n)?.value || '';
    const from = hd('from');
    return { from, replyTo: hd('reply-to'), messageId: hd('message-id'), subject: hd('subject'), at: Number(m.internalDate), isMe: from.toLowerCase().includes(me), text: stripQuoted(partText(m.payload)).slice(0, 6000) };
  });
}
export const threadToText = msgs => msgs.map(m => `--- ${m.isMe ? 'SENDER' : m.from}, ${new Date(m.at).toDateString()}\n${m.text}`).join('\n\n').slice(-14000);
