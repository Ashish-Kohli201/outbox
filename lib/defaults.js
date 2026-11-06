// Product defaults. Nothing here is personal: each user's name, CV and voice live in their profile.
export const FOLLOW_DAYS = [4, 7];

export const TONES = {
  warm: {
    label: 'Warm and respectful',
    text: `- Warm and respectful first, direct second. Opens with "Dear <Name>," and a light greeting. Genuine, never gushing.
- Empathy shows as attention: notices what the person or company is doing and says so in one honest line. Never flattery.
- Confident and compact: one line on who they are, one or two proof points, then the ask.
- Bolds the few phrases that matter (their college, the role, the ask). Never more than 4-5 bold phrases.
- The ask is small and easy: a short call.
- Never explains every role they have held. Picks the outcome that matters to THIS reader.`
  },
  direct: {
    label: 'Direct and confident',
    text: `- Direct and brisk. Opens with "Hi <Name>," then straight to the point.
- Confident without arrogance: states one concrete result up front.
- Very short paragraphs, no filler, no pleasantries beyond a greeting.
- The ask is specific: a 15-minute call this week.
- Never lists the whole CV. One or two proof points maximum.`
  },
  formal: {
    label: 'Formal and traditional',
    text: `- Formal, polite and structured. Opens with "Dear <Name>," and a courteous line.
- Measured confidence: states background clearly, proof points in complete sentences.
- Respectful ask: requests a brief conversation at their convenience.
- Never casual slang or exclamation marks. Never over-long.`
  },
  playful: {
    label: 'Friendly with a light touch',
    text: `- Friendly and human. Opens with "Hi <Name>," and one genuinely curious observation about them.
- One light touch of humour at most, never at the reader's expense.
- Compact: one proof point told as a mini-story, then a low-pressure ask.
- Reads like a smart person writing quickly, not a template.`
  }
};

export const personalityFor = p => (p?.personality && p.personality.trim()) || (TONES[p?.tone] || TONES.warm).text;

export function defaultSignature(p) {
  const lines = ['Best regards,', p?.name || ''];
  if (p?.phone) lines.push(p.phone);
  for (const l of p?.links || []) if (l?.url) lines.push(`[${l.label || 'Link'}](${l.url})`);
  return lines.filter(Boolean).join('\n');
}

/** The shape of a cold email, adapted per recipient. Users can paste their own favourite to replace it. */
export function skeletonFor(p) {
  if (p?.sample_email?.trim()) return p.sample_email.trim();
  return `Dear <Name>,

<one specific line about them / their company / their post>

I'm ${p?.name || '<me>'}, ${p?.headline || '<who I am in one line>'}, reaching out about <role / opportunity> at <Company>. <1-2 proof points that fit THEM: employer + one outcome, one line each>.

I'd love to connect over a **short call** to see whether my background could be useful to <their team or work>. Please find my CV attached.`;
}

export const DEFAULT_KEYWORDS = ['internship hiring', 'we are hiring intern', 'founder office hiring', 'analyst intern', 'graduate hiring'];
