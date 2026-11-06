import { getSetting, setSetting, getProfile, countItems } from './db';
import { prefs } from './prefs';
import { notify } from './push';
import { localParts } from './tz.js';

const LINES = [
  ['☕ Coffee + one lead?', 'Spend 5 minutes on fresh posts - share anything good into Outbox.'],
  ['🎯 Hunting window open', 'Somebody posted a role in the last few hours. Go find it.'],
  ['📮 Your outbox misses you', 'Drop one company you admire. The app does the rest.'],
  ['🔥 Keep the streak alive', 'One dump today keeps it going.'],
  ['🧭 Scout mode', 'Think of a startup that hired someone like you - dump it as a cold lead.'],
  ['⚡ 5-minute sprint', 'Scroll, spot, share. That’s it.'],
  ['🌙 Last call for today', 'One more lead before you log off?']
];

export async function maybeNudge() {
  const p = await prefs();
  if (!p.nudges) return null;
  const { timezone } = await getProfile();
  const { date: today, mins, day } = localParts(timezone);
  const state = (await getSetting('nudge_state')) || {};
  const done = state.date === today ? state.done || [] : [];
  const slot = (p.nudgeTimes || []).find(t => {
    const [h, m] = t.split(':').map(Number), at = h * 60 + m;
    return mins >= at && mins < at + 45 && !done.includes(t);
  });
  if (!slot) return null;

  const count = await countItems(['review', 'error']);
  const kw = p.keywords[(done.length + day) % p.keywords.length] || 'hiring';
  const [title, body] = LINES[(day * 4 + done.length) % LINES.length];
  const search = `https://www.linkedin.com/search/results/content/?keywords=${encodeURIComponent(kw)}&datePosted=%22past-24h%22&sortBy=%22date_posted%22`;
  await notify(title, `${body}${count ? ` (${count} draft${count === 1 ? '' : 's'} waiting too.)` : ''} Tap to search “${kw}”.`, search);
  await setSetting('nudge_state', { date: today, done: [...done, slot] });
  return slot;
}
