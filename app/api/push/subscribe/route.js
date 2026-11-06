import { getSetting, setSetting } from '@/lib/db';
import { json, wrap } from '@/lib/http';
export const POST = wrap(async req => {
  const sub = await req.json();
  const subs = ((await getSetting('push_subs')) || []).filter(s => s.endpoint !== sub.endpoint);
  await setSetting('push_subs', [...subs, sub]);
  return json({ ok: true });
});
