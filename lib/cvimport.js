// Turns a CV (PDF, image or pasted text) into the structured profile the app works from.
import { llmJSON } from './llm';

const SCHEMA = `{
 "name": "full name",
 "headline": "one line describing who they are right now, e.g. 'final-year B.Com student at XYZ College' - from the CV only",
 "email": "", "phone": "",
 "links": [{"label": "LinkedIn", "url": "https://..."}],
 "cv_text": "the whole CV as clean plain text, section by section, nothing added",
 "cv_data": {
  "name": "FULL NAME IN CAPITALS",
  "spikes": ["3-5 very short header highlights taken from the CV, e.g. 'PPO @ Company', 'Top 1% of 5,000 applicants'"],
  "contact": [{"text": "+91 98765 43210", "href": "tel:+919876543210"}, {"text": "me@example.com", "href": "mailto:me@example.com"}, {"text": "LinkedIn", "href": "https://..."}, {"text": "City, Country"}],
  "sections": [{"title": "EDUCATION", "entries": [{"org": "", "role": "", "date": "", "sub": "optional one-line context", "bullets": ["one line each, **bold** the single most important phrase"]}]}]
 }
}`;

export async function importCv({ text = '', file = null }) {
  const r = await llmJSON({
    maxTokens: 9000, files: file ? [file] : [],
    prompt: `Read this CV and return it as structured JSON. Copy facts exactly; never invent, round or embellish anything.

${text ? 'CV TEXT:\n' + text.slice(0, 30000) : '(the CV is attached)'}

Return JSON in exactly this shape:
${SCHEMA}

Rules:
- Keep sections in their original order and use their original names in CAPITALS (EDUCATION, WORK EXPERIENCE, PROJECTS...).
- Every bullet is ONE line, at most 140 characters. If a bullet is longer, shorten it but keep every number and name.
- Use **double asterisks** around the single most important phrase of a bullet (at most one per bullet).
- An entry that is just a line of text (like "Additional offers: ...") becomes {"line": "text"}.
- Omit empty fields. Never use em dashes: use plain hyphens.`
  });
  if (!r?.cv_data?.sections?.length) throw new Error('Could not read that CV - try a text-based PDF, or paste the text instead.');
  return {
    name: String(r.name || '').slice(0, 120), headline: String(r.headline || '').slice(0, 200), email: r.email || '', phone: r.phone || '',
    links: (r.links || []).filter(l => l?.url).slice(0, 5).map(l => ({ label: String(l.label || 'Link').slice(0, 30), url: l.url })),
    cv_text: String(r.cv_text || '').slice(0, 30000), cv_data: r.cv_data
  };
}
