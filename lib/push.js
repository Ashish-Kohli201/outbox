import { buildPushPayload } from '@block65/webcrypto-web-push';
import { getSetting, setSetting } from './db';

export const pushConfigured = () => !!(process.env.VAPID_PRIVATE_KEY && (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY));

/** Sends a web push to every device the current user has enabled. Throws on failure, so callers should catch. */
export async function notify(title, body, url = '/') {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY;
  if (!pushConfigured()) return; // push is optional: self-hosters can skip VAPID keys
  const vapid = { subject: 'mailto:' + (process.env.VAPID_EMAIL || 'admin@example.com'), publicKey: pub, privateKey: process.env.VAPID_PRIVATE_KEY };
  const subs = (await getSetting('push_subs')) || [];
  const alive = [];
  let lastErr = '';
  for (const s of subs) {
    try {
      const payload = await buildPushPayload({ data: JSON.stringify({ title, body, url }), options: { ttl: 86400, urgency: 'high' } }, s, vapid);
      const r = await fetch(s.endpoint, payload);
      if (r.status === 404 || r.status === 410) continue;
      if (!r.ok) lastErr = `Push service ${r.status}: ${(await r.text()).slice(0, 200)}`;
      alive.push(s);
    } catch (e) { lastErr = e.message; alive.push(s); }
  }
  if (alive.length !== subs.length) await setSetting('push_subs', alive);
  if (lastErr) throw new Error(lastErr);
}
