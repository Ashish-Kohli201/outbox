// Looks a company up on the internet by name, for free: Gemini with Google Search grounding first,
// then a keyless web-search reader as backup. The result feeds the email's opening line.
import { aiConfig } from './llm';

const PROMPT = (name, hint) => `Research the company "${name}"${hint ? ` (${hint})` : ''} using Google Search. Someone wants to write a specific, genuine cold email to them.

Return plain bullet points, max 170 words, only facts you actually found (write "unknown" rather than guess):
- What they do, in one line
- Stage and funding (amount, month/year, lead investors)
- Recent news from the last 12 months (month/year)
- Founders / key leaders (names)
- Hiring signals (open roles, expansion, new office)
- One genuine hook worth opening an email with

If you cannot find a company by this exact name, say so in one line.`;

async function grounded(cfg, name, hint) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${cfg.model}:generateContent`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cfg.gemini },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: PROMPT(name, hint) }] }], tools: [{ google_search: {} }], generationConfig: { maxOutputTokens: 1200, temperature: 0.2 } }),
    signal: AbortSignal.timeout(28000)
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${r.status} ${d.error?.message || ''}`);
  const c = d.candidates?.[0];
  const text = (c?.content?.parts || []).filter(p => p.text && !p.thought).map(p => p.text).join('').trim();
  if (!text) throw new Error('empty');
  const sources = (c?.groundingMetadata?.groundingChunks || []).map(x => x.web).filter(Boolean).slice(0, 4).map(w => ({ title: w.title || w.uri, url: w.uri }));
  return { text, sources };
}

async function viaSearchReader(name, hint) {
  const q = encodeURIComponent(`${name} ${hint || ''} company funding news`);
  const r = await fetch('https://r.jina.ai/https://html.duckduckgo.com/html/?q=' + q, { headers: { Accept: 'text/plain' }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error('search ' + r.status);
  const t = (await r.text()).replace(/\n{2,}/g, '\n').slice(0, 3500);
  if (t.length < 200) throw new Error('thin');
  return { text: 'Raw web search results (verify before using):\n' + t, sources: [] };
}

export async function researchCompany(name, hint = '') {
  name = String(name || '').trim();
  if (!name) return null;
  const cfg = await aiConfig();
  let out = null;
  if (cfg.gemini) { try { out = await grounded(cfg, name, hint); } catch (e) { /* fall through */ } }
  if (!out) { try { out = await viaSearchReader(name, hint); } catch (e) { return null; } }
  return { company: name, text: out.text.slice(0, 2200), sources: out.sources, at: Date.now() };
}
