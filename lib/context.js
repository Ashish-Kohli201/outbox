import { getProfile, recentStyle, notes, getSetting, swipes } from './db';
import { personalityFor, skeletonFor } from './defaults';

const cut = (s, n) => (String(s || '').length > n ? String(s).slice(0, n) + '…' : String(s || ''));

/** Everything the AI knows about the user: CV + personality + learned voice + swipe taste + how they edit drafts. */
export async function contextBlock() {
  const [P, st, n, voice, sw] = await Promise.all([
    getProfile(), recentStyle().catch(() => []), notes(6).catch(() => []), getSetting('voice_profile').catch(() => null), swipes(40).catch(() => [])
  ]);
  if (!P.cv_text) throw new Error('Finish setup first: import your CV so the app knows who you are.');
  let t = `ABOUT ${P.name || 'THE SENDER'} (the only facts you may use)\nName: ${P.name || ''} | ${P.email || ''} | ${P.phone || ''}${P.headline ? `\nWho they are: ${P.headline}` : ''}${P.target ? `\nWhat they are looking for: ${P.target}` : ''}\n\nCV:\n${P.cv_text}`;

  t += `\n\nTHEIR PERSONALITY (always apply):\n${personalityFor(P)}`;
  t += `\n\nTHE SHAPE OF THEIR COLD EMAIL (adapt it to this person, change the words, keep the shape and warmth):\n${skeletonFor(P)}`;

  if (voice?.text) t += `\n\nTHEIR VOICE PROFILE, learned from their real emails (write exactly like this):\n${voice.text}`;

  const loved = sw.filter(x => x.v === 'super').concat(sw.filter(x => x.v === 'like')).slice(0, 3);
  if (loved.length) t += '\n\nEMAILS THEY SWIPED RIGHT ON (their taste - write in this spirit, never copy sentences):\n' + loved.map(x => `[${x.v === 'super' ? 'SUPERLIKE' : 'like'}${x.comment ? ' - ' + x.comment : ''}]\n${cut(x.body, 600)}`).join('\n---\n');
  const noped = sw.filter(x => x.v === 'dislike' && x.comment).slice(0, 8);
  if (noped.length) t += '\n\nWHAT THEY DISLIKED IN EMAILS (never do this):\n' + noped.map(x => `- ${x.comment}`).join('\n');
  const likedWhy = sw.filter(x => x.v !== 'dislike' && x.comment).slice(0, 6);
  if (likedWhy.length) t += '\n\nWHAT THEY SAID THEY LIKE:\n' + likedWhy.map(x => `- ${x.comment}`).join('\n');

  const samples = n.filter(x => x.kind === 'sample').slice(0, 3);
  if (samples.length) t += '\n\nTHINGS THEY WROTE THEMSELVES (match the voice, never copy sentences):\n' + samples.map(x => cut(x.body, 700)).join('\n---\n');

  const edits = st.filter(s => s.ai_draft && s.final && s.ai_draft.trim() !== s.final.trim()).slice(0, 3);
  if (edits.length) t += '\n\nHOW THEY EDIT YOUR DRAFTS (pre-empt these changes):\n' + edits.map(s => `DRAFT:\n${cut(s.ai_draft, 600)}\nTHEY SENT:\n${cut(s.final, 600)}`).join('\n---\n');
  return t;
}

export const RULES = `WRITING RULES (non-negotiable):
- Sound like the sender writing one email by hand, in their voice and personality above. Never a template. Plain text.
- SHORT. Cold email body 60-110 words. Short paragraphs. Crisp and sweet.
- Open with ONE line specific to THIS person or company. If the lead shows a funding round, launch, new office, hire, award or other milestone, make that line a genuine one-sentence congratulation naming exactly that event. Only if it is in the lead - never invent an event. Otherwise one honest observation about their work. Never "I hope this finds you well", "I am writing to", "My name is", or flattery.
- Proof points: at most TWO, one sentence each, picked for THIS lead - employer plus one concrete outcome. Never walk through every role or list the CV.
- One small ask, usually a short call.
- Wrap 3-5 key phrases in **double asterisks** for bold (the company-relevant keyword, their college, the ask). No other markdown.
- Do NOT write a sign-off or signature (no "Best regards", no name, no phone) - the app appends the sender's signature.
- No buzzwords (passionate, synergy, leverage, dynamic, esteemed, eager).
- Use plain hyphens, never em dashes.
- Never invent facts about the sender or the company. If a needed fact is missing, write [confirm: what's needed] inline.`;
