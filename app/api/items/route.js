import { listItems, insertItem, uploadFile, getProfile } from '@/lib/db';
import { localParts } from '@/lib/tz.js';
import { prefs } from '@/lib/prefs';
import { kick } from '@/lib/kick';
import { bg } from '@/lib/bg';
import { refillPool } from '@/lib/swipe';
import { json, wrap } from '@/lib/http';
export const dynamic = 'force-dynamic';

function stats(items, goal, tz) {
  const dayKey = d => localParts(tz, new Date(d)).date; // the user's own calendar day
  const weekAgo = Date.now() - 7 * 864e5;
  const sentWeek = items.filter(i => i.sent_at && Date.parse(i.sent_at) > weekAgo).length;
  const replies = items.filter(i => i.reply?.category && !['out_of_office', 'bounce'].includes(i.reply.category)).length;
  const interviews = items.filter(i => i.status === 'interview').length;
  const active = new Set(items.flatMap(i => [i.created_at, i.sent_at].filter(Boolean).map(dayKey)));
  let streak = 0;
  const now = Date.now();
  for (let i = 0; i < 365; i++) {
    if (active.has(dayKey(now - i * 864e5))) streak++;
    else if (i === 0) continue; // nothing yet today doesn't break the streak
    else break;
  }
  return { sentWeek, goal, replies, interviews, streak, total: items.filter(i => !i.parent_id).length };
}

export const GET = wrap(async () => {
  bg(refillPool(15)); // quietly keep the swipe deck stocked while the app is in use
  const [items, p, me] = await Promise.all([listItems(), prefs(), getProfile()]);
  return json({ items, stats: stats(items, p.weeklyGoal, me.timezone), me: { name: (me.name || '').split(' ')[0], onboarded: !!me.onboarded && !!me.cv_data } });
});

export const POST = wrap(async req => {
  const fd = await req.formData();
  const text = String(fd.get('text') || '').trim();
  const files = [];
  for (const f of fd.getAll('files')) if (f && typeof f === 'object' && f.size) files.push(await uploadFile(f));
  if (!text && !files.length) return json({ error: 'Nothing to add' }, 400);
  const item = await insertItem({ status: 'queued', raw_text: text, files });
  kick(item.id);
  return json({ item });
});
