// The user's own AI keys. Gemini's free tier is enough; keys are checked, then stored encrypted.
import { getSetting, setSetting } from '@/lib/db';
import { encrypt } from '@/lib/crypto';
import { testGemini } from '@/lib/llm';
import { forget } from '@/lib/ctx';
import { json, wrap } from '@/lib/http';
export const dynamic = 'force-dynamic';

// { gemini?: string, ollama?: string, model?: string, remove?: 'gemini' | 'ollama' }
export const POST = wrap(async req => {
  const b = await req.json();
  const cur = (await getSetting('ai')) || {};
  const next = { ...cur };
  if (b.remove === 'gemini' || b.remove === 'ollama') delete next[b.remove];
  if (b.model) next.model = String(b.model).slice(0, 60);
  if (b.gemini) {
    const key = String(b.gemini).trim();
    if (!/^[\w-]{20,}$/.test(key)) return json({ error: 'That does not look like a Gemini key.' }, 400);
    await testGemini(key, next.model || 'gemini-2.5-flash').catch(e => { throw new Error('Gemini rejected that key: ' + e.message); });
    next.gemini = await encrypt(key);
  }
  if (b.ollama) next.ollama = await encrypt(String(b.ollama).trim());
  await setSetting('ai', next);
  forget('ai');
  return json({ ai: { gemini: !!next.gemini, ollama: !!next.ollama, model: next.model || '' } });
});
