import { notes, recentStyle, setSetting, swipes, getProfile } from './db';
import { llm } from './llm';
import { personalityFor } from './defaults';

/** Distils everything the user wrote and swiped on into a reusable voice guide. */
export async function rebuildVoice() {
  const [n, st, sw, P] = await Promise.all([notes(), recentStyle(), swipes(60), getProfile()]);
  const samples = n.filter(x => x.kind === 'sample').slice(0, 20).map(x => x.body.slice(0, 1200));
  const sent = st.map(s => s.final).filter(Boolean).slice(0, 6);
  if (!samples.length && !sent.length && !sw.length) throw new Error('Nothing to learn from yet - tap "Learn from Gmail", upload something you wrote, or swipe a few emails.');
  const text = await llm({ json: false, maxTokens: 2000, prompt: `Study how ${P.name || 'this person'} writes, then write a precise style guide another writer could follow to sound exactly like them in cold emails, follow-ups and application answers.

THEIR BASE PERSONALITY (already known, keep consistent):
${personalityFor(P)}

EMAILS THEY SWIPED ON (the strongest signal of their taste; SUPERLIKE = loved it):
${sw.slice(0, 24).map(x => `[${x.v.toUpperCase()}${x.comment ? ' - "' + x.comment + '"' : ''}] (${x.lever})\n${x.body.slice(0, 500)}`).join('\n---\n') || '(none yet)'}

THINGS THEY WROTE:
${[...samples, ...sent].map((s, i) => `--- #${i + 1}\n${s}`).join('\n')}

Write short bullet points under: What they like and dislike in an email (from the swipes); Tone and warmth; Sentence and paragraph rhythm; How they open and close; Phrases they actually use (quote them); What they never do; How they talk about their own achievements. Base every point on the evidence above - no generic advice. Max 230 words.` });
  const v = { text: text.trim(), at: Date.now(), basedOn: samples.length + sent.length };
  await setSetting('voice_profile', v);
  return v;
}
