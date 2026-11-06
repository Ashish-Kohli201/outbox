// Every 5 min (Cloudflare Cron Trigger), for ALL users. Rescues queued or stuck drafts and sends emails users
// scheduled. Every 15 min it also detects replies and drafts due follow-ups. It never sends anything a user
// has not approved (a scheduled email was approved when the user scheduled it).
//
// Cloudflare's free plan allows ~50 subrequests per invocation, so each run takes a small slice of work.
import { db, updateItem } from '@/lib/db';
import { runAs } from '@/lib/ctx';
import { processItem, checkThread, draftFollow, sendScheduled } from '@/lib/pipeline';
import { notify } from '@/lib/push';
import { maybeNudge } from '@/lib/nudges';
import { json } from '@/lib/http';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const name = it => it.info?.company || it.email?.toName || 'a lead';
const bucket = id => [...id].reduce((a, c) => (a + c.charCodeAt(0)) % 9973, 0) % 3;

export async function GET(req) {
  if (!process.env.CRON_SECRET || req.nextUrl.searchParams.get('key') !== process.env.CRON_SECRET) return json({ error: 'no' }, 401);
  const start = Date.now(), left = () => 50000 - (Date.now() - start);
  const log = [];
  const as = (it, fn) => runAs(it.user_id, fn);
  const ping = (it, ...a) => as(it, () => notify(...a)).catch(e => log.push('push: ' + e.message));
  const quarter = new Date().getUTCMinutes() % 15 < 5; // one run in three

  // 1. Dumps that weren't processed: queued, or stuck "processing" for 3+ min (the request that started them died).
  const stale = new Date(Date.now() - 3 * 60000).toISOString();
  const { data: queued } = await db().from('items').select('id,user_id').or(`status.eq.queued,and(status.eq.processing,updated_at.lt.${stale})`).order('created_at').limit(2);
  for (const q of queued || []) {
    if (left() < 30000) break;
    try {
      const it = await as(q, () => processItem(q.id));
      if (it.status === 'review') await ping(q, 'Draft ready', `${name(it)} - ready for your review`, `/item/${it.id}`);
      log.push('processed ' + q.id);
    } catch (e) { log.push('process error ' + q.id + ': ' + e.message); }
  }

  // 2. Scheduled sends that are due.
  const { data: sched } = await db().from('items').select('id,user_id,email,info').eq('status', 'scheduled').limit(40);
  for (const q of (sched || []).filter(x => Date.parse(x.email?.sendAt) <= Date.now()).slice(0, 4)) {
    if (left() < 12000) break;
    try {
      const it = await as(q, () => sendScheduled(q.id));
      await ping(q, 'Sent as scheduled', `${name(it)} - email delivered`, `/item/${it.id}`);
      log.push('scheduled sent ' + q.id);
    } catch (e) {
      await as(q, () => updateItem(q.id, { status: 'review', email: { ...q.email, sendError: String(e.message || e) } })).catch(() => {});
      await ping(q, 'Scheduled send failed', `${name(q)}: ${e.message}`, `/item/${q.id}`);
      log.push('scheduled error ' + q.id + ': ' + e.message);
    }
  }
  if (!quarter) return json({ ok: true, log });

  // 3. Nudges: only for users with notifications on, a third of them per run.
  try {
    const { data: subs } = await db().from('settings').select('user_id').eq('key', 'push_subs').limit(200);
    const mine = (subs || []).filter(s => bucket(s.user_id) === Math.floor(new Date().getUTCMinutes() / 15) % 3).slice(0, 6);
    for (const s of mine) { if (left() < 20000) break; const n = await runAs(s.user_id, () => maybeNudge()).catch(e => { log.push('nudge error: ' + e.message); return null; }); if (n) log.push('nudge ' + n); }
  } catch (e) { log.push('nudge error: ' + e.message); }

  // 4. Replies in sent threads.
  const { data: live } = await db().from('items').select('*').in('status', ['sent', 'replied', 'interview']).not('thread_id', 'is', null).order('updated_at').limit(10);
  for (const it of live || []) {
    if (left() < 15000) break;
    try {
      const res = await as(it, () => checkThread(it));
      if (res && res.r.category !== 'out_of_office') await ping(it, `Reply: ${name(it)}`, `${res.r.summary || res.r.category} - response drafted`, `/item/${it.id}`);
      if (res) log.push('reply ' + it.id);
      else await as(it, () => updateItem(it.id, {})); // touch, so the next run looks at someone else first
    } catch (e) { log.push('thread error ' + it.id + ': ' + e.message); }
  }

  // 5. Follow-ups that are due: draft and ask for approval.
  const { data: due } = await db().from('items').select('*').eq('status', 'sent').is('follow', null).not('thread_id', 'is', null).lte('next_follow_at', new Date().toISOString()).limit(3);
  for (const it of due || []) {
    if (left() < 12000) break;
    try {
      await as(it, () => draftFollow(it.id));
      await ping(it, `Follow-up ready: ${name(it)}`, 'Tap to review and send', `/item/${it.id}`);
      log.push('follow ' + it.id);
    } catch (e) { log.push('follow error ' + it.id + ': ' + e.message); }
  }
  return json({ ok: true, log });
}
