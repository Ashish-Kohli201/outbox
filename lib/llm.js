// Gemini (free tier, reads images and PDFs) first; Ollama Cloud as a text-only backup.
// Keys belong to the user (Settings > AI, stored encrypted). A server-wide key in the environment is only a
// fallback for self-hosters running this just for themselves.
import { getSetting } from './db';
import { decrypt } from './crypto';
import { memo } from './ctx';

const sleep = ms => new Promise(r => setTimeout(r, ms));

export const aiConfig = () => memo('ai', async () => {
  const s = await getSetting('ai').catch(() => null);
  const dec = async v => { try { return v ? await decrypt(v) : ''; } catch { return ''; } };
  return {
    gemini: (await dec(s?.gemini)) || process.env.GEMINI_API_KEY || '',
    ollama: (await dec(s?.ollama)) || process.env.OLLAMA_API_KEY || '',
    model: s?.model || process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    ollamaModel: s?.ollamaModel || process.env.OLLAMA_MODEL || 'gpt-oss:120b'
  };
});

async function gemini(cfg, prompt, files, json, maxTokens, { fast = false, timeout = 55000, tries = 3 } = {}) {
  const parts = [{ text: prompt }, ...files.map(f => ({ inline_data: { mime_type: f.mime, data: f.b64 } }))];
  const body = { contents: [{ role: 'user', parts }], generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 } };
  if (json) body.generationConfig.responseMimeType = 'application/json';
  if (fast) body.generationConfig.thinkingConfig = { thinkingBudget: 0 }; // no hidden reasoning time
  for (let attempt = 0; attempt < tries; attempt++) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${cfg.model}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cfg.gemini }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeout)
    });
    if (r.status === 400 && body.generationConfig.thinkingConfig) { delete body.generationConfig.thinkingConfig; continue; }
    if (r.status === 429 || r.status === 503) { await sleep(2500 * (attempt + 1)); continue; }
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`${r.status} ${d.error?.message || ''}`);
    const text = (d.candidates?.[0]?.content?.parts || []).filter(p => p.text && !p.thought).map(p => p.text).join('');
    if (!text) throw new Error('empty reply');
    return text;
  }
  throw new Error('rate limited');
}

async function ollama(cfg, prompt, json, timeout = 55000) {
  const r = await fetch('https://ollama.com/api/chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.ollama}` },
    body: JSON.stringify({ model: cfg.ollamaModel, messages: [{ role: 'user', content: prompt }], stream: false, ...(json ? { format: 'json' } : {}) }),
    signal: AbortSignal.timeout(timeout)
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${r.status} ${d.error || ''}`);
  if (!d.message?.content) throw new Error('empty reply');
  return d.message.content;
}

export async function llm({ prompt, files = [], json = true, maxTokens = 8192, fast = false, timeout = 55000, tries = 3 }) {
  const cfg = await aiConfig();
  const errors = [];
  if (cfg.gemini) { try { return await gemini(cfg, prompt, files, json, maxTokens, { fast, timeout, tries }); } catch (e) { errors.push('Gemini: ' + e.message); } }
  if (cfg.ollama) {
    const p = files.length ? prompt + '\n\n(Note: attachments could not be read by this model; work from the text.)' : prompt;
    try { return await ollama(cfg, p, json, timeout); } catch (e) { errors.push('Ollama: ' + e.message); }
  }
  throw new Error(errors.join(' | ') || 'Add your free Gemini key in Settings > AI (get one at aistudio.google.com/apikey).');
}

export async function llmJSON(opts) {
  const t = await llm({ ...opts, json: true });
  const s = t.indexOf('{'), e = t.lastIndexOf('}');
  if (s < 0 || e < 0) throw new Error('AI returned no JSON');
  return JSON.parse(t.slice(s, e + 1));
}

/** Quick key check used by onboarding and Settings. */
export async function testGemini(key, model = 'gemini-2.5-flash') {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Reply with the single word: ok' }] }], generationConfig: { maxOutputTokens: 16 } }), signal: AbortSignal.timeout(20000)
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error?.message || `Gemini said ${r.status}`);
  return true;
}
