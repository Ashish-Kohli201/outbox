import { swipes, listItems, getSetting, setSetting, getProfile } from './db';
import { llmJSON, aiConfig } from './llm';
import { RULES } from './context';
import { personalityFor, skeletonFor } from './defaults';

// Style levers: each card tests one. Liked and disliked levers steer the next batch.
const LEVERS = [
  'ultra short (about 45 words), almost a text message',
  'warm opener that congratulates a real milestone (funding, launch, hire)',
  'opens with one sharp, specific observation about their product',
  'opens with a short genuine question',
  'leads with the strongest proof point, then the ask',
  'story-led: one line about how the sender came across them',
  'formal and respectful, traditional business tone',
  'confident and direct, ask-first, no pleasantries',
  'humble and curious, asks for advice rather than a role',
  'playful but professional, one light touch of humour'
];
const FALLBACK = [
  'an analyst internship at a seed-stage fund', 'an operations internship at a Series A fintech', 'a strategy internship at a D2C brand that just raised',
  'a product role at a climate-tech startup', 'a consulting internship at a boutique advisory firm', 'a chief-of-staff style role at a fast-growing health startup'
];

const score = b => (b ? b.like + 2 * b.super - b.dislike * 1.5 : 0);

export async function swipeStats() {
  const list = await swipes(80);
  const by = {};
  list.forEach(x => { const k = x.lever || '?'; by[k] = by[k] || { like: 0, dislike: 0, super: 0 }; by[k][x.v]++; });
  return { list, by };
}

// Small prompt on purpose: style tests don't need the whole CV, and a lean prompt answers in seconds.
async function leanContext() {
  const [P, voice] = await Promise.all([getProfile(), getSetting('voice_profile').catch(() => null)]);
  return `SENDER: ${P.name || 'the sender'}${P.headline ? ', ' + P.headline : ''}.${P.target ? ` Looking for: ${P.target}.` : ''}
Background (facts you may use):\n${String(P.cv_text || '').slice(0, 1800)}
PERSONALITY:\n${personalityFor(P)}\n\nSHAPE OF THEIR COLD EMAIL (adapt):\n${skeletonFor(P)}${voice?.text ? `\n\nVOICE PROFILE:\n${voice.text}` : ''}`;
}

/** 5 fresh candidate emails in the user's voice, varied on purpose, steered by what they already liked or disliked. */
export async function generateCards(n = 5) {
  const [{ list, by }, items, ctx] = await Promise.all([swipeStats(), listItems().catch(() => []), leanContext()]);
  const real = items.filter(i => !i.parent_id && i.info?.company).slice(0, 4).map(i => `${i.info.role || 'an internship'} at ${i.info.company}`);
  const scenarios = [...real, ...FALLBACK].slice(0, 7);
  const levers = [...LEVERS].sort((a, b) => score(by[b]) - score(by[a]) + (Math.random() - 0.5) * 3).slice(0, n);
  const liked = list.filter(x => x.v !== 'dislike').slice(0, 4).map(x => `- ${x.lever}${x.comment ? ': ' + x.comment : ''}`).join('\n');
  const disliked = list.filter(x => x.v === 'dislike').slice(0, 6).map(x => `- ${x.lever}${x.comment ? ': ' + x.comment : ''}`).join('\n');
  const r = await llmJSON({ maxTokens: 2800, fast: true, timeout: 25000, tries: 2, prompt: `You write cold emails as the sender below. Produce ${n} DIFFERENT candidate emails they will swipe on (like / dislike / superlike) so we can learn their taste.

${ctx}

${RULES}

SCENARIOS (use a different one per card; invent a plausible specific company name and person if none is real - these are style tests, never sent):
${scenarios.map((s, i) => `${i + 1}. ${s}`).join('\n')}

STYLE LEVER PER CARD (one each, in order):
${levers.map((l, i) => `${i + 1}. ${l}`).join('\n')}
${liked ? `\nTHEY HAVE LIKED:\n${liked}\n` : ''}${disliked ? `\nTHEY HAVE DISLIKED (avoid these mistakes):\n${disliked}\n` : ''}
Each card must read like a real hand-written email from them, complete, 45-110 words, no signature. Return JSON: {"cards":[{"scenario":"short label","lever":"exact lever text","subject":"","body":""}]}` });
  return (r.cards || []).filter(c => c.body && c.subject).map((c, i) => ({ id: Date.now() + '-' + i, scenario: c.scenario || '', lever: c.lever || levers[i] || '', subject: c.subject, body: c.body }));
}

/* ---- Pre-generated pool ----
 * Unswiped cards wait here. Reading never removes anything (so leaving and coming back loses nothing);
 * a card leaves the pool only when it is swiped. Refilled by cron, by inbox activity and by the deck itself. */
export const POOL_TARGET = 15;
export async function peekCards(n = 15) {
  const pool = (await getSetting('swipe_pool')) || [];
  return { cards: pool.slice(0, n), size: pool.length };
}
export async function dropCard(id) {
  const pool = (await getSetting('swipe_pool')) || [];
  const next = pool.filter(c => c.id !== id);
  if (next.length !== pool.length) await setSetting('swipe_pool', next);
}
export async function refillPool(target = POOL_TARGET, rounds = 1) {
  const ai = await aiConfig();
  if (!ai.gemini && !ai.ollama) return 0; // no key yet
  let added = 0;
  for (let i = 0; i < rounds; i++) {
    const pool = (await getSetting('swipe_pool')) || [];
    if (pool.length >= target) break;
    const lock = (await getSetting('swipe_lock')) || 0;
    if (Date.now() - lock < 70000) break; // another refill is already running
    await setSetting('swipe_lock', Date.now());
    try {
      const cards = await generateCards(5);
      const fresh = (await getSetting('swipe_pool')) || [];
      await setSetting('swipe_pool', [...fresh, ...cards].slice(0, 30));
      added += cards.length;
    } finally { await setSetting('swipe_lock', 0); }
  }
  return added;
}
